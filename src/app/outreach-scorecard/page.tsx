'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import {
  Trophy, Send, MessageCircle, ThumbsUp, ThumbsDown, Meh, CalendarCheck,
  Loader2, RefreshCw, TrendingUp, TrendingDown, Instagram, Phone, Filter,
  ExternalLink,
} from 'lucide-react';
import { cn } from '@/lib/utils';

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
  by_account: Array<{ account: string; sent: number; daily_sent_today: number; daily_limit: number; total_sent: number; total_replies: number }>;
  by_day: Array<{ date: string; sent: number }>;
  by_channel: Array<{ channel: string; sent: number }>;
  by_stage: Array<{ stage: string; sent: number }>;
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
        <button onClick={load} className="btn-ghost text-xs w-fit">
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} Refresh
        </button>
      </div>

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
              <div className="overflow-x-auto">
                <table className="w-full text-xs min-w-[560px]">
                  <thead>
                    <tr className="table-header">
                      <th className="text-left px-3 py-2 font-mono text-[10px] text-prospex-dim uppercase">Account</th>
                      <th className="text-right px-3 py-2 font-mono text-[10px] text-prospex-dim uppercase">Sent (window)</th>
                      <th className="text-right px-3 py-2 font-mono text-[10px] text-prospex-dim uppercase">Today used / limit</th>
                      <th className="text-right px-3 py-2 font-mono text-[10px] text-prospex-dim uppercase">All-time sent</th>
                      <th className="text-right px-3 py-2 font-mono text-[10px] text-prospex-dim uppercase">All-time replies</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.by_account.map(a => {
                      const usePct = a.daily_limit > 0 ? Math.round((a.daily_sent_today / a.daily_limit) * 100) : 0;
                      const barColor = usePct >= 100 ? 'bg-prospex-red' : usePct >= 80 ? 'bg-amber-400' : 'bg-prospex-cyan';
                      return (
                        <tr key={a.account} className="table-row">
                          <td className="px-3 py-2 text-prospex-text font-mono">@{a.account}</td>
                          <td className="px-3 py-2 text-right font-mono text-prospex-cyan font-bold">{a.sent}</td>
                          <td className="px-3 py-2 text-right">
                            <div className="flex flex-col items-end gap-1">
                              <span className="text-[10px] font-mono">{a.daily_sent_today}/{a.daily_limit} · {usePct}%</span>
                              <div className="w-24 h-1 bg-prospex-bg rounded-full">
                                <div className={cn('h-1 rounded-full', barColor)} style={{ width: `${usePct}%` }} />
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-prospex-muted">{a.total_sent}</td>
                          <td className="px-3 py-2 text-right font-mono text-prospex-green">{a.total_replies}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
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
    </div>
  );
}
