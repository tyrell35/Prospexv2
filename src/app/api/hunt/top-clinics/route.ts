import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { authOr401 } from '@/lib/api-auth';

// ═══════════════════════════════════════════════════════
// /api/hunt/top-clinics
// Ranks the enriched + scored leads down to the ~5% worth personal outreach,
// grouped by city. Uses progressive relaxation so a city with a small pool
// still gets N candidates back (with a badge showing which criteria relaxed).
//
// Query params (GET):
//   country=GB|US|CA|all                  default: all
//   city=London                           optional exact match
//   per_city=10                            top N per city (default 10)
//   min=5                                  minimum candidates per city before
//                                          relaxing thresholds (default 5)
//   include_agency=true                    include has_other_agency leads
//                                          (for switch-pitch runs)
// ═══════════════════════════════════════════════════════

interface Row {
  lead_id: string;
  business_name: string;
  city: string | null;
  country: string | null;
  website: string | null;
  seed_source: string | null;
  ghl_contact_id: string | null;
  email: string | null;
  phone: string | null;
  phone_formatted: string | null;
  instagram_handle: string | null;
  instagram_url: string | null;

  band: string | null;
  total_score: number | null;
  establishment_index: number | null;

  devices_found: string[] | null;
  tier_a_count: number | null;
  tier_b_count: number | null;
  booking_system: string | null;
  google_review_count: number | null;
  google_rating: number | null;
  has_other_agency: boolean | null;
  company_status: string | null;

  ads_active: boolean | null;
  ad_count: number | null;
  ad_days_running: number | null;
  library_url: string | null;

  // Populated by this route
  strictness: 'strict' | 'relaxed_reviews' | 'relaxed_estidx' | 'relaxed_both';
  suggested_template: 'top_tier_no_ads' | 'top_tier_with_ads' | 'top_tier_multi_device';
}

interface Criteria {
  min_reviews: number;
  min_est_idx: number;
  require_tier_a: boolean;
  include_agency: boolean;
}

const STRICT: Criteria = { min_reviews: 40, min_est_idx: 60, require_tier_a: true, include_agency: false };
const RELAX_1: Criteria = { min_reviews: 20, min_est_idx: 60, require_tier_a: true, include_agency: false };
const RELAX_2: Criteria = { min_reviews: 40, min_est_idx: 40, require_tier_a: true, include_agency: false };
const RELAX_3: Criteria = { min_reviews: 15, min_est_idx: 40, require_tier_a: false, include_agency: false };

function passes(row: Omit<Row, 'strictness' | 'suggested_template'>, c: Criteria): boolean {
  const reviews = row.google_review_count || 0;
  const estIdx = row.establishment_index ?? 0;
  const tierA = row.tier_a_count || 0;
  const cs = (row.company_status || '').toLowerCase();
  // UK hard rule: dissolved / liquidation companies excluded
  if (cs && cs !== 'active') return false;
  if (row.has_other_agency && !c.include_agency) return false;
  if (reviews < c.min_reviews) return false;
  if (estIdx < c.min_est_idx) return false;
  if (c.require_tier_a && tierA < 1) return false;
  return true;
}

function pickTemplate(row: Omit<Row, 'strictness' | 'suggested_template'>): Row['suggested_template'] {
  const tierA = row.tier_a_count || 0;
  const tierB = row.tier_b_count || 0;
  if (tierA + tierB >= 3) return 'top_tier_multi_device';
  if (row.ads_active) return 'top_tier_with_ads';
  return 'top_tier_no_ads';
}

const SELECT = `
  lead_id, total_score, band, establishment_index,
  lead:lead_id (
    business_name, city, country, website, seed_source, ghl_contact_id,
    email, phone, phone_formatted, instagram_handle, instagram_url
  ),
  enrichment:hunt_enrichment!lead_id (
    devices_found, tier_a_count, tier_b_count, booking_system,
    google_review_count, google_rating, has_other_agency, company_status
  ),
  intel:hunt_ad_intel!lead_id (ads_active, ad_count, ad_days_running, library_url)
`;

export async function GET(request: NextRequest) {
  const auth = await authOr401();
  if (auth instanceof NextResponse) return auth;

  const url = new URL(request.url);
  const country = url.searchParams.get('country') || 'all';
  const cityFilter = url.searchParams.get('city');
  const perCity = Math.min(50, parseInt(url.searchParams.get('per_city') || '10', 10));
  const minPerCity = Math.min(perCity, parseInt(url.searchParams.get('min') || '5', 10));
  const includeAgency = url.searchParams.get('include_agency') === 'true';

  // Fetch a wide superset of scored leads, then filter in JS so we can apply
  // progressive relaxation per city.
  let q = supabaseAdmin.from('hunt_scores').select(SELECT).order('total_score', { ascending: false }).limit(2000);
  const { data: raw, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  interface JoinedRaw {
    lead_id: string;
    total_score: number | null;
    band: string | null;
    establishment_index: number | null;
    lead: {
      business_name: string;
      city: string | null;
      country: string | null;
      website: string | null;
      seed_source: string | null;
      ghl_contact_id: string | null;
      email: string | null;
      phone: string | null;
      phone_formatted: string | null;
      instagram_handle: string | null;
      instagram_url: string | null;
    } | null;
    enrichment: {
      devices_found: string[] | null;
      tier_a_count: number | null;
      tier_b_count: number | null;
      booking_system: string | null;
      google_review_count: number | null;
      google_rating: number | null;
      has_other_agency: boolean | null;
      company_status: string | null;
    } | null;
    intel: {
      ads_active: boolean | null;
      ad_count: number | null;
      ad_days_running: number | null;
      library_url: string | null;
    } | null;
  }

  const rows: Omit<Row, 'strictness' | 'suggested_template'>[] = ((raw || []) as unknown as JoinedRaw[])
    .filter(r => r.lead)
    .map(r => ({
      lead_id: r.lead_id,
      business_name: r.lead!.business_name,
      city: r.lead!.city,
      country: r.lead!.country,
      website: r.lead!.website,
      seed_source: r.lead!.seed_source,
      ghl_contact_id: r.lead!.ghl_contact_id,
      email: r.lead!.email,
      phone: r.lead!.phone,
      phone_formatted: r.lead!.phone_formatted,
      instagram_handle: r.lead!.instagram_handle,
      instagram_url: r.lead!.instagram_url,

      band: r.band,
      total_score: r.total_score,
      establishment_index: r.establishment_index,

      devices_found: r.enrichment?.devices_found ?? null,
      tier_a_count: r.enrichment?.tier_a_count ?? null,
      tier_b_count: r.enrichment?.tier_b_count ?? null,
      booking_system: r.enrichment?.booking_system ?? null,
      google_review_count: r.enrichment?.google_review_count ?? null,
      google_rating: r.enrichment?.google_rating ?? null,
      has_other_agency: r.enrichment?.has_other_agency ?? null,
      company_status: r.enrichment?.company_status ?? null,

      ads_active: r.intel?.ads_active ?? null,
      ad_count: r.intel?.ad_count ?? null,
      ad_days_running: r.intel?.ad_days_running ?? null,
      library_url: r.intel?.library_url ?? null,
    }))
    // Country filter
    .filter(r => {
      if (country === 'all') return true;
      const c = (r.country || '').toLowerCase();
      if (country === 'GB') return c.includes('kingdom') || c === 'gb' || c === 'uk';
      if (country === 'US') return c.includes('states') || c === 'us' || c === 'usa';
      if (country === 'CA') return c.includes('canada') || c === 'ca';
      return true;
    })
    .filter(r => !cityFilter || (r.city || '').toLowerCase() === cityFilter.toLowerCase());

  // Group by city and progressively relax
  const byCity = new Map<string, Omit<Row, 'strictness' | 'suggested_template'>[]>();
  for (const r of rows) {
    const key = r.city || 'Unknown';
    if (!byCity.has(key)) byCity.set(key, []);
    byCity.get(key)!.push(r);
  }

  const criteriaLadder: Array<{ c: Criteria; label: Row['strictness'] }> = [
    { c: { ...STRICT, include_agency: includeAgency }, label: 'strict' },
    { c: { ...RELAX_1, include_agency: includeAgency }, label: 'relaxed_reviews' },
    { c: { ...RELAX_2, include_agency: includeAgency }, label: 'relaxed_estidx' },
    { c: { ...RELAX_3, include_agency: includeAgency }, label: 'relaxed_both' },
  ];

  const groups: Array<{ city: string; strictness: Row['strictness']; picks: Row[] }> = [];
  const stats = { cities: 0, top_tier: 0, relaxed_1: 0, relaxed_2: 0, relaxed_3: 0 };

  for (const [city, list] of byCity) {
    const picks: Row[] = [];
    let usedLabel: Row['strictness'] = 'strict';
    for (const rung of criteriaLadder) {
      const eligible = list.filter(r => passes(r, rung.c));
      if (eligible.length >= minPerCity || rung.label === 'relaxed_both') {
        eligible.sort((a, b) => (b.total_score || 0) - (a.total_score || 0));
        picks.push(...eligible.slice(0, perCity).map(r => ({
          ...r,
          strictness: rung.label,
          suggested_template: pickTemplate(r),
        })));
        usedLabel = rung.label;
        break;
      }
    }
    if (picks.length === 0) continue;
    groups.push({ city, strictness: usedLabel, picks });
    stats.cities++;
    if (usedLabel === 'strict') stats.top_tier += picks.length;
    if (usedLabel === 'relaxed_reviews') stats.relaxed_1 += picks.length;
    if (usedLabel === 'relaxed_estidx') stats.relaxed_2 += picks.length;
    if (usedLabel === 'relaxed_both') stats.relaxed_3 += picks.length;
  }

  // City-first sort: cities with strict picks first, then by top score
  groups.sort((a, b) => {
    const strictA = a.strictness === 'strict' ? 0 : 1;
    const strictB = b.strictness === 'strict' ? 0 : 1;
    if (strictA !== strictB) return strictA - strictB;
    const topA = a.picks[0]?.total_score || 0;
    const topB = b.picks[0]?.total_score || 0;
    return topB - topA;
  });

  return NextResponse.json({
    success: true,
    criteria: {
      strict: STRICT,
      relaxation_ladder: [RELAX_1, RELAX_2, RELAX_3],
      per_city: perCity,
      min_per_city: minPerCity,
    },
    stats,
    groups,
  });
}
