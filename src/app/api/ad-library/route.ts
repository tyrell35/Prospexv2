import { NextRequest, NextResponse } from 'next/server';

// ─── AD LONGEVITY SCORING ALGORITHM ──────────────────────────
// The longer an ad runs, the more likely it's profitable.
// Businesses don't keep spending money on ads that don't work.

export interface AdResult {
  ad_id: string;
  page_id: string;
  page_name: string;
  ad_creative_bodies: string[];
  ad_creative_link_titles: string[];
  ad_creative_link_descriptions: string[];
  ad_creative_link_captions: string[];
  ad_delivery_start_time: string;
  ad_delivery_stop_time: string | null;
  ad_snapshot_url: string;
  publisher_platforms: string[];
  estimated_audience_size: { lower_bound: number; upper_bound: number } | null;
  // Computed fields
  days_running: number;
  is_active: boolean;
  longevity_tier: string;
  longevity_color: string;
  longevity_score: number;
}

export interface AdvertiserProfile {
  page_id: string;
  page_name: string;
  total_ads: number;
  active_ads: number;
  winner_ads: number; // 90+ days
  evergreen_ads: number; // 365+ days
  longest_running_days: number;
  avg_ad_duration: number;
  platforms: string[];
  creative_diversity: number; // unique creatives
  advertiser_score: number; // 0-100 composite score
  advertiser_tier: string;
  ad_spend_signal: string;
  ads: AdResult[];
}

function scoreLongevity(daysRunning: number): { tier: string; color: string; score: number } {
  if (daysRunning >= 365) return { tier: 'Evergreen', color: 'text-yellow-400', score: 100 };
  if (daysRunning >= 180) return { tier: 'Proven Winner', color: 'text-emerald-400', score: 90 };
  if (daysRunning >= 90) return { tier: 'Winner', color: 'text-green-400', score: 75 };
  if (daysRunning >= 60) return { tier: 'Performing', color: 'text-orange-400', score: 60 };
  if (daysRunning >= 30) return { tier: 'Gaining Traction', color: 'text-amber-400', score: 40 };
  if (daysRunning >= 7) return { tier: 'Testing', color: 'text-blue-400', score: 20 };
  return { tier: 'Just Launched', color: 'text-gray-400', score: 10 };
}

function scoreAdvertiser(profile: Omit<AdvertiserProfile, 'advertiser_score' | 'advertiser_tier' | 'ad_spend_signal'>): { score: number; tier: string; spend_signal: string } {
  let score = 0;

  // Longest running ad (max 35 points)
  if (profile.longest_running_days >= 365) score += 35;
  else if (profile.longest_running_days >= 180) score += 30;
  else if (profile.longest_running_days >= 90) score += 25;
  else if (profile.longest_running_days >= 60) score += 18;
  else if (profile.longest_running_days >= 30) score += 12;
  else score += 5;

  // Number of active ads (max 25 points)
  if (profile.active_ads >= 20) score += 25;
  else if (profile.active_ads >= 10) score += 20;
  else if (profile.active_ads >= 5) score += 15;
  else if (profile.active_ads >= 3) score += 10;
  else score += 5;

  // Winner ads ratio (max 20 points)
  const winnerRatio = profile.total_ads > 0 ? profile.winner_ads / profile.total_ads : 0;
  score += Math.round(winnerRatio * 20);

  // Creative diversity (max 10 points) — more unique creatives = more sophisticated
  if (profile.creative_diversity >= 10) score += 10;
  else if (profile.creative_diversity >= 5) score += 7;
  else if (profile.creative_diversity >= 3) score += 5;
  else score += 2;

  // Multi-platform (max 10 points)
  if (profile.platforms.length >= 3) score += 10;
  else if (profile.platforms.length >= 2) score += 7;
  else score += 3;

  // Tier
  let tier = 'Casual Advertiser';
  if (score >= 80) tier = 'Ad Machine';
  else if (score >= 60) tier = 'Heavy Spender';
  else if (score >= 40) tier = 'Active Advertiser';
  else if (score >= 20) tier = 'Light Advertiser';

  // Spend signal estimation
  let spend_signal = 'Unknown';
  if (profile.active_ads >= 10 && profile.longest_running_days >= 90) spend_signal = '£5,000+/mo';
  else if (profile.active_ads >= 5 && profile.longest_running_days >= 60) spend_signal = '£2,000-5,000/mo';
  else if (profile.active_ads >= 3 && profile.longest_running_days >= 30) spend_signal = '£1,000-2,000/mo';
  else if (profile.active_ads >= 1) spend_signal = '£500-1,000/mo';

  return { score: Math.min(score, 100), tier, spend_signal };
}

// ─── META AD LIBRARY API ────────────────────────────────────

async function searchMetaAdLibrary(
  searchTerm: string,
  country: string,
  accessToken: string,
  limit: number = 100
): Promise<AdResult[]> {
  const countryMap: Record<string, string> = {
    'United Kingdom': 'GB', 'United States': 'US', 'Canada': 'CA',
    'Australia': 'AU', 'Ireland': 'IE', 'Germany': 'DE',
    'France': 'FR', 'Spain': 'ES', 'Italy': 'IT', 'Netherlands': 'NL',
  };
  const countryCode = countryMap[country] || 'GB';

  const fields = [
    'id', 'page_id', 'page_name',
    'ad_creative_bodies', 'ad_creative_link_titles',
    'ad_creative_link_descriptions', 'ad_creative_link_captions',
    'ad_delivery_start_time', 'ad_delivery_stop_time',
    'ad_snapshot_url', 'publisher_platforms',
    'estimated_audience_size',
  ].join(',');

  const allAds: AdResult[] = [];
  let afterCursor: string | null = null;
  let pages = 0;
  const maxPages = Math.ceil(limit / 25);

  while (pages < maxPages) {
    const params = new URLSearchParams({
      access_token: accessToken,
      search_terms: searchTerm,
      ad_reached_countries: `["${countryCode}"]`,
      ad_type: 'ALL',
      ad_active_status: 'ALL',
      fields,
      limit: '25',
    });

    if (afterCursor) {
      params.set('after', afterCursor);
    }

    const response = await fetch(
      `https://graph.facebook.com/v19.0/ads_archive?${params}`
    );

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new Error(`Meta Ad Library API error (${response.status}): ${errText.slice(0, 300)}`);
    }

    const data = await response.json();
    const ads = data.data || [];

    const now = new Date();

    for (const ad of ads) {
      const startDate = ad.ad_delivery_start_time ? new Date(ad.ad_delivery_start_time) : now;
      const stopDate = ad.ad_delivery_stop_time ? new Date(ad.ad_delivery_stop_time) : null;
      const isActive = !stopDate || stopDate > now;
      const endDate = stopDate || now;
      const daysRunning = Math.max(1, Math.floor((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)));
      const longevity = scoreLongevity(daysRunning);

      allAds.push({
        ad_id: ad.id || '',
        page_id: ad.page_id || '',
        page_name: ad.page_name || 'Unknown',
        ad_creative_bodies: ad.ad_creative_bodies || [],
        ad_creative_link_titles: ad.ad_creative_link_titles || [],
        ad_creative_link_descriptions: ad.ad_creative_link_descriptions || [],
        ad_creative_link_captions: ad.ad_creative_link_captions || [],
        ad_delivery_start_time: ad.ad_delivery_start_time || '',
        ad_delivery_stop_time: ad.ad_delivery_stop_time || null,
        ad_snapshot_url: ad.ad_snapshot_url || '',
        publisher_platforms: ad.publisher_platforms || [],
        estimated_audience_size: ad.estimated_audience_size || null,
        days_running: daysRunning,
        is_active: isActive,
        longevity_tier: longevity.tier,
        longevity_color: longevity.color,
        longevity_score: longevity.score,
      });
    }

    // Pagination
    afterCursor = data.paging?.cursors?.after || null;
    if (!afterCursor || ads.length === 0) break;
    pages++;
  }

  // Sort by days running (longest first)
  allAds.sort((a, b) => b.days_running - a.days_running);

  return allAds;
}

// ─── BUILD ADVERTISER PROFILES ──────────────────────────────

function buildAdvertiserProfiles(ads: AdResult[]): AdvertiserProfile[] {
  const byPage = new Map<string, AdResult[]>();

  for (const ad of ads) {
    const key = ad.page_id || ad.page_name;
    if (!byPage.has(key)) byPage.set(key, []);
    byPage.get(key)!.push(ad);
  }

  const profiles: AdvertiserProfile[] = [];

  for (const [, pageAds] of byPage) {
    const activeAds = pageAds.filter(a => a.is_active);
    const winnerAds = pageAds.filter(a => a.days_running >= 90);
    const evergreenAds = pageAds.filter(a => a.days_running >= 365);
    const longestDays = Math.max(...pageAds.map(a => a.days_running));
    const avgDuration = pageAds.reduce((sum, a) => sum + a.days_running, 0) / pageAds.length;

    // Unique platforms across all ads
    const platforms = [...new Set(pageAds.flatMap(a => a.publisher_platforms))];

    // Creative diversity — count unique ad body texts
    const uniqueCreatives = new Set(
      pageAds.map(a => (a.ad_creative_bodies[0] || '').slice(0, 100))
    ).size;

    const baseProfile = {
      page_id: pageAds[0].page_id,
      page_name: pageAds[0].page_name,
      total_ads: pageAds.length,
      active_ads: activeAds.length,
      winner_ads: winnerAds.length,
      evergreen_ads: evergreenAds.length,
      longest_running_days: longestDays,
      avg_ad_duration: Math.round(avgDuration),
      platforms,
      creative_diversity: uniqueCreatives,
      ads: pageAds.sort((a, b) => b.days_running - a.days_running),
    };

    const scoring = scoreAdvertiser(baseProfile);

    profiles.push({
      ...baseProfile,
      advertiser_score: scoring.score,
      advertiser_tier: scoring.tier,
      ad_spend_signal: scoring.spend_signal,
    });
  }

  // Sort by advertiser score (highest first)
  profiles.sort((a, b) => b.advertiser_score - a.advertiser_score);

  return profiles;
}

// ─── TREND ANALYSIS ─────────────────────────────────────────

interface TrendInsight {
  type: 'winner_pattern' | 'creative_trend' | 'platform_trend' | 'saturation' | 'opportunity';
  title: string;
  detail: string;
  icon: string;
}

function analyzeTrends(profiles: AdvertiserProfile[], ads: AdResult[]): TrendInsight[] {
  const insights: TrendInsight[] = [];

  // 1. Winner ad patterns
  const winnerAds = ads.filter(a => a.days_running >= 90 && a.is_active);
  if (winnerAds.length > 0) {
    // Find common words in winner ad copy
    const allWords = winnerAds
      .flatMap(a => a.ad_creative_bodies)
      .join(' ')
      .toLowerCase()
      .split(/\s+/)
      .filter(w => w.length > 4);
    const wordFreq = new Map<string, number>();
    for (const w of allWords) {
      wordFreq.set(w, (wordFreq.get(w) || 0) + 1);
    }
    const topWords = [...wordFreq.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([w]) => w);

    if (topWords.length > 0) {
      insights.push({
        type: 'winner_pattern',
        title: 'Winning Ad Copy Patterns',
        detail: `The most common words in ads running 90+ days: "${topWords.join('", "')}"`,
        icon: '🏆',
      });
    }
  }

  // 2. Platform trends
  const platformCounts = new Map<string, number>();
  for (const ad of ads.filter(a => a.is_active)) {
    for (const p of ad.publisher_platforms) {
      platformCounts.set(p, (platformCounts.get(p) || 0) + 1);
    }
  }
  const topPlatform = [...platformCounts.entries()].sort((a, b) => b[1] - a[1])[0];
  if (topPlatform) {
    insights.push({
      type: 'platform_trend',
      title: 'Dominant Platform',
      detail: `${Math.round((topPlatform[1] / ads.filter(a => a.is_active).length) * 100)}% of active ads run on ${topPlatform[0]}`,
      icon: '📱',
    });
  }

  // 3. Market saturation
  const heavySpenders = profiles.filter(p => p.advertiser_score >= 60);
  if (heavySpenders.length >= 5) {
    insights.push({
      type: 'saturation',
      title: 'Competitive Market',
      detail: `${heavySpenders.length} businesses are heavy ad spenders in this niche. Leads here may need help standing out, not just getting started.`,
      icon: '🔥',
    });
  } else if (heavySpenders.length <= 1) {
    insights.push({
      type: 'opportunity',
      title: 'Low Competition',
      detail: `Only ${heavySpenders.length} heavy spender found. This market is undertapped — great opportunity for your clients.`,
      icon: '💎',
    });
  }

  // 4. Average ad lifespan
  const avgLifespan = ads.length > 0
    ? Math.round(ads.reduce((sum, a) => sum + a.days_running, 0) / ads.length)
    : 0;
  insights.push({
    type: 'creative_trend',
    title: 'Average Ad Lifespan',
    detail: `Ads in this niche run for an average of ${avgLifespan} days. Ads surviving beyond ${avgLifespan * 2} days are clear outperformers.`,
    icon: '📊',
  });

  // 5. Evergreen alert
  const evergreenCount = ads.filter(a => a.days_running >= 365 && a.is_active).length;
  if (evergreenCount > 0) {
    insights.push({
      type: 'winner_pattern',
      title: 'Evergreen Ads Found',
      detail: `${evergreenCount} ad${evergreenCount > 1 ? 's have' : ' has'} been running for over a year. These are proven money-makers — study their copy and creative.`,
      icon: '🌿',
    });
  }

  return insights;
}

// ─── ROUTE HANDLER ──────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const { searchTerm, country = 'United Kingdom', limit = 100 } = await request.json();

    if (!searchTerm) {
      return NextResponse.json({ error: 'Search term is required' }, { status: 400 });
    }

    const accessToken = process.env.META_AD_LIBRARY_TOKEN;
    if (!accessToken) {
      return NextResponse.json({
        error: 'Meta Ad Library access token not configured. Add META_AD_LIBRARY_TOKEN in Settings or Vercel environment variables.',
        setup_url: 'https://developers.facebook.com/tools/explorer/',
      }, { status: 400 });
    }

    // Search the Ad Library
    const ads = await searchMetaAdLibrary(searchTerm, country, accessToken, limit);

    // Build advertiser profiles with scoring
    const profiles = buildAdvertiserProfiles(ads);

    // Analyze trends
    const trends = analyzeTrends(profiles, ads);

    // Summary stats
    const stats = {
      total_ads: ads.length,
      active_ads: ads.filter(a => a.is_active).length,
      total_advertisers: profiles.length,
      heavy_spenders: profiles.filter(p => p.advertiser_score >= 60).length,
      winner_ads: ads.filter(a => a.days_running >= 90).length,
      evergreen_ads: ads.filter(a => a.days_running >= 365).length,
      avg_duration: ads.length > 0 ? Math.round(ads.reduce((s, a) => s + a.days_running, 0) / ads.length) : 0,
      longest_ad_days: ads.length > 0 ? ads[0].days_running : 0,
    };

    return NextResponse.json({
      ads,
      profiles,
      trends,
      stats,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Ad Library search failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
