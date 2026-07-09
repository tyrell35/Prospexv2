// ═══════════════════════════════════════════════════════
// IG DM warmup ladder
//
// Instagram cracks down on accounts that suddenly send 30+ cold DMs a day
// out of nowhere — it looks like spam automation and gets accounts
// action-blocked or restricted. To avoid that, new accounts follow a
// progressive ramp (below) before they hit "fully warm" volume.
//
// The user only ever picks the STAGE ('new' / 'warming' / 'warm' / 'paused')
// and hits "start warmup". This helper computes the effective daily target
// from stage + how many days have passed since warmup_started_at, so we
// don't need a cron to move accounts between stages every day.
// ═══════════════════════════════════════════════════════

export type WarmupStage = 'new' | 'warming' | 'warm' | 'paused';

export interface AccountForWarmup {
  warmup_stage: string | null;
  warmup_started_at: string | null;
  daily_target: number | null;
  daily_limit: number | null;
}

export interface WarmupState {
  stage: WarmupStage;
  effective_target: number;      // KPI for the day (how many we AIM to send)
  hard_limit: number;             // hard ceiling — send blocker
  days_in_warmup: number;
  next_step_target: number | null;   // what target becomes at next graduation
  next_step_at: string | null;       // ISO — when next_step_target kicks in
  fully_warm: boolean;               // reached the 30/day plateau
  procedure_step: string;            // human-readable description
}

// Progressive ramp — each row = (days_in_warmup ≥ from) → target
// This matches the "safe DM warmup" playbook the user described: don't blast
// 30 cold sends on day 1, work up to it over ~2 weeks.
const RAMP: Array<{ from_day: number; target: number; label: string }> = [
  { from_day: 0,  target: 5,  label: 'Days 0-2 · 5 DMs/day + engage 10 posts + 1 story' },
  { from_day: 3,  target: 10, label: 'Days 3-6 · 10 DMs/day + engage 10 posts + 1 story' },
  { from_day: 7,  target: 20, label: 'Days 7-13 · 20 DMs/day + engage 15 posts + 1 story' },
  { from_day: 14, target: 30, label: 'Day 14+ · fully warm — up to 30 DMs/day' },
];

export function computeWarmupState(a: AccountForWarmup): WarmupState {
  const stage = (a.warmup_stage || 'warm') as WarmupStage;
  const desiredTarget = a.daily_target ?? 30;
  const hardLimit = a.daily_limit ?? 30;

  if (stage === 'paused') {
    return {
      stage, effective_target: 0, hard_limit: hardLimit, days_in_warmup: 0,
      next_step_target: null, next_step_at: null, fully_warm: false,
      procedure_step: 'Paused — no sends allowed until resumed',
    };
  }

  if (stage === 'new') {
    return {
      stage, effective_target: 0, hard_limit: hardLimit, days_in_warmup: 0,
      next_step_target: RAMP[0].target, next_step_at: null, fully_warm: false,
      procedure_step: 'Not started yet — click "Start warmup" to begin the 14-day ramp',
    };
  }

  if (stage === 'warm') {
    const target = Math.min(desiredTarget, hardLimit);
    return {
      stage, effective_target: target, hard_limit: hardLimit, days_in_warmup: 0,
      next_step_target: null, next_step_at: null, fully_warm: true,
      procedure_step: `Fully warm · target ${target}/day (hard cap ${hardLimit})`,
    };
  }

  // stage === 'warming' → derive target from days since warmup_started_at
  const started = a.warmup_started_at ? new Date(a.warmup_started_at).getTime() : Date.now();
  const days = Math.max(0, Math.floor((Date.now() - started) / 86_400_000));

  // Find current rung (last row where from_day <= days) and the next rung
  let current = RAMP[0];
  let next: typeof RAMP[number] | null = RAMP[1] ?? null;
  for (let i = 0; i < RAMP.length; i++) {
    if (RAMP[i].from_day <= days) {
      current = RAMP[i];
      next = RAMP[i + 1] ?? null;
    }
  }
  const target = Math.min(current.target, hardLimit);
  const nextAt = next ? new Date(started + next.from_day * 86_400_000).toISOString() : null;

  // After 14 days the account is effectively 'warm' but we don't auto-flip
  // the stage in the DB (that would need a cron) — we just report fully_warm
  // = true and let the user hit "Graduate to warm" to make it official.
  const fullyWarm = days >= 14;

  return {
    stage,
    effective_target: target,
    hard_limit: hardLimit,
    days_in_warmup: days,
    next_step_target: next ? Math.min(next.target, hardLimit) : null,
    next_step_at: nextAt,
    fully_warm: fullyWarm,
    procedure_step: fullyWarm
      ? '14 days complete — graduate to "warm" to lift the ramp'
      : current.label,
  };
}

// Convenience: is this account allowed to send another DM right now?
export function canSendMore(
  a: AccountForWarmup & { daily_sent_today: number | null }
): { allowed: boolean; reason: string; state: WarmupState; used: number } {
  const state = computeWarmupState(a);
  const used = a.daily_sent_today ?? 0;
  if (state.stage === 'paused') return { allowed: false, reason: 'Account is paused', state, used };
  if (state.stage === 'new')    return { allowed: false, reason: 'Warmup not started', state, used };
  if (used >= state.hard_limit) return { allowed: false, reason: `Hard limit of ${state.hard_limit} hit for the day`, state, used };
  if (used >= state.effective_target) return { allowed: true, reason: `⚠ Over KPI target of ${state.effective_target}`, state, used };
  return { allowed: true, reason: `${used}/${state.effective_target}`, state, used };
}

// Static procedure doc — one place, referenced in UI + Slack help
export const WARMUP_PROCEDURE = {
  title: 'Safe IG DM warmup — 14-day ramp',
  bullets: [
    'Days 0-2  →  5  DMs/day  · engage 10 posts (like/comment) · post 1 story',
    'Days 3-6  →  10 DMs/day  · engage 10 posts · post 1 story',
    'Days 7-13 →  20 DMs/day  · engage 15 posts · post 1 story',
    'Day 14+   →  Fully warm — up to 30 DMs/day',
  ],
  dos: [
    'Space sends across the day — don\'t send all 30 in one 15-minute burst',
    'Reply to any incoming DM within 15 min during warmup (proves you\'re a human)',
    'Follow 3-5 real accounts per day + engage authentically',
    'Use a mix of templates + personalised openers — never copy-paste identical',
    'Keep username + bio + profile pic looking like a real person for 48h before first send',
  ],
  donts: [
    'Don\'t exceed the daily target during warmup — Instagram\'s spam classifier reads velocity spikes',
    'Don\'t send 3 identical messages in a row',
    'Don\'t message someone who follows 0 people (bot accounts trigger flags)',
    'Don\'t use link shorteners (bit.ly etc) — they\'re a heuristic Instagram treats as spam',
    'Don\'t send the same message to accounts inside the same city cluster in the same hour',
  ],
  action_block_signs: [
    '"Try again later" popup when opening DMs',
    'DMs sent but recipient never receives (shadow-block)',
    'Sudden drop in reply rate to <5% (usually shadow-limited before hard block)',
    'Recent Followers list stops updating',
  ],
};
