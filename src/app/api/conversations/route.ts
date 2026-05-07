import { NextRequest, NextResponse } from 'next/server';

import { supabaseAdmin as supabase } from "@/lib/supabase-admin";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    const status = searchParams.get('status');
    const intent = searchParams.get('intent');
    const channel = searchParams.get('channel');
    const limit = parseInt(searchParams.get('limit') || '50', 10);

    if (id) {
      const { data, error } = await supabase
        .from('conversations')
        .select('*')
        .eq('id', id)
        .single();

      if (error) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });

      // Also fetch AI conversation if active
      let aiConvo = null;
      if (data.ai_handling_active) {
        const { data: ai } = await supabase
          .from('ai_conversations')
          .select('*')
          .eq('conversation_id', id)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();
        aiConvo = ai;
      }

      return NextResponse.json({ conversation: data, ai_conversation: aiConvo });
    }

    // List conversations
    let query = supabase
      .from('conversations')
      .select('id, business_name, contact_name, contact_handle, channel, status, latest_intent, intent_confidence, message_count, lead_score, lead_priority, pipeline_stage, ai_handling_active, last_inbound_at, last_activity_at, created_at')
      .order('last_activity_at', { ascending: false })
      .limit(limit);

    if (status) query = query.eq('status', status);
    if (intent) query = query.eq('latest_intent', intent);
    if (channel) query = query.eq('channel', channel);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Get summary stats
    const { data: allConvos } = await supabase
      .from('conversations')
      .select('status, latest_intent, channel, ai_handling_active');

    const stats = {
      total: allConvos?.length || 0,
      active: allConvos?.filter(c => c.status === 'active' || c.status === 'replied').length || 0,
      needs_human: allConvos?.filter(c => c.status === 'needs_human').length || 0,
      ai_handling: allConvos?.filter(c => c.ai_handling_active).length || 0,
      booked: allConvos?.filter(c => c.status === 'booked').length || 0,
      by_intent: allConvos?.reduce((acc: Record<string, number>, c) => {
        acc[c.latest_intent || 'unknown'] = (acc[c.latest_intent || 'unknown'] || 0) + 1;
        return acc;
      }, {}) || {},
      by_channel: allConvos?.reduce((acc: Record<string, number>, c) => {
        acc[c.channel] = (acc[c.channel] || 0) + 1;
        return acc;
      }, {}) || {},
    };

    return NextResponse.json({ conversations: data || [], stats });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST: Send a manual message or update conversation
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action = 'send_message' } = body;

    if (action === 'send_message') {
      const { conversation_id, message_text, channel } = body;
      if (!conversation_id || !message_text) {
        return NextResponse.json({ error: 'conversation_id and message_text required' }, { status: 400 });
      }

      const { data: convo } = await supabase
        .from('conversations')
        .select('*')
        .eq('id', conversation_id)
        .single();

      if (!convo) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });

      const messages = convo.messages || [];
      messages.push({
        id: crypto.randomUUID(),
        direction: 'outbound',
        content: message_text,
        timestamp: new Date().toISOString(),
        sender: 'You',
        channel: channel || convo.channel,
        is_ai_generated: false,
        read: true,
      });

      await supabase
        .from('conversations')
        .update({
          messages,
          message_count: messages.length,
          status: 'waiting_reply',
          last_outbound_at: new Date().toISOString(),
          last_activity_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', conversation_id);

      return NextResponse.json({ success: true, message_count: messages.length });
    }

    if (action === 'take_over') {
      // Human takes over from AI
      const { conversation_id } = body;
      await supabase
        .from('conversations')
        .update({
          ai_handling_active: false,
          status: 'active',
          updated_at: new Date().toISOString(),
        })
        .eq('id', conversation_id);

      // Update AI conversation
      await supabase
        .from('ai_conversations')
        .update({
          status: 'handed_to_human',
          handed_to_human_at: new Date().toISOString(),
          handoff_reason: 'Manual takeover',
        })
        .eq('conversation_id', conversation_id)
        .eq('status', 'active');

      return NextResponse.json({ success: true, taken_over: true });
    }

    if (action === 'update_status') {
      const { conversation_id, status: newStatus } = body;
      await supabase
        .from('conversations')
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq('id', conversation_id);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
