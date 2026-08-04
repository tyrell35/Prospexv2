// ═══════════════════════════════════════════════════════
// Lead health — derived per-lead status that answers "is this lead
// worth working, or is it dead / done / already handled?"
//
// Priority order matters — the first bucket a lead matches wins.
// So a lead that's been Booked stays 'booked' even if its website
// went dead later; a lead that Replied stays 'replied' even if it
// technically has an outreach_status='contacted' set.
//
// This runs client-side over rows already fetched from the leads
// table + a pre-joined map of hunt_enrichment fetch_ok flags.
// ═══════════════════════════════════════════════════════

export type LeadHealth =
  | 'booked'          // won — got them on the calendar
  | 'not_interested'  // hard no
  | 'replied'         // responded, any sentiment (needs nurture)
  | 'contacted'       // messaged, waiting
  | 'dead'            // website unreachable, hard to work
  | 'no_channels'     // no IG, no phone, no email — can't reach
  | 'ready';          // fresh, has channel, ready to work

export const HEALTH_CONFIG: Record<LeadHealth, {
  label: string;
  emoji: string;
  short: string; // shorthand for tight spaces
  bgClass: string;
  textClass: string;
  borderClass: string;
  order: number;
}> = {
  ready:          { label: 'Ready',          emoji: '🟢', short: 'ready',    bgClass: 'bg-prospex-green/10', textClass: 'text-prospex-green', borderClass: 'border-prospex-green/40', order: 1 },
  contacted:      { label: 'Contacted',      emoji: '📬', short: 'awaiting', bgClass: 'bg-prospex-cyan/10',  textClass: 'text-prospex-cyan',  borderClass: 'border-prospex-cyan/40',  order: 2 },
  replied:        { label: 'Replied',        emoji: '💬', short: 'replied',  bgClass: 'bg-amber-500/10',     textClass: 'text-amber-400',     borderClass: 'border-amber-500/40',     order: 3 },
  booked:         { label: 'Booked',         emoji: '📅', short: 'booked',   bgClass: 'bg-prospex-green/15', textClass: 'text-prospex-green', borderClass: 'border-prospex-green/50', order: 4 },
  not_interested: { label: 'Not interested', emoji: '🚫', short: 'no',       bgClass: 'bg-prospex-red/10',   textClass: 'text-prospex-red/80', borderClass: 'border-prospex-red/30',  order: 5 },
  dead:           { label: 'Dead site',      emoji: '❌', short: 'dead',     bgClass: 'bg-prospex-red/10',   textClass: 'text-prospex-red/70', borderClass: 'border-prospex-red/30',  order: 6 },
  no_channels:    { label: 'No channels',    emoji: '⚠️', short: 'no ch',    bgClass: 'bg-prospex-red/5',    textClass: 'text-prospex-dim',    borderClass: 'border-prospex-red/20',  order: 7 },
};

// Minimum fields the classifier needs — a subset of the full Lead type
// so callers don't have to import the whole Lead interface just to compute
// health from an aggregated payload.
export interface LeadHealthInput {
  instagram_handle?: string | null;
  instagram_url?: string | null;
  phone?: string | null;
  email?: string | null;
  outreach_status?: string | null;
  responded_at?: string | null;
  response_sentiment?: string | null;
  pipeline_stage?: string | null;
}

/**
 * Classify a lead into one of the LeadHealth buckets.
 *
 * @param lead        Subset of lead fields — see LeadHealthInput
 * @param fetchFailed True if hunt_enrichment.fetch_ok is false for this
 *                    lead (i.e. we tried to scrape the site and it 404'd).
 *                    Optional; pass false or omit if you haven't loaded
 *                    enrichment for this row yet.
 */
export function getLeadHealth(lead: LeadHealthInput, fetchFailed = false): LeadHealth {
  // Won/lost outcomes first — they win over anything else
  if (lead.outreach_status === 'booked' || lead.pipeline_stage === 'booked') return 'booked';
  if (lead.outreach_status === 'not_interested' || lead.response_sentiment === 'negative') return 'not_interested';

  // Reply state — reached them and got a response
  if (lead.responded_at) return 'replied';

  // Sent but no reply yet
  if (lead.outreach_status === 'contacted') return 'contacted';

  // Dead site — website failed to fetch, so we can't verify anything about them
  if (fetchFailed) return 'dead';

  // No way to actually reach them
  const hasChannel = !!(lead.instagram_handle || lead.instagram_url || lead.phone || lead.email);
  if (!hasChannel) return 'no_channels';

  // Fresh + reachable
  return 'ready';
}

// Display order for filter chips + summary — matches the human triage
// flow (Ready first, then in-flight, then done/dead at the end).
export const HEALTH_ORDER: LeadHealth[] = [
  'ready', 'contacted', 'replied', 'booked', 'not_interested', 'dead', 'no_channels',
];
