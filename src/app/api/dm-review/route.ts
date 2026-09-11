import { NextRequest, NextResponse } from 'next/server';

import { supabaseAdmin as supabase } from '@/lib/supabase-admin';
import { authOr401 } from '@/lib/api-auth';
import { DM_OUTCOME_BY_ID, type DmOutcome } from '@/lib/dm-outcomes';

export const maxDuration = 120;

// ═══════════════════════════════════════════════════════════════
// DM REVIEW — "did they reply?", answered
//
// The step that never existed. Sends were logged; what came back
// never was, so responded_at was null on all 12,956 leads and every
// downstream report read zero.
//
// Recording an outcome here also writes the legacy response fields
// (responded_at, response_sentiment, outreach_status) so the
// pipeline, scorecard and EOD digest start reflecting reality
// without each needing to learn about dm_outcome.
// ═══════════════════════════════════════════════════════════════

const FOLLOW_UP_AFTER_DAYS = 3;

const QUEUE_COLS =
  'id, business_name, city, country_code, niche, instagram_handle, instagram_url, ' +
  'phone, lead_score, lead_priority, outreach_status, outreach_channel, ' +
  'first_outreach_at, last_outreach_at, follow_up_count, outreach_dm_text, ' +
  'dm_review_due, dm_outcome, reachability_band, owner_name, relationship';

/** How an Instagram outcome maps onto the legacy response fields. */
function legacyFields(outcome: DmOutcome, now: string): Record<string, unknown> {
  const cfg = DM_OUTCOME_BY_ID[outcome];
  const positive = outcome === 'interested' || outcome === 'asked_for_info' || outcome === 'call_booked';
  const negative = outcome === 'not_interested' || outcome === 'opted_out' || outcome === 'has_agency';
  const replied = outcome !== 'no_reply';

  const out: Record<string, unknown> = {
    dm_outcome: outcome,
    dm_outcome_at: now,
    dm_reviewed_at: now,
    dm_review_due: null,
    updated_at: now,
  };

  if (replied) {
    out.responded_at = now;
    out.response_status = 'responded';
    out.response_sentiment = positive ? 'positive' : negative ? 'negative' : 'neutral';
    out.outreach_status = 'responded';
  } else {
    // No reply is not an ending — it schedules the next touch.
    out.next_follow_up_date = new Date(Date.now() + FOLLOW_UP_AFTER_DAYS * 86400_000)
      .toISOString().slice(0, 10);
  }

  if (outcome === 'call_booked') { out.outreach_status = 'booked'; out.booked_at = now; out.pipeline_stage = 'booked'; }
  if (outcome === 'not_interested') out.outreach_status = 'not_interested';
  if (outcome === 'opted_out') out.dm_opted_out = true;
  if (cfg?.suppresses && outcome !== 'call_booked') out.sequence_status = 'stopped';

  // Relationship corrections outlive this conversation.
  if (outcome === 'is_client')  { out.relationship = 'client';     out.relationship_source = 'manual'; out.relationship_set_at = now; }
  if (outcome === 'competitor') { out.relationship = 'competitor'; out.relationship_source = 'manual'; out.relationship_set_at = now; }

  return out;
}

export async function POST(request: NextRequest) {
  const auth = await authOr401();
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await request.json();

    switch (body.action) {
      // ─── The queue: messaged, never checked ───
      case 'get_queue': {
        const hours = Number(body.after_hours ?? 48);
        const cutoff = new Date(Date.now() - hours * 3600_000).toISOString();
        const limit = Math.min(Number(body.limit) || 100, 300);

        const { data, error } = await supabase
          .from('leads')
          .select(QUEUE_COLS)
          .is('dm_reviewed_at', null)
          .not('dm_review_due', 'is', null)
          .lte('dm_review_due', cutoff)
          // Oldest first — the 158 sitting over a month deserve clearing
          // before anything sent this week.
          .order('dm_review_due', { ascending: true })
          .limit(limit);
        if (error) throw new Error(error.message);

        const { count } = await supabase
          .from('leads').select('id', { count: 'exact', head: true })
          .is('dm_reviewed_at', null).lte('dm_review_due', cutoff);

        return NextResponse.json({ success: true, leads: data || [], total_due: count || 0 });
      }

      // ─── Record one outcome ───
      case 'mark': {
        const { lead_id, outcome, note } = body as { lead_id: string; outcome: DmOutcome; note?: string };
        if (!lead_id || !outcome) return NextResponse.json({ error: 'lead_id and outcome required' }, { status: 400 });
        if (!DM_OUTCOME_BY_ID[outcome]) return NextResponse.json({ error: `Unknown outcome: ${outcome}` }, { status: 400 });

        const now = new Date().toISOString();
        const patch = legacyFields(outcome, now);
        if (note) patch.dm_notes = note;

        const { error } = await supabase.from('leads').update(patch).eq('id', lead_id);
        if (error) throw new Error(error.message);

        await supabase.from('outreach_logs').insert({
          lead_id,
          channel: 'instagram',
          stage: 'review',
          outcome: `review:${outcome}`,
          sent_by: auth.email || null,
          notes: note || DM_OUTCOME_BY_ID[outcome].label,
        });

        return NextResponse.json({ success: true, outcome });
      }

      // ─── Clear a batch as "still nothing back" ───
      // The commonest case by far, and the one that must not take 300 taps.
      case 'bulk_no_reply': {
        const ids: string[] = Array.isArray(body.lead_ids) ? body.lead_ids : [];
        if (ids.length === 0) return NextResponse.json({ error: 'lead_ids required' }, { status: 400 });

        const now = new Date().toISOString();
        const patch = legacyFields('no_reply', now);
        for (let i = 0; i < ids.length; i += 200) {
          const { error } = await supabase.from('leads').update(patch).in('id', ids.slice(i, i + 200));
          if (error) throw new Error(error.message);
        }
        return NextResponse.json({ success: true, cleared: ids.length, follow_up_on: patch.next_follow_up_date });
      }

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'DM review failed';
    console.error('[dm-review]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
