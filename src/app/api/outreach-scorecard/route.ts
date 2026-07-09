import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { authOr401 } from '@/lib/api-auth';

// ═══════════════════════════════════════════════════════
// /api/outreach-scorecard
//
// GET ?period=today|week|month|all
//     &channel=instagram|whatsapp|sms|all
//     &account=<username>
//
// Returns the outreach funnel and per-account/per-day breakdowns for the
// requested window:
//   - Sends           (outreach_logs where outcome='sent')
//   - Attempts logged (sent + draft + blocked + unsent — total actions)
//   - Unique leads    (distinct lead_id in sends)
//   - Replies         (leads.responded_at within window OR outcome='replied')
//   - Positive        (response_sentiment='positive')
//   - Negative        (response_sentiment='negative')
//   - Neutral         (response_sentiment='neutral' OR 'objection')
//   - Bookings        (leads.booked_at within window OR outcome='booked')
//   - Rates:
//       reply_rate    = replies / sends
//       positive_rate = positive / replies
//       booking_rate  = bookings / sends
//       positive_book = bookings / positive (how well you close a warm lead)
// ═══════════════════════════════════════════════════════

type Period = 'today' | 'week' | 'month' | 'all';

function windowFor(period: Period): { from: string | null; to: string; label: string } {
  const now = new Date();
  const to = now.toISOString();
  if (period === 'all') return { from: null, to, label: 'All time' };
  const from = new Date();
  if (period === 'today') from.setUTCHours(0, 0, 0, 0);
  else if (period === 'week') { from.setUTCDate(from.getUTCDate() - 7); from.setUTCHours(0, 0, 0, 0); }
  else if (period === 'month') { from.setUTCDate(from.getUTCDate() - 30); from.setUTCHours(0, 0, 0, 0); }
  return { from: from.toISOString(), to, label: period[0].toUpperCase() + period.slice(1) };
}

interface LogRow {
  lead_id: string | null;
  channel: string | null;
  outcome: string | null;
  sender_account: string | null;
  stage: string | null;
  created_at: string;
}

interface LeadRow {
  id: string;
  responded_at: string | null;
  response_sentiment: string | null;
  booked_at: string | null;
  outreach_status: string | null;
}

interface AccountRow {
  username: string;
  daily_limit: number | null;
  daily_sent_today: number | null;
  total_sent: number | null;
  total_replies: number | null;
}

export async function GET(request: NextRequest) {
  const auth = await authOr401();
  if (auth instanceof NextResponse) return auth;

  const url = new URL(request.url);
  const period = (url.searchParams.get('period') || 'week') as Period;
  const channelFilter = url.searchParams.get('channel');
  const accountFilter = url.searchParams.get('account');
  const { from, to, label } = windowFor(period);

  // ─── Pull logs ────────────────────────────────────────
  let logsQ = supabaseAdmin
    .from('outreach_logs')
    .select('lead_id, channel, outcome, sender_account, stage, created_at')
    .lte('created_at', to)
    .limit(50000);
  if (from) logsQ = logsQ.gte('created_at', from);
  if (channelFilter && channelFilter !== 'all') logsQ = logsQ.eq('channel', channelFilter);
  if (accountFilter) logsQ = logsQ.eq('sender_account', accountFilter);
  const { data: logsRaw } = await logsQ;
  const logs = (logsRaw || []) as LogRow[];

  // ─── Pull leads that responded / booked in the window ─
  let leadsQ = supabaseAdmin
    .from('leads')
    .select('id, responded_at, response_sentiment, booked_at, outreach_status')
    .or(from
      ? `responded_at.gte.${from},booked_at.gte.${from}`
      : 'responded_at.not.is.null,booked_at.not.is.null')
    .limit(20000);
  const { data: leadsRaw } = await leadsQ;
  const leads = (leadsRaw || []) as LeadRow[];

  // Filter leads by the window's upper bound (Supabase or query doesn't chain to)
  const inWindow = (iso: string | null) => !!iso && iso <= to && (!from || iso >= from);

  // ─── Totals ───────────────────────────────────────────
  let sent = 0, drafts = 0, blocked = 0, unsent = 0;
  const uniqueLeadsSent = new Set<string>();
  const perAccountSent = new Map<string, number>();
  const perDaySent = new Map<string, number>();
  const perChannelSent = new Map<string, number>();
  const perStageSent = new Map<string, number>();
  for (const l of logs) {
    if (l.outcome === 'sent') {
      sent++;
      if (l.lead_id) uniqueLeadsSent.add(l.lead_id);
      if (l.sender_account) perAccountSent.set(l.sender_account, (perAccountSent.get(l.sender_account) || 0) + 1);
      const day = l.created_at.slice(0, 10);
      perDaySent.set(day, (perDaySent.get(day) || 0) + 1);
      const ch = l.channel || 'unknown';
      perChannelSent.set(ch, (perChannelSent.get(ch) || 0) + 1);
      const st = l.stage || 'unknown';
      perStageSent.set(st, (perStageSent.get(st) || 0) + 1);
    } else if (l.outcome === 'draft') drafts++;
    else if (l.outcome === 'blocked') blocked++;
    else if (l.outcome === 'unsent') unsent++;
  }

  // ─── Replies + bookings ───────────────────────────────
  let replies = 0, positive = 0, negative = 0, neutral = 0, bookings = 0;
  for (const l of leads) {
    if (inWindow(l.responded_at)) {
      replies++;
      const s = (l.response_sentiment || '').toLowerCase();
      if (s === 'positive') positive++;
      else if (s === 'negative') negative++;
      else neutral++;
    }
    if (inWindow(l.booked_at) || l.outreach_status === 'booked') bookings++;
  }

  // ─── Rates ────────────────────────────────────────────
  const pct = (num: number, den: number) => den > 0 ? Math.round((num / den) * 1000) / 10 : 0;
  const funnel = {
    sent, unique_leads_sent: uniqueLeadsSent.size,
    replies, positive, negative, neutral,
    bookings,
    reply_rate: pct(replies, sent),
    positive_rate: pct(positive, replies),
    booking_rate: pct(bookings, sent),
    positive_to_booking: pct(bookings, positive),
  };

  // ─── Per-account with usage snapshots ────────────────
  const accountUsernames = Array.from(perAccountSent.keys());
  let accountMeta: AccountRow[] = [];
  if (accountUsernames.length > 0) {
    const { data } = await supabaseAdmin
      .from('ig_accounts')
      .select('username, daily_limit, daily_sent_today, total_sent, total_replies')
      .in('username', accountUsernames);
    accountMeta = (data || []) as AccountRow[];
  }
  const by_account = accountUsernames
    .map(u => {
      const meta = accountMeta.find(m => m.username === u);
      return {
        account: u,
        sent: perAccountSent.get(u) || 0,
        daily_sent_today: meta?.daily_sent_today || 0,
        daily_limit: meta?.daily_limit || 30,
        total_sent: meta?.total_sent || 0,
        total_replies: meta?.total_replies || 0,
      };
    })
    .sort((a, b) => b.sent - a.sent);

  // ─── Per-day series (last 30 days from range) ────────
  const by_day = Array.from(perDaySent.entries())
    .map(([date, n]) => ({ date, sent: n }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // ─── Per-channel / per-stage ──────────────────────────
  const by_channel = Array.from(perChannelSent.entries())
    .map(([channel, n]) => ({ channel, sent: n }))
    .sort((a, b) => b.sent - a.sent);
  const by_stage = Array.from(perStageSent.entries())
    .map(([stage, n]) => ({ stage, sent: n }))
    .sort((a, b) => b.sent - a.sent);

  // ─── Total attempts (any outcome) ─────────────────────
  const totals = { sent, drafts, blocked, unsent, actions_logged: sent + drafts + blocked + unsent };

  return NextResponse.json({
    success: true,
    window: { period, from, to, label },
    filters: { channel: channelFilter || 'all', account: accountFilter || null },
    totals,
    funnel,
    by_account,
    by_day,
    by_channel,
    by_stage,
  });
}
