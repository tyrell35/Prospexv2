import { NextRequest, NextResponse } from 'next/server';

import { supabaseAdmin as supabase } from '@/lib/supabase-admin';
import { authOr401 } from '@/lib/api-auth';

export const maxDuration = 120;

// ═══════════════════════════════════════════════════════════════
// DAILY NUDGE — the accountability loop
//
// Four questions, every morning:
//   1. Did we hit the send target yesterday?
//   2. Who did we message that we never checked back on?
//   3. Who replied and is still sitting there?
//   4. Who needs a follow-up today?
//
// Question 2 is the one that was impossible before: across 4.5
// months and 358 sends, not one reply was ever recorded, so 359
// leads sat in 'dm_sent' indefinitely. The review queue makes that
// state visible and clearable.
//
// GET  ?cron=post  — cron path, posts to Slack and snapshots the day
// POST { action }  — 'get' for the in-app banner, 'post_slack' manual
// ═══════════════════════════════════════════════════════════════

const REVIEW_AFTER_HOURS = 48;   // how long to wait before asking "did they reply"
const FOLLOW_UP_AFTER_DAYS = 3;  // no reply by now → follow-up due

export interface NudgeSummary {
  today: string;
  yesterday: { sent: number; target: number; hit: boolean; pct: number };
  today_so_far: { sent: number; target: number; pct: number; remaining: number };
  review_queue: { total: number; due_now: number; over_a_week: number };
  awaiting_action: { positive_replies: number; follow_ups_due: number; callbacks_due: number };
  rolling: { last_7_sent: number; last_7_avg: number; days_active_7: number; streak: number };
  capacity: { warm_accounts: number; daily_ceiling: number };
  operators: Array<{ operator: string; sent_yesterday: number; target: number }>;
}

function startOfDay(d: Date): Date { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }

async function buildSummary(): Promise<NudgeSummary> {
  const now = new Date();
  const todayStart = startOfDay(now);
  const yStart = new Date(todayStart.getTime() - 86400_000);
  const weekStart = new Date(todayStart.getTime() - 7 * 86400_000);

  // ─── Targets ───
  const { data: team } = await supabase
    .from('team_members')
    .select('email, full_name, daily_dm_target, targets_active')
    .eq('is_active', true);
  const members = (team || []) as Array<{ email: string; full_name: string | null; daily_dm_target: number | null; targets_active: boolean | null }>;
  const activeMembers = members.filter(m => m.targets_active !== false);
  const teamTarget = activeMembers.reduce((n, m) => n + (m.daily_dm_target ?? 100), 0) || 100;

  // ─── Sends ───
  const { data: logs } = await supabase
    .from('outreach_logs')
    .select('created_at, sent_by, outcome')
    .eq('outcome', 'sent')
    .gte('created_at', weekStart.toISOString())
    .limit(20000);
  const rows = (logs || []) as Array<{ created_at: string; sent_by: string | null }>;

  const inRange = (r: { created_at: string }, from: Date, to?: Date) => {
    const t = new Date(r.created_at).getTime();
    return t >= from.getTime() && (!to || t < to.getTime());
  };
  const yesterdaySends = rows.filter(r => inRange(r, yStart, todayStart));
  const todaySends = rows.filter(r => inRange(r, todayStart));

  const byDay = new Map<string, number>();
  for (const r of rows) {
    const k = r.created_at.slice(0, 10);
    byDay.set(k, (byDay.get(k) || 0) + 1);
  }

  // ─── Streak: consecutive days back from yesterday that hit target ───
  let streak = 0;
  for (let i = 1; i <= 60; i++) {
    const d = new Date(todayStart.getTime() - i * 86400_000);
    const key = d.toISOString().slice(0, 10);
    const n = byDay.get(key) ?? -1;
    // -1 means outside the 7-day window we pulled; stop rather than guess.
    if (n < 0) break;
    if (n >= teamTarget) streak++; else break;
  }

  // ─── Review queue ───
  const reviewCut = new Date(now.getTime() - REVIEW_AFTER_HOURS * 3600_000).toISOString();
  const weekAgo = new Date(now.getTime() - 7 * 86400_000).toISOString();
  const countOf = async (build: (q: ReturnType<typeof baseQuery>) => ReturnType<typeof baseQuery>) => {
    const { count } = await build(baseQuery());
    return count || 0;
  };
  const baseQuery = () => supabase.from('leads').select('id', { count: 'exact', head: true });

  const reviewTotal = await countOf(q => q.is('dm_reviewed_at', null).not('dm_review_due', 'is', null));
  const reviewDue   = await countOf(q => q.is('dm_reviewed_at', null).lte('dm_review_due', reviewCut));
  const reviewOld   = await countOf(q => q.is('dm_reviewed_at', null).lte('dm_review_due', weekAgo));

  const positives = await countOf(q => q.in('dm_outcome', ['interested', 'asked_for_info']).is('booked_at', null));
  const followUps = await countOf(q =>
    q.eq('dm_outcome', 'no_reply')
     .lte('last_outreach_at', new Date(now.getTime() - FOLLOW_UP_AFTER_DAYS * 86400_000).toISOString()));
  const callbacks = await countOf(q => q.eq('call_stage', 'callback').lte('callback_at', now.toISOString()));

  // ─── Capacity, so the target can be sanity-checked against reality ───
  const { data: accounts } = await supabase
    .from('ig_accounts').select('daily_limit, warmup_stage, status').eq('status', 'active');
  const accts = (accounts || []) as Array<{ daily_limit: number | null; warmup_stage: string | null }>;
  const warm = accts.filter(a => a.warmup_stage === 'warm');

  const perOperator = new Map<string, number>();
  for (const r of yesterdaySends) {
    const k = r.sent_by || 'unattributed';
    perOperator.set(k, (perOperator.get(k) || 0) + 1);
  }

  const weekTotal = rows.filter(r => inRange(r, weekStart)).length;
  const daysActive = new Set(rows.filter(r => inRange(r, weekStart)).map(r => r.created_at.slice(0, 10))).size;

  return {
    today: todayStart.toISOString().slice(0, 10),
    yesterday: {
      sent: yesterdaySends.length,
      target: teamTarget,
      hit: yesterdaySends.length >= teamTarget,
      pct: teamTarget > 0 ? Math.round((yesterdaySends.length / teamTarget) * 100) : 0,
    },
    today_so_far: {
      sent: todaySends.length,
      target: teamTarget,
      pct: teamTarget > 0 ? Math.round((todaySends.length / teamTarget) * 100) : 0,
      remaining: Math.max(0, teamTarget - todaySends.length),
    },
    review_queue: { total: reviewTotal, due_now: reviewDue, over_a_week: reviewOld },
    awaiting_action: { positive_replies: positives, follow_ups_due: followUps, callbacks_due: callbacks },
    rolling: {
      last_7_sent: weekTotal,
      last_7_avg: Math.round(weekTotal / 7),
      days_active_7: daysActive,
      streak,
    },
    capacity: {
      warm_accounts: warm.length,
      daily_ceiling: accts.reduce((n, a) => n + (a.daily_limit || 0), 0),
    },
    operators: Array.from(perOperator.entries())
      .map(([operator, sent_yesterday]) => ({
        operator,
        sent_yesterday,
        target: members.find(m => m.email === operator)?.daily_dm_target ?? 100,
      }))
      .sort((a, b) => b.sent_yesterday - a.sent_yesterday),
  };
}

function formatSlack(s: NudgeSummary): { text: string; blocks: unknown[] } {
  const y = s.yesterday;
  const bar = (pct: number) => {
    const filled = Math.min(10, Math.round(pct / 10));
    return '█'.repeat(filled) + '░'.repeat(10 - filled);
  };

  const headline = y.hit
    ? `✅ *${y.sent}/${y.target}* sent yesterday — target hit${s.rolling.streak > 1 ? ` · ${s.rolling.streak}-day streak` : ''}`
    : `⚠️ *${y.sent}/${y.target}* sent yesterday — ${y.target - y.sent} short`;

  const lines = [
    `*Outreach check — ${s.today}*`,
    '',
    `${bar(y.pct)} ${headline}`,
    `Last 7 days: *${s.rolling.last_7_sent}* sent across *${s.rolling.days_active_7}/7* active days (avg ${s.rolling.last_7_avg}/day)`,
    '',
    '*Needs you today*',
  ];

  if (s.review_queue.due_now > 0) {
    lines.push(`• 🔍 *${s.review_queue.due_now}* messaged and never checked for a reply${s.review_queue.over_a_week > 0 ? ` (${s.review_queue.over_a_week} over a week old)` : ''}`);
  }
  if (s.awaiting_action.positive_replies > 0) lines.push(`• 🔥 *${s.awaiting_action.positive_replies}* interested, not yet booked`);
  if (s.awaiting_action.follow_ups_due > 0)  lines.push(`• 🔁 *${s.awaiting_action.follow_ups_due}* no reply after ${FOLLOW_UP_AFTER_DAYS} days — follow-up due`);
  if (s.awaiting_action.callbacks_due > 0)   lines.push(`• 📅 *${s.awaiting_action.callbacks_due}* callbacks due`);
  if (s.review_queue.due_now === 0 && s.awaiting_action.positive_replies === 0 &&
      s.awaiting_action.follow_ups_due === 0 && s.awaiting_action.callbacks_due === 0) {
    lines.push('• Nothing outstanding — clean slate.');
  }

  lines.push('', `*Today:* ${s.today_so_far.sent}/${s.today_so_far.target} · ${s.today_so_far.remaining} to go`);
  lines.push(`_Capacity: ${s.capacity.warm_accounts} warm accounts, ${s.capacity.daily_ceiling}/day ceiling_`);

  const text = lines.join('\n');
  return {
    text,
    blocks: [{ type: 'section', text: { type: 'mrkdwn', text } }, { type: 'divider' }],
  };
}

async function postToSlack(s: NudgeSummary): Promise<boolean> {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) return false;
  const channel = process.env.SLACK_EOD_CHANNEL || process.env.SLACK_HUNT_CHANNEL || '';
  if (!channel) return false;

  const { text, blocks } = formatSlack(s);
  const res = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ channel, text, blocks, mrkdwn: true, unfurl_links: false }),
  });
  const data = await res.json();
  if (!data.ok) console.error('[daily-nudge] Slack rejected the post:', data.error);
  return !!data.ok;
}

/** Freeze yesterday into daily_scorecard so streaks survive log pruning. */
async function snapshot(s: NudgeSummary) {
  const day = new Date(Date.now() - 86400_000).toISOString().slice(0, 10);
  const rows = s.operators.length > 0
    ? s.operators.map(o => ({
        day, operator: o.operator, dm_sent: o.sent_yesterday,
        dm_target: o.target, hit_target: o.sent_yesterday >= o.target,
      }))
    : [{ day, operator: 'team', dm_sent: s.yesterday.sent, dm_target: s.yesterday.target, hit_target: s.yesterday.hit }];
  await supabase.from('daily_scorecard').upsert(rows, { onConflict: 'day,operator' });
}

export async function GET(request: NextRequest) {
  const cron = new URL(request.url).searchParams.get('cron');
  if (cron !== 'post') {
    return NextResponse.json({ ok: true, endpoint: 'daily-nudge', usage: 'GET ?cron=post, or POST {action:"get"}' });
  }
  // Cron path — Vercel calls this unauthenticated, so it is read-plus-append
  // only and never mutates lead state.
  const summary = await buildSummary();
  const posted = await postToSlack(summary);
  await snapshot(summary);
  return NextResponse.json({ success: true, posted, summary });
}

export async function POST(request: NextRequest) {
  const auth = await authOr401();
  if (auth instanceof NextResponse) return auth;

  const body = await request.json().catch(() => ({}));
  const summary = await buildSummary();

  if (body.action === 'post_slack') {
    const posted = await postToSlack(summary);
    return NextResponse.json({ success: true, posted, summary });
  }
  return NextResponse.json({ success: true, summary });
}
