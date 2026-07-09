import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { authOr401 } from '@/lib/api-auth';
import { computeWarmupState } from '@/lib/ig-warmup';

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
  lead_business: string | null;
  channel: string | null;
  outcome: string | null;
  sender_account: string | null;
  stage: string | null;
  message_sent: string | null;
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
  daily_target: number | null;
  daily_sent_today: number | null;
  total_sent: number | null;
  total_replies: number | null;
  warmup_stage: string | null;
  warmup_started_at: string | null;
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
    .select('lead_id, lead_business, channel, outcome, sender_account, stage, message_sent, created_at')
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
      .select('username, daily_limit, daily_target, daily_sent_today, total_sent, total_replies, warmup_stage, warmup_started_at')
      .in('username', accountUsernames);
    accountMeta = (data || []) as AccountRow[];
  }
  const by_account = accountUsernames
    .map(u => {
      const meta = accountMeta.find(m => m.username === u);
      const warmup = computeWarmupState({
        warmup_stage: meta?.warmup_stage || null,
        warmup_started_at: meta?.warmup_started_at || null,
        daily_target: meta?.daily_target ?? null,
        daily_limit: meta?.daily_limit ?? null,
      });
      return {
        account: u,
        sent: perAccountSent.get(u) || 0,
        daily_sent_today: meta?.daily_sent_today || 0,
        daily_limit: warmup.hard_limit,
        daily_target: warmup.effective_target,
        warmup_stage: warmup.stage,
        warmup_days: warmup.days_in_warmup,
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

  // ═══════════════════════════════════════════════════════
  // REPLY ATTRIBUTION
  // For every lead that responded in the window, find the most recent
  // outreach_logs row with outcome='sent' for that lead (may be outside
  // the window if the lead was messaged weeks ago and replied today).
  // Credit that log's sender_account with the reply and sentiment.
  // ═══════════════════════════════════════════════════════
  interface Attribution {
    lead_id: string;
    lead_business: string;
    sender_account: string;
    channel: string;
    sentiment: 'positive' | 'negative' | 'neutral';
    sent_at: string;
    responded_at: string;
    message_sent: string;
  }
  const respondedLeads = leads.filter(l => inWindow(l.responded_at));
  const respondedIds = respondedLeads.map(l => l.id);
  let attribution: Attribution[] = [];
  if (respondedIds.length > 0) {
    const { data: sentLogs } = await supabaseAdmin
      .from('outreach_logs')
      .select('lead_id, lead_business, sender_account, channel, message_sent, created_at')
      .in('lead_id', respondedIds)
      .eq('outcome', 'sent')
      .order('created_at', { ascending: false })
      .limit(20000);
    const mostRecentByLead = new Map<string, { lead_business: string | null; sender_account: string | null; channel: string | null; message_sent: string | null; created_at: string }>();
    for (const s of (sentLogs || []) as Array<{ lead_id: string; lead_business: string | null; sender_account: string | null; channel: string | null; message_sent: string | null; created_at: string }>) {
      if (!mostRecentByLead.has(s.lead_id)) mostRecentByLead.set(s.lead_id, s);
    }
    for (const l of respondedLeads) {
      const s = mostRecentByLead.get(l.id);
      if (!s) continue;
      const raw = (l.response_sentiment || '').toLowerCase();
      const sentiment: 'positive' | 'negative' | 'neutral' =
        raw === 'positive' ? 'positive' : raw === 'negative' ? 'negative' : 'neutral';
      attribution.push({
        lead_id: l.id,
        lead_business: s.lead_business || '(unknown clinic)',
        sender_account: s.sender_account || '(no account)',
        channel: s.channel || 'unknown',
        sentiment,
        sent_at: s.created_at,
        responded_at: l.responded_at!,
        message_sent: s.message_sent || '',
      });
    }
  }

  // Per-account reply counts (window)
  const replies_by_account_map = new Map<string, { replies: number; positive: number; negative: number; neutral: number }>();
  for (const a of attribution) {
    const entry = replies_by_account_map.get(a.sender_account) || { replies: 0, positive: 0, negative: 0, neutral: 0 };
    entry.replies++;
    entry[a.sentiment]++;
    replies_by_account_map.set(a.sender_account, entry);
  }
  const by_account_enriched = by_account.map(a => {
    const r = replies_by_account_map.get(a.account) || { replies: 0, positive: 0, negative: 0, neutral: 0 };
    return {
      ...a,
      window_replies: r.replies,
      window_positive: r.positive,
      window_negative: r.negative,
      window_neutral: r.neutral,
    };
  });

  // Positive-reply cards for the callout section
  const positive_reply_log = attribution
    .filter(a => a.sentiment === 'positive')
    .sort((a, b) => b.responded_at.localeCompare(a.responded_at))
    .slice(0, 20);

  // ═══════════════════════════════════════════════════════
  // MESSAGE LOG (per-account drill-down source)
  // Last 200 sends in the window, most recent first, with lead's current
  // reply state stitched in so the UI can render 🟢/🔴/🟡/⏳ chips.
  // ═══════════════════════════════════════════════════════
  const leadStateById = new Map<string, LeadRow>();
  for (const l of leads) leadStateById.set(l.id, l);
  const message_log = logs
    .filter(l => l.outcome === 'sent')
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 200)
    .map(l => {
      const leadState = l.lead_id ? leadStateById.get(l.lead_id) : undefined;
      const sentiment = (leadState?.response_sentiment || '').toLowerCase();
      const hasReply = !!(leadState?.responded_at && inWindow(leadState.responded_at));
      const replyChip: 'positive' | 'negative' | 'neutral' | 'awaiting' =
        !hasReply ? 'awaiting'
        : sentiment === 'positive' ? 'positive'
        : sentiment === 'negative' ? 'negative'
        : 'neutral';
      return {
        lead_id: l.lead_id,
        lead_business: l.lead_business || '(unknown)',
        sender_account: l.sender_account || '(no account)',
        channel: l.channel || 'unknown',
        stage: l.stage || 'unknown',
        message_sent: (l.message_sent || '').slice(0, 240),
        created_at: l.created_at,
        reply_status: replyChip,
        booked: !!(leadState?.booked_at && inWindow(leadState.booked_at)),
      };
    });

  return NextResponse.json({
    success: true,
    window: { period, from, to, label },
    filters: { channel: channelFilter || 'all', account: accountFilter || null },
    totals,
    funnel,
    by_account: by_account_enriched,
    by_day,
    by_channel,
    by_stage,
    positive_reply_log,
    message_log,
  });
}
