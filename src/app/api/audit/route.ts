import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

function getKey(envKey: string): string {
  return process.env[envKey] || '';
}

async function crawlWebsite(url: string): Promise<string> {
  const apiKey = getKey('FIRECRAWL_API_KEY');
  if (!apiKey) throw new Error('Firecrawl API key not configured');

  const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      url,
      formats: ['html'],
      onlyMainContent: false,
    }),
  });

  if (!response.ok) {
    throw new Error(`Firecrawl error: ${response.status}`);
  }

  const data = await response.json();
  return data?.data?.html || '';
}

async function getPageSpeedScores(url: string): Promise<{ mobile: number; speed: number }> {
  try {
    // Mobile score
    const mobileRes = await fetch(
      `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&strategy=mobile&category=performance`
    );
    const mobileData = await mobileRes.json();
    const mobile = Math.round((mobileData?.lighthouseResult?.categories?.performance?.score || 0) * 100);

    // Desktop speed
    const desktopRes = await fetch(
      `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&strategy=desktop&category=performance`
    );
    const desktopData = await desktopRes.json();
    const speed = Math.round((desktopData?.lighthouseResult?.categories?.performance?.score || 0) * 100);

    return { mobile, speed };
  } catch (err) {
    console.error('PageSpeed error:', err);
    return { mobile: 0, speed: 0 };
  }
}

function analyzeHTML(html: string) {
  const lower = html.toLowerCase();

  return {
    ssl_check: true, // If we got HTML, it loaded — we check the URL separately
    has_social_media: /facebook\.com|instagram\.com|linkedin\.com|twitter\.com|x\.com/.test(lower),
    has_click_to_call: /tel:/.test(lower),
    has_video: /youtube\.com|vimeo\.com|<video/.test(lower),
    has_chatbot: /intercom|drift|tidio|livechat|tawk\.to|crisp\.chat|hubspot.*chat|zendesk.*chat/.test(lower),
    has_booking: /calendly|acuity|fresha|booksy|booking|schedulicity|vagaro|mindbody|setmore|appointy/.test(lower),
    has_meta_description: /<meta[^>]*name=["']description["'][^>]*content=["'][^"']+["']/.test(lower),
    has_h1: /<h1[\s>]/.test(lower),
    has_analytics: /google-analytics|googletagmanager|gtag|ga\.js|analytics\.js|gtm\.js/.test(lower),
    has_schema: /application\/ld\+json|itemtype=.*schema\.org/.test(lower),
  };
}

function calculateAuditScore(checks: Record<string, boolean | number | null>): number {
  let score = 100;
  const deductions: Record<string, number> = {
    ssl_check: 15,
    has_social_media: 8,
    has_click_to_call: 8,
    has_video: 5,
    has_chatbot: 5,
    has_booking: 10,
    has_meta_description: 8,
    has_h1: 5,
    has_analytics: 10,
    has_schema: 6,
  };

  for (const [key, deduction] of Object.entries(deductions)) {
    if (checks[key] === false) score -= deduction;
  }

  // Speed deductions
  if (typeof checks.mobile_score === 'number') {
    if (checks.mobile_score < 50) score -= 10;
    else if (checks.mobile_score < 70) score -= 5;
  }
  if (typeof checks.speed_score === 'number') {
    if (checks.speed_score < 50) score -= 10;
    else if (checks.speed_score < 70) score -= 5;
  }

  return Math.max(0, Math.min(100, score));
}

export async function POST(request: NextRequest) {
  let parsedLeadId: string | null = null;
  try {
    const { leadId } = await request.json();
    parsedLeadId = leadId;
    if (!leadId) {
      return NextResponse.json({ error: 'leadId is required' }, { status: 400 });
    }

    // Get lead
    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .select('*')
      .eq('id', leadId)
      .single();

    if (leadError || !lead) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    }

    if (!lead.website) {
      return NextResponse.json({ error: 'Lead has no website to audit' }, { status: 400 });
    }

    // Update status to running
    await supabase.from('leads').update({ audit_status: 'running' }).eq('id', leadId);

    // Ensure URL has protocol
    let websiteUrl = lead.website;
    if (!websiteUrl.startsWith('http')) {
      websiteUrl = `https://${websiteUrl}`;
    }

    // Check SSL
    let ssl_check = websiteUrl.startsWith('https');

    // Crawl website
    let htmlChecks = {
      has_social_media: false,
      has_click_to_call: false,
      has_video: false,
      has_chatbot: false,
      has_booking: false,
      has_meta_description: false,
      has_h1: false,
      has_analytics: false,
      has_schema: false,
    };

    try {
      const html = await crawlWebsite(websiteUrl);
      if (html) {
        htmlChecks = analyzeHTML(html);
      }
    } catch (err) {
      console.error('Crawl failed:', err);
    }

    // Get PageSpeed scores
    const { mobile, speed } = await getPageSpeedScores(websiteUrl);

    const auditData = {
      ssl_check,
      mobile_score: mobile,
      speed_score: speed,
      ...htmlChecks,
      overall_score: 0,
    };

    auditData.overall_score = calculateAuditScore(auditData);

    // Save audit record
    await supabase.from('audits').insert({
      lead_id: leadId,
      ...auditData,
      raw_data: auditData,
    });

    // Update lead with audit results
    // Calculate lead score based on audit + contact completeness
    let leadScore = 0;
    // Contact completeness (20 pts)
    if (lead.phone) leadScore += 5;
    if (lead.email) leadScore += 10;
    if (lead.website) leadScore += 5;
    // Audit issues = opportunity (30 pts)
    if (!auditData.ssl_check) leadScore += 3;
    if (auditData.mobile_score < 50) leadScore += 3;
    if (auditData.speed_score < 50) leadScore += 3;
    if (!auditData.has_social_media) leadScore += 3;
    if (!auditData.has_click_to_call) leadScore += 3;
    if (!auditData.has_video) leadScore += 2;
    if (!auditData.has_chatbot) leadScore += 3;
    if (!auditData.has_booking) leadScore += 3;
    if (!auditData.has_meta_description) leadScore += 2;
    if (!auditData.has_h1) leadScore += 2;
    if (!auditData.has_analytics) leadScore += 2;
    if (!auditData.has_schema) leadScore += 1;
    // Review quality (20 pts)
    if (lead.google_rating && lead.google_rating < 4.0) leadScore += 10;
    else if (lead.google_rating && lead.google_rating < 4.5) leadScore += 5;
    if (lead.google_review_count && lead.google_review_count < 20) leadScore += 10;
    else if (lead.google_review_count && lead.google_review_count < 50) leadScore += 5;

    leadScore = Math.min(100, leadScore);
    const grade = leadScore >= 90 ? 'A+' : leadScore >= 80 ? 'A' : leadScore >= 70 ? 'B' : leadScore >= 60 ? 'C' : leadScore >= 50 ? 'D' : 'F';
    const priority = leadScore >= 70 ? 'hot' : leadScore >= 40 ? 'warm' : 'cold';

    await supabase.from('leads').update({
      audit_status: 'complete',
      audit_score: auditData.overall_score,
      audit_data: auditData,
      lead_score: leadScore,
      lead_grade: grade,
      lead_priority: priority,
      updated_at: new Date().toISOString(),
    }).eq('id', leadId);

    // Log activity
    await supabase.from('activity_log').insert({
      action_type: 'audit',
      description: `Audited ${lead.business_name} — Score: ${auditData.overall_score}/100`,
      lead_id: leadId,
    });

    return NextResponse.json({ success: true, auditData, leadScore, grade, priority });
  } catch (err: any) {
    console.error('Audit error:', err);
    // Update status to error
    if (parsedLeadId) {
      try {
        await supabase.from('leads').update({ audit_status: 'error' }).eq('id', parsedLeadId);
      } catch { /* ignore cleanup errors */ }
    }
    return NextResponse.json({ error: err.message || 'Audit failed' }, { status: 500 });
  }
}
