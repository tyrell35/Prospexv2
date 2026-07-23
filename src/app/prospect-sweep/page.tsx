'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import Link from 'next/link';
import {
  Microscope, Star, MapPin, RefreshCw, Loader2, Filter, Pin,
  Sparkles, Check, ChevronDown, ChevronRight, ExternalLink,
  AlertCircle, Trophy, Instagram, MessageCircle, Zap, XCircle,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { pickPrimaryDevice, getDeviceMeta, DEVICE_NICHE_MAP } from '@/lib/device-niche';

// ═══════════════════════════════════════════════════════
// PROSPECT SWEEP
//
// Comb the entire lead database, group leads by their DETECTED device
// (via hunt_enrichment.devices_found) or by their stored niche if no
// device data yet, and let the operator bulk-pin whole groups to the
// Hot List in one click. Also surfaces which leads' stored niche
// disagrees with what their devices imply, so the niche field can be
// corrected in bulk.
//
// This is a periodic triage tool — not the daily driver. Loads a few
// thousand leads at once, groups client-side, expects the operator to
// pin the good groups + move on.
// ═══════════════════════════════════════════════════════

type Region = 'UK' | 'US' | 'Canada' | 'All';
const REGION_MATCH: Record<Region, string[]> = {
  UK: ['United Kingdom', 'United Kingdom of Great Britain and Northern Ireland', 'UK'],
  US: ['United States', 'United States of America', 'USA', 'US'],
  Canada: ['Canada'],
  All: [],
};

interface LeadRow {
  id: string;
  business_name: string;
  niche: string | null;
  city: string | null;
  county: string | null;
  google_rating: number | null;
  google_review_count: number | null;
  hot_list_at: string | null;
  outreach_status: string | null;
  instagram_handle: string | null;
  instagram_url: string | null;
  phone: string | null;
}

interface EnrichedLead extends LeadRow {
  devices_found: string[] | null;
  tier_a_count: number;
  tier_b_count: number;
  primary_device: string | null;
  suggested_niche: string | null;
  niche_mismatch: boolean;
  // Enrichment state — used to skip websites that already failed to fetch
  // so re-runs don't burn API calls on dead sites.
  //   attempted    → has a row in hunt_enrichment (whether or not devices were found)
  //   fetch_failed → attempted AND fetch_ok=false (unreachable website)
  enrichment_attempted: boolean;
  fetch_failed: boolean;
}

interface Group {
  key: string;
  label: string;
  emoji: string;
  kind: 'device' | 'niche' | 'unclassified' | 'unreachable';
  suggestedNiche: string | null; // only set for device groups
  leads: EnrichedLead[];
  avgRating: number;
  avgReviews: number;
  mismatchCount: number; // how many in this group have niche != suggested_niche
}

export default function ProspectSweepPage() {
  const [region, setRegion] = useState<Region>('UK');
  const [minRating, setMinRating] = useState(4.5);
  const [minReviews, setMinReviews] = useState(50);
  const [excludePinned, setExcludePinned] = useState(true);
  const [excludeContacted, setExcludeContacted] = useState(true);
  const [leads, setLeads] = useState<EnrichedLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pinningKey, setPinningKey] = useState<string | null>(null);
  const [updatingNicheKey, setUpdatingNicheKey] = useState<string | null>(null);
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  // Enrichment progress state — used by both the top-level "Enrich all"
  // action and the per-group "Enrich this group" actions
  const [enrichRunning, setEnrichRunning] = useState(false);
  const [enrichCancel, setEnrichCancel] = useState<{ requested: boolean }>({ requested: false });
  const [enrichProgress, setEnrichProgress] = useState<{ done: number; total: number; devicesFound: number; label: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let q = supabase
        .from('leads')
        .select('id, business_name, niche, city, county, google_rating, google_review_count, hot_list_at, outreach_status, instagram_handle, instagram_url, phone, country')
        .gte('google_rating', minRating)
        .gte('google_review_count', minReviews)
        .or('instagram_handle.not.is.null,instagram_url.not.is.null,phone.not.is.null')
        .limit(5000);
      if (region !== 'All') q = q.in('country', REGION_MATCH[region]);
      if (excludePinned) q = q.is('hot_list_at', null);
      if (excludeContacted) q = q.not('outreach_status', 'in', '("contacted","responded","not_interested","booked")');

      const { data: leadRows, error: err1 } = await q;
      if (err1) throw err1;
      const rows = (leadRows || []) as LeadRow[];

      // Fetch enrichment for these leads. Chunked to avoid a monster IN() clause.
      const enrichmentMap = new Map<string, { devices_found: string[] | null; tier_a_count: number; tier_b_count: number; fetch_ok: boolean | null }>();
      const ids = rows.map(r => r.id);
      const CHUNK = 500;
      for (let i = 0; i < ids.length; i += CHUNK) {
        const chunk = ids.slice(i, i + CHUNK);
        const { data: enr } = await supabase
          .from('hunt_enrichment')
          .select('lead_id, devices_found, tier_a_count, tier_b_count, fetch_ok')
          .in('lead_id', chunk);
        for (const e of (enr || []) as Array<{ lead_id: string; devices_found: string[] | null; tier_a_count: number | null; tier_b_count: number | null; fetch_ok: boolean | null }>) {
          enrichmentMap.set(e.lead_id, {
            devices_found: e.devices_found,
            tier_a_count: e.tier_a_count || 0,
            tier_b_count: e.tier_b_count || 0,
            fetch_ok: e.fetch_ok,
          });
        }
      }

      const enriched: EnrichedLead[] = rows.map(r => {
        const en = enrichmentMap.get(r.id);
        const primary = pickPrimaryDevice(en?.devices_found);
        const suggested = primary ? getDeviceMeta(primary).niche : null;
        const mismatch = !!(primary && r.niche && suggested && !r.niche.toLowerCase().includes(suggested.toLowerCase()) && !suggested.toLowerCase().includes(r.niche.toLowerCase()));
        return {
          ...r,
          devices_found: en?.devices_found ?? null,
          tier_a_count: en?.tier_a_count ?? 0,
          tier_b_count: en?.tier_b_count ?? 0,
          primary_device: primary,
          suggested_niche: suggested,
          niche_mismatch: mismatch,
          enrichment_attempted: !!en,
          fetch_failed: !!en && en.fetch_ok === false,
        };
      });
      setLeads(enriched);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [region, minRating, minReviews, excludePinned, excludeContacted]);

  useEffect(() => { load(); }, [load]);

  // Build groups — device-first, then niche, then unclassified
  const groups = useMemo<Group[]>(() => {
    if (leads.length === 0) return [];
    const byDevice = new Map<string, EnrichedLead[]>();
    const byNiche = new Map<string, EnrichedLead[]>();
    const unclassified: EnrichedLead[] = [];
    const unreachable: EnrichedLead[] = [];

    for (const l of leads) {
      // Failed-fetch leads get their own bucket regardless of niche/device.
      // Prevents re-runs from wasting API calls on sites we already know are
      // unreachable, and lets the operator see the pile at a glance.
      if (l.fetch_failed) {
        unreachable.push(l);
        continue;
      }
      if (l.primary_device) {
        const k = l.primary_device;
        if (!byDevice.has(k)) byDevice.set(k, []);
        byDevice.get(k)!.push(l);
      } else if (l.niche) {
        const k = l.niche;
        if (!byNiche.has(k)) byNiche.set(k, []);
        byNiche.get(k)!.push(l);
      } else {
        unclassified.push(l);
      }
    }

    const build = (key: string, kind: Group['kind'], leadsInGroup: EnrichedLead[], label: string, emoji: string, suggestedNiche: string | null): Group => {
      const rated = leadsInGroup.filter(l => l.google_rating);
      const avgRating = rated.length > 0 ? rated.reduce((s, l) => s + (l.google_rating || 0), 0) / rated.length : 0;
      const avgReviews = leadsInGroup.reduce((s, l) => s + (l.google_review_count || 0), 0) / leadsInGroup.length;
      const mismatchCount = leadsInGroup.filter(l => l.niche_mismatch).length;
      return {
        key, label, emoji, kind, suggestedNiche,
        leads: leadsInGroup,
        avgRating: Math.round(avgRating * 10) / 10,
        avgReviews: Math.round(avgReviews),
        mismatchCount,
      };
    };

    const deviceGroups: Group[] = Array.from(byDevice.entries())
      .map(([device, ls]) => {
        const meta = getDeviceMeta(device);
        return build(`device:${device}`, 'device', ls, device, meta.emoji, meta.niche);
      })
      .sort((a, b) => b.leads.length - a.leads.length);

    const nicheGroups: Group[] = Array.from(byNiche.entries())
      .map(([niche, ls]) => build(`niche:${niche}`, 'niche', ls, niche, '📝', null))
      .sort((a, b) => b.leads.length - a.leads.length);

    const unclassGroups: Group[] = unclassified.length > 0
      ? [build('unclassified', 'unclassified', unclassified, 'No device + no niche', '❓', null)]
      : [];

    const unreachableGroups: Group[] = unreachable.length > 0
      ? [build('unreachable', 'unreachable', unreachable, 'Website unreachable (skipped from enrichment)', '❌', null)]
      : [];

    return [...deviceGroups, ...nicheGroups, ...unclassGroups, ...unreachableGroups];
  }, [leads]);

  const summary = useMemo(() => {
    const withDevice = leads.filter(l => l.primary_device).length;
    const withNiche = leads.filter(l => !l.primary_device && l.niche && !l.fetch_failed).length;
    const unclassified = leads.filter(l => !l.primary_device && !l.niche && !l.fetch_failed).length;
    const unreachable = leads.filter(l => l.fetch_failed).length;
    const totalMismatches = leads.filter(l => l.niche_mismatch).length;
    // enrichable = anything we haven't yet successfully fetched from
    // (i.e. never attempted). Fetch-failed leads are deliberately excluded
    // because we already know the site is dead.
    const enrichable = leads.filter(l => !l.enrichment_attempted).length;
    return { total: leads.length, withDevice, withNiche, unclassified, unreachable, totalMismatches, enrichable };
  }, [leads]);

  // ─── Bulk actions ─────────────────────────────
  const pinGroup = async (group: Group) => {
    if (!confirm(`Pin all ${group.leads.length} leads in "${group.label}" to your Hot List?`)) return;
    setPinningKey(group.key);
    setError(null);
    try {
      const now = new Date().toISOString();
      const ids = group.leads.filter(l => !l.hot_list_at).map(l => l.id);
      if (ids.length === 0) { setToast('All leads in this group are already pinned.'); return; }
      // Chunk updates to avoid IN() clause getting huge
      const CHUNK = 500;
      for (let i = 0; i < ids.length; i += CHUNK) {
        const chunk = ids.slice(i, i + CHUNK);
        await supabase.from('leads').update({ hot_list_at: now }).in('id', chunk);
      }
      setToast(`✓ Pinned ${ids.length} lead${ids.length === 1 ? '' : 's'} from "${group.label}" to Hot List.`);
      // Optimistic local update
      setLeads(prev => prev.map(l => ids.includes(l.id) ? { ...l, hot_list_at: now } : l));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Pin failed');
    } finally {
      setPinningKey(null);
      setTimeout(() => setToast(null), 4000);
    }
  };

  // ─── Batch enrichment ────────────────────────
  // Fires /api/hunt/enrich in chunks (each lead's website fetch is
  // ~5-10s serverside, so we batch small to stay within Vercel's function
  // timeout and to show visible progress). After each chunk completes,
  // we re-merge the fresh enrichment into local state without reloading
  // the whole page. Cancel button lets the operator stop mid-run.
  const enrichLeads = async (targetLeads: EnrichedLead[], contextLabel: string) => {
    // Skip:
    //  - leads that already have device data (nothing to gain)
    //  - leads whose fetch previously failed (site is dead; retrying wastes calls)
    const toEnrich = targetLeads.filter(l => !l.fetch_failed && (!l.devices_found || l.devices_found.length === 0));
    const skippedFailed = targetLeads.filter(l => l.fetch_failed).length;
    if (toEnrich.length === 0) {
      setToast(skippedFailed > 0
        ? `Nothing to enrich — ${skippedFailed} lead${skippedFailed === 1 ? '' : 's'} skipped (website previously unreachable).`
        : 'These leads are already enriched.');
      setTimeout(() => setToast(null), 4000);
      return;
    }
    const total = toEnrich.length;
    const estMinutes = Math.ceil(total * 8 / 60); // ~8s per lead average
    if (!confirm(`Enrich ${total} lead${total === 1 ? '' : 's'} from ${contextLabel}?\n\nEach lead's website is fetched + scanned for devices, booking system, and (UK) Companies House lookup. Runs serially — approx ${estMinutes} min${estMinutes === 1 ? '' : 's'} for ${total} lead${total === 1 ? '' : 's'}.\n\nYou can cancel mid-run.`)) return;

    const cancelToken = { requested: false };
    setEnrichCancel(cancelToken);
    setEnrichRunning(true);
    setEnrichProgress({ done: 0, total, devicesFound: 0, label: contextLabel });
    setError(null);

    // Chunk of 10 → each API call ~80s max, safely under Vercel's ~5min timeout
    const CHUNK_SIZE = 10;
    let devicesFound = 0;
    let done = 0;
    try {
      for (let i = 0; i < toEnrich.length; i += CHUNK_SIZE) {
        if (cancelToken.requested) break;
        const chunk = toEnrich.slice(i, i + CHUNK_SIZE);
        const res = await fetch('/api/hunt/enrich', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lead_ids: chunk.map(l => l.id), refetch: true }),
        });
        const json = await res.json();
        if (!res.ok || json.success === false) {
          throw new Error(json.error || `Enrichment chunk failed (HTTP ${res.status})`);
        }
        // Count devices found in this chunk (results[] has ok flag + device count)
        if (Array.isArray(json.results)) {
          devicesFound += json.results.filter((r: { ok: boolean; devices?: number }) => r.ok && (r.devices ?? 0) > 0).length;
        }
        done += chunk.length;
        setEnrichProgress({ done, total, devicesFound, label: contextLabel });
      }
      setToast(cancelToken.requested
        ? `⚠ Cancelled after ${done}/${total} enriched (${devicesFound} had devices detected).`
        : `✓ Enriched ${done} lead${done === 1 ? '' : 's'} · ${devicesFound} had devices detected.`);
      // Reload so new device data appears in groups
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Enrichment failed');
    } finally {
      setEnrichRunning(false);
      setEnrichProgress(null);
      setTimeout(() => setToast(null), 6000);
    }
  };

  // The three enrich entry points — same underlying batch runner
  const enrichAllUnenriched = () => {
    // Only leads never attempted OR attempted successfully with no devices.
    // Fetch-failed leads filtered inside enrichLeads() anyway; this makes
    // the intent explicit at the call site.
    const unenriched = leads.filter(l => !l.fetch_failed && (!l.devices_found || l.devices_found.length === 0));
    enrichLeads(unenriched, 'the full sweep');
  };
  const enrichGroup = (group: Group) => {
    enrichLeads(group.leads, `"${group.label}"`);
  };
  const cancelEnrich = () => {
    enrichCancel.requested = true;
    setToast('Cancelling after current batch…');
  };

  const updateGroupNiche = async (group: Group) => {
    if (!group.suggestedNiche || group.mismatchCount === 0) return;
    if (!confirm(`Update the niche field on ${group.mismatchCount} lead${group.mismatchCount === 1 ? '' : 's'} in "${group.label}" to "${group.suggestedNiche}"?\n\nThis only affects leads where the stored niche disagrees with the detected device.`)) return;
    setUpdatingNicheKey(group.key);
    setError(null);
    try {
      const ids = group.leads.filter(l => l.niche_mismatch).map(l => l.id);
      const CHUNK = 500;
      for (let i = 0; i < ids.length; i += CHUNK) {
        const chunk = ids.slice(i, i + CHUNK);
        await supabase.from('leads').update({ niche: group.suggestedNiche }).in('id', chunk);
      }
      setToast(`✓ Updated niche on ${ids.length} lead${ids.length === 1 ? '' : 's'} to "${group.suggestedNiche}".`);
      setLeads(prev => prev.map(l => ids.includes(l.id) ? { ...l, niche: group.suggestedNiche, niche_mismatch: false } : l));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Niche update failed');
    } finally {
      setUpdatingNicheKey(null);
      setTimeout(() => setToast(null), 4000);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-mono font-bold text-prospex-text flex items-center gap-3">
            <Microscope className="w-6 h-6 text-prospex-cyan" /> Prospect Sweep
          </h1>
          <p className="text-sm text-prospex-dim mt-1">
            Comb the entire database, group leads by detected device (or niche), bulk-pin to your Hot List in one click.
          </p>
        </div>
        <button onClick={load} className="btn-ghost text-xs min-h-[40px] md:min-h-0 w-fit">
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} Re-sweep
        </button>
      </div>

      {/* Filters */}
      <div className="card p-3 flex flex-wrap items-center gap-2">
        <Filter className="w-3.5 h-3.5 text-prospex-dim" />
        <div className="flex items-center gap-1">
          {(['UK', 'US', 'Canada', 'All'] as Region[]).map(r => (
            <button key={r} onClick={() => setRegion(r)}
              className={cn('text-[10px] px-2 py-1 rounded font-mono min-h-[32px]',
                region === r ? 'bg-prospex-cyan/20 text-prospex-cyan border border-prospex-cyan/30' : 'bg-prospex-bg text-prospex-dim hover:text-prospex-text')}>
              {r === 'UK' ? '🇬🇧 UK' : r === 'US' ? '🇺🇸 US' : r === 'Canada' ? '🇨🇦 CA' : '🌍 All'}
            </button>
          ))}
        </div>
        <div className="w-px h-4 bg-prospex-border mx-1" />
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
        <select value={minReviews} onChange={e => setMinReviews(parseInt(e.target.value))} className="input text-xs py-1.5 w-auto">
          <option value="25">25+ reviews</option>
          <option value="50">50+ reviews</option>
          <option value="100">100+ reviews</option>
          <option value="250">250+ reviews</option>
        </select>
        <div className="w-px h-4 bg-prospex-border mx-1" />
        <label className="flex items-center gap-1.5 text-[10px] font-mono text-prospex-muted cursor-pointer">
          <input type="checkbox" checked={excludePinned} onChange={e => setExcludePinned(e.target.checked)} className="accent-prospex-cyan" />
          Exclude pinned
        </label>
        <label className="flex items-center gap-1.5 text-[10px] font-mono text-prospex-muted cursor-pointer">
          <input type="checkbox" checked={excludeContacted} onChange={e => setExcludeContacted(e.target.checked)} className="accent-prospex-cyan" />
          Exclude contacted
        </label>
      </div>

      {/* Summary */}
      {!loading && leads.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          <div className="card p-3">
            <p className="text-[10px] font-mono text-prospex-dim uppercase">Total swept</p>
            <p className="text-2xl font-mono font-bold text-prospex-text">{summary.total}</p>
          </div>
          <div className="card p-3 border-prospex-cyan/30">
            <p className="text-[10px] font-mono text-prospex-dim uppercase">🔬 With devices</p>
            <p className="text-2xl font-mono font-bold text-prospex-cyan">{summary.withDevice}</p>
          </div>
          <div className="card p-3">
            <p className="text-[10px] font-mono text-prospex-dim uppercase">📝 Niche only</p>
            <p className="text-2xl font-mono font-bold text-prospex-muted">{summary.withNiche}</p>
          </div>
          <div className={cn('card p-3', summary.totalMismatches > 0 && 'border-amber-500/30')}>
            <p className="text-[10px] font-mono text-prospex-dim uppercase">⚠ Mismatches</p>
            <p className="text-2xl font-mono font-bold text-amber-400">{summary.totalMismatches}</p>
          </div>
          <div className={cn('card p-3', summary.unreachable > 0 && 'border-prospex-red/30')}>
            <p className="text-[10px] font-mono text-prospex-dim uppercase" title="Websites we previously tried to fetch and failed. Skipped from future enrichment.">❌ Unreachable</p>
            <p className="text-2xl font-mono font-bold text-prospex-red/80">{summary.unreachable}</p>
          </div>
        </div>
      )}

      {/* Top-level enrich CTA — appears when there are leads that haven't been
          enrichment-attempted yet. Fetch-failed leads intentionally excluded
          from the count so the number matches what "Enrich all" actually acts on. */}
      {!loading && !enrichRunning && summary.enrichable > 0 && (
        <div className="card p-3 border-amber-500/30 bg-amber-500/5 flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-mono text-amber-400">
              🔬 {summary.enrichable.toLocaleString()} lead{summary.enrichable === 1 ? '' : 's'} in this sweep have no device data yet
            </p>
            <p className="text-[10px] text-prospex-dim mt-0.5">
              Enrich them now to unlock device grouping. Runs serially — approx {Math.ceil(summary.enrichable * 8 / 60)} min for the full batch. Cancel anytime.
              {summary.unreachable > 0 && <> · <span className="text-prospex-red/80">{summary.unreachable} known-unreachable lead{summary.unreachable === 1 ? '' : 's'} skipped automatically.</span></>}
            </p>
          </div>
          <button onClick={enrichAllUnenriched}
            className="btn text-xs md:text-sm bg-amber-500/20 text-amber-400 border border-amber-500/40 hover:bg-amber-500/30 min-h-[40px]">
            <Zap className="w-4 h-4 md:w-3.5 md:h-3.5" /> Enrich all {summary.enrichable}
          </button>
        </div>
      )}

      {/* Live enrichment progress */}
      {enrichRunning && enrichProgress && (
        <div className="card p-3 border-prospex-cyan/40 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <Loader2 className="w-4 h-4 text-prospex-cyan animate-spin flex-shrink-0" />
              <p className="text-xs font-mono text-prospex-text truncate">
                Enriching {enrichProgress.done} / {enrichProgress.total} from {enrichProgress.label}
              </p>
            </div>
            <button onClick={cancelEnrich} className="text-xs text-prospex-dim hover:text-prospex-red flex items-center gap-1 min-h-[32px] px-2 flex-shrink-0">
              <XCircle className="w-3.5 h-3.5" /> Cancel
            </button>
          </div>
          <div className="w-full h-1.5 bg-prospex-bg rounded-full overflow-hidden">
            <div className="h-full bg-prospex-cyan transition-all" style={{ width: `${(enrichProgress.done / enrichProgress.total) * 100}%` }} />
          </div>
          <p className="text-[10px] text-prospex-dim">
            {enrichProgress.devicesFound > 0 && `🔬 ${enrichProgress.devicesFound} devices detected so far · `}
            page will refresh when complete
          </p>
        </div>
      )}

      {toast && <div className="card p-2 text-xs text-prospex-cyan border-prospex-cyan/40">{toast}</div>}
      {error && <div className="card p-2 text-xs text-prospex-red border-prospex-red/40">{error}</div>}

      {/* Groups */}
      {loading ? (
        <div className="card p-12 text-center">
          <Loader2 className="w-6 h-6 animate-spin text-prospex-cyan mx-auto" />
          <p className="text-xs text-prospex-dim mt-3">Sweeping the database…</p>
        </div>
      ) : groups.length === 0 ? (
        <div className="card p-12 text-center">
          <Trophy className="w-8 h-8 text-prospex-dim mx-auto mb-3" />
          <p className="text-sm text-prospex-muted">No leads match the sweep criteria.</p>
          <p className="text-[11px] text-prospex-dim mt-1">Try loosening the rating / review floor, or turn off "Exclude pinned".</p>
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map(g => {
            const isExpanded = expandedGroup === g.key;
            const isPinning = pinningKey === g.key;
            const isUpdatingNiche = updatingNicheKey === g.key;
            const kindClass = g.kind === 'device' ? 'border-prospex-cyan/30 bg-prospex-cyan/5'
              : g.kind === 'niche' ? 'border-prospex-border'
              : g.kind === 'unreachable' ? 'border-prospex-red/30 bg-prospex-red/5'
              : 'border-amber-500/30 bg-amber-500/5';
            return (
              <div key={g.key} className={cn('card border', kindClass)}>
                <div className="p-3">
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xl">{g.emoji}</span>
                        <h3 className="text-base font-mono font-bold text-prospex-text truncate">{g.label}</h3>
                        <span className="text-[11px] font-mono text-prospex-dim">· {g.leads.length} leads</span>
                        {g.kind === 'device' && g.suggestedNiche && (
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-prospex-cyan/30 bg-prospex-cyan/10 text-prospex-cyan">
                            → niche: {g.suggestedNiche}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 flex-wrap text-[11px] text-prospex-dim mt-1.5">
                        <span className="flex items-center gap-1 text-amber-400">
                          <Star className="w-3 h-3 fill-amber-400" /> {g.avgRating || '—'} avg
                        </span>
                        <span>{g.avgReviews.toLocaleString()} avg reviews</span>
                        {g.mismatchCount > 0 && (
                          <span className="text-amber-400 flex items-center gap-1">
                            <AlertCircle className="w-3 h-3" /> {g.mismatchCount} niche mismatch{g.mismatchCount === 1 ? '' : 'es'}
                          </span>
                        )}
                      </div>
                    </div>
                    <button onClick={() => setExpandedGroup(isExpanded ? null : g.key)}
                      className="text-prospex-dim hover:text-prospex-text p-2 min-w-[36px] min-h-[36px] flex items-center justify-center">
                      {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    </button>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 flex-wrap mt-3">
                    <button onClick={() => pinGroup(g)} disabled={isPinning}
                      className="btn text-sm md:text-xs bg-orange-500/20 text-orange-400 border border-orange-500/40 hover:bg-orange-500/30 min-h-[40px] disabled:opacity-50">
                      {isPinning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Pin className="w-3.5 h-3.5" />}
                      Pin all {g.leads.length} to Hot List
                    </button>
                    {g.kind === 'device' && g.mismatchCount > 0 && (
                      <button onClick={() => updateGroupNiche(g)} disabled={isUpdatingNiche}
                        className="btn text-sm md:text-xs bg-amber-500/10 text-amber-400 border border-amber-500/30 hover:bg-amber-500/20 min-h-[40px] disabled:opacity-50">
                        {isUpdatingNiche ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                        Fix niche on {g.mismatchCount}
                      </button>
                    )}
                    {/* Enrich this group — appears on niche + unclassified groups
                        where devices haven't been detected yet. */}
                    {(g.kind === 'niche' || g.kind === 'unclassified') && !enrichRunning && (
                      <button onClick={() => enrichGroup(g)}
                        className="btn text-sm md:text-xs bg-prospex-cyan/10 text-prospex-cyan border border-prospex-cyan/30 hover:bg-prospex-cyan/20 min-h-[40px]">
                        <Zap className="w-3.5 h-3.5" /> Enrich {g.leads.length}
                      </button>
                    )}
                  </div>
                </div>

                {/* Expanded lead list */}
                {isExpanded && (
                  <div className="border-t border-prospex-border/50 bg-prospex-bg/40 max-h-96 overflow-y-auto">
                    {g.leads.slice(0, 100).map(l => {
                      const hasIg = !!(l.instagram_handle || l.instagram_url);
                      const hasWa = !!l.phone;
                      return (
                        <div key={l.id} className="px-3 py-2 border-b border-prospex-border/20 last:border-0 flex items-center gap-2">
                          <div className="min-w-0 flex-1">
                            <Link href={`/leads/${l.id}`} className="text-xs font-mono text-prospex-cyan hover:underline truncate block">
                              {l.business_name}
                            </Link>
                            <div className="flex items-center gap-2 text-[10px] text-prospex-dim flex-wrap">
                              <span className="flex items-center gap-0.5"><MapPin className="w-2.5 h-2.5" /> {l.city || '—'}</span>
                              {l.google_rating && <span className="flex items-center gap-0.5 text-amber-400"><Star className="w-2.5 h-2.5 fill-amber-400" /> {l.google_rating.toFixed(1)} ({l.google_review_count})</span>}
                              {l.niche_mismatch && <span className="text-amber-400 text-[9px]">niche: {l.niche}</span>}
                              {l.hot_list_at && <span className="text-orange-400 text-[9px] flex items-center gap-0.5"><Pin className="w-2 h-2 fill-orange-400" /> pinned</span>}
                            </div>
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            {hasIg && <Instagram className="w-3 h-3 text-pink-400" />}
                            {hasWa && <MessageCircle className="w-3 h-3 text-green-400" />}
                            <Link href={`/leads/${l.id}`} className="text-prospex-dim hover:text-prospex-text p-1.5">
                              <ExternalLink className="w-3 h-3" />
                            </Link>
                          </div>
                        </div>
                      );
                    })}
                    {g.leads.length > 100 && (
                      <p className="text-[10px] text-prospex-dim text-center py-2">
                        + {g.leads.length - 100} more not shown (Pin all still covers everything).
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Footer hint */}
      <div className="text-[10px] text-prospex-dim text-center py-2 flex items-center justify-center gap-1.5 flex-wrap">
        <Check className="w-2.5 h-2.5" /> Pinned leads land in <Link href="/hotlist" className="text-orange-400 underline">Hot List → My Pipeline</Link> for nurturing.
      </div>
    </div>
  );
}

// Expose the device map size in the console for debugging — remove if noisy
if (typeof window !== 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-unused-expressions
  DEVICE_NICHE_MAP;
}
