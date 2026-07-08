import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { authOr401 } from '@/lib/api-auth';

// ═══════════════════════════════════════════════════════
// /api/hunt/personalize
// Generates a personalised opener + angle + follow_up_1 for each requested
// lead using Claude. Writes to hunt_outreach. Section 7 of spec.
//
// Angle rules baked into the prompt:
// - Reference ONE observable fact (device or live ad), never generic flattery
// - Ads active → improvement angle
// - Tier A device but no ads → unused-capacity angle
// - Other-agency flag → switch pitch, lead with result
// - UK vs US tone/spelling per country
// - IG DM opener < 60 words, email opener < 90
// ═══════════════════════════════════════════════════════

type TopTier = 'top_tier_no_ads' | 'top_tier_with_ads' | 'top_tier_multi_device';

interface PersonalizeRequest {
  lead_ids?: string[];
  channel?: 'instagram_dm' | 'email' | 'sms';
  limit?: number;
  tier?: TopTier; // when set, base the prompt on the matching seeded template
}

interface LeadJoin {
  id: string;
  business_name: string;
  city: string | null;
  country: string | null;
  enrich: {
    devices_found: string[] | null;
    tier_a_count: number | null;
    booking_system: string | null;
    has_other_agency: boolean | null;
    google_review_count: number | null;
  } | null;
  intel: {
    ads_active: boolean | null;
    ad_count: number | null;
    ad_days_running: number | null;
    ad_copy_samples: unknown | null;
  } | null;
}

function locale(country: string | null): 'UK' | 'US' | 'CA' {
  const c = (country || '').toLowerCase();
  if (c.includes('kingdom') || c === 'gb' || c === 'uk') return 'UK';
  if (c.includes('canada') || c === 'ca') return 'CA';
  return 'US';
}

function inferTopTier(lead: LeadJoin): TopTier | null {
  const tierA = lead.enrich?.tier_a_count || 0;
  const activeAds = !!lead.intel?.ads_active;
  const reviews = lead.enrich?.google_review_count || 0;
  const devices = (lead.enrich?.devices_found || []).length;
  // Not strictly "top-tier" material — skip
  if (reviews < 20 || tierA < 1) return null;
  if (devices >= 3) return 'top_tier_multi_device';
  if (activeAds) return 'top_tier_with_ads';
  return 'top_tier_no_ads';
}

// Load a seeded template (id, content) for the given tier + channel. Caller can
// use the content as an exemplar seeded into the LLM prompt.
async function loadTemplateExemplar(tier: TopTier, channel: 'instagram_dm' | 'email' | 'sms'): Promise<string | null> {
  const tmplChannel = channel === 'instagram_dm' ? 'instagram' : channel === 'email' ? 'email' : 'whatsapp';
  const { data } = await supabaseAdmin
    .from('conversation_templates')
    .select('content')
    .eq('category', tier)
    .eq('is_active', true)
    .or(`channel.eq.${tmplChannel},channel.eq.all,channel.eq.instagram`)
    .limit(1)
    .maybeSingle();
  const row = data as { content: string } | null;
  return row?.content ?? null;
}

function buildPrompt(lead: LeadJoin, channel: 'instagram_dm' | 'email' | 'sms', tierExemplar?: string | null, tier?: TopTier | null): string {
  const loc = locale(lead.country);
  const wordCap = channel === 'email' ? 90 : channel === 'sms' ? 40 : 60;
  const spelling = loc === 'US' ? 'American English (color, realize, organize)' : 'British English (colour, realise, organise)';
  const devices = (lead.enrich?.devices_found || []);
  const topDevice = devices[0] || null;
  const tierA = lead.enrich?.tier_a_count || 0;
  const activeAds = lead.intel?.ads_active || false;
  const adDays = lead.intel?.ad_days_running || 0;
  const adCount = lead.intel?.ad_count || 0;
  const adSamples = (lead.intel?.ad_copy_samples as Array<{ title?: string; body?: string }> | null) || [];
  const reviews = lead.enrich?.google_review_count || 0;
  const booking = lead.enrich?.booking_system || 'unknown';
  const otherAgency = !!lead.enrich?.has_other_agency;

  let angleHint = '';
  if (otherAgency) {
    angleHint = 'The clinic is running GHL/leadconnectorhq — likely already has an agency. Angle: switch pitch, lead with a specific result, never criticise the incumbent.';
  } else if (activeAds && adDays >= 60) {
    angleHint = `Ads have been live for ${adDays} days (${adCount} active). Angle: improvement on what they're already spending — mention their live ad and point to a specific gap (retargeting, offer angle, funnel step, creative fatigue). Use one ad copy sample if useful: ${JSON.stringify(adSamples.slice(0, 1))}`;
  } else if (tierA >= 1 && !activeAds) {
    angleHint = `They own a Tier A device (${topDevice}) but aren't running Meta ads. Angle: unused capacity — a high-capital machine with no paid traffic behind it is the gap.`;
  } else if (activeAds) {
    angleHint = `Ads recently active (${adDays}d, ${adCount} live). Angle: improvement — mention the ad and one specific optimisation opportunity.`;
  } else if (reviews >= 100) {
    angleHint = `Strong review base (${reviews}). Angle: reviews→bookings conversion — most clinics don't convert social proof into demand.`;
  } else {
    angleHint = 'Fallback: reference one visible signal (device, booking system, review count) as the observation.';
  }

  const tierBlock = tierExemplar
    ? `

TOP-TIER EXEMPLAR (${tier || 'top_tier'}):
This clinic is a top-tier prospect. Rewrite the following exemplar in the writer's own voice, filling in the specific facts from the TARGET block above. Preserve the exemplar's tone, structure, and specific numbers where they still apply. Never copy verbatim — paraphrase.

Exemplar:
${tierExemplar}
`
    : '';

  return `You are writing outbound outreach for Infinity Clients, an agency for aesthetic clinics.

TARGET:
Clinic: ${lead.business_name}
City: ${lead.city || 'unknown'}, ${loc}
Devices detected on site: ${devices.length > 0 ? devices.join(', ') : 'none detected'}
Booking system: ${booking}
Google reviews: ${reviews}
Ads currently active on Meta: ${activeAds ? `yes — ${adCount} live, oldest ${adDays} days` : 'no'}
${otherAgency ? 'FLAG: has_other_agency (GHL/LeadConnector detected)' : ''}

ANGLE:
${angleHint}
${tierBlock}
WRITE:
- Channel: ${channel === 'instagram_dm' ? 'Instagram DM' : channel === 'email' ? 'cold email' : 'SMS'}
- Language: ${spelling}
- Opener must be under ${wordCap} words
- Reference exactly ONE observable fact from the target data. Never invent details, never flatter generically ("amazing clinic!"), never mention things not in the data
- Sound like a specific human sending one message to one clinic
- End with a low-friction ask (soft question or one-sentence offer), no calendar links

Return STRICT JSON with three keys:
{
  "opener": "the first-touch message — under ${wordCap} words",
  "angle": "one-sentence summary of the angle you took, no more than 15 words",
  "follow_up_1": "second-touch message if no reply — under ${wordCap} words, different angle from opener"
}
Return ONLY the JSON object, no preamble, no code fences.`;
}

async function callClaude(prompt: string, apiKey: string): Promise<{ opener: string; angle: string; follow_up_1: string } | null> {
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 800,
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const text = data?.content?.[0]?.text || '';
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]);
    if (!parsed.opener) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  const auth = await authOr401();
  if (auth instanceof NextResponse) return auth;

  const body = (await request.json().catch(() => ({}))) as PersonalizeRequest;
  const channel = body.channel || 'instagram_dm';
  const limit = Math.min(50, body.limit || 10);

  const apiKey = process.env.ANTHROPIC_API_KEY || '';
  if (!apiKey) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 });
  }

  // Default target: hot-band leads without an outreach entry for this channel
  let targetIds = body.lead_ids || [];
  if (targetIds.length === 0) {
    const { data: hot } = await supabaseAdmin
      .from('hunt_scores')
      .select('lead_id')
      .eq('band', 'hot')
      .order('total_score', { ascending: false })
      .limit(limit);
    targetIds = ((hot || []) as Array<{ lead_id: string }>).map(r => r.lead_id);
  }
  targetIds = targetIds.slice(0, limit);

  if (targetIds.length === 0) {
    return NextResponse.json({ success: true, generated: 0, message: 'No hot leads to personalise.' });
  }

  const { data: leadsData } = await supabaseAdmin
    .from('leads')
    .select(`id, business_name, city, country,
             enrich:hunt_enrichment(devices_found, tier_a_count, booking_system, has_other_agency, google_review_count),
             intel:hunt_ad_intel(ads_active, ad_count, ad_days_running, ad_copy_samples)`)
    .in('id', targetIds);
  const leads = ((leadsData || []) as unknown) as LeadJoin[];

  const results: Array<{ lead_id: string; ok: boolean; angle?: string; tier?: TopTier | null; error?: string }> = [];
  for (const lead of leads) {
    // Explicit tier from request → use it. Else auto-infer from lead signals.
    const resolvedTier: TopTier | null = body.tier || inferTopTier(lead);
    const exemplar = resolvedTier ? await loadTemplateExemplar(resolvedTier, channel) : null;
    const prompt = buildPrompt(lead, channel, exemplar, resolvedTier);
    const out = await callClaude(prompt, apiKey);
    if (!out) {
      results.push({ lead_id: lead.id, ok: false, error: 'Claude call failed' });
      continue;
    }
    await supabaseAdmin.from('hunt_outreach').insert({
      lead_id: lead.id,
      channel,
      opener: out.opener,
      angle: out.angle,
      follow_up_1: out.follow_up_1,
    });
    results.push({ lead_id: lead.id, ok: true, angle: out.angle, tier: resolvedTier });
  }

  return NextResponse.json({
    success: true,
    generated: results.filter(r => r.ok).length,
    failed: results.filter(r => !r.ok).length,
    results,
  });
}
