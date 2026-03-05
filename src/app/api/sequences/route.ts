import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// ─── GET: List sequences or single sequence ──────────────────────
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (id) {
      // Single sequence with enrollments
      const { data: sequence, error } = await supabase
        .from('outreach_sequences')
        .select('*')
        .eq('id', id)
        .single();

      if (error || !sequence) {
        return NextResponse.json({ error: 'Sequence not found' }, { status: 404 });
      }

      const { data: enrollments } = await supabase
        .from('sequence_enrollments')
        .select('*')
        .eq('sequence_id', id)
        .order('enrolled_at', { ascending: false });

      return NextResponse.json({ sequence, enrollments: enrollments || [] });
    }

    // List all sequences
    const status = searchParams.get('status');
    const channel = searchParams.get('channel');

    let query = supabase
      .from('outreach_sequences')
      .select('*')
      .order('updated_at', { ascending: false });

    if (status) query = query.eq('status', status);
    if (channel) query = query.eq('channel', channel);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ sequences: data || [] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// ─── POST: Create sequence, enroll leads, or generate AI message ─
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action = 'create' } = body;

    // ── CREATE SEQUENCE ──
    if (action === 'create') {
      const { name, channel, niche, description, steps, ai_tone, ai_context,
              send_window_start, send_window_end, send_days, send_timezone } = body;

      if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 });

      const { data, error } = await supabase
        .from('outreach_sequences')
        .insert({
          name,
          channel: channel || 'email',
          niche: niche || null,
          description: description || null,
          steps: steps || [],
          ai_tone: ai_tone || 'professional_friendly',
          ai_context: ai_context || null,
          send_window_start: send_window_start || 9,
          send_window_end: send_window_end || 17,
          send_days: send_days || ['mon', 'tue', 'wed', 'thu', 'fri'],
          send_timezone: send_timezone || 'Europe/London',
          status: 'draft',
        })
        .select()
        .single();

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ sequence: data, created: true });
    }

    // ── ENROLL LEADS ──
    if (action === 'enroll') {
      const { sequence_id, lead_ids } = body;
      if (!sequence_id || !lead_ids?.length) {
        return NextResponse.json({ error: 'sequence_id and lead_ids required' }, { status: 400 });
      }

      // Fetch sequence for channel info
      const { data: sequence } = await supabase
        .from('outreach_sequences')
        .select('channel, steps')
        .eq('id', sequence_id)
        .single();

      if (!sequence) return NextResponse.json({ error: 'Sequence not found' }, { status: 404 });

      // Fetch leads
      const { data: leads } = await supabase
        .from('leads')
        .select('id, business_name, email, phone, instagram_url, lead_score, lead_priority, ad_spend_estimate, ad_quality_score')
        .in('id', lead_ids);

      if (!leads?.length) return NextResponse.json({ error: 'No leads found' }, { status: 404 });

      const enrollments = [];
      let enrolled = 0;

      for (const lead of leads) {
        // Determine contact handle based on channel
        let handle = '';
        if (sequence.channel === 'email') handle = lead.email || '';
        else if (sequence.channel === 'instagram') handle = lead.instagram_url || '';
        else if (sequence.channel === 'whatsapp') handle = lead.phone || '';
        else if (sequence.channel === 'linkedin') handle = ''; // Would need LinkedIn URL
        else handle = lead.email || lead.phone || '';

        if (!handle) continue;

        // Calculate first send time
        const firstStep = (sequence.steps as any[])?.[0];
        const delayDays = firstStep?.delay_days || 0;
        const nextSend = new Date();
        nextSend.setDate(nextSend.getDate() + delayDays);

        const { error } = await supabase
          .from('sequence_enrollments')
          .upsert({
            sequence_id,
            lead_id: lead.id,
            business_name: lead.business_name,
            contact_handle: handle,
            channel: sequence.channel,
            personalization_data: {
              lead_score: lead.lead_score,
              lead_priority: lead.lead_priority,
              ad_spend: lead.ad_spend_estimate,
              ad_quality: lead.ad_quality_score,
            },
            status: 'queued',
            current_step: 0,
            next_send_at: nextSend.toISOString(),
          }, { onConflict: 'sequence_id,lead_id' });

        if (!error) enrolled++;
      }

      // Update sequence total
      await supabase
        .from('outreach_sequences')
        .update({
          total_enrolled: enrolled,
          updated_at: new Date().toISOString(),
        })
        .eq('id', sequence_id);

      return NextResponse.json({ enrolled, total_leads: leads.length });
    }

    // ── GENERATE AI MESSAGE ──
    if (action === 'generate_message') {
      const { enrollment_id, step_number, sequence_id } = body;
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 });

      // Fetch enrollment + sequence
      const { data: enrollment } = await supabase
        .from('sequence_enrollments')
        .select('*, lead:leads(*)')
        .eq('id', enrollment_id)
        .single();

      if (!enrollment) return NextResponse.json({ error: 'Enrollment not found' }, { status: 404 });

      const { data: sequence } = await supabase
        .from('outreach_sequences')
        .select('*')
        .eq('id', sequence_id || enrollment.sequence_id)
        .single();

      if (!sequence) return NextResponse.json({ error: 'Sequence not found' }, { status: 404 });

      const steps = sequence.steps as any[];
      const step = steps[step_number || enrollment.current_step];
      if (!step) return NextResponse.json({ error: 'Step not found' }, { status: 404 });

      const lead = enrollment.lead || {};
      const personData = enrollment.personalization_data || {};

      const prompt = `You are writing a ${sequence.channel} outreach message for a UK marketing agency contacting a ${sequence.niche || 'local business'}.

TONE: ${sequence.ai_tone || 'professional_friendly'}
CHANNEL: ${sequence.channel}
STEP: ${step.step_number} of ${steps.length} (${step.condition === 'if_no_reply' ? 'follow-up — they haven\'t replied yet' : 'first touch'})
${sequence.ai_context ? `EXTRA CONTEXT: ${sequence.ai_context}` : ''}

LEAD INFO:
- Business: ${enrollment.business_name || 'Unknown'}
- Lead Score: ${personData.lead_score || 'Unknown'}/100
- Ad Spend: ${personData.ad_spend || 'Unknown'}
- Ad Quality: ${personData.ad_quality || 'Unknown'}/100

TEMPLATE TO PERSONALIZE:
${step.message_template || 'Write an appropriate outreach message for this step.'}

RULES:
1. ${sequence.channel === 'instagram' ? 'Max 500 characters. No links. Casual tone.' : ''}
2. ${sequence.channel === 'email' ? 'Include Subject: on first line. Professional but warm.' : ''}
3. ${sequence.channel === 'whatsapp' ? 'Max 600 characters. Friendly. Short paragraphs.' : ''}
4. ${sequence.channel === 'linkedin' ? 'Max 300 characters. Professional networking tone.' : ''}
5. Reference something SPECIFIC about their business
6. ${step.step_number > 1 ? 'This is a follow-up. Don\'t repeat the first message. Add new value or urgency.' : ''}
7. End with a question or clear CTA
8. Sound human, not AI-generated

Return ONLY the message text. For email, start with "Subject: " on the first line.`;

      const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
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
      });

      if (!aiRes.ok) {
        return NextResponse.json({ error: `AI generation failed (${aiRes.status})` }, { status: 500 });
      }

      const aiData = await aiRes.json();
      const messageText = aiData.content?.[0]?.text || '';

      // Parse subject for email
      let subject = '';
      let messageBody = messageText;
      if (sequence.channel === 'email' && messageText.toLowerCase().startsWith('subject:')) {
        const lines = messageText.split('\n');
        subject = lines[0].replace(/^subject:\s*/i, '').trim();
        messageBody = lines.slice(1).join('\n').trim();
      }

      // Store generated message
      const genMsgs = enrollment.generated_messages || [];
      genMsgs.push({
        step_number: step.step_number,
        message: messageBody,
        subject: subject || undefined,
        generated_at: new Date().toISOString(),
        sent: false,
      });

      await supabase
        .from('sequence_enrollments')
        .update({ generated_messages: genMsgs })
        .eq('id', enrollment_id);

      return NextResponse.json({
        enrollment_id,
        step_number: step.step_number,
        channel: sequence.channel,
        subject: subject || undefined,
        message: messageBody,
        character_count: messageBody.length,
      });
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// ─── PUT: Update sequence ────────────────────────────────────────
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, ...updates } = body;

    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

    const { data, error } = await supabase
      .from('outreach_sequences')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ sequence: data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// ─── DELETE: Remove sequence ─────────────────────────────────────
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

    const { error } = await supabase.from('outreach_sequences').delete().eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ deleted: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
