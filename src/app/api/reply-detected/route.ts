import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// ─── INTENT CLASSIFICATION ──────────────────────────────────────
const INTENT_PROMPT = `You are an expert at classifying sales conversation replies for a UK marketing agency that serves med spas, aesthetic clinics, dental practices, and beauty businesses.

Classify this reply into ONE of these intents:
- positive_interest: They want to learn more, asked a question about services, or showed curiosity
- pricing_inquiry: They asked about cost, pricing, packages, or investment
- objection: They raised a concern (already have agency, too busy, bad timing, not interested but polite)
- not_interested: Clear rejection, asked to stop messaging, hostile
- booking_ready: They agreed to a call, asked for availability, or said yes
- question: Asked a neutral question not directly about buying
- spam: Auto-reply, out-of-office, or irrelevant

Return ONLY a JSON object (no markdown, no backticks):
{"intent": "positive_interest", "confidence": 0.92, "reasoning": "one sentence why", "suggested_response_approach": "brief strategy"}`;

async function classifyIntent(
  replyText: string,
  conversationContext: string
): Promise<{ intent: string; confidence: number; reasoning: string; approach: string }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { intent: 'unknown', confidence: 0, reasoning: 'No API key', approach: '' };
  }

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
        max_tokens: 300,
        messages: [{
          role: 'user',
          content: `${INTENT_PROMPT}\n\nConversation context:\n${conversationContext}\n\nNew reply to classify:\n"${replyText}"`,
        }],
      }),
    });

    if (!res.ok) return { intent: 'unknown', confidence: 0, reasoning: 'API error', approach: '' };

    const data = await res.json();
    const raw = data.content?.[0]?.text || '';
    const cleaned = raw.replace(/```json\s*|```\s*/g, '').trim();
    const parsed = JSON.parse(cleaned);

    return {
      intent: parsed.intent || 'unknown',
      confidence: parsed.confidence || 0,
      reasoning: parsed.reasoning || '',
      approach: parsed.suggested_response_approach || '',
    };
  } catch {
    return { intent: 'unknown', confidence: 0, reasoning: 'Parse error', approach: '' };
  }
}

// ─── PROCESS AUTOMATION RULES ────────────────────────────────────
async function fireAutomationRules(
  triggerType: string,
  context: {
    intent?: string;
    lead_id?: string;
    conversation_id?: string;
    enrollment_id?: string;
    channel?: string;
    lead_score?: number;
    pipeline_stage?: string;
  }
) {
  // Fetch active rules matching this trigger
  const { data: rules } = await supabase
    .from('automation_rules')
    .select('*')
    .eq('is_active', true)
    .eq('trigger_type', triggerType)
    .order('priority', { ascending: false });

  if (!rules || rules.length === 0) return;

  for (const rule of rules) {
    const conditions = rule.trigger_conditions || {};
    let shouldFire = true;

    // Check conditions
    if (conditions.intent && conditions.intent !== context.intent) shouldFire = false;
    if (conditions.channel && conditions.channel !== context.channel) shouldFire = false;
    if (conditions.min_score && (context.lead_score || 0) < conditions.min_score) shouldFire = false;
    if (conditions.pipeline_stage && conditions.pipeline_stage !== context.pipeline_stage) shouldFire = false;

    if (!shouldFire) continue;

    // Execute action
    const action = rule.action_config || {};
    try {
      switch (rule.action_type) {
        case 'move_pipeline':
          if (context.lead_id && action.pipeline_stage) {
            await supabase.from('leads').update({ pipeline_stage: action.pipeline_stage }).eq('id', context.lead_id);
          }
          break;

        case 'update_lead_status':
          if (context.lead_id && action.lead_priority) {
            await supabase.from('leads').update({ lead_priority: action.lead_priority }).eq('id', context.lead_id);
          }
          break;

        case 'pause_sequence':
          if (context.enrollment_id) {
            await supabase.from('sequence_enrollments').update({ status: 'paused' }).eq('id', context.enrollment_id);
          }
          break;

        case 'activate_ai_qualifier':
          if (context.conversation_id && context.lead_id) {
            await supabase.from('ai_conversations').insert({
              conversation_id: context.conversation_id,
              lead_id: context.lead_id,
              enrollment_id: context.enrollment_id,
              qualifier_type: action.qualifier_type || 'standard',
              status: 'active',
            });
            await supabase.from('conversations').update({
              ai_handling_active: true,
              status: 'ai_handling',
            }).eq('id', context.conversation_id);
          }
          break;

        case 'push_to_ghl':
          // Will be handled by existing GHL integration
          break;

        case 'send_slack_alert':
          if (action.slack_webhook) {
            await fetch(action.slack_webhook, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                text: `🔔 *${rule.name}* fired!\nLead: ${context.lead_id}\nIntent: ${context.intent}\nChannel: ${context.channel}`,
              }),
            }).catch(() => {});
          }
          break;
      }

      // Log execution
      const log = rule.execution_log || [];
      log.unshift({
        fired_at: new Date().toISOString(),
        context: { intent: context.intent, lead_id: context.lead_id, channel: context.channel },
        action: rule.action_type,
        success: true,
      });

      await supabase.from('automation_rules').update({
        times_fired: (rule.times_fired || 0) + 1,
        last_fired_at: new Date().toISOString(),
        execution_log: log.slice(0, 50),
      }).eq('id', rule.id);

    } catch (err: any) {
      console.error(`Automation rule ${rule.name} failed:`, err.message);
    }
  }
}

// ─── MAIN WEBHOOK HANDLER (POST) ────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      source = 'ghl',       // ghl, manychat, heyreach, custom
      event_type,            // reply, message_sent, status_change
      contact_id,            // GHL contact ID or equivalent
      contact_name,
      contact_handle,        // IG handle, email, phone
      channel,               // instagram, whatsapp, email, linkedin, sms
      message_text,          // The reply content
      business_name,
      metadata = {},         // Any extra data from the source
    } = body;

    if (!message_text && event_type !== 'status_change') {
      return NextResponse.json({ error: 'message_text is required for reply events' }, { status: 400 });
    }

    // 1. Log the webhook
    const { data: webhookLog } = await supabase
      .from('webhook_logs')
      .insert({
        source,
        event_type: event_type || 'reply',
        payload: body,
        processed: false,
      })
      .select('id')
      .single();

    // 2. Find or create conversation
    let conversation: any = null;
    
    // Try to find existing conversation by handle + channel
    if (contact_handle) {
      const { data: existing } = await supabase
        .from('conversations')
        .select('*')
        .eq('contact_handle', contact_handle)
        .eq('channel', channel || 'email')
        .eq('status', 'active')
        .order('last_activity_at', { ascending: false })
        .limit(1)
        .single();

      conversation = existing;
    }

    // Try to find by lead name
    if (!conversation && business_name) {
      const { data: lead } = await supabase
        .from('leads')
        .select('id')
        .ilike('business_name', business_name)
        .limit(1)
        .single();

      if (lead) {
        const { data: existing } = await supabase
          .from('conversations')
          .select('*')
          .eq('lead_id', lead.id)
          .eq('channel', channel || 'email')
          .in('status', ['active', 'waiting_reply', 'ai_handling'])
          .order('last_activity_at', { ascending: false })
          .limit(1)
          .single();

        conversation = existing;
      }
    }

    // Create new conversation if needed
    if (!conversation) {
      // Try to find lead
      let leadId = null;
      let leadScore = null;
      let leadPriority = null;
      let pipelineStage = null;

      if (contact_handle) {
        const { data: lead } = await supabase
          .from('leads')
          .select('id, lead_score, lead_priority, pipeline_stage')
          .or(`email.eq.${contact_handle},instagram_url.ilike.%${contact_handle}%,phone.eq.${contact_handle}`)
          .limit(1)
          .single();
        
        if (lead) {
          leadId = lead.id;
          leadScore = lead.lead_score;
          leadPriority = lead.lead_priority;
          pipelineStage = lead.pipeline_stage;
        }
      }

      const { data: newConvo } = await supabase
        .from('conversations')
        .insert({
          lead_id: leadId,
          business_name: business_name || contact_name || 'Unknown',
          contact_name: contact_name || null,
          contact_handle: contact_handle || null,
          channel: channel || 'email',
          status: 'replied',
          messages: [],
          message_count: 0,
          lead_score: leadScore,
          lead_priority: leadPriority,
          pipeline_stage: pipelineStage,
          last_activity_at: new Date().toISOString(),
        })
        .select()
        .single();

      conversation = newConvo;
    }

    if (!conversation) {
      return NextResponse.json({ error: 'Failed to find or create conversation' }, { status: 500 });
    }

    // 3. Add message to conversation
    const messages = conversation.messages || [];
    const newMessage = {
      id: crypto.randomUUID(),
      direction: 'inbound',
      content: message_text,
      timestamp: new Date().toISOString(),
      sender: contact_name || business_name || 'Prospect',
      channel: channel || 'email',
      is_ai_generated: false,
      read: false,
    };
    messages.push(newMessage);

    // 4. Classify intent
    const conversationContext = messages
      .slice(-6)
      .map((m: any) => `${m.direction === 'inbound' ? 'Prospect' : 'You'}: ${m.content}`)
      .join('\n');

    const intentResult = await classifyIntent(message_text, conversationContext);

    // 5. Update conversation
    await supabase
      .from('conversations')
      .update({
        messages,
        message_count: messages.length,
        status: intentResult.intent === 'booking_ready' ? 'booked'
          : intentResult.intent === 'not_interested' ? 'closed'
          : 'replied',
        latest_intent: intentResult.intent,
        intent_confidence: intentResult.confidence,
        last_inbound_at: new Date().toISOString(),
        last_activity_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', conversation.id);

    // 6. Update enrollment if linked
    if (conversation.enrollment_id) {
      await supabase
        .from('sequence_enrollments')
        .update({
          status: intentResult.intent === 'booking_ready' ? 'booked'
            : intentResult.intent === 'not_interested' ? 'not_interested'
            : intentResult.intent === 'objection' ? 'objection'
            : 'replied',
          replied_at: new Date().toISOString(),
          reply_intent: intentResult.intent,
          reply_confidence: intentResult.confidence,
          updated_at: new Date().toISOString(),
        })
        .eq('id', conversation.enrollment_id);

      // Update sequence stats
      const { data: enrollment } = await supabase
        .from('sequence_enrollments')
        .select('sequence_id')
        .eq('id', conversation.enrollment_id)
        .single();

      if (enrollment) {
        await supabase.rpc('increment_sequence_replies', { seq_id: enrollment.sequence_id }).catch(() => {
          // Fallback: manual update
          supabase.from('outreach_sequences')
            .select('total_replied')
            .eq('id', enrollment.sequence_id)
            .single()
            .then(({ data }) => {
              if (data) {
                supabase.from('outreach_sequences')
                  .update({ total_replied: (data.total_replied || 0) + 1 })
                  .eq('id', enrollment.sequence_id);
              }
            });
        });
      }
    }

    // 7. Update webhook log
    await supabase
      .from('webhook_logs')
      .update({
        processed: true,
        processed_at: new Date().toISOString(),
        processing_result: {
          intent: intentResult.intent,
          confidence: intentResult.confidence,
          reasoning: intentResult.reasoning,
          approach: intentResult.approach,
        },
        lead_id: conversation.lead_id,
        conversation_id: conversation.id,
        enrollment_id: conversation.enrollment_id,
      })
      .eq('id', webhookLog?.id);

    // 8. Fire automation rules
    await fireAutomationRules('reply_received', {
      intent: intentResult.intent,
      lead_id: conversation.lead_id,
      conversation_id: conversation.id,
      enrollment_id: conversation.enrollment_id,
      channel: channel || 'email',
    });

    if (intentResult.intent !== 'unknown' && intentResult.intent !== 'spam') {
      await fireAutomationRules('intent_detected', {
        intent: intentResult.intent,
        lead_id: conversation.lead_id,
        conversation_id: conversation.id,
        enrollment_id: conversation.enrollment_id,
        channel: channel || 'email',
      });
    }

    return NextResponse.json({
      success: true,
      conversation_id: conversation.id,
      intent: intentResult.intent,
      confidence: intentResult.confidence,
      reasoning: intentResult.reasoning,
      suggested_approach: intentResult.approach,
      message_added: true,
      automations_checked: true,
    });

  } catch (err: any) {
    console.error('Reply detection error:', err);
    return NextResponse.json({ error: err.message || 'Unknown error' }, { status: 500 });
  }
}

// ─── GET: Retrieve intent classification stats ───────────────────
export async function GET(req: NextRequest) {
  try {
    const { data: conversations } = await supabase
      .from('conversations')
      .select('latest_intent, status, channel')
      .not('latest_intent', 'eq', 'unknown');

    const stats = {
      total_classified: conversations?.length || 0,
      by_intent: {} as Record<string, number>,
      by_channel: {} as Record<string, number>,
      by_status: {} as Record<string, number>,
    };

    for (const c of conversations || []) {
      stats.by_intent[c.latest_intent] = (stats.by_intent[c.latest_intent] || 0) + 1;
      stats.by_channel[c.channel] = (stats.by_channel[c.channel] || 0) + 1;
      stats.by_status[c.status] = (stats.by_status[c.status] || 0) + 1;
    }

    return NextResponse.json(stats);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
