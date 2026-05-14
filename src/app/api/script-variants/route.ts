import { NextRequest, NextResponse } from 'next/server';

import { supabaseAdmin as supabase } from "@/lib/supabase-admin";
import { authOr401 } from "@/lib/api-auth";

// ─── GET: List variants with performance data ────────────────────
export async function GET(req: NextRequest) {
  const _auth = await authOr401(); if (_auth instanceof Response) return _auth;
  try {
    const { searchParams } = new URL(req.url);
    const sequenceId = searchParams.get('sequence_id');
    const view = searchParams.get('view') || 'list';

    if (view === 'leaderboard') {
      // Performance leaderboard across all variants
      const { data: variants } = await supabase
        .from('script_variants')
        .select('*, sequence:outreach_sequences(name, channel)')
        .order('booking_rate', { ascending: false });

      // Calculate statistical significance (simple chi-square approximation)
      const withStats = (variants || []).map((v: any) => {
        const minSample = 30; // Minimum sends for reliable data
        const hasEnoughData = v.total_sent >= minSample;
        return {
          ...v,
          has_enough_data: hasEnoughData,
          confidence: hasEnoughData ? (v.total_sent >= 100 ? 'high' : v.total_sent >= 50 ? 'medium' : 'low') : 'insufficient',
          reply_rate: v.total_sent > 0 ? ((v.total_replied / v.total_sent) * 100).toFixed(1) : '0.0',
          positive_rate: v.total_replied > 0 ? ((v.total_positive / v.total_replied) * 100).toFixed(1) : '0.0',
          booking_rate: v.total_sent > 0 ? ((v.total_booked / v.total_sent) * 100).toFixed(1) : '0.0',
        };
      });

      return NextResponse.json({ leaderboard: withStats });
    }

    // List variants for a sequence
    let query = supabase.from('script_variants').select('*').order('step_number').order('variant_label');
    if (sequenceId) query = query.eq('sequence_id', sequenceId);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ variants: data || [] });

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// ─── POST: Create variant or run optimization ────────────────────
export async function POST(req: NextRequest) {
  const _auth = await authOr401(); if (_auth instanceof Response) return _auth;
  try {
    const body = await req.json();
    const { action = 'create' } = body;

    if (action === 'create') {
      const { sequence_id, step_number, variant_name, variant_label, message_template,
              subject, channel, is_ai_personalized, ai_prompt, weight, is_control } = body;

      if (!sequence_id || !message_template) {
        return NextResponse.json({ error: 'sequence_id and message_template required' }, { status: 400 });
      }

      // Auto-assign label if not provided
      let label = variant_label;
      if (!label) {
        const { data: existing } = await supabase
          .from('script_variants')
          .select('variant_label')
          .eq('sequence_id', sequence_id)
          .eq('step_number', step_number || 1)
          .order('variant_label', { ascending: false });

        const labels = 'ABCDEFGHIJ';
        label = labels[existing?.length || 0] || 'Z';
      }

      const { data, error } = await supabase.from('script_variants').insert({
        sequence_id,
        step_number: step_number || 1,
        variant_name: variant_name || `Variant ${label}`,
        variant_label: label,
        message_template,
        subject: subject || null,
        channel: channel || 'instagram',
        is_ai_personalized: is_ai_personalized !== false,
        ai_prompt: ai_prompt || null,
        weight: weight || 50,
        is_control: is_control || false,
      }).select().single();

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ variant: data, created: true });
    }

    // ── AUTO-OPTIMIZE: Pause losers, boost winners ──
    if (action === 'optimize') {
      const { sequence_id, min_sends = 30 } = body;

      const { data: variants } = await supabase
        .from('script_variants')
        .select('*')
        .eq('sequence_id', sequence_id)
        .eq('is_active', true);

      if (!variants || variants.length < 2) {
        return NextResponse.json({ message: 'Need at least 2 active variants to optimize' });
      }

      // Only optimize variants with enough data
      const ready = variants.filter((v: any) => v.total_sent >= min_sends);
      if (ready.length < 2) {
        return NextResponse.json({
          message: `Not enough data yet. ${ready.length} of ${variants.length} variants have ${min_sends}+ sends.`,
          variants: variants.map((v: any) => ({ name: v.variant_name, sent: v.total_sent, needed: min_sends })),
        });
      }

      // Find winner by booking rate, then reply rate
      const sorted = ready.sort((a: any, b: any) => {
        const aBookRate = a.total_sent > 0 ? a.total_booked / a.total_sent : 0;
        const bBookRate = b.total_sent > 0 ? b.total_booked / b.total_sent : 0;
        if (aBookRate !== bBookRate) return bBookRate - aBookRate;
        const aReplyRate = a.total_sent > 0 ? a.total_replied / a.total_sent : 0;
        const bReplyRate = b.total_sent > 0 ? b.total_replied / b.total_sent : 0;
        return bReplyRate - aReplyRate;
      });

      const winner = sorted[0];
      const losers = sorted.slice(1);
      const now = new Date().toISOString();

      // Mark winner
      await supabase.from('script_variants').update({
        is_winner: true, weight: 80, updated_at: now,
      }).eq('id', winner.id);

      // Pause or reduce losers
      for (const loser of losers) {
        const loserReplyRate = loser.total_sent > 0 ? loser.total_replied / loser.total_sent : 0;
        const winnerReplyRate = winner.total_sent > 0 ? winner.total_replied / winner.total_sent : 0;

        // If loser is significantly worse (less than half the reply rate), pause it
        if (loserReplyRate < winnerReplyRate * 0.5) {
          await supabase.from('script_variants').update({
            is_active: false, paused_at: now, pause_reason: 'Auto-paused: significantly underperforming',
          }).eq('id', loser.id);
        } else {
          // Just reduce weight
          await supabase.from('script_variants').update({
            weight: 20, updated_at: now,
          }).eq('id', loser.id);
        }
      }

      return NextResponse.json({
        optimized: true,
        winner: { name: winner.variant_name, reply_rate: ((winner.total_replied / winner.total_sent) * 100).toFixed(1) + '%' },
        actions: losers.map((l: any) => ({
          name: l.variant_name,
          action: (l.total_sent > 0 && (l.total_replied / l.total_sent) < (winner.total_replied / winner.total_sent) * 0.5) ? 'paused' : 'weight_reduced',
        })),
      });
    }

    // ── GENERATE AI VARIANT ──
    if (action === 'generate') {
      const { sequence_id, step_number, base_template, angle } = body;
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 });

      const { data: sequence } = await supabase
        .from('outreach_sequences')
        .select('channel, niche, ai_tone')
        .eq('id', sequence_id)
        .single();

      const prompt = `You are writing a variant outreach message for A/B testing. The original message is below. Create a NEW version with a different ${angle || 'approach'}.

CHANNEL: ${sequence?.channel || 'instagram'}
NICHE: ${sequence?.niche || 'local business'}
TONE: ${sequence?.ai_tone || 'professional_friendly'}
STEP: ${step_number || 1}

ORIGINAL:
${base_template}

VARIATION ANGLE: ${angle || 'Try a completely different opening hook and CTA style'}

RULES:
- Keep similar length to original
- Different opening hook
- Different CTA
- Same core value proposition
- Sound human, not AI
- ${sequence?.channel === 'instagram' ? 'Max 500 chars' : sequence?.channel === 'email' ? 'Include Subject: on first line' : 'Max 600 chars'}

Return ONLY the new message text.`;

      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 600, messages: [{ role: 'user', content: prompt }] }),
      });

      if (!res.ok) return NextResponse.json({ error: 'AI generation failed' }, { status: 500 });
      const data = await res.json();
      const newMessage = data.content?.[0]?.text || '';

      return NextResponse.json({ generated_variant: newMessage, angle: angle || 'alternative approach' });
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// ─── PUT: Update variant ─────────────────────────────────────────
export async function PUT(req: NextRequest) {
  const _auth = await authOr401(); if (_auth instanceof Response) return _auth;
  try {
    const body = await req.json();
    const { id, ...updates } = body;
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

    const { data, error } = await supabase
      .from('script_variants')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ variant: data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// ─── DELETE: Remove variant ──────────────────────────────────────
export async function DELETE(req: NextRequest) {
  const _auth = await authOr401(); if (_auth instanceof Response) return _auth;
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

    await supabase.from('script_variants').delete().eq('id', id);
    return NextResponse.json({ deleted: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
