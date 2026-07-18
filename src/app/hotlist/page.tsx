'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import {
  Flame, Star, MessageCircle, Instagram, MapPin, RefreshCw, Loader2, Filter,
  Sparkles, Trophy, Rocket, TrendingUp, Award, ExternalLink,
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
  const [region, setRegion] = useState<Region>('UK');
  const [niche, setNiche] = useState<string>('');
  const [uniqueNiches, setUniqueNiches] = useState<string[]>([]);
  const [minReviews, setMinReviews] = useState<number>(50);
  const [minRating, setMinRating] = useState<number>(4.5);
  const [leads, setLeads] = useState<HotLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [blastChannel, setBlastChannel] = useState<null | 'instagram' | 'whatsapp'>(null);

  // Load niche options once
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('leads').select('niche').not('niche', 'is', null);
      const niches = [...new Set((data || []).map(d => d.niche).filter(Boolean))].sort();
      setUniqueNiches(niches);
    })();
  }, []);

  // Load top leads whenever filters change
  const load = async () => {
    setLoading(true);
    try {
      let q = supabase
        .from('leads')
        .select('*')
        .gte('google_rating', minRating)
        .gte('google_review_count', minReviews)
        .not('outreach_status', 'in', '("contacted","responded","not_interested","booked")')
        // Needs at least one messageable channel
        .or('instagram_handle.not.is.null,instagram_url.not.is.null,phone.not.is.null')
        // Rank by score proxy: rating × reviews (proper score computed client-side after fetch)
        .order('google_review_count', { ascending: false })
        .limit(200);
      if (region !== 'All') q = q.in('country', REGION_MATCH[region]);
      if (niche) q = q.eq('niche', niche);
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

      scored.sort((a, b) => b.score - a.score);
      setLeads(scored.slice(0, 30));
      setSelectedIds(new Set(scored.slice(0, 30).map(l => l.id)));
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [region, niche, minRating, minReviews]);

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

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-mono font-bold text-prospex-text flex items-center gap-3">
            <Flame className="w-6 h-6 text-orange-400" /> Hot List
          </h1>
          <p className="text-sm text-prospex-dim mt-1">
            Top established clinics ready to message · ranked by rating × reviews × device tier · excludes already-contacted.
          </p>
        </div>
        <button onClick={load} className="btn-ghost text-xs w-fit">
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="card p-3 flex flex-wrap items-center gap-2">
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
      </div>

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

      {/* Leads grid */}
      {loading && leads.length === 0 ? (
        <div className="card p-12 text-center"><Loader2 className="w-6 h-6 animate-spin text-orange-400 mx-auto" /></div>
      ) : leads.length === 0 ? (
        <div className="card p-12 text-center">
          <Trophy className="w-8 h-8 text-prospex-dim mx-auto mb-3" />
          <p className="text-sm text-prospex-muted">No hot clinics match these filters.</p>
          <p className="text-[11px] text-prospex-dim mt-1">Try lowering the rating/review threshold, or switch region.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {leads.map((l, i) => {
            const isSelected = selectedIds.has(l.id);
            const hasIg = !!(l.instagram_handle || l.instagram_url);
            const hasWa = !!l.phone;
            const rankBadge = i < 3 ? ['🥇', '🥈', '🥉'][i] : `#${i + 1}`;
            return (
              <div key={l.id} onClick={() => toggleSelect(l.id)}
                className={cn(
                  'card p-3 cursor-pointer transition-all',
                  isSelected ? 'border-orange-500/50 bg-orange-500/5' : 'hover:border-prospex-cyan/30'
                )}>
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="text-[11px] font-mono text-orange-400 flex-shrink-0">{rankBadge}</span>
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
                  <div className="flex-shrink-0 text-right">
                    <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(l.id)}
                      onClick={e => e.stopPropagation()}
                      className="rounded border-orange-500/40 bg-prospex-bg accent-orange-400" />
                    <p className="text-[9px] font-mono text-prospex-dim mt-1">score {l.score}</p>
                  </div>
                </div>

                {/* Device chip + channel availability */}
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
                  <div className="ml-auto flex items-center gap-1">
                    {hasIg && (
                      <span className="text-[9px] font-mono px-1.5 py-0.5 rounded border border-pink-500/30 bg-pink-500/10 text-pink-400 flex items-center gap-1">
                        <Instagram className="w-2.5 h-2.5" /> IG
                      </span>
                    )}
                    {hasWa && (
                      <span className="text-[9px] font-mono px-1.5 py-0.5 rounded border border-green-500/30 bg-green-500/10 text-green-400 flex items-center gap-1">
                        <MessageCircle className="w-2.5 h-2.5" /> WA
                      </span>
                    )}
                    <Link href={`/leads/${l.id}`} onClick={e => e.stopPropagation()}
                      className="text-[9px] text-prospex-dim hover:text-prospex-text flex items-center gap-0.5" title="Open full lead page">
                      <ExternalLink className="w-2.5 h-2.5" />
                    </Link>
                  </div>
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

      {/* Fast Blast modal — reuses the same channel-aware modal from /leads */}
      <BulkDmSendModal
        isOpen={blastChannel !== null}
        onClose={() => setBlastChannel(null)}
        channel={blastChannel || 'instagram'}
        leads={selectedLeads}
        onCompleted={() => { load(); }}
      />
    </div>
  );
}
