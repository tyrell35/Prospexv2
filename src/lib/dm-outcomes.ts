// ═══════════════════════════════════════════════════════════════
// INSTAGRAM DM DISPOSITIONS
//
// outreach_status only ever recorded how far down the sequence a
// lead had got (dm_sent, follow_up_1, follow_up_2...). It could not
// say WHY a conversation ended — wrong person, already has an
// agency, asked us to stop — so those leads kept re-entering the
// queue and getting messaged again.
//
// This is the DM channel's equivalent of the call dispositions in
// lib/calling.ts, and is deliberately independent of them: a lead
// can be 'not_interested' on Instagram and still be worth a call.
// ═══════════════════════════════════════════════════════════════

export type DmOutcome =
  | 'no_reply' | 'replied' | 'interested' | 'asked_for_info'
  | 'call_booked' | 'not_interested' | 'has_agency' | 'wrong_person'
  | 'opted_out' | 'is_client' | 'competitor';

export interface DmOutcomeConfig {
  id: DmOutcome;
  label: string;
  emoji: string;
  color: string;
  /** Take them out of the DM queue for good. */
  suppresses: boolean;
  /** Still worth ringing even though the DM went nowhere. */
  callable: boolean;
  hint: string;
  group: 'open' | 'positive' | 'closed';
}

export const DM_OUTCOMES: DmOutcomeConfig[] = [
  { id: 'no_reply',       label: 'No reply',        emoji: '🔇', color: 'bg-slate-500/15 text-slate-300 border-slate-500/40',                     suppresses: false, callable: true,  group: 'open',     hint: 'Sent, nothing back yet. Stays in the follow-up sequence.' },
  { id: 'replied',        label: 'Replied',         emoji: '💬', color: 'bg-prospex-cyan/15 text-prospex-cyan border-prospex-cyan/40',            suppresses: false, callable: true,  group: 'open',     hint: 'They answered but the outcome is still open.' },

  { id: 'interested',     label: 'Interested',      emoji: '🔥', color: 'bg-orange-500/15 text-orange-300 border-orange-500/40',                  suppresses: false, callable: true,  group: 'positive', hint: 'Warm. Move to asking permission to send the breakdown.' },
  { id: 'asked_for_info', label: 'Asked for info',  emoji: '📄', color: 'bg-amber-500/15 text-amber-300 border-amber-500/40',                     suppresses: false, callable: true,  group: 'positive', hint: 'They invited a link — send it.' },
  { id: 'call_booked',    label: 'Call booked',     emoji: '📅', color: 'bg-prospex-green/15 text-prospex-green border-prospex-green/40',         suppresses: true,  callable: true,  group: 'positive', hint: 'On the calendar. Out of the cold queue.' },

  { id: 'not_interested', label: 'Not interested',  emoji: '❌', color: 'bg-prospex-red/10 text-prospex-red/80 border-prospex-red/30',            suppresses: true,  callable: false, group: 'closed',   hint: 'A clear no on Instagram.' },
  { id: 'has_agency',     label: 'Has an agency',   emoji: '🤝', color: 'bg-purple-500/15 text-purple-300 border-purple-500/40',                  suppresses: true,  callable: true,  group: 'closed',   hint: 'Already working with someone. Worth a call later, not another DM.' },
  { id: 'wrong_person',   label: 'Wrong person',    emoji: '🙅', color: 'bg-slate-500/15 text-slate-300 border-slate-500/40',                     suppresses: true,  callable: true,  group: 'closed',   hint: 'Account is not run by a decision-maker. Find the owner and ring instead.' },
  { id: 'opted_out',      label: 'Asked to stop',   emoji: '🚷', color: 'bg-prospex-red/15 text-prospex-red border-prospex-red/40',               suppresses: true,  callable: false, group: 'closed',   hint: 'Explicitly asked not to be contacted. Never message again.' },

  { id: 'is_client',      label: 'Already a client', emoji: '⭐', color: 'bg-prospex-green/20 text-prospex-green border-prospex-green/50',        suppresses: true,  callable: false, group: 'closed',   hint: 'One of ours. Should never have been in the cold queue.' },
  { id: 'competitor',     label: 'Competitor',       emoji: '⚔️', color: 'bg-prospex-red/10 text-prospex-red/70 border-prospex-red/30',           suppresses: true,  callable: false, group: 'closed',   hint: 'Another agency, not a prospect.' },
];

export const DM_OUTCOME_BY_ID: Record<DmOutcome, DmOutcomeConfig> =
  Object.fromEntries(DM_OUTCOMES.map(o => [o.id, o])) as Record<DmOutcome, DmOutcomeConfig>;

export const DM_OUTCOME_GROUPS: { label: string; outcomes: DmOutcome[] }[] = [
  { label: 'Still open',   outcomes: ['no_reply', 'replied'] },
  { label: 'Going well',   outcomes: ['interested', 'asked_for_info', 'call_booked'] },
  { label: 'Closed off',   outcomes: ['not_interested', 'has_agency', 'wrong_person', 'opted_out', 'is_client', 'competitor'] },
];

/** Should the DM queue skip this lead entirely? */
export function dmSuppressed(outcome: string | null | undefined, optedOut?: boolean | null): boolean {
  if (optedOut) return true;
  if (!outcome) return false;
  return DM_OUTCOME_BY_ID[outcome as DmOutcome]?.suppresses === true;
}

// ═══════════════════════════════════════════════════════════════
// RELATIONSHIP — who this business is to us
// Anything other than 'prospect' is off-limits for cold outreach on
// every channel.
// ═══════════════════════════════════════════════════════════════

export type Relationship =
  | 'prospect' | 'client' | 'past_client' | 'partner'
  | 'competitor' | 'supplier' | 'do_not_contact';

export const RELATIONSHIP_CONFIG: Record<Relationship, {
  label: string; emoji: string; textClass: string; coldOk: boolean; hint: string;
}> = {
  prospect:       { label: 'Prospect',     emoji: '🎯', textClass: 'text-prospex-muted',  coldOk: true,  hint: 'Fair game for cold outreach.' },
  client:         { label: 'Client',       emoji: '⭐', textClass: 'text-prospex-green',  coldOk: false, hint: 'We already work with them. Cold-messaging a client is the worst outcome here.' },
  past_client:    { label: 'Past client',  emoji: '🕊️', textClass: 'text-amber-300',      coldOk: false, hint: 'Worked with us before. Reactivation, never a cold open.' },
  partner:        { label: 'Partner',      emoji: '🤝', textClass: 'text-prospex-cyan',   coldOk: false, hint: 'Referral or delivery partner.' },
  competitor:     { label: 'Competitor',   emoji: '⚔️', textClass: 'text-prospex-red/80', coldOk: false, hint: 'Another agency.' },
  supplier:       { label: 'Supplier',     emoji: '📦', textClass: 'text-prospex-dim',    coldOk: false, hint: 'We buy from them.' },
  do_not_contact: { label: 'Do not contact', emoji: '🚫', textClass: 'text-prospex-red',  coldOk: false, hint: 'Suppressed on every channel.' },
};

export function coldOutreachAllowed(relationship: string | null | undefined): boolean {
  if (!relationship) return true; // NULL predates this column and means prospect
  return RELATIONSHIP_CONFIG[relationship as Relationship]?.coldOk !== false;
}
