import { NextRequest, NextResponse } from 'next/server';

import { supabaseAdmin as supabase } from '@/lib/supabase-admin';
import { authOr401 } from '@/lib/api-auth';
import {
  OUTCOME_BY_ID, nextCallAfter, localTimeLabel,
  type CallOutcome, type CallStage,
} from '@/lib/calling';

// ═══════════════════════════════════════════════════════════════
// COLD CALL PIPELINE
//
// Writes only to the call_* columns and call_logs. outreach_status,
// pipeline_stage and everything else belonging to the Instagram DM
// channel are left alone on purpose — the two channels track the
// same lead independently.
// ═══════════════════════════════════════════════════════════════

const LEAD_FIELDS =
  'id, business_name, niche, city, county, country, country_code, state_code, timezone, ' +
  'address, phone, phone_formatted, email, website, instagram_url, instagram_handle, ' +
  'google_rating, google_review_count, lead_score, lead_priority, ' +
  'owner_name, owner_first_name, owner_role, owner_source, owner_confidence, owner_enriched_at, ' +
  'call_stage, call_outcome, call_attempts, first_call_at, last_call_at, next_call_at, ' +
  'callback_at, call_notes, call_assigned_to, call_booked_at, do_not_call, dnc_reason, gatekeeper_name, ' +
  'outreach_status, responded_at, ghl_contact_id, estimated_monthly_loss';

export async function POST(request: NextRequest) {
  const auth = await authOr401();
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await request.json();
    switch (body.action) {
      case 'get_pipeline':   return getPipeline(body);
      case 'get_stats':      return getStats(body);
      case 'log_call':       return logCall(body, auth.email || 'unknown');
      case 'move_stage':     return moveStage(body);
      case 'update_lead':    return updateLead(body);
      case 'set_dnc':        return setDnc(body);
      case 'get_history':    return getHistory(body);
      case 'get_filters':    return getFilterOptions();
      case 'bulk_assign':    return bulkAssign(body);
      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Call pipeline error';
    console.error('[call-pipeline]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ═══ PIPELINE ═══════════════════════════════════════════════
// Board and list share this. Timezone-dependent filters (callable
// now) are applied client-side because they depend on the viewer's
// clock, not the server's.

interface PipelineBody {
  stages?: CallStage[];
  country_code?: string;
  city?: string;
  county?: string;
  niche?: string;
  priority?: string;
  assigned_to?: string;
  owner_known?: 'yes' | 'no' | 'verified';
  search?: string;
  min_score?: number;
  max_attempts?: number;
  due_only?: boolean;
  has_phone?: boolean;
  never_dm?: boolean;
  timezones?: string[];
  sort_by?: string;
  limit?: number;
}

async function getPipeline(body: PipelineBody) {
  const limit = Math.min(body.limit || 500, 2000);

  let q = supabase.from('leads').select(LEAD_FIELDS).limit(limit);

  // Never surface a suppressed number in a calling view.
  q = q.eq('do_not_call', false);

  if (body.has_phone !== false) q = q.not('phone', 'is', null);
  if (body.stages?.length)      q = q.in('call_stage', body.stages);
  if (body.country_code)        q = q.eq('country_code', body.country_code);
  if (body.city)                q = q.eq('city', body.city);
  if (body.county)              q = q.eq('county', body.county);
  if (body.niche)               q = q.eq('niche', body.niche);
  if (body.priority)            q = q.eq('lead_priority', body.priority);
  if (body.assigned_to)         q = q.eq('call_assigned_to', body.assigned_to);
  if (body.timezones?.length)   q = q.in('timezone', body.timezones);
  if (typeof body.min_score === 'number')    q = q.gte('lead_score', body.min_score);
  if (typeof body.max_attempts === 'number') q = q.lte('call_attempts', body.max_attempts);

  // Owner-name filters
  if (body.owner_known === 'yes')      q = q.not('owner_name', 'is', null);
  if (body.owner_known === 'no')       q = q.is('owner_name', null);
  if (body.owner_known === 'verified') q = q.eq('owner_confidence', 'high');

  // Due = ready to ring again (or never rung at all)
  if (body.due_only) q = q.or(`next_call_at.lte.${new Date().toISOString()},next_call_at.is.null`);

  // Cold-call-only lane: leads we've never touched on Instagram
  if (body.never_dm) q = q.eq('outreach_status', 'not_started');

  if (body.search) {
    const s = body.search.replace(/[%,()]/g, '');
    q = q.or(`business_name.ilike.%${s}%,city.ilike.%${s}%,owner_name.ilike.%${s}%,phone.ilike.%${s}%`);
  }

  const sort = body.sort_by || 'lead_score';
  q = sort === 'next_call_at'
    ? q.order('next_call_at', { ascending: true, nullsFirst: true })
    : sort === 'last_call_at'
      ? q.order('last_call_at', { ascending: false, nullsFirst: false })
      : q.order('lead_score', { ascending: false, nullsFirst: false });

  const { data, error } = await q;
  if (error) throw new Error(error.message);

  return NextResponse.json({ success: true, leads: data || [] });
}

// ═══ STATS ══════════════════════════════════════════════════

async function getStats(body: { country_code?: string; assigned_to?: string }) {
  let q = supabase.from('leads').select('call_stage, call_attempts, do_not_call').not('phone', 'is', null);
  if (body.country_code) q = q.eq('country_code', body.country_code);
  if (body.assigned_to)  q = q.eq('call_assigned_to', body.assigned_to);
  const { data } = await q.limit(20000);

  const byStage: Record<string, number> = {};
  let totalDialled = 0;
  for (const r of (data || []) as Array<{ call_stage: string | null; call_attempts: number | null }>) {
    const s = r.call_stage || 'not_called';
    byStage[s] = (byStage[s] || 0) + 1;
    if ((r.call_attempts || 0) > 0) totalDialled++;
  }

  // Contact + conversion rates come off the log, not the lead rows,
  // so they reflect every attempt rather than only the latest state.
  const since = new Date(Date.now() - 30 * 86400_000).toISOString();
  const { data: logs } = await supabase
    .from('call_logs')
    .select('outcome, reached_owner, called_at, called_by')
    .gte('called_at', since)
    .limit(20000);

  const rows = (logs || []) as Array<{ outcome: string; reached_owner: boolean; called_at: string; called_by: string | null }>;
  const contacts = rows.filter(r => OUTCOME_BY_ID[r.outcome as CallOutcome]?.isContact).length;
  const ownerReached = rows.filter(r => r.reached_owner).length;
  const booked = rows.filter(r => r.outcome === 'booked' || r.outcome === 'closed_won').length;

  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const today = rows.filter(r => new Date(r.called_at) >= todayStart);

  return NextResponse.json({
    success: true,
    stats: {
      by_stage: byStage,
      total_dialled: totalDialled,
      calls_30d: rows.length,
      calls_today: today.length,
      contact_rate: rows.length ? Math.round((contacts / rows.length) * 100) : 0,
      owner_reach_rate: rows.length ? Math.round((ownerReached / rows.length) * 100) : 0,
      booked_30d: booked,
      book_rate: contacts ? Math.round((booked / contacts) * 100) : 0,
    },
  });
}

// ═══ LOG A CALL ═════════════════════════════════════════════
// The single write path for a dial outcome. Advances the stage,
// schedules the retry, appends to call_logs, and flips DNC when
// the outcome demands it.

interface LogCallBody {
  lead_id: string;
  outcome: CallOutcome;
  notes?: string;
  spoke_to?: string;
  gatekeeper_name?: string;
  objection?: string;
  callback_at?: string;
  duration_sec?: number;
  called_by?: string;
}

async function logCall(body: LogCallBody, actorEmail: string) {
  const { lead_id, outcome } = body;
  if (!lead_id)  return NextResponse.json({ error: 'lead_id required' }, { status: 400 });
  const cfg = OUTCOME_BY_ID[outcome];
  if (!cfg)      return NextResponse.json({ error: `Unknown outcome: ${outcome}` }, { status: 400 });

  const { data: lead } = await supabase
    .from('leads')
    .select('id, business_name, niche, call_stage, call_attempts, first_call_at, timezone, call_notes')
    .eq('id', lead_id)
    .single();
  if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });

  const now = new Date();
  const nowIso = now.toISOString();
  const attempts = (lead.call_attempts || 0) + 1;
  const stageBefore = lead.call_stage || 'not_called';

  // A callback time the operator typed wins over the outcome's default retry.
  const nextAt = cfg.needsTime && body.callback_at
    ? body.callback_at
    : nextCallAfter(outcome, now);

  const update: Record<string, unknown> = {
    call_stage: cfg.stage,
    call_outcome: outcome,
    call_attempts: attempts,
    last_call_at: nowIso,
    next_call_at: nextAt,
    updated_at: nowIso,
  };
  if (!lead.first_call_at) update.first_call_at = nowIso;
  if (body.callback_at)     update.callback_at = body.callback_at;
  if (body.gatekeeper_name) update.gatekeeper_name = body.gatekeeper_name;
  if (cfg.stage === 'booked') update.call_booked_at = nowIso;
  if (cfg.setsDnc) {
    update.do_not_call = true;
    update.dnc_reason = outcome === 'wrong_number' ? 'Wrong number' : 'Requested no further contact';
  }

  // Notes accumulate as a dated running log rather than overwriting.
  if (body.notes) {
    const stamp = now.toISOString().slice(0, 16).replace('T', ' ');
    const entry = `[${stamp}] ${cfg.label}: ${body.notes}`;
    update.call_notes = lead.call_notes ? `${lead.call_notes}\n${entry}` : entry;
  }

  const { error: updErr } = await supabase.from('leads').update(update).eq('id', lead_id);
  if (updErr) throw new Error(updErr.message);

  const { error: logErr } = await supabase.from('call_logs').insert({
    lead_id,
    outcome,
    stage_before: stageBefore,
    stage_after: cfg.stage,
    attempt_number: attempts,
    called_by: body.called_by || actorEmail,
    called_at: nowIso,
    duration_sec: body.duration_sec ?? null,
    local_time: localTimeLabel(lead.timezone),
    spoke_to: body.spoke_to || body.gatekeeper_name || null,
    reached_owner: cfg.reachedOwner === true,
    notes: body.notes || null,
    objection: body.objection || null,
    callback_at: body.callback_at || null,
    source: 'manual',
  });
  if (logErr) throw new Error(logErr.message);

  return NextResponse.json({
    success: true,
    stage: cfg.stage,
    attempts,
    next_call_at: nextAt,
    dnc: cfg.setsDnc === true,
  });
}

// ═══ DRAG-AND-DROP STAGE MOVE ═══════════════════════════════
// Board drags record intent, not a dial — no attempt is counted and
// the call_logs row is marked so stats don't treat it as a call.

async function moveStage(body: { lead_id: string; stage: CallStage; called_by?: string }) {
  const { lead_id, stage } = body;
  if (!lead_id || !stage) return NextResponse.json({ error: 'lead_id and stage required' }, { status: 400 });

  const { data: lead } = await supabase.from('leads').select('call_stage').eq('id', lead_id).single();
  const update: Record<string, unknown> = { call_stage: stage, updated_at: new Date().toISOString() };
  if (stage === 'booked') update.call_booked_at = new Date().toISOString();
  if (stage === 'dnc')    { update.do_not_call = true; update.dnc_reason = 'Moved to DNC on the board'; }

  const { error } = await supabase.from('leads').update(update).eq('id', lead_id);
  if (error) throw new Error(error.message);

  await supabase.from('call_logs').insert({
    lead_id,
    outcome: 'stage_move',
    stage_before: lead?.call_stage || null,
    stage_after: stage,
    called_by: body.called_by || null,
    notes: 'Moved on the board (no call placed)',
    source: 'board',
  });

  return NextResponse.json({ success: true, stage });
}

// ═══ FIELD EDITS ════════════════════════════════════════════

async function updateLead(body: { lead_id: string; updates: Record<string, unknown> }) {
  const { lead_id, updates } = body;
  if (!lead_id || !updates) return NextResponse.json({ error: 'lead_id and updates required' }, { status: 400 });

  // Only fields this screen owns may be written from here.
  const ALLOWED = new Set([
    'owner_name', 'owner_first_name', 'owner_role', 'owner_source', 'owner_confidence',
    'call_notes', 'call_assigned_to', 'next_call_at', 'callback_at', 'gatekeeper_name',
    'call_stage', 'lead_priority',
  ]);
  const safe: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(updates)) if (ALLOWED.has(k)) safe[k] = v;
  if (Object.keys(safe).length === 0) {
    return NextResponse.json({ error: 'No writable fields in updates' }, { status: 400 });
  }

  // A hand-typed owner name is the most trustworthy source there is.
  if (safe.owner_name && !updates.owner_source) {
    safe.owner_source = 'manual';
    safe.owner_confidence = 'high';
    safe.owner_enriched_at = new Date().toISOString();
    const n = String(safe.owner_name).trim().replace(/^(dr|mr|mrs|ms|miss|prof)\.?\s+/i, '');
    safe.owner_first_name = n.split(/\s+/)[0] || null;
  }
  safe.updated_at = new Date().toISOString();

  const { error } = await supabase.from('leads').update(safe).eq('id', lead_id);
  if (error) throw new Error(error.message);
  return NextResponse.json({ success: true });
}

async function setDnc(body: { lead_id: string; do_not_call: boolean; reason?: string }) {
  const { lead_id } = body;
  if (!lead_id) return NextResponse.json({ error: 'lead_id required' }, { status: 400 });

  const { error } = await supabase.from('leads').update({
    do_not_call: body.do_not_call,
    dnc_reason: body.do_not_call ? (body.reason || 'Manually suppressed') : null,
    call_stage: body.do_not_call ? 'dnc' : 'not_called',
    next_call_at: null,
    updated_at: new Date().toISOString(),
  }).eq('id', lead_id);
  if (error) throw new Error(error.message);

  return NextResponse.json({ success: true });
}

async function bulkAssign(body: { lead_ids: string[]; assigned_to: string | null }) {
  const ids = Array.isArray(body.lead_ids) ? body.lead_ids : [];
  if (ids.length === 0) return NextResponse.json({ error: 'lead_ids required' }, { status: 400 });

  const { error } = await supabase
    .from('leads')
    .update({ call_assigned_to: body.assigned_to, updated_at: new Date().toISOString() })
    .in('id', ids);
  if (error) throw new Error(error.message);

  return NextResponse.json({ success: true, updated: ids.length });
}

// ═══ HISTORY ════════════════════════════════════════════════

async function getHistory(body: { lead_id: string }) {
  if (!body.lead_id) return NextResponse.json({ error: 'lead_id required' }, { status: 400 });
  const { data } = await supabase
    .from('call_logs')
    .select('*')
    .eq('lead_id', body.lead_id)
    .order('called_at', { ascending: false })
    .limit(50);
  return NextResponse.json({ success: true, calls: data || [] });
}

// ═══ FILTER OPTIONS ═════════════════════════════════════════
// Distinct values for the dropdowns, restricted to callable leads so
// the filter bar never offers an option that yields nothing.

async function getFilterOptions() {
  const { data } = await supabase
    .from('leads')
    .select('country_code, country, city, county, niche, timezone, call_assigned_to')
    .not('phone', 'is', null)
    .eq('do_not_call', false)
    .limit(20000);

  const rows = (data || []) as Array<Record<string, string | null>>;
  const uniq = (key: string) =>
    Array.from(new Set(rows.map(r => r[key]).filter((v): v is string => !!v))).sort();

  const countries = Array.from(
    new Map(rows.filter(r => r.country_code).map(r => [r.country_code!, r.country || r.country_code!])).entries(),
  ).map(([code, label]) => ({ code, label })).sort((a, b) => a.label.localeCompare(b.label));

  // Cities are grouped under their country so the dropdown stays usable
  // at 500+ distinct values.
  const citiesByCountry: Record<string, string[]> = {};
  for (const r of rows) {
    if (!r.country_code || !r.city) continue;
    (citiesByCountry[r.country_code] ||= []).push(r.city);
  }
  for (const k of Object.keys(citiesByCountry)) {
    citiesByCountry[k] = Array.from(new Set(citiesByCountry[k])).sort();
  }

  const { data: team } = await supabase.from('team_members').select('email, full_name').eq('is_active', true);

  return NextResponse.json({
    success: true,
    filters: {
      countries,
      cities: uniq('city'),
      cities_by_country: citiesByCountry,
      counties: uniq('county'),
      niches: uniq('niche'),
      timezones: uniq('timezone'),
      assignees: uniq('call_assigned_to'),
      team: (team || []) as Array<{ email: string; full_name: string | null }>,
    },
  });
}
