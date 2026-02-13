import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

export async function POST(request: NextRequest) {
  try {
    const { leadId, emailType = 'initial_outreach' } = await request.json();
    if (!leadId) return NextResponse.json({ error: 'leadId required' }, { status: 400 });

    const openaiKey = process.env.OPENAI_API_KEY;
    if (!openaiKey) return NextResponse.json({ error: 'OpenAI API key not configured' }, { status: 400 });

    const { data: lead } = await supabase.from('leads').select('*').eq('id', leadId).single();
    if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });

    // Get agency settings
    const { data: settings } = await supabase.from('settings').select('agency_name, agency_email, agency_phone, agency_website, calendar_url').limit(1).maybeSingle();

    // Get audit data if available
    const { data: audit } = await supabase.from('audits').select('*').eq('lead_id', leadId).order('created_at', { ascending: false }).limit(1).maybeSingle();
    const { data: deepAudit } = await supabase.from('deep_audits').select('*').eq('lead_id', leadId).order('created_at', { ascending: false }).limit(1).maybeSingle();

    const agencyName = settings?.agency_name || 'Our Agency';
    const calendarUrl = settings?.calendar_url || '[Your Calendar Link]';

    const auditInsights: string[] = [];
    if (audit) {
      if (audit.speed_score && audit.speed_score < 50) auditInsights.push(`Your website speed scores ${audit.speed_score}/100 on mobile — this costs you visitors`);
      if (audit.mobile_score && audit.mobile_score < 50) auditInsights.push(`Mobile experience scores only ${audit.mobile_score}/100`);
      if (!audit.has_meta_description) auditInsights.push('Missing meta descriptions — Google can\'t properly index your pages');
      if (!audit.has_schema) auditInsights.push('No structured data markup — missing rich snippet opportunities');
      if (!audit.ssl_check) auditInsights.push('SSL certificate issue — browsers may show "Not Secure" warning');
      if (!audit.has_booking) auditInsights.push('No online booking system — you\'re losing convenience-driven customers');
    }
    if (deepAudit) {
      if (deepAudit.seo_score && deepAudit.seo_score < 60) auditInsights.push(`SEO visibility score: ${deepAudit.seo_score}/100 — significant ranking opportunities`);
      if (deepAudit.reviews_score && deepAudit.reviews_score < 60) auditInsights.push(`Review management score: ${deepAudit.reviews_score}/100`);
      if (deepAudit.ai_visibility_score && deepAudit.ai_visibility_score < 40) auditInsights.push('Not visible on AI search platforms (ChatGPT, Perplexity)');
    }

    const emailTemplates: Record<string, string> = {
      initial_outreach: `You are a professional digital marketing consultant writing a cold outreach email. Write in a consultative, professional tone. Be specific, data-driven, and genuinely helpful — not salesy.

Business: ${lead.business_name}
Location: ${lead.city || lead.address || 'their area'}
Website: ${lead.website || 'N/A'}
Google Rating: ${lead.google_rating || 'N/A'} (${lead.google_review_count || 0} reviews)
${auditInsights.length > 0 ? `\nAudit Findings:\n${auditInsights.map(i => `- ${i}`).join('\n')}` : ''}

Write a personalised cold email that:
1. Opens with a specific, complimentary observation about their business (NOT generic flattery)
2. Shares 2-3 specific findings from the audit data above (use exact numbers)
3. Positions these as opportunities, not criticisms
4. Offers a free strategy call — no hard sell
5. Signs off professionally from ${agencyName}

Keep it under 200 words. No subject line — I'll ask separately. No "Dear" or "To Whom It May Concern". Start with "Hi" or their name if available.

Calendar link for CTA: ${calendarUrl}`,

      follow_up: `Write a brief, professional follow-up email for a lead who hasn't responded to initial outreach.

Business: ${lead.business_name}
Agency: ${agencyName}
Calendar: ${calendarUrl}

Be concise (under 100 words), add one new insight or value point, and make it easy to respond. Don't be pushy.`,

      post_audit: `Write a professional email sharing audit results with a business owner.

Business: ${lead.business_name}
${auditInsights.length > 0 ? `Key Findings:\n${auditInsights.map(i => `- ${i}`).join('\n')}` : 'General website review completed.'}

Frame findings as opportunities. Include a CTA to discuss results on a call. From: ${agencyName}. Calendar: ${calendarUrl}. Keep under 200 words.`,
    };

    const prompt = emailTemplates[emailType] || emailTemplates.initial_outreach;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${openaiKey}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'You are a professional digital marketing consultant. Write concise, personalised emails that are consultative and data-driven. Never be generic or salesy.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.7,
        max_tokens: 500,
      }),
    });

    if (!response.ok) throw new Error(`OpenAI error: ${await response.text()}`);
    const data = await response.json();
    const emailBody = data.choices?.[0]?.message?.content || '';

    // Generate subject line
    const subjectResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${openaiKey}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'Generate a short, compelling email subject line (max 8 words). No clickbait. Professional and specific.' },
          { role: 'user', content: `Subject line for this email to ${lead.business_name}:\n\n${emailBody}` },
        ],
        temperature: 0.7,
        max_tokens: 50,
      }),
    });

    const subjectData = await subjectResponse.json();
    const subject = subjectData.choices?.[0]?.message?.content?.replace(/["']/g, '').trim() || `Quick question about ${lead.business_name}`;

    return NextResponse.json({
      success: true,
      email: { subject, body: emailBody, type: emailType },
      lead: { business_name: lead.business_name, email: lead.email },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Email generation failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
