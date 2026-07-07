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
