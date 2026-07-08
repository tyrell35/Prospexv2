import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { authOr401 } from '@/lib/api-auth';

// ═══════════════════════════════════════════════════════
// /api/outreach-eod
// End-of-day outreach digest.
//
// GET  ?since=YYYY-MM-DD          — return the day's summary as JSON
// GET  ?cron=post_slack             — cron path: sends the summary to Slack
// POST { action: 'post_slack' }     — manually push today's digest to Slack
// ═══════════════════════════════════════════════════════

interface LogRow {
  channel: string | null;
  outcome: string | null;
  sender_account: string | null;
  stage: string | null;
  created_at: string;
  lead_business: string | null;
}

interface AccountRow {
  username: string;
  daily_limit: number | null;
  daily_sent_today: number | null;
  total_replies: number | null;
}

function todayRangeUTC(sinceISO?: string) {
  const from = sinceISO ? new Date(sinceISO) : new Date();
  from.setUTCHours(0, 0, 0, 0);
  const to = new Date(from);
  to.setUTCHours(23, 59, 59, 999);
  return { from: from.toISOString(), to: to.toISOString() };
}

interface Summary {
  date: string;
  totals: { sent: number; drafts: number; blocked: number; unsent: number };
  by_channel: Record<string, number>;
  by_account: Array<{ account: string; sent: number; used: number; limit: number; pct: number; replies_today?: number }>;
  by_stage: Record<string, number>;
  top_replies: Array<{ lead_business: string; at: string }>;
}

async function buildSummary(sinceISO?: string): Promise<Summary> {
  const { from, to } = todayRangeUTC(sinceISO);

  const { data: logsRaw } = await supabaseAdmin
    .from('outreach_logs')
    .select('channel, outcome, sender_account, stage, created_at, lead_business')
    .gte('created_at', from)
    .lte('created_at', to);
  const logs = (logsRaw || []) as LogRow[];

  const totals = { sent: 0, drafts: 0, blocked: 0, unsent: 0 };
  const by_channel: Record<string, number> = {};
  const by_stage: Record<string, number> = {};
  const perAccountSent = new Map<string, number>();
  for (const l of logs) {
    if (l.outcome === 'sent') totals.sent++;
    else if (l.outcome === 'draft') totals.drafts++;
    else if (l.outcome === 'blocked') totals.blocked++;
    else if (l.outcome === 'unsent') totals.unsent++;
    const ch = l.channel || 'unknown';
    by_channel[ch] = (by_channel[ch] || 0) + 1;
    const st = l.stage || 'unknown';
    by_stage[st] = (by_stage[st] || 0) + 1;
    if (l.outcome === 'sent' && l.sender_account) {
      perAccountSent.set(l.sender_account, (perAccountSent.get(l.sender_account) || 0) + 1);
    }
  }

  // Pull account metadata for accounts that showed up
  const accountUsernames = Array.from(perAccountSent.keys());
  let accountMeta: AccountRow[] = [];
  if (accountUsernames.length > 0) {
    const { data } = await supabaseAdmin
      .from('ig_accounts')
      .select('username, daily_limit, daily_sent_today, total_replies')
      .in('username', accountUsernames);
    accountMeta = (data || []) as AccountRow[];
  }

  const by_account = accountUsernames
    .map(u => {
      const meta = accountMeta.find(m => m.username === u);
      const sent = perAccountSent.get(u) || 0;
      const limit = meta?.daily_limit || 30;
      const used = meta?.daily_sent_today || sent;
      return { account: u, sent, used, limit, pct: Math.round((used / limit) * 100) };
    })
    .sort((a, b) => b.sent - a.sent);

  // Top replies logged today
  const { data: repliesRaw } = await supabaseAdmin
    .from('outreach_logs')
    .select('lead_business, created_at')
    .gte('created_at', from)
    .lte('created_at', to)
    .eq('outcome', 'replied')
    .limit(10);
  const top_replies = ((repliesRaw || []) as Array<{ lead_business: string | null; created_at: string }>)
    .filter(r => r.lead_business)
    .map(r => ({ lead_business: r.lead_business!, at: r.created_at }));

  return {
    date: from.slice(0, 10),
    totals,
    by_channel,
    by_stage,
    by_account,
    top_replies,
  };
}

function formatSlack(s: Summary): { text: string; blocks: unknown[] } {
  const totalActions = s.totals.sent + s.totals.drafts + s.totals.blocked + s.totals.unsent;
  const dateLabel = new Date(s.date).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' });

  const header = `📊 *Outreach EOD — ${dateLabel}*`;
  const totalsLine = `*${s.totals.sent}* sent · ${s.totals.drafts} drafts · ${s.totals.blocked} blocked · ${s.totals.unsent} unsent  ·  ${totalActions} logged actions`;
  const channelLine = Object.entries(s.by_channel).length > 0
    ? Object.entries(s.by_channel).map(([c, n]) => `${c === 'instagram' ? '📷' : c === 'whatsapp' ? '💬' : c === 'sms' ? '📱' : '•'} ${c}: *${n}*`).join('  ·  ')
    : '_no messages logged today_';

  const accountLines = s.by_account.length > 0
    ? s.by_account.map(a => {
        const bar = a.pct >= 100 ? '🔴' : a.pct >= 80 ? '🟡' : '🟢';
        return `${bar} \`@${a.account}\` — *${a.sent}* today · ${a.used}/${a.limit} of daily limit (${a.pct}%)`;
      }).join('\n')
    : '_no per-account activity recorded_';

  const repliesLine = s.top_replies.length > 0
    ? '💬 *Replies logged today:* ' + s.top_replies.slice(0, 5).map(r => `_${r.lead_business}_`).join(', ')
    : null;

  const textParts = [header, totalsLine, `By channel: ${channelLine}`, `*Per account:*\n${accountLines}`];
  if (repliesLine) textParts.push(repliesLine);
  const text = textParts.join('\n');

  const blocks: unknown[] = [
    { type: 'section', text: { type: 'mrkdwn', text: header } },
    { type: 'section', text: { type: 'mrkdwn', text: totalsLine } },
    { type: 'section', text: { type: 'mrkdwn', text: `*By channel:* ${channelLine}` } },
    { type: 'section', text: { type: 'mrkdwn', text: `*Per account:*\n${accountLines}` } },
  ];
  if (repliesLine) blocks.push({ type: 'section', text: { type: 'mrkdwn', text: repliesLine } });
  blocks.push({ type: 'divider' });
  return { text, blocks };
}

async function postToSlack(summary: Summary, channelOverride?: string): Promise<boolean> {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) return false;
  const channel = channelOverride || process.env.SLACK_EOD_CHANNEL || process.env.SLACK_HUNT_CHANNEL || 'C0APFTS0686';
  const { text, blocks } = formatSlack(summary);
  const res = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ channel, text, blocks, mrkdwn: true, unfurl_links: false }),
  });
  const data = await res.json().catch(() => ({}));
  return !!data.ok;
}

// ─── GET (cron + JSON) ──────────────────────────────────

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const cron = url.searchParams.get('cron');

  if (cron === 'post_slack') {
    const expected = process.env.CRON_SECRET;
    if (expected) {
      const authHeader = request.headers.get('authorization') || '';
      if (authHeader !== `Bearer ${expected}`) {
        return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
      }
    }
    const summary = await buildSummary();
    const posted = await postToSlack(summary);
    return NextResponse.json({ success: true, posted, summary });
  }

  const auth = await authOr401();
  if (auth instanceof NextResponse) return auth;
  const since = url.searchParams.get('since') || undefined;
  const summary = await buildSummary(since);
  return NextResponse.json({ success: true, summary });
}

// ─── POST (manual push) ────────────────────────────────

export async function POST(request: NextRequest) {
  const auth = await authOr401();
  if (auth instanceof NextResponse) return auth;
  const body = await request.json().catch(() => ({}));
  if (body.action === 'post_slack') {
    const summary = await buildSummary(body.since);
    const posted = await postToSlack(summary, body.channel);
    return NextResponse.json({ success: true, posted, summary });
  }
  return NextResponse.json({ error: 'action required' }, { status: 400 });
}
