import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

// ═══════════════════════════════════════════════════════
// FOLLOW-UP COMMAND CENTER
// 7-touchpoint sequence: cold open → value add → competitor move →
// social proof → mini audit → breakup → reactivation
// ═══════════════════════════════════════════════════════

// Cumulative day offsets from sequence start (step 0 = day 0)
const STEP_DAY_OFFSETS = [0, 2, 5, 7, 10, 14];
const STEP_TYPES = ['cold_open', 'value_add', 'competitor_move', 'social_proof', 'mini_audit', 'breakup'];
const STEP_LABELS = ['Cold Open', 'Value Add', 'Competitor Move', 'Social Proof', 'Mini Audit (Free)', 'Breakup'];

// Default messages — used when no preset is wired into the sequence's campaign.
const DEFAULT_STEP_MESSAGES: Record<string, string> = {
  cold_open: `Hey {{firstName}} 👋 quick question — are you currently running paid ads for {{clinicName}} or relying on word-of-mouth?`,
  value_add: `Hey {{firstName}} — sharing this because it's relevant: aesthetic clinics in {{city}} that publish 2 short-form videos per week are pulling 3-5x the enquiries of clinics that don't. Most of your competitors aren't doing it. Worth a 5-min look?`,
  competitor_move: `Hey {{firstName}} — heads up, a clinic 10 min from you just launched an aggressive promo + ad spend push. They're going for the same patients. I've got the breakdown if you want it.`,
  social_proof: `Hey {{firstName}} — quick story: clinic about your size went from 23 Google reviews to 180+ in 90 days, jumped to #1 in the map pack, and 3x'd monthly bookings. Same playbook would work for {{clinicName}}. Want the 2-min version?`,
  mini_audit: `Hey {{firstName}} — I ran a quick check on {{clinicName}}'s online presence (no charge, just curious). 3 things stood out that are likely costing you bookings. Want me to send the findings?`,
  breakup: `Hey {{firstName}} — I've reached out a few times and I get it, you're flat out. I'll close your file on my end. If you ever want to look at filling more {{niche}} appointments, I'm here. No hard feelings either way 👊`,
};

interface SeqLeadJoin {
  id: string;
  business_name: string;
  city: string | null;
  niche: string | null;
  phone: string | null;
  phone_formatted: string | null;
  instagram_url: string | null;
  instagram_handle: string | null;
  google_review_count: number | null;
  google_rating: number | null;
  audit_score: number | null;
  outreach_status: string | null;
}

interface Sequence {
  id: string;
  lead_id: string;
  campaign_id: string | null;
  status: string;
  current_step: number;
  max_steps: number;
  channel: string;
  started_at: string;
  last_touchpoint_at: string | null;
  next_touchpoint_at: string | null;
  completed_at: string | null;
  touchpoints: Array<{ step: number; sent_at: string; message: string; type?: string }>;
  replied: boolean;
  replied_at: string | null;
  reply_sentiment: string | null;
  outcome: string | null;
  notes: string | null;
  leads?: SeqLeadJoin | null;
}

function fillTemplate(message: string, lead: SeqLeadJoin | null): string {
  if (!lead) return message;
  const firstName = lead.business_name?.split(/[\s\-&]/)[0] || 'there';
  return message
    .replace(/\{\{firstName\}\}/g, firstName)
    .replace(/\{\{first_name\}\}/g, firstName)
    .replace(/\{\{clinicName\}\}/g, lead.business_name || 'your clinic')
    .replace(/\{\{business_name\}\}/g, lead.business_name || 'your business')
    .replace(/\{\{city\}\}/g, lead.city || 'your area')
    .replace(/\{\{niche\}\}/g, lead.niche || 'clinic')
    .replace(/\{\{reviewCount\}\}/g, String(lead.google_review_count || 'great'))
    .replace(/\{\{rating\}\}/g, String(lead.google_rating ?? ''))
    .replace(/\{\{handle\}\}/g, lead.instagram_handle || '')
    .replace(/\{\{instagram_handle\}\}/g, lead.instagram_handle || '');
}

function nextScheduledFor(currentStep: number, nextStep: number): Date {
  const gap = (STEP_DAY_OFFSETS[nextStep] ?? 0) - (STEP_DAY_OFFSETS[currentStep] ?? 0);
  const d = new Date();
  d.setDate(d.getDate() + Math.max(0, gap));
  return d;
}

// ─── ROUTING ────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;
    switch (action) {
      case 'get_queue': return getQueue();
      case 'get_stats': return getStats();
      case 'get_completed': return getCompleted();
      case 'get_history': return getHistory(body);
      case 'start_sequence': return startSequence(body);
      case 'complete_touchpoint': return completeTouchpoint(body);
      case 'mark_replied': return markReplied(body);
      case 'mark_dead': return markDead(body);
      case 'skip_step': return skipStep(body);
      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ─── QUEUE / STATS / COMPLETED ──────────────────────────

const LEAD_SELECT = 'id, business_name, city, niche, phone, phone_formatted, instagram_url, instagram_handle, google_review_count, google_rating, audit_score, outreach_status';

async function getQueue() {
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);

  const { data, error } = await supabase
    .from('follow_up_sequences')
    .select(`*, leads:lead_id (${LEAD_SELECT})`)
    .eq('status', 'active')
    .lte('next_touchpoint_at', endOfToday.toISOString())
    .order('next_touchpoint_at', { ascending: true })
    .limit(500);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const queue = (data || []).map(rawSeq => {
    const seq = rawSeq as Sequence;
    const stepIndex = seq.current_step;
    const stepType = STEP_TYPES[stepIndex] || `step_${stepIndex}`;
    const stepLabel = STEP_LABELS[stepIndex] || `Step ${stepIndex + 1}`;
    const baseMessage = DEFAULT_STEP_MESSAGES[stepType] || DEFAULT_STEP_MESSAGES.cold_open;
    const personalised = fillTemplate(baseMessage, seq.leads || null);
    const lastSent = seq.last_touchpoint_at ? new Date(seq.last_touchpoint_at) : new Date(seq.started_at);
    const daysSinceLast = Math.floor((Date.now() - lastSent.getTime()) / (1000 * 60 * 60 * 24));
    const isOverdue = seq.next_touchpoint_at ? new Date(seq.next_touchpoint_at).getTime() < Date.now() - 60_000 : false;
    return {
      sequence: seq,
      step_index: stepIndex,
      step_type: stepType,
      step_label: stepLabel,
      message: personalised,
      days_since_last: daysSinceLast,
      is_overdue: isOverdue,
    };
  });

  return NextResponse.json({ success: true, queue });
}

async function getStats() {
  const now = new Date();
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);

  const [overdueRes, dueTodayRes, activeRes] = await Promise.all([
    supabase.from('follow_up_sequences').select('id', { count: 'exact', head: true })
      .eq('status', 'active').lt('next_touchpoint_at', now.toISOString()),
    supabase.from('follow_up_sequences').select('id', { count: 'exact', head: true })
      .eq('status', 'active').gte('next_touchpoint_at', now.toISOString()).lte('next_touchpoint_at', endOfToday.toISOString()),
    supabase.from('follow_up_sequences').select('id', { count: 'exact', head: true })
      .eq('status', 'active'),
  ]);

  return NextResponse.json({
    success: true,
    overdue: overdueRes.count || 0,
    due_today: dueTodayRes.count || 0,
    total_active: activeRes.count || 0,
  });
}

async function getCompleted() {
  const { data, error } = await supabase
    .from('follow_up_sequences')
    .select(`*, leads:lead_id (${LEAD_SELECT})`)
    .in('status', ['replied', 'completed', 'dead'])
    .order('updated_at', { ascending: false })
    .limit(50);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, sequences: data || [] });
}

async function getHistory(body: { sequence_id: string }) {
  if (!body.sequence_id) return NextResponse.json({ error: 'sequence_id required' }, { status: 400 });
  const { data, error } = await supabase
    .from('follow_up_sequences')
    .select(`*, leads:lead_id (${LEAD_SELECT})`)
    .eq('id', body.sequence_id)
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, sequence: data });
}

// ─── START SEQUENCE ─────────────────────────────────────

interface StartSequenceBody {
  lead_id?: string;
  channel?: 'instagram' | 'whatsapp' | 'sms';
  campaign_id?: string | null;
  start_now?: boolean;
}

async function startSequence(body: StartSequenceBody) {
  const { lead_id, channel = 'instagram', campaign_id = null, start_now = true } = body;
  if (!lead_id) return NextResponse.json({ error: 'lead_id required' }, { status: 400 });

  // Don't double-up: bail if there's an active sequence for this lead
  const { data: existing } = await supabase
    .from('follow_up_sequences')
    .select('id')
    .eq('lead_id', lead_id)
    .eq('status', 'active')
    .limit(1);
  if (existing && existing.length > 0) {
    return NextResponse.json({ success: true, sequence_id: existing[0].id, already_active: true });
  }

  const now = new Date();
  const nextDate = start_now ? now : (() => { const d = new Date(); d.setDate(d.getDate() + STEP_DAY_OFFSETS[0]); return d; })();

  const { data, error } = await supabase
    .from('follow_up_sequences')
    .insert({
      lead_id,
      campaign_id,
      channel,
      status: 'active',
      current_step: 0,
      max_steps: STEP_TYPES.length - 1,
      started_at: now.toISOString(),
      next_touchpoint_at: nextDate.toISOString(),
      touchpoints: [],
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Tag the lead so the rest of the app knows it's in a sequence
  await supabase.from('leads').update({
    outreach_status: 'sequence_active',
    outreach_channel: channel,
  }).eq('id', lead_id);

  return NextResponse.json({ success: true, sequence: data });
}

// ─── COMPLETE TOUCHPOINT ────────────────────────────────

interface CompleteBody {
  sequence_id: string;
  message?: string;
}

async function completeTouchpoint(body: CompleteBody) {
  const { sequence_id, message } = body;
  if (!sequence_id) return NextResponse.json({ error: 'sequence_id required' }, { status: 400 });

  const { data: seqData, error: getErr } = await supabase
    .from('follow_up_sequences')
    .select('*')
    .eq('id', sequence_id)
    .single();
  if (getErr || !seqData) return NextResponse.json({ error: getErr?.message || 'Sequence not found' }, { status: 404 });
  const seq = seqData as Sequence;

  const stepIndex = seq.current_step;
  const stepType = STEP_TYPES[stepIndex] || `step_${stepIndex}`;
  const newTouchpoint = {
    step: stepIndex,
    type: stepType,
    sent_at: new Date().toISOString(),
    message: (message || '').slice(0, 500),
  };
  const touchpoints = [...(seq.touchpoints || []), newTouchpoint];

  const nextStep = stepIndex + 1;
  const isFinalStep = nextStep > seq.max_steps;
  const newStatus = isFinalStep ? 'completed' : 'active';
  const next = isFinalStep ? null : nextScheduledFor(stepIndex, nextStep).toISOString();

  const now = new Date().toISOString();
  await supabase.from('follow_up_sequences').update({
    current_step: nextStep,
    touchpoints,
    last_touchpoint_at: now,
    next_touchpoint_at: next,
    status: newStatus,
    completed_at: isFinalStep ? now : null,
    updated_at: now,
  }).eq('id', sequence_id);

  // Bump lead outreach status
  const leadStatus = stepIndex === 0 ? 'dm_sent' : `follow_up_${Math.min(nextStep, 6)}`;
  await supabase.from('leads').update({
    outreach_status: leadStatus,
    last_outreach_at: now,
    follow_up_count: nextStep,
  }).eq('id', seq.lead_id);

  return NextResponse.json({ success: true, next_step: nextStep, completed: isFinalStep });
}

// ─── MARK REPLIED / DEAD / SKIP ─────────────────────────

async function markReplied(body: { sequence_id: string; sentiment?: 'positive' | 'negative' | 'neutral'; reply_text?: string }) {
  if (!body.sequence_id) return NextResponse.json({ error: 'sequence_id required' }, { status: 400 });
  const now = new Date().toISOString();
  const { data: seq } = await supabase.from('follow_up_sequences').select('lead_id').eq('id', body.sequence_id).single();
  await supabase.from('follow_up_sequences').update({
    status: 'replied',
    replied: true,
    replied_at: now,
    reply_sentiment: body.sentiment || 'neutral',
    notes: body.reply_text || null,
    next_touchpoint_at: null,
    updated_at: now,
  }).eq('id', body.sequence_id);

  if (seq) {
    await supabase.from('leads').update({
      response_status: 'replied',
      response_sentiment: body.sentiment || 'neutral',
      responded_at: now,
    }).eq('id', (seq as { lead_id: string }).lead_id);
  }
  return NextResponse.json({ success: true });
}

async function markDead(body: { sequence_id: string; reason?: string }) {
  if (!body.sequence_id) return NextResponse.json({ error: 'sequence_id required' }, { status: 400 });
  const now = new Date().toISOString();
  await supabase.from('follow_up_sequences').update({
    status: 'dead',
    outcome: 'dead',
    notes: body.reason || null,
    next_touchpoint_at: null,
    updated_at: now,
  }).eq('id', body.sequence_id);
  return NextResponse.json({ success: true });
}

async function skipStep(body: { sequence_id: string }) {
  if (!body.sequence_id) return NextResponse.json({ error: 'sequence_id required' }, { status: 400 });
  const { data: seqData } = await supabase.from('follow_up_sequences').select('*').eq('id', body.sequence_id).single();
  if (!seqData) return NextResponse.json({ error: 'Sequence not found' }, { status: 404 });
  const seq = seqData as Sequence;
  const stepIndex = seq.current_step;
  const nextStep = stepIndex + 1;
  const isFinalStep = nextStep > seq.max_steps;
  const next = isFinalStep ? null : nextScheduledFor(stepIndex, nextStep).toISOString();
  const now = new Date().toISOString();
  await supabase.from('follow_up_sequences').update({
    current_step: nextStep,
    next_touchpoint_at: next,
    status: isFinalStep ? 'completed' : 'active',
    completed_at: isFinalStep ? now : null,
    updated_at: now,
  }).eq('id', body.sequence_id);
  return NextResponse.json({ success: true });
}
