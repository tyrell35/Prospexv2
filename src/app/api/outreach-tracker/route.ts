import { NextRequest, NextResponse } from 'next/server';

import { supabaseAdmin as supabase } from "@/lib/supabase-admin";

// ═══════════════════════════════════════════════════════
// OUTREACH TRACKER — Pipeline & Activity Tracking
// ═══════════════════════════════════════════════════════

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;

    switch (action) {
      case 'log_outreach':
        return logOutreach(body);
      case 'mark_responded':
        return markResponded(body);
      case 'update_status':
        return updateOutreachStatus(body);
      case 'get_pipeline':
        return getPipeline(body);
      case 'get_stats':
        return getStats();
      case 'get_lead_history':
        return getLeadHistory(body);
      case 'bulk_update':
        return bulkUpdate(body);
      case 'set_next_action':
        return setNextAction(body);
      case 'get_due_actions':
        return getDueActions();
      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Outreach tracker error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ═══ LOG AN OUTREACH ACTION ═══
// Call this when an SDR sends a DM, follow-up, etc.
async function logOutreach(body: Record<string, unknown>) {
  const {
    lead_id,
    channel = 'instagram',
    stage = 'cold_open',
    message_sent,
    sent_by,
    notes,
  } = body;

  if (!lead_id) return NextResponse.json({ error: 'lead_id required' }, { status: 400 });

  // Get current lead data
  const { data: lead } = await supabase
    .from('leads')
    .select('business_name, outreach_status, follow_up_count, first_outreach_at, niche, pipeline_stage')
    .eq('id', lead_id as string)
    .single();

  if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });

  // Determine new outreach status
  let newStatus = 'dm_sent';
  let followUpCount = lead.follow_up_count || 0;

  if (stage === 'cold_open' || stage === 'initial_dm') {
    newStatus = 'dm_sent';
    followUpCount = 0;
  } else if (stage === 'follow_up_1' || stage === 'follow_up') {
    followUpCount = (lead.follow_up_count || 0) + 1;
    newStatus = `follow_up_${Math.min(followUpCount, 3)}`;
  } else if (stage === 'voice_note') {
    newStatus = lead.outreach_status === 'dm_sent' ? 'follow_up_1' : lead.outreach_status || 'dm_sent';
    followUpCount = (lead.follow_up_count || 0) + 1;
  }

  const now = new Date().toISOString();

  // Update lead
  const updateData: Record<string, unknown> = {
    outreach_status: newStatus,
    outreach_channel: channel,
    last_outreach_at: now,
    follow_up_count: followUpCount,
    pipeline_stage: lead.pipeline_stage === 'new' ? 'contacted' : lead.pipeline_stage,
  };

  if (!lead.first_outreach_at) {
    updateData.first_outreach_at = now;
  }

  if (message_sent) {
    updateData.outreach_dm_text = message_sent;
  }

  // Set default next action (follow up in 2-3 days)
  const nextActionDate = new Date();
  nextActionDate.setDate(nextActionDate.getDate() + (stage === 'cold_open' ? 2 : 3));
  updateData.next_action_at = nextActionDate.toISOString();
  updateData.next_action = stage === 'cold_open' ? 'Send follow-up if no response' : 'Check for response, send next follow-up';

  await supabase.from('leads').update(updateData).eq('id', lead_id as string);

  // Log to outreach_logs
  await supabase.from('outreach_logs').insert({
    lead_id: lead_id,
    lead_name: sent_by || '',
    lead_business: lead.business_name || '',
    niche: lead.niche || '',
    channel: channel,
    stage: stage,
    outcome: 'sent',
    message_sent: message_sent || '',
    sent_by: sent_by || '',
    notes: notes || '',
  });

  return NextResponse.json({
    success: true,
    new_status: newStatus,
    follow_up_count: followUpCount,
    next_action_at: updateData.next_action_at,
  });
}

// ═══ MARK AS RESPONDED ═══
async function markResponded(body: Record<string, unknown>) {
  const { lead_id, sentiment = 'positive', notes } = body;
  if (!lead_id) return NextResponse.json({ error: 'lead_id required' }, { status: 400 });

  const now = new Date().toISOString();

  await supabase.from('leads').update({
    outreach_status: 'responded',
    response_status: 'responded',
    responded_at: now,
    response_sentiment: sentiment,
    pipeline_stage: sentiment === 'positive' ? 'pitched' : 'contacted',
    next_action_at: now,
    next_action: sentiment === 'positive'
      ? 'Hot lead! Use audit walk-through booking script'
      : sentiment === 'objection'
        ? 'Handle objection — check Outreach Coach'
        : 'Assess if worth further follow-up',
    outreach_notes: notes || undefined,
  }).eq('id', lead_id as string);

  // Log the response
  await supabase.from('outreach_logs').insert({
    lead_id: lead_id,
    lead_business: '',
    channel: 'instagram',
    stage: 'response_received',
    outcome: sentiment === 'positive' ? 'positive_reply' : sentiment === 'objection' ? 'objection' : 'replied',
    notes: notes || `Lead responded with ${sentiment} sentiment`,
  });

  return NextResponse.json({ success: true });
}

// ═══ UPDATE OUTREACH STATUS ═══
async function updateOutreachStatus(body: Record<string, unknown>) {
  const { lead_id, outreach_status, pipeline_stage, response_status, notes, next_action, next_action_at } = body;
  if (!lead_id) return NextResponse.json({ error: 'lead_id required' }, { status: 400 });

  const updateData: Record<string, unknown> = {};
  if (outreach_status) updateData.outreach_status = outreach_status;
  if (pipeline_stage) updateData.pipeline_stage = pipeline_stage;
  if (response_status) updateData.response_status = response_status;
  if (notes !== undefined) updateData.outreach_notes = notes;
  if (next_action) updateData.next_action = next_action;
  if (next_action_at) updateData.next_action_at = next_action_at;

  if (outreach_status === 'booked') {
    updateData.pipeline_stage = 'booked';
    updateData.booked_at = new Date().toISOString();
  }
  if (outreach_status === 'closed_won') {
    updateData.pipeline_stage = 'closed';
  }

  await supabase.from('leads').update(updateData).eq('id', lead_id as string);
  return NextResponse.json({ success: true });
}

// ═══ GET PIPELINE VIEW ═══
async function getPipeline(body: Record<string, unknown>) {
  const { filter_status, filter_channel, filter_assigned, search, sort_by = 'last_outreach_at', limit = 100 } = body;

  let query = supabase
    .from('leads')
    .select('id, business_name, niche, city, country, phone, email, instagram_url, website, google_rating, google_review_count, outreach_status, outreach_channel, first_outreach_at, last_outreach_at, follow_up_count, response_status, responded_at, response_sentiment, pipeline_stage, assigned_to, next_action, next_action_at, outreach_notes, booked_at, lead_priority, conversation_status')
    .neq('outreach_status', 'not_started')
    .order(sort_by as string, { ascending: false, nullsFirst: false })
    .limit(limit as number);

  if (filter_status && filter_status !== 'all') {
    query = query.eq('outreach_status', filter_status as string);
  }
  if (filter_channel && filter_channel !== 'all') {
    query = query.eq('outreach_channel', filter_channel as string);
  }
  if (filter_assigned) {
    query = query.eq('assigned_to', filter_assigned as string);
  }
  if (search) {
    query = query.or(`business_name.ilike.%${search}%,city.ilike.%${search}%,email.ilike.%${search}%`);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  return NextResponse.json({ success: true, leads: data || [] });
}

// ═══ GET PIPELINE STATS ═══
async function getStats() {
  // Overall counts by outreach status
  const { data: statusCounts } = await supabase
    .from('leads')
    .select('outreach_status')
    .neq('outreach_status', 'not_started');

  const counts: Record<string, number> = {};
  (statusCounts || []).forEach((l: Record<string, unknown>) => {
    const s = l.outreach_status as string;
    counts[s] = (counts[s] || 0) + 1;
  });

  // Response stats
  const { data: responseCounts } = await supabase
    .from('leads')
    .select('response_status, response_sentiment')
    .neq('outreach_status', 'not_started');

  const responses: Record<string, number> = {};
  const sentiments: Record<string, number> = {};
  (responseCounts || []).forEach((l: Record<string, unknown>) => {
    const rs = l.response_status as string;
    const se = l.response_sentiment as string;
    if (rs) responses[rs] = (responses[rs] || 0) + 1;
    if (se) sentiments[se] = (sentiments[se] || 0) + 1;
  });

  // Due actions count
  const { data: dueData } = await supabase
    .from('leads')
    .select('id')
    .lte('next_action_at', new Date().toISOString())
    .neq('outreach_status', 'not_started')
    .not('outreach_status', 'in', '("closed_won","closed_lost")');

  // Total outreached
  const total = (statusCounts || []).length;
  const responded = (responseCounts || []).filter((l: Record<string, unknown>) => l.response_status === 'responded').length;
  const responseRate = total > 0 ? Math.round((responded / total) * 100) : 0;

  return NextResponse.json({
    success: true,
    stats: {
      total_outreached: total,
      by_status: counts,
      response_rate: responseRate,
      responded: responded,
      by_response: responses,
      by_sentiment: sentiments,
      due_actions: (dueData || []).length,
    },
  });
}

// ═══ GET LEAD OUTREACH HISTORY ═══
async function getLeadHistory(body: Record<string, unknown>) {
  const { lead_id } = body;
  if (!lead_id) return NextResponse.json({ error: 'lead_id required' }, { status: 400 });

  const { data: logs } = await supabase
    .from('outreach_logs')
    .select('*')
    .eq('lead_id', lead_id as string)
    .order('created_at', { ascending: false });

  const { data: conversations } = await supabase
    .from('conversation_messages')
    .select('id, role, content, created_at, ai_intent_detected')
    .eq('conversation_id', lead_id as string)
    .order('created_at', { ascending: false })
    .limit(20);

  return NextResponse.json({
    success: true,
    outreach_logs: logs || [],
    conversation_messages: conversations || [],
  });
}

// ═══ BULK UPDATE ═══
async function bulkUpdate(body: Record<string, unknown>) {
  const { lead_ids, updates } = body;
  if (!Array.isArray(lead_ids) || lead_ids.length === 0) {
    return NextResponse.json({ error: 'lead_ids array required' }, { status: 400 });
  }

  await supabase
    .from('leads')
    .update(updates as Record<string, unknown>)
    .in('id', lead_ids as string[]);

  return NextResponse.json({ success: true, updated: lead_ids.length });
}

// ═══ SET NEXT ACTION ═══
async function setNextAction(body: Record<string, unknown>) {
  const { lead_id, next_action, next_action_at } = body;
  if (!lead_id) return NextResponse.json({ error: 'lead_id required' }, { status: 400 });

  await supabase.from('leads').update({
    next_action: next_action || null,
    next_action_at: next_action_at || null,
  }).eq('id', lead_id as string);

  return NextResponse.json({ success: true });
}

// ═══ GET DUE ACTIONS (follow-ups due today) ═══
async function getDueActions() {
  const { data } = await supabase
    .from('leads')
    .select('id, business_name, city, outreach_status, follow_up_count, next_action, next_action_at, last_outreach_at, response_status, assigned_to, instagram_url, outreach_channel')
    .lte('next_action_at', new Date().toISOString())
    .neq('outreach_status', 'not_started')
    .not('outreach_status', 'in', '("closed_won","closed_lost","booked")')
    .order('next_action_at', { ascending: true })
    .limit(50);

  return NextResponse.json({ success: true, due_actions: data || [] });
}
