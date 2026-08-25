'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import type { DragEvent } from 'react';
import Link from 'next/link';
import {
  PhoneCall, Filter, Search, RefreshCw, Loader2, Sparkles, X, Star,
  Columns3, List as ListIcon, Play, User, Clock, MapPin, ChevronDown, GripVertical,
} from 'lucide-react';
import { cn, getScoreColor } from '@/lib/utils';
import {
  CALL_STAGES, ACTIVE_STAGES, PARKED_STAGES, STAGE_BY_ID, OUTCOME_BY_ID,
  callWindow, WINDOW_CONFIG, localTimeLabel, tzShort, callAge,
  OWNER_CONFIDENCE_CONFIG, OWNER_SOURCE_CONFIG,
  type CallStage, type CallOutcome, type OwnerSource,
} from '@/lib/calling';
import type { CallLead, CallStats, CallFilterOptions } from '@/lib/types-calling';
import CallConsole from '@/components/CallConsole';

// ═══════════════════════════════════════════════════════════════
// COLD CALL PIPELINE
// Dialling happens in GoHighLevel; this is the board that remembers
// who has been spoken to, what they said, and who is due next.
// ═══════════════════════════════════════════════════════════════

type ViewMode = 'board' | 'list';
type OwnerFilter = 'any' | 'yes' | 'verified' | 'no';
type AttemptFilter = 'any' | 'fresh' | 'some' | 'many';

interface Filters {
  search: string;
  country_code: string;
  city: string;
  niche: string;
  priority: string;
  assigned_to: string;
  ghl_account: string;
  owner: OwnerFilter;
  attempts: AttemptFilter;
  minScore: number;
  callableNow: boolean;
  dueOnly: boolean;
  neverDm: boolean;
}

const EMPTY_FILTERS: Filters = {
  search: '', country_code: '', city: '', niche: '', priority: '', assigned_to: '', ghl_account: '',
  owner: 'any', attempts: 'any', minScore: 0,
  callableNow: false, dueOnly: false, neverDm: false,
};

export default function CallPipelinePage() {
  const [leads, setLeads] = useState<CallLead[]>([]);
  const [stats, setStats] = useState<CallStats | null>(null);
  const [options, setOptions] = useState<CallFilterOptions | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<ViewMode>('board');
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const [showParked, setShowParked] = useState(false);
  const [dragging, setDragging] = useState<string | null>(null);
  const [consoleAt, setConsoleAt] = useState<number | null>(null);
  const [enriching, setEnriching] = useState(false);
  const [enrichMsg, setEnrichMsg] = useState<string | null>(null);
  const [clock, setClock] = useState(0);

  // Local-time columns go stale otherwise.
  useEffect(() => {
    const t = setInterval(() => setClock(n => n + 1), 60_000);
    return () => clearInterval(t);
  }, []);

  // ─── Data ──────────────────────────────────────────────────
  // Server handles everything except the timezone-dependent filters,
  // which depend on the viewer's clock and so run client-side.

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const payload = {
        action: 'get_pipeline',
        country_code: filters.country_code || undefined,
        city: filters.city || undefined,
        niche: filters.niche || undefined,
        priority: filters.priority || undefined,
        assigned_to: filters.assigned_to || undefined,
        ghl_account: filters.ghl_account || undefined,
        owner_known: filters.owner === 'any' ? undefined : filters.owner,
        search: filters.search || undefined,
        min_score: filters.minScore || undefined,
        due_only: filters.dueOnly || undefined,
        never_dm: filters.neverDm || undefined,
        limit: 1000,
      };
      const [pRes, sRes] = await Promise.all([
        fetch('/api/call-pipeline', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }),
        fetch('/api/call-pipeline', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'get_stats', country_code: filters.country_code || undefined }) }),
      ]);
      const pData = await pRes.json();
      const sData = await sRes.json();
      setLeads(pData.leads || []);
      setStats(sData.stats || null);
    } finally {
      setLoading(false);
    }
  }, [filters.country_code, filters.city, filters.niche, filters.priority,
      filters.assigned_to, filters.ghl_account, filters.owner, filters.search,
      filters.minScore, filters.dueOnly, filters.neverDm]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    fetch('/api/call-pipeline', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'get_filters' }),
    }).then(r => r.json()).then(d => setOptions(d.filters || null));
  }, []);

  // ─── Client-side filters ───────────────────────────────────

  const visible = useMemo(() => {
    void clock; // recompute on the minute so "callable now" stays true
    return leads.filter(l => {
      if (filters.callableNow && !WINDOW_CONFIG[callWindow(l.timezone)].callable) return false;
      const a = l.call_attempts || 0;
      if (filters.attempts === 'fresh' && a !== 0) return false;
      if (filters.attempts === 'some' && (a < 1 || a > 2)) return false;
      if (filters.attempts === 'many' && a < 3) return false;
      return true;
    });
  }, [leads, filters.callableNow, filters.attempts, clock]);

  const byStage = useMemo(() => {
    const m: Record<string, CallLead[]> = {};
    for (const s of CALL_STAGES) m[s.id] = [];
    for (const l of visible) (m[l.call_stage || 'not_called'] ||= []).push(l);
    return m;
  }, [visible]);

  /** Queue the console works through: sorted, ready-to-ring first. */
  const callQueue = useMemo(() => {
    return [...visible]
      .filter(l => l.phone && !['closed', 'dnc', 'not_interested'].includes(l.call_stage || ''))
      .sort((a, b) => {
        const aOk = WINDOW_CONFIG[callWindow(a.timezone)].callable ? 0 : 1;
        const bOk = WINDOW_CONFIG[callWindow(b.timezone)].callable ? 0 : 1;
        if (aOk !== bOk) return aOk - bOk;
        // Anyone with a promised callback time comes before general prospecting.
        const aCb = a.callback_at ? new Date(a.callback_at).getTime() : Infinity;
        const bCb = b.callback_at ? new Date(b.callback_at).getTime() : Infinity;
        if (aCb !== bCb) return aCb - bCb;
        return (b.lead_score || 0) - (a.lead_score || 0);
      });
  }, [visible, clock]);

  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (filters.country_code) n++;
    if (filters.city) n++;
    if (filters.niche) n++;
    if (filters.priority) n++;
    if (filters.assigned_to) n++;
    if (filters.ghl_account) n++;
    if (filters.owner !== 'any') n++;
    if (filters.attempts !== 'any') n++;
    if (filters.minScore > 0) n++;
    if (filters.callableNow) n++;
    if (filters.dueOnly) n++;
    if (filters.neverDm) n++;
    return n;
  }, [filters]);

  const cityOptions = useMemo(() => {
    if (!options) return [];
    return filters.country_code
      ? (options.cities_by_country[filters.country_code] || [])
      : options.cities;
  }, [options, filters.country_code]);

  const set = <K extends keyof Filters>(k: K, v: Filters[K]) =>
    setFilters(f => ({ ...f, [k]: v, ...(k === 'country_code' ? { city: '' } : {}) }));

  // ─── Actions ───────────────────────────────────────────────

  const moveStage = async (leadId: string, stage: CallStage) => {
    setLeads(prev => prev.map(l => l.id === leadId ? { ...l, call_stage: stage } : l));
    await fetch('/api/call-pipeline', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'move_stage', lead_id: leadId, stage }),
    });
  };

  const onDrop = (e: DragEvent, stage: CallStage) => {
    e.preventDefault();
    if (dragging) { moveStage(dragging, stage); setDragging(null); }
  };

  /** Enrich owner names for what's on screen, worst-covered first. */
  const enrichOwners = async () => {
    const targets = visible.filter(l => !l.owner_name).slice(0, 100);
    if (targets.length === 0) { setEnrichMsg('Every lead in this view already has an owner name.'); return; }
    if (!confirm(`Look up owner names for ${targets.length} leads?\n\nThis reads each clinic's own website and the UK company register. It takes a couple of minutes and uses AI credits.`)) return;

    setEnriching(true); setEnrichMsg(null);
    try {
      const res = await fetch('/api/enrich-owner', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lead_ids: targets.map(l => l.id), limit: targets.length }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Enrichment failed');
      const bySource = Object.entries(data.by_source || {}).map(([k, v]) => `${v} from ${OWNER_SOURCE_CONFIG[k as OwnerSource]?.short || k}`).join(', ');
      setEnrichMsg(`Found ${data.enriched} of ${data.processed}${bySource ? ` — ${bySource}` : ''}.`);
      await load();
    } catch (err) {
      setEnrichMsg(err instanceof Error ? err.message : 'Enrichment failed');
    } finally {
      setEnriching(false);
    }
  };

  const onLogged = (leadId: string, outcome: CallOutcome) => {
    setLeads(prev => prev.map(l => l.id === leadId
      ? { ...l, call_stage: outcomeStage(outcome), call_attempts: (l.call_attempts || 0) + 1, last_call_at: new Date().toISOString() }
      : l));
  };

  // ─── Render ────────────────────────────────────────────────

  return (
    <div className="max-w-full space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl md:text-2xl font-mono font-bold text-prospex-text flex items-center gap-3">
            <PhoneCall className="w-5 h-5 md:w-6 md:h-6 text-prospex-cyan" />Cold Call Pipeline
          </h1>
          <p className="text-sm text-prospex-dim mt-1">
            Dial in GoHighLevel — track who you spoke to, what they said, and who&apos;s due next.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => setConsoleAt(0)} disabled={callQueue.length === 0}
            className="btn-primary text-sm disabled:opacity-40">
            <Play className="w-4 h-4" />Start calling ({callQueue.length})
          </button>
          <button onClick={enrichOwners} disabled={enriching} className="btn-ghost text-sm border border-prospex-border">
            {enriching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {enriching ? 'Finding owners…' : 'Find owner names'}
          </button>
          <button onClick={load} className="btn-ghost text-sm border border-prospex-border" aria-label="Refresh">
            <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
          </button>
        </div>
      </div>

      {enrichMsg && (
        <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-prospex-cyan/10 border border-prospex-cyan/30">
          <p className="text-xs text-prospex-cyan font-mono">{enrichMsg}</p>
          <button onClick={() => setEnrichMsg(null)} aria-label="Dismiss"><X className="w-3.5 h-3.5 text-prospex-dim" /></button>
        </div>
      )}

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
          <Stat label="In view" value={visible.length} />
          <Stat label="Calls today" value={stats.calls_today} />
          <Stat label="Contact rate" value={`${stats.contact_rate}%`} hint="Someone picked up, last 30 days" />
          <Stat label="Owner reached" value={`${stats.owner_reach_rate}%`} hint="Got the decision-maker, last 30 days" />
          <Stat label="Booked 30d" value={stats.booked_30d} tone="green" />
          <Stat label="Never dialled" value={stats.by_stage.not_called || 0} />
        </div>
      )}

      {/* Filter bar */}
      <div className="card p-3 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 text-prospex-dim absolute left-3 top-1/2 -translate-y-1/2" />
            <input value={filters.search} onChange={e => set('search', e.target.value)}
              placeholder="Business, owner, city or number…" className="input pl-9" />
          </div>

          <button onClick={() => setShowFilters(v => !v)}
            className={cn('btn-ghost text-sm border', activeFilterCount > 0 ? 'border-prospex-cyan/40 text-prospex-cyan' : 'border-prospex-border')}>
            <Filter className="w-4 h-4" />Filters
            {activeFilterCount > 0 && <span className="badge bg-prospex-cyan/20 text-prospex-cyan border-prospex-cyan/40 text-[10px]">{activeFilterCount}</span>}
            <ChevronDown className={cn('w-3.5 h-3.5 transition-transform', showFilters && 'rotate-180')} />
          </button>

          <div className="flex rounded-lg border border-prospex-border overflow-hidden">
            {(['board', 'list'] as ViewMode[]).map(v => (
              <button key={v} onClick={() => setView(v)}
                className={cn('px-3 py-2 text-xs font-mono inline-flex items-center gap-1.5',
                  view === v ? 'bg-prospex-cyan/15 text-prospex-cyan' : 'text-prospex-dim hover:text-prospex-text')}>
                {v === 'board' ? <Columns3 className="w-3.5 h-3.5" /> : <ListIcon className="w-3.5 h-3.5" />}{v}
              </button>
            ))}
          </div>
        </div>

        {/* Quick toggles — the ones worth reaching for every session */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <Toggle active={filters.callableNow} onClick={() => set('callableNow', !filters.callableNow)}
            title="Only clinics whose local time is inside working hours right now">🕐 Callable now</Toggle>
          <Toggle active={filters.dueOnly} onClick={() => set('dueOnly', !filters.dueOnly)}
            title="Never dialled, or the retry window has elapsed">⏰ Due</Toggle>
          <Toggle active={filters.owner === 'verified'} onClick={() => set('owner', filters.owner === 'verified' ? 'any' : 'verified')}
            title="Owner name confirmed by the company register, their own site, or you">🟢 Verified owner</Toggle>
          <Toggle active={filters.owner === 'no'} onClick={() => set('owner', filters.owner === 'no' ? 'any' : 'no')}
            title="No owner name yet — enrich these before working them">👤 Missing owner</Toggle>
          <Toggle active={filters.attempts === 'fresh'} onClick={() => set('attempts', filters.attempts === 'fresh' ? 'any' : 'fresh')}
            title="Never been dialled">🆕 Untouched</Toggle>
          <Toggle active={filters.neverDm} onClick={() => set('neverDm', !filters.neverDm)}
            title="No Instagram DM has gone out — a genuinely cold intro is safe">❄️ Not DM&apos;d</Toggle>
          <Toggle active={filters.priority === 'hot'} onClick={() => set('priority', filters.priority === 'hot' ? '' : 'hot')}
            title="Hot priority only">🔥 Hot</Toggle>
          {options?.ghl_accounts?.map(a => (
            <Toggle key={a.key} active={filters.ghl_account === a.key}
              onClick={() => set('ghl_account', filters.ghl_account === a.key ? '' : a.key)}
              title={`Only leads ${a.label} can dial (${a.countries.join(', ')})`}>
              {a.emoji} {a.short}
            </Toggle>
          ))}
          {activeFilterCount > 0 && (
            <button onClick={() => setFilters(EMPTY_FILTERS)}
              className="text-[11px] font-mono text-prospex-dim hover:text-prospex-red px-2 py-1">clear all</button>
          )}
        </div>

        {showFilters && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-3 border-t border-prospex-border">
            <Field label="Country">
              <select value={filters.country_code} onChange={e => set('country_code', e.target.value)} className="input">
                <option value="">All countries</option>
                {options?.countries.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}
              </select>
            </Field>
            <Field label={filters.country_code ? 'City' : 'City (pick a country first)'}>
              <select value={filters.city} onChange={e => set('city', e.target.value)} className="input">
                <option value="">All cities</option>
                {cityOptions.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Niche">
              <select value={filters.niche} onChange={e => set('niche', e.target.value)} className="input">
                <option value="">All niches</option>
                {options?.niches.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </Field>
            <Field label="Dial from (GHL account)">
              <select value={filters.ghl_account} onChange={e => set('ghl_account', e.target.value)} className="input">
                <option value="">Either account</option>
                {options?.ghl_accounts?.map(a => (
                  <option key={a.key} value={a.key}>
                    {a.emoji} {a.label}{a.configured ? '' : ' — not configured'}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Assigned to">
              <select value={filters.assigned_to} onChange={e => set('assigned_to', e.target.value)} className="input">
                <option value="">Anyone</option>
                {options?.team.map(t => <option key={t.email} value={t.email}>{t.full_name || t.email}</option>)}
              </select>
            </Field>
            <Field label="Owner name">
              <select value={filters.owner} onChange={e => set('owner', e.target.value as OwnerFilter)} className="input">
                <option value="any">Any</option>
                <option value="verified">Verified only</option>
                <option value="yes">Has a name</option>
                <option value="no">Missing</option>
              </select>
            </Field>
            <Field label="Attempts">
              <select value={filters.attempts} onChange={e => set('attempts', e.target.value as AttemptFilter)} className="input">
                <option value="any">Any</option>
                <option value="fresh">Never dialled</option>
                <option value="some">1–2 attempts</option>
                <option value="many">3+ attempts</option>
              </select>
            </Field>
            <Field label="Priority">
              <select value={filters.priority} onChange={e => set('priority', e.target.value)} className="input">
                <option value="">Any</option>
                <option value="hot">🔥 Hot</option>
                <option value="warm">☀️ Warm</option>
                <option value="cold">❄️ Cold</option>
              </select>
            </Field>
            <Field label={`Min score — ${filters.minScore}`}>
              <input type="range" min={0} max={90} step={10} value={filters.minScore}
                onChange={e => set('minScore', Number(e.target.value))} className="w-full accent-[#00D4FF]" />
            </Field>
          </div>
        )}
      </div>

      {/* Body */}
      {loading ? (
        <div className="flex items-center justify-center min-h-[40vh]">
          <div className="w-8 h-8 border-2 border-prospex-cyan/30 border-t-prospex-cyan rounded-full animate-spin" />
        </div>
      ) : visible.length === 0 ? (
        <div className="card p-10 text-center">
          <PhoneCall className="w-8 h-8 text-prospex-dim mx-auto mb-3" />
          <p className="text-sm text-prospex-muted">No leads match these filters.</p>
          {activeFilterCount > 0 && (
            <button onClick={() => setFilters(EMPTY_FILTERS)} className="btn-ghost text-xs mt-3 border border-prospex-border">Clear filters</button>
          )}
        </div>
      ) : view === 'board' ? (
        <>
          <div className="flex gap-3 overflow-x-auto pb-4">
            {ACTIVE_STAGES.map(stage => (
              <StageColumn key={stage.id} stage={stage.id} leads={byStage[stage.id] || []}
                dragging={dragging} setDragging={setDragging} onDrop={onDrop}
                onOpen={l => setConsoleAt(Math.max(0, callQueue.findIndex(q => q.id === l.id)))} />
            ))}
          </div>

          <button onClick={() => setShowParked(v => !v)}
            className="text-xs font-mono text-prospex-dim hover:text-prospex-text inline-flex items-center gap-1.5">
            <ChevronDown className={cn('w-3.5 h-3.5 transition-transform', showParked && 'rotate-180')} />
            Parked ({PARKED_STAGES.reduce((n, s) => n + (byStage[s.id]?.length || 0), 0)})
          </button>
          {showParked && (
            <div className="flex gap-3 overflow-x-auto pb-4">
              {PARKED_STAGES.map(stage => (
                <StageColumn key={stage.id} stage={stage.id} leads={byStage[stage.id] || []}
                  dragging={dragging} setDragging={setDragging} onDrop={onDrop}
                  onOpen={l => setConsoleAt(Math.max(0, callQueue.findIndex(q => q.id === l.id)))} />
              ))}
            </div>
          )}
        </>
      ) : (
        <CallTable leads={visible} onOpen={l => setConsoleAt(Math.max(0, callQueue.findIndex(q => q.id === l.id)))} />
      )}

      {consoleAt !== null && callQueue.length > 0 && (
        <CallConsole queue={callQueue} startIndex={consoleAt}
          onClose={() => { setConsoleAt(null); load(); }} onLogged={onLogged} />
      )}
    </div>
  );
}

// Mirror of the server's outcome → stage mapping, for the optimistic update
// that keeps the board in sync before the refetch lands.
function outcomeStage(outcome: CallOutcome): CallStage {
  return OUTCOME_BY_ID[outcome]?.stage || 'attempting';
}

// ─── Small pieces ────────────────────────────────────────────

function Stat({ label, value, hint, tone }: { label: string; value: number | string; hint?: string; tone?: 'green' }) {
  return (
    <div className="card p-2.5" title={hint}>
      <p className="text-[9px] font-mono uppercase tracking-wider text-prospex-dim">{label}</p>
      <p className={cn('text-lg font-mono font-bold mt-0.5', tone === 'green' ? 'text-prospex-green' : 'text-prospex-text')}>{value}</p>
    </div>
  );
}

function Toggle({ active, onClick, children, title }: { active: boolean; onClick: () => void; children: React.ReactNode; title?: string }) {
  return (
    <button onClick={onClick} title={title}
      className={cn('text-[11px] font-mono px-2.5 py-1.5 rounded-lg border transition-all',
        active ? 'bg-prospex-cyan/15 text-prospex-cyan border-prospex-cyan/40'
               : 'bg-transparent text-prospex-dim border-prospex-border hover:text-prospex-text hover:border-prospex-dim')}>
      {children}
    </button>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[10px] font-mono uppercase tracking-wider text-prospex-dim block mb-1">{label}</label>
      {children}
    </div>
  );
}

function StageColumn({ stage, leads, dragging, setDragging, onDrop, onOpen }: {
  stage: CallStage; leads: CallLead[]; dragging: string | null;
  setDragging: (id: string | null) => void;
  onDrop: (e: DragEvent, stage: CallStage) => void;
  onOpen: (l: CallLead) => void;
}) {
  const cfg = STAGE_BY_ID[stage];
  return (
    <div className="flex-shrink-0 w-[85vw] max-w-[290px] md:w-[290px] md:max-w-none"
      onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
      onDrop={e => onDrop(e, stage)}>
      <div className={cn('p-2.5 rounded-t-lg border border-b-0', cfg.color)} title={cfg.hint}>
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-mono font-semibold uppercase tracking-wider">{cfg.emoji} {cfg.label}</span>
          <span className="text-xs font-mono opacity-70">{leads.length}</span>
        </div>
      </div>
      <div className="bg-prospex-surface/50 border border-prospex-border rounded-b-lg min-h-[50vh] max-h-[70vh] overflow-y-auto p-2 space-y-2">
        {leads.length === 0 && <p className="text-[10px] text-prospex-dim font-mono text-center py-6">Drop leads here</p>}
        {leads.map(l => <LeadCard key={l.id} lead={l} dragging={dragging} setDragging={setDragging} onOpen={onOpen} />)}
      </div>
    </div>
  );
}

function LeadCard({ lead, dragging, setDragging, onOpen }: {
  lead: CallLead; dragging: string | null;
  setDragging: (id: string | null) => void; onOpen: (l: CallLead) => void;
}) {
  const win = WINDOW_CONFIG[callWindow(lead.timezone)];
  const conf = lead.owner_confidence ? OWNER_CONFIDENCE_CONFIG[lead.owner_confidence] : null;

  return (
    <div draggable onDragStart={() => setDragging(lead.id)} onDragEnd={() => setDragging(null)}
      className={cn('card p-2.5 cursor-grab active:cursor-grabbing', dragging === lead.id && 'opacity-50')}>
      <div className="flex items-start gap-1.5">
        <GripVertical className="w-3 h-3 text-prospex-dim mt-1 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <Link href={`/leads/${lead.id}`} className="text-[13px] font-medium text-prospex-text hover:text-prospex-cyan line-clamp-1">
              {lead.business_name}
            </Link>
            <span className={cn('text-[10px] font-mono shrink-0', win.textClass)} title={`${win.label} · ${tzShort(lead.timezone)}`}>
              {localTimeLabel(lead.timezone) || '—'}
            </span>
          </div>

          {lead.owner_name ? (
            <p className="text-[11px] mt-0.5 inline-flex items-center gap-1">
              <User className="w-2.5 h-2.5 text-prospex-dim" />
              <span className="text-prospex-muted truncate">{lead.owner_name}</span>
              {conf && <span className={conf.textClass}>{conf.emoji}</span>}
            </p>
          ) : (
            <p className="text-[11px] text-prospex-dim mt-0.5 inline-flex items-center gap-1">
              <User className="w-2.5 h-2.5" />no name yet
            </p>
          )}

          <div className="flex items-center gap-2 mt-1.5 text-[10px] font-mono text-prospex-dim flex-wrap">
            {lead.city && <span className="inline-flex items-center gap-0.5"><MapPin className="w-2.5 h-2.5" />{lead.city}</span>}
            {lead.lead_score != null && <span className={cn('font-bold', getScoreColor(lead.lead_score))}>{lead.lead_score}</span>}
            {(lead.call_attempts || 0) > 0 && <span>{lead.call_attempts}×</span>}
            {lead.last_call_at && <span>· {callAge(lead.last_call_at)}</span>}
          </div>

          {lead.callback_at && (
            <p className="text-[10px] font-mono text-amber-300 mt-1 inline-flex items-center gap-1">
              <Clock className="w-2.5 h-2.5" />{new Date(lead.callback_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
            </p>
          )}

          <button onClick={() => onOpen(lead)}
            className="w-full mt-2 text-[10px] font-mono py-1 rounded border border-prospex-border text-prospex-muted hover:text-prospex-cyan hover:border-prospex-cyan/40 inline-flex items-center justify-center gap-1">
            <PhoneCall className="w-2.5 h-2.5" />Open console
          </button>
        </div>
      </div>
    </div>
  );
}

function CallTable({ leads, onOpen }: { leads: CallLead[]; onOpen: (l: CallLead) => void }) {
  return (
    <div className="card overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-prospex-border text-[10px] font-mono uppercase tracking-wider text-prospex-dim">
            <th className="text-left px-3 py-2">Business</th>
            <th className="text-left px-3 py-2">Ask for</th>
            <th className="text-left px-3 py-2">Where</th>
            <th className="text-left px-3 py-2">Their time</th>
            <th className="text-left px-3 py-2">Stage</th>
            <th className="text-right px-3 py-2">Try</th>
            <th className="text-right px-3 py-2">Last</th>
            <th className="text-right px-3 py-2">Score</th>
            <th className="px-3 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {leads.map(l => {
            const win = WINDOW_CONFIG[callWindow(l.timezone)];
            const stage = STAGE_BY_ID[(l.call_stage || 'not_called') as CallStage];
            const conf = l.owner_confidence ? OWNER_CONFIDENCE_CONFIG[l.owner_confidence] : null;
            return (
              <tr key={l.id} className="border-b border-prospex-border/50 hover:bg-prospex-bg/50">
                <td className="px-3 py-2">
                  <Link href={`/leads/${l.id}`} className="text-prospex-text hover:text-prospex-cyan text-[13px]">{l.business_name}</Link>
                  {l.google_rating != null && (
                    <span className="text-[10px] text-prospex-dim ml-2 inline-flex items-center gap-0.5">
                      <Star className="w-2.5 h-2.5 text-amber-400" />{l.google_rating}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-[12px]">
                  {l.owner_name
                    ? <span className="text-prospex-muted">{l.owner_name} {conf && <span className={conf.textClass}>{conf.emoji}</span>}</span>
                    : <span className="text-prospex-dim">—</span>}
                </td>
                <td className="px-3 py-2 text-[12px] text-prospex-muted">{l.city || '—'}<span className="text-prospex-dim"> {l.country_code}</span></td>
                <td className={cn('px-3 py-2 text-[12px] font-mono', win.textClass)} title={win.label}>
                  {win.emoji} {localTimeLabel(l.timezone) || '—'}
                </td>
                <td className={cn('px-3 py-2 text-[11px] font-mono', stage?.textClass)}>{stage?.emoji} {stage?.short}</td>
                <td className="px-3 py-2 text-right text-[12px] font-mono text-prospex-muted">{l.call_attempts || 0}</td>
                <td className="px-3 py-2 text-right text-[11px] font-mono text-prospex-dim">{callAge(l.last_call_at)}</td>
                <td className={cn('px-3 py-2 text-right text-[12px] font-mono font-bold', l.lead_score != null ? getScoreColor(l.lead_score) : 'text-prospex-dim')}>
                  {l.lead_score ?? '—'}
                </td>
                <td className="px-3 py-2 text-right">
                  <button onClick={() => onOpen(l)} className="text-[10px] font-mono px-2 py-1 rounded border border-prospex-border text-prospex-muted hover:text-prospex-cyan hover:border-prospex-cyan/40">
                    Call
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
