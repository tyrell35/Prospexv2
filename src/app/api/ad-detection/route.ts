import { NextRequest, NextResponse } from 'next/server';

import { supabaseAdmin as supabase } from "@/lib/supabase-admin";

// ═══════════════════════════════════════════════════════════════
// AD DETECTION ENGINE — 3-Layer Intelligence
//
// Layer 1: Website Pixel Detection (Firecrawl)
//   - Facebook Pixel, Google Ads tags, GTM, TikTok Pixel
//
// Layer 2: Meta Ad Library API (FREE)
//   - Checks if business is actively running Facebook/Instagram ads
//   - Returns ad count, platforms, start dates
//   - Full commercial data for UK/EU (Digital Services Act)
//
// Layer 3: Google Ads Transparency Center (SerpAPI)
//   - Checks if business is running Google Search/Display/YouTube ads
//   - Returns ad count, formats, date ranges
// ═══════════════════════════════════════════════════════════════

interface AdDetectionResult {
  business_name: string;
  website: string | null;

  // Layer 1: Pixels
  pixels: {
    facebook_pixel: boolean;
    google_ads_tag: boolean;
    google_tag_manager: boolean;
    tiktok_pixel: boolean;
    linkedin_insight: boolean;
    any_pixel: boolean;
  };

  // Layer 2: Meta Ads
  meta_ads: {
    checked: boolean;
    running: boolean;
    active_count: number;
    platforms: string[];
    ads_preview: Array<{
      ad_id: string;
      page_name: string;
      start_date: string;
      platform: string;
      creative_preview: string;
    }>;
    error: string | null;
  };

  // Layer 3: Google Ads
  google_ads: {
    checked: boolean;
    running: boolean;
    active_count: number;
    formats: string[];
    advertiser_name: string | null;
    ads_preview: Array<{
      title: string;
      format: string;
      last_shown: string;
      region: string;
    }>;
    error: string | null;
  };

  // Summary
  overall_status: 'active_both' | 'active_meta' | 'active_google' | 'pixel_only' | 'none' | 'unknown';
  confidence: 'high' | 'medium' | 'low';
  checked_at: string;
}

// ═══ LAYER 1: WEBSITE PIXEL DETECTION ═══
async function detectPixels(website: string): Promise<AdDetectionResult['pixels']> {
  const defaults = {
    facebook_pixel: false,
    google_ads_tag: false,
    google_tag_manager: false,
    tiktok_pixel: false,
    linkedin_insight: false,
    any_pixel: false,
  };

  const firecrawlKey = process.env.FIRECRAWL_API_KEY;
  if (!firecrawlKey || !website) return defaults;

  try {
    const res = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${firecrawlKey}`,
      },
      body: JSON.stringify({ url: website, formats: ['html'], onlyMainContent: false }),
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) return defaults;
    const data = await res.json();
    const html = (data?.data?.html || '').toLowerCase();

    const pixels = {
      facebook_pixel: html.includes('fbq(') || html.includes('facebook.com/tr') || html.includes('connect.facebook.net'),
      google_ads_tag: html.includes('googleadservices') || html.includes('google_conversion') || html.includes('gtag(\'event\'') || html.includes('ads/ga-audiences'),
      google_tag_manager: html.includes('googletagmanager.com') || html.includes('gtm.js'),
      tiktok_pixel: html.includes('analytics.tiktok.com') || html.includes('ttq.load'),
      linkedin_insight: html.includes('snap.licdn.com') || html.includes('linkedin.com/li/'),
      any_pixel: false,
    };

    pixels.any_pixel = pixels.facebook_pixel || pixels.google_ads_tag ||
      pixels.google_tag_manager || pixels.tiktok_pixel || pixels.linkedin_insight;

    return pixels;
  } catch {
    return defaults;
  }
}

// ═══ LAYER 2: META AD LIBRARY CHECK ═══
async function checkMetaAds(businessName: string, country: string): Promise<AdDetectionResult['meta_ads']> {
  const result: AdDetectionResult['meta_ads'] = {
    checked: false,
    running: false,
    active_count: 0,
    platforms: [],
    ads_preview: [],
    error: null,
  };

  const metaToken = process.env.META_AD_LIBRARY_TOKEN || process.env.META_ACCESS_TOKEN;
  if (!metaToken) {
    result.error = 'META_AD_LIBRARY_TOKEN not configured';
    return result;
  }

  // Map country names to ISO codes
  const countryMap: Record<string, string> = {
    'United Kingdom': 'GB',
    'United States': 'US',
    'Canada': 'CA',
    'Australia': 'AU',
    'Ireland': 'IE',
    'Germany': 'DE',
    'France': 'FR',
    'Spain': 'ES',
    'Italy': 'IT',
    'Netherlands': 'NL',
  };
  const countryCode = countryMap[country] || 'GB';

  try {
    const searchTerm = encodeURIComponent(businessName);
    const url = `https://graph.facebook.com/v21.0/ads_archive?search_terms=${searchTerm}&ad_reached_countries=["${countryCode}"]&ad_active_status=ACTIVE&fields=id,ad_creative_bodies,ad_creative_link_titles,ad_delivery_start_time,publisher_platforms,page_name&limit=10&access_token=${metaToken}`;

    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      const errMsg = (errData as Record<string, Record<string, string>>)?.error?.message || `Meta API ${res.status}`;
      result.error = errMsg;
      return result;
    }

    const data = await res.json();
    result.checked = true;

    const ads = data?.data || [];
    result.active_count = ads.length;
    result.running = ads.length > 0;

    // Extract platforms
    const allPlatforms = new Set<string>();
    const previews: AdDetectionResult['meta_ads']['ads_preview'] = [];

    for (const ad of ads.slice(0, 5)) {
      const platforms = ad.publisher_platforms || [];
      platforms.forEach((p: string) => allPlatforms.add(p));

      previews.push({
        ad_id: ad.id || '',
        page_name: ad.page_name || businessName,
        start_date: ad.ad_delivery_start_time || '',
        platform: platforms.join(', '),
        creative_preview: (ad.ad_creative_bodies?.[0] || ad.ad_creative_link_titles?.[0] || '').slice(0, 150),
      });
    }

    result.platforms = Array.from(allPlatforms);
    result.ads_preview = previews;

    // Check for more results (paging)
    if (data?.paging?.next) {
      // There are more ads — get total count
      result.active_count = Math.max(ads.length, 10); // At least 10+
    }

    return result;
  } catch (err: unknown) {
    result.error = err instanceof Error ? err.message : 'Meta Ad Library check failed';
    return result;
  }
}

// ═══ LAYER 3: GOOGLE ADS TRANSPARENCY CHECK ═══
async function checkGoogleAds(businessName: string, website: string | null): Promise<AdDetectionResult['google_ads']> {
  const result: AdDetectionResult['google_ads'] = {
    checked: false,
    running: false,
    active_count: 0,
    formats: [],
    advertiser_name: null,
    ads_preview: [],
    error: null,
  };

  const serpApiKey = process.env.SERPAPI_KEY;
  if (!serpApiKey) {
    result.error = 'SERPAPI_KEY not configured';
    return result;
  }

  try {
    // Search by domain first (more accurate), then by business name
    const searchQuery = website
      ? new URL(website).hostname.replace('www.', '')
      : businessName;

    const url = `https://serpapi.com/search.json?engine=google_ads_transparency_center&advertiser_id=&text=${encodeURIComponent(searchQuery)}&region=anywhere&api_key=${serpApiKey}`;

    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });

    if (!res.ok) {
      // Fallback: try searching by business name if domain search failed
      if (website && searchQuery !== businessName) {
        return checkGoogleAdsByName(businessName, serpApiKey);
      }
      result.error = `SerpAPI returned ${res.status}`;
      return result;
    }

    const data = await res.json();
    result.checked = true;

    // Parse SerpAPI response
    const advertisers = data?.advertisers || [];

    if (advertisers.length > 0) {
      // Find best match
      const advertiser = advertisers[0];
      result.advertiser_name = advertiser.name || null;

      // Get their ads
      const adsList = advertiser.ads || data?.ads || [];
      result.active_count = adsList.length;
      result.running = adsList.length > 0;

      const formats = new Set<string>();
      for (const ad of adsList.slice(0, 5)) {
        const format = ad.format || ad.type || 'unknown';
        formats.add(format);

        result.ads_preview.push({
          title: (ad.title || ad.text || '').slice(0, 100),
          format,
          last_shown: ad.last_shown || ad.date || '',
          region: ad.region || 'Global',
        });
      }
      result.formats = Array.from(formats);
    } else {
      // No advertisers found — might need to search differently
      if (website && searchQuery !== businessName) {
        return checkGoogleAdsByName(businessName, serpApiKey);
      }
    }

    return result;
  } catch (err: unknown) {
    result.error = err instanceof Error ? err.message : 'Google Ads check failed';
    return result;
  }
}

async function checkGoogleAdsByName(businessName: string, serpApiKey: string): Promise<AdDetectionResult['google_ads']> {
  const result: AdDetectionResult['google_ads'] = {
    checked: false, running: false, active_count: 0, formats: [],
    advertiser_name: null, ads_preview: [], error: null,
  };

  try {
    const url = `https://serpapi.com/search.json?engine=google_ads_transparency_center&text=${encodeURIComponent(businessName)}&region=anywhere&api_key=${serpApiKey}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) {
      result.error = `SerpAPI returned ${res.status}`;
      return result;
    }
    const data = await res.json();
    result.checked = true;

    const advertisers = data?.advertisers || [];
    if (advertisers.length > 0) {
      const advertiser = advertisers[0];
      result.advertiser_name = advertiser.name || null;
      const adsList = advertiser.ads || data?.ads || [];
      result.active_count = adsList.length;
      result.running = adsList.length > 0;

      const formats = new Set<string>();
      for (const ad of adsList.slice(0, 5)) {
        formats.add(ad.format || 'unknown');
        result.ads_preview.push({
          title: (ad.title || ad.text || '').slice(0, 100),
          format: ad.format || 'unknown',
          last_shown: ad.last_shown || '',
          region: ad.region || 'Global',
        });
      }
      result.formats = Array.from(formats);
    }
    return result;
  } catch (err: unknown) {
    result.error = err instanceof Error ? err.message : 'Google Ads name check failed';
    return result;
  }
}

// ═══ DETERMINE OVERALL STATUS ═══
function determineOverallStatus(
  pixels: AdDetectionResult['pixels'],
  meta: AdDetectionResult['meta_ads'],
  google: AdDetectionResult['google_ads']
): { status: AdDetectionResult['overall_status']; confidence: AdDetectionResult['confidence'] } {
  const metaRunning = meta.running;
  const googleRunning = google.running;

  if (metaRunning && googleRunning) {
    return { status: 'active_both', confidence: 'high' };
  }
  if (metaRunning) {
    return { status: 'active_meta', confidence: 'high' };
  }
  if (googleRunning) {
    return { status: 'active_google', confidence: 'high' };
  }
  if (pixels.any_pixel) {
    // Has pixels but no confirmed active ads
    return { status: 'pixel_only', confidence: 'medium' };
  }
  if (meta.checked || google.checked) {
    // We checked and found nothing
    return { status: 'none', confidence: meta.checked && google.checked ? 'high' : 'medium' };
  }
  return { status: 'unknown', confidence: 'low' };
}

// ═══ MAIN HANDLER ═══
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action = 'detect' } = body;

    switch (action) {
      case 'detect':
        return detectAds(body);
      case 'detect_batch':
        return detectAdsBatch(body);
      case 'detect_lead':
        return detectAdsForLead(body);
      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Ad detection failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ═══ SINGLE BUSINESS AD DETECTION ═══
async function detectAds(body: Record<string, unknown>) {
  const { business_name, website, country = 'United Kingdom', layers = ['pixels', 'meta', 'google'] } = body;

  if (!business_name) {
    return NextResponse.json({ error: 'business_name is required' }, { status: 400 });
  }

  const layerList = layers as string[];

  // Run layers in parallel
  const [pixels, meta, google] = await Promise.all([
    layerList.includes('pixels') && website ? detectPixels(website as string) : Promise.resolve({
      facebook_pixel: false, google_ads_tag: false, google_tag_manager: false,
      tiktok_pixel: false, linkedin_insight: false, any_pixel: false,
    }),
    layerList.includes('meta') ? checkMetaAds(business_name as string, country as string) : Promise.resolve({
      checked: false, running: false, active_count: 0, platforms: [], ads_preview: [], error: 'skipped',
    }),
    layerList.includes('google') ? checkGoogleAds(business_name as string, (website as string) || null) : Promise.resolve({
      checked: false, running: false, active_count: 0, formats: [],
      advertiser_name: null, ads_preview: [], error: 'skipped',
    }),
  ]);

  const { status, confidence } = determineOverallStatus(pixels, meta, google);

  const result: AdDetectionResult = {
    business_name: business_name as string,
    website: (website as string) || null,
    pixels,
    meta_ads: meta,
    google_ads: google,
    overall_status: status,
    confidence,
    checked_at: new Date().toISOString(),
  };

  return NextResponse.json({ success: true, result });
}

// ═══ BATCH DETECTION (multiple businesses) ═══
async function detectAdsBatch(body: Record<string, unknown>) {
  const { businesses, country = 'United Kingdom' } = body;

  if (!Array.isArray(businesses) || businesses.length === 0) {
    return NextResponse.json({ error: 'businesses array required' }, { status: 400 });
  }

  // Process in batches of 3 to avoid rate limits
  const results: AdDetectionResult[] = [];
  const batchSize = 3;

  for (let i = 0; i < Math.min(businesses.length, 20); i += batchSize) {
    const batch = businesses.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map(async (biz: Record<string, unknown>) => {
        const [pixels, meta, google] = await Promise.all([
          biz.website ? detectPixels(biz.website as string) : Promise.resolve({
            facebook_pixel: false, google_ads_tag: false, google_tag_manager: false,
            tiktok_pixel: false, linkedin_insight: false, any_pixel: false,
          }),
          checkMetaAds(biz.business_name as string, country as string),
          checkGoogleAds(biz.business_name as string, (biz.website as string) || null),
        ]);

        const { status, confidence } = determineOverallStatus(pixels, meta, google);

        return {
          business_name: biz.business_name as string,
          website: (biz.website as string) || null,
          pixels,
          meta_ads: meta,
          google_ads: google,
          overall_status: status,
          confidence,
          checked_at: new Date().toISOString(),
        } as AdDetectionResult;
      })
    );
    results.push(...batchResults);

    // Small delay between batches
    if (i + batchSize < businesses.length) {
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  // Summary stats
  const summary = {
    total: results.length,
    running_meta: results.filter(r => r.meta_ads.running).length,
    running_google: results.filter(r => r.google_ads.running).length,
    running_both: results.filter(r => r.meta_ads.running && r.google_ads.running).length,
    pixel_only: results.filter(r => r.overall_status === 'pixel_only').length,
    no_ads: results.filter(r => r.overall_status === 'none').length,
  };

  return NextResponse.json({ success: true, results, summary });
}

// ═══ DETECT ADS FOR A LEAD (by lead_id) ═══
async function detectAdsForLead(body: Record<string, unknown>) {
  const { lead_id } = body;
  if (!lead_id) return NextResponse.json({ error: 'lead_id required' }, { status: 400 });

  const { data: lead, error: leadErr } = await supabase
    .from('leads')
    .select('id, business_name, website, country')
    .eq('id', lead_id as string)
    .single();

  if (leadErr || !lead) {
    return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
  }

  const [pixels, meta, google] = await Promise.all([
    lead.website ? detectPixels(lead.website) : Promise.resolve({
      facebook_pixel: false, google_ads_tag: false, google_tag_manager: false,
      tiktok_pixel: false, linkedin_insight: false, any_pixel: false,
    }),
    checkMetaAds(lead.business_name, lead.country || 'United Kingdom'),
    checkGoogleAds(lead.business_name, lead.website || null),
  ]);

  const { status, confidence } = determineOverallStatus(pixels, meta, google);

  // Save results to lead
  const adDetectionData = {
    pixels,
    meta_ads: {
      running: meta.running,
      active_count: meta.active_count,
      platforms: meta.platforms,
      checked_at: new Date().toISOString(),
    },
    google_ads: {
      running: google.running,
      active_count: google.active_count,
      formats: google.formats,
      advertiser_name: google.advertiser_name,
      checked_at: new Date().toISOString(),
    },
    overall_status: status,
    confidence,
    last_checked: new Date().toISOString(),
  };

  await supabase.from('leads').update({
    ad_detection_data: adDetectionData,
    ad_activity: status === 'active_both' || status === 'active_meta' || status === 'active_google'
      ? 'active' : status === 'pixel_only' ? 'pixel_only' : 'none',
  }).eq('id', lead_id as string);

  return NextResponse.json({
    success: true,
    result: {
      business_name: lead.business_name,
      website: lead.website,
      pixels,
      meta_ads: meta,
      google_ads: google,
      overall_status: status,
      confidence,
      checked_at: new Date().toISOString(),
    },
  });
}
