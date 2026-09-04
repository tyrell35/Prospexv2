// ═══════════════════════════════════════════════════════════════
// REACHABILITY — is this lead worth a message today?
//
// Answers one question before a send is spent: is there a living
// business at the other end, on a channel we can actually reach?
//
// Deliberately conservative about the unknown. An unchecked lead
// scores as 'unknown', never as good — the previous behaviour
// (instagram_verified = "the URL parsed") is exactly the mistake
// that had us messaging accounts dormant since 2023.
// ═══════════════════════════════════════════════════════════════

export type ReachBand = 'strong' | 'ok' | 'stale' | 'dormant' | 'dead' | 'unknown';

export const REACH_CONFIG: Record<ReachBand, {
  label: string; emoji: string; short: string;
  textClass: string; bgClass: string; borderClass: string;
  /** Whether the DM queue may send to this band. */
  sendable: boolean;
  hint: string;
}> = {
  strong:  { label: 'Strong',   emoji: '🟢', short: 'strong',  textClass: 'text-prospex-green', bgClass: 'bg-prospex-green/10', borderClass: 'border-prospex-green/40', sendable: true,  hint: 'Active account, posting recently. Message these first.' },
  ok:      { label: 'OK',       emoji: '🟡', short: 'ok',      textClass: 'text-amber-300',     bgClass: 'bg-amber-500/10',     borderClass: 'border-amber-500/40',     sendable: true,  hint: 'Alive but quieter. Worth a message.' },
  stale:   { label: 'Stale',    emoji: '🟠', short: 'stale',   textClass: 'text-orange-300',    bgClass: 'bg-orange-500/10',    borderClass: 'border-orange-500/40',    sendable: true,  hint: 'Nothing posted in 3–12 months. Lower priority; try phone instead.' },
  dormant: { label: 'Dormant',  emoji: '🔴', short: 'dormant', textClass: 'text-prospex-red/80', bgClass: 'bg-prospex-red/10',  borderClass: 'border-prospex-red/30',   sendable: false, hint: 'No activity for over a year. A DM here burns a send and account warmth.' },
  dead:    { label: 'Dead',     emoji: '⛔', short: 'dead',    textClass: 'text-prospex-red',   bgClass: 'bg-prospex-red/15',   borderClass: 'border-prospex-red/40',   sendable: false, hint: 'Account gone or disabled. Nothing to message.' },
  unknown: { label: 'Unchecked', emoji: '❔', short: 'unknown', textClass: 'text-prospex-dim',  bgClass: 'bg-prospex-surface',  borderClass: 'border-prospex-border',   sendable: false, hint: 'Never vetted. Run a vetting pass before spending sends on these.' },
};

export const REACH_ORDER: ReachBand[] = ['strong', 'ok', 'stale', 'dormant', 'dead', 'unknown'];

export interface ReachInput {
  ig_exists?: boolean | null;
  ig_followers?: number | null;
  ig_posts?: number | null;
  ig_last_post_at?: string | null;
  ig_is_private?: boolean | null;
  ig_checked_at?: string | null;
  // Non-Instagram liveness — carries the 7,000+ leads with no IG at all.
  google_review_count?: number | null;
  google_rating?: number | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  /** hunt_enrichment.fetch_ok — false means the site did not load. */
  site_ok?: boolean | null;
}

export interface ReachResult {
  score: number;              // 0-100
  band: ReachBand;
  reasons: string[];          // shown on the card so the number is explainable
}

function monthsSince(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return (Date.now() - t) / (1000 * 60 * 60 * 24 * 30.44);
}

/**
 * Score a lead's reachability.
 *
 * Instagram recency dominates when we have it, because that is the
 * channel most sends go out on. Where there is no Instagram, Google
 * review volume and a working website stand in as proof the business
 * still trades — weaker evidence, so it caps lower.
 */
export function scoreReachability(lead: ReachInput): ReachResult {
  const reasons: string[] = [];

  // ── Hard stops ──────────────────────────────────────────────
  if (lead.ig_exists === false) {
    return { score: 0, band: 'dead', reasons: ['Instagram account not found'] };
  }

  const hasChannel = !!(lead.phone || lead.email || lead.website || lead.ig_exists);
  if (!hasChannel) {
    return { score: 0, band: 'dead', reasons: ['No phone, email, website or Instagram'] };
  }

  const checked = !!lead.ig_checked_at;
  const months = monthsSince(lead.ig_last_post_at);

  // ── Instagram-led scoring ───────────────────────────────────
  if (checked && lead.ig_exists) {
    let score = 30; // exists and was verified by a real lookup

    if (months === null) {
      reasons.push('No post date available');
      score += 5;
    } else if (months <= 1)  { score += 45; reasons.push('Posted within a month'); }
    else if (months <= 3)    { score += 35; reasons.push('Posted within 3 months'); }
    else if (months <= 6)    { score += 20; reasons.push('Last post 3–6 months ago'); }
    else if (months <= 12)   { score += 8;  reasons.push('Last post 6–12 months ago'); }
    else                     { score -= 10; reasons.push(`No post in ${Math.floor(months)} months`); }

    const f = lead.ig_followers ?? 0;
    if (f >= 5000)      { score += 15; reasons.push(`${f.toLocaleString()} followers`); }
    else if (f >= 1000) { score += 12; reasons.push(`${f.toLocaleString()} followers`); }
    else if (f >= 300)  { score += 8;  reasons.push(`${f.toLocaleString()} followers`); }
    else if (f > 0)     { score += 2;  reasons.push(`Only ${f} followers`); }

    if ((lead.ig_posts ?? 0) >= 50) { score += 5; reasons.push('Established feed'); }
    // A private account can still receive a DM, it just converts worse.
    if (lead.ig_is_private) { score -= 8; reasons.push('Private account'); }

    if ((lead.google_review_count ?? 0) >= 50) { score += 5; reasons.push('Well reviewed on Google'); }

    score = Math.max(0, Math.min(100, score));

    // Recency decides the band; the score only orders within it. A
    // 20k-follower account silent for two years is still not worth a DM.
    let band: ReachBand;
    if (months !== null && months > 12)      band = 'dormant';
    else if (months !== null && months > 3)  band = 'stale';
    else if (score >= 70)                    band = 'strong';
    else                                     band = 'ok';

    return { score, band, reasons };
  }

  // ── No Instagram check: fall back to trading signals ─────────
  // Caps at 'ok' — these prove the business exists, not that anyone is
  // reading an inbox.
  if (lead.site_ok === false) {
    return { score: 10, band: 'dormant', reasons: ['Website did not load'] };
  }

  let score = 0;
  const reviews = lead.google_review_count ?? 0;
  if (reviews >= 100)     { score += 35; reasons.push(`${reviews} Google reviews`); }
  else if (reviews >= 20) { score += 25; reasons.push(`${reviews} Google reviews`); }
  else if (reviews > 0)   { score += 10; reasons.push(`Only ${reviews} Google reviews`); }
  else                    { reasons.push('No Google reviews'); }

  if ((lead.google_rating ?? 0) >= 4.5) { score += 5; reasons.push('Highly rated'); }
  if (lead.website) { score += 10; reasons.push('Has a website'); }
  if (lead.phone)   { score += 10; reasons.push('Has a phone number'); }
  if (lead.email)   { score += 5;  reasons.push('Has an email'); }

  score = Math.min(60, score);
  reasons.push('Instagram not vetted');

  return {
    score,
    band: score >= 40 ? 'ok' : 'unknown',
    reasons,
  };
}

/** Should the DM queue be allowed to spend a send on this lead? */
export function isSendable(band: string | null | undefined): boolean {
  if (!band) return false;
  return REACH_CONFIG[band as ReachBand]?.sendable === true;
}
