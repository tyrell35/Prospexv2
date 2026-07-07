// Hunt Mode scoring — Sections 6 + 11.3 of the spec merged.
// Server-only. Reads leads + hunt_enrichment + hunt_ad_intel and writes hunt_scores.

import { supabaseAdmin } from '@/lib/supabase-admin';

// ─── Sub-score primitives ───────────────────────────────

function tierScore(tierA: number, tierB: number): number {
  const a = Math.min(tierA, 2) * 30; // cap 60
  const b = Math.min(tierB, 2) * 15; // cap 30
  return a + b;
}

function adScore(active: boolean, days: number | null, count: number): number {
  let s = 0;
  if (active) s += 40;
  if (days !== null && days >= 60) s += 10;
  if (count >= 3) s += 10;
  return s;
}

function bookingScore(system: string | null): number {
  if (!system) return 0;
  if (['Zenoti', 'Pabau', 'Phorest', 'Aesthetic Nurse Software'].includes(system)) return 10;
  if (['Timely'].includes(system)) return 5;
  if (['Fresha', 'Calendly', 'Setmore', 'Square Appointments'].includes(system)) return 2;
  return 0;
}

function multiLocationScore(multi: boolean): number {
  return multi ? 15 : 0;
}

function instagramScore(followers: number | null): number {
  return followers && followers >= 5000 ? 5 : 0;
}

function penalty(input: {
  generic_kit_only: boolean;
  tier_a_count: number;
  tier_b_count: number;
  has_other_agency: boolean;
  fetch_ok: boolean;
  has_website: boolean;
}): number {
  let p = 0;
  if (input.generic_kit_only && input.tier_a_count === 0 && input.tier_b_count === 0) p += 40;
  if (input.has_other_agency) p += 20;
  if (!input.has_website || !input.fetch_ok) p += 30;
  return p;
}

// ─── Establishment Index (Section 11.3) ─────────────────

function bucketAdvertisingHistory(days_ago: number | null): number {
  if (days_ago === null) return 0;
  if (days_ago < 30) return 0;         // <1mo of history
  if (days_ago < 180) return 20;       // <6mo
  if (days_ago < 540) return 50;       // 6–18mo
  if (days_ago < 1095) return 80;      // 18mo–3yr
  return 100;
}

function bucketAge(years: number | null): number {
  if (years === null) return 0;
  if (years < 1) return 0;
  if (years < 2) return 30;
  if (years < 4) return 60;
  if (years < 7) return 85;
  return 100;
}

function bucketReviewDepth(reviews: number | null): number {
  const r = reviews ?? 0;
  if (r < 15) return 0;
  if (r < 40) return 30;
  if (r < 100) return 60;
  if (r < 250) return 85;
  return 100;
}

function bucketMultiLocation(multi: boolean): number {
  // Spec has 0 / 60 / 100 for single / 2 sites / 3+; we only know boolean today
  return multi ? 100 : 0;
}

function establishmentIndex(input: {
  isUK: boolean;
  first_ever_ad_date: string | null;
  incorporation_date: string | null;
  domain_created: string | null;
  google_review_count: number | null;
  multi_location: boolean;
}): number {
  const now = Date.now();
  const daysSince = (iso: string | null): number | null =>
    iso ? Math.floor((now - new Date(iso).getTime()) / (1000 * 60 * 60 * 24)) : null;
  const yearsSince = (iso: string | null): number | null => {
    const d = daysSince(iso);
    return d === null ? null : d / 365.25;
  };

  const advHist = bucketAdvertisingHistory(daysSince(input.first_ever_ad_date));
  const chAge = bucketAge(yearsSince(input.incorporation_date));
  const domAge = bucketAge(yearsSince(input.domain_created));
  const revDepth = bucketReviewDepth(input.google_review_count);
  const multi = bucketMultiLocation(input.multi_location);

  if (input.isUK) {
    return Math.round(advHist * 0.35 + chAge * 0.30 + revDepth * 0.25 + multi * 0.10);
  }
  return Math.round(advHist * 0.40 + domAge * 0.25 + revDepth * 0.25 + multi * 0.10);
}

// ─── Band assignment ────────────────────────────────────

function chooseBand(total: number, estIdx: number, company_status: string | null, isUK: boolean): 'hot' | 'warm' | 'cold' | 'disqualified' {
  // UK hard rules
  if (isUK && company_status && company_status !== 'active') return 'disqualified';
  if (estIdx < 30) return total >= 40 ? 'cold' : 'disqualified';
  if (total >= 110) return 'hot';
  if (total >= 75) return 'warm';
  if (total >= 40) return 'cold';
  return 'disqualified';
}

// ─── Public entry point ─────────────────────────────────

export interface ScoreResult {
  lead_id: string;
  device_score: number;
  ad_score: number;
  booking_score: number;
  established_score: number;
  establishment_index: number;
  longevity_score: number;
  penalty: number;
  total_score: number;
  band: 'hot' | 'warm' | 'cold' | 'disqualified';
}

interface LeadRow {
  id: string;
  business_name: string;
  country: string | null;
  website: string | null;
  seed_source: string | null;
}

interface EnrichmentRow {
  fetch_ok: boolean | null;
  tier_a_count: number | null;
  tier_b_count: number | null;
  generic_kit_only: boolean | null;
  booking_system: string | null;
  has_other_agency: boolean | null;
  google_rating: number | null;
  google_review_count: number | null;
  multi_location: boolean | null;
  instagram_followers: number | null;
  incorporation_date: string | null;
  company_status: string | null;
  domain_created: string | null;
}

interface AdIntelRow {
  ads_active: boolean | null;
  ad_count: number | null;
  ad_days_running: number | null;
  first_ever_ad_date: string | null;
}

export async function scoreLead(leadId: string): Promise<ScoreResult | null> {
  const [{ data: leadRaw }, { data: enRaw }, { data: adRaw }] = await Promise.all([
    supabaseAdmin.from('leads').select('id, business_name, country, website, seed_source').eq('id', leadId).maybeSingle(),
    supabaseAdmin.from('hunt_enrichment').select('fetch_ok, tier_a_count, tier_b_count, generic_kit_only, booking_system, has_other_agency, google_rating, google_review_count, multi_location, instagram_followers, incorporation_date, company_status, domain_created').eq('lead_id', leadId).maybeSingle(),
    supabaseAdmin.from('hunt_ad_intel').select('ads_active, ad_count, ad_days_running, first_ever_ad_date').eq('lead_id', leadId).maybeSingle(),
  ]);

  const lead = leadRaw as LeadRow | null;
  if (!lead) return null;
  const en = (enRaw || {}) as EnrichmentRow;
  const ad = (adRaw || {}) as AdIntelRow;

  const country = (lead.country || '').toLowerCase();
  const isUK = country.includes('kingdom') || country === 'gb' || country === 'uk';

  const device = tierScore(en.tier_a_count || 0, en.tier_b_count || 0);
  // ad_library seed_source auto-credits ads_active even if hunt_ad_intel is stale
  const activeAds = !!ad.ads_active || lead.seed_source === 'ad_library';
  const ads = adScore(activeAds, ad.ad_days_running, ad.ad_count || 0);
  const booking = bookingScore(en.booking_system);

  const pen = penalty({
    generic_kit_only: !!en.generic_kit_only,
    tier_a_count: en.tier_a_count || 0,
    tier_b_count: en.tier_b_count || 0,
    has_other_agency: !!en.has_other_agency,
    fetch_ok: en.fetch_ok !== false, // treat null as ok (haven't tried yet)
    has_website: !!lead.website,
  });

  const estIdx = establishmentIndex({
    isUK,
    first_ever_ad_date: ad.first_ever_ad_date,
    incorporation_date: en.incorporation_date,
    domain_created: en.domain_created,
    google_review_count: en.google_review_count,
    multi_location: !!en.multi_location,
  });

  // Long-form composite (Section 11 update to Section 6):
  //   total = device + ads + establishment_index*0.4 + booking - penalty
  const total = device + ads + Math.round(estIdx * 0.4) + booking - pen;

  // established_score column retained for backwards-compat visualization
  const established = Math.round(estIdx * 0.4);
  const longevity = ad.ad_days_running ? Math.min(20, Math.floor(ad.ad_days_running / 30) * 5) : 0;
  // multi-location/instagram flat bonuses still fold in
  const extras = multiLocationScore(!!en.multi_location) + instagramScore(en.instagram_followers);

  const totalWithExtras = total + extras;

  const band = chooseBand(totalWithExtras, estIdx, en.company_status || null, isUK);

  const row: ScoreResult = {
    lead_id: leadId,
    device_score: device,
    ad_score: ads,
    booking_score: booking,
    established_score: established + extras,
    establishment_index: estIdx,
    longevity_score: longevity,
    penalty: pen,
    total_score: totalWithExtras,
    band,
  };

  await supabaseAdmin.from('hunt_scores').upsert({
    ...row,
    scored_at: new Date().toISOString(),
  }, { onConflict: 'lead_id' });

  return row;
}

export async function scoreLeads(leadIds: string[]): Promise<ScoreResult[]> {
  const out: ScoreResult[] = [];
  for (const id of leadIds) {
    const r = await scoreLead(id);
    if (r) out.push(r);
  }
  return out;
}
