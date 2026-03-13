import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// ─── TYPES ───────────────────────────────────────────────────────
interface MetaAd {
  id: string;
  page_id: string;
  page_name: string;
  ad_creative_bodies?: string[];
  ad_creative_link_titles?: string[];
  ad_creative_link_descriptions?: string[];
  ad_creative_link_captions?: string[];
  ad_snapshot_url?: string;
  ad_delivery_start_time?: string;
  ad_delivery_stop_time?: string;
  publisher_platforms?: string[];
  spend?: { lower_bound: string; upper_bound: string; currency?: string };
  impressions?: { lower_bound: string; upper_bound: string };
  demographic_distribution?: { percentage: string; age: string; gender: string }[];
  estimated_audience_size?: { lower_bound: string; upper_bound: string };
  target_ages?: string[];
  target_gender?: string;
  target_locations?: { name: string; type: string }[];
  languages?: string[];
  bylines?: string;
  media_type?: string;
}

interface AggregatedProspect {
  page_id: string;
  page_name: string;
  ads: MetaAd[];
  active_ad_count: number;
  total_ad_count: number;
  spend_lower: number;
  spend_upper: number;
  spend_currency: string;
  avg_longevity_days: number;
  longest_ad_days: number;
  longevity_tier: string;
  platforms: string[];
  creative_formats: Record<string, number>;
  targeting_summary: { ages: string[]; gender: string; locations: string[] };
  demographic_summary: { age: string; gender: string; percentage: string }[];
  top_ad_snapshot: string | null;
  prospect_score: number;
  prospect_tier: string;
  estimated_monthly_spend: string;
}

// ─── COUNTRY CODE MAP ────────────────────────────────────────────
const COUNTRY_CODES: Record<string, string> = {
  'United Kingdom': 'GB', 'United States': 'US', 'Canada': 'CA',
  'Australia': 'AU', 'Ireland': 'IE', 'Germany': 'DE',
  'France': 'FR', 'Spain': 'ES', 'Italy': 'IT', 'Netherlands': 'NL',
  'GB': 'GB', 'US': 'US', 'CA': 'CA', 'AU': 'AU', 'IE': 'IE',
  'DE': 'DE', 'FR': 'FR', 'ES': 'ES', 'IT': 'IT', 'NL': 'NL',
};

// UK/EU countries that get spend + impression data
const SPEND_DATA_COUNTRIES = new Set([
  'GB', 'DE', 'FR', 'ES', 'IT', 'NL', 'IE', 'AT', 'BE', 'PT',
  'SE', 'DK', 'FI', 'NO', 'PL', 'CZ', 'RO', 'HU', 'GR', 'BG',
]);

// ─── LONGEVITY TIER ──────────────────────────────────────────────
function getLongevityTier(days: number): string {
  if (days >= 365) return 'evergreen';
  if (days >= 180) return 'proven_winner';
  if (days >= 90) return 'winner';
  if (days >= 60) return 'performing';
  if (days >= 30) return 'gaining_traction';
  if (days >= 7) return 'testing';
  return 'just_launched';
}

// ─── PROSPECT SCORING ────────────────────────────────────────────
function scoreProspect(p: {
  spend_upper: number;
  active_ad_count: number;
  avg_longevity_days: number;
  platforms: string[];
  creative_formats: Record<string, number>;
}): { score: number; tier: string } {
  let score = 0;

  // Spend level (30%)
  if (p.spend_upper >= 5000) score += 30;
  else if (p.spend_upper >= 1000) score += 24;
  else if (p.spend_upper >= 500) score += 18;
  else if (p.spend_upper >= 100) score += 9;
  else score += 3; // Has ads but no spend data (non-UK/EU)

  // Number of active ads (15%)
  if (p.active_ad_count >= 10) score += 15;
  else if (p.active_ad_count >= 6) score += 12;
  else if (p.active_ad_count >= 3) score += 9;
  else if (p.active_ad_count >= 1) score += 6;

  // Ad longevity (15%)
  if (p.avg_longevity_days >= 180) score += 15;
  else if (p.avg_longevity_days >= 90) score += 12;
  else if (p.avg_longevity_days >= 30) score += 9;
  else if (p.avg_longevity_days >= 7) score += 6;
  else score += 2;

  // Platform coverage (10%)
  const platCount = p.platforms.length;
  if (platCount >= 3) score += 10;
  else if (platCount >= 2) score += 7;
  else score += 4;

  // Creative diversity (10%)
  const formatTypes = Object.keys(p.creative_formats).filter(k => p.creative_formats[k] > 0).length;
  if (formatTypes >= 3) score += 10;
  else if (formatTypes >= 2) score += 8;
  else score += 4;

  // AI creative score placeholder (15%) — will be filled by /analyse route
  // For now: base 8 points (updated when AI analysis runs)
  score += 8;

  // Targeting (5%) — base points, refined when targeting data exists
  score += 3;

  // Clamp
  score = Math.min(100, Math.max(0, score));

  // Tier
  let tier = 'not_ready';
  if (score >= 90) tier = 'dream_client';
  else if (score >= 70) tier = 'hot';
  else if (score >= 50) tier = 'warm';
  else if (score >= 30) tier = 'early_stage';

  return { score, tier };
}

// ─── SPEND LABEL ─────────────────────────────────────────────────
function spendLabel(lower: number, upper: number, currency: string): string {
  const sym = currency === 'GBP' ? '£' : currency === 'EUR' ? '€' : '$';
  if (upper === 0 && lower === 0) return 'Spend data unavailable';
  if (upper >= 5000) return `${sym}5,000+/mo`;
  if (upper >= 1000) return `${sym}1,000-${(upper / 1000).toFixed(0)}K/mo`;
  if (upper >= 500) return `${sym}500-999/mo`;
  if (upper >= 100) return `${sym}100-499/mo`;
  return `${sym}1-99/mo`;
}

// ─── FETCH META AD LIBRARY ──────────────────────────────────────
async function fetchMetaAds(
  searchTerms: string,
  countryCode: string,
  token: string,
  maxPages: number = 5
): Promise<MetaAd[]> {
  const allAds: MetaAd[] = [];
  const fields = [
    'page_id', 'page_name',
    'ad_creative_bodies', 'ad_creative_link_titles',
    'ad_creative_link_descriptions', 'ad_creative_link_captions',
    'ad_snapshot_url',
    'ad_delivery_start_time', 'ad_delivery_stop_time',
    'publisher_platforms', 'languages', 'bylines',
  ];

  // Add spend/impression fields for UK/EU countries
  if (SPEND_DATA_COUNTRIES.has(countryCode)) {
    fields.push(
      'spend', 'impressions',
      'demographic_distribution', 'estimated_audience_size',
      'target_ages', 'target_gender', 'target_locations'
    );
  }

  let url = `https://graph.facebook.com/v23.0/ads_archive?` +
    `search_terms=${encodeURIComponent(searchTerms)}` +
    `&ad_reached_countries=["${countryCode}"]` +
    `&ad_active_status=ACTIVE` +
    `&fields=${fields.join(',')}` +
    `&limit=100` +
    `&access_token=${token}`;

  let page = 0;
  while (url && page < maxPages) {
    try {
      const resp = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (!resp.ok) {
        const errText = await resp.text();
        console.error(`Meta API error (page ${page}):`, resp.status, errText);
        break;
      }
      const data = await resp.json();
      if (data.data && data.data.length > 0) {
        allAds.push(...data.data);
      }
      // Pagination
      url = data.paging?.next || '';
      page++;
      // Rate limit courtesy: 1s delay between pages
      if (url) await new Promise(r => setTimeout(r, 1000));
    } catch (err) {
      console.error(`Meta API fetch error (page ${page}):`, err);
      break;
    }
  }

  return allAds;
}

// ─── AGGREGATE ADS BY ADVERTISER ─────────────────────────────────
function aggregateByAdvertiser(ads: MetaAd[], countryCode: string): AggregatedProspect[] {
  const map = new Map<string, MetaAd[]>();

  for (const ad of ads) {
    if (!ad.page_id) continue;
    const existing = map.get(ad.page_id) || [];
    existing.push(ad);
    map.set(ad.page_id, existing);
  }

  const now = Date.now();
  const prospects: AggregatedProspect[] = [];

  for (const [pageId, pageAds] of map.entries()) {
    const pageName = pageAds[0].page_name || 'Unknown';

    // Spend aggregation
    let totalSpendLower = 0;
    let totalSpendUpper = 0;
    let currency = SPEND_DATA_COUNTRIES.has(countryCode) ? 'GBP' : 'USD';

    // Longevity
    let totalDays = 0;
    let longestDays = 0;
    let activeCount = 0;

    // Platforms & formats
    const platformSet = new Set<string>();
    const formats: Record<string, number> = {};

    // Targeting
    const ageSet = new Set<string>();
    let genderTarget = 'All';
    const locationSet = new Set<string>();
    const allDemographics: { age: string; gender: string; percentage: string }[] = [];

    // Best ad snapshot (longest running)
    let bestSnapshot: string | null = null;
    let bestDays = 0;

    for (const ad of pageAds) {
      // Active check
      const isActive = !ad.ad_delivery_stop_time;
      if (isActive) activeCount++;

      // Longevity
      const startDate = ad.ad_delivery_start_time ? new Date(ad.ad_delivery_start_time).getTime() : now;
      const endDate = ad.ad_delivery_stop_time ? new Date(ad.ad_delivery_stop_time).getTime() : now;
      const days = Math.max(0, Math.floor((endDate - startDate) / (1000 * 60 * 60 * 24)));
      totalDays += days;
      if (days > longestDays) {
        longestDays = days;
        bestSnapshot = ad.ad_snapshot_url || null;
        bestDays = days;
      }

      // Spend
      if (ad.spend) {
        totalSpendLower += parseInt(ad.spend.lower_bound || '0', 10);
        totalSpendUpper += parseInt(ad.spend.upper_bound || '0', 10);
        if (ad.spend.currency) currency = ad.spend.currency;
      }

      // Platforms
      if (ad.publisher_platforms) {
        for (const p of ad.publisher_platforms) platformSet.add(p.toLowerCase());
      }

      // Media type / format
      const fmt = (ad as any).media_type || 'IMAGE';
      formats[fmt] = (formats[fmt] || 0) + 1;

      // Targeting
      if (ad.target_ages) {
        for (const a of ad.target_ages) ageSet.add(String(a));
      }
      if (ad.target_gender && ad.target_gender !== 'ALL') genderTarget = ad.target_gender;
      if (ad.target_locations) {
        for (const loc of ad.target_locations) locationSet.add(loc.name || '');
      }
      if (ad.demographic_distribution) {
        allDemographics.push(...ad.demographic_distribution);
      }
    }

    const avgLongevity = pageAds.length > 0 ? Math.round(totalDays / pageAds.length) : 0;
    const platforms = Array.from(platformSet);

    const { score, tier } = scoreProspect({
      spend_upper: totalSpendUpper,
      active_ad_count: activeCount,
      avg_longevity_days: avgLongevity,
      platforms,
      creative_formats: formats,
    });

    prospects.push({
      page_id: pageId,
      page_name: pageName,
      ads: pageAds,
      active_ad_count: activeCount,
      total_ad_count: pageAds.length,
      spend_lower: totalSpendLower,
      spend_upper: totalSpendUpper,
      spend_currency: currency,
      avg_longevity_days: avgLongevity,
      longest_ad_days: longestDays,
      longevity_tier: getLongevityTier(longestDays),
      platforms,
      creative_formats: formats,
      targeting_summary: {
        ages: Array.from(ageSet),
        gender: genderTarget,
        locations: Array.from(locationSet),
      },
      demographic_summary: allDemographics.slice(0, 20),
      top_ad_snapshot: bestSnapshot,
      prospect_score: score,
      prospect_tier: tier,
      estimated_monthly_spend: spendLabel(totalSpendLower, totalSpendUpper, currency),
    });
  }

  // Sort by prospect score descending
  prospects.sort((a, b) => b.prospect_score - a.prospect_score);
  return prospects;
}

// ─── SAVE TO DATABASE ────────────────────────────────────────────
async function saveProspects(
  prospects: AggregatedProspect[],
  searchTerm: string,
  niche: string,
  countryCode: string
) {
  for (const p of prospects) {
    // Upsert prospect
    const { data: prospectRow, error: prospErr } = await supabase
      .from('ad_prospects')
      .upsert({
        page_id: p.page_id,
        page_name: p.page_name,
        page_url: `https://www.facebook.com/${p.page_id}`,
        search_term: searchTerm,
        niche,
        country: countryCode,
        active_ad_count: p.active_ad_count,
        total_ad_count: p.total_ad_count,
        estimated_monthly_spend: p.estimated_monthly_spend,
        spend_lower: p.spend_lower,
        spend_upper: p.spend_upper,
        spend_currency: p.spend_currency,
        avg_ad_longevity_days: p.avg_longevity_days,
        longest_ad_days: p.longest_ad_days,
        longevity_tier: p.longevity_tier,
        platforms: p.platforms,
        creative_formats: p.creative_formats,
        prospect_score: p.prospect_score,
        prospect_tier: p.prospect_tier,
        targeting_summary: p.targeting_summary,
        demographic_summary: p.demographic_summary,
        top_ad_snapshot: p.top_ad_snapshot,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'page_id,country' })
      .select('id')
      .single();

    if (prospErr) {
      console.error('Error upserting prospect:', p.page_name, prospErr.message);
      continue;
    }

    const prospectId = prospectRow?.id;
    if (!prospectId) continue;

    // Upsert each ad creative
    for (const ad of p.ads) {
      const startDate = ad.ad_delivery_start_time ? new Date(ad.ad_delivery_start_time) : null;
      const stopDate = ad.ad_delivery_stop_time ? new Date(ad.ad_delivery_stop_time) : null;
      const isActive = !ad.ad_delivery_stop_time;
      const daysRunning = startDate
        ? Math.max(0, Math.floor(((stopDate?.getTime() || Date.now()) - startDate.getTime()) / (1000 * 60 * 60 * 24)))
        : 0;

      await supabase
        .from('ad_creatives')
        .upsert({
          prospect_id: prospectId,
          page_id: p.page_id,
          meta_ad_id: ad.id,
          ad_copy: ad.ad_creative_bodies?.[0] || null,
          headline: ad.ad_creative_link_titles?.[0] || null,
          description: ad.ad_creative_link_descriptions?.[0] || null,
          link_caption: ad.ad_creative_link_captions?.[0] || null,
          snapshot_url: ad.ad_snapshot_url || null,
          delivery_start: ad.ad_delivery_start_time || null,
          delivery_stop: ad.ad_delivery_stop_time || null,
          is_active: isActive,
          days_running: daysRunning,
          longevity_tier: getLongevityTier(daysRunning),
          platforms: ad.publisher_platforms || [],
          media_type: (ad as any).media_type || 'IMAGE',
          languages: ad.languages || [],
          spend_lower: ad.spend ? parseInt(ad.spend.lower_bound || '0', 10) : 0,
          spend_upper: ad.spend ? parseInt(ad.spend.upper_bound || '0', 10) : 0,
          spend_currency: ad.spend?.currency || p.spend_currency,
          impressions_lower: ad.impressions ? parseInt(ad.impressions.lower_bound || '0', 10) : 0,
          impressions_upper: ad.impressions ? parseInt(ad.impressions.upper_bound || '0', 10) : 0,
          demographics: ad.demographic_distribution || [],
          target_ages: ad.target_ages ? { values: ad.target_ages } : {},
          target_gender: ad.target_gender || 'All',
          target_locations: ad.target_locations || [],
          estimated_audience_size: ad.estimated_audience_size || {},
        }, { onConflict: 'meta_ad_id' });
    }
  }
}

// ─── MAIN HANDLER ────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const metaToken = process.env.META_AD_LIBRARY_TOKEN;
    if (!metaToken) {
      return NextResponse.json({
        error: 'META_AD_LIBRARY_TOKEN not configured. Add it to Vercel Environment Variables and redeploy.'
      }, { status: 500 });
    }

    const body = await req.json();
    const { search_terms, country = 'United Kingdom', niche, max_pages = 5 } = body;

    if (!search_terms || search_terms.trim().length === 0) {
      return NextResponse.json({ error: 'search_terms is required' }, { status: 400 });
    }

    const countryCode = COUNTRY_CODES[country] || 'GB';

    // Check cache: if we searched this term + country in the last hour, return cached
    const { data: cachedSearch } = await supabase
      .from('ad_search_history')
      .select('*')
      .eq('search_term', search_terms.trim().toLowerCase())
      .eq('country', countryCode)
      .single();

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    if (cachedSearch && cachedSearch.last_refreshed > oneHourAgo && cachedSearch.status === 'completed') {
      // Return cached prospects
      const { data: cachedProspects } = await supabase
        .from('ad_prospects')
        .select('*')
        .eq('country', countryCode)
        .ilike('search_term', `%${search_terms.trim().toLowerCase()}%`)
        .order('prospect_score', { ascending: false });

      return NextResponse.json({
        source: 'cache',
        search_term: search_terms,
        country: countryCode,
        total_prospects: cachedProspects?.length || 0,
        total_ads: cachedSearch.total_ads_found || 0,
        last_refreshed: cachedSearch.last_refreshed,
        prospects: cachedProspects || [],
      });
    }

    // Mark search as in-progress
    await supabase
      .from('ad_search_history')
      .upsert({
        search_term: search_terms.trim().toLowerCase(),
        country: countryCode,
        status: 'scanning',
        last_refreshed: new Date().toISOString(),
      }, { onConflict: 'search_term,country' });

    // Fetch from Meta Ad Library
    const ads = await fetchMetaAds(search_terms, countryCode, metaToken, max_pages);

    if (ads.length === 0) {
      // Update search history
      await supabase
        .from('ad_search_history')
        .upsert({
          search_term: search_terms.trim().toLowerCase(),
          country: countryCode,
          total_ads_found: 0,
          total_prospects_found: 0,
          status: 'completed',
          last_refreshed: new Date().toISOString(),
        }, { onConflict: 'search_term,country' });

      return NextResponse.json({
        source: 'live',
        search_term: search_terms,
        country: countryCode,
        total_prospects: 0,
        total_ads: 0,
        prospects: [],
        message: 'No ads found. Try different search terms or a different country. UK/EU markets return the most data.',
      });
    }

    // Aggregate by advertiser
    const prospects = aggregateByAdvertiser(ads, countryCode);

    // Save to database
    await saveProspects(prospects, search_terms.trim().toLowerCase(), niche || search_terms, countryCode);

    // Update search history
    await supabase
      .from('ad_search_history')
      .upsert({
        search_term: search_terms.trim().toLowerCase(),
        country: countryCode,
        total_ads_found: ads.length,
        total_prospects_found: prospects.length,
        status: 'completed',
        last_refreshed: new Date().toISOString(),
      }, { onConflict: 'search_term,country' });

    // Return prospects (without the raw ads array to keep response lean)
    const responseProspects = prospects.map(({ ads, ...rest }) => rest);

    return NextResponse.json({
      source: 'live',
      search_term: search_terms,
      country: countryCode,
      total_prospects: prospects.length,
      total_ads: ads.length,
      last_refreshed: new Date().toISOString(),
      prospects: responseProspects,
    });

  } catch (err: any) {
    console.error('Ad Intelligence discover error:', err);
    return NextResponse.json({
      error: err.message || 'Unknown error during ad discovery'
    }, { status: 500 });
  }
}

// ─── GET: Retrieve cached prospects with filters ─────────────────
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const country = searchParams.get('country') || 'GB';
    const niche = searchParams.get('niche');
    const tier = searchParams.get('tier');
    const minScore = parseInt(searchParams.get('min_score') || '0', 10);
    const status = searchParams.get('status');
    const sortBy = searchParams.get('sort') || 'prospect_score';
    const limit = Math.min(parseInt(searchParams.get('limit') || '100', 10), 500);

    let query = supabase
      .from('ad_prospects')
      .select('*')
      .eq('country', country)
      .gte('prospect_score', minScore)
      .order(sortBy, { ascending: false })
      .limit(limit);

    if (niche) query = query.ilike('niche', `%${niche}%`);
    if (tier) query = query.eq('prospect_tier', tier);
    if (status) query = query.eq('status', status);

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      total: data?.length || 0,
      prospects: data || [],
    });

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
