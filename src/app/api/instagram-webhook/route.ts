import { NextRequest, NextResponse } from 'next/server';

import { supabaseAdmin as supabase } from "@/lib/supabase-admin";
import { verifyWebhookSecret } from '@/lib/api-auth';

// ═══════════════════════════════════════════════════════════
// INSTAGRAM WEBHOOK — Receives DMs via Meta Graph API
// 
// Setup:
// 1. Create a Meta App at developers.facebook.com
// 2. Add Instagram Messaging product
// 3. Set webhook URL to: https://yourapp.vercel.app/api/instagram-webhook
// 4. Subscribe to: messages, messaging_postbacks
// 5. Set verify token in AI Agent Config
// ═══════════════════════════════════════════════════════════

// GET — Webhook verification (Meta sends this on setup)
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  // Get verify token from config
  const { data: config } = await supabase
    .from('ai_agent_config')
    .select('webhook_verify_token')
    .limit(1)
    .maybeSingle();

  const verifyToken = config?.webhook_verify_token || process.env.INSTAGRAM_VERIFY_TOKEN || 'prospex_verify';

  if (mode === 'subscribe' && token === verifyToken) {
    console.log('[Instagram Webhook] Verification successful');
    return new NextResponse(challenge, { status: 200 });
  }

  return NextResponse.json({ error: 'Verification failed' }, { status: 403 });
}

// POST — Receive incoming messages
// TODO: For full Meta-compliant verification, validate the x-hub-signature-256
// HMAC header using the Meta App Secret. The shared-secret check below is a
// minimal fallback for non-Meta callers.
export async function POST(request: NextRequest) {
  const reject = verifyWebhookSecret(request, 'INSTAGRAM_WEBHOOK_SECRET');
  if (reject) return reject;
  try {
    const body = await request.json();

    // Instagram webhook payload structure:
    // { object: "instagram", entry: [{ id, time, messaging: [{ sender, recipient, timestamp, message }] }] }
    if (body.object !== 'instagram' && body.object !== 'page') {
      return NextResponse.json({ received: true }, { status: 200 });
    }

    const entries = body.entry || [];

    for (const entry of entries) {
      const messagingEvents = entry.messaging || [];

      for (const event of messagingEvents) {
        // Skip echo messages (messages we sent)
        if (event.message?.is_echo) continue;

        const senderId = event.sender?.id;
        const messageText = event.message?.text;

        if (!senderId || !messageText) continue;

        console.log(`[Instagram Webhook] Message from ${senderId}: ${messageText.slice(0, 50)}...`);

        // Get agent config for page ID
        const { data: config } = await supabase
          .from('ai_agent_config')
          .select('instagram_access_token, instagram_page_id, auto_reply_enabled, send_window_start, send_window_end, send_timezone')
          .limit(1)
          .maybeSingle();

        // Check send window
        if (config?.send_window_start && config?.send_window_end) {
          const now = new Date();
          const hour = now.getHours(); // TODO: convert to config timezone
          if (hour < (config.send_window_start as number) || hour >= (config.send_window_end as number)) {
            console.log('[Instagram Webhook] Outside send window, queuing for later');
            // Still save the message but don't auto-reply
            await saveIncomingMessage(senderId, messageText);
            return NextResponse.json({ received: true }, { status: 200 });
          }
        }

        // Try to match to existing lead by Instagram user ID
        const { data: existingConv } = await supabase
          .from('conversations')
          .select('id, lead_id, lead_name, lead_business')
          .eq('channel_user_id', senderId)
          .eq('channel', 'instagram')
          .not('status', 'in', '("closed_won","closed_lost")')
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        // Try to get sender profile from Instagram
        let senderName = 'Instagram User';
        if (config?.instagram_access_token) {
          try {
            const profileRes = await fetch(
              `https://graph.instagram.com/${senderId}?fields=name,username&access_token=${config.instagram_access_token}`,
              { signal: AbortSignal.timeout(5000) }
            );
            if (profileRes.ok) {
              const profile = await profileRes.json();
              senderName = profile.name || profile.username || senderName;
            }
          } catch {
            // Continue without profile
          }
        }

        // Process through AI engine
        const enginePayload = {
          action: 'process_message',
          conversation_id: existingConv?.id || undefined,
          channel: 'instagram',
          channel_user_id: senderId,
          message_text: messageText,
          lead_id: existingConv?.lead_id || undefined,
          lead_name: existingConv?.lead_name || senderName,
          lead_business: existingConv?.lead_business || '',
          sender_name: senderName,
        };

        const engineRes = await fetch(new URL('/api/ai-conversation', request.url).toString(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(enginePayload),
        });

        if (!engineRes.ok) {
          console.error('[Instagram Webhook] AI engine error:', await engineRes.text());
          return NextResponse.json({ received: true }, { status: 200 });
        }

        const engineData = await engineRes.json();

        // Send AI reply back to Instagram
        if (engineData.should_send && engineData.reply && config?.instagram_access_token && config?.auto_reply_enabled) {
          await sendInstagramMessage(
            senderId,
            engineData.reply,
            config.instagram_access_token as string,
            config.instagram_page_id as string
          );
          console.log(`[Instagram Webhook] Sent reply to ${senderId}`);
        }
      }
    }

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (err: unknown) {
    console.error('[Instagram Webhook] Error:', err instanceof Error ? err.message : err);
    // Always return 200 to prevent Meta from retrying
    return NextResponse.json({ received: true }, { status: 200 });
  }
}

// ═══ SEND MESSAGE VIA INSTAGRAM API ═══
async function sendInstagramMessage(recipientId: string, messageText: string, accessToken: string, pageId: string) {
  try {
    const res = await fetch(`https://graph.instagram.com/v21.0/${pageId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        recipient: { id: recipientId },
        message: { text: messageText },
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error('[Instagram API] Send failed:', err);
      return false;
    }

    return true;
  } catch (err) {
    console.error('[Instagram API] Send error:', err);
    return false;
  }
}

// ═══ SAVE INCOMING MESSAGE (when outside send window) ═══
async function saveIncomingMessage(senderId: string, messageText: string) {
  // Find or create conversation
  const { data: existingConv } = await supabase
    .from('conversations')
    .select('id')
    .eq('channel_user_id', senderId)
    .eq('channel', 'instagram')
    .not('status', 'in', '("closed_won","closed_lost")')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  let conversationId = existingConv?.id;

  if (!conversationId) {
    const { data: newConv } = await supabase.from('conversations').insert({
      lead_name: 'Instagram User',
      channel: 'instagram',
      channel_user_id: senderId,
      status: 'new',
    }).select('id').single();
    conversationId = newConv?.id;
  }

  if (conversationId) {
    await supabase.from('conversation_messages').insert({
      conversation_id: conversationId,
      role: 'lead',
      sender_name: 'Instagram User',
      content: messageText,
      ai_intent_detected: 'pending',
    });

    await supabase.from('conversations').update({
      last_message_at: new Date().toISOString(),
      last_message_preview: messageText.slice(0, 100),
      updated_at: new Date().toISOString(),
    }).eq('id', conversationId);
  }
}
