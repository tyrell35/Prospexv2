import { NextRequest, NextResponse } from 'next/server';

import { supabaseAdmin as supabase } from "@/lib/supabase-admin";
import { authOr401 } from "@/lib/api-auth";

// ═══════════════════════════════════════════════════════════
// REVENUE LOSS CALCULATOR
// Shows prospects exactly how much money they're leaving
// on the table vs competitors. Powers the outreach scripts.
// ═══════════════════════════════════════════════════════════

interface RevenueLoss {
  lead_id: string;
  business_name: string;
  city: string;

  // Review gap losses
  review_gap: {
    their_reviews: number;
    competitor_reviews: number;
    gap: number;
    estimated_lost_bookings_monthly: number;
    estimated_lost_revenue_monthly: number;
    estimated_lost_revenue_annual: number;
  };

  // Website losses
  website_losses: {
    website_score: number | null;
    competitor_avg_score: number | null;
    bounce_rate_estimate: string;
    estimated_lost_visitors_monthly: number;
    estimated_lost_revenue_monthly: number;
  };

  // Ad gap losses
  ad_gap: {
    running_ads: boolean;
    competitors_running_ads: number;
    estimated_competitor_ad_spend: string;
    estimated_lost_leads_monthly: number;
    estimated_lost_revenue_monthly: number;
  };

  // Social presence losses
  social_gap: {
    has_social: boolean;
    competitors_with_social: number;
    estimated_lost_discovery_monthly: number;
  };

  // Totals
  total_estimated_monthly_loss: number;
  total_estimated_annual_loss: number;
  loss_grade: 'critical' | 'high' | 'moderate' | 'low';
  top_3_fixes: string[];
  pitch_hook: string;
}

// Average ticket prices by treatment/niche (UK market)
const TICKET_PRICES: Record<string, number> = {
  'aesthetic clinic': 250,
  'med spa': 300,
  'medspa': 300,
  'beauty': 80,
  'beauty salon': 80,
  'hair salon': 65,
  'dentist': 200,
  'dental': 200,
  'dermatologist': 350,
  'skin clinic': 200,
  'laser': 250,
  'botox': 350,
  'cosmetic': 400,
  'plastic surgery': 2000,
  'wellness': 150,
  'spa': 120,
  'physiotherapy': 60,
  'chiropractor': 55,
  'default': 200,
};

function getAvgTicket(niche: string | null): number {
  if (!niche) return TICKET_PRICES.default;
  const lower = niche.toLowerCase();
  for (const [key, val] of Object.entries(TICKET_PRICES)) {
    if (lower.includes(key)) return val;
  }
  return TICKET_PRICES.default;
}

export async function POST(request: NextRequest) {
  const _auth = await authOr401(); if (_auth instanceof Response) return _auth;
  try {
    const body = await request.json();
    const { action = 'calculate' } = body;

    switch (action) {
      case 'calculate':
        return calculateForLead(body);
      case 'calculate_batch':
        return calculateBatch(body);
      case 'get_market_context':
        return getMarketContext(body);
      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Calculator error' }, { status: 500 });
  }
}

async function calculateForLead(body: Record<string, unknown>) {
  const { lead_id } = body;
  if (!lead_id) return NextResponse.json({ error: 'lead_id required' }, { status: 400 });

  // Get lead data
  const { data: lead, error } = await supabase
    .from('leads')
    .select('*')
    .eq('id', lead_id as string)
    .single();

  if (error || !lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });

  // Get competitors in same city/niche for context
  const { data: competitors } = await supabase
    .from('leads')
    .select('business_name, google_rating, google_review_count, has_website, has_social, website, audit_score, ad_count')
    .eq('city', lead.city || '')
    .eq('niche', lead.niche || '')
    .neq('id', lead.id)
    .order('google_review_count', { ascending: false, nullsFirst: false })
    .limit(10);

  const comps = competitors || [];
  const avgTicket = getAvgTicket(lead.niche);

  // ═══ REVIEW GAP ═══
  const theirReviews = lead.google_review_count || 0;
  const topCompetitorReviews = comps.length > 0 ? (comps[0].google_review_count || 0) : 0;
  const avgReviews = comps.length > 0
    ? Math.round(comps.reduce((s: number, c: Record<string, unknown>) => s + ((c.google_review_count as number) || 0), 0) / comps.length)
    : 0;
  const reviewGap = Math.max(topCompetitorReviews - theirReviews, 0);

  // Research shows ~15% of local searches result in a purchase
  // Higher-reviewed businesses capture disproportionately more clicks
  // Every 50-review gap ≈ 5-8 lost bookings/month
  const lostBookingsFromReviews = Math.round((reviewGap / 50) * 6);
  const reviewLossMonthly = lostBookingsFromReviews * avgTicket;

  // ═══ WEBSITE LOSSES ═══
  const websiteScore = lead.audit_score || lead.website_score || null;
  const compAvgScore = comps.length > 0
    ? Math.round(comps.filter((c: Record<string, unknown>) => c.audit_score).reduce((s: number, c: Record<string, unknown>) => s + ((c.audit_score as number) || 50), 0) / Math.max(comps.filter((c: Record<string, unknown>) => c.audit_score).length, 1))
    : null;

  let bounceEstimate = 'normal';
  let lostVisitors = 0;
  let websiteLossMonthly = 0;

  if (websiteScore !== null) {
    if (websiteScore < 30) {
      bounceEstimate = '60-70% bounce rate';
      lostVisitors = 150;
      websiteLossMonthly = Math.round(lostVisitors * 0.03 * avgTicket); // 3% conversion
    } else if (websiteScore < 50) {
      bounceEstimate = '45-55% bounce rate';
      lostVisitors = 100;
      websiteLossMonthly = Math.round(lostVisitors * 0.03 * avgTicket);
    } else if (websiteScore < 70) {
      bounceEstimate = '30-40% bounce rate';
      lostVisitors = 50;
      websiteLossMonthly = Math.round(lostVisitors * 0.03 * avgTicket);
    }
  } else if (!lead.has_website || !lead.website) {
    bounceEstimate = 'No website — 100% loss';
    lostVisitors = 200;
    websiteLossMonthly = Math.round(lostVisitors * 0.05 * avgTicket);
  }

  // ═══ AD GAP ═══
  const runningAds = (lead.ad_count || 0) > 0 || lead.ad_activity === 'active';
  const competitorsWithAds = comps.filter((c: Record<string, unknown>) => ((c.ad_count as number) || 0) > 0).length;
  let adLostLeads = 0;
  let adLossMonthly = 0;

  if (!runningAds && competitorsWithAds > 0) {
    // Each competitor running ads captures ~10-15 paid leads/month you're missing
    adLostLeads = competitorsWithAds * 12;
    adLossMonthly = Math.round(adLostLeads * 0.25 * avgTicket); // 25% close rate on paid leads
  }

  const competitorAdSpend = competitorsWithAds > 0
    ? `£${competitorsWithAds * 500}-£${competitorsWithAds * 1500}/mo combined`
    : 'None detected';

  // ═══ SOCIAL GAP ═══
  const hasSocial = lead.has_social || !!lead.instagram_url;
  const competitorsWithSocial = comps.filter((c: Record<string, unknown>) => c.has_social).length;
  const socialLostDiscovery = !hasSocial ? 30 : 0; // ~30 discovery visits/month from social

  // ═══ TOTALS ═══
  const totalMonthly = reviewLossMonthly + websiteLossMonthly + adLossMonthly + (socialLostDiscovery * avgTicket * 0.02);
  const totalAnnual = totalMonthly * 12;

  let lossGrade: 'critical' | 'high' | 'moderate' | 'low' = 'low';
  if (totalMonthly > 10000) lossGrade = 'critical';
  else if (totalMonthly > 5000) lossGrade = 'high';
  else if (totalMonthly > 2000) lossGrade = 'moderate';

  // ═══ TOP FIXES ═══
  const fixes: Array<{ priority: number; fix: string }> = [];
  if (reviewGap > 20) fixes.push({ priority: reviewLossMonthly, fix: `Close the ${reviewGap}-review gap with competitors (worth ~£${reviewLossMonthly.toLocaleString()}/mo)` });
  if (websiteScore !== null && websiteScore < 50) fixes.push({ priority: websiteLossMonthly, fix: `Website rebuild — current score ${websiteScore}/100 is losing ${bounceEstimate} of visitors (worth ~£${websiteLossMonthly.toLocaleString()}/mo)` });
  if (!lead.has_website) fixes.push({ priority: websiteLossMonthly, fix: `Build a professional website — you are invisible to 85% of potential clients (worth ~£${websiteLossMonthly.toLocaleString()}/mo)` });
  if (!runningAds && competitorsWithAds > 0) fixes.push({ priority: adLossMonthly, fix: `Start running ads — ${competitorsWithAds} competitors are capturing ~${adLostLeads} paid leads/month you are missing (worth ~£${adLossMonthly.toLocaleString()}/mo)` });
  if (!hasSocial) fixes.push({ priority: 500, fix: `Build social media presence — competitors are getting discovered through Instagram/Facebook` });

  fixes.sort((a, b) => b.priority - a.priority);
  const top3 = fixes.slice(0, 3).map(f => f.fix);

  // ═══ PITCH HOOK ═══
  let pitchHook = '';
  if (reviewGap > 50) {
    pitchHook = `Your top competitor in ${lead.city} has ${topCompetitorReviews} Google reviews to your ${theirReviews}. That ${reviewGap}-review gap is routing approximately £${reviewLossMonthly.toLocaleString()}/month in bookings to them instead of you.`;
  } else if (websiteScore !== null && websiteScore < 40) {
    pitchHook = `Your website scores ${websiteScore}/100 on Google's speed test. That means roughly ${bounceEstimate} of visitors are leaving before the page loads. At your average treatment price, that is approximately £${websiteLossMonthly.toLocaleString()}/month in lost bookings.`;
  } else if (!runningAds && competitorsWithAds > 0) {
    pitchHook = `${competitorsWithAds} of your competitors in ${lead.city} are running paid ads and you are not. They are capturing approximately ${adLostLeads} leads/month that could be yours — worth roughly £${adLossMonthly.toLocaleString()}/month.`;
  } else {
    pitchHook = `Based on our audit, ${lead.business_name} is leaving approximately £${Math.round(totalMonthly).toLocaleString()}/month on the table compared to the top competitors in ${lead.city}.`;
  }

  const result: RevenueLoss = {
    lead_id: lead.id,
    business_name: lead.business_name,
    city: lead.city || '',
    review_gap: {
      their_reviews: theirReviews,
      competitor_reviews: topCompetitorReviews,
      gap: reviewGap,
      estimated_lost_bookings_monthly: lostBookingsFromReviews,
      estimated_lost_revenue_monthly: reviewLossMonthly,
      estimated_lost_revenue_annual: reviewLossMonthly * 12,
    },
    website_losses: {
      website_score: websiteScore,
      competitor_avg_score: compAvgScore,
      bounce_rate_estimate: bounceEstimate,
      estimated_lost_visitors_monthly: lostVisitors,
      estimated_lost_revenue_monthly: websiteLossMonthly,
    },
    ad_gap: {
      running_ads: runningAds,
      competitors_running_ads: competitorsWithAds,
      estimated_competitor_ad_spend: competitorAdSpend,
      estimated_lost_leads_monthly: adLostLeads,
      estimated_lost_revenue_monthly: adLossMonthly,
    },
    social_gap: {
      has_social: hasSocial,
      competitors_with_social: competitorsWithSocial,
      estimated_lost_discovery_monthly: socialLostDiscovery,
    },
    total_estimated_monthly_loss: Math.round(totalMonthly),
    total_estimated_annual_loss: Math.round(totalAnnual),
    loss_grade: lossGrade,
    top_3_fixes: top3,
    pitch_hook: pitchHook,
  };

  // Save to lead for quick access later
  await supabase.from('leads').update({
    revenue_loss_data: result,
    estimated_monthly_loss: Math.round(totalMonthly),
  }).eq('id', lead.id);

  return NextResponse.json({ success: true, result });
}

async function calculateBatch(body: Record<string, unknown>) {
  const { lead_ids } = body;
  if (!Array.isArray(lead_ids)) return NextResponse.json({ error: 'lead_ids array required' }, { status: 400 });

  const results: any[] = [];
  for (const id of lead_ids.slice(0, 20)) {
    const res = await calculateForLead({ lead_id: id });
    const data = await res.json();
    if (data.success) results.push(data.result);
  }

  return NextResponse.json({
    success: true,
    results,
    summary: {
      total_leads: results.length,
      total_monthly_loss: results.reduce((s, r) => s + r.total_estimated_monthly_loss, 0),
      avg_monthly_loss: Math.round(results.reduce((s, r) => s + r.total_estimated_monthly_loss, 0) / Math.max(results.length, 1)),
      critical: results.filter(r => r.loss_grade === 'critical').length,
      high: results.filter(r => r.loss_grade === 'high').length,
    },
  });
}

async function getMarketContext(body: Record<string, unknown>) {
  const { city, niche } = body;
  if (!city || !niche) return NextResponse.json({ error: 'city and niche required' }, { status: 400 });

  const { data: leads } = await supabase
    .from('leads')
    .select('google_review_count, google_rating, audit_score, has_website, has_social, ad_count')
    .eq('city', city as string)
    .eq('niche', niche as string);

  const all = leads || [];
  if (all.length === 0) return NextResponse.json({ success: true, context: null });

  const withReviews = all.filter(l => l.google_review_count);
  const avgReviews = withReviews.length > 0
    ? Math.round(withReviews.reduce((s, l) => s + (l.google_review_count || 0), 0) / withReviews.length) : 0;
  const topReviews = withReviews.length > 0
    ? Math.max(...withReviews.map(l => l.google_review_count || 0)) : 0;
  const avgRating = withReviews.length > 0
    ? Number((withReviews.reduce((s, l) => s + (l.google_rating || 0), 0) / withReviews.length).toFixed(1)) : 0;

  return NextResponse.json({
    success: true,
    context: {
      city, niche,
      total_businesses: all.length,
      avg_review_count: avgReviews,
      top_review_count: topReviews,
      avg_rating: avgRating,
      pct_with_website: Math.round((all.filter(l => l.has_website).length / all.length) * 100),
      pct_with_social: Math.round((all.filter(l => l.has_social).length / all.length) * 100),
      pct_running_ads: Math.round((all.filter(l => (l.ad_count || 0) > 0).length / all.length) * 100),
    },
  });
}
