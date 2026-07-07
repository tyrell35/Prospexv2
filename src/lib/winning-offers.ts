// Winning Offer Detector — Section 11.2 of the Hunt Mode spec.
// Extracts an offer signature per ad and computes WOS per (country, treatment,
// signature) from ad_snapshots time-series data.

import { supabaseAdmin } from '@/lib/supabase-admin';
import { loadDeviceKeywords } from '@/lib/hunt';

// ─── Offer mechanic patterns ────────────────────────────

export type OfferMechanic =
  | 'price_anchor'
  | 'deposit_lock'
  | 'free_hook'
  | 'guarantee'
  | 'scarcity'
  | 'quiz_leadmagnet'
  | 'other';

const MECHANIC_PATTERNS: Array<{ mechanic: OfferMechanic; regex: RegExp }> = [
  { mechanic: 'price_anchor',    regex: /(£|\$|€)\s*\d/i },
  { mechanic: 'price_anchor',    regex: /\bfrom\s+(£|\$|€)/i },
  { mechanic: 'price_anchor',    regex: /\d+\s*(sessions?|treatments?)/i },
  { mechanic: 'deposit_lock',    regex: /\b(deposit|secure your spot|reserve|pay a deposit)\b/i },
  { mechanic: 'free_hook',       regex: /\bfree\s+(consultation|patch\s*test|trial|assessment|scan|analysis)\b/i },
  { mechanic: 'guarantee',       regex: /\b(guarantee|guaranteed|results or|money back|refund)\b/i },
  { mechanic: 'scarcity',        regex: /\b(this month|limited (time|spots|slots)|only \d+|last chance|hurry)\b/i },
  { mechanic: 'quiz_leadmagnet', regex: /\b(quiz|take the|instant price|info guide|free ebook|checklist)\b/i },
];

// ─── Signature builder ──────────────────────────────────

export interface OfferSignature {
  treatment: string;         // matched from device_keywords
  mechanic: OfferMechanic;
  signature: string;         // normalized string used as the join key
}

function normaliseText(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9£$€\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function classifyMechanic(text: string): OfferMechanic {
  for (const p of MECHANIC_PATTERNS) if (p.regex.test(text)) return p.mechanic;
  return 'other';
}

/**
 * Extract a treatment + mechanic signature from ad copy. Returns null if we
 * can't identify a device/treatment keyword — those ads are ignored.
 */
export async function extractSignature(text: string): Promise<OfferSignature | null> {
  const clean = normaliseText(text);
  if (!clean) return null;
  const devices = await loadDeviceKeywords();
  let matched: string | null = null;
  for (const d of devices) {
    if (d.tier === 'C') continue;
    for (const alias of d.aliases) {
      const needle = ' ' + normaliseText(alias) + ' ';
      if ((' ' + clean + ' ').includes(needle)) { matched = d.device_name; break; }
    }
    if (matched) break;
  }
  if (!matched) return null;
  const mechanic = classifyMechanic(clean);
  return { treatment: matched, mechanic, signature: `${matched.toLowerCase().replace(/\s+/g, '_')}::${mechanic}` };
}

// ─── WOS computation ────────────────────────────────────

interface SnapshotRow {
  fb_page_id: string;
  snapshot_date: string;
  treatment_keywords: string[] | null;
  offer_signature: string | null;
  country: string | null;
  ad_ids: string[] | null;
}

/**
 * Backfill offer_signature onto ad_snapshots that don't have one yet, using
 * the currently active hunt_ad_intel.ad_copy_samples as the ad-copy source.
 * Idempotent — only writes where offer_signature is null.
 */
export async function backfillSignatures(limit = 500): Promise<{ updated: number; scanned: number }> {
  const { data } = await supabaseAdmin
    .from('ad_snapshots')
    .select('id, fb_page_id, snapshot_date')
    .is('offer_signature', null)
    .limit(limit);
  const rows = (data || []) as Array<{ id: number; fb_page_id: string; snapshot_date: string }>;
  if (rows.length === 0) return { updated: 0, scanned: 0 };

  // Batch-fetch ad_copy_samples for these fb_page_ids
  const pageIds = Array.from(new Set(rows.map(r => r.fb_page_id)));
  const { data: intel } = await supabaseAdmin
    .from('hunt_ad_intel')
    .select('lead_id, ad_copy_samples')
    .in('lead_id', await pageIdsToLeadIds(pageIds));

  // Build a page_id → ad-copy-blob lookup by going lead_id → fb_page_id via hunt_enrichment
  const { data: enrich } = await supabaseAdmin
    .from('hunt_enrichment')
    .select('lead_id, fb_page_id')
    .in('fb_page_id', pageIds);
  const leadToPage = new Map<string, string>();
  for (const e of (enrich || []) as Array<{ lead_id: string; fb_page_id: string }>) leadToPage.set(e.lead_id, e.fb_page_id);
  const pageToBlob = new Map<string, string>();
  for (const r of (intel || []) as Array<{ lead_id: string; ad_copy_samples: Array<{ title?: string; body?: string }> | null }>) {
    const page = leadToPage.get(r.lead_id);
    if (!page) continue;
    const parts = (r.ad_copy_samples || []).flatMap(s => [s.title, s.body]).filter(Boolean).join(' ');
    if (parts) pageToBlob.set(page, parts);
  }

  let updated = 0;
  for (const row of rows) {
    const blob = pageToBlob.get(row.fb_page_id);
    if (!blob) continue;
    const sig = await extractSignature(blob);
    if (!sig) continue;
    await supabaseAdmin
      .from('ad_snapshots')
      .update({ offer_signature: sig.signature, treatment_keywords: [sig.treatment] })
      .eq('id', row.id);
    updated++;
  }

  return { updated, scanned: rows.length };
}

async function pageIdsToLeadIds(pageIds: string[]): Promise<string[]> {
  const { data } = await supabaseAdmin
    .from('hunt_enrichment')
    .select('lead_id, fb_page_id')
    .in('fb_page_id', pageIds);
  return ((data || []) as Array<{ lead_id: string }>).map(r => r.lead_id);
}

/**
 * Recompute winning_offers from the current ad_snapshots table. For each
 * (country, treatment, signature) trio it derives median/max survival days,
 * distinct pages, and variant count, then produces the WOS.
 */
export async function computeWinningOffers(): Promise<{ recomputed: number }> {
  // Load all snapshots that have an offer_signature
  const { data } = await supabaseAdmin
    .from('ad_snapshots')
    .select('fb_page_id, snapshot_date, treatment_keywords, offer_signature, country, ad_ids')
    .not('offer_signature', 'is', null)
    .limit(50000);
  const snaps = (data || []) as SnapshotRow[];
  if (snaps.length === 0) return { recomputed: 0 };

  // Group snapshots per fb_page_id + signature → derive per-page survival
  interface Bucket {
    country: string;
    treatment: string;
    signature: string;
    perPage: Map<string, { first: string; last: string; adIds: Set<string> }>;
  }
  const byKey = new Map<string, Bucket>();
  for (const s of snaps) {
    if (!s.offer_signature || !s.treatment_keywords || s.treatment_keywords.length === 0) continue;
    const treatment = s.treatment_keywords[0];
    const country = s.country || 'GB';
    const key = `${country}::${treatment}::${s.offer_signature}`;
    let b = byKey.get(key);
    if (!b) { b = { country, treatment, signature: s.offer_signature, perPage: new Map() }; byKey.set(key, b); }
    const page = b.perPage.get(s.fb_page_id) || { first: s.snapshot_date, last: s.snapshot_date, adIds: new Set<string>() };
    if (s.snapshot_date < page.first) page.first = s.snapshot_date;
    if (s.snapshot_date > page.last) page.last = s.snapshot_date;
    for (const id of s.ad_ids || []) page.adIds.add(id);
    b.perPage.set(s.fb_page_id, page);
  }

  const now = new Date();
  const upserts: Array<{
    country: string; treatment: string; offer_signature: string; mechanic: string;
    median_survival_days: number; max_survival_days: number;
    distinct_pages: number; variant_count: number; wos: number;
    example_snapshot_urls: string[]; computed_at: string;
  }> = [];

  for (const [, b] of byKey) {
    const survivals: number[] = [];
    let maxSurv = 0;
    let totalVariants = 0;
    for (const [, p] of b.perPage) {
      const first = new Date(p.first).getTime();
      const last = new Date(p.last).getTime();
      const surv = Math.max(1, Math.floor((last - first) / (1000 * 60 * 60 * 24)) + 1);
      survivals.push(surv);
      if (surv > maxSurv) maxSurv = surv;
      totalVariants += Math.max(1, p.adIds.size);
    }
    survivals.sort((a, b) => a - b);
    const median = survivals[Math.floor(survivals.length / 2)] || 0;
    const distinct = b.perPage.size;
    const mechanic = b.signature.split('::')[1] || 'other';
    const wos = median * 0.5 + maxSurv * 0.2 + distinct * 15 + totalVariants * 5;

    upserts.push({
      country: b.country,
      treatment: b.treatment,
      offer_signature: b.signature,
      mechanic,
      median_survival_days: median,
      max_survival_days: maxSurv,
      distinct_pages: distinct,
      variant_count: totalVariants,
      wos: Math.round(wos * 100) / 100,
      example_snapshot_urls: [],
      computed_at: now.toISOString(),
    });
  }

  // Chunked upsert
  const CHUNK = 200;
  for (let i = 0; i < upserts.length; i += CHUNK) {
    await supabaseAdmin.from('winning_offers').upsert(
      upserts.slice(i, i + CHUNK),
      { onConflict: 'country,treatment,offer_signature' },
    );
  }

  return { recomputed: upserts.length };
}
