import { NextRequest, NextResponse } from 'next/server';

import { supabaseAdmin as supabase } from '@/lib/supabase-admin';
import { verifyWebhookSecret } from '@/lib/api-auth';
import { OUTCOME_BY_ID, nextCallAfter, localTimeLabel, type CallOutcome } from '@/lib/calling';
import { accountByLocationId, accountForCountry, routingMismatch } from '@/lib/ghl-accounts';

// ═══════════════════════════════════════════════════════════════
// GOHIGHLEVEL CALL WEBHOOK
//
// Dialling happens in GHL. This endpoint attaches what GHL knows
// (duration, recording, disposition) to the Prospex call pipeline.
//
// The operator's own disposition in the call console is the source
// of truth and is never overwritten here — GHL can report "call
// completed, 4 minutes" but it cannot tell us whether that was the
// owner or a receptionist saying no. So this route:
//
//   • always writes a call_logs row (source = ghl_webhook)
//   • advances the lead ONLY for unambiguous no-contact outcomes
//     (no answer / busy / voicemail / failed), and only when no
//     operator disposition already landed for that call
//   • for answered calls, enriches the operator's existing log row
//     with duration + recording instead of guessing an outcome
//
// Point a GHL workflow webhook here and set GHL_WEBHOOK_SECRET in
// Vercel plus an x-webhook-secret header on the GHL side.
// ═══════════════════════════════════════════════════════════════

/** GHL call status → our outcome. Only unambiguous no-contact states map. */
const STATUS_MAP: Record<string, CallOutcome | null> = {
  'no-answer': 'no_answer',
  'no_answer': 'no_answer',
  noanswer:    'no_answer',
  busy:        'busy',
  voicemail:   'voicemail',
  failed:      'bad_line',
  canceled:    'bad_line',
  cancelled:   'bad_line',
  'completed': null,   // a human answered — the operator decides what it was
  answered:    null,
  'in-progress': null,
};

/** The lead fields this route needs to attach a call and advance a stage. */
interface CallLead {
  id: string;
  business_name: string;
  timezone: string | null;
  call_stage: string | null;
  call_attempts: number | null;
  first_call_at: string | null;
  phone?: string | null;
  ghl_contact_id?: string | null;
  ghl_location_id?: string | null;
  country_code?: string | null;
}

interface GhlCallPayload {
  callId?: string; id?: string; messageId?: string;
  contactId?: string; contact_id?: string;
  callStatus?: string; status?: string; callStatusRaw?: string;
  direction?: string;
  callDuration?: number | string; duration?: number | string;
  recordingUrl?: string; recording_url?: string;
  to?: string; from?: string; phone?: string;
  userId?: string; userEmail?: string; user?: { email?: string; name?: string };
  contact?: { id?: string; phone?: string; email?: string };
  locationId?: string; location_id?: string; location?: { id?: string };
}

/** Last 10 digits — enough to match a number across formatting styles. */
function phoneKey(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  return digits.length >= 10 ? digits.slice(-10) : null;
}

export async function POST(request: NextRequest) {
  const gate = verifyWebhookSecret(request, 'GHL_WEBHOOK_SECRET');
  if (gate) {
    // A rejected secret is otherwise completely invisible: 401 out, nothing
    // written, no way to tell "GoHighLevel is misconfigured" apart from
    // "GoHighLevel hasn't fired yet". Leave a breadcrumb so setup is
    // debuggable.
    //
    // Only logged when a secret WAS supplied but didn't match — i.e. a
    // plausible misconfiguration rather than a random probe of the URL.
    // Field NAMES are recorded, never values, so nothing attacker-supplied
    // is persisted.
    const supplied = request.headers.get('x-webhook-secret');
    if (supplied) {
      let keys: string[] = [];
      try {
        const peek = await request.clone().json();
        keys = peek && typeof peek === 'object' ? Object.keys(peek).slice(0, 40) : [];
      } catch { /* body wasn't JSON — the key list simply stays empty */ }

      const { error: logErr } = await supabase.from('webhook_logs').insert({
        source: 'ghl',
        event_type: 'rejected_auth',
        payload: {
          secret_length: supplied.length,
          body_keys: keys,
          user_agent: request.headers.get('user-agent'),
        },
        processed: false,
        error_message:
          'x-webhook-secret did not match GHL_WEBHOOK_SECRET. Compare the value in the ' +
          'GoHighLevel webhook action against the Vercel env var — a trailing space or ' +
          'newline is the usual cause.',
      });
      if (logErr) console.error('[ghl-call-webhook] rejected_auth log failed:', logErr.message);
    }
    return gate;
  }

  try {
    const body = (await request.json()) as GhlCallPayload;

    const ghlCallId  = body.callId || body.id || body.messageId || null;
    const contactId  = body.contactId || body.contact_id || body.contact?.id || null;
    const rawStatus  = String(body.callStatus || body.status || body.callStatusRaw || '').toLowerCase().trim();
    const duration   = Number(body.callDuration ?? body.duration ?? 0) || null;
    const recording  = body.recordingUrl || body.recording_url || null;
    const direction  = body.direction || null;
    const calledBy   = body.userEmail || body.user?.email || body.user?.name || null;
    // Which sub-account placed the call. Both the UK and the US/CA
    // workflows post here, so this is what tells them apart.
    const locationId = body.locationId || body.location_id || body.location?.id || null;
    const account    = accountByLocationId(locationId);

    // ─── Resolve the lead: GHL contact id first, then phone ───
    let lead: CallLead | null = null;

    if (contactId) {
      // A GHL contact id is only unique within its location, so scope the
      // lookup when we know which sub-account fired.
      let q = supabase
        .from('leads')
        .select('id, timezone, call_stage, call_attempts, first_call_at, business_name, ghl_location_id, country_code')
        .eq('ghl_contact_id', contactId);
      if (locationId) q = q.or(`ghl_location_id.eq.${locationId},ghl_location_id.is.null`);
      const { data } = await q.limit(1);
      lead = ((data || [])[0] as CallLead | undefined) ?? null;
    }

    if (!lead) {
      // Outbound calls dial `to`; inbound arrive `from`.
      const candidate = direction === 'inbound'
        ? (body.from || body.phone || body.contact?.phone)
        : (body.to || body.phone || body.contact?.phone);
      const key = phoneKey(candidate);
      if (key) {
        // leads.phone_key is a generated, indexed column holding the same
        // last-10-digits normalisation, so this is a single index lookup.
        // A plain LIKE on `phone` cannot work here: stored numbers are
        // formatted ("+1 704-751-7124") and never contain the raw digit run.
        let q = supabase
          .from('leads')
          .select('id, timezone, call_stage, call_attempts, first_call_at, business_name, phone, ghl_contact_id, ghl_location_id, country_code')
          .eq('phone_key', key);

        // The calling sub-account narrows the field before anything else:
        // the US/CA account can only have dialled a US or CA lead, so a
        // same-number UK branch is not a candidate.
        if (account) q = q.in('country_code', account.countries);

        // Then most recently dialled first — ~670 leads are chain branches
        // sharing one head-office number (sk:n, Thérapie, VIVO), so the
        // branch the operator just rang is the right one to attach to.
        const { data } = await q
          .order('last_call_at', { ascending: false, nullsFirst: false })
          .order('lead_score', { ascending: false, nullsFirst: false })
          .limit(1);
        lead = ((data || [])[0] as CallLead | undefined) ?? null;

        // Learn the GHL contact id so subsequent events skip the fallback
        // and land on this exact lead rather than a sibling branch.
        if (lead && contactId && !lead.ghl_contact_id) {
          await supabase.from('leads')
            .update({ ghl_contact_id: contactId, ghl_location_id: locationId })
            .eq('id', lead.id);
        }
      }
    }

    if (!lead) {
      // Log it so nothing is silently dropped, then acknowledge — a 200
      // stops GHL retrying a payload we will never be able to match.
      const { error: logErr } = await supabase.from('webhook_logs').insert({
        source: 'ghl',
        event_type: `call_unmatched:${rawStatus || 'unknown'}`,
        payload: body as unknown as Record<string, unknown>,
        processed: false,
        error_message: 'No lead matched this GHL contact id or phone number',
      });
      if (logErr) console.error('[ghl-call-webhook] unmatched log failed:', logErr.message);
      return NextResponse.json({ success: false, matched: false, reason: 'No lead matched this contact or number' });
    }

    // ─── Idempotency: GHL retries, and one call is one row ────
    if (ghlCallId) {
      const { data: existing } = await supabase
        .from('call_logs').select('id').eq('ghl_call_id', ghlCallId).maybeSingle();
      if (existing) {
        // Later events for the same call carry the final duration/recording.
        await supabase.from('call_logs').update({
          duration_sec: duration ?? undefined,
          recording_url: recording ?? undefined,
        }).eq('id', (existing as { id: string }).id);
        return NextResponse.json({ success: true, matched: true, updated: true, lead_id: lead.id });
      }
    }

    const mapped = STATUS_MAP[rawStatus];
    const nowIso = new Date().toISOString();

    // ─── Answered call: enrich the operator's log, don't guess ─
    if (mapped === null) {
      const since = new Date(Date.now() - 30 * 60_000).toISOString();
      const { data: recent } = await supabase
        .from('call_logs')
        .select('id')
        .eq('lead_id', lead.id)
        .eq('source', 'manual')
        .gte('called_at', since)
        .order('called_at', { ascending: false })
        .limit(1);

      const manual = (recent || [])[0] as { id: string } | undefined;
      if (manual) {
        await supabase.from('call_logs').update({
          duration_sec: duration,
          recording_url: recording,
          ghl_call_id: ghlCallId,
          ghl_contact_id: contactId,
          ghl_direction: direction,
          ghl_location_id: locationId,
        }).eq('id', manual.id);
        return NextResponse.json({ success: true, matched: true, attached_to_manual: true, lead_id: lead.id });
      }

      // Answered but the operator hasn't dispositioned it yet. Record the
      // call and leave the stage alone so the console still prompts them.
      await supabase.from('call_logs').insert({
        lead_id: lead.id,
        outcome: 'answered_pending',
        stage_before: lead.call_stage,
        stage_after: lead.call_stage,
        called_by: calledBy,
        called_at: nowIso,
        duration_sec: duration,
        recording_url: recording,
        local_time: localTimeLabel(lead.timezone),
        ghl_call_id: ghlCallId,
        ghl_contact_id: contactId,
        ghl_direction: direction,
        ghl_location_id: locationId,
        routing_warning: routingMismatch(lead.country_code, locationId),
        notes: 'Answered in GoHighLevel — awaiting a disposition in the call console.',
        source: 'ghl_webhook',
      });
      await supabase.from('leads').update({
        last_call_at: nowIso,
        first_call_at: lead.first_call_at || nowIso,
        call_attempts: (lead.call_attempts || 0) + 1,
      }).eq('id', lead.id);

      return NextResponse.json({ success: true, matched: true, pending_disposition: true, lead_id: lead.id });
    }

    // ─── Unambiguous no-contact: safe to advance automatically ─
    if (!mapped) {
      // Status we don't recognise. Keep the raw payload so the exact field
      // names GHL sends can be read back during setup:
      //   select payload from webhook_logs
      //   where source = 'ghl_call' order by created_at desc limit 5;
      const { error: logErr } = await supabase.from('webhook_logs').insert({
        source: 'ghl',
        event_type: `call_unmapped:${rawStatus || 'unknown'}`,
        payload: body as unknown as Record<string, unknown>,
        processed: false,
        lead_id: lead.id,
        error_message: `Unmapped call status "${rawStatus}" — add it to STATUS_MAP if it should advance the lead`,
      });
      if (logErr) console.error('[ghl-call-webhook] unmapped log failed:', logErr.message);
      return NextResponse.json({
        success: true, matched: true, lead_id: lead.id,
        ignored: `Unmapped status "${rawStatus}"`,
        hint: 'Payload saved to webhook_logs for inspection.',
      });
    }

    const cfg = OUTCOME_BY_ID[mapped];
    const attempts = (lead.call_attempts || 0) + 1;

    await supabase.from('call_logs').insert({
      lead_id: lead.id,
      outcome: mapped,
      stage_before: lead.call_stage,
      stage_after: cfg.stage,
      attempt_number: attempts,
      called_by: calledBy,
      called_at: nowIso,
      duration_sec: duration,
      recording_url: recording,
      local_time: localTimeLabel(lead.timezone),
      reached_owner: false,
      ghl_call_id: ghlCallId,
      ghl_contact_id: contactId,
      ghl_direction: direction,
      ghl_location_id: locationId,
      routing_warning: routingMismatch(lead.country_code, locationId),
      notes: `Auto-logged from GoHighLevel (${rawStatus})`,
      source: 'ghl_webhook',
    });

    // Never demote a lead that has already progressed past dialling.
    const PROTECTED = ['gatekeeper', 'spoke_owner', 'callback', 'interested', 'booked', 'closed', 'not_interested', 'dnc'];
    const update: Record<string, unknown> = {
      call_attempts: attempts,
      last_call_at: nowIso,
      updated_at: nowIso,
    };
    if (!lead.first_call_at) update.first_call_at = nowIso;
    if (!PROTECTED.includes(lead.call_stage || '')) {
      update.call_stage = cfg.stage;
      update.call_outcome = mapped;
      update.next_call_at = nextCallAfter(mapped);
    }
    await supabase.from('leads').update(update).eq('id', lead.id);

    const warning = routingMismatch(lead.country_code, locationId);
    if (warning) console.warn('[ghl-call-webhook]', warning);

    return NextResponse.json({
      success: true, matched: true, lead_id: lead.id,
      business: lead.business_name, outcome: mapped, stage: update.call_stage || lead.call_stage,
      ghl_account: account ? account.label : (locationId ? `unrecognised location ${locationId}` : 'no locationId sent'),
      routing_warning: warning,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'GHL call webhook error';
    console.error('[ghl-call-webhook]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// GHL pings the URL on save to verify it's reachable.
export async function GET() {
  return NextResponse.json({ ok: true, endpoint: 'ghl-call', expects: 'POST with x-webhook-secret' });
}
