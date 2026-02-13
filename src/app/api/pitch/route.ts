import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

function generateSEOPitch(lead: Record<string, unknown>, audit: Record<string, unknown>) {
  const seoData = audit.seo_data as Record<string, unknown> | null;
  const keywords = (seoData?.keywords || []) as Array<Record<string, unknown>>;
  const missingKeywords = keywords.filter(k => !k.position);
  const city = lead.city || lead.address || 'your area';
  return {
    hook: `Right now, potential customers are searching for services like yours every month in ${city}. Your competitors are getting that traffic — you're not.`,
    problem: `We found ${missingKeywords.length} high-value keywords where your business doesn't appear in Google results at all. Meanwhile, your competitors rank on page 1 for these terms and capture those potential clients.`,
    proof: `Our analysis shows ${keywords.filter(k => k.position).length} keywords where you have some visibility, but ${missingKeywords.length} critical keywords where you're completely invisible to potential customers.`,
    solution: `Our SEO strategy will target these missing keywords with optimised content, local SEO improvements, and technical fixes to push your business onto page 1.`,
    result: `Based on similar businesses in ${city}, we project a significant increase in organic website traffic within 90 days, translating to more enquiries and bookings.`,
    cta: 'Book a free SEO strategy call',
    data_points: keywords.slice(0, 5).map(k => ({ label: k.keyword as string, value: k.position ? `#${k.position}` : 'Not ranking', type: (k.position ? 'positive' : 'negative') as 'positive' | 'negative' })),
    competitor_comparisons: [],
  };
}

function generateReviewsPitch(lead: Record<string, unknown>, audit: Record<string, unknown>) {
  const reviewsData = audit.reviews_data as Record<string, unknown> | null;
  const rating = (reviewsData?.google_rating as number) || (lead.google_rating as number) || 0;
  const count = (reviewsData?.google_review_count as number) || (lead.google_review_count as number) || 0;
  const responseRate = (reviewsData?.response_rate as number) || 0;
  return {
    hook: `87% of consumers read Google reviews before choosing a local business. With ${count} reviews and a ${rating} rating, you're leaving money on the table.`,
    problem: `Your review count and rating are below where they need to be to consistently win new customers. ${responseRate < 50 ? `You're also only responding to ${responseRate}% of reviews, which signals to potential customers that you don't value feedback.` : ''}`,
    proof: `Our analysis of your competitors shows they're actively managing their online reputation, and it's working — they're attracting customers that could be yours.`,
    solution: `Our review generation system automates the process of collecting 5-star reviews from your happy customers, while managing and responding to all feedback.`,
    result: `Our clients typically gain 15-25 new reviews per month within 60 days, dramatically improving their visibility and conversion rates.`,
    cta: 'Book a free reputation strategy call',
    data_points: [
      { label: 'Current Rating', value: `${rating}/5`, type: (Number(rating) >= 4.5 ? 'positive' : 'negative') as 'positive' | 'negative' },
      { label: 'Total Reviews', value: String(count), type: (Number(count) >= 50 ? 'positive' : 'negative') as 'positive' | 'negative' },
      { label: 'Response Rate', value: `${responseRate}%`, type: (Number(responseRate) >= 50 ? 'positive' : 'negative') as 'positive' | 'negative' },
    ],
    competitor_comparisons: [],
  };
}

function generateAIPitch(lead: Record<string, unknown>, audit: Record<string, unknown>) {
  const aiData = audit.ai_visibility_data as Record<string, unknown> | null;
  const checks = (aiData?.checks || []) as Array<Record<string, unknown>>;
  const mentioned = checks.filter(c => c.is_mentioned).length;
  const city = lead.city || 'your area';
  return {
    hook: `800 million people use ChatGPT every week. When someone asks "best ${lead.business_name ? 'services' : 'business'} in ${city}", your competitors show up. You don't.`,
    problem: `We tested ${checks.length} AI search queries relevant to your business. You were mentioned in only ${mentioned} of them. AI search is the new frontier — and you're invisible.`,
    proof: `AI platforms like ChatGPT, Perplexity, and Google AI are increasingly how people discover local businesses. The businesses that appear in these results are capturing a growing share of new customers.`,
    solution: `Our GEO (Generative Engine Optimisation) strategy optimises your online presence specifically for AI discovery — structured data, authoritative content, and third-party citations.`,
    result: `We've helped businesses go from invisible to cited in AI search results within 60 days.`,
    cta: 'Book a free AI visibility audit call',
    data_points: checks.slice(0, 4).map(c => ({ label: c.query as string, value: c.is_mentioned ? 'Visible' : 'Invisible', type: (c.is_mentioned ? 'positive' : 'negative') as 'positive' | 'negative' })),
    competitor_comparisons: [],
  };
}

function generateCompetitorPitch(lead: Record<string, unknown>, audit: Record<string, unknown>) {
  const competitors = (audit.competitor_data || []) as Array<Record<string, unknown>>;
  const city = lead.city || 'your area';
  return {
    hook: `We analysed your top ${competitors.length} competitors in ${city}. Here's exactly what they're doing that you're not — and how we fix it in 90 days.`,
    problem: `Your competitors are outperforming you in key areas including online visibility, review management, and digital presence. Each gap represents customers choosing them over you.`,
    proof: `Our side-by-side analysis reveals specific, measurable gaps between your business and the top performers in your market.`,
    solution: `Our comprehensive digital marketing package addresses every gap we've identified, with a prioritised action plan that delivers quick wins first.`,
    result: `Close the gap with your top competitors and establish market dominance in ${city}.`,
    cta: 'Book a free competitive analysis call',
    data_points: competitors.slice(0, 3).map(c => ({ label: c.name as string, value: `${c.google_rating || '?'} ★ (${c.google_review_count || '?'} reviews)`, type: 'neutral' as const })),
    competitor_comparisons: competitors.slice(0, 3).map(c => ({
      competitor_name: c.name as string, metric: 'Google Rating',
      their_value: `${c.google_rating || 'N/A'}`, your_value: `${lead.google_rating || 'N/A'}`,
      winner: (Number(c.google_rating) > Number(lead.google_rating) ? 'them' : 'you') as 'them' | 'you',
    })),
  };
}

function generateComprehensivePitch(lead: Record<string, unknown>, audit: Record<string, unknown>) {
  const city = lead.city || 'your area';
  return {
    hook: `We've completed a comprehensive digital audit of ${lead.business_name}. Here's your complete roadmap to digital dominance in ${city}.`,
    problem: `Our audit identified opportunities across SEO, online reputation, AI visibility, and competitive positioning. Each area represents untapped growth potential.`,
    proof: `We scored your business across 4 key areas and identified specific, actionable improvements that will deliver measurable results.`,
    solution: `Phase 1 (Days 1-30): Quick wins — fix technical issues, set up review system, optimise Google Business Profile. Phase 2 (Days 31-60): Growth — SEO content strategy, AI optimisation, competitor gap closure. Phase 3 (Days 61-90): Dominance — advanced link building, paid amplification, market leadership.`,
    result: `Our comprehensive approach delivers compounding results. Businesses using our full strategy see transformative growth within 90 days.`,
    cta: 'Book a free strategy call',
    data_points: [
      { label: 'SEO Score', value: `${audit.seo_score || 'N/A'}/100`, type: (Number(audit.seo_score) >= 60 ? 'positive' : 'negative') as 'positive' | 'negative' },
      { label: 'Reviews Score', value: `${audit.reviews_score || 'N/A'}/100`, type: (Number(audit.reviews_score) >= 60 ? 'positive' : 'negative') as 'positive' | 'negative' },
      { label: 'AI Visibility', value: `${audit.ai_visibility_score || 'N/A'}/100`, type: (Number(audit.ai_visibility_score) >= 40 ? 'positive' : 'negative') as 'positive' | 'negative' },
      { label: 'Competitor Score', value: `${audit.competitor_score || 'N/A'}/100`, type: (Number(audit.competitor_score) >= 50 ? 'positive' : 'negative') as 'positive' | 'negative' },
    ],
    competitor_comparisons: [],
  };
}

export async function POST(request: NextRequest) {
  try {
    const { leadId, deepAuditId, pitchType } = await request.json();
    if (!leadId || !pitchType) return NextResponse.json({ error: 'leadId and pitchType required' }, { status: 400 });

    const { data: lead } = await supabase.from('leads').select('*').eq('id', leadId).single();
    if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });

    let audit: Record<string, unknown> = {};
    if (deepAuditId) {
      const { data } = await supabase.from('deep_audits').select('*').eq('id', deepAuditId).single();
      if (data) audit = data;
    } else {
      const { data } = await supabase.from('deep_audits').select('*').eq('lead_id', leadId).order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (data) audit = data;
    }

    // Get agency settings
    const { data: settings } = await supabase.from('settings').select('agency_name, agency_email, agency_phone, agency_website, agency_logo_url, calendar_type, calendar_url').limit(1).maybeSingle();

    const generators: Record<string, (l: Record<string, unknown>, a: Record<string, unknown>) => Record<string, unknown>> = {
      seo: generateSEOPitch, reviews: generateReviewsPitch, ai_visibility: generateAIPitch,
      competitor: generateCompetitorPitch, comprehensive: generateComprehensivePitch,
    };

    const generator = generators[pitchType];
    if (!generator) return NextResponse.json({ error: 'Invalid pitch type' }, { status: 400 });

    const content = generator(lead, audit);
    const titleMap: Record<string, string> = {
      seo: `Get Found on Google: SEO Strategy for ${lead.business_name}`,
      reviews: `Build a 5-Star Reputation: Review Strategy for ${lead.business_name}`,
      ai_visibility: `Show Up in AI Search: GEO Strategy for ${lead.business_name}`,
      competitor: `Become #1 in ${lead.city || 'Your Area'}: Competitive Strategy for ${lead.business_name}`,
      comprehensive: `Complete Digital Domination Plan for ${lead.business_name}`,
    };

    const { data: pitch, error: pitchError } = await supabase.from('pitches').insert({
      lead_id: leadId, deep_audit_id: audit.id || null, pitch_type: pitchType,
      title: titleMap[pitchType], content,
      agency_name: settings?.agency_name, agency_email: settings?.agency_email,
      agency_phone: settings?.agency_phone, agency_website: settings?.agency_website,
      agency_logo_url: settings?.agency_logo_url, calendar_type: settings?.calendar_type,
      calendar_url: settings?.calendar_url,
    }).select().single();

    if (pitchError) throw pitchError;

    await supabase.from('activity_log').insert({ action_type: 'pitch', description: `Generated ${pitchType} pitch for ${lead.business_name}`, lead_id: leadId });

    return NextResponse.json({ success: true, pitch });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Pitch generation failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const leadId = searchParams.get('leadId');
  const pitchId = searchParams.get('pitchId');

  if (pitchId) {
    const { data } = await supabase.from('pitches').select('*').eq('id', pitchId).single();
    // Increment view count
    if (data) await supabase.from('pitches').update({ view_count: (data.view_count || 0) + 1, status: 'viewed' }).eq('id', pitchId);
    return NextResponse.json(data);
  }

  if (leadId) {
    const { data } = await supabase.from('pitches').select('*').eq('lead_id', leadId).order('created_at', { ascending: false });
    return NextResponse.json(data || []);
  }

  const { data } = await supabase.from('pitches').select('*').order('created_at', { ascending: false }).limit(50);
  return NextResponse.json(data || []);
}
