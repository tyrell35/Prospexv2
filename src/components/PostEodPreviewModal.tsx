'use client';

import { useEffect, useState } from 'react';
import {
  X, Send, Loader2, ThumbsUp, ThumbsDown, MessageCircle, Instagram, Phone,
  Sparkles, Slack, Check, AlertCircle, RefreshCw, Flame, Snowflake, Pause,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ═══════════════════════════════════════════════════════
// Preview of the EOD Slack post — same data that will be sent, rendered
// in clean UI so the operator can eyeball totals, per-account, and the
// attributed positive replies BEFORE it lands in Slack. Optional "note"
// field prepends a one-line context message to the post.
// ═══════════════════════════════════════════════════════

interface Summary {
  date: string;
  totals: { sent: number; drafts: number; blocked: number; unsent: number };
  by_channel: Record<string, number>;
  by_account: Array<{
    account: string; sent: number; used: number; limit: number; target: number; pct: number;
    stage: string; replies_today: number; positive_today: number; negative_today: number;
  }>;
  by_stage: Record<string, number>;
  by_operator?: Array<{ operator: string; sent: number }>;
  positive_replies: Array<{
    lead_business: string; sender_account: string; channel: string;
    message_sent: string; responded_at: string;
  }>;
  reply_totals: { replies: number; positive: number; negative: number; neutral: number };
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onPosted?: () => void;
}

function StageBadge({ stage }: { stage: string }) {
  const cfg = {
    new:     { icon: <Snowflake className="w-2.5 h-2.5" />, cls: 'text-prospex-dim border-prospex-border',       label: 'new' },
    warming: { icon: <Flame className="w-2.5 h-2.5" />,     cls: 'text-amber-400 border-amber-500/40',           label: 'warming' },
    warm:    { icon: <Flame className="w-2.5 h-2.5" />,     cls: 'text-prospex-green border-prospex-green/40',   label: 'warm' },
    paused:  { icon: <Pause className="w-2.5 h-2.5" />,     cls: 'text-prospex-red border-prospex-red/40',       label: 'paused' },
  }[stage] || { icon: null, cls: 'text-prospex-dim border-prospex-border', label: stage };
  return (
    <span className={cn('inline-flex items-center gap-1 text-[9px] font-mono px-1.5 py-0.5 rounded border', cfg.cls)}>
      {cfg.icon} {cfg.label}
    </span>
  );
}

function channelIcon(ch: string) {
  if (ch === 'instagram') return '📷';
  if (ch === 'whatsapp')  return '💬';
  if (ch === 'sms')       return '📱';
  return '•';
}

export default function PostEodPreviewModal({ isOpen, onClose, onPosted }: Props) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(false);
  const [posting, setPosting] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [posted, setPosted] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/outreach-eod');
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Failed to load summary');
      setSummary(data.summary);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Load failed');
    } finally { setLoading(false); }
  };

  useEffect(() => {
    if (isOpen) {
      setPosted(false);
      setNote('');
      setError(null);
      load();
    }
  }, [isOpen]);

  const handlePost = async () => {
    setPosting(true);
    setError(null);
    try {
      const res = await fetch('/api/outreach-eod', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'post_slack', note: note.trim() || undefined }),
      });
      const data = await res.json();
      if (!data.success || !data.posted) throw new Error(data.error || 'Slack post failed (check SLACK_BOT_TOKEN + channel access)');
      setPosted(true);
      onPosted?.();
      setTimeout(() => { onClose(); }, 1200);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Post failed');
    } finally { setPosting(false); }
  };

  if (!isOpen) return null;

  const total = summary ? summary.totals.sent + summary.totals.drafts + summary.totals.blocked + summary.totals.unsent : 0;
  const dateLabel = summary ? new Date(summary.date).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' }) : '';

  // Per-account leaderboard by positive replies then by sends
  const accountsRanked = summary
    ? [...summary.by_account].sort((a, b) =>
        (b.positive_today - a.positive_today)
        || (b.replies_today - a.replies_today)
        || (b.sent - a.sent))
    : [];

  return (
    <div className="fixed inset-0 bg-black/70 z-[200] flex items-center justify-center p-4" onClick={onClose}>
      <div className="card bg-prospex-surface max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col border-prospex-cyan/40" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="p-4 border-b border-prospex-border flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2">
            <Slack className="w-5 h-5 text-prospex-cyan" />
            <div>
              <h2 className="text-sm font-mono font-bold text-prospex-text">EOD Slack Preview</h2>
              <p className="text-[10px] text-prospex-dim">{dateLabel || 'Today'} · sending to #sdr channel</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={load} disabled={loading} className="text-prospex-dim hover:text-prospex-text p-1.5 rounded disabled:opacity-40" title="Refresh preview">
              <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
            </button>
            <button onClick={onClose} className="text-prospex-dim hover:text-prospex-text p-1.5 rounded" title="Close">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {loading && !summary ? (
            <div className="py-12 text-center"><Loader2 className="w-6 h-6 animate-spin text-prospex-cyan mx-auto" /></div>
          ) : !summary || total === 0 ? (
            <div className="py-12 text-center">
              <MessageCircle className="w-8 h-8 text-prospex-dim mx-auto mb-3" />
              <p className="text-sm text-prospex-muted">No outreach logged today.</p>
              <p className="text-[11px] text-prospex-dim mt-1">Posting an empty digest to Slack isn&apos;t useful — cancel and check back later.</p>
            </div>
          ) : (
            <>
              {/* Optional note field */}
              <div>
                <label className="text-[10px] font-mono text-prospex-dim uppercase block mb-1">Add a note (optional)</label>
                <input
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  placeholder="e.g. Big morning — 2 closes from @acme cold outreach"
                  maxLength={200}
                  className="input w-full text-xs"
                />
                {note && (
                  <p className="text-[9px] text-prospex-dim mt-1">
                    Will appear at the top of the Slack post as: <span className="italic">📝 &ldquo;{note}&rdquo;</span>
                  </p>
                )}
              </div>

              {/* Totals row */}
              <div>
                <p className="text-[10px] font-mono text-prospex-dim uppercase mb-2">Totals</p>
                <div className="grid grid-cols-4 gap-2">
                  <div className="bg-prospex-bg rounded-lg p-2.5 border border-prospex-cyan/20">
                    <p className="text-[9px] text-prospex-dim uppercase font-mono">Sent</p>
                    <p className="text-xl font-mono font-bold text-prospex-cyan">{summary.totals.sent}</p>
                  </div>
                  <div className="bg-prospex-bg rounded-lg p-2.5 border border-amber-500/20">
                    <p className="text-[9px] text-prospex-dim uppercase font-mono">Drafts</p>
                    <p className="text-xl font-mono font-bold text-amber-400">{summary.totals.drafts}</p>
                  </div>
                  <div className="bg-prospex-bg rounded-lg p-2.5 border border-prospex-red/20">
                    <p className="text-[9px] text-prospex-dim uppercase font-mono">Blocked</p>
                    <p className="text-xl font-mono font-bold text-prospex-red">{summary.totals.blocked}</p>
                  </div>
                  <div className="bg-prospex-bg rounded-lg p-2.5 border border-prospex-border">
                    <p className="text-[9px] text-prospex-dim uppercase font-mono">Unsent</p>
                    <p className="text-xl font-mono font-bold text-prospex-muted">{summary.totals.unsent}</p>
                  </div>
                </div>
              </div>

              {/* Reply totals row */}
              <div>
                <p className="text-[10px] font-mono text-prospex-dim uppercase mb-2">Replies</p>
                <div className="grid grid-cols-4 gap-2">
                  <div className="bg-prospex-bg rounded-lg p-2.5 border border-prospex-border">
                    <p className="text-[9px] text-prospex-dim uppercase font-mono flex items-center gap-1"><MessageCircle className="w-2.5 h-2.5" /> Total</p>
                    <p className="text-xl font-mono font-bold text-prospex-text">{summary.reply_totals.replies}</p>
                  </div>
                  <div className="bg-prospex-bg rounded-lg p-2.5 border border-prospex-green/30">
                    <p className="text-[9px] text-prospex-dim uppercase font-mono flex items-center gap-1"><ThumbsUp className="w-2.5 h-2.5" /> Positive</p>
                    <p className="text-xl font-mono font-bold text-prospex-green">{summary.reply_totals.positive}</p>
                  </div>
                  <div className="bg-prospex-bg rounded-lg p-2.5 border border-prospex-red/30">
                    <p className="text-[9px] text-prospex-dim uppercase font-mono flex items-center gap-1"><ThumbsDown className="w-2.5 h-2.5" /> Negative</p>
                    <p className="text-xl font-mono font-bold text-prospex-red">{summary.reply_totals.negative}</p>
                  </div>
                  <div className="bg-prospex-bg rounded-lg p-2.5 border border-amber-500/20">
                    <p className="text-[9px] text-prospex-dim uppercase font-mono">Neutral</p>
                    <p className="text-xl font-mono font-bold text-amber-400">{summary.reply_totals.neutral}</p>
                  </div>
                </div>
              </div>

              {/* By channel chips */}
              {Object.entries(summary.by_channel).length > 0 && (
                <div>
                  <p className="text-[10px] font-mono text-prospex-dim uppercase mb-2">By channel</p>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(summary.by_channel).map(([c, n]) => (
                      <span key={c} className="text-[11px] font-mono bg-prospex-bg border border-prospex-border rounded px-2 py-1">
                        {channelIcon(c)} {c}: <span className="text-prospex-cyan font-bold">{n}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Per-account leaderboard */}
              {accountsRanked.length > 0 && (
                <div>
                  <p className="text-[10px] font-mono text-prospex-dim uppercase mb-2 flex items-center gap-2">
                    <Instagram className="w-2.5 h-2.5 text-pink-400" /> Per-account (ranked by 🟢 positive replies)
                  </p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-[11px] min-w-[540px]">
                      <thead>
                        <tr className="border-b border-prospex-border">
                          <th className="text-left px-2 py-1.5 font-mono text-[9px] text-prospex-dim uppercase">Account</th>
                          <th className="text-left px-2 py-1.5 font-mono text-[9px] text-prospex-dim uppercase">Stage</th>
                          <th className="text-right px-2 py-1.5 font-mono text-[9px] text-prospex-dim uppercase">Sent / target</th>
                          <th className="text-right px-2 py-1.5 font-mono text-[9px] text-prospex-dim uppercase">Replies</th>
                          <th className="text-right px-2 py-1.5 font-mono text-[9px] text-prospex-dim uppercase">🟢</th>
                          <th className="text-right px-2 py-1.5 font-mono text-[9px] text-prospex-dim uppercase">🔴</th>
                        </tr>
                      </thead>
                      <tbody>
                        {accountsRanked.map(a => (
                          <tr key={a.account} className="border-b border-prospex-border/30">
                            <td className="px-2 py-1.5 font-mono text-prospex-text">@{a.account}</td>
                            <td className="px-2 py-1.5"><StageBadge stage={a.stage} /></td>
                            <td className="px-2 py-1.5 text-right font-mono">
                              <span className={a.used >= a.limit ? 'text-prospex-red' : a.used >= a.target ? 'text-prospex-green' : 'text-prospex-text'}>
                                {a.used}/{a.target}
                              </span>
                              <span className="text-prospex-dim text-[9px]"> · {a.pct}%</span>
                            </td>
                            <td className="px-2 py-1.5 text-right font-mono text-prospex-text">{a.replies_today}</td>
                            <td className="px-2 py-1.5 text-right font-mono text-prospex-green font-bold">{a.positive_today}</td>
                            <td className="px-2 py-1.5 text-right font-mono text-prospex-red/80">{a.negative_today}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Per-operator leaderboard — mirrors what Slack will show.
                  Only appears when there are attributed operators. */}
              {summary.by_operator && summary.by_operator.length > 0 && (
                <div>
                  <p className="text-[10px] font-mono text-prospex-dim uppercase mb-2 flex items-center gap-2">
                    👤 By Operator · {summary.by_operator.length}
                    <span className="text-[9px] normal-case">— team leaderboard shown in Slack</span>
                  </p>
                  <div className="space-y-1.5">
                    {summary.by_operator.map((op, i) => {
                      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`;
                      const pct = summary.totals.sent > 0 ? Math.round((op.sent / summary.totals.sent) * 100) : 0;
                      return (
                        <div key={op.operator} className="flex items-center gap-2">
                          <span className="text-[10px] font-mono text-prospex-dim w-8 flex-shrink-0">{medal}</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between text-[11px]">
                              <span className="text-prospex-text font-mono truncate">{op.operator}</span>
                              <span className="text-prospex-cyan font-mono font-bold flex-shrink-0 ml-2">{op.sent} · {pct}%</span>
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

              {/* Positive replies (this is the "which account got the wins" section) */}
              {summary.positive_replies.length > 0 && (
                <div>
                  <p className="text-[10px] font-mono uppercase mb-2 flex items-center gap-2 text-prospex-green">
                    <Sparkles className="w-2.5 h-2.5" /> Positive replies · {summary.positive_replies.length}
                    <span className="text-[9px] text-prospex-dim normal-case">— shown in Slack as attributed wins</span>
                  </p>
                  <div className="space-y-1.5">
                    {summary.positive_replies.slice(0, 10).map((r, i) => (
                      <div key={`${r.lead_business}-${r.responded_at}-${i}`}
                        className="p-2 bg-prospex-green/5 border border-prospex-green/20 rounded">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-[11px] font-mono text-prospex-text font-bold truncate">
                              {channelIcon(r.channel)} {r.lead_business}
                            </p>
                            <p className="text-[10px] text-prospex-dim">
                              from <span className="text-prospex-cyan font-mono">@{r.sender_account}</span>
                            </p>
                            {r.message_sent && (
                              <p className="text-[10px] text-prospex-dim italic mt-1 line-clamp-2">
                                &ldquo;{r.message_sent.slice(0, 160)}{r.message_sent.length > 160 ? '…' : ''}&rdquo;
                              </p>
                            )}
                          </div>
                          <span className="text-[9px] font-mono text-prospex-dim flex-shrink-0">
                            {new Date(r.responded_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      </div>
                    ))}
                    {summary.positive_replies.length > 10 && (
                      <p className="text-[10px] text-prospex-dim italic">
                        + {summary.positive_replies.length - 10} more — Slack post shows top 8.
                      </p>
                    )}
                  </div>
                </div>
              )}

              {summary.positive_replies.length === 0 && summary.reply_totals.replies === 0 && (
                <div className="p-3 bg-prospex-bg border border-prospex-border rounded-lg">
                  <p className="text-[11px] text-prospex-dim">
                    No replies logged today yet. The Slack post will still show sends and per-account totals — helpful for the outflow KPI.
                  </p>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-prospex-border flex items-center justify-between flex-shrink-0">
          {error && (
            <div className="flex items-center gap-2 text-[11px] text-prospex-red flex-1 min-w-0">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
              <span className="truncate">{error}</span>
            </div>
          )}
          {!error && posted && (
            <div className="flex items-center gap-2 text-[11px] text-prospex-green flex-1">
              <Check className="w-3.5 h-3.5" /> Posted to Slack
            </div>
          )}
          {!error && !posted && <div className="flex-1" />}

          <div className="flex items-center gap-2 flex-shrink-0">
            <button onClick={onClose} className="btn-ghost text-xs">Cancel</button>
            <button
              onClick={handlePost}
              disabled={posting || loading || !summary || total === 0 || posted}
              className="btn-primary text-xs disabled:opacity-50 flex items-center gap-1.5"
            >
              {posting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : posted ? <Check className="w-3.5 h-3.5" /> : <Send className="w-3.5 h-3.5" />}
              {posted ? 'Sent' : posting ? 'Posting…' : 'Confirm & Post'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
