import { NextRequest, NextResponse } from 'next/server';

import { supabaseAdmin as supabase } from "@/lib/supabase-admin";

const CHANNEL_CONFIGS: Record<string, { maxChars: number; style: string }> = {
  instagram: { maxChars: 500, style: 'Casual, conversational, short. No formal greeting. Use their first name if possible. Must be under 500 characters total. No links.' },
  whatsapp: { maxChars: 600, style: 'Friendly but professional, concise. Short paragraphs. Under 600 characters. Can include one link.' },
  email: { maxChars: 2000, style: 'Professional but warm. Include a compelling subject line (prefix with "Subject: "). 3-4 short paragraphs. Clear CTA at the end.' },
  linkedin: { maxChars: 300, style: 'Professional networking tone. Very concise — LinkedIn connection messages are max 300 characters. Focus on shared interest and one specific insight.' },
};

function buildPitchPrompt(
  prospect: any,
  creatives: any[],
  channel: string
): string {
  const config = CHANNEL_CONFIGS[channel] || CHANNEL_CONFIGS.email;

  const topAds = creatives
    .filter(c => c.ad_copy || c.headline)
    .slice(0, 5)
    .map((c, i) => `Ad ${i + 1}: "${c.headline || ''}" — "${(c.ad_copy || '').substring(0, 100)}..." (Running ${c.days_running} days, quality: ${c.ai_quality_score || 'unscored'}/100)`)
    .join('\n');

  const weaknesses = prospect.ai_analysis?.portfolio?.weaknesses || [];
  const strengths = prospect.ai_analysis?.portfolio?.strengths || [];
  const pitchAngle = prospect.ai_analysis?.pitch_angle || '';

  return `You are an elite agency outreach specialist. Write a ${channel} message to "${prospect.page_name}" — a business running Meta ads.

CHANNEL: ${channel}
STYLE: ${config.style}
MAX LENGTH: ${config.maxChars} characters

PROSPECT DATA:
- Business: ${prospect.page_name}
- Active ads: ${prospect.active_ad_count}
- Est. monthly spend: ${prospect.estimated_monthly_spend}
- Longest running ad: ${prospect.longest_ad_days} days
- Platforms: ${(prospect.platforms || []).join(', ')}
- Prospect score: ${prospect.prospect_score}/100 (${prospect.prospect_tier})
- AI creative score: ${prospect.ai_creative_score}/100

TOP ADS:
${topAds || 'No ad copy available'}

STRENGTHS: ${strengths.join(', ') || 'Not analysed yet'}
WEAKNESSES: ${weaknesses.join(', ') || 'Not analysed yet'}
AI PITCH ANGLE: ${pitchAngle || 'None generated yet'}

RULES:
1. Reference their SPECIFIC ads, spend level, or creative weaknesses — never generic
2. Lead with a compliment about what's working (shows you did research)
3. Then identify 1-2 specific gaps they're missing
4. Include a concrete result you've achieved for a similar business (make it realistic for a UK marketing agency serving aesthetic clinics)
5. End with a soft CTA (not pushy — suggest a quick chat, not a sales call)
6. Do NOT use "I noticed" as the opening — be more creative
7. Do NOT mention "Meta Ad Library" or how you found them
8. Sound human, not AI-generated

Return ONLY the message text. For email, start with "Subject: " on the first line.`;
}

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({
        error: 'ANTHROPIC_API_KEY not configured.'
      }, { status: 500 });
    }

    const body = await req.json();
    const { prospect_id, channel = 'email' } = body;

    if (!prospect_id) {
      return NextResponse.json({ error: 'prospect_id is required' }, { status: 400 });
    }

    if (!CHANNEL_CONFIGS[channel]) {
      return NextResponse.json({
        error: `Invalid channel. Use: ${Object.keys(CHANNEL_CONFIGS).join(', ')}`
      }, { status: 400 });
    }

    // Fetch prospect
    const { data: prospect, error: pErr } = await supabase
      .from('ad_prospects')
      .select('*')
      .eq('id', prospect_id)
      .single();

    if (pErr || !prospect) {
      return NextResponse.json({ error: 'Prospect not found' }, { status: 404 });
    }

    // Fetch creatives
    const { data: creatives } = await supabase
      .from('ad_creatives')
      .select('*')
      .eq('prospect_id', prospect_id)
      .order('days_running', { ascending: false })
      .limit(10);

    const prompt = buildPitchPrompt(prospect, creatives || [], channel);

    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!aiRes.ok) {
      return NextResponse.json({
        error: `AI pitch generation failed (${aiRes.status})`
      }, { status: 500 });
    }

    const aiData = await aiRes.json();
    const pitchText = aiData.content?.[0]?.text || '';

    // Parse subject line for emails
    let subject = '';
    let messageBody = pitchText;
    if (channel === 'email' && pitchText.toLowerCase().startsWith('subject:')) {
      const lines = pitchText.split('\n');
      subject = lines[0].replace(/^subject:\s*/i, '').trim();
      messageBody = lines.slice(1).join('\n').trim();
    }

    return NextResponse.json({
      prospect_id,
      business_name: prospect.page_name,
      channel,
      subject: subject || undefined,
      message: messageBody,
      character_count: messageBody.length,
      max_chars: CHANNEL_CONFIGS[channel].maxChars,
      prospect_context: {
        spend: prospect.estimated_monthly_spend,
        active_ads: prospect.active_ad_count,
        score: prospect.prospect_score,
        tier: prospect.prospect_tier,
      },
    });

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
