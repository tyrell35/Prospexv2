'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Target, RefreshCw, Loader2, CheckCircle2, Flame, Clock, MessageSquare,
  ExternalLink, Instagram, ChevronRight, TrendingUp, Inbox,
} from 'lucide-react';
import { cn, getScoreColor } from '@/lib/utils';
import { DM_OUTCOMES, DM_OUTCOME_BY_ID, type DmOutcome } from '@/lib/dm-outcomes';
import { getInstagramDMUrl } from '@/lib/utils';

// ═══════════════════════════════════════════════════════════════
// DAILY — the accountability surface
//
// One page answering: am I on target, and what came back from what
// I already sent. The review queue is the important half — before
// it existed, 358 sends produced zero recorded replies.
// ═══════════════════════════════════════════════════════════════

interface Summary {
  today: string;
  yesterday: { sent: number; target: number; hit: boolean; pct: number };
  today_so_far: { sent: number; target: number; pct: number; remaining: number };
  review_queue: { total: number; due_now: number; over_a_week: number };
  awaiting_action: { positive_replies: number; follow_ups_due: number; callbacks_due: number };
  rolling: { last_7_sent: number; last_7_avg: number; days_active_7: number; streak: number };
  capacity: { warm_accounts: number; daily_ceiling: number };
  operators: Array<{ operator: string; sent_yesterday: number; target: number }>;
}

interface QueueLead {
  id: string;
  business_name: string;
  city: string | null;
  country_code: string | null;
  instagram_handle: string | null;
  instagram_url: string | null;
  lead_score: number | null;
  owner_name: string | null;
  last_outreach_at: string | null;
  dm_review_due: string | null;
  outreach_dm_text: string | null;
}

const QUICK: DmOutcome[] = ['no_reply', 'replied', 'interested', 'not_interested', 'has_agency', 'is_client'];

export default function DailyPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [queue, setQueue] = useState<QueueLead[]>([]);
  const [totalDue, setTotalDue] = useState(0);
  const [loading, setLoading] = useState(true);
  const [marking, setMarking] = useState<string | null>(null);
  const [cleared, setCleared] = useState(0);
  const [bulking, setBulking] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [sRes, qRes] = await Promise.all([
        fetch('/api/daily-nudge', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'get' }) }),
        fetch('/api/dm-review', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'get_queue', limit: 60 }) }),
      ]);
      const s = await sRes.json();
      const q = await qRes.json();
      setSummary(s.summary || null);
      setQueue(q.leads || []);
      setTotalDue(q.total_due || 0);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const mark = async (lead: QueueLead, outcome: DmOutcome) => {
    if (marking) return;
    setMarking(lead.id);
    try {
      const res = await fetch('/api/dm-review', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'mark', lead_id: lead.id, outcome }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed');
      setQueue(prev => prev.filter(l => l.id !== lead.id));
      setTotalDue(n => Math.max(0, n - 1));
      setCleared(n => n + 1);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Could not record that');
    } finally { setMarking(null); }
  };

  /** Clear the visible batch as "still nothing back" — the common case. */
  const clearVisible = async () => {
    if (queue.length === 0 || bulking) return;
    if (!confirm(`Mark all ${queue.length} shown as no reply yet?\n\nEach gets a follow-up scheduled in 3 days. Anything that actually replied should be marked individually first.`)) return;
    setBulking(true);
    try {
      const ids = queue.map(l => l.id);
      const res = await fetch('/api/dm-review', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'bulk_no_reply', lead_ids: ids }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      setCleared(n => n + ids.length);
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Could not clear those');
    } finally { setBulking(false); }
  };

  const age = (iso: string | null) => {
    if (!iso) return '—';
    const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400_000);
    if (d < 1) return 'today';
    if (d === 1) return '1 day';
    if (d < 30) return `${d} days`;
    return `${Math.floor(d / 30)} mo`;
  };

  if (loading && !summary) {
    return <div className="flex items-center justify-center min-h-[60vh]">
      <div className="w-8 h-8 border-2 border-prospex-cyan/30 border-t-prospex-cyan rounded-full animate-spin" />
    </div>;
  }

  const t = summary?.today_so_far;
  const y = summary?.yesterday;

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl md:text-2xl font-mono font-bold text-prospex-text flex items-center gap-3">
            <Target className="w-5 h-5 md:w-6 md:h-6 text-prospex-cyan" />Daily
          </h1>
          <p className="text-sm text-prospex-dim mt-1">Where you are against today&apos;s target, and what came back from what you already sent.</p>
        </div>
        <button onClick={load} className="btn-ghost text-sm border border-prospex-border">
          <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
        </button>
      </div>

      {/* ── Target ── */}
      {t && y && (
        <div className="card p-4">
          <div className="flex items-end justify-between gap-3 flex-wrap mb-2">
            <div>
              <p className="text-[10px] font-mono uppercase tracking-wider text-prospex-dim">Today</p>
              <p className="text-3xl font-mono font-bold text-prospex-text">
                {t.sent}<span className="text-prospex-dim text-lg">/{t.target}</span>
              </p>
            </div>
            <div className="text-right">
              <p className={cn('text-sm font-mono', y.hit ? 'text-prospex-green' : 'text-amber-300')}>
                {y.hit ? '✅' : '⚠️'} Yesterday {y.sent}/{y.target}
              </p>
              {summary && summary.rolling.streak > 1 && (
                <p className="text-[11px] font-mono text-prospex-green mt-0.5">
                  <Flame className="w-3 h-3 inline" /> {summary.rolling.streak}-day streak
                </p>
              )}
            </div>
          </div>

          <div className="h-2.5 rounded-full bg-prospex-bg overflow-hidden">
            <div className={cn('h-full rounded-full transition-all',
              t.pct >= 100 ? 'bg-prospex-green' : t.pct >= 50 ? 'bg-prospex-cyan' : 'bg-amber-500')}
              style={{ width: `${Math.min(100, t.pct)}%` }} />
          </div>

          <div className="flex items-center justify-between gap-2 mt-2 flex-wrap">
            <p className="text-xs text-prospex-muted">
              {t.remaining > 0 ? `${t.remaining} to go` : 'Target hit — anything now is ahead.'}
            </p>
            {summary && (
              <p className="text-[10px] font-mono text-prospex-dim">
                7-day: {summary.rolling.last_7_sent} sent over {summary.rolling.days_active_7}/7 active days
                {' · '}capacity {summary.capacity.daily_ceiling}/day
              </p>
            )}
          </div>
        </div>
      )}

      {/* ── What needs doing ── */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <Tile icon={Inbox}    label="To review"   value={summary.review_queue.due_now} tone={summary.review_queue.due_now > 0 ? 'amber' : undefined}
                hint="Messaged over 48h ago and never checked for a reply" />
          <Tile icon={Flame}    label="Interested"  value={summary.awaiting_action.positive_replies} tone={summary.awaiting_action.positive_replies > 0 ? 'green' : undefined}
                hint="Said yes, not yet booked" href="/leads" />
          <Tile icon={Clock}    label="Follow-ups"  value={summary.awaiting_action.follow_ups_due}
                hint="No reply after 3 days" href="/follow-ups" />
          <Tile icon={MessageSquare} label="Callbacks" value={summary.awaiting_action.callbacks_due}
                hint="Promised a call back today" href="/call-pipeline" />
        </div>
      )}

      {/* ── Review queue ── */}
      <div className="card">
        <div className="flex items-center justify-between gap-2 p-3 border-b border-prospex-border flex-wrap">
          <div>
            <h2 className="text-sm font-mono font-semibold text-prospex-text">Did they reply?</h2>
            <p className="text-[11px] text-prospex-dim mt-0.5">
              {totalDue > 0
                ? `${totalDue} waiting · showing the ${queue.length} oldest`
                : 'Nothing waiting — every send has been checked.'}
              {summary && summary.review_queue.over_a_week > 0 && (
                <span className="text-amber-300"> · {summary.review_queue.over_a_week} over a week old</span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {cleared > 0 && <span className="text-[11px] font-mono text-prospex-green">{cleared} cleared</span>}
            {queue.length > 0 && (
              <button onClick={clearVisible} disabled={bulking} className="btn-ghost text-xs border border-prospex-border disabled:opacity-50">
                {bulking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                All {queue.length} — no reply
              </button>
            )}
          </div>
        </div>

        {queue.length === 0 ? (
          <div className="p-8 text-center">
            <CheckCircle2 className="w-7 h-7 text-prospex-green mx-auto mb-2" />
            <p className="text-sm text-prospex-muted">Queue clear.</p>
          </div>
        ) : (
          <div className="divide-y divide-prospex-border/50">
            {queue.map(lead => (
              <div key={lead.id} className={cn('p-3', marking === lead.id && 'opacity-50')}>
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Link href={`/leads/${lead.id}`} className="text-sm font-medium text-prospex-text hover:text-prospex-cyan">
                        {lead.business_name}
                      </Link>
                      {lead.lead_score != null && (
                        <span className={cn('text-xs font-mono font-bold', getScoreColor(lead.lead_score))}>{lead.lead_score}</span>
                      )}
                      <span className="text-[10px] font-mono text-prospex-dim">
                        sent {age(lead.last_outreach_at)} ago
                      </span>
                    </div>
                    <p className="text-[11px] text-prospex-dim mt-0.5">
                      {lead.owner_name && <span className="text-prospex-muted">{lead.owner_name} · </span>}
                      {lead.city}{lead.country_code ? `, ${lead.country_code}` : ''}
                    </p>
                  </div>

                  {(lead.instagram_handle || lead.instagram_url) && (
                    <a href={getInstagramDMUrl(lead.instagram_handle || lead.instagram_url || '')}
                      target="_blank" rel="noopener noreferrer"
                      className="btn-ghost text-xs border border-prospex-border shrink-0"
                      title="Open the conversation on Instagram to check">
                      <Instagram className="w-3.5 h-3.5" />Open DM<ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>

                <div className="flex flex-wrap gap-1.5 mt-2">
                  {QUICK.map(id => {
                    const cfg = DM_OUTCOME_BY_ID[id];
                    return (
                      <button key={id} onClick={() => mark(lead, id)} disabled={!!marking}
                        title={cfg.hint}
                        className={cn('text-[11px] font-mono px-2 py-1 rounded-lg border transition-all disabled:opacity-40', cfg.color)}>
                        {cfg.emoji} {cfg.label}
                      </button>
                    );
                  })}
                  <select value="" disabled={!!marking}
                    onChange={e => { if (e.target.value) mark(lead, e.target.value as DmOutcome); e.target.value = ''; }}
                    className="text-[11px] font-mono bg-prospex-bg border border-prospex-border rounded-lg px-2 py-1 text-prospex-dim hover:text-prospex-text cursor-pointer">
                    <option value="">more…</option>
                    {DM_OUTCOMES.filter(o => !QUICK.includes(o.id)).map(o => (
                      <option key={o.id} value={o.id}>{o.emoji} {o.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {summary && summary.operators.length > 0 && (
        <div className="card p-3">
          <p className="text-[10px] font-mono uppercase tracking-wider text-prospex-dim mb-2 inline-flex items-center gap-1">
            <TrendingUp className="w-3 h-3" />Yesterday by operator
          </p>
          <div className="space-y-1">
            {summary.operators.map(o => (
              <div key={o.operator} className="flex items-center justify-between text-xs font-mono">
                <span className="text-prospex-muted truncate">{o.operator}</span>
                <span className={cn(o.sent_yesterday >= o.target ? 'text-prospex-green' : 'text-amber-300')}>
                  {o.sent_yesterday}/{o.target}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Tile({ icon: Icon, label, value, hint, tone, href }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string; value: number; hint: string;
  tone?: 'amber' | 'green'; href?: string;
}) {
  const inner = (
    <div className="card p-2.5 h-full" title={hint}>
      <p className="text-[9px] font-mono uppercase tracking-wider text-prospex-dim inline-flex items-center gap-1">
        <Icon className="w-3 h-3" />{label}
      </p>
      <p className={cn('text-xl font-mono font-bold mt-0.5 inline-flex items-center gap-1',
        tone === 'green' ? 'text-prospex-green' : tone === 'amber' ? 'text-amber-300' : 'text-prospex-text')}>
        {value}
        {href && value > 0 && <ChevronRight className="w-3.5 h-3.5 opacity-50" />}
      </p>
    </div>
  );
  return href && value > 0 ? <Link href={href}>{inner}</Link> : inner;
}
