'use client';

import { useEffect, useState } from 'react';
import { Send, RefreshCw, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Summary {
  date: string;
  totals: { sent: number; drafts: number; blocked: number; unsent: number };
  by_channel: Record<string, number>;
  by_account: Array<{ account: string; sent: number; used: number; limit: number; pct: number }>;
}

// Live view of today's outreach — 1-liner strip you can drop anywhere.
export default function TodaysDmsStrip({ className }: { className?: string }) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [postedFlash, setPostedFlash] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/outreach-eod');
      const data = await res.json();
      if (data.success) setSummary(data.summary);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const postSlack = async () => {
    setPosting(true);
    try {
      const res = await fetch('/api/outreach-eod', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'post_slack' }),
      });
      const data = await res.json();
      if (data.success && data.posted) {
        setPostedFlash(true);
        setTimeout(() => setPostedFlash(false), 2500);
      }
    } finally { setPosting(false); }
  };

  if (loading) {
    return (
      <div className={cn('card p-2.5 flex items-center gap-2', className)}>
        <Loader2 className="w-3.5 h-3.5 animate-spin text-prospex-dim" />
        <span className="text-[10px] text-prospex-dim">Loading today&apos;s activity…</span>
      </div>
    );
  }

  const nothing = !summary || (summary.totals.sent + summary.totals.drafts + summary.totals.blocked + summary.totals.unsent) === 0;

  return (
    <div className={cn('card p-2.5', className)}>
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1.5">
          <Send className="w-3.5 h-3.5 text-prospex-cyan" />
          <span className="text-[10px] font-mono text-prospex-dim uppercase">Today</span>
        </div>

        {nothing ? (
          <span className="text-[11px] text-prospex-dim">Nothing sent yet.</span>
        ) : (
          <>
            <span className="text-xs font-mono">
              <span className="text-prospex-green font-bold">{summary!.totals.sent}</span>
              <span className="text-prospex-dim"> sent</span>
              {summary!.totals.drafts > 0 && (<span className="text-amber-400 ml-2">· {summary!.totals.drafts} drafts</span>)}
              {summary!.totals.blocked > 0 && (<span className="text-prospex-red ml-2">· {summary!.totals.blocked} blocked</span>)}
            </span>

            {summary!.by_account.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                {summary!.by_account.slice(0, 4).map(a => (
                  <span key={a.account}
                    className={cn('text-[10px] px-1.5 py-0.5 rounded border font-mono',
                      a.pct >= 100 ? 'bg-prospex-red/10 text-prospex-red border-prospex-red/30'
                        : a.pct >= 80 ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                        : 'bg-prospex-bg text-prospex-muted border-prospex-border')}
                    title={`${a.account}: ${a.sent} today, ${a.used}/${a.limit} of daily limit`}>
                    @{a.account} · {a.sent}
                  </span>
                ))}
              </div>
            )}
          </>
        )}

        <div className="ml-auto flex items-center gap-1.5">
          <button onClick={load} className="text-prospex-dim hover:text-prospex-text" title="Refresh" aria-label="Refresh">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          <button onClick={postSlack} disabled={posting || nothing}
            className={cn('text-[10px] px-2 py-1 rounded border font-mono transition-colors disabled:opacity-40',
              postedFlash
                ? 'bg-prospex-green/20 text-prospex-green border-prospex-green/40'
                : 'bg-prospex-cyan/10 text-prospex-cyan border-prospex-cyan/30 hover:bg-prospex-cyan/20')}
            title="Push today's digest to Slack now">
            {posting ? <Loader2 className="w-3 h-3 animate-spin inline" /> : postedFlash ? '✓ Posted' : 'Post to Slack'}
          </button>
        </div>
      </div>
    </div>
  );
}
