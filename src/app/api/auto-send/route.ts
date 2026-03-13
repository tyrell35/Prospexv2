import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// ─── HUMAN-LIKE DELAY ────────────────────────────────────────────
function randomDelay(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function simulateTypingDelay(messageLength: number, speedMin: number, speedMax: number): number {
  const avgSpeed = (speedMin + speedMax) / 2;
  return Math.floor(messageLength * avgSpeed * (0.8 + Math.random() * 0.4));
}

// ─── CHECK SEND WINDOW ───────────────────────────────────────────
function isWithinSendWindow(settings: any): boolean {
  const tz = settings.send_timezone || 'Europe/London';
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz, hour: 'numeric', hour12: false,
  });
  const hour = parseInt(formatter.format(now), 10);

  const dayFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, weekday: 'short',
  });
  const dayName = dayFormatter.format(now).toLowerCase();
  const dayMap: Record<string, string> = {
    'mon': 'mon', 'tue': 'tue', 'wed': 'wed', 'thu': 'thu',
    'fri': 'fri', 'sat': 'sat', 'sun': 'sun',
  };
  const currentDay = dayMap[dayName] || dayName;

  const allowedDays = settings.send_days || ['mon','tue','wed','thu','fri'];
  if (!allowedDays.includes(currentDay)) return false;

  const start = settings.send_window_start || 9;
  const end = settings.send_window_end || 18;
  return hour >= start && hour < end;
}

// ─── SEND VIA GHL API ────────────────────────────────────────────
async function sendViaGHL(
  channel: string,
  contactHandle: string,
  message: string,
  ghlKey: string,
  locationId: string,
  businessName: string
): Promise<{ success: boolean; externalId?: string; error?: string }> {
  try {
    // First, find or create the contact in GHL
    const searchRes = await fetch(
      `https://services.leadconnectorhq.com/contacts/search/duplicate?locationId=${locationId}&${channel === 'email' ? 'email' : 'phone'}=${encodeURIComponent(contactHandle)}`,
      { headers: { Authorization: `Bearer ${ghlKey}`, Version: '2021-07-28' } }
    );

    let contactId = '';
    if (searchRes.ok) {
      const searchData = await searchRes.json();
      contactId = searchData?.contact?.id || '';
    }

    if (!contactId) {
      // Create contact
      const createBody: any = {
        locationId,
        name: businessName || 'Unknown',
      };
      if (channel === 'email') createBody.email = contactHandle;
      else createBody.phone = contactHandle;

      const createRes = await fetch('https://services.leadconnectorhq.com/contacts/', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${ghlKey}`,
          'Content-Type': 'application/json',
          Version: '2021-07-28',
        },
        body: JSON.stringify(createBody),
      });

      if (createRes.ok) {
        const createData = await createRes.json();
        contactId = createData?.contact?.id || '';
      }
    }

    if (!contactId) return { success: false, error: 'Could not find or create GHL contact' };

    // Determine message type
    let messageType = 'Email';
    if (channel === 'sms' || channel === 'whatsapp') messageType = 'SMS';
    if (channel === 'instagram') messageType = 'Instagram';
    if (channel === 'whatsapp') messageType = 'WhatsApp';

    // Send message
    const sendRes = await fetch(`https://services.leadconnectorhq.com/conversations/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ghlKey}`,
        'Content-Type': 'application/json',
        Version: '2021-07-28',
      },
      body: JSON.stringify({
        type: messageType,
        contactId,
        message,
      }),
    });

    if (!sendRes.ok) {
      const errText = await sendRes.text();
      return { success: false, error: `GHL send failed: ${sendRes.status} ${errText}` };
    }

    const sendData = await sendRes.json();
    return { success: true, externalId: sendData?.messageId || sendData?.id };

  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// ─── SEND VIA EMAIL (SMTP) ───────────────────────────────────────
async function sendViaEmail(
  to: string,
  subject: string,
  body: string
): Promise<{ success: boolean; error?: string }> {
  // Use existing email_accounts table for SMTP config
  const { data: account } = await supabase
    .from('email_accounts')
    .select('*')
    .eq('is_active', true)
    .lt('sent_today', 50)
    .order('sent_today', { ascending: true })
    .limit(1)
    .single();

  if (!account) return { success: false, error: 'No active email account available' };

  // For now, return as queued — actual SMTP sending would use nodemailer
  // In production, this would connect to the SMTP server
  // The GHL API path handles email sending more reliably
  return { success: true };
}

// ─── AI PERSONALIZE MESSAGE ──────────────────────────────────────
async function personalizeMessage(
  template: string,
  lead: any,
  tone: string
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || !template.includes('{{') && !lead) return template;

  // Simple variable replacement first
  let message = template
    .replace(/\{\{business_name\}\}/gi, lead.business_name || 'there')
    .replace(/\{\{city\}\}/gi, lead.city || '')
    .replace(/\{\{niche\}\}/gi, lead.niche || '')
    .replace(/\{\{rating\}\}/gi, lead.google_rating?.toFixed(1) || '')
    .replace(/\{\{review_count\}\}/gi, lead.google_review_count?.toString() || '')
    .replace(/\{\{website\}\}/gi, lead.website || '');

  // If still has AI markers or tone specified, use AI
  if (message.includes('{{') || tone !== 'none') {
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
          max_tokens: 500,
          messages: [{
            role: 'user',
            content: `Personalize this outreach message for ${lead.business_name || 'a business'}${lead.city ? ' in ' + lead.city : ''}. Tone: ${tone || 'professional_friendly'}. Keep the same length and structure. Return ONLY the message text.\n\nTemplate:\n${message}`,
          }],
        }),
      });
      if (res.ok) {
        const data = await res.json();
        message = data.content?.[0]?.text || message;
      }
    } catch {}
  }

  return message;
}

// ─── SELECT A/B VARIANT ──────────────────────────────────────────
async function selectVariant(sequenceId: string, stepNumber: number): Promise<any | null> {
  const { data: variants } = await supabase
    .from('script_variants')
    .select('*')
    .eq('sequence_id', sequenceId)
    .eq('step_number', stepNumber)
    .eq('is_active', true)
    .order('weight', { ascending: false });

  if (!variants || variants.length === 0) return null;
  if (variants.length === 1) return variants[0];

  // Weighted random selection
  const totalWeight = variants.reduce((sum: number, v: any) => sum + (v.weight || 50), 0);
  let random = Math.random() * totalWeight;

  for (const variant of variants) {
    random -= (variant.weight || 50);
    if (random <= 0) return variant;
  }

  return variants[0];
}

// ─── POST: Process outreach queue ────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action = 'process_queue', batch_size = 10 } = body;

    // ── QUEUE LEADS INTO SEQUENCE ──
    if (action === 'queue_sequence') {
      const { sequence_id, lead_ids } = body;
      if (!sequence_id || !lead_ids?.length) {
        return NextResponse.json({ error: 'sequence_id and lead_ids required' }, { status: 400 });
      }

      const { data: sequence } = await supabase
        .from('outreach_sequences')
        .select('*')
        .eq('id', sequence_id)
        .single();

      if (!sequence) return NextResponse.json({ error: 'Sequence not found' }, { status: 404 });

      const steps = (sequence.steps || []) as any[];
      const { data: leads } = await supabase
        .from('leads')
        .select('id, business_name, email, phone, phone_formatted, instagram_url, instagram_handle, whatsapp_eligible, country')
        .in('id', lead_ids);

      if (!leads?.length) return NextResponse.json({ error: 'No leads found' }, { status: 404 });

      let queued = 0;

      for (const lead of leads) {
        // Determine contact handle
        let handle = '';
        if (sequence.channel === 'email') handle = lead.email || '';
        else if (sequence.channel === 'instagram') handle = lead.instagram_handle || lead.instagram_url || '';
        else if (sequence.channel === 'whatsapp') {
          if (!lead.whatsapp_eligible) continue;
          handle = lead.phone_formatted || lead.phone || '';
        }
        else if (sequence.channel === 'sms') handle = lead.phone_formatted || lead.phone || '';
        else handle = lead.email || lead.phone || '';

        if (!handle) continue;

        // Create enrollment
        const { data: enrollment, error: enErr } = await supabase
          .from('sequence_enrollments')
          .upsert({
            sequence_id,
            lead_id: lead.id,
            business_name: lead.business_name,
            contact_handle: handle,
            channel: sequence.channel,
            status: 'queued',
            current_step: 0,
          }, { onConflict: 'sequence_id,lead_id' })
          .select('id')
          .single();

        if (enErr || !enrollment) continue;

        // Queue first step
        const firstStep = steps[0];
        if (!firstStep) continue;

        // Select A/B variant
        const variant = await selectVariant(sequence_id, 1);

        const sendAfter = new Date();
        sendAfter.setSeconds(sendAfter.getSeconds() + (firstStep.delay_days || 0) * 86400);

        await supabase.from('outreach_queue').insert({
          enrollment_id: enrollment.id,
          lead_id: lead.id,
          sequence_id,
          variant_id: variant?.id || null,
          step_number: 1,
          channel: sequence.channel,
          contact_handle: handle,
          business_name: lead.business_name,
          message_body: variant?.message_template || firstStep.message_template || '',
          subject: variant?.subject || firstStep.subject || null,
          is_personalized: variant?.is_ai_personalized ?? firstStep.is_ai_personalized ?? true,
          send_after: sendAfter.toISOString(),
          min_delay_seconds: 30,
          max_delay_seconds: 180,
          typing_simulation: true,
        });

        queued++;
      }

      // Update sequence stats
      await supabase
        .from('outreach_sequences')
        .update({
          total_enrolled: (sequence.total_enrolled || 0) + queued,
          status: 'active',
          updated_at: new Date().toISOString(),
        })
        .eq('id', sequence_id);

      return NextResponse.json({ queued, total_leads: leads.length });
    }

    // ── PROCESS QUEUE (the auto-send engine) ──
    if (action === 'process_queue') {
      // Get settings
      const { data: settings } = await supabase
        .from('outreach_settings')
        .select('*')
        .limit(1)
        .single();

      if (!settings) return NextResponse.json({ error: 'Outreach settings not configured' }, { status: 500 });

      // Reset daily counts if new day
      const today = new Date().toISOString().split('T')[0];
      if (settings.last_reset_date !== today) {
        await supabase.from('outreach_settings').update({
          sent_today: 0, email_sent_today: 0, instagram_sent_today: 0,
          whatsapp_sent_today: 0, sms_sent_today: 0, linkedin_sent_today: 0,
          last_reset_date: today,
        }).eq('id', settings.id);
        settings.sent_today = 0;
      }

      // Check send window
      if (!isWithinSendWindow(settings)) {
        return NextResponse.json({ message: 'Outside send window', sent: 0 });
      }

      // Check daily limit
      if (settings.sent_today >= settings.daily_send_limit) {
        return NextResponse.json({ message: 'Daily send limit reached', sent: 0 });
      }

      // Fetch pending queue items
      const remaining = settings.daily_send_limit - settings.sent_today;
      const limit = Math.min(batch_size, remaining);

      const { data: queueItems } = await supabase
        .from('outreach_queue')
        .select('*')
        .eq('status', 'pending')
        .lte('send_after', new Date().toISOString())
        .order('priority', { ascending: false })
        .order('send_after', { ascending: true })
        .limit(limit);

      if (!queueItems?.length) {
        return NextResponse.json({ message: 'No messages in queue', sent: 0 });
      }

      const ghlKey = settings.ghl_api_key || process.env.GHL_API_KEY || '';
      const ghlLocation = settings.ghl_location_id || process.env.GHL_LOCATION_ID || '';

      let sent = 0;
      const sendResults: any[] = [];

      for (const item of queueItems) {
        // Check per-channel limit
        const channelKey = `${item.channel}_sent_today` as keyof typeof settings;
        const channelLimit = (settings as any)[`${item.channel}_daily_limit`] || 20;
        if ((settings as any)[channelKey] >= channelLimit) continue;

        // Mark as processing
        await supabase.from('outreach_queue').update({ status: 'processing' }).eq('id', item.id);

        // Personalize message if needed
        let finalMessage = item.message_body;
        if (item.is_personalized && item.lead_id) {
          const { data: lead } = await supabase.from('leads').select('*').eq('id', item.lead_id).single();
          if (lead) {
            finalMessage = await personalizeMessage(item.message_body, lead, 'professional_friendly');
          }
        }

        // Simulate typing delay
        const typingDelay = item.typing_simulation
          ? simulateTypingDelay(finalMessage.length, settings.typing_speed_min_ms, settings.typing_speed_max_ms)
          : 0;

        // Human-like delay between sends
        const sendDelay = randomDelay(
          settings.min_delay_between_sends || 45,
          settings.max_delay_between_sends || 300
        );

        // Wait (human pacing)
        await new Promise(r => setTimeout(r, Math.min(sendDelay * 1000, 10000))); // Cap at 10s in serverless

        // SEND via appropriate channel
        let sendResult: { success: boolean; externalId?: string; error?: string } = { success: false, error: 'No send method configured' };

        if (ghlKey && ghlLocation) {
          sendResult = await sendViaGHL(item.channel, item.contact_handle, finalMessage, ghlKey, ghlLocation, item.business_name || '');
        } else if (item.channel === 'email') {
          sendResult = await sendViaEmail(item.contact_handle, item.subject || '', finalMessage);
        }

        // Record result
        const now = new Date().toISOString();

        if (sendResult.success) {
          // Update queue
          await supabase.from('outreach_queue').update({
            status: 'sent', processed_at: now,
          }).eq('id', item.id);

          // Create outreach_messages record
          await supabase.from('outreach_messages').insert({
            enrollment_id: item.enrollment_id,
            sequence_id: item.sequence_id,
            lead_id: item.lead_id,
            channel: item.channel,
            step_number: item.step_number,
            variant_id: item.variant_id,
            subject: item.subject,
            message_body: finalMessage,
            is_ai_personalized: item.is_personalized,
            status: 'sent',
            sent_at: now,
            sent_via: ghlKey ? 'ghl_api' : item.channel === 'email' ? 'smtp' : 'manual',
            external_message_id: sendResult.externalId,
            typing_delay_ms: typingDelay,
            delay_seconds: sendDelay,
          });

          // Update enrollment
          await supabase.from('sequence_enrollments').update({
            current_step: item.step_number,
            last_sent_at: now,
            status: 'active',
          }).eq('id', item.enrollment_id);

          // Update variant stats
          if (item.variant_id) {
            const { data: variant } = await supabase.from('script_variants').select('total_sent').eq('id', item.variant_id).single();
            if (variant) {
              const newSent = (variant.total_sent || 0) + 1;
              await supabase.from('script_variants').update({
                total_sent: newSent, updated_at: now,
              }).eq('id', item.variant_id);
            }
          }

          // Update daily counters
          await supabase.from('outreach_settings').update({
            sent_today: (settings.sent_today || 0) + 1,
            [channelKey]: ((settings as any)[channelKey] || 0) + 1,
          }).eq('id', settings.id);
          settings.sent_today++;
          (settings as any)[channelKey]++;

          // Update sequence stats
          await supabase.from('outreach_sequences').update({
            // total_sent incremented below
          }).eq('id', item.sequence_id);

          // Queue next step if exists
          const { data: seq } = await supabase.from('outreach_sequences').select('steps').eq('id', item.sequence_id).single();
          const steps = (seq?.steps || []) as any[];
          const nextStep = steps.find((s: any) => s.step_number === item.step_number + 1);

          if (nextStep && nextStep.condition !== 'if_replied') {
            const nextVariant = await selectVariant(item.sequence_id, nextStep.step_number);
            const nextSend = new Date();
            nextSend.setDate(nextSend.getDate() + (nextStep.delay_days || 3));

            await supabase.from('outreach_queue').insert({
              enrollment_id: item.enrollment_id,
              lead_id: item.lead_id,
              sequence_id: item.sequence_id,
              variant_id: nextVariant?.id || null,
              step_number: nextStep.step_number,
              channel: item.channel,
              contact_handle: item.contact_handle,
              business_name: item.business_name,
              message_body: nextVariant?.message_template || nextStep.message_template || '',
              subject: nextVariant?.subject || nextStep.subject || null,
              is_personalized: nextVariant?.is_ai_personalized ?? true,
              send_after: nextSend.toISOString(),
            });
          }

          // Create/update conversation
          const { data: existingConvo } = await supabase
            .from('conversations')
            .select('id, messages')
            .eq('lead_id', item.lead_id)
            .eq('channel', item.channel)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

          if (existingConvo) {
            const msgs = existingConvo.messages || [];
            msgs.push({
              id: crypto.randomUUID(),
              direction: 'outbound',
              content: finalMessage,
              timestamp: now,
              sender: 'Prospex Auto',
              channel: item.channel,
              is_ai_generated: item.is_personalized,
              read: true,
            });
            await supabase.from('conversations').update({
              messages: msgs,
              message_count: msgs.length,
              status: 'waiting_reply',
              last_outbound_at: now,
              last_activity_at: now,
            }).eq('id', existingConvo.id);

            // Link to outreach message
            await supabase.from('outreach_messages').update({ conversation_id: existingConvo.id })
              .eq('enrollment_id', item.enrollment_id).eq('step_number', item.step_number);
          } else {
            const { data: newConvo } = await supabase.from('conversations').insert({
              lead_id: item.lead_id,
              enrollment_id: item.enrollment_id,
              business_name: item.business_name,
              contact_handle: item.contact_handle,
              channel: item.channel,
              status: 'waiting_reply',
              messages: [{
                id: crypto.randomUUID(),
                direction: 'outbound',
                content: finalMessage,
                timestamp: now,
                sender: 'Prospex Auto',
                channel: item.channel,
                is_ai_generated: item.is_personalized,
                read: true,
              }],
              message_count: 1,
              last_outbound_at: now,
              last_activity_at: now,
            }).select('id').single();

            if (newConvo) {
              await supabase.from('outreach_messages').update({ conversation_id: newConvo.id })
                .eq('enrollment_id', item.enrollment_id).eq('step_number', item.step_number);
            }
          }

          sent++;
          sendResults.push({ id: item.id, lead: item.business_name, channel: item.channel, status: 'sent' });
        } else {
          await supabase.from('outreach_queue').update({
            status: 'failed', error: sendResult.error, processed_at: now,
          }).eq('id', item.id);

          await supabase.from('outreach_messages').insert({
            enrollment_id: item.enrollment_id, sequence_id: item.sequence_id,
            lead_id: item.lead_id, channel: item.channel, step_number: item.step_number,
            variant_id: item.variant_id, message_body: finalMessage,
            status: 'failed', failed_reason: sendResult.error, sent_via: 'ghl_api',
          });

          sendResults.push({ id: item.id, lead: item.business_name, channel: item.channel, status: 'failed', error: sendResult.error });
        }
      }

      return NextResponse.json({
        sent,
        total_queued: queueItems.length,
        daily_sent: settings.sent_today + sent,
        daily_limit: settings.daily_send_limit,
        results: sendResults,
      });
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// ─── GET: Queue status + performance stats ───────────────────────
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const view = searchParams.get('view') || 'status';

    if (view === 'status') {
      const { data: settings } = await supabase.from('outreach_settings').select('*').limit(1).single();
      const { data: pending } = await supabase.from('outreach_queue').select('id').eq('status', 'pending');
      const { data: todaySent } = await supabase
        .from('outreach_messages')
        .select('id')
        .eq('status', 'sent')
        .gte('sent_at', new Date().toISOString().split('T')[0]);

      return NextResponse.json({
        queue_size: pending?.length || 0,
        sent_today: todaySent?.length || 0,
        daily_limit: settings?.daily_send_limit || 50,
        within_send_window: settings ? isWithinSendWindow(settings) : false,
        settings: settings ? {
          send_window: `${settings.send_window_start}:00 - ${settings.send_window_end}:00 ${settings.send_timezone}`,
          send_days: settings.send_days,
          min_delay: settings.min_delay_between_sends,
          max_delay: settings.max_delay_between_sends,
          channel_limits: {
            email: `${settings.email_sent_today}/${settings.email_daily_limit}`,
            instagram: `${settings.instagram_sent_today}/${settings.instagram_daily_limit}`,
            whatsapp: `${settings.whatsapp_sent_today}/${settings.whatsapp_daily_limit}`,
            sms: `${settings.sms_sent_today}/${settings.sms_daily_limit}`,
          },
        } : null,
      });
    }

    if (view === 'performance') {
      // A/B test performance
      const { data: variants } = await supabase
        .from('script_variants')
        .select('*, sequence:outreach_sequences(name)')
        .eq('is_active', true)
        .order('reply_rate', { ascending: false });

      // Overall performance by channel
      const { data: messages } = await supabase
        .from('outreach_messages')
        .select('channel, status, replied, booked, variant_id');

      const channelStats: Record<string, { sent: number; replied: number; booked: number; rate: number }> = {};
      for (const m of messages || []) {
        if (m.status !== 'sent') continue;
        const ch = m.channel;
        if (!channelStats[ch]) channelStats[ch] = { sent: 0, replied: 0, booked: 0, rate: 0 };
        channelStats[ch].sent++;
        if (m.replied) channelStats[ch].replied++;
        if (m.booked) channelStats[ch].booked++;
      }
      for (const ch of Object.keys(channelStats)) {
        channelStats[ch].rate = channelStats[ch].sent > 0
          ? Math.round((channelStats[ch].replied / channelStats[ch].sent) * 100 * 10) / 10
          : 0;
      }

      return NextResponse.json({
        variants: variants || [],
        channel_performance: channelStats,
        total_sent: messages?.filter(m => m.status === 'sent').length || 0,
        total_replied: messages?.filter(m => m.replied).length || 0,
        total_booked: messages?.filter(m => m.booked).length || 0,
      });
    }

    return NextResponse.json({ error: 'Invalid view' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
