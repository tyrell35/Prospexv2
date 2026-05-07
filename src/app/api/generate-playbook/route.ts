import { NextRequest, NextResponse } from 'next/server';

import { supabaseAdmin as supabase } from "@/lib/supabase-admin";

function getLocale(country: string | null) {
  const c = (country || '').toUpperCase();
  if (c.includes('US') || c === 'UNITED STATES') return { currency: '$', term: 'medspa', locale: 'US' };
  if (c.includes('CA') || c === 'CANADA') return { currency: 'CAD $', term: 'medspa', locale: 'CA' };
  return { currency: '£', term: 'aesthetic clinic', locale: 'UK' };
}

function buildPrompt(lead: Record<string, unknown>, auditData: Record<string, unknown> | null, deepAudit: Record<string, unknown> | null, locale: { currency: string; term: string; locale: string }) {
  const name = lead.business_name || 'Unknown Clinic';
  const city = lead.city || 'Unknown';
  const country = locale.locale;
  const rating = lead.google_rating || 'N/A';
  const reviews = lead.google_review_count || 0;
  const website = lead.website || 'None';
  const instagram = lead.instagram_url || lead.instagram_handle || 'None';
  const phone = lead.phone || 'None';
  const email = lead.email || 'None';

  let auditSummary = 'No audit data available.';
  if (auditData) {
    const checks = [
      `SSL: ${auditData.ssl_check ? 'Yes' : 'No'}`,
      `Mobile score: ${auditData.mobile_score || 'N/A'}/100`,
      `Speed score: ${auditData.speed_score || 'N/A'}/100`,
      `Booking system: ${auditData.has_booking ? 'Yes' : 'No'}`,
      `Chatbot: ${auditData.has_chatbot ? 'Yes' : 'No'}`,
      `Social media: ${auditData.has_social_media ? 'Yes' : 'No'}`,
      `Schema markup: ${auditData.has_schema ? 'Yes' : 'No'}`,
      `Click-to-call: ${auditData.has_click_to_call ? 'Yes' : 'No'}`,
      `Overall audit score: ${auditData.overall_score || 'N/A'}/100`,
    ];
    auditSummary = checks.join('\n');
  }

  let competitorSummary = 'No competitor data available.';
  if (deepAudit && Array.isArray(deepAudit.competitor_data)) {
    competitorSummary = deepAudit.competitor_data.map((c: Record<string, unknown>) =>
      `${c.name}: ${c.google_rating}★ (${c.google_review_count} reviews) — Strengths: ${(c.strengths as string[] || []).join(', ')} — Weaknesses: ${(c.weaknesses as string[] || []).join(', ')}`
    ).join('\n');
  }

  return `You are the Strategic Intelligence Analyst for Infinity Clients, a lead generation agency for ${locale.term}s.

Generate a complete Growth Playbook for this prospect. Use ${locale.currency} for all pricing. Use "${locale.term}" terminology.

PROSPECT DATA:
Business: ${name}
City: ${city}, ${country}
Google Rating: ${rating} (${reviews} reviews)
Website: ${website}
Instagram: ${instagram}
Phone: ${phone}
Email: ${email}

WEBSITE AUDIT:
${auditSummary}

COMPETITOR DATA:
${competitorSummary}

Generate the playbook with these 7 sections:

SECTION 1: MARKET SNAPSHOT
Provide market size, growth rate, competing clinics estimate, search demand, and avg patient lifetime value for ${city}, ${country}.

SECTION 2: PROSPECT AUDIT
Score them 1-10 on: website quality, Google Business Profile, Google reviews, social media, SEO, paid advertising, booking flow, speed to lead, follow-up system, treatment packaging, pricing strategy, patient retention. Calculate overall score out of 100. Be specific about what's missing.

SECTION 3: COMPETITOR ANALYSIS
Analyse the top 3 competitors in their area. For each: what they're doing well, what they're NOT doing (opportunities for the prospect). ${competitorSummary !== 'No competitor data available.' ? 'Use the competitor data provided above.' : 'Research and estimate based on the market.'}

SECTION 4: REVENUE LEAK ANALYSIS
Calculate estimated monthly revenue being lost in these categories:
- Missed/unanswered calls (25-35% miss rate without call handling)
- Slow lead follow-up (leads contacted in 5 mins are 21x more likely to convert)
- No treatment packages (clinics with packages see 40-60% higher transaction value)
- No retention/rebooking system (5-7x cheaper to retain than acquire)
- Weak online presence (bounced traffic, invisible searches)
Give a TOTAL monthly revenue leak estimate and annual impact.

SECTION 5: WHAT THE TOP 1% ARE DOING
Include these REAL case studies from Infinity Clients:
- J&J Aesthetics: ${locale.currency === '£' ? '£77,588' : '$95,000+'} total revenue tracked
- Stacey (Beauty Sculpting Room): ${locale.currency === '£' ? '£50K' : '$60K+'} months
- Exhala Wellness: $88K still closing with campaign turned off
- Debbie Askey: ${locale.currency === '£' ? '£1K invested, £19K return' : '$1.2K invested, $23K return'} in 30 days
- Dr Patel: ${locale.currency === '£' ? '£15K' : '$18K'} treatment plan sold
- Abbie (AL Aesthetics): First booking day after campaign launch
End with: "Every clinic that achieves these results has three things: a patient acquisition system running 24/7, lead handling under 5 minutes, and premium packages at ${locale.currency}1K-2K+. ${name} has [X of 3] today."

SECTION 6: 90-DAY GROWTH ROADMAP
Phase 1 (Days 1-30): Foundation — specific actions and projected revenue impact
Phase 2 (Days 31-60): Acceleration — specific actions and projected revenue impact
Phase 3 (Days 61-90): Dominance — specific actions and projected revenue impact
Include total projected 90-day outcome with current vs projected monthly revenue.

SECTION 7: NEXT STEP
Soft CTA — no hard sell. Offer a 30-minute strategy call. "No pitch. No pressure. Just the truth about what's possible for ${name}."

After the playbook, also generate these SEPARATELY marked with clear headers:

===COLD_EMAIL_SUBJECT===
[email subject line — under 60 chars, curiosity-driven, personalised to their clinic]

===COLD_EMAIL_BODY===
[cold email body — 150 words max, references a specific finding from the playbook, offers to send the Growth Playbook, ends with soft CTA, signed by Tyrell Wilson, Founder, Infinity Clients]

===FOLLOW_UP_EMAIL===
[follow-up email for 3 days later — references the single strongest revenue leak, 100 words max]

===INSTAGRAM_DM===
[Instagram DM — casual, friendly, references their specific strength and the opportunity, offers the Growth Playbook, 80 words max]

===SHORT_DM===
[Shorter alternative DM — 40 words max, punchy]`;
}

function parsePlaybookResponse(text: string) {
  const sections = {
    content: '',
    email_subject: '',
    email_body: '',
    follow_up_email: '',
    dm_text: '',
    short_dm_text: '',
  };

  // Extract marked sections
  const subjectMatch = text.match(/===COLD_EMAIL_SUBJECT===\s*([\s\S]*?)(?====|$)/);
  const bodyMatch = text.match(/===COLD_EMAIL_BODY===\s*([\s\S]*?)(?====|$)/);
  const followUpMatch = text.match(/===FOLLOW_UP_EMAIL===\s*([\s\S]*?)(?====|$)/);
  const dmMatch = text.match(/===INSTAGRAM_DM===\s*([\s\S]*?)(?====|$)/);
  const shortDmMatch = text.match(/===SHORT_DM===\s*([\s\S]*?)(?====|$)/);

  sections.email_subject = subjectMatch ? subjectMatch[1].trim() : '';
  sections.email_body = bodyMatch ? bodyMatch[1].trim() : '';
  sections.follow_up_email = followUpMatch ? followUpMatch[1].trim() : '';
  sections.dm_text = dmMatch ? dmMatch[1].trim() : '';
  sections.short_dm_text = shortDmMatch ? shortDmMatch[1].trim() : '';

  // Everything before the first === marker is the playbook content
  const playbookEnd = text.indexOf('===COLD_EMAIL_SUBJECT===');
  sections.content = playbookEnd > -1 ? text.substring(0, playbookEnd).trim() : text.trim();

  return sections;
}

function extractGrowthScore(content: string): number {
  const match = content.match(/(?:overall|growth)\s*score[:\s]*(\d+)\s*\/\s*100/i);
  return match ? parseInt(match[1], 10) : 0;
}

function extractRevenueLeak(content: string): string {
  const match = content.match(/total\s*(?:estimated)?\s*monthly[^£$CAD]*([£$][\d,]+(?:-[£$]?[\d,]+)?|CAD\s*\$[\d,]+(?:-[\d,]+)?)/i);
  return match ? match[1] : '';
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { lead_id, bulk } = body;

    // Handle bulk generation
    const leadIds = bulk ? (body.lead_ids as string[]) : [lead_id];
    if (!leadIds || leadIds.length === 0) {
      return NextResponse.json({ error: 'lead_id or lead_ids required' }, { status: 400 });
    }

    // Read API key from Vercel env var (primary) or settings table (fallback)
    let key = process.env.ANTHROPIC_API_KEY || '';
    if (!key) {
      const { data: settings } = await supabase.from('settings').select('anthropic_key').limit(1).maybeSingle();
      key = (settings as Record<string, unknown> | null)?.anthropic_key as string || '';
    }
    if (!key) {
      return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured. Add it to Vercel env vars or Settings page.' }, { status: 500 });
    }

    const results: { lead_id: string; status: string; playbook_id?: string }[] = [];

    for (const lid of leadIds) {
      try {
        // Mark as generating
        await supabase.from('leads').update({ playbook_status: 'generating' }).eq('id', lid);

        // Fetch lead data
        const { data: lead } = await supabase.from('leads').select('*').eq('id', lid).single();
        if (!lead) {
          results.push({ lead_id: lid, status: 'error: lead not found' });
          continue;
        }

        // Fetch deep audit if available
        const { data: deepAudit } = await supabase
          .from('deep_audits')
          .select('*')
          .eq('lead_id', lid)
          .eq('status', 'complete')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        const locale = getLocale(lead.country);
        const prompt = buildPrompt(lead, lead.audit_data, deepAudit, locale);

        // Call Claude API
        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': key,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 4000,
            tools: [{ type: 'web_search_20250305', name: 'web_search' }],
            messages: [{ role: 'user', content: prompt }],
          }),
        });

        if (!response.ok) {
          const errText = await response.text();
          console.error('Claude API error:', errText);
          await supabase.from('leads').update({ playbook_status: 'failed' }).eq('id', lid);
          results.push({ lead_id: lid, status: `error: Claude API ${response.status}` });
          continue;
        }

        const data = await response.json();
        const fullText = data.content
          ?.filter((c: { type: string }) => c.type === 'text')
          ?.map((c: { text: string }) => c.text)
          ?.join('\n') || '';

        const parsed = parsePlaybookResponse(fullText);
        const growthScore = extractGrowthScore(parsed.content);
        const revenueLeak = extractRevenueLeak(parsed.content);

        // Save playbook
        const { data: playbook, error: pbError } = await supabase
          .from('playbooks')
          .insert({
            lead_id: lid,
            content: parsed.content,
            email_subject: parsed.email_subject,
            email_body: parsed.email_body,
            follow_up_email: parsed.follow_up_email,
            dm_text: parsed.dm_text,
            short_dm_text: parsed.short_dm_text,
            revenue_leak: revenueLeak,
            growth_score: growthScore,
            recommended_tier: growthScore < 40 ? 'Full' : growthScore < 60 ? 'Mid' : 'Basic',
            status: 'ready',
          })
          .select('id')
          .single();

        if (pbError) {
          console.error('Playbook save error:', JSON.stringify(pbError));
          await supabase.from('leads').update({ playbook_status: 'failed' }).eq('id', lid);
          results.push({ lead_id: lid, status: `error: save failed — ${pbError.message}` });
          continue;
        }

        // Update lead
        await supabase.from('leads').update({
          playbook_status: 'ready',
          playbook_text: parsed.content.substring(0, 500) + '...',
          outreach_email_subject: parsed.email_subject,
          outreach_email_body: parsed.email_body,
          outreach_dm_text: parsed.dm_text,
          revenue_leak_estimate: revenueLeak,
        }).eq('id', lid);

        // Auto-post to Slack if enabled
        const { data: settings } = await supabase.from('settings').select('slack_webhook_url, slack_auto_post_playbooks').limit(1).maybeSingle();
        if (settings?.slack_auto_post_playbooks && settings?.slack_webhook_url) {
          try {
            await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL ? new URL(request.url).origin : ''}/api/slack-post`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ lead_id: lid, playbook_id: playbook?.id }),
            });
          } catch { /* non-critical */ }
        }

        // Fire Make.com webhook
        try {
          await fetch(`${new URL(request.url).origin}/api/webhook/playbook-ready`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ lead_id: lid, playbook_id: playbook?.id }),
          });
        } catch { /* non-critical */ }

        results.push({ lead_id: lid, status: 'ready', playbook_id: playbook?.id });
      } catch (err) {
        console.error(`Playbook error for ${lid}:`, err);
        await supabase.from('leads').update({ playbook_status: 'failed' }).eq('id', lid);
        results.push({ lead_id: lid, status: `error: ${String(err)}` });
      }
    }

    return NextResponse.json({ results });
  } catch (err) {
    console.error('Generate playbook error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
