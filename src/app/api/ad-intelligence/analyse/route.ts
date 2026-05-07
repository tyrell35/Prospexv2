import { NextRequest, NextResponse } from 'next/server';

import { supabaseAdmin as supabase } from "@/lib/supabase-admin";

// ─── AI ANALYSIS PROMPT ──────────────────────────────────────────
function buildAnalysisPrompt(businessName: string, ads: { ad_copy: string; headline: string; days_running: number; platforms: string[]; media_type: string }[]): string {
  const adTexts = ads
    .filter(a => a.ad_copy || a.headline)
    .slice(0, 15) // Max 15 ads to keep token usage reasonable
    .map((a, i) => `
AD #${i + 1}:
- Headline: ${a.headline || 'None'}
- Body: ${a.ad_copy || 'None'}
- Days running: ${a.days_running}
- Platforms: ${a.platforms?.join(', ') || 'Unknown'}
- Format: ${a.media_type || 'Unknown'}
`).join('\n');

  return `You are an expert Facebook/Instagram ads analyst specialising in aesthetic clinics, med spas, dental practices, and beauty/wellness businesses.

Analyse these ads from "${businessName}" and return a JSON response (no markdown, no code fences, pure JSON only).

${adTexts}

Return this exact JSON structure:
{
  "overall_score": <0-100 integer>,
  "individual_ads": [
    {
      "ad_index": <1-based>,
      "scores": {
        "hook": <0-100>,
        "offer": <0-100>,
        "social_proof": <0-100>,
        "cta": <0-100>,
        "urgency": <0-100>,
        "formatting": <0-100>
      },
      "composite": <0-100>,
      "one_line_verdict": "<short assessment>"
    }
  ],
  "portfolio_analysis": {
    "strengths": ["<strength 1>", "<strength 2>", "<strength 3>"],
    "weaknesses": ["<weakness 1>", "<weakness 2>", "<weakness 3>"],
    "missing_opportunities": ["<opp 1>", "<opp 2>"],
    "creative_diversity_grade": "<A/B/C/D/F>",
    "funnel_coverage": "<awareness_only | conversion_only | partial_funnel | full_funnel>",
    "video_usage": "<none | minimal | good | excellent>"
  },
  "pitch_angle": "<A 2-3 sentence pitch angle an agency could use when reaching out to this business. Be specific, referencing their actual ad weaknesses.>"
}

Scoring guide:
- Hook (25%): Does the first line stop the scroll? Pattern interrupt? Bold claim? Question?
- Offer (20%): Is the offer specific? Price? Discount? Free consultation? Package?
- Social Proof (20%): Testimonials, numbers, results, awards, reviews mentioned?
- CTA (15%): Clear next step? Book now? Call? Link? DM us?
- Urgency (10%): Time-limited? Scarcity? Seasonal? Limited spots?
- Formatting (10%): Emojis? Line breaks? Scannable? Appropriate length?

Be harsh but fair. Most small business ads score 30-60. Only truly exceptional ads score 80+.`;
}

// ─── MAIN HANDLER ────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({
        error: 'ANTHROPIC_API_KEY not configured. Add it to Vercel Environment Variables and redeploy.'
      }, { status: 500 });
    }

    const body = await req.json();
    const { prospect_id } = body;

    if (!prospect_id) {
      return NextResponse.json({ error: 'prospect_id is required' }, { status: 400 });
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

    // Fetch their ads
    const { data: creatives, error: cErr } = await supabase
      .from('ad_creatives')
      .select('*')
      .eq('prospect_id', prospect_id)
      .order('days_running', { ascending: false });

    if (cErr || !creatives || creatives.length === 0) {
      return NextResponse.json({ error: 'No ad creatives found for this prospect' }, { status: 404 });
    }

    // Build prompt
    const prompt = buildAnalysisPrompt(
      prospect.page_name,
      creatives.map(c => ({
        ad_copy: c.ad_copy || '',
        headline: c.headline || '',
        days_running: c.days_running || 0,
        platforms: c.platforms || [],
        media_type: c.media_type || 'IMAGE',
      }))
    );

    // Call Anthropic
    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      console.error('Anthropic API error:', aiRes.status, errText);
      return NextResponse.json({
        error: `AI analysis failed (${aiRes.status}). Check your ANTHROPIC_API_KEY.`
      }, { status: 500 });
    }

    const aiData = await aiRes.json();
    const rawText = aiData.content?.[0]?.text || '';

    // Parse JSON from response (strip any accidental markdown fences)
    let analysis;
    try {
      const cleaned = rawText.replace(/```json\s*|```\s*/g, '').trim();
      analysis = JSON.parse(cleaned);
    } catch (parseErr) {
      console.error('Failed to parse AI analysis:', rawText.substring(0, 500));
      return NextResponse.json({
        error: 'AI returned invalid JSON. Retrying may fix this.',
        raw_response: rawText.substring(0, 500),
      }, { status: 500 });
    }

    // Update prospect with AI scores
    const overallScore = analysis.overall_score || 0;
    await supabase
      .from('ad_prospects')
      .update({
        ai_creative_score: overallScore,
        ai_analysis: {
          portfolio: analysis.portfolio_analysis || {},
          pitch_angle: analysis.pitch_angle || '',
          analysed_at: new Date().toISOString(),
        },
        // Recalculate prospect score with AI data
        prospect_score: recalcScoreWithAI(prospect, overallScore),
        updated_at: new Date().toISOString(),
      })
      .eq('id', prospect_id);

    // Update individual ad creatives with their scores
    if (analysis.individual_ads) {
      for (const adScore of analysis.individual_ads) {
        const idx = (adScore.ad_index || 1) - 1;
        if (idx >= 0 && idx < creatives.length) {
          await supabase
            .from('ad_creatives')
            .update({
              ai_quality_score: adScore.composite || 0,
              ai_analysis: {
                scores: adScore.scores || {},
                verdict: adScore.one_line_verdict || '',
              },
            })
            .eq('id', creatives[idx].id);
        }
      }
    }

    return NextResponse.json({
      prospect_id,
      business_name: prospect.page_name,
      overall_score: overallScore,
      individual_ads: analysis.individual_ads || [],
      portfolio_analysis: analysis.portfolio_analysis || {},
      pitch_angle: analysis.pitch_angle || '',
      ads_analysed: Math.min(creatives.length, 15),
    });

  } catch (err: any) {
    console.error('Ad analysis error:', err);
    return NextResponse.json({ error: err.message || 'Unknown error' }, { status: 500 });
  }
}

// ─── RECALCULATE PROSPECT SCORE WITH AI DATA ─────────────────────
function recalcScoreWithAI(prospect: any, aiScore: number): number {
  let score = 0;

  // Spend (30%)
  const su = prospect.spend_upper || 0;
  if (su >= 5000) score += 30;
  else if (su >= 1000) score += 24;
  else if (su >= 500) score += 18;
  else if (su >= 100) score += 9;
  else score += 3;

  // Ad count (15%)
  const ac = prospect.active_ad_count || 0;
  if (ac >= 10) score += 15;
  else if (ac >= 6) score += 12;
  else if (ac >= 3) score += 9;
  else if (ac >= 1) score += 6;

  // Longevity (15%)
  const ld = prospect.avg_ad_longevity_days || 0;
  if (ld >= 180) score += 15;
  else if (ld >= 90) score += 12;
  else if (ld >= 30) score += 9;
  else if (ld >= 7) score += 6;
  else score += 2;

  // AI Creative Score (15%) — NOW USING REAL DATA
  score += Math.round((aiScore / 100) * 15);

  // Platform coverage (10%)
  const plats = prospect.platforms?.length || 0;
  if (plats >= 3) score += 10;
  else if (plats >= 2) score += 7;
  else score += 4;

  // Creative diversity (10%)
  const fmts = Object.keys(prospect.creative_formats || {}).filter(k => (prospect.creative_formats || {})[k] > 0).length;
  if (fmts >= 3) score += 10;
  else if (fmts >= 2) score += 8;
  else score += 4;

  // Targeting (5%)
  const tgt = prospect.targeting_summary || {};
  if (tgt.ages?.length > 0 && tgt.locations?.length > 0) score += 5;
  else if (tgt.ages?.length > 0 || tgt.locations?.length > 0) score += 3;
  else score += 1;

  return Math.min(100, Math.max(0, score));
}
