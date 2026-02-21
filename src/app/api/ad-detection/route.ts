import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

interface AdDetectionResult {
  google_ads: { detected: boolean; evidence: string[]; confidence: 'high' | 'medium' | 'low' | 'none' };
  facebook_ads: { detected: boolean; evidence: string[]; confidence: 'high' | 'medium' | 'low' | 'none' };
  tracking_pixels: { facebook_pixel: boolean; google_tag: boolean; tiktok_pixel: boolean; linkedin_pixel: boolean; bing_ads: boolean };
  social_media: { facebook: string | null; instagram: string | null; tiktok: string | null; linkedin: string | null; youtube: string | null; twitter: string | null };
  ad_score: number; // 0-100 — higher = more active advertising
  recommendations: string[];
}

// ─── CHECK WEBSITE FOR AD PIXELS & SOCIAL LINKS ────────────────
async function analyzeWebsite(website: string): Promise<{
  pixels: AdDetectionResult['tracking_pixels'];
  social: AdDetectionResult['social_media'];
  hasAdLandingPages: boolean;
  rawSignals: string[];
}> {
  const firecrawlKey = process.env.FIRECRAWL_API_KEY || '';
  const pixels = { facebook_pixel: false, google_tag: false, tiktok_pixel: false, linkedin_pixel: false, bing_ads: false };
  const social: AdDetectionResult['social_media'] = { facebook: null, instagram: null, tiktok: null, linkedin: null, youtube: null, twitter: null };
  const signals: string[] = [];

  if (!firecrawlKey || !website) return { pixels, social, hasAdLandingPages: false, rawSignals: signals };

  try {
    const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${firecrawlKey}` },
      body: JSON.stringify({ url: website, formats: ['markdown', 'html'], onlyMainContent: false }),
    });

    if (!response.ok) return { pixels, social, hasAdLandingPages: false, rawSignals: signals };
    const data = await response.json();
    const html = (data?.data?.html || '').toLowerCase();
    const md = (data?.data?.markdown || '').toLowerCase();
    const combined = html + ' ' + md;

    // Detect tracking pixels from HTML source
    if (html.includes('fbq(') || html.includes('facebook.com/tr') || html.includes('connect.facebook.net') || html.includes('fb-pixel') || html.includes('facebook pixel')) {
      pixels.facebook_pixel = true;
      signals.push('Facebook Pixel detected on website');
    }
    if (html.includes('gtag(') || html.includes('googletagmanager.com') || html.includes('google-analytics.com') || html.includes('ga.js') || html.includes('gtag.js') || html.includes('analytics.js')) {
      pixels.google_tag = true;
      signals.push('Google Tag / Analytics detected on website');
    }
    if (html.includes('googleadservices.com') || html.includes('googlesyndication') || html.includes('adwords') || html.includes('gads') || html.includes('google_conversion') || html.includes('ads/ga-audiences')) {
      pixels.google_tag = true;
      signals.push('Google Ads conversion tracking detected');
    }
    if (html.includes('tiktok.com/i18n/pixel') || html.includes('analytics.tiktok.com') || html.includes('ttq.load')) {
      pixels.tiktok_pixel = true;
      signals.push('TikTok Pixel detected on website');
    }
    if (html.includes('snap.licdn.com') || html.includes('linkedin.com/px') || html.includes('_linkedin_partner_id')) {
      pixels.linkedin_pixel = true;
      signals.push('LinkedIn Insight Tag detected on website');
    }
    if (html.includes('bat.bing.com') || html.includes('uetq') || html.includes('bing ads')) {
      pixels.bing_ads = true;
      signals.push('Bing Ads UET tag detected on website');
    }

    // Extract social media links
    const socialPatterns: [keyof typeof social, RegExp][] = [
      ['facebook', /(?:https?:\/\/)?(?:www\.)?facebook\.com\/([a-zA-Z0-9.]+)/i],
      ['instagram', /(?:https?:\/\/)?(?:www\.)?instagram\.com\/([a-zA-Z0-9_.]+)/i],
      ['tiktok', /(?:https?:\/\/)?(?:www\.)?tiktok\.com\/@([a-zA-Z0-9_.]+)/i],
      ['linkedin', /(?:https?:\/\/)?(?:www\.)?linkedin\.com\/(?:company|in)\/([a-zA-Z0-9-]+)/i],
      ['youtube', /(?:https?:\/\/)?(?:www\.)?youtube\.com\/(?:@|channel\/|c\/)([a-zA-Z0-9_-]+)/i],
      ['twitter', /(?:https?:\/\/)?(?:www\.)?(?:twitter|x)\.com\/([a-zA-Z0-9_]+)/i],
    ];

    for (const [platform, regex] of socialPatterns) {
      const match = combined.match(regex);
      if (match) {
        const handle = match[1];
        if (!['share', 'sharer', 'intent', 'login', 'signup', 'help', 'about', 'policy', 'terms', 'privacy'].includes(handle.toLowerCase())) {
          social[platform] = match[0];
        }
      }
    }

    // Check for ad-specific landing pages
    const hasAdLandingPages = combined.includes('utm_source') || combined.includes('utm_medium') || combined.includes('utm_campaign') || combined.includes('gclid') || combined.includes('fbclid');
    if (hasAdLandingPages) signals.push('UTM tracking parameters found (indicates paid campaigns)');

    return { pixels, social, hasAdLandingPages, rawSignals: signals };
  } catch {
    return { pixels, social, hasAdLandingPages: false, rawSignals: signals };
  }
}

// ─── CHECK GOOGLE ADS TRANSPARENCY CENTER ──────────────────────
async function checkGoogleAds(businessName: string, website: string): Promise<{ detected: boolean; evidence: string[]; confidence: 'high' | 'medium' | 'low' | 'none' }> {
  const firecrawlKey = process.env.FIRECRAWL_API_KEY || '';
  const evidence: string[] = [];

  if (!firecrawlKey) return { detected: false, evidence: [], confidence: 'none' };

  try {
    // Google Ads Transparency Center shows all active ads for an advertiser
    const domain = website.replace(/https?:\/\/(www\.)?/, '').replace(/\/.*/, '');
    const transparencyUrl = `https://adstransparency.google.com/?domain=${encodeURIComponent(domain)}`;

    const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${firecrawlKey}` },
      body: JSON.stringify({ url: transparencyUrl, formats: ['markdown'] }),
    });

    if (response.ok) {
      const data = await response.json();
      const md = (data?.data?.markdown || '').toLowerCase();

      if (md.includes('ads shown') || md.includes('ad creative') || md.includes('ads for this advertiser') || md.includes('running ads')) {
        evidence.push('Active ads found in Google Ads Transparency Center');
        return { detected: true, evidence, confidence: 'high' };
      }
      if (md.includes('no ads') || md.includes('no results') || md.length < 200) {
        evidence.push('No active ads found in Google Ads Transparency Center');
        return { detected: false, evidence, confidence: 'high' };
      }
    }

    // Fallback: search for their brand in Google and look for "Sponsored" indicators
    // The presence of Google Ads conversion tracking is also a strong signal
    return { detected: false, evidence: ['Could not verify Google Ads status'], confidence: 'low' };
  } catch {
    return { detected: false, evidence: ['Google Ads check failed'], confidence: 'none' };
  }
}

// ─── CHECK FACEBOOK AD LIBRARY ─────────────────────────────────
async function checkFacebookAds(businessName: string, facebookUrl: string | null): Promise<{ detected: boolean; evidence: string[]; confidence: 'high' | 'medium' | 'low' | 'none' }> {
  const firecrawlKey = process.env.FIRECRAWL_API_KEY || '';
  const evidence: string[] = [];

  if (!firecrawlKey) return { detected: false, evidence: [], confidence: 'none' };

  try {
    // Meta Ad Library is public — search by page name
    const searchTerm = facebookUrl
      ? facebookUrl.replace(/https?:\/\/(www\.)?facebook\.com\//, '').replace(/\/.*/, '')
      : businessName;

    const adLibraryUrl = `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=ALL&q=${encodeURIComponent(searchTerm)}`;

    const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${firecrawlKey}` },
      body: JSON.stringify({ url: adLibraryUrl, formats: ['markdown'] }),
    });

    if (response.ok) {
      const data = await response.json();
      const md = (data?.data?.markdown || '').toLowerCase();

      // Check if ads were found
      if (md.includes('active ads') || md.includes('started running') || md.includes('ad creative') || md.includes('impressions') || md.includes('platforms: facebook') || md.includes('platforms: instagram')) {
        evidence.push('Active ads found in Meta Ad Library');
        // Try to count ads
        const adCountMatch = md.match(/(\d+)\s*(?:active\s*)?ads?/);
        if (adCountMatch) evidence.push(`Approximately ${adCountMatch[1]} active ads detected`);
        return { detected: true, evidence, confidence: 'high' };
      }

      if (md.includes('no results') || md.includes('no ads') || md.length < 300) {
        evidence.push('No active ads found in Meta Ad Library');
        return { detected: false, evidence, confidence: 'high' };
      }
    }

    return { detected: false, evidence: ['Could not verify Facebook Ads status'], confidence: 'low' };
  } catch {
    return { detected: false, evidence: ['Facebook Ads check failed'], confidence: 'none' };
  }
}

// ─── GENERATE RECOMMENDATIONS ──────────────────────────────────
function generateRecommendations(result: AdDetectionResult): string[] {
  const recs: string[] = [];

  if (!result.google_ads.detected && !result.facebook_ads.detected) {
    recs.push('🚨 NOT running ANY paid advertising — competitors are capturing their potential customers');
    recs.push('💰 Google Ads would put them in front of people actively searching for their services TODAY');
    recs.push('📱 Facebook/Instagram Ads would build awareness and generate bookings from local audiences');
  }

  if (!result.google_ads.detected) {
    recs.push('🔍 No Google Ads detected — missing out on high-intent search traffic');
    recs.push('💡 Recommend: Start with Google Search Ads targeting "niche + location" keywords');
  }

  if (!result.facebook_ads.detected) {
    recs.push('📱 No Facebook/Instagram Ads detected — missing out on social media lead generation');
    recs.push('💡 Recommend: Start with local awareness + lead generation campaigns on Meta');
  }

  if (!result.tracking_pixels.facebook_pixel && result.social_media.facebook) {
    recs.push('⚠️ Has Facebook page but NO Facebook Pixel — cannot retarget website visitors');
    recs.push('💡 Quick win: Install Facebook Pixel to build retargeting audiences');
  }

  if (!result.tracking_pixels.google_tag) {
    recs.push('⚠️ No Google Analytics/Tag Manager — cannot track website performance');
    recs.push('💡 Quick win: Install Google Tag Manager for proper tracking');
  }

  if (!result.social_media.instagram) {
    recs.push('📸 No Instagram presence detected — missing the #1 platform for visual businesses');
  }

  if (!result.social_media.tiktok) {
    recs.push('🎵 No TikTok presence detected — fastest-growing platform for local discovery');
  }

  if (result.google_ads.detected && result.facebook_ads.detected) {
    recs.push('✅ Already running ads on both Google and Meta — focus on OPTIMISATION not setup');
    recs.push('💡 Pitch: Audit their current ad spend and show wasted budget / missed opportunities');
  }

  return recs;
}

// ─── CALCULATE AD SCORE ────────────────────────────────────────
function calculateAdScore(result: Omit<AdDetectionResult, 'ad_score' | 'recommendations'>): number {
  let score = 0;

  // Google Ads (25 pts)
  if (result.google_ads.detected) score += 25;

  // Facebook Ads (25 pts)
  if (result.facebook_ads.detected) score += 25;

  // Tracking pixels (30 pts total)
  if (result.tracking_pixels.google_tag) score += 10;
  if (result.tracking_pixels.facebook_pixel) score += 10;
  if (result.tracking_pixels.tiktok_pixel) score += 4;
  if (result.tracking_pixels.linkedin_pixel) score += 3;
  if (result.tracking_pixels.bing_ads) score += 3;

  // Social media presence (20 pts total)
  const socialCount = Object.values(result.social_media).filter(Boolean).length;
  score += Math.min(socialCount * 4, 20);

  return Math.min(score, 100);
}

// ─── MAIN HANDLER ──────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const { leadId } = await request.json();
    if (!leadId) return NextResponse.json({ error: 'leadId required' }, { status: 400 });

    const { data: lead } = await supabase.from('leads').select('*').eq('id', leadId).single();
    if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });

    if (!lead.website) {
      return NextResponse.json({ error: 'Lead has no website — cannot detect ad activity' }, { status: 400 });
    }

    // Run website analysis first (needed for other checks)
    const websiteAnalysis = await analyzeWebsite(lead.website);

    // Then run ad platform checks in parallel
    const [googleAds, facebookAds] = await Promise.all([
      checkGoogleAds(lead.business_name, lead.website),
      checkFacebookAds(lead.business_name, websiteAnalysis.social.facebook),
    ]);

    // Enhance Google Ads detection with pixel evidence
    const enhancedGoogleAds = { ...googleAds };
    if (!googleAds.detected && websiteAnalysis.pixels.google_tag && websiteAnalysis.hasAdLandingPages) {
      enhancedGoogleAds.detected = true;
      enhancedGoogleAds.confidence = 'medium';
      enhancedGoogleAds.evidence = [...googleAds.evidence, 'Google Ads conversion tracking + UTM parameters detected on website'];
    }

    // Enhance Facebook Ads detection with pixel evidence
    const enhancedFacebookAds = { ...facebookAds };
    if (!facebookAds.detected && websiteAnalysis.pixels.facebook_pixel) {
      enhancedFacebookAds.evidence = [...facebookAds.evidence, 'Facebook Pixel installed (may indicate past or planned ad campaigns)'];
      enhancedFacebookAds.confidence = 'medium';
    }

    const partialResult = {
      google_ads: enhancedGoogleAds,
      facebook_ads: enhancedFacebookAds,
      tracking_pixels: websiteAnalysis.pixels,
      social_media: websiteAnalysis.social,
    };

    const adScore = calculateAdScore(partialResult);
    const recommendations = generateRecommendations({ ...partialResult, ad_score: adScore, recommendations: [] });

    const result: AdDetectionResult = {
      ...partialResult,
      ad_score: adScore,
      recommendations,
    };

    // Save to lead record
    await supabase.from('leads').update({
      ad_detection_data: result,
      ad_score: adScore,
      updated_at: new Date().toISOString(),
    }).eq('id', leadId);

    // Log activity
    await supabase.from('activity_log').insert({
      action_type: 'audit',
      description: `Ad detection completed for ${lead.business_name} — Score: ${adScore}/100${!enhancedGoogleAds.detected && !enhancedFacebookAds.detected ? ' (NOT advertising)' : ''}`,
      lead_id: leadId,
    });

    return NextResponse.json({ success: true, result });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Ad detection failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
