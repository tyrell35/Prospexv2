'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import {
  Target, Loader2, RefreshCw, Play, Filter, Upload, Flame, Sun, Snowflake, Ban,
  ExternalLink, Zap, Radio, MessageSquare, Building2, Sparkles, AlertTriangle,
  Radar, Check, X, ChevronDown, ChevronRight, ArrowRight, Search as SearchIcon,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';

// ─── Types ──────────────────────────────────────────────

type Band = 'hot' | 'warm' | 'cold' | 'disqualified';

interface HuntRow {
  lead_id: string;
  total_score: number;
  band: Band;
  device_score: number;
  ad_score: number;
  booking_score: number;
  establishment_index: number | null;
  scored_at: string;
  lead: {
    id: string;
    business_name: string;
    city: string | null;
    country: string | null;
    website: string | null;
    seed_source: string | null;
    competitor_watch: boolean;
    ghl_contact_id: string | null;
    email: string | null;
    phone: string | null;
    instagram_url: string | null;
  } | null;
  enrichment: {
    devices_found: string[] | null;
    booking_system: string | null;
    has_other_agency: boolean | null;
    email_found: string | null;
    phone_found: string | null;
    instagram_handle: string | null;
    generic_kit_only: boolean | null;
  } | null;
  intel: {
    ads_active: boolean | null;
    ad_count: number | null;
    ad_days_running: number | null;
    library_url: string | null;
  } | null;
  latest_opener: {
    opener: string;
    angle: string | null;
  } | null;
}

// ─── Helpers ────────────────────────────────────────────

const bandMeta: Record<Band, { label: string; icon: typeof Flame; badge: string; border: string; iconColor: string }> = {
  hot:          { label: 'Hot',          icon: Flame,     badge: 'bg-prospex-red/20 text-prospex-red border-prospex-red/40', border: 'border-prospex-red/40', iconColor: 'text-prospex-red' },
  warm:         { label: 'Warm',         icon: Sun,       badge: 'bg-amber-500/20 text-amber-400 border-amber-500/40',        border: 'border-amber-500/40',   iconColor: 'text-amber-400' },
  cold:         { label: 'Cold',         icon: Snowflake, badge: 'bg-blue-500/20 text-blue-400 border-blue-500/40',           border: 'border-blue-500/40',    iconColor: 'text-blue-400' },
  disqualified: { label: 'Disqualified', icon: Ban,       badge: 'bg-prospex-dim/20 text-prospex-dim border-prospex-border',  border: 'border-prospex-border', iconColor: 'text-prospex-dim' },
};

const seedSourceBadge = (s: string | null) => {
  if (s === 'ad_library') return { label: '📡 Ad Library seed', cls: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/40' };
  if (s === 'maps')       return { label: '🗺️ Maps seed', cls: 'bg-prospex-bg text-prospex-dim border-prospex-border' };
  if (s === 'instagram')  return { label: '📷 IG seed', cls: 'bg-pink-500/20 text-pink-400 border-pink-500/40' };
  if (s === 'manual')     return { label: '✍️ Manual', cls: 'bg-prospex-bg text-prospex-dim border-prospex-border' };
  if (s === 'import')     return { label: '📥 Import', cls: 'bg-prospex-bg text-prospex-dim border-prospex-border' };
  return null;
};

// ═══════════════════════════════════════════════════════
// PAGE
// ═══════════════════════════════════════════════════════

export default function HuntPage() {
  const [rows, setRows] = useState<HuntRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [runLimit, setRunLimit] = useState(15);
  const [pushingId, setPushingId] = useState<string | null>(null);
  const [bandFilter, setBandFilter] = useState<Band | 'all'>('all');
  const [seedFilter, setSeedFilter] = useState<string>('all');
  const [error, setError] = useState<string | null>(null);
  const [counts, setCounts] = useState({ hot: 0, warm: 0, cold: 0, disqualified: 0 });

  const load = async () => {
    setLoading(true);
    setError(null);
    // Pull scores + joined lead + latest enrichment + intel
    const { data, error: err } = await supabase
      .from('hunt_scores')
      .select(`
        lead_id, total_score, band, device_score, ad_score, booking_score, establishment_index, scored_at,
        lead:lead_id (id, business_name, city, country, website, seed_source, competitor_watch, ghl_contact_id, email, phone, instagram_url),
        enrichment:hunt_enrichment!lead_id (devices_found, booking_system, has_other_agency, email_found, phone_found, instagram_handle, generic_kit_only),
        intel:hunt_ad_intel!lead_id (ads_active, ad_count, ad_days_running, library_url)
      `)
      .order('total_score', { ascending: false })
      .limit(300);

    if (err) {
      setError(err.message);
      setLoading(false);
      return;
    }

    // Latest opener per lead (n+1 avoidance: batch pull)
    const leadIds = (data || []).map(r => (r as { lead_id: string }).lead_id);
    let openersByLead: Record<string, { opener: string; angle: string | null }> = {};
    if (leadIds.length > 0) {
      const { data: openers } = await supabase
        .from('hunt_outreach')
        .select('lead_id, opener, angle, generated_at')
        .in('lead_id', leadIds)
        .order('generated_at', { ascending: false });
      const seen = new Set<string>();
      for (const r of (openers || []) as Array<{ lead_id: string; opener: string; angle: string | null }>) {
        if (seen.has(r.lead_id)) continue;
        seen.add(r.lead_id);
        openersByLead[r.lead_id] = { opener: r.opener, angle: r.angle };
      }
    }

    const merged = (data || []).map(r => ({
      ...(r as unknown as HuntRow),
      latest_opener: openersByLead[(r as { lead_id: string }).lead_id] || null,
    }));
    setRows(merged);
    const c = merged.reduce((acc, r) => { acc[r.band] = (acc[r.band] || 0) + 1; return acc; }, { hot: 0, warm: 0, cold: 0, disqualified: 0 } as Record<Band, number>);
    setCounts(c);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const runHunt = async () => {
    setRunning(true);
    setError(null);
    try {
      const res = await fetch('/api/hunt/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: runLimit, personalize: true, slack: true }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Run failed');
      await load();
      alert(`Hunt run: ${data.processed} processed · 🔥${data.hot} hot · 🌤️${data.warm} warm · ❄️${data.cold} cold · 🚫${data.disqualified} DQ`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Hunt run failed');
    } finally {
      setRunning(false);
    }
  };

  const pushToGhl = async (row: HuntRow) => {
    if (!row.lead) return;
    setPushingId(row.lead_id);
    try {
      const res = await fetch('/api/ghl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId: row.lead.id }),
      });
      if (!res.ok) throw new Error(`GHL push failed (${res.status})`);
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'GHL push failed');
    } finally {
      setPushingId(null);
    }
  };

  const filtered = useMemo(() => rows.filter(r => {
    if (bandFilter !== 'all' && r.band !== bandFilter) return false;
    if (seedFilter !== 'all' && r.lead?.seed_source !== seedFilter) return false;
    return true;
  }), [rows, bandFilter, seedFilter]);

  return (
    <div className="max-w-7xl mx-auto space-y-4">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-mono font-bold text-prospex-text flex items-center gap-3">
            <Target className="w-5 h-5 md:w-6 md:h-6 text-prospex-cyan" /> Hunt Mode
          </h1>
          <p className="text-sm text-prospex-dim mt-1">Precision ICP hunts — devices, live ads, established markers scored per lead.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input type="number" value={runLimit} onChange={e => setRunLimit(parseInt(e.target.value) || 15)} min={1} max={100}
                 className="input w-20 text-xs" title="Leads per run" />
          <button onClick={runHunt} disabled={running} className="btn-primary text-xs disabled:opacity-50">
            {running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />} Run Hunt
          </button>
          <button onClick={load} className="btn-ghost text-xs"><RefreshCw className="w-3.5 h-3.5" /> Refresh</button>
        </div>
      </div>

      {/* Ad Library Review Queue */}
      <ReviewQueuePanel onPromoted={load} />

      {/* Band histogram */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {(['hot', 'warm', 'cold', 'disqualified'] as Band[]).map(b => {
          const m = bandMeta[b];
          const Icon = m.icon;
          const active = bandFilter === b;
          return (
            <button key={b} onClick={() => setBandFilter(active ? 'all' : b)}
              className={cn('card p-4 border transition-colors text-left', active ? m.border : 'border-prospex-border hover:border-prospex-cyan/30')}>
              <div className="flex items-center gap-2 mb-1">
                <Icon className={cn('w-4 h-4', m.iconColor)} />
                <p className="text-[10px] font-mono text-prospex-dim uppercase">{m.label}</p>
              </div>
              <p className={cn('text-3xl font-mono font-bold', m.iconColor)}>{counts[b]}</p>
            </button>
          );
        })}
      </div>

      {/* Filter bar */}
      <div className="card p-3 flex items-center gap-2 flex-wrap">
        <Filter className="w-3.5 h-3.5 text-prospex-dim" />
        <select value={bandFilter} onChange={e => setBandFilter(e.target.value as Band | 'all')} className="input text-xs py-1.5 w-auto">
          <option value="all">All bands</option>
          <option value="hot">🔥 Hot only</option>
          <option value="warm">🌤️ Warm only</option>
          <option value="cold">❄️ Cold only</option>
          <option value="disqualified">🚫 Disqualified</option>
        </select>
        <select value={seedFilter} onChange={e => setSeedFilter(e.target.value)} className="input text-xs py-1.5 w-auto">
          <option value="all">All seeds</option>
          <option value="maps">🗺️ Maps</option>
          <option value="ad_library">📡 Ad Library</option>
          <option value="instagram">📷 Instagram</option>
          <option value="manual">✍️ Manual</option>
          <option value="import">📥 Import</option>
        </select>
        <span className="text-[10px] text-prospex-dim ml-auto">{filtered.length} of {rows.length} shown</span>
      </div>

      {error && (
        <div className="card p-3 border-prospex-red/40 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-prospex-red shrink-0 mt-0.5" />
          <p className="text-xs text-prospex-red">{error}</p>
        </div>
      )}

      {/* Rows */}
      {loading ? (
        <div className="card p-8 text-center"><Loader2 className="w-5 h-5 animate-spin text-prospex-cyan mx-auto" /></div>
      ) : filtered.length === 0 ? (
        <div className="card p-8 text-center">
          <Sparkles className="w-8 h-8 text-prospex-dim mx-auto mb-3" />
          <p className="text-sm text-prospex-muted">No scored leads yet.</p>
          <p className="text-[11px] text-prospex-dim mt-1">Click <strong>Run Hunt</strong> above to enrich + score a batch, or hit <code>/api/hunt/run</code> directly.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(row => <HuntRowCard key={row.lead_id} row={row} onPushGhl={() => pushToGhl(row)} pushing={pushingId === row.lead_id} />)}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// ROW CARD
// ═══════════════════════════════════════════════════════

function HuntRowCard({ row, onPushGhl, pushing }: { row: HuntRow; onPushGhl: () => void; pushing: boolean }) {
  const m = bandMeta[row.band];
  const Icon = m.icon;
  const seed = seedSourceBadge(row.lead?.seed_source ?? null);
  const devices = row.enrichment?.devices_found || [];
  const email = row.enrichment?.email_found || row.lead?.email;
  const phone = row.enrichment?.phone_found || row.lead?.phone;
  const igHandle = row.enrichment?.instagram_handle;

  return (
    <div className={cn('card p-4 border', m.border)}>
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Icon className={cn('w-4 h-4', m.iconColor)} />
            <span className={cn('badge text-[10px]', m.badge)}>{m.label}</span>
            <span className="text-lg font-mono font-bold text-prospex-text">{row.total_score}</span>
            <Link href={`/leads/${row.lead_id}`} className="text-sm font-semibold text-prospex-cyan hover:underline truncate">
              {row.lead?.business_name || 'Unknown'}
            </Link>
            {row.lead?.city && <span className="text-[10px] text-prospex-dim">📍 {row.lead.city}</span>}
            {seed && <span className={cn('badge text-[9px]', seed.cls)}>{seed.label}</span>}
            {row.enrichment?.has_other_agency && <span className="badge text-[9px] bg-amber-500/20 text-amber-400 border-amber-500/40">⚠️ other-agency</span>}
            {row.enrichment?.generic_kit_only && <span className="badge text-[9px] bg-prospex-red/20 text-prospex-red border-prospex-red/40">generic-only</span>}
          </div>

          <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-2 text-[10px] font-mono">
            <span className="text-prospex-muted">Device: <span className="text-prospex-text">{row.device_score}</span></span>
            <span className="text-prospex-muted">Ads: <span className="text-prospex-text">{row.ad_score}</span></span>
            <span className="text-prospex-muted">Book: <span className="text-prospex-text">{row.booking_score}</span></span>
            <span className="text-prospex-muted">Est.Idx: <span className="text-prospex-text">{row.establishment_index ?? '—'}</span></span>
          </div>

          <div className="mt-2 text-[11px] text-prospex-muted space-y-1">
            {devices.length > 0 && (
              <p><Building2 className="w-3 h-3 inline mr-1 text-prospex-dim" /> Devices: <span className="text-prospex-text">{devices.slice(0, 4).join(', ')}</span></p>
            )}
            <p className="flex items-center gap-2 flex-wrap">
              {row.intel?.ads_active
                ? <span className="text-prospex-green flex items-center gap-1"><Radio className="w-3 h-3" /> {row.intel.ad_count} active ads · {row.intel.ad_days_running ?? '?'}d</span>
                : <span className="text-prospex-dim">❌ no active ads</span>}
              {row.intel?.library_url && (
                <a href={row.intel.library_url} target="_blank" rel="noopener noreferrer" className="text-prospex-cyan hover:underline text-[10px] flex items-center gap-0.5">
                  Ad Library <ExternalLink className="w-2.5 h-2.5" />
                </a>
              )}
              {row.enrichment?.booking_system && <span className="text-prospex-dim">· Booking: <span className="text-prospex-text">{row.enrichment.booking_system}</span></span>}
            </p>
            {(email || phone || igHandle) && (
              <p className="text-[10px] text-prospex-dim">
                {email && <span>📧 {email}</span>}
                {email && (phone || igHandle) && <span> · </span>}
                {phone && <span>📞 {phone}</span>}
                {phone && igHandle && <span> · </span>}
                {igHandle && <span>@{igHandle.replace(/^@/, '')}</span>}
              </p>
            )}
            {row.latest_opener && (
              <div className="mt-2 p-2 bg-prospex-bg border border-prospex-border rounded-lg">
                <p className="text-[9px] font-mono text-prospex-dim uppercase mb-1 flex items-center gap-1">
                  <MessageSquare className="w-3 h-3" /> Opener {row.latest_opener.angle && <span className="text-amber-400 normal-case">— {row.latest_opener.angle}</span>}
                </p>
                <p className="text-[11px] text-prospex-text whitespace-pre-wrap">{row.latest_opener.opener}</p>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <Link href={`/leads/${row.lead_id}`} className="btn-ghost text-[10px]">
            <ExternalLink className="w-3 h-3" /> View
          </Link>
          {row.lead && !row.lead.ghl_contact_id && (
            <button onClick={onPushGhl} disabled={pushing} className="btn text-[10px] bg-prospex-green/20 text-prospex-green border border-prospex-green/40 hover:bg-prospex-green/30 disabled:opacity-50">
              {pushing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />} Push to GHL
            </button>
          )}
          {row.lead?.ghl_contact_id && (
            <span className="badge text-[9px] bg-prospex-green/20 text-prospex-green border-prospex-green/40"><Zap className="w-3 h-3 inline mr-0.5" /> In GHL</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// REVIEW QUEUE PANEL — Ad Library seed candidates
// ═══════════════════════════════════════════════════════

interface QueueRowUI {
  id: number;
  fb_page_id: string;
  page_name: string | null;
  country: string | null;
  search_term: string | null;
  ad_snapshot_url: string | null;
  ad_copy: string | null;
  currency: string | null;
  currency_mismatch: boolean | null;
  status: string;
  found_at: string;
}

function ReviewQueuePanel({ onPromoted }: { onPromoted: () => void }) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<QueueRowUI[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [showSeed, setShowSeed] = useState(false);
  const [seedKeyword, setSeedKeyword] = useState('');
  const [seedCountry, setSeedCountry] = useState('GB');
  const [seedLimit, setSeedLimit] = useState(50);
  const [seeding, setSeeding] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [statusTab, setStatusTab] = useState<'pending' | 'approved' | 'rejected' | 'competitor'>('pending');

  const load = async () => {
    setLoading(true);
    const res = await fetch(`/api/hunt/queue?status=${statusTab}&limit=200`);
    const data = await res.json();
    setRows(data.rows || []);
    setSelected(new Set());
    setLoading(false);
  };

  useEffect(() => {
    if (open) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, statusTab]);

  const bulkAction = async (action: 'approve' | 'reject' | 'mark_competitor' | 'promote_to_leads') => {
    if (selected.size === 0) return;
    const res = await fetch('/api/hunt/queue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, queue_ids: Array.from(selected) }),
    });
    const data = await res.json();
    if (data.success) {
      if (action === 'promote_to_leads') { setMsg(`Promoted ${data.promoted} to leads.`); onPromoted(); }
      load();
    } else {
      setMsg(`Error: ${data.error || 'action failed'}`);
    }
    setTimeout(() => setMsg(null), 3000);
  };

  const seedNow = async () => {
    if (!seedKeyword.trim()) return;
    setSeeding(true);
    setMsg(null);
    try {
      const res = await fetch('/api/hunt/seed-adlibrary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'search', keyword: seedKeyword, country: seedCountry, limit: seedLimit }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setMsg(`Seed failed: ${data.error || 'unknown'}`);
      } else {
        setMsg(`Seed OK · ingested ${data.ingested} · junk ${data.filtered_junk} · dupes ${data.skipped_duplicates}`);
        setStatusTab('pending');
        load();
      }
    } finally { setSeeding(false); }
  };

  const toggleAll = () => {
    if (selected.size === rows.length) setSelected(new Set());
    else setSelected(new Set(rows.map(r => r.id)));
  };

  return (
    <div className="card">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between p-4 hover:bg-prospex-bg/30 transition-colors">
        <div className="flex items-center gap-3">
          <Radar className="w-4 h-4 text-prospex-cyan" />
          <div className="text-left">
            <h3 className="text-sm font-mono font-bold text-prospex-text">Ad Library Review Queue</h3>
            <p className="text-[10px] text-prospex-dim">Keyword-hunt candidates from Meta Ads Library — approve to promote into leads</p>
          </div>
        </div>
        {open ? <ChevronDown className="w-4 h-4 text-prospex-dim" /> : <ChevronRight className="w-4 h-4 text-prospex-dim" />}
      </button>

      {open && (
        <div className="border-t border-prospex-border p-4 space-y-3">
          {/* Seed controls */}
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-1">
              {(['pending', 'approved', 'rejected', 'competitor'] as const).map(s => (
                <button key={s} onClick={() => setStatusTab(s)}
                  className={cn('text-[10px] px-2 py-1 rounded font-mono',
                    statusTab === s ? 'bg-prospex-cyan/20 text-prospex-cyan border border-prospex-cyan/30' : 'bg-prospex-bg text-prospex-dim hover:text-prospex-text')}>
                  {s}
                </button>
              ))}
            </div>
            <button onClick={() => setShowSeed(!showSeed)} className="btn-primary text-xs">
              <SearchIcon className="w-3.5 h-3.5" /> Seed via Keyword
            </button>
          </div>

          {showSeed && (
            <div className="p-3 bg-prospex-bg border border-prospex-cyan/30 rounded-lg space-y-2">
              <div className="flex flex-wrap gap-2 items-end">
                <div className="flex-1 min-w-[180px]">
                  <label className="text-[10px] font-mono text-prospex-dim uppercase block mb-1">Keyword</label>
                  <input value={seedKeyword} onChange={e => setSeedKeyword(e.target.value)} placeholder="morpheus8, endolift, hifu…" className="input w-full" />
                </div>
                <div>
                  <label className="text-[10px] font-mono text-prospex-dim uppercase block mb-1">Country</label>
                  <select value={seedCountry} onChange={e => setSeedCountry(e.target.value)} className="input">
                    <option value="GB">GB</option><option value="US">US</option><option value="CA">CA</option><option value="AU">AU</option><option value="IE">IE</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-mono text-prospex-dim uppercase block mb-1">Limit</label>
                  <input type="number" min={5} max={200} value={seedLimit} onChange={e => setSeedLimit(parseInt(e.target.value) || 50)} className="input w-20" />
                </div>
                <button onClick={seedNow} disabled={seeding || !seedKeyword.trim()} className="btn-primary text-xs disabled:opacity-50">
                  {seeding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />} Search
                </button>
              </div>
              <p className="text-[10px] text-prospex-dim">Requires <code className="text-prospex-text">META_ADS_TOKEN</code>. For MCP-based seeding push into <code className="text-prospex-text">POST /api/hunt/seed-adlibrary</code> with <code className="text-prospex-text">mode=&quot;import&quot;</code>.</p>
            </div>
          )}

          {msg && <p className="text-xs text-prospex-cyan">{msg}</p>}

          {/* Bulk action bar */}
          {selected.size > 0 && (
            <div className="flex flex-wrap items-center gap-2 p-2 bg-prospex-cyan/5 border border-prospex-cyan/30 rounded-lg">
              <span className="text-xs text-prospex-cyan font-mono">{selected.size} selected</span>
              <div className="w-px h-4 bg-prospex-border" />
              {statusTab === 'pending' && (
                <>
                  <button onClick={() => bulkAction('approve')} className="btn text-[10px] bg-prospex-green/20 text-prospex-green border border-prospex-green/40 hover:bg-prospex-green/30">
                    <Check className="w-3 h-3" /> Approve
                  </button>
                  <button onClick={() => bulkAction('mark_competitor')} className="btn text-[10px] bg-amber-500/20 text-amber-400 border border-amber-500/40 hover:bg-amber-500/30">
                    <Radio className="w-3 h-3" /> Mark Competitor
                  </button>
                  <button onClick={() => bulkAction('reject')} className="btn text-[10px] bg-prospex-red/20 text-prospex-red border border-prospex-red/40 hover:bg-prospex-red/30">
                    <X className="w-3 h-3" /> Reject
                  </button>
                </>
              )}
              {statusTab === 'approved' && (
                <button onClick={() => bulkAction('promote_to_leads')} className="btn text-[10px] bg-prospex-cyan/20 text-prospex-cyan border border-prospex-cyan/40 hover:bg-prospex-cyan/30">
                  <ArrowRight className="w-3 h-3" /> Promote to Leads
                </button>
              )}
            </div>
          )}

          {/* Table */}
          {loading ? (
            <div className="py-6 text-center"><Loader2 className="w-4 h-4 animate-spin text-prospex-cyan mx-auto" /></div>
          ) : rows.length === 0 ? (
            <p className="text-xs text-prospex-dim text-center py-4">
              No {statusTab} rows. {statusTab === 'pending' && 'Seed a keyword above to populate.'}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs min-w-[720px]">
                <thead>
                  <tr className="table-header">
                    <th className="w-8 px-2 py-2"><input type="checkbox" checked={rows.length > 0 && selected.size === rows.length} onChange={toggleAll} /></th>
                    <th className="text-left px-2 py-2 font-mono text-[10px] text-prospex-dim uppercase">Page</th>
                    <th className="text-left px-2 py-2 font-mono text-[10px] text-prospex-dim uppercase">Term</th>
                    <th className="text-left px-2 py-2 font-mono text-[10px] text-prospex-dim uppercase">Country</th>
                    <th className="text-left px-2 py-2 font-mono text-[10px] text-prospex-dim uppercase">Ad</th>
                    <th className="text-left px-2 py-2 font-mono text-[10px] text-prospex-dim uppercase">Found</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => (
                    <tr key={r.id} className="table-row">
                      <td className="px-2 py-2">
                        <input type="checkbox" checked={selected.has(r.id)} onChange={() => {
                          const next = new Set(selected);
                          next.has(r.id) ? next.delete(r.id) : next.add(r.id);
                          setSelected(next);
                        }} />
                      </td>
                      <td className="px-2 py-2">
                        <div className="flex items-center gap-1.5">
                          <span className="text-prospex-text">{r.page_name || `Page ${r.fb_page_id}`}</span>
                          {r.currency_mismatch && (
                            <span
                              className="badge text-[9px] bg-amber-500/20 text-amber-400 border-amber-500/40"
                              title={`Meta recorded currency ${r.currency || '?'} — check the ad for country targeting before promoting`}
                            >
                              ⚠️ {r.currency || 'currency'}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-2 py-2 text-prospex-muted font-mono">{r.search_term || '—'}</td>
                      <td className="px-2 py-2 text-prospex-muted">{r.country || '—'}</td>
                      <td className="px-2 py-2 max-w-[280px] truncate" title={r.ad_copy || ''}>
                        {r.ad_snapshot_url ? (
                          <a href={r.ad_snapshot_url} target="_blank" rel="noopener noreferrer" className="text-prospex-cyan hover:underline flex items-center gap-1">
                            {r.ad_copy ? r.ad_copy.slice(0, 60) : 'view ad'} <ExternalLink className="w-2.5 h-2.5" />
                          </a>
                        ) : (r.ad_copy || '—')}
                      </td>
                      <td className="px-2 py-2 text-prospex-dim text-[10px] font-mono">{new Date(r.found_at).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
