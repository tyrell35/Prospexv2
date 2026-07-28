'use client';

import { useEffect, useState, useMemo, Fragment } from 'react';
import Link from 'next/link';
import {
  Trophy, Send, MessageCircle, ThumbsUp, ThumbsDown, Meh, CalendarCheck,
  Loader2, RefreshCw, TrendingUp, TrendingDown, Instagram, Filter,
  ExternalLink, ChevronDown, ChevronRight, Sparkles, Clock, Slack,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import PostEodPreviewModal from '@/components/PostEodPreviewModal';

type Period = 'today' | 'week' | 'month' | 'all';
type ChannelFilter = 'all' | 'instagram' | 'whatsapp' | 'sms';

interface Scorecard {
  window: { period: Period; from: string | null; to: string; label: string };
  filters: { channel: string; account: string | null };
  totals: { sent: number; drafts: number; blocked: number; unsent: number; actions_logged: number };
  funnel: {
    sent: number; unique_leads_sent: number;
    replies: number; positive: number; negative: number; neutral: number;
    bookings: number;
    reply_rate: number; positive_rate: number; booking_rate: number; positive_to_booking: number;
  };
  by_account: Array<{
    account: string; sent: number; daily_sent_today: number; daily_limit: number;
    daily_target: number; warmup_stage: 'new' | 'warming' | 'warm' | 'paused'; warmup_days: number;
    total_sent: number; total_replies: number;
    window_replies: number; window_positive: number; window_negative: number; window_neutral: number;
  }>;
  by_day: Array<{ date: string; sent: number }>;
  by_channel: Array<{ channel: string; sent: number }>;
  by_stage: Array<{ stage: string; sent: number }>;
  by_operator: Array<{ operator: string; sent: number }>;
  positive_reply_log: Array<{
    lead_id: string; lead_business: string; sender_account: string; channel: string;
    sentiment: 'positive'; sent_at: string; responded_at: string; message_sent: string;
  }>;
  message_log: Array<{
    lead_id: string | null; lead_business: string; sender_account: string; channel: string;
    stage: string; message_sent: string; created_at: string;
    reply_status: 'positive' | 'negative' | 'neutral' | 'awaiting'; booked: boolean;
  }>;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function ReplyChip({ status }: { status: 'positive' | 'negative' | 'neutral' | 'awaiting' }) {
  const cfg = {
    positive: { icon: '🟢', label: 'positive', cls: 'text-prospex-green border-prospex-green/40' },
    negative: { icon: '🔴', label: 'negative', cls: 'text-prospex-red border-prospex-red/40' },
    neutral:  { icon: '🟡', label: 'neutral',  cls: 'text-amber-400 border-amber-500/40' },
    awaiting: { icon: '⏳', label: 'awaiting', cls: 'text-prospex-dim border-prospex-border' },
  }[status];
  return (
    <span className={cn('text-[9px] font-mono px-1.5 py-0.5 rounded border', cfg.cls)}>
      {cfg.icon} {cfg.label}
    </span>
  );
}

// ─── Small building blocks ──────────────────────────────

function KpiCard({ label, value, sub, icon: Icon, tone = 'default' }: {
  label: string;
  value: string | number;
  sub?: string;
  icon: typeof Send;
  tone?: 'default' | 'green' | 'red' | 'amber' | 'cyan';
}) {
  const toneCls = {
    default: 'border-prospex-border text-prospex-text',
    green:   'border-prospex-green/40 text-prospex-green',
    red:     'border-prospex-red/40 text-prospex-red',
    amber:   'border-amber-500/40 text-amber-400',
    cyan:    'border-prospex-cyan/40 text-prospex-cyan',
  }[tone];

  return (
    <div className={cn('card p-4 border', toneCls.split(' ')[0])}>
      <div className="flex items-center gap-2 mb-1">
        <Icon className={cn('w-4 h-4', toneCls.split(' ')[1])} />
        <p className="text-[10px] font-mono text-prospex-dim uppercase">{label}</p>
      </div>
      <p className={cn('text-3xl font-mono font-bold', toneCls.split(' ')[1])}>{value}</p>
      {sub && <p className="text-[10px] text-prospex-dim mt-1">{sub}</p>}
    </div>
  );
}

function FunnelBar({ label, value, of, help, color }: { label: string; value: number; of: number; help?: string; color: string }) {
  const pct = of > 0 ? Math.round((value / of) * 100) : 0;
  return (
    <div>
      <div className="flex items-center justify-between text-[10px] mb-1">
        <span className="text-prospex-muted">{label}</span>
        <span className="font-mono text-prospex-text">
          <span className="font-bold">{value}</span>
          {of > 0 && <span className="text-prospex-dim"> / {of} · {pct}%</span>}
        </span>
      </div>
      <div className="w-full h-2 bg-prospex-bg rounded-full overflow-hidden">
        <div className="h-2 rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>
      {help && <p className="text-[9px] text-prospex-dim mt-1">{help}</p>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// PAGE
// ═══════════════════════════════════════════════════════

export default function OutreachScorecardPage() {
  const [data, setData] = useState<Scorecard | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>('today');
  const [channel, setChannel] = useState<ChannelFilter>('all');
  const [account, setAccount] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [expandedAccount, setExpandedAccount] = useState<string | null>(null);
  const [showEodPreview, setShowEodPreview] = useState(false);
  const [slackToast, setSlackToast] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ period, channel });
    if (account.trim()) params.set('account', account.trim());
    try {
      const res = await fetch(`/api/outreach-scorecard?${params.toString()}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Failed to load');
      setData(json as Scorecard);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [period, channel, account]);

  const daySeriesMax = useMemo(() => data ? Math.max(1, ...data.by_day.map(d => d.sent)) : 1, [data]);

  const messagesByAccount = useMemo(() => {
    const m = new Map<string, Scorecard['message_log']>();
    if (!data) return m;
    for (const msg of data.message_log) {
      const bucket = m.get(msg.sender_account) || [];
      bucket.push(msg);
      m.set(msg.sender_account, bucket);
    }
    return m;
  }, [data]);

  const onEodPosted = () => {
    setSlackToast('✓ Posted to Slack');
    setTimeout(() => setSlackToast(null), 4000);
  };

  return (
    <div className="max-w-7xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-mono font-bold text-prospex-text flex items-center gap-3">
            <Trophy className="w-5 h-5 md:w-6 md:h-6 text-prospex-cyan" /> Outreach Scorecard
          </h1>
          <p className="text-sm text-prospex-dim mt-1">
            The one page that answers: how many sends, how many replies, how many bookings — and per account.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => setShowEodPreview(true)} className="btn-ghost text-xs min-h-[40px] md:min-h-0" title="Preview and confirm the EOD digest before Slack">
            <Slack className="w-3.5 h-3.5" /> Post EOD to Slack
          </button>
          <button onClick={load} className="btn-ghost text-xs min-h-[40px] md:min-h-0">
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} Refresh
          </button>
        </div>
      </div>

      {slackToast && (
        <div className="card p-2 text-xs text-prospex-cyan border-prospex-cyan/40">{slackToast}</div>
      )}

      {/* Filter bar */}
      <div className="card p-3 flex flex-wrap items-center gap-2">
        <Filter className="w-3.5 h-3.5 text-prospex-dim" />

        <div className="flex items-center gap-1">
          {(['today', 'week', 'month', 'all'] as Period[]).map(p => (
            <button key={p} onClick={() => setPeriod(p)}
              className={cn('text-[10px] px-2 py-1 rounded font-mono uppercase',
                period === p ? 'bg-prospex-cyan/20 text-prospex-cyan border border-prospex-cyan/30' : 'bg-prospex-bg text-prospex-dim hover:text-prospex-text')}>
              {p}
            </button>
          ))}
        </div>

        <div className="w-px h-4 bg-prospex-border mx-1" />

        <select value={channel} onChange={e => setChannel(e.target.value as ChannelFilter)} className="input text-xs py-1.5 w-auto">
          <option value="all">All channels</option>
          <option value="instagram">📷 Instagram</option>
          <option value="whatsapp">💬 WhatsApp</option>
          <option value="sms">📱 SMS</option>
        </select>

        <input value={account} onChange={e => setAccount(e.target.value)} placeholder="Filter by @account…" className="input text-xs py-1.5 w-40" />
        {account && <button onClick={() => setAccount('')} className="text-[10px] text-prospex-dim hover:text-prospex-text">clear</button>}

        {data && <span className="ml-auto text-[10px] text-prospex-dim font-mono">{data.window.label}</span>}
      </div>

      {error && (
        <div className="card p-3 border-prospex-red/40 text-xs text-prospex-red">{error}</div>
      )}

      {loading && !data ? (
        <div className="card p-12 text-center"><Loader2 className="w-6 h-6 animate-spin text-prospex-cyan mx-auto" /></div>
      ) : data ? (
        <>
          {/* Row 1: primary KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiCard label="Messages Sent" value={data.funnel.sent} sub={`${data.funnel.unique_leads_sent} unique leads`} icon={Send} tone="cyan" />
            <KpiCard label="Replies" value={data.funnel.replies} sub={`${data.funnel.reply_rate}% of sends`} icon={MessageCircle} tone="amber" />
            <KpiCard label="Positive Replies" value={data.funnel.positive} sub={`${data.funnel.positive_rate}% of replies`} icon={ThumbsUp} tone="green" />
            <KpiCard label="Bookings" value={data.funnel.bookings} sub={`${data.funnel.booking_rate}% of sends`} icon={CalendarCheck} tone="green" />
          </div>

          {/* Positive Replies callout — the ones you want to close today */}
          {data.positive_reply_log.length > 0 && (
            <div className="card p-4 border-prospex-green/40">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-xs font-mono uppercase tracking-wider text-prospex-green flex items-center gap-2">
                  <Sparkles className="w-3.5 h-3.5" /> Positive Replies · {data.positive_reply_log.length}
                </h2>
                <span className="text-[9px] text-prospex-dim">Warm leads with an attributable message — this is your close list.</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {data.positive_reply_log.map(r => (
                  <Link key={`${r.lead_id}-${r.responded_at}`} href={`/leads/${r.lead_id}`}
                    className="block bg-prospex-bg/60 border border-prospex-green/20 rounded-lg p-2.5 hover:border-prospex-green/50 transition-colors">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-mono text-prospex-text font-bold truncate">{r.lead_business}</span>
                      <span className="text-[9px] font-mono text-prospex-dim flex items-center gap-1 flex-shrink-0 ml-2">
                        <Clock className="w-2.5 h-2.5" /> {timeAgo(r.responded_at)}
                      </span>
                    </div>
                    <div className="text-[10px] text-prospex-muted mb-1">
                      {r.channel === 'instagram' ? '📷' : r.channel === 'whatsapp' ? '💬' : '📱'}{' '}
                      from <span className="text-prospex-cyan font-mono">@{r.sender_account}</span>
                    </div>
                    {r.message_sent && (
                      <p className="text-[10px] text-prospex-dim italic line-clamp-2">
                        &ldquo;{r.message_sent.slice(0, 140)}{r.message_sent.length > 140 ? '…' : ''}&rdquo;
                      </p>
                    )}
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Row 2: secondary */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiCard label="Drafts" value={data.totals.drafts} sub="written but not sent" icon={Send} tone="amber" />
            <KpiCard label="Blocked" value={data.totals.blocked} sub="account restricted / rejected" icon={TrendingDown} tone="red" />
            <KpiCard label="Negative Replies" value={data.funnel.negative} icon={ThumbsDown} tone="red" />
            <KpiCard label="Neutral / Objection" value={data.funnel.neutral} icon={Meh} tone="default" />
          </div>

          {/* Funnel */}
          <div className="card p-4">
            <h2 className="text-xs font-mono text-prospex-dim uppercase tracking-wider mb-3 flex items-center gap-2">
              <TrendingUp className="w-3.5 h-3.5 text-prospex-cyan" /> Conversion Funnel
            </h2>
            <div className="space-y-3">
              <FunnelBar label="Sent → Replied"           value={data.funnel.replies}  of={data.funnel.sent}     color="rgba(0, 212, 255, 0.7)" />
              <FunnelBar label="Replied → Positive"       value={data.funnel.positive} of={data.funnel.replies}  color="rgba(52, 211, 153, 0.7)" />
              <FunnelBar label="Positive → Booked"        value={data.funnel.bookings} of={data.funnel.positive} color="rgba(16, 185, 129, 0.85)"
                help="Warm-lead close rate — the number that actually shows on a scorecard" />
              <FunnelBar label="Send → Booking (overall)" value={data.funnel.bookings} of={data.funnel.sent}     color="rgba(251, 191, 36, 0.7)" />
            </div>
          </div>

          {/* Per-account breakdown */}
          <div className="card p-4">
            <h2 className="text-xs font-mono text-prospex-dim uppercase tracking-wider mb-3 flex items-center gap-2">
              <Instagram className="w-3.5 h-3.5 text-pink-400" /> Per-Account Performance
            </h2>
            {data.by_account.length === 0 ? (
              <p className="text-xs text-prospex-dim py-4 text-center">No per-account sends logged in this window yet.</p>
            ) : (
              <>
              {/* MOBILE — card list of per-account performance. Each card
                  expands on tap to reveal the account's individual sends
                  in this window (same drill-down data as desktop). */}
              <div className="md:hidden space-y-2">
                {data.by_account.map(a => {
                  const target = a.daily_target || a.daily_limit || 30;
                  const usePct = target > 0 ? Math.round((a.daily_sent_today / target) * 100) : 0;
                  const overCap = a.daily_limit > 0 && a.daily_sent_today >= a.daily_limit;
                  const barColor = overCap ? 'bg-prospex-red' : usePct >= 100 ? 'bg-prospex-green' : usePct >= 80 ? 'bg-prospex-cyan' : 'bg-prospex-cyan/60';
                  const replyRate = a.sent > 0 ? Math.round((a.window_replies / a.sent) * 1000) / 10 : 0;
                  const stageBadge = a.warmup_stage === 'new' ? '🆕 new' : a.warmup_stage === 'warming' ? `🔥 warming d${a.warmup_days}` : a.warmup_stage === 'paused' ? '⏸ paused' : '';
                  const isExpanded = expandedAccount === a.account;
                  const accountMessages = messagesByAccount.get(a.account) || [];
                  return (
                    <div key={a.account} className="bg-prospex-bg/50 rounded-lg border border-prospex-border overflow-hidden">
                      <button onClick={() => setExpandedAccount(isExpanded ? null : a.account)}
                        className="w-full text-left p-3 min-h-[44px]">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-mono text-prospex-text truncate">
                              @{a.account}
                              {stageBadge && <span className="ml-2 text-[10px] text-prospex-dim">{stageBadge}</span>}
                            </p>
                            <p className="text-[10px] text-prospex-dim mt-0.5">
                              {a.daily_sent_today}/{target} today · reply rate {replyRate}%
                            </p>
                          </div>
                          {isExpanded ? <ChevronDown className="w-4 h-4 text-prospex-dim flex-shrink-0" /> : <ChevronRight className="w-4 h-4 text-prospex-dim flex-shrink-0" />}
                        </div>
                        {/* Today/target progress bar */}
                        <div className="w-full h-1 bg-prospex-bg rounded-full mt-2">
                          <div className={cn('h-1 rounded-full', barColor)} style={{ width: `${Math.min(100, usePct)}%` }} />
                        </div>
                        {/* Metrics tiles */}
                        <div className="grid grid-cols-4 gap-1.5 mt-2.5">
                          <div className="bg-prospex-surface rounded p-1.5 text-center">
                            <p className="text-[9px] font-mono text-prospex-dim uppercase">Sent</p>
                            <p className="text-sm font-mono font-bold text-prospex-cyan">{a.sent}</p>
                          </div>
                          <div className="bg-prospex-surface rounded p-1.5 text-center">
                            <p className="text-[9px] font-mono text-prospex-dim uppercase">Replies</p>
                            <p className="text-sm font-mono font-bold text-prospex-text">{a.window_replies}</p>
                          </div>
                          <div className="bg-prospex-surface rounded p-1.5 text-center">
                            <p className="text-[9px] font-mono text-prospex-dim uppercase">🟢</p>
                            <p className="text-sm font-mono font-bold text-prospex-green">{a.window_positive}</p>
                          </div>
                          <div className="bg-prospex-surface rounded p-1.5 text-center">
                            <p className="text-[9px] font-mono text-prospex-dim uppercase">🔴</p>
                            <p className="text-sm font-mono font-bold text-prospex-red/80">{a.window_negative}</p>
                          </div>
                        </div>
                      </button>
                      {isExpanded && (
                        <div className="border-t border-prospex-border/50 bg-prospex-bg/60 px-3 py-3">
                          {accountMessages.length === 0 ? (
                            <p className="text-[11px] text-prospex-dim italic">
                              No individual messages in this window.
                            </p>
                          ) : (
                            <div className="space-y-1.5 max-h-[400px] overflow-y-auto">
                              <p className="text-[10px] font-mono text-prospex-dim uppercase mb-2">
                                Messages from @{a.account} · {accountMessages.length}
                              </p>
                              {accountMessages.map((m, i) => (
                                <div key={`${m.lead_id}-${m.created_at}-${i}`}
                                  className="py-1.5 border-b border-prospex-border/20 last:border-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-[10px] font-mono text-prospex-dim whitespace-nowrap flex-shrink-0">
                                      {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                    {m.lead_id ? (
                                      <Link href={`/leads/${m.lead_id}`} className="text-[11px] font-mono text-prospex-cyan hover:underline truncate">
                                        {m.lead_business}
                                      </Link>
                                    ) : (
                                      <span className="text-[11px] font-mono text-prospex-text truncate">{m.lead_business}</span>
                                    )}
                                    <ReplyChip status={m.reply_status} />
                                    {m.booked && <span className="text-[9px] font-mono text-prospex-green border border-prospex-green/40 rounded px-1.5 py-0.5">📅</span>}
                                  </div>
                                  {m.message_sent && (
                                    <p className="text-[10px] text-prospex-dim italic mt-1 line-clamp-2">
                                      &ldquo;{m.message_sent.slice(0, 160)}{m.message_sent.length > 160 ? '…' : ''}&rdquo;
                                    </p>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* DESKTOP — original 8-column table, hidden on mobile */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-xs min-w-[820px]">
                  <thead>
                    <tr className="table-header">
                      <th className="text-left px-3 py-2 font-mono text-[10px] text-prospex-dim uppercase w-6"></th>
                      <th className="text-left px-3 py-2 font-mono text-[10px] text-prospex-dim uppercase">Account</th>
                      <th className="text-right px-3 py-2 font-mono text-[10px] text-prospex-dim uppercase">Sent</th>
                      <th className="text-right px-3 py-2 font-mono text-[10px] text-prospex-dim uppercase">Replies</th>
                      <th className="text-right px-3 py-2 font-mono text-[10px] text-prospex-dim uppercase">🟢 Pos</th>
                      <th className="text-right px-3 py-2 font-mono text-[10px] text-prospex-dim uppercase">🔴 Neg</th>
                      <th className="text-right px-3 py-2 font-mono text-[10px] text-prospex-dim uppercase">Reply rate</th>
                      <th className="text-right px-3 py-2 font-mono text-[10px] text-prospex-dim uppercase">Today / target</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.by_account.map(a => {
                      const target = a.daily_target || a.daily_limit || 30;
                      const usePct = target > 0 ? Math.round((a.daily_sent_today / target) * 100) : 0;
                      const overCap = a.daily_limit > 0 && a.daily_sent_today >= a.daily_limit;
                      const barColor = overCap ? 'bg-prospex-red' : usePct >= 100 ? 'bg-prospex-green' : usePct >= 80 ? 'bg-prospex-cyan' : 'bg-prospex-cyan/60';
                      const replyRate = a.sent > 0 ? Math.round((a.window_replies / a.sent) * 1000) / 10 : 0;
                      const stageBadge = a.warmup_stage === 'new' ? '🆕' : a.warmup_stage === 'warming' ? `🔥d${a.warmup_days}` : a.warmup_stage === 'paused' ? '⏸' : '';
                      const isExpanded = expandedAccount === a.account;
                      const accountMessages = messagesByAccount.get(a.account) || [];
                      return (
                        <Fragment key={a.account}>
                          <tr className="table-row cursor-pointer" onClick={() => setExpandedAccount(isExpanded ? null : a.account)}>
                            <td className="px-3 py-2 text-prospex-dim">
                              {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                            </td>
                            <td className="px-3 py-2 text-prospex-text font-mono">
                              @{a.account}
                              {stageBadge && <span className="ml-1 text-[9px]" title={`Warmup stage: ${a.warmup_stage}`}>{stageBadge}</span>}
                            </td>
                            <td className="px-3 py-2 text-right font-mono text-prospex-cyan font-bold">{a.sent}</td>
                            <td className="px-3 py-2 text-right font-mono text-prospex-text">{a.window_replies}</td>
                            <td className="px-3 py-2 text-right font-mono text-prospex-green">{a.window_positive}</td>
                            <td className="px-3 py-2 text-right font-mono text-prospex-red/80">{a.window_negative}</td>
                            <td className="px-3 py-2 text-right font-mono text-prospex-muted">{replyRate}%</td>
                            <td className="px-3 py-2 text-right">
                              <div className="flex flex-col items-end gap-1">
                                <span className="text-[10px] font-mono" title={`Hard cap: ${a.daily_limit}`}>
                                  {a.daily_sent_today}/{target} · {usePct}%
                                </span>
                                <div className="w-24 h-1 bg-prospex-bg rounded-full">
                                  <div className={cn('h-1 rounded-full', barColor)} style={{ width: `${Math.min(100, usePct)}%` }} />
                                </div>
                              </div>
                            </td>
                          </tr>
                          {isExpanded && (
                            <tr>
                              <td colSpan={8} className="bg-prospex-bg/60 border-t border-prospex-border/50 px-3 py-3">
                                {accountMessages.length === 0 ? (
                                  <p className="text-[11px] text-prospex-dim italic">
                                    No individual messages in this window. (This account&apos;s totals above may come from an older log format.)
                                  </p>
                                ) : (
                                  <div className="space-y-1.5 max-h-[400px] overflow-y-auto">
                                    <p className="text-[10px] font-mono text-prospex-dim uppercase mb-2">
                                      Messages from @{a.account} · {accountMessages.length} shown
                                    </p>
                                    {accountMessages.map((m, i) => (
                                      <div key={`${m.lead_id}-${m.created_at}-${i}`}
                                        className="flex items-start gap-2 py-1.5 border-b border-prospex-border/20 last:border-0">
                                        <span className="text-[9px] font-mono text-prospex-dim mt-0.5 whitespace-nowrap flex-shrink-0">
                                          {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                        <div className="flex-1 min-w-0">
                                          <div className="flex items-center gap-2 flex-wrap">
                                            {m.lead_id ? (
                                              <Link href={`/leads/${m.lead_id}`} className="text-[11px] font-mono text-prospex-cyan hover:underline truncate">
                                                {m.lead_business}
                                              </Link>
                                            ) : (
                                              <span className="text-[11px] font-mono text-prospex-text truncate">{m.lead_business}</span>
                                            )}
                                            <span className="text-[9px] text-prospex-dim font-mono">· {m.stage}</span>
                                            <ReplyChip status={m.reply_status} />
                                            {m.booked && <span className="text-[9px] font-mono text-prospex-green border border-prospex-green/40 rounded px-1.5 py-0.5">📅 booked</span>}
                                          </div>
                                          {m.message_sent && (
                                            <p className="text-[10px] text-prospex-dim italic mt-0.5 line-clamp-2">
                                              &ldquo;{m.message_sent.slice(0, 200)}{m.message_sent.length > 200 ? '…' : ''}&rdquo;
                                            </p>
                                          )}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              </>
            )}
          </div>

          {/* Row 3: by-day chart + channel + stage */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {/* By day mini chart */}
            <div className="card p-4">
              <h2 className="text-xs font-mono text-prospex-dim uppercase tracking-wider mb-3">Sends Per Day</h2>
              {data.by_day.length === 0 ? (
                <p className="text-xs text-prospex-dim py-4 text-center">No sends recorded in this window.</p>
              ) : (
                <div className="flex items-end gap-1 h-32">
                  {data.by_day.map(d => {
                    const h = Math.max(4, Math.round((d.sent / daySeriesMax) * 100));
                    return (
                      <div key={d.date} className="flex-1 flex flex-col items-center gap-1" title={`${d.date}: ${d.sent} sends`}>
                        <div className="w-full bg-prospex-cyan/50 rounded-t" style={{ height: `${h}%` }} />
                        <span className="text-[8px] text-prospex-dim font-mono">{d.date.slice(5)}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* By channel + stage */}
            <div className="card p-4 space-y-3">
              <div>
                <h2 className="text-xs font-mono text-prospex-dim uppercase tracking-wider mb-2">By Channel</h2>
                {data.by_channel.length === 0 ? (
                  <p className="text-xs text-prospex-dim">—</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {data.by_channel.map(c => (
                      <span key={c.channel} className="badge text-[10px] bg-prospex-bg border-prospex-border text-prospex-text">
                        {c.channel === 'instagram' ? '📷' : c.channel === 'whatsapp' ? '💬' : c.channel === 'sms' ? '📱' : '•'} {c.channel}: {c.sent}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <h2 className="text-xs font-mono text-prospex-dim uppercase tracking-wider mb-2">By Stage</h2>
                {data.by_stage.length === 0 ? (
                  <p className="text-xs text-prospex-dim">—</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {data.by_stage.map(s => (
                      <span key={s.stage} className="badge text-[10px] bg-prospex-bg border-prospex-border text-prospex-text">
                        {s.stage}: {s.sent}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              {/* Per-operator (multi-user attribution) — only renders when
                  logs are attributed to a real team member. Anonymous
                  'manual' logs are excluded from the count server-side. */}
              {data.by_operator && data.by_operator.length > 0 && (
                <div>
                  <h2 className="text-xs font-mono text-prospex-dim uppercase tracking-wider mb-2 flex items-center gap-2">
                    👤 By Operator <span className="text-[9px] text-prospex-dim normal-case">— who sent what</span>
                  </h2>
                  <div className="space-y-1.5">
                    {data.by_operator.map((o, i) => {
                      const pct = data.funnel.sent > 0 ? Math.round((o.sent / data.funnel.sent) * 100) : 0;
                      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`;
                      return (
                        <div key={o.operator} className="flex items-center gap-2">
                          <span className="text-[10px] font-mono text-prospex-dim w-8 flex-shrink-0">{medal}</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between text-[11px]">
                              <span className="text-prospex-text font-mono truncate">{o.operator}</span>
                              <span className="text-prospex-cyan font-mono font-bold flex-shrink-0 ml-2">{o.sent}</span>
                            </div>
                            <div className="w-full h-1 bg-prospex-bg rounded-full">
                              <div className="h-1 bg-prospex-cyan/60 rounded-full" style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Cross-links */}
          <div className="card p-3 flex flex-wrap items-center gap-3 text-[10px] text-prospex-muted">
            <span>Related:</span>
            <Link href="/leads" className="text-prospex-cyan hover:underline flex items-center gap-1">Leads <ExternalLink className="w-2.5 h-2.5" /></Link>
            <Link href="/outreach-analytics" className="text-prospex-cyan hover:underline flex items-center gap-1">Outreach Analytics <ExternalLink className="w-2.5 h-2.5" /></Link>
            <Link href="/dm-campaigns" className="text-prospex-cyan hover:underline flex items-center gap-1">DM Campaigns <ExternalLink className="w-2.5 h-2.5" /></Link>
            <Link href="/follow-ups" className="text-prospex-cyan hover:underline flex items-center gap-1">Follow-Ups <ExternalLink className="w-2.5 h-2.5" /></Link>
          </div>
        </>
      ) : null}

      <PostEodPreviewModal isOpen={showEodPreview} onClose={() => setShowEodPreview(false)} onPosted={onEodPosted} />
    </div>
  );
}
