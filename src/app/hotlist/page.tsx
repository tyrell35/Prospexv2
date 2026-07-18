'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import {
  Flame, Star, MessageCircle, Instagram, MapPin, RefreshCw, Loader2, Filter,
  Sparkles, Trophy, Rocket, TrendingUp, ExternalLink, Pin, PinOff, Zap,
  Inbox, Clock, ThumbsUp, CalendarCheck, XCircle, Check,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import BulkDmSendModal from '@/components/BulkDmSendModal';
import type { Lead } from '@/lib/types';

// ═══════════════════════════════════════════════════════
// HOT LIST
//
// The two-click daily prospecting surface: land here → pick country →
// see the top established clinics ranked by a composite quality score
// → hit "Message All" → straight into Fast IG or Fast WA.
//
// Ranking heuristic (all in the WHERE + ORDER BY, no JS ranking):
//   score = google_rating × ln(google_review_count + 1)
// Multiplied by soft bonuses:
//   × 1.5 if Tier A device detected (heavy-capital equipment = serious budget)
//   × 1.2 if Tier B device detected
//   × 1.3 if has instagram_handle (messageable = actionable today)
//
// Exclusion filters (keeps the list high-signal):
//   - country IN chosen region
//   - google_rating ≥ 4.5 AND google_review_count ≥ 50 (established, not new)
//   - outreach_status NOT IN ('contacted','responded','not_interested','booked')
//     — we don't re-suggest clinics we've already touched
//   - Has EITHER instagram_handle/url OR phone (needs at least one channel)
// ═══════════════════════════════════════════════════════

type Region = 'UK' | 'US' | 'Canada' | 'All';

const REGION_MATCH: Record<Region, string[]> = {
  UK: ['United Kingdom', 'United Kingdom of Great Britain and Northern Ireland', 'UK'],
  US: ['United States', 'United States of America', 'USA', 'US'],
  Canada: ['Canada'],
  All: [],
};

interface HotLead extends Lead {
  score: number;
  device_tier: 'A' | 'B' | null;
  device_summary: string;
}

interface DbTemplate {
  id: string;
  name: string;
  category: string | null;
  content: string;
  channel: string | null;
}

// Pipeline stage → display metadata for the "My Pipeline" grouped view.
// Order matters — this is the top-down flow the eye should follow.
const PIPELINE_GROUPS: Array<{ key: string; label: string; icon: typeof Inbox; cls: string; help: string }> = [
  { key: 'new',       label: 'To contact',        icon: Inbox,         cls: 'text-prospex-cyan border-prospex-cyan/40',       help: 'Pinned but not yet messaged' },
  { key: 'contacted', label: 'Awaiting reply',    icon: Clock,         cls: 'text-amber-400 border-amber-500/40',             help: 'Messaged — waiting for their response' },
  { key: 'pitched',   label: 'Positive reply',    icon: ThumbsUp,      cls: 'text-prospex-green border-prospex-green/40',     help: 'Warm reply logged — nurture toward booking' },
  { key: 'booked',    label: 'Booked',            icon: CalendarCheck, cls: 'text-prospex-green border-prospex-green/40',     help: 'Consult / call scheduled' },
  { key: 'closed',    label: 'Closed · won',      icon: Trophy,        cls: 'text-orange-400 border-orange-500/40',           help: 'Signed as a client' },
  { key: 'lost',      label: 'Passed',            icon: XCircle,       cls: 'text-prospex-red/70 border-prospex-red/30',      help: 'Not moving forward' },
];

function computeScore(l: Lead, deviceTier: 'A' | 'B' | null): number {
  const rating = l.google_rating || 0;
  const reviews = l.google_review_count || 0;
  let s = rating * Math.log(reviews + 1);
  if (deviceTier === 'A') s *= 1.5;
  else if (deviceTier === 'B') s *= 1.2;
  if (l.instagram_handle || l.instagram_url) s *= 1.3;
  return Math.round(s * 100) / 100;
}

export default function HotListPage() {
  // View mode: 'ranked' shows the algorithmic top clinics; 'pinned' shows
  // only leads the operator has pinned to their working shortlist, grouped
  // by pipeline stage so the daily nurture flow is obvious at a glance.
  const [mode, setMode] = useState<'ranked' | 'pinned'>('ranked');
  const [region, setRegion] = useState<Region>('UK');
  const [niche, setNiche] = useState<string>('');
  const [uniqueNiches, setUniqueNiches] = useState<string[]>([]);
  const [minReviews, setMinReviews] = useState<number>(50);
  const [minRating, setMinRating] = useState<number>(4.5);
  const [leads, setLeads] = useState<HotLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [blastChannel, setBlastChannel] = useState<null | 'instagram' | 'whatsapp'>(null);
  const [blastLeads, setBlastLeads] = useState<Lead[] | null>(null); // null = use selectedLeads, otherwise use this list (for quick-DM single lead)
  const [pinBusy, setPinBusy] = useState<string | null>(null); // lead_id currently being pinned/unpinned

  // Templates loaded once for the quick-DM shortcuts on cards
  const [igTemplates, setIgTemplates] = useState<DbTemplate[]>([]);
  const [waTemplates, setWaTemplates] = useState<DbTemplate[]>([]);
  const [quickDmForId, setQuickDmForId] = useState<string | null>(null); // lead id whose quick-DM popover is open

  // Load niche options + templates once
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('leads').select('niche').not('niche', 'is', null);
      const niches = [...new Set((data || []).map(d => d.niche).filter(Boolean))].sort();
      setUniqueNiches(niches);

      const { data: tpls } = await supabase.from('conversation_templates')
        .select('id, name, category, content, channel')
        .eq('is_active', true)
        .order('category');
      const all = (tpls || []) as DbTemplate[];
      setIgTemplates(all.filter(t => t.channel === 'instagram' || t.channel === 'all'));
      setWaTemplates(all.filter(t => t.channel === 'whatsapp' || t.channel === 'all'));
    })();
  }, []);

  // Close quick-DM popover when clicking anywhere outside a card
  useEffect(() => {
    if (!quickDmForId) return;
    const onClick = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (!t.closest('[data-quick-dm]')) setQuickDmForId(null);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [quickDmForId]);

  // Load leads whenever filters or mode changes.
  // Two paths:
  //   ranked  → algorithmic top clinics (rating × reviews × device × has-IG),
  //             excludes already-contacted, needs a channel
  //   pinned  → only leads with hot_list_at IS NOT NULL, no other filter
  //             (grouped by pipeline_stage in the render)
  const load = async () => {
    setLoading(true);
    try {
      let q;
      if (mode === 'pinned') {
        q = supabase
          .from('leads')
          .select('*')
          .not('hot_list_at', 'is', null)
          .order('hot_list_at', { ascending: false })
          .limit(500);
      } else {
        q = supabase
          .from('leads')
          .select('*')
          .gte('google_rating', minRating)
          .gte('google_review_count', minReviews)
          .not('outreach_status', 'in', '("contacted","responded","not_interested","booked")')
          .or('instagram_handle.not.is.null,instagram_url.not.is.null,phone.not.is.null')
          .order('google_review_count', { ascending: false })
          .limit(200);
        if (region !== 'All') q = q.in('country', REGION_MATCH[region]);
        if (niche) q = q.eq('niche', niche);
      }
      const { data, error } = await q;
      if (error) throw error;

      const rows = (data || []) as Lead[];

      // Enrich with device info (single query per page load, keyed by lead_id)
      const ids = rows.map(r => r.id);
      let deviceMap = new Map<string, { tier_a_count: number; tier_b_count: number; devices_found: string[] | null }>();
      if (ids.length > 0) {
        const { data: enr } = await supabase
          .from('hunt_enrichment')
          .select('lead_id, tier_a_count, tier_b_count, devices_found')
          .in('lead_id', ids);
        for (const e of (enr || []) as Array<{ lead_id: string; tier_a_count: number | null; tier_b_count: number | null; devices_found: string[] | null }>) {
          deviceMap.set(e.lead_id, {
            tier_a_count: e.tier_a_count || 0,
            tier_b_count: e.tier_b_count || 0,
            devices_found: e.devices_found,
          });
        }
      }

      const scored: HotLead[] = rows.map(l => {
        const d = deviceMap.get(l.id);
        const tier: 'A' | 'B' | null = d && d.tier_a_count > 0 ? 'A' : d && d.tier_b_count > 0 ? 'B' : null;
        const devices = d?.devices_found || [];
        return {
          ...l,
          score: computeScore(l, tier),
          device_tier: tier,
          device_summary: devices.slice(0, 3).join(' · '),
        };
      });

      // Sort: ranked mode uses composite score desc; pinned mode preserves
      // hot_list_at desc from the query so the most recently pinned appear first.
      if (mode === 'ranked') {
        scored.sort((a, b) => b.score - a.score);
        setLeads(scored.slice(0, 30));
        setSelectedIds(new Set(scored.slice(0, 30).map(l => l.id)));
      } else {
        setLeads(scored);
        setSelectedIds(new Set()); // pinned view starts unselected — user picks who to blast
      }
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [mode, region, niche, minRating, minReviews]);

  // Pin / unpin a lead — inline supabase call, no API round-trip
  const togglePin = async (lead: HotLead) => {
    setPinBusy(lead.id);
    try {
      const nextValue = lead.hot_list_at ? null : new Date().toISOString();
      await supabase.from('leads').update({ hot_list_at: nextValue }).eq('id', lead.id);
      // Optimistic local update — no full reload needed for a single toggle
      setLeads(prev => prev.map(l => l.id === lead.id ? { ...l, hot_list_at: nextValue } : l));
      // In pinned mode, unpinning should drop the card immediately
      if (mode === 'pinned' && !nextValue) {
        setLeads(prev => prev.filter(l => l.id !== lead.id));
      }
    } finally { setPinBusy(null); }
  };

  // Quick DM shortcut: open Fast Blast pre-loaded with a single lead
  // and remember the last-picked template so the operator lands straight
  // on the run screen instead of the setup screen.
  const quickDm = (lead: HotLead, channel: 'instagram' | 'whatsapp', templateContent: string) => {
    localStorage.setItem(`prospex_last_template_${channel}`, templateContent);
    setBlastLeads([lead]);
    setBlastChannel(channel);
    setQuickDmForId(null);
  };

  const toggleSelect = (id: string) => setSelectedIds(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const selectAll = () => setSelectedIds(new Set(leads.map(l => l.id)));
  const selectNone = () => setSelectedIds(new Set());

  const selectedLeads = useMemo(() => leads.filter(l => selectedIds.has(l.id)), [leads, selectedIds]);
  const igCount = selectedLeads.filter(l => l.instagram_handle || l.instagram_url).length;
  const waCount = selectedLeads.filter(l => l.phone).length;

  // Card renderer used by both ranked grid and grouped pipeline view.
  // hideRank=true in pinned mode where the ranking medal isn't meaningful.
  const renderCard = (l: HotLead, i: number, hideRank = false) => {
    const isSelected = selectedIds.has(l.id);
    const isPinned = !!l.hot_list_at;
    const hasIg = !!(l.instagram_handle || l.instagram_url);
    const hasWa = !!l.phone;
    const rankBadge = hideRank ? null : (i < 3 ? ['🥇', '🥈', '🥉'][i] : `#${i + 1}`);
    const quickOpen = quickDmForId === l.id;
    return (
      <div key={l.id} onClick={() => toggleSelect(l.id)}
        className={cn(
          'card p-3 cursor-pointer transition-all relative',
          isSelected ? 'border-orange-500/50 bg-orange-500/5' : isPinned ? 'border-orange-500/30' : 'hover:border-prospex-cyan/30'
        )}>
        <div className="flex items-start justify-between gap-2 mb-1.5">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-0.5">
              {rankBadge && <span className="text-[11px] font-mono text-orange-400 flex-shrink-0">{rankBadge}</span>}
              <p className="text-sm font-mono font-bold text-prospex-text truncate">{l.business_name}</p>
            </div>
            <div className="flex items-center gap-2 flex-wrap text-[10px] text-prospex-dim">
              <span className="flex items-center gap-0.5"><MapPin className="w-2.5 h-2.5" /> {l.city || '—'}{l.county ? `, ${l.county}` : ''}</span>
              <span className="flex items-center gap-0.5 text-amber-400">
                <Star className="w-2.5 h-2.5 fill-amber-400" /> {l.google_rating?.toFixed(1) || '—'}
                <span className="text-prospex-dim ml-0.5">({l.google_review_count || 0})</span>
              </span>
              {l.niche && <span className="text-prospex-muted">· {l.niche}</span>}
            </div>
          </div>
          <div className="flex-shrink-0 flex items-center gap-1">
            {/* Pin toggle */}
            <button
              onClick={e => { e.stopPropagation(); togglePin(l); }}
              disabled={pinBusy === l.id}
              className={cn('p-1 rounded transition-colors',
                isPinned ? 'text-orange-400 hover:text-orange-300' : 'text-prospex-dim hover:text-orange-400')}
              title={isPinned ? 'Unpin from Hot List' : 'Pin to Hot List'}>
              {pinBusy === l.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : isPinned ? <Pin className="w-3.5 h-3.5 fill-orange-400" /> : <PinOff className="w-3.5 h-3.5" />}
            </button>
            <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(l.id)}
              onClick={e => e.stopPropagation()}
              className="rounded border-orange-500/40 bg-prospex-bg accent-orange-400" />
          </div>
        </div>

        {/* Device chip + channel availability + Quick DM */}
        <div className="flex items-center gap-2 flex-wrap mt-2">
          {l.device_tier === 'A' && (
            <span className="text-[9px] font-mono px-1.5 py-0.5 rounded border border-prospex-cyan/40 bg-prospex-cyan/10 text-prospex-cyan" title={l.device_summary}>
              🔥 Tier A · {l.device_summary || 'device'}
            </span>
          )}
          {l.device_tier === 'B' && (
            <span className="text-[9px] font-mono px-1.5 py-0.5 rounded border border-amber-500/40 bg-amber-500/10 text-amber-400" title={l.device_summary}>
              Tier B · {l.device_summary || 'device'}
            </span>
          )}
          {mode === 'ranked' && <span className="text-[9px] font-mono text-prospex-dim">score {l.score}</span>}
          <div className="ml-auto flex items-center gap-1" data-quick-dm>
            {/* Quick DM shortcut */}
            <button
              onClick={e => { e.stopPropagation(); setQuickDmForId(quickOpen ? null : l.id); }}
              className="text-[9px] font-mono px-1.5 py-0.5 rounded border border-orange-500/40 bg-orange-500/10 text-orange-400 hover:bg-orange-500/20 flex items-center gap-1"
              title="Quick DM · pick a template and send now">
              <Zap className="w-2.5 h-2.5" /> Quick DM
            </button>
            {hasIg && !hasWa && <Instagram className="w-2.5 h-2.5 text-pink-400" />}
            {hasWa && !hasIg && <MessageCircle className="w-2.5 h-2.5 text-green-400" />}
            <Link href={`/leads/${l.id}`} onClick={e => e.stopPropagation()}
              className="text-[9px] text-prospex-dim hover:text-prospex-text flex items-center gap-0.5" title="Open full lead page">
              <ExternalLink className="w-2.5 h-2.5" />
            </Link>
          </div>
        </div>

        {/* Quick DM popover */}
        {quickOpen && (
          <div data-quick-dm onClick={e => e.stopPropagation()}
            className="absolute right-2 top-full mt-1 z-30 w-72 card bg-prospex-surface border-orange-500/40 shadow-xl p-2 space-y-2">
            {hasIg && (
              <div>
                <p className="text-[9px] font-mono text-pink-400 uppercase mb-1 flex items-center gap-1"><Instagram className="w-2.5 h-2.5" /> Instagram</p>
                <div className="space-y-0.5 max-h-40 overflow-y-auto">
                  {igTemplates.slice(0, 8).map(t => (
                    <button key={t.id} onClick={() => quickDm(l, 'instagram', t.content)}
                      className="w-full text-left text-[10px] px-1.5 py-1 rounded hover:bg-pink-500/10 text-prospex-text truncate">
                      {t.category ? <span className="text-prospex-dim">[{t.category}] </span> : null}{t.name}
                    </button>
                  ))}
                  {igTemplates.length === 0 && <p className="text-[9px] text-prospex-dim italic">No IG templates yet</p>}
                </div>
              </div>
            )}
            {hasWa && (
              <div>
                <p className="text-[9px] font-mono text-green-400 uppercase mb-1 flex items-center gap-1"><MessageCircle className="w-2.5 h-2.5" /> WhatsApp</p>
                <div className="space-y-0.5 max-h-40 overflow-y-auto">
                  {waTemplates.slice(0, 8).map(t => (
                    <button key={t.id} onClick={() => quickDm(l, 'whatsapp', t.content)}
                      className="w-full text-left text-[10px] px-1.5 py-1 rounded hover:bg-green-500/10 text-prospex-text truncate">
                      {t.category ? <span className="text-prospex-dim">[{t.category}] </span> : null}{t.name}
                    </button>
                  ))}
                  {waTemplates.length === 0 && <p className="text-[9px] text-prospex-dim italic">No WA templates yet</p>}
                </div>
              </div>
            )}
            {!hasIg && !hasWa && (
              <p className="text-[10px] text-prospex-dim italic">No IG handle or phone for this lead — enrich to add contact channels.</p>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-mono font-bold text-prospex-text flex items-center gap-3">
            <Flame className="w-6 h-6 text-orange-400" /> Hot List
          </h1>
          <p className="text-sm text-prospex-dim mt-1">
            {mode === 'ranked'
              ? 'Top established clinics ready to message · ranked by rating × reviews × device tier · excludes already-contacted.'
              : 'Your pinned working shortlist · grouped by pipeline stage so you can see who needs a nudge next.'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* View mode toggle */}
          <div className="flex items-center rounded-lg border border-prospex-border overflow-hidden">
            <button onClick={() => setMode('ranked')}
              className={cn('text-[10px] font-mono px-3 py-1.5 flex items-center gap-1.5',
                mode === 'ranked' ? 'bg-orange-500/20 text-orange-400' : 'bg-prospex-bg text-prospex-dim hover:text-prospex-text')}>
              <Trophy className="w-3 h-3" /> Top Ranked
            </button>
            <button onClick={() => setMode('pinned')}
              className={cn('text-[10px] font-mono px-3 py-1.5 flex items-center gap-1.5',
                mode === 'pinned' ? 'bg-orange-500/20 text-orange-400' : 'bg-prospex-bg text-prospex-dim hover:text-prospex-text')}>
              <Pin className="w-3 h-3" /> My Pipeline
              {leads.length > 0 && mode === 'pinned' && <span className="text-[9px] px-1 rounded bg-orange-500/20">{leads.length}</span>}
            </button>
          </div>
          <button onClick={load} className="btn-ghost text-xs w-fit">
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} Refresh
          </button>
        </div>
      </div>

      {/* Filters — only meaningful in ranked mode (pinned mode shows YOUR list, unfiltered) */}
      {mode === 'ranked' && <div className="card p-3 flex flex-wrap items-center gap-2">
        <Filter className="w-3.5 h-3.5 text-prospex-dim" />

        <div className="flex items-center gap-1">
          {(['UK', 'US', 'Canada', 'All'] as Region[]).map(r => (
            <button key={r} onClick={() => setRegion(r)}
              className={cn('text-[10px] px-2 py-1 rounded font-mono',
                region === r ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30' : 'bg-prospex-bg text-prospex-dim hover:text-prospex-text')}>
              {r === 'UK' ? '🇬🇧 UK' : r === 'US' ? '🇺🇸 US' : r === 'Canada' ? '🇨🇦 CA' : '🌍 All'}
            </button>
          ))}
        </div>

        <div className="w-px h-4 bg-prospex-border mx-1" />

        <select value={niche} onChange={e => setNiche(e.target.value)} className="input text-xs py-1.5 w-auto">
          <option value="">All niches</option>
          {uniqueNiches.map(n => <option key={n} value={n}>{n}</option>)}
        </select>

        <div className="flex items-center gap-1.5">
          <Star className="w-3 h-3 text-amber-400" />
          <select value={minRating} onChange={e => setMinRating(parseFloat(e.target.value))} className="input text-xs py-1.5 w-auto">
            <option value="4.0">4.0+</option>
            <option value="4.3">4.3+</option>
            <option value="4.5">4.5+</option>
            <option value="4.7">4.7+</option>
            <option value="4.9">4.9+</option>
          </select>
        </div>

        <div className="flex items-center gap-1.5">
          <TrendingUp className="w-3 h-3 text-prospex-cyan" />
          <select value={minReviews} onChange={e => setMinReviews(parseInt(e.target.value))} className="input text-xs py-1.5 w-auto">
            <option value="25">25+ reviews</option>
            <option value="50">50+ reviews</option>
            <option value="100">100+ reviews</option>
            <option value="250">250+ reviews</option>
            <option value="500">500+ reviews</option>
          </select>
        </div>

        <span className="ml-auto text-[10px] text-prospex-dim font-mono">
          {leads.length} shown · {selectedIds.size} picked
        </span>
      </div>}

      {/* Bulk action bar — the whole point of this page */}
      <div className="card p-3 flex flex-wrap items-center gap-2 border-orange-500/30">
        <span className="text-[10px] font-mono text-prospex-dim uppercase">Send to selected</span>
        <button
          onClick={() => setBlastChannel('instagram')}
          disabled={igCount === 0}
          className="btn text-xs bg-gradient-to-r from-pink-500/30 to-fuchsia-500/30 text-pink-300 border border-pink-500/50 hover:from-pink-500/40 hover:to-fuchsia-500/40 disabled:opacity-40"
          title="Fast IG Blast — round-robin across warm accounts, one-tap send">
          <Rocket className="w-3.5 h-3.5" /> 🚀 Fast IG ({igCount})
        </button>
        <button
          onClick={() => setBlastChannel('whatsapp')}
          disabled={waCount === 0}
          className="btn text-xs bg-gradient-to-r from-green-500/30 to-emerald-500/30 text-green-300 border border-green-500/50 hover:from-green-500/40 hover:to-emerald-500/40 disabled:opacity-40"
          title="Fast WA — wa.me deep links with prefilled message per lead">
          <MessageCircle className="w-3.5 h-3.5" /> 💬 Fast WA ({waCount})
        </button>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={selectAll} className="text-[10px] text-prospex-cyan hover:underline">Select all</button>
          <span className="text-prospex-dim">·</span>
          <button onClick={selectNone} className="text-[10px] text-prospex-dim hover:text-prospex-text">Clear</button>
        </div>
      </div>

      {/* Leads — grid in ranked mode, pipeline-grouped sections in pinned mode */}
      {loading && leads.length === 0 ? (
        <div className="card p-12 text-center"><Loader2 className="w-6 h-6 animate-spin text-orange-400 mx-auto" /></div>
      ) : leads.length === 0 ? (
        <div className="card p-12 text-center">
          {mode === 'ranked' ? (
            <>
              <Trophy className="w-8 h-8 text-prospex-dim mx-auto mb-3" />
              <p className="text-sm text-prospex-muted">No hot clinics match these filters.</p>
              <p className="text-[11px] text-prospex-dim mt-1">Try lowering the rating/review threshold, or switch region.</p>
            </>
          ) : (
            <>
              <Pin className="w-8 h-8 text-prospex-dim mx-auto mb-3" />
              <p className="text-sm text-prospex-muted">Your pipeline is empty.</p>
              <p className="text-[11px] text-prospex-dim mt-1">Switch to <button onClick={() => setMode('ranked')} className="text-orange-400 underline">Top Ranked</button> and click the 📌 pin on any card to save it here.</p>
            </>
          )}
        </div>
      ) : mode === 'ranked' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {leads.map((l, i) => renderCard(l, i))}
        </div>
      ) : (
        // Pinned mode — grouped by pipeline_stage. Empty groups collapse away.
        <div className="space-y-4">
          {PIPELINE_GROUPS.map(g => {
            const groupLeads = leads.filter(l => (l.pipeline_stage || 'new') === g.key);
            if (groupLeads.length === 0) return null;
            const GroupIcon = g.icon;
            return (
              <div key={g.key}>
                <div className={cn('flex items-center gap-2 mb-2 pb-1 border-b', g.cls.split(' ')[1])}>
                  <GroupIcon className={cn('w-3.5 h-3.5', g.cls.split(' ')[0])} />
                  <h2 className={cn('text-xs font-mono uppercase tracking-wider', g.cls.split(' ')[0])}>{g.label}</h2>
                  <span className="text-[10px] font-mono text-prospex-dim">{groupLeads.length}</span>
                  <span className="text-[10px] text-prospex-dim ml-1 italic">— {g.help}</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {groupLeads.map((l, i) => renderCard(l, i, true))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Footer tip */}
      <div className="text-[10px] text-prospex-dim text-center py-2 flex items-center justify-center gap-1.5">
        <Sparkles className="w-2.5 h-2.5" /> Click a card to toggle selection · use bulk Fast IG / Fast WA to message all picked leads in one flow.
      </div>

      {/* Fast Blast modal — reuses the same channel-aware modal from /leads.
          blastLeads is set for single-lead quick-DM; falls back to selectedLeads. */}
      <BulkDmSendModal
        isOpen={blastChannel !== null}
        onClose={() => { setBlastChannel(null); setBlastLeads(null); }}
        channel={blastChannel || 'instagram'}
        leads={blastLeads || selectedLeads}
        onCompleted={() => { setBlastLeads(null); load(); }}
      />
    </div>
  );
}
