'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import {
  Target, Loader2, RefreshCw, Play, Filter, Upload, Flame, Sun, Snowflake, Ban,
  ExternalLink, Zap, Radio, MessageSquare, Building2, Sparkles, AlertTriangle,
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
