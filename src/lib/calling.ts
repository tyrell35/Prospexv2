// ═══════════════════════════════════════════════════════════════
// COLD CALLING — shared taxonomy, timezone maths, callability
//
// Dialling itself happens in GoHighLevel. Everything here exists to
// answer the two questions a caller has all day:
//   "who should I ring right now?"  and  "where did we leave it?"
//
// Call state lives in its own columns (call_stage / call_outcome /
// call_attempts) and never touches outreach_status or pipeline_stage,
// which belong to the Instagram DM channel. A lead can legitimately
// be 'follow_up_2' on IG and 'callback' on the phone at once.
// ═══════════════════════════════════════════════════════════════

// ─── Pipeline stages (the board columns) ─────────────────────
export type CallStage =
  | 'not_called'      // never dialled
  | 'attempting'      // dialled, no human contact yet
  | 'gatekeeper'      // reached the clinic, blocked from the owner
  | 'spoke_owner'     // actually got the decision-maker on the phone
  | 'callback'        // they asked us to ring back at a set time
  | 'interested'      // warm — pitch landed, working towards a booking
  | 'booked'          // appointment on the calendar
  | 'closed'          // closed won
  | 'not_interested'  // hard no / hung up
  | 'dnc';            // do not call — wrong number, requested removal

export interface StageConfig {
  id: CallStage;
  label: string;
  short: string;
  emoji: string;
  /** Board column classes — header tint */
  color: string;
  textClass: string;
  /** Lanes past this point are wins; used for conversion maths */
  isWin?: boolean;
  /** Parked lanes render collapsed on the board by default */
  isParked?: boolean;
  hint: string;
}

export const CALL_STAGES: StageConfig[] = [
  { id: 'not_called',     label: 'Call Queue',     short: 'Queue',      emoji: '📋', color: 'bg-prospex-surface text-prospex-muted border-prospex-border',        textClass: 'text-prospex-muted',  hint: 'Never dialled. Work top-down by score.' },
  { id: 'attempting',     label: 'Attempting',     short: 'Attempting', emoji: '📵', color: 'bg-slate-500/15 text-slate-300 border-slate-500/40',                 textClass: 'text-slate-300',      hint: 'Rang, no human yet — no answer, voicemail or busy.' },
  { id: 'gatekeeper',     label: 'Gatekeeper',     short: 'Gatekeep',   emoji: '🚪', color: 'bg-purple-500/15 text-purple-300 border-purple-500/40',              textClass: 'text-purple-300',     hint: 'Reception answered but blocked the owner. Get a name and a best time.' },
  { id: 'spoke_owner',    label: 'Spoke to Owner', short: 'Spoke',      emoji: '🗣️', color: 'bg-prospex-cyan/15 text-prospex-cyan border-prospex-cyan/40',        textClass: 'text-prospex-cyan',   hint: 'Decision-maker reached. Outcome still open.' },
  { id: 'callback',       label: 'Callback Due',   short: 'Callback',   emoji: '📅', color: 'bg-amber-500/15 text-amber-300 border-amber-500/40',                 textClass: 'text-amber-300',      hint: 'They named a time. Ring exactly then.' },
  { id: 'interested',     label: 'Interested',     short: 'Warm',       emoji: '🔥', color: 'bg-orange-500/15 text-orange-300 border-orange-500/40',              textClass: 'text-orange-300',     hint: 'Pitch landed. Push for the calendar.' },
  { id: 'booked',         label: 'Booked',         short: 'Booked',     emoji: '✅', color: 'bg-prospex-green/15 text-prospex-green border-prospex-green/40',     textClass: 'text-prospex-green', isWin: true, hint: 'Appointment set.' },
  { id: 'closed',         label: 'Closed Won',     short: 'Won',        emoji: '🏆', color: 'bg-prospex-green/25 text-prospex-green border-prospex-green/60',     textClass: 'text-prospex-green', isWin: true, hint: 'Signed.' },
  { id: 'not_interested', label: 'Not Interested', short: 'No',         emoji: '❌', color: 'bg-prospex-red/10 text-prospex-red/80 border-prospex-red/30',        textClass: 'text-prospex-red/80', isParked: true, hint: 'Hard no or hung up.' },
  { id: 'dnc',            label: 'Do Not Call',    short: 'DNC',        emoji: '🚷', color: 'bg-prospex-red/15 text-prospex-red border-prospex-red/40',           textClass: 'text-prospex-red',    isParked: true, hint: 'Wrong number or removal requested. Suppressed from every queue.' },
];

export const STAGE_BY_ID: Record<CallStage, StageConfig> =
  Object.fromEntries(CALL_STAGES.map(s => [s.id, s])) as Record<CallStage, StageConfig>;

/** Active board lanes — parked lanes are shown separately/collapsed. */
export const ACTIVE_STAGES = CALL_STAGES.filter(s => !s.isParked);
export const PARKED_STAGES = CALL_STAGES.filter(s => s.isParked);

// ─── Call outcomes (what you tap after a dial) ───────────────
export type CallOutcome =
  | 'no_answer' | 'voicemail' | 'busy' | 'bad_line'
  | 'gatekeeper' | 'spoke_owner'
  | 'callback' | 'interested' | 'booked' | 'closed_won'
  | 'not_interested' | 'hung_up'
  | 'wrong_number' | 'dnc_request';

export interface OutcomeConfig {
  id: CallOutcome;
  label: string;
  emoji: string;
  /** Stage the lead lands in after this outcome */
  stage: CallStage;
  color: string;
  /** Hours to wait before this lead is due again. null = no auto follow-up. */
  retryHours: number | null;
  /** Prompt the console for a specific time (callback) */
  needsTime?: boolean;
  /** Did a human pick up at all? Drives contact-rate stats. */
  isContact?: boolean;
  /** Did we get the decision-maker? Drives DM-reach-rate stats. */
  reachedOwner?: boolean;
  /** Flip leads.do_not_call */
  setsDnc?: boolean;
  group: 'no_contact' | 'contact' | 'progress' | 'dead';
}

export const CALL_OUTCOMES: OutcomeConfig[] = [
  // ── No human reached ───────────────────────────────────────
  { id: 'no_answer',      label: 'No answer',     emoji: '📵', stage: 'attempting',     color: 'bg-slate-500/15 text-slate-300 border-slate-500/40 hover:bg-slate-500/25',                          retryHours: 20,       group: 'no_contact' },
  { id: 'voicemail',      label: 'Voicemail',     emoji: '📼', stage: 'attempting',     color: 'bg-slate-500/15 text-slate-300 border-slate-500/40 hover:bg-slate-500/25',                          retryHours: 48,       group: 'no_contact' },
  { id: 'busy',           label: 'Busy',          emoji: '⏳', stage: 'attempting',     color: 'bg-slate-500/15 text-slate-300 border-slate-500/40 hover:bg-slate-500/25',                          retryHours: 3,        group: 'no_contact' },
  { id: 'bad_line',       label: 'Bad line',      emoji: '📞', stage: 'attempting',     color: 'bg-slate-500/15 text-slate-300 border-slate-500/40 hover:bg-slate-500/25',                          retryHours: 4,        group: 'no_contact' },

  // ── Human reached ──────────────────────────────────────────
  { id: 'gatekeeper',     label: 'Gatekeeper',    emoji: '🚪', stage: 'gatekeeper',     color: 'bg-purple-500/15 text-purple-300 border-purple-500/40 hover:bg-purple-500/25',                      retryHours: 24,       isContact: true, group: 'contact' },
  { id: 'spoke_owner',    label: 'Spoke to owner',emoji: '🗣️', stage: 'spoke_owner',    color: 'bg-prospex-cyan/15 text-prospex-cyan border-prospex-cyan/40 hover:bg-prospex-cyan/25',              retryHours: 72,       isContact: true, reachedOwner: true, group: 'contact' },
  { id: 'hung_up',        label: 'Hung up',       emoji: '☎️', stage: 'not_interested', color: 'bg-prospex-red/10 text-prospex-red/80 border-prospex-red/30 hover:bg-prospex-red/20',               retryHours: null,     isContact: true, group: 'contact' },

  // ── Forward progress ───────────────────────────────────────
  { id: 'callback',       label: 'Callback',      emoji: '📅', stage: 'callback',       color: 'bg-amber-500/15 text-amber-300 border-amber-500/40 hover:bg-amber-500/25',                          retryHours: null, needsTime: true, isContact: true, group: 'progress' },
  { id: 'interested',     label: 'Interested',    emoji: '🔥', stage: 'interested',     color: 'bg-orange-500/15 text-orange-300 border-orange-500/40 hover:bg-orange-500/25',                      retryHours: 48,       isContact: true, reachedOwner: true, group: 'progress' },
  { id: 'booked',         label: 'Booked',        emoji: '✅', stage: 'booked',         color: 'bg-prospex-green/15 text-prospex-green border-prospex-green/40 hover:bg-prospex-green/25',          retryHours: null,     isContact: true, reachedOwner: true, group: 'progress' },
  { id: 'closed_won',     label: 'Closed won',    emoji: '🏆', stage: 'closed',         color: 'bg-prospex-green/25 text-prospex-green border-prospex-green/60 hover:bg-prospex-green/35',          retryHours: null,     isContact: true, reachedOwner: true, group: 'progress' },

  // ── Dead ───────────────────────────────────────────────────
  { id: 'not_interested', label: 'Not interested',emoji: '❌', stage: 'not_interested', color: 'bg-prospex-red/10 text-prospex-red/80 border-prospex-red/30 hover:bg-prospex-red/20',               retryHours: null,     isContact: true, group: 'dead' },
  { id: 'wrong_number',   label: 'Wrong number',  emoji: '🔌', stage: 'dnc',            color: 'bg-prospex-red/15 text-prospex-red border-prospex-red/40 hover:bg-prospex-red/25',                  retryHours: null,     setsDnc: true, group: 'dead' },
  { id: 'dnc_request',    label: 'Do not call',   emoji: '🚷', stage: 'dnc',            color: 'bg-prospex-red/15 text-prospex-red border-prospex-red/40 hover:bg-prospex-red/25',                  retryHours: null,     isContact: true, setsDnc: true, group: 'dead' },
];

export const OUTCOME_BY_ID: Record<CallOutcome, OutcomeConfig> =
  Object.fromEntries(CALL_OUTCOMES.map(o => [o.id, o])) as Record<CallOutcome, OutcomeConfig>;

/** Console button order — grouped so the common taps sit together. */
export const OUTCOME_GROUPS: { label: string; outcomes: CallOutcome[] }[] = [
  { label: 'Nobody picked up', outcomes: ['no_answer', 'voicemail', 'busy', 'bad_line'] },
  { label: 'Someone answered', outcomes: ['gatekeeper', 'spoke_owner', 'hung_up'] },
  { label: 'Moving forward',   outcomes: ['callback', 'interested', 'booked', 'closed_won'] },
  { label: 'Dead',             outcomes: ['not_interested', 'wrong_number', 'dnc_request'] },
];

// ═══════════════════════════════════════════════════════════════
// TIMEZONE + CALLABILITY
// Every lead carries an IANA timezone derived from its address, so
// "is it a sane hour to ring this clinic" is answerable client-side
// with no extra round-trip.
// ═══════════════════════════════════════════════════════════════

/** Prospect's local wall-clock parts, in their own timezone. */
export function localParts(timezone: string | null, at: Date = new Date()):
  { hour: number; minute: number; weekday: number; label: string } | null {
  if (!timezone) return null;
  try {
    const fmt = new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone, hour: '2-digit', minute: '2-digit',
      weekday: 'short', hour12: false,
    });
    const parts = fmt.formatToParts(at);
    const get = (t: string) => parts.find(p => p.type === t)?.value ?? '';
    const hour = parseInt(get('hour'), 10);
    const minute = parseInt(get('minute'), 10);
    const wdName = get('weekday');
    const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(wdName);
    return { hour, minute, weekday, label: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}` };
  } catch {
    return null;
  }
}

/** Short local-time string for a lead card, e.g. "14:35". */
export function localTimeLabel(timezone: string | null, at: Date = new Date()): string | null {
  return localParts(timezone, at)?.label ?? null;
}

export type CallWindow = 'prime' | 'open' | 'early' | 'late' | 'closed' | 'weekend' | 'unknown';

export const WINDOW_CONFIG: Record<CallWindow, { label: string; emoji: string; textClass: string; callable: boolean }> = {
  prime:   { label: 'Prime window', emoji: '🟢', textClass: 'text-prospex-green', callable: true },
  open:    { label: 'Open',         emoji: '🟡', textClass: 'text-amber-300',     callable: true },
  early:   { label: 'Too early',    emoji: '🌅', textClass: 'text-prospex-dim',   callable: false },
  late:    { label: 'Too late',     emoji: '🌙', textClass: 'text-prospex-dim',   callable: false },
  closed:  { label: 'Closed',       emoji: '🌙', textClass: 'text-prospex-dim',   callable: false },
  weekend: { label: 'Weekend',      emoji: '🛌', textClass: 'text-prospex-dim',   callable: false },
  unknown: { label: 'Unknown TZ',   emoji: '❔', textClass: 'text-prospex-dim',   callable: false },
};

/**
 * Classify a prospect's current local time into a calling window.
 *
 * Windows are a scheduling convenience, not a compliance control —
 * they encode ordinary clinic opening hours, not any jurisdiction's
 * telemarketing rules. Verify local calling-hour law and any
 * do-not-call registry yourself before dialling a new market.
 *
 *   prime  10:00–11:30 and 14:00–16:00 — reception is quietest
 *   open   09:00–17:30 otherwise
 *   early  before 09:00
 *   late   after 17:30
 */
export function callWindow(timezone: string | null, at: Date = new Date()): CallWindow {
  const p = localParts(timezone, at);
  if (!p) return 'unknown';
  if (p.weekday === 0 || p.weekday === 6) return 'weekend';
  const mins = p.hour * 60 + p.minute;
  if (mins < 9 * 60) return 'early';
  if (mins > 17 * 60 + 30) return 'late';
  if ((mins >= 10 * 60 && mins <= 11 * 60 + 30) || (mins >= 14 * 60 && mins <= 16 * 60)) return 'prime';
  return 'open';
}

export function isCallableNow(timezone: string | null, at: Date = new Date()): boolean {
  return WINDOW_CONFIG[callWindow(timezone, at)].callable;
}

/** Human label for a timezone, e.g. "America/Los_Angeles" → "Los Angeles". */
export function tzShort(timezone: string | null): string {
  if (!timezone) return '—';
  return timezone.split('/').pop()?.replace(/_/g, ' ') ?? timezone;
}

// ═══════════════════════════════════════════════════════════════
// OWNER NAME CONFIDENCE
// Sources are ranked. Only a 'high' confidence name should ever be
// spoken aloud on a call — using a wrong first name is worse than
// using none, so the UI marks anything below that as unverified.
// ═══════════════════════════════════════════════════════════════

export type OwnerSource =
  | 'companies_house' | 'website' | 'google_reviews'
  | 'instagram' | 'ai_inference' | 'manual';

export const OWNER_SOURCE_CONFIG: Record<OwnerSource, {
  label: string; short: string; emoji: string; textClass: string; trust: string;
}> = {
  manual:          { label: 'Entered by you',      short: 'manual',   emoji: '✍️', textClass: 'text-prospex-green', trust: 'You confirmed this name.' },
  companies_house: { label: 'Companies House',     short: 'reg',      emoji: '🏛️', textClass: 'text-prospex-green', trust: 'Registered officer on the UK company record.' },
  website:         { label: 'Their website',       short: 'site',     emoji: '🌐', textClass: 'text-prospex-cyan',  trust: 'Named on their own about/team page.' },
  google_reviews:  { label: 'Review replies',      short: 'reviews',  emoji: '⭐', textClass: 'text-prospex-cyan',  trust: 'Signs off review replies as the owner.' },
  instagram:       { label: 'Instagram bio',       short: 'ig',       emoji: '📸', textClass: 'text-amber-300',     trust: 'Named in the profile bio.' },
  ai_inference:    { label: 'AI inference',        short: 'ai',       emoji: '🤖', textClass: 'text-amber-300',     trust: 'Inferred from page text — unverified, confirm on the call.' },
};

export const OWNER_CONFIDENCE_CONFIG: Record<string, { label: string; emoji: string; textClass: string; speakable: boolean }> = {
  high:   { label: 'Verified',   emoji: '🟢', textClass: 'text-prospex-green', speakable: true },
  medium: { label: 'Likely',     emoji: '🟡', textClass: 'text-amber-300',     speakable: false },
  low:    { label: 'Unverified', emoji: '🔴', textClass: 'text-prospex-red/80', speakable: false },
};

/** Only greet by name when the source is solid. */
export function isSpeakableName(confidence: string | null | undefined): boolean {
  return !!confidence && OWNER_CONFIDENCE_CONFIG[confidence]?.speakable === true;
}

/** First name for an opener — "Sarah Whitfield" → "Sarah". */
export function firstNameOf(fullName: string | null | undefined): string | null {
  if (!fullName) return null;
  const cleaned = fullName.trim().replace(/^(dr|mr|mrs|ms|miss|prof)\.?\s+/i, '');
  const first = cleaned.split(/\s+/)[0];
  return first && first.length > 1 ? first : null;
}

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

/** When should this lead surface again after `outcome`? */
export function nextCallAfter(outcome: CallOutcome, from: Date = new Date()): string | null {
  const cfg = OUTCOME_BY_ID[outcome];
  if (!cfg || cfg.retryHours === null) return null;
  return new Date(from.getTime() + cfg.retryHours * 3600_000).toISOString();
}

/** Compact "3d ago" style age used across call cards. */
export function callAge(dateStr: string | null): string {
  if (!dateStr) return 'never';
  const s = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (s < 60) return 'now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 2592000) return `${Math.floor(s / 86400)}d`;
  return `${Math.floor(s / 2592000)}mo`;
}

/** Dial link — tel: works on desktop softphones and mobile alike. */
export function telHref(phone: string | null): string | null {
  if (!phone) return null;
  const cleaned = phone.replace(/[^0-9+]/g, '');
  return cleaned ? `tel:${cleaned}` : null;
}
