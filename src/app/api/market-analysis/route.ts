import { NextRequest, NextResponse } from 'next/server';

import { supabaseAdmin as supabase } from "@/lib/supabase-admin";
import { authOr401 } from "@/lib/api-auth";

interface MarketBusiness {
  id?: string;
  business_name: string;
  website: string | null;
  google_rating: number | null;
  google_review_count: number | null;
  phone: string | null;
  email: string | null;
  has_website: boolean;
  website_score: number | null;
  has_ssl: boolean;
  has_booking: boolean;
  has_social_media: boolean;
  ad_activity: 'active' | 'pixel_only' | 'none' | 'unknown';
  social_platforms: string[];
  strengths: string[];
  weaknesses: string[];
}

interface MarketAnalysis {
  niche: string;
  location: string;
  country: string;
  total_businesses: number;
  market_overview: {
    avg_rating: number;
    avg_review_count: number;
    avg_website_score: number;
    pct_with_website: number;
    pct_with_email: number;
    pct_with_booking: number;
    pct_with_ssl: number;
    pct_with_social: number;
    pct_running_ads: number;
  };
  top_performers: MarketBusiness[];
  weakest_performers: MarketBusiness[];
  all_businesses: MarketBusiness[];
  opportunities: string[];
  pitch_angles: { angle: string; target_count: number; description: string }[];
}

// Quick Meta Ad Library check
async function checkMetaAds(businessName: string): Promise<boolean> {
  const metaToken = process.env.META_AD_LIBRARY_TOKEN;
  if (!metaToken) return false;
  try {
    const searchTerm = encodeURIComponent(businessName);
    const url = `https://graph.facebook.com/v21.0/ads_archive?search_terms=${searchTerm}&ad_reached_countries=["GB","US","CA"]&ad_active_status=ACTIVE&fields=id&limit=1&access_token=${metaToken}`;
    const resp = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!resp.ok) return false;
    const data = await resp.json();
    return (data?.data?.length || 0) > 0;
  } catch {
    return false;
  }
}

// Quick website check using Firecrawl
async function quickWebsiteAudit(website: string): Promise<{
  score: number; ssl: boolean; booking: boolean; social: boolean;
  adPixels: boolean; socialPlatforms: string[];
}> {
  const firecrawlKey = process.env.FIRECRAWL_API_KEY || '';
  const defaults = { score: 0, ssl: false, booking: false, social: false, adPixels: false, socialPlatforms: [] as string[] };

  if (!firecrawlKey || !website) return defaults;

  try {
    const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${firecrawlKey}` },
      body: JSON.stringify({ url: website, formats: ['html'], onlyMainContent: false }),
    });

    if (!response.ok) return defaults;
    const data = await response.json();
    const html = (data?.data?.html || '').toLowerCase();

    let score = 30; // Base score for having a website
    const ssl = website.startsWith('https');
    if (ssl) score += 10;

    const booking = html.includes('book now') || html.includes('booking') || html.includes('schedule') || html.includes('appointment') || html.includes('reserve') || html.includes('fresha') || html.includes('treatwell');
    if (booking) score += 15;

    const socialPlatforms: string[] = [];
    if (html.includes('facebook.com/')) { socialPlatforms.push('Facebook'); score += 5; }
    if (html.includes('instagram.com/')) { socialPlatforms.push('Instagram'); score += 5; }
    if (html.includes('tiktok.com/')) { socialPlatforms.push('TikTok'); score += 5; }
    if (html.includes('linkedin.com/')) { socialPlatforms.push('LinkedIn'); score += 3; }
    if (html.includes('youtube.com/')) { socialPlatforms.push('YouTube'); score += 3; }
    if (html.includes('twitter.com/') || html.includes('x.com/')) { socialPlatforms.push('X/Twitter'); score += 2; }
    const social = socialPlatforms.length > 0;

    const adPixels = html.includes('fbq(') || html.includes('gtag(') || html.includes('googleadservices') || html.includes('googletagmanager') || html.includes('facebook.com/tr');
    if (adPixels) score += 10;

    if (html.includes('chat') || html.includes('messenger') || html.includes('whatsapp')) score += 5;
    if (html.includes('tel:') || html.includes('click-to-call') || html.includes('phone')) score += 3;
    if (html.includes('schema.org') || html.includes('application/ld+json')) score += 4;

    return { score: Math.min(score, 100), ssl, booking, social, adPixels, socialPlatforms };
  } catch {
    return defaults;
  }
}

export async function POST(request: NextRequest) {
  const _auth = await authOr401(); if (_auth instanceof Response) return _auth;
  try {
    const { niche, location, country = 'United Kingdom', leadId } = await request.json();

    // Option 1: Analyze existing leads from a search
    // Option 2: Provide niche + location to analyze from scratch
    let leads: Record<string, unknown>[] = [];

    if (leadId) {
      // Single lead — get their market (same city + similar businesses)
      const { data: lead } = await supabase.from('leads').select('*').eq('id', leadId).single();
      if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });

      const { data: marketLeads } = await supabase
        .from('leads')
        .select('*')
        .ilike('city', `%${lead.city || location}%`)
        .limit(50);

      leads = marketLeads || [];
      if (!leads.find(l => l.id === leadId)) leads.push(lead);
    } else if (niche && location) {
      // Get leads matching this niche + location from the database
      const { data: existingLeads } = await supabase
        .from('leads')
        .select('*')
        .ilike('city', `%${location}%`)
        .limit(50);

      leads = existingLeads || [];

      // If not enough leads, scrape fresh ones
      if (leads.length < 5) {
        try {
          const scrapeResponse = await fetch(new URL('/api/scrape', request.url).toString(), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ niche, location, country, source: 'google_maps' }),
          });
          if (scrapeResponse.ok) {
            const scrapeData = await scrapeResponse.json();
            // Map scrape results to lead-like objects
            const scraped = (scrapeData.results || []).map((r: Record<string, unknown>) => ({
              ...r,
              id: null, // Not yet saved
            }));
            leads = [...leads, ...scraped];
          }
        } catch {
          // Continue with what we have
        }
      }
    } else {
      return NextResponse.json({ error: 'Provide niche + location or leadId' }, { status: 400 });
    }

    if (leads.length === 0) {
      return NextResponse.json({ error: 'No businesses found to analyze' }, { status: 404 });
    }

    // Analyze each business (limit concurrent website checks)
    const businesses: MarketBusiness[] = [];
    const batchSize = 3;

    for (let i = 0; i < Math.min(leads.length, 20); i += batchSize) {
      const batch = leads.slice(i, i + batchSize);
      const results = await Promise.all(batch.map(async (lead) => {
        const website = lead.website as string | null;
        let audit = { score: 0, ssl: false, booking: false, social: false, adPixels: false, socialPlatforms: [] as string[] };

        if (website) {
          audit = await quickWebsiteAudit(website);
        }

        // Determine ad activity — check Meta Ad Library + pixels
        let adActivity: 'active' | 'pixel_only' | 'none' | 'unknown' = 'unknown';
        if (lead.ad_detection_data) {
          const adData = lead.ad_detection_data as Record<string, unknown>;
          const gAds = adData.google_ads as Record<string, unknown> | undefined;
          const fAds = adData.facebook_ads as Record<string, unknown> | undefined;
          if (gAds?.detected || fAds?.detected) adActivity = 'active';
          else if (audit.adPixels) adActivity = 'pixel_only';
          else adActivity = 'none';
        } else {
          // Check Meta Ad Library for active ads
          const hasMetaAds = await checkMetaAds(lead.business_name as string);
          if (hasMetaAds) {
            adActivity = 'active';
          } else if (audit.adPixels) {
            // Has Google Ads conversion tag or FB pixel = likely running ads
            adActivity = 'pixel_only';
          } else if (website) {
            adActivity = 'none';
          }
        }

        // Identify strengths and weaknesses
        const strengths: string[] = [];
        const weaknesses: string[] = [];
        const rating = lead.google_rating as number | null;
        const reviews = lead.google_review_count as number | null;

        if (rating && rating >= 4.5) strengths.push('Excellent rating');
        else if (rating && rating < 4.0) weaknesses.push('Below average rating');

        if (reviews && reviews >= 50) strengths.push('Strong review count');
        else if (reviews && reviews < 15) weaknesses.push('Low review count');

        if (audit.score >= 70) strengths.push('Strong website');
        else if (website && audit.score < 40) weaknesses.push('Weak website');
        else if (!website) weaknesses.push('No website');

        if (audit.booking) strengths.push('Online booking');
        else weaknesses.push('No online booking');

        if (adActivity === 'active') strengths.push('Running paid ads');
        else if (adActivity === 'none') weaknesses.push('No paid advertising');

        if (audit.socialPlatforms.length >= 3) strengths.push('Active on multiple social platforms');
        else if (audit.socialPlatforms.length === 0) weaknesses.push('No social media presence');

        return {
          id: lead.id as string | undefined,
          business_name: lead.business_name as string,
          website,
          address: (lead.address as string) || null,
          city: (lead.city as string) || null,
          phone: (lead.phone as string) || null,
          email: (lead.email as string) || null,
          instagram_url: (lead.instagram_url as string) || null,
          google_rating: rating,
          google_review_count: reviews,
          has_website: !!website,
          website_score: website ? audit.score : null,
          has_ssl: audit.ssl,
          has_booking: audit.booking,
          has_social_media: audit.social,
          ad_activity: adActivity,
          social_platforms: audit.socialPlatforms,
          strengths,
          weaknesses,
        };
      }));

      businesses.push(...results);
    }

    // Calculate market overview stats
    const withRating = businesses.filter(b => b.google_rating !== null);
    const withReviews = businesses.filter(b => b.google_review_count !== null);
    const withWebsite = businesses.filter(b => b.has_website);
    const withScore = businesses.filter(b => b.website_score !== null);

    const marketOverview = {
      avg_rating: withRating.length > 0 ? Number((withRating.reduce((s, b) => s + (b.google_rating || 0), 0) / withRating.length).toFixed(1)) : 0,
      avg_review_count: withReviews.length > 0 ? Math.round(withReviews.reduce((s, b) => s + (b.google_review_count || 0), 0) / withReviews.length) : 0,
      avg_website_score: withScore.length > 0 ? Math.round(withScore.reduce((s, b) => s + (b.website_score || 0), 0) / withScore.length) : 0,
      pct_with_website: Math.round((withWebsite.length / businesses.length) * 100),
      pct_with_email: Math.round((businesses.filter(b => b.email).length / businesses.length) * 100),
      pct_with_booking: Math.round((businesses.filter(b => b.has_booking).length / businesses.length) * 100),
      pct_with_ssl: Math.round((businesses.filter(b => b.has_ssl).length / businesses.length) * 100),
      pct_with_social: Math.round((businesses.filter(b => b.has_social_media).length / businesses.length) * 100),
      pct_running_ads: Math.round((businesses.filter(b => b.ad_activity === 'active').length / businesses.length) * 100),
    };

    // Sort by composite score (rating * review count * website score)
    const scored = businesses.map(b => ({
      ...b,
      composite: ((b.google_rating || 0) * 20) + ((b.google_review_count || 0) * 0.5) + (b.website_score || 0),
    })).sort((a, b) => b.composite - a.composite);

    const topPerformers = scored.slice(0, 5);
    const weakestPerformers = scored.slice(-5).reverse();

    // Generate pitch angles
    const pitchAngles: { angle: string; target_count: number; description: string }[] = [];

    const noAds = businesses.filter(b => b.ad_activity === 'none' || b.ad_activity === 'unknown').length;
    if (noAds > 0) {
      pitchAngles.push({
        angle: '🎯 Not Running Ads',
        target_count: noAds,
        description: `${noAds} businesses have no paid advertising. Their competitors are capturing their potential customers through Google and Facebook ads.`,
      });
    }

    const lowReviews = businesses.filter(b => (b.google_review_count || 0) < marketOverview.avg_review_count).length;
    if (lowReviews > 0) {
      pitchAngles.push({
        angle: '⭐ Below-Average Reviews',
        target_count: lowReviews,
        description: `${lowReviews} businesses have fewer reviews than the market average of ${marketOverview.avg_review_count}. Review generation could transform their visibility.`,
      });
    }

    const noBooking = businesses.filter(b => !b.has_booking).length;
    if (noBooking > 0) {
      pitchAngles.push({
        angle: '📅 No Online Booking',
        target_count: noBooking,
        description: `${noBooking} businesses lack online booking. In 2025, customers expect to book instantly — this is a quick win.`,
      });
    }

    const weakWebsites = businesses.filter(b => b.has_website && (b.website_score || 0) < 50).length;
    if (weakWebsites > 0) {
      pitchAngles.push({
        angle: '🌐 Weak Website',
        target_count: weakWebsites,
        description: `${weakWebsites} businesses have websites scoring below 50/100. Poor websites drive customers to competitors.`,
      });
    }

    const noWebsite = businesses.filter(b => !b.has_website).length;
    if (noWebsite > 0) {
      pitchAngles.push({
        angle: '🚫 No Website',
        target_count: noWebsite,
        description: `${noWebsite} businesses have no website at all. They're invisible to anyone searching online.`,
      });
    }

    const noSocial = businesses.filter(b => !b.has_social_media).length;
    if (noSocial > 0) {
      pitchAngles.push({
        angle: '📱 No Social Media',
        target_count: noSocial,
        description: `${noSocial} businesses have zero social media presence. They're missing out on the #1 way people discover local businesses.`,
      });
    }

    // Generate market opportunities
    const opportunities: string[] = [];
    if (marketOverview.pct_running_ads < 30) {
      opportunities.push(`Only ${marketOverview.pct_running_ads}% of businesses in this market are running paid ads — massive opportunity for first-movers`);
    }
    if (marketOverview.avg_review_count < 30) {
      opportunities.push(`Average review count is only ${marketOverview.avg_review_count} — a review generation service could quickly differentiate clients`);
    }
    if (marketOverview.avg_website_score < 60) {
      opportunities.push(`Average website score is just ${marketOverview.avg_website_score}/100 — web design/optimisation has high demand here`);
    }
    if (marketOverview.pct_with_booking < 50) {
      opportunities.push(`Only ${marketOverview.pct_with_booking}% have online booking — adding booking systems is a quick-win service`);
    }
    if (marketOverview.pct_with_social < 60) {
      opportunities.push(`Only ${marketOverview.pct_with_social}% are active on social media — social media management is undersold here`);
    }

    const analysis: MarketAnalysis = {
      niche: niche || 'Various',
      location: location || 'Unknown',
      country: country || 'United Kingdom',
      total_businesses: businesses.length,
      market_overview: marketOverview,
      top_performers: topPerformers,
      weakest_performers: weakestPerformers,
      all_businesses: businesses,
      opportunities,
      pitch_angles: pitchAngles.sort((a, b) => b.target_count - a.target_count),
    };

    // Save to database
    await supabase.from('market_analyses').insert({
      niche: analysis.niche,
      location: analysis.location,
      country: analysis.country,
      total_businesses: analysis.total_businesses,
      market_data: analysis,
    });

    await supabase.from('activity_log').insert({
      action_type: 'audit',
      description: `Market analysis completed: ${businesses.length} businesses in ${location} (${niche})`,
    });

    return NextResponse.json({ success: true, analysis });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Market analysis failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// GET — Fetch analysis history
export async function GET() {
  const _auth = await authOr401(); if (_auth instanceof Response) return _auth;
  try {
    const { data, error } = await supabase
      .from('market_analyses')
      .select('id, niche, location, country, total_businesses, created_at, market_data')
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) throw error;
    return NextResponse.json({ success: true, analyses: data || [] });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to fetch history';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// DELETE — Remove saved analysis
export async function DELETE(request: NextRequest) {
  const _auth = await authOr401(); if (_auth instanceof Response) return _auth;
  try {
    const { id } = await request.json();
    if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 });
    const { error } = await supabase.from('market_analyses').delete().eq('id', id);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Delete failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
