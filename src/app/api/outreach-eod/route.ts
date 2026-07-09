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
  by_account: Array<{ account: string; sent: number; used: number; limit: number; pct: number; replies_today: number; positive_today: number; negative_today: number }>;
  by_stage: Record<string, number>;
  top_replies: Array<{ lead_business: string; at: string }>;
  positive_replies: Array<{ lead_business: string; sender_account: string; channel: string; message_sent: string; responded_at: string }>;
  reply_totals: { replies: number; positive: number; negative: number; neutral: number };
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

  // ═══════════════════════════════════════════════════════
  // REPLY ATTRIBUTION for today
  // For each lead that responded within today's window, find the most
  // recent outreach_logs row with outcome='sent' for that lead (may be
  // dated earlier if they were messaged days ago) and credit that
  // log's sender_account with the reply.
  // ═══════════════════════════════════════════════════════
  const { data: repliedLeadsRaw } = await supabaseAdmin
    .from('leads')
    .select('id, responded_at, response_sentiment, booked_at')
    .gte('responded_at', from)
    .lte('responded_at', to)
    .limit(5000);
  const repliedLeads = (repliedLeadsRaw || []) as Array<{ id: string; responded_at: string | null; response_sentiment: string | null; booked_at: string | null }>;

  interface Attribution {
    lead_business: string;
    sender_account: string;
    channel: string;
    sentiment: 'positive' | 'negative' | 'neutral';
    message_sent: string;
    responded_at: string;
  }
  let attribution: Attribution[] = [];
  if (repliedLeads.length > 0) {
    const respondedIds = repliedLeads.map(l => l.id);
    const { data: sentLogs } = await supabaseAdmin
      .from('outreach_logs')
      .select('lead_id, lead_business, sender_account, channel, message_sent, created_at')
      .in('lead_id', respondedIds)
      .eq('outcome', 'sent')
      .order('created_at', { ascending: false })
      .limit(10000);
    const mostRecent = new Map<string, { lead_business: string | null; sender_account: string | null; channel: string | null; message_sent: string | null }>();
    for (const s of (sentLogs || []) as Array<{ lead_id: string; lead_business: string | null; sender_account: string | null; channel: string | null; message_sent: string | null; created_at: string }>) {
      if (!mostRecent.has(s.lead_id)) mostRecent.set(s.lead_id, s);
    }
    for (const l of repliedLeads) {
      const s = mostRecent.get(l.id);
      if (!s) continue;
      const raw = (l.response_sentiment || '').toLowerCase();
      const sentiment: 'positive' | 'negative' | 'neutral' =
        raw === 'positive' ? 'positive' : raw === 'negative' ? 'negative' : 'neutral';
      attribution.push({
        lead_business: s.lead_business || '(unknown clinic)',
        sender_account: s.sender_account || '(no account)',
        channel: s.channel || 'unknown',
        sentiment,
        message_sent: s.message_sent || '',
        responded_at: l.responded_at!,
      });
    }
  }

  // Per-account reply tallies today
  const replyTallyByAccount = new Map<string, { replies: number; positive: number; negative: number }>();
  for (const a of attribution) {
    const entry = replyTallyByAccount.get(a.sender_account) || { replies: 0, positive: 0, negative: 0 };
    entry.replies++;
    if (a.sentiment === 'positive') entry.positive++;
    else if (a.sentiment === 'negative') entry.negative++;
    replyTallyByAccount.set(a.sender_account, entry);
  }

  const by_account = accountUsernames
    .map(u => {
      const meta = accountMeta.find(m => m.username === u);
      const sent = perAccountSent.get(u) || 0;
      const limit = meta?.daily_limit || 30;
      const used = meta?.daily_sent_today || sent;
      const r = replyTallyByAccount.get(u) || { replies: 0, positive: 0, negative: 0 };
      return {
        account: u, sent, used, limit,
        pct: Math.round((used / limit) * 100),
        replies_today: r.replies,
        positive_today: r.positive,
        negative_today: r.negative,
      };
    })
    .sort((a, b) => b.sent - a.sent);

  // Legacy top_replies (kept for backward-compat with any external callers)
  const top_replies = attribution.slice(0, 10).map(a => ({ lead_business: a.lead_business, at: a.responded_at }));

  const positive_replies = attribution
    .filter(a => a.sentiment === 'positive')
    .sort((a, b) => b.responded_at.localeCompare(a.responded_at));

  const reply_totals = {
    replies: attribution.length,
    positive: attribution.filter(a => a.sentiment === 'positive').length,
    negative: attribution.filter(a => a.sentiment === 'negative').length,
    neutral: attribution.filter(a => a.sentiment === 'neutral').length,
  };

  return {
    date: from.slice(0, 10),
    totals,
    by_channel,
    by_stage,
    by_account,
    top_replies,
    positive_replies,
    reply_totals,
  };
}

function formatSlack(s: Summary): { text: string; blocks: unknown[] } {
  const totalActions = s.totals.sent + s.totals.drafts + s.totals.blocked + s.totals.unsent;
  const dateLabel = new Date(s.date).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' });

  const header = `📊 *Outreach EOD — ${dateLabel}*`;
  const totalsLine = `*${s.totals.sent}* sent · ${s.totals.drafts} drafts · ${s.totals.blocked} blocked · ${s.totals.unsent} unsent  ·  ${totalActions} logged actions`;

  const replyTotalsLine = `💬 *${s.reply_totals.replies}* replies · 🟢 *${s.reply_totals.positive}* positive · 🔴 ${s.reply_totals.negative} negative · 🟡 ${s.reply_totals.neutral} neutral`;

  const channelLine = Object.entries(s.by_channel).length > 0
    ? Object.entries(s.by_channel).map(([c, n]) => `${c === 'instagram' ? '📷' : c === 'whatsapp' ? '💬' : c === 'sms' ? '📱' : '•'} ${c}: *${n}*`).join('  ·  ')
    : '_no messages logged today_';

  const accountLines = s.by_account.length > 0
    ? s.by_account.map(a => {
        const bar = a.pct >= 100 ? '🔴' : a.pct >= 80 ? '🟡' : '🟢';
        const replies = a.replies_today > 0
          ? `  ·  💬 ${a.replies_today} (🟢${a.positive_today} 🔴${a.negative_today})`
          : '';
        return `${bar} \`@${a.account}\` — *${a.sent}* sent · ${a.used}/${a.limit} (${a.pct}%)${replies}`;
      }).join('\n')
    : '_no per-account activity recorded_';

  // Positive wins with attribution — the close list
  const winsBlock = s.positive_replies.length > 0
    ? '🎯 *Positive replies today:*\n' + s.positive_replies.slice(0, 8).map(r => {
        const icon = r.channel === 'instagram' ? '📷' : r.channel === 'whatsapp' ? '💬' : '📱';
        const snippet = r.message_sent ? `\n     _"${r.message_sent.slice(0, 100).replace(/\n/g, ' ')}${r.message_sent.length > 100 ? '…' : ''}"_` : '';
        return `${icon} *${r.lead_business}* — from \`@${r.sender_account}\`${snippet}`;
      }).join('\n')
    : null;

  const textParts = [
    header,
    totalsLine,
    replyTotalsLine,
    `By channel: ${channelLine}`,
    `*Per account:*\n${accountLines}`,
  ];
  if (winsBlock) textParts.push(winsBlock);
  const text = textParts.join('\n');

  const blocks: unknown[] = [
    { type: 'section', text: { type: 'mrkdwn', text: header } },
    { type: 'section', text: { type: 'mrkdwn', text: `${totalsLine}\n${replyTotalsLine}` } },
    { type: 'section', text: { type: 'mrkdwn', text: `*By channel:* ${channelLine}` } },
    { type: 'section', text: { type: 'mrkdwn', text: `*Per account:*\n${accountLines}` } },
  ];
  if (winsBlock) blocks.push({ type: 'section', text: { type: 'mrkdwn', text: winsBlock } });
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
