// Meta Ads Library client — thin wrapper over graph.facebook.com/ads_archive.
// Supports both Mode 1 (search_terms) and Mode 2 (search_page_ids).
// Server-only.

const GRAPH_VERSION = 'v21.0';

export interface AdRow {
  id?: string;
  page_id: string;
  page_name?: string;
  ad_creative_link_titles?: string[];
  ad_creative_bodies?: string[];
  ad_delivery_start_time?: string; // ISO datetime
  ad_delivery_stop_time?: string;
  ad_snapshot_url?: string;
  ad_creation_time?: string;
  publisher_platforms?: string[];
  currency?: string;
  languages?: string[];
}

const AD_FIELDS = [
  'id', 'page_id', 'page_name',
  'ad_creative_link_titles', 'ad_creative_bodies',
  'ad_delivery_start_time', 'ad_delivery_stop_time',
  'ad_snapshot_url', 'ad_creation_time',
  'publisher_platforms', 'currency', 'languages',
].join(',');

function token(): string | null {
  return process.env.META_ADS_TOKEN || null;
}

/**
 * Fetch active-status ads for a specific FB page id (Mode 2 — qualification).
 * Returns [] if no token, so callers can gracefully record ads_active=false.
 */
export async function fetchActiveAdsByPageId(pageId: string, country = 'GB', limit = 25): Promise<AdRow[]> {
  const t = token();
  if (!t) return [];
  return fetchAdsArchive({ params: { search_page_ids: `["${pageId}"]`, ad_reached_countries: `["${country}"]`, ad_active_status: 'ACTIVE' }, limit });
}

/**
 * Fetch all-status ads for a specific FB page id (used for first_ever_ad_date
 * and total_ads_all_time — Section 11.3 establishment inputs).
 */
export async function fetchAllAdsByPageId(pageId: string, country = 'GB', limit = 100): Promise<AdRow[]> {
  const t = token();
  if (!t) return [];
  return fetchAdsArchive({ params: { search_page_ids: `["${pageId}"]`, ad_reached_countries: `["${country}"]`, ad_active_status: 'ALL' }, limit });
}

/**
 * Search ads by keyword (Mode 1 — seed hunts). Every returned page is a
 * clinic-or-noise candidate.
 */
export async function searchAdsByKeyword(term: string, country = 'GB', limit = 50): Promise<AdRow[]> {
  const t = token();
  if (!t) return [];
  return fetchAdsArchive({
    params: {
      search_terms: `"${term}"`,
      ad_reached_countries: `["${country}"]`,
      ad_active_status: 'ACTIVE',
    },
    limit,
  });
}

// ─── Core fetcher with pagination ───────────────────────

async function fetchAdsArchive({ params, limit }: {
  params: Record<string, string>;
  limit: number;
}): Promise<AdRow[]> {
  const t = token();
  if (!t) return [];
  const all: AdRow[] = [];
  const pageSize = Math.min(50, limit);
  let nextCursor: string | null = null;
  const base = `https://graph.facebook.com/${GRAPH_VERSION}/ads_archive`;

  while (all.length < limit) {
    const q = new URLSearchParams({
      access_token: t,
      fields: AD_FIELDS,
      limit: String(pageSize),
      ...params,
    });
    if (nextCursor) q.set('after', nextCursor);
    let res: Response;
    try {
      res = await fetch(`${base}?${q.toString()}`, { signal: AbortSignal.timeout(15000) });
    } catch {
      break;
    }
    if (!res.ok) break;
    const data = await res.json().catch(() => null);
    if (!data) break;
    const items = (data.data || []) as AdRow[];
    all.push(...items);
    if (items.length < pageSize) break;
    nextCursor = data.paging?.cursors?.after || null;
    if (!nextCursor) break;
  }
  return all.slice(0, limit);
}

// ─── Derive summary stats used by hunt_ad_intel ────────

export interface AdSummary {
  ads_active: boolean;
  ad_count: number;
  earliest_ad_start: string | null;
  ad_days_running: number | null;
  ad_copy_samples: Array<{ title?: string; body?: string; snapshot_url?: string }>;
  ad_platforms: string[];
  library_url: string | null;
  first_ever_ad_date: string | null;
  total_ads_all_time: number;
}

export function summariseAds(active: AdRow[], all: AdRow[], pageId: string): AdSummary {
  const platforms = new Set<string>();
  let earliest: string | null = null;
  for (const a of active) {
    (a.publisher_platforms || []).forEach(p => platforms.add(p));
    if (a.ad_delivery_start_time) {
      if (!earliest || a.ad_delivery_start_time < earliest) earliest = a.ad_delivery_start_time;
    }
  }
  const earliestDate = earliest ? earliest.slice(0, 10) : null;
  const days = earliestDate ? Math.max(0, Math.floor((Date.now() - new Date(earliestDate).getTime()) / (1000 * 60 * 60 * 24))) : null;

  const samples = active.slice(0, 3).map(a => ({
    title: (a.ad_creative_link_titles || [])[0],
    body: (a.ad_creative_bodies || [])[0],
    snapshot_url: a.ad_snapshot_url,
  }));

  let firstEver: string | null = null;
  for (const a of all) {
    const start = a.ad_delivery_start_time || a.ad_creation_time;
    if (start && (!firstEver || start < firstEver)) firstEver = start;
  }

  return {
    ads_active: active.length > 0,
    ad_count: active.length,
    earliest_ad_start: earliestDate,
    ad_days_running: days,
    ad_copy_samples: samples,
    ad_platforms: Array.from(platforms),
    library_url: `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=ALL&view_all_page_id=${pageId}`,
    first_ever_ad_date: firstEver ? firstEver.slice(0, 10) : null,
    total_ads_all_time: all.length,
  };
}

// ═══════════════════════════════════════════════════════
// Seed-hunt classifier (Section 4 Mode 1 junk filter)
// ═══════════════════════════════════════════════════════

const CLINIC_VOCAB = [
  'clinic', 'aesthetics', 'aesthetic', 'skin', 'laser', 'beauty', 'medspa',
  'med spa', 'medi-spa', 'cosmetic', 'cosmetics', 'dermatology', 'dermatologist',
  'anti-ageing', 'anti-aging', 'rejuvenation', 'rejuvination', 'facial',
  'injectables', 'botox', 'filler', 'lipo', 'sculpt', 'contour', 'body',
  'spa', 'wellness', 'esthetics',
];

// Agency vocab — pages hunting for clinics as customers
const AGENCY_VOCAB = [
  'leads', 'enquiries', 'inquiries', 'marketing agency', 'growth partner',
  'guaranteed leads', 'grow your clinic', 'clinic marketing', 'medspa marketing',
  'ad management', 'meta ads', 'facebook ads', 'roas', 'roi guarantee',
  'lead generation', 'digital agency', 'ad agency', 'marketing partner',
];

// Hard-blocked noise categories. Currency mismatch was removed from this list —
// it's now a soft flag (see returned currency_mismatch) so we don't miss real
// clinics whose Meta account happens to bill in another currency.
const JUNK_VOCAB = [
  // Products / DTC
  'supplements', 'vitamins', 'skincare products', 'shop now', 'buy now',
  'nutraceutical', 'delivery', 'free shipping', 'add to cart',
  'at home', 'home use', 'home device', 'home kit', 'device kit',
  'wearable', 'led mask', 'red light mask', 'night lenses', 'contact lenses',
  // Training / courses / affiliates
  'training academy', 'course', 'certification', 'affiliate', 'ebook',
  'ecourse', 'masterclass', 'coaching program',
  // Publishers / media
  'magazine', 'gazette', 'newspaper', 'news outlet', 'blog post', 'life magazine',
];

export type SeedClassification = 'clinic' | 'agency' | 'junk' | 'ambiguous';

export interface SeedClassificationResult {
  classification: SeedClassification;
  currency_mismatch: boolean;
}

/**
 * Classify a Meta Ad Library search result page.
 * Returns:
 *  - classification:
 *      'clinic'    → likely a real clinic prospect
 *      'agency'    → other agency chasing the same market (competitor_watch)
 *      'junk'      → product / publisher / course — drop
 *      'ambiguous' → send to review queue for human decision
 *  - currency_mismatch: true when the ad ran in a different currency than the
 *    hunt country expects. Meta's currency field is unreliable for country
 *    decisions (a US-billed ad account can run UK-targeted ads), so this is a
 *    soft warning flag only — the row is still ingested for human review.
 */
export function classifySeedResult(input: {
  page_name?: string | null;
  ad_titles?: string[];
  ad_bodies?: string[];
  currency?: string | null;
  expected_currency?: string | null; // GBP for GB, USD for US
}): SeedClassificationResult {
  const parts = [
    input.page_name || '',
    ...(input.ad_titles || []),
    ...(input.ad_bodies || []),
  ].join(' ').toLowerCase();

  const currency_mismatch = !!(
    input.expected_currency && input.currency && input.currency !== input.expected_currency
  );

  // Junk categories drop first (products / publishers / courses)
  if (JUNK_VOCAB.some(w => parts.includes(w))) {
    return { classification: 'junk', currency_mismatch };
  }

  const hasClinic = CLINIC_VOCAB.some(w => parts.includes(w));
  const hasAgency = AGENCY_VOCAB.some(w => parts.includes(w));

  let classification: SeedClassification;
  if (hasAgency && !hasClinic) classification = 'agency';
  else if (hasClinic && !hasAgency) classification = 'clinic';
  else if (hasClinic && hasAgency) classification = 'ambiguous'; // "clinic marketing"
  else classification = 'ambiguous';

  return { classification, currency_mismatch };
}

