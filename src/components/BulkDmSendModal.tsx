'use client';

import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import {
  X, Instagram, ExternalLink, Check, SkipForward, Ban, Loader2, ChevronLeft, ChevronRight,
  Sparkles, AlertCircle, Flame, Copy, Rocket, User, MapPin, Trophy,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { computeWarmupState } from '@/lib/ig-warmup';
import type { Lead } from '@/lib/types';

// ═══════════════════════════════════════════════════════
// BULK DM SEND — the "seamless" fast IG DM workflow
//
// The goal: get from "20 leads I want to message" to "20 IG DMs sent"
// in a fraction of the time it takes to open each lead detail page,
// pick a template, copy, open IG, paste, send, come back, log, repeat.
//
// Trade-off vs full automation: pure IG DM automation gets accounts
// action-blocked within days. This modal keeps a human in the loop
// (you still click Send inside the Instagram app itself) but shrinks
// the surrounding friction — each "iteration" is 3 clicks + one paste
// instead of ~10 clicks + navigation.
//
// Flow per lead:
//   1. Modal shows current lead + personalized message + assigned account
//   2. User clicks "Open Instagram" → message copied to clipboard, IG
//      opens in new tab at that user's inbox
//   3. User pastes + sends in IG
//   4. Comes back, clicks ✓ Sent → logs to outreach_logs, bumps
//      ig_accounts.daily_sent_today, and auto-advances
//
// Safety: assignment respects each account's remaining KPI target based
// on the warmup ladder (5 → 10 → 20 → 30 depending on days since warmup
// start). Accounts at their target are dropped from rotation.
// ═══════════════════════════════════════════════════════

interface DbTemplate {
  id: string;
  name: string;
  category: string | null;
  content: string;
  channel: string | null;
}

interface WarmAccount {
  id: string;
  username: string;
  display_name: string | null;
  status: string | null;
  daily_sent_today: number | null;
  daily_limit: number | null;
  daily_target: number | null;
  warmup_stage: 'new' | 'warming' | 'warm' | 'paused' | null;
  warmup_started_at: string | null;
}

interface QueueRow {
  lead: Lead;
  sender_account: string;
  message: string;
  outcome: 'pending' | 'sent' | 'skipped' | 'blocked';
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  leads: Lead[];
  onCompleted?: (stats: { sent: number; skipped: number; blocked: number }) => void;
}

// ─── Personalisation ──────────────────────────────────────
// Same rules as QuickMessage — keeps templates portable across surfaces.
function personalize(content: string, lead: Lead): string {
  const firstName = lead.business_name?.split(/[\s\-&]/)[0] || 'there';
  return content
    .replace(/\{\{firstName\}\}/g, firstName)
    .replace(/\{\{first_name\}\}/g, firstName)
    .replace(/\{\{clinicName\}\}/g, lead.business_name || 'your clinic')
    .replace(/\{\{business_name\}\}/g, lead.business_name || 'your business')
    .replace(/\{\{city\}\}/g, lead.city || 'your area')
    .replace(/\{\{niche\}\}/g, lead.niche || 'aesthetic treatments')
    .replace(/\{\{treatment\}\}/g, lead.niche || 'aesthetic treatments')
    .replace(/\{\{treatmentType\}\}/g, lead.niche || 'treatment')
    .replace(/\{\{their_reviews\}\}/g, String(lead.google_review_count || ''))
    .replace(/\{\{reviewCount\}\}/g, String(lead.google_review_count || 'great'))
    .replace(/\{\{review_count\}\}/g, String(lead.google_review_count || ''))
    .replace(/\{\{rating\}\}/g, String(lead.google_rating || ''))
    .replace(/\{\{specificThing\}\}/g, 'treatment menu');
}

// Extract IG handle from a full URL or leave a plain handle unchanged.
function extractIgHandle(lead: Lead): string | null {
  if (lead.instagram_handle && lead.instagram_handle.trim()) {
    return lead.instagram_handle.trim().replace(/^@/, '').split('/')[0];
  }
  if (lead.instagram_url && lead.instagram_url.trim()) {
    const m = lead.instagram_url.match(/instagram\.com\/([^/?#]+)/i);
    if (m && m[1]) return m[1].replace(/^@/, '');
  }
  return null;
}

// Best deep-link to a DM composer on Instagram — ig.me/m/<handle> takes
// the user directly to that user's inbox on both mobile and web.
function igDmLink(handle: string): string {
  return `https://ig.me/m/${handle}`;
}

// ═══════════════════════════════════════════════════════
export default function BulkDmSendModal({ isOpen, onClose, leads, onCompleted }: Props) {
  const [templates, setTemplates] = useState<DbTemplate[]>([]);
  const [accounts, setAccounts] = useState<WarmAccount[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [customTemplate, setCustomTemplate] = useState<string>('');
  const [queue, setQueue] = useState<QueueRow[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [logging, setLogging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [phase, setPhase] = useState<'setup' | 'run' | 'done'>('setup');

  // ─── Load templates + warm accounts ─────────────────
  useEffect(() => {
    if (!isOpen) return;
    setPhase('setup');
    setError(null);
    setQueue([]);
    setCurrentIndex(0);
    setSelectedTemplateId('');
    setCustomTemplate('');
    (async () => {
      setLoading(true);
      const [tpl, acc] = await Promise.all([
        supabase.from('conversation_templates').select('id, name, category, content, channel')
          .eq('is_active', true).or('channel.eq.instagram,channel.eq.all').order('category'),
        supabase.from('ig_accounts').select('id, username, display_name, status, daily_sent_today, daily_limit, daily_target, warmup_stage, warmup_started_at')
          .eq('status', 'active').order('username'),
      ]);
      setTemplates((tpl.data || []) as DbTemplate[]);
      setAccounts((acc.data || []) as WarmAccount[]);
      setLoading(false);
    })();
  }, [isOpen]);

  // ─── Filter leads with IG handles ──────────────────
  const eligibleLeads = useMemo(
    () => leads.filter(l => !!extractIgHandle(l)),
    [leads]
  );
  const skippedNoHandle = leads.length - eligibleLeads.length;

  // ─── Compute effective remaining capacity per account ─
  const accountCapacity = useMemo(() => {
    return accounts.map(a => {
      const w = computeWarmupState(a);
      const used = a.daily_sent_today || 0;
      const remaining = Math.max(0, w.effective_target - used);
      return { username: a.username, remaining, stage: w.stage, target: w.effective_target };
    }).filter(a => a.stage !== 'new' && a.stage !== 'paused' && a.remaining > 0);
  }, [accounts]);
  const totalCapacity = accountCapacity.reduce((s, a) => s + a.remaining, 0);

  // ─── Build the queue: round-robin across accounts, respecting caps ─
  const startBulkSend = () => {
    setError(null);
    const template = selectedTemplateId === 'custom'
      ? { content: customTemplate }
      : templates.find(t => t.id === selectedTemplateId);
    if (!template || !template.content.trim()) {
      setError('Pick a template first, or write a custom message.');
      return;
    }
    if (accountCapacity.length === 0) {
      setError('No warm accounts have capacity left today. Start a warmup or wait for daily reset.');
      return;
    }
    if (eligibleLeads.length === 0) {
      setError('None of the selected leads have an Instagram handle.');
      return;
    }

    // Round-robin — track how many each account has taken so we don't
    // overshoot its remaining KPI target.
    const takes = new Map<string, number>();
    const rows: QueueRow[] = [];
    let cursor = 0;
    for (const lead of eligibleLeads) {
      // Try up to accountCapacity.length rotations to find an available account
      let assigned: string | null = null;
      for (let i = 0; i < accountCapacity.length; i++) {
        const acc = accountCapacity[(cursor + i) % accountCapacity.length];
        const taken = takes.get(acc.username) || 0;
        if (taken < acc.remaining) {
          assigned = acc.username;
          takes.set(acc.username, taken + 1);
          cursor = (cursor + i + 1) % accountCapacity.length;
          break;
        }
      }
      if (!assigned) break; // capacity exhausted — stop assigning
      rows.push({
        lead,
        sender_account: assigned,
        message: personalize(template.content, lead),
        outcome: 'pending',
      });
    }

    if (rows.length === 0) {
      setError('No capacity to send anything today.');
      return;
    }
    setQueue(rows);
    setCurrentIndex(0);
    setPhase('run');
  };

  // ─── Current lead ─────────────────────────────
  const current = queue[currentIndex];
  const currentHandle = current ? extractIgHandle(current.lead) : null;

  // ─── Open in Instagram + copy to clipboard ─────
  const openInInstagram = async () => {
    if (!current || !currentHandle) return;
    try {
      await navigator.clipboard.writeText(current.message);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore — some browsers block clipboard w/o gesture, that's fine */ }
    window.open(igDmLink(currentHandle), '_blank', 'noopener,noreferrer');
  };

  // ─── Log outcome + advance ────────────────────
  const logAndAdvance = useCallback(async (outcome: 'sent' | 'skipped' | 'blocked') => {
    if (!current || logging) return;
    setLogging(true);
    setError(null);
    try {
      // Only 'sent' bumps ig_accounts.daily_sent_today. Skipped / blocked
      // still log for the audit trail but don't count toward daily volume.
      if (outcome === 'sent' || outcome === 'blocked') {
        const res = await fetch('/api/outreach-tracker', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'log_outreach',
            lead_id: current.lead.id,
            channel: 'instagram',
            stage: 'cold_open',
            message_sent: current.message,
            sent_by: 'manual',
            sender_account: current.sender_account,
            outcome,
            confirmed: outcome === 'sent',
          }),
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error || 'Log failed');
      }

      // Update local queue + advance
      setQueue(q => q.map((r, i) => i === currentIndex ? { ...r, outcome } : r));
      if (currentIndex + 1 >= queue.length) {
        setPhase('done');
        const stats = queue.reduce((s, r, i) => {
          const finalOutcome = i === currentIndex ? outcome : r.outcome;
          if (finalOutcome === 'sent') s.sent++;
          else if (finalOutcome === 'skipped') s.skipped++;
          else if (finalOutcome === 'blocked') s.blocked++;
          return s;
        }, { sent: 0, skipped: 0, blocked: 0 });
        onCompleted?.(stats);
      } else {
        setCurrentIndex(i => i + 1);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Log failed');
    } finally { setLogging(false); }
  }, [current, currentIndex, queue, logging, onCompleted]);

  // ─── Keyboard shortcuts ────────────────────────
  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!isOpen || phase !== 'run') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return;
      if (e.key === 'o' || e.key === 'O') { e.preventDefault(); openInInstagram(); }
      else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); logAndAdvance('sent'); }
      else if (e.key === 's' || e.key === 'S') { e.preventDefault(); logAndAdvance('skipped'); }
      else if (e.key === 'b' || e.key === 'B') { e.preventDefault(); logAndAdvance('blocked'); }
      else if (e.key === 'ArrowLeft' && currentIndex > 0) { e.preventDefault(); setCurrentIndex(i => i - 1); }
      else if (e.key === 'ArrowRight' && currentIndex < queue.length - 1) { e.preventDefault(); setCurrentIndex(i => i + 1); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, phase, currentIndex, queue.length, current]);

  if (!isOpen) return null;

  // ═════ RENDER ═════

  return (
    <div className="fixed inset-0 bg-black/70 z-[200] flex items-center justify-center p-4" onClick={onClose}>
      <div ref={containerRef} className="card bg-prospex-surface max-w-3xl w-full max-h-[92vh] flex flex-col border-pink-500/40" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="p-4 border-b border-prospex-border flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2">
            <Rocket className="w-5 h-5 text-pink-400" />
            <div>
              <h2 className="text-sm font-mono font-bold text-prospex-text">Bulk IG DM Sender</h2>
              <p className="text-[10px] text-prospex-dim">
                {phase === 'setup' && `${eligibleLeads.length} of ${leads.length} leads have an IG handle · ${totalCapacity} sends available today across ${accountCapacity.length} warm account${accountCapacity.length === 1 ? '' : 's'}`}
                {phase === 'run' && `Lead ${currentIndex + 1} of ${queue.length} · Space=Sent · S=Skip · B=Blocked · O=Open IG · ←/→=Nav`}
                {phase === 'done' && 'Session complete'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-prospex-dim hover:text-prospex-text p-1.5 rounded" title="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {loading ? (
            <div className="py-12 text-center"><Loader2 className="w-6 h-6 animate-spin text-pink-400 mx-auto" /></div>
          ) : phase === 'setup' ? (
            <>
              {/* Sanity warnings */}
              {skippedNoHandle > 0 && (
                <div className="p-2 bg-amber-500/10 border border-amber-500/30 rounded text-[11px] text-amber-400">
                  <AlertCircle className="w-3 h-3 inline mr-1" />
                  {skippedNoHandle} lead{skippedNoHandle === 1 ? '' : 's'} without an Instagram handle will be skipped. Add handles or enrich to include them.
                </div>
              )}
              {totalCapacity < eligibleLeads.length && totalCapacity > 0 && (
                <div className="p-2 bg-amber-500/10 border border-amber-500/30 rounded text-[11px] text-amber-400">
                  <Flame className="w-3 h-3 inline mr-1" />
                  Only {totalCapacity} sends available today across your warm accounts — the queue will cap at {totalCapacity}. Add more warm accounts to increase daily throughput.
                </div>
              )}
              {totalCapacity === 0 && (
                <div className="p-3 bg-prospex-red/10 border border-prospex-red/30 rounded text-[11px] text-prospex-red">
                  <AlertCircle className="w-3 h-3 inline mr-1" />
                  No warm accounts with capacity today. Either start a warmup, wait for the daily reset, or graduate an in-warmup account.
                </div>
              )}

              {/* Account capacity breakdown */}
              {accountCapacity.length > 0 && (
                <div>
                  <p className="text-[10px] font-mono uppercase text-prospex-dim mb-1.5">Sending from</p>
                  <div className="flex flex-wrap gap-1.5">
                    {accountCapacity.map(a => (
                      <span key={a.username} className="text-[10px] font-mono bg-prospex-bg border border-prospex-border rounded px-2 py-0.5">
                        @{a.username} · <span className="text-pink-400 font-bold">{a.remaining}</span> left
                        {a.stage === 'warming' && <span className="ml-1 text-amber-400">🔥warming</span>}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Template picker */}
              <div>
                <label className="text-[10px] font-mono uppercase text-prospex-dim block mb-1.5">Template</label>
                <select value={selectedTemplateId} onChange={e => setSelectedTemplateId(e.target.value)} className="input w-full text-xs">
                  <option value="">— pick a template —</option>
                  <option value="custom">✍️ Custom message (write your own)</option>
                  {templates.map(t => (
                    <option key={t.id} value={t.id}>
                      {t.category ? `[${t.category}] ` : ''}{t.name}
                    </option>
                  ))}
                </select>
              </div>

              {selectedTemplateId === 'custom' && (
                <div>
                  <label className="text-[10px] font-mono uppercase text-prospex-dim block mb-1">Your message (use {'{{firstName}}, {{business_name}}, {{city}}, {{niche}}'})</label>
                  <textarea value={customTemplate} onChange={e => setCustomTemplate(e.target.value)} rows={4}
                    placeholder="Hey {{firstName}} — noticed {{business_name}} is running Morpheus8 in {{city}}. Quick one about your device menu…"
                    className="w-full bg-prospex-bg border border-prospex-border rounded p-2 text-xs text-prospex-text resize-none" />
                </div>
              )}

              {selectedTemplateId && selectedTemplateId !== 'custom' && (() => {
                const t = templates.find(x => x.id === selectedTemplateId);
                if (!t) return null;
                return (
                  <div className="p-2.5 bg-prospex-bg rounded border border-prospex-border">
                    <p className="text-[9px] font-mono text-prospex-dim uppercase mb-1">Preview (first eligible lead)</p>
                    <p className="text-xs text-prospex-text whitespace-pre-wrap">{personalize(t.content, eligibleLeads[0])}</p>
                  </div>
                );
              })()}

              {error && (
                <div className="p-2 bg-prospex-red/10 border border-prospex-red/30 rounded text-[11px] text-prospex-red">
                  <AlertCircle className="w-3 h-3 inline mr-1" />{error}
                </div>
              )}
            </>
          ) : phase === 'run' && current ? (
            <>
              {/* Progress bar */}
              <div className="w-full h-1.5 bg-prospex-bg rounded-full overflow-hidden">
                <div className="h-full bg-pink-400 transition-all" style={{ width: `${((currentIndex + 1) / queue.length) * 100}%` }} />
              </div>

              {/* Lead card */}
              <div className="p-3 bg-prospex-bg rounded-lg border border-prospex-border">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-mono font-bold text-prospex-text truncate">{current.lead.business_name}</p>
                    <div className="flex items-center gap-2 flex-wrap mt-0.5">
                      <span className="text-[10px] text-prospex-dim flex items-center gap-1"><MapPin className="w-2.5 h-2.5" /> {current.lead.city || '—'}</span>
                      {current.lead.niche && <span className="text-[10px] text-prospex-dim">· {current.lead.niche}</span>}
                      <span className="text-[10px] text-pink-400 flex items-center gap-1 font-mono">
                        <Instagram className="w-2.5 h-2.5" /> @{currentHandle}
                      </span>
                    </div>
                  </div>
                  <div className="flex-shrink-0 text-right">
                    <span className="text-[9px] font-mono text-prospex-dim">from</span>
                    <p className="text-[11px] font-mono text-pink-400">@{current.sender_account}</p>
                  </div>
                </div>

                {/* Message */}
                <div className="mt-2">
                  <p className="text-[9px] font-mono text-prospex-dim uppercase mb-1">Message</p>
                  <div className="p-2.5 bg-prospex-surface rounded text-xs text-prospex-text whitespace-pre-wrap border border-prospex-border/50 max-h-40 overflow-y-auto">
                    {current.message}
                  </div>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex flex-col gap-2">
                <button onClick={openInInstagram} className="w-full flex items-center justify-center gap-2 bg-pink-500/20 text-pink-400 border border-pink-500/40 hover:bg-pink-500/30 py-3 rounded-lg font-mono text-sm transition-colors">
                  {copied ? <><Check className="w-4 h-4" /> Copied · IG opened → paste + send</> : <><Instagram className="w-4 h-4" /> Open in Instagram (O)</>}
                </button>

                <div className="grid grid-cols-3 gap-2">
                  <button onClick={() => logAndAdvance('sent')} disabled={logging}
                    className="flex items-center justify-center gap-1.5 bg-prospex-green/20 text-prospex-green border border-prospex-green/40 hover:bg-prospex-green/30 py-2.5 rounded font-mono text-xs disabled:opacity-50">
                    {logging ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Sent (␣)
                  </button>
                  <button onClick={() => logAndAdvance('skipped')} disabled={logging}
                    className="flex items-center justify-center gap-1.5 bg-prospex-bg text-prospex-muted border border-prospex-border hover:text-prospex-text py-2.5 rounded font-mono text-xs disabled:opacity-50">
                    <SkipForward className="w-3.5 h-3.5" /> Skip (S)
                  </button>
                  <button onClick={() => logAndAdvance('blocked')} disabled={logging}
                    className="flex items-center justify-center gap-1.5 bg-prospex-red/10 text-prospex-red border border-prospex-red/30 hover:bg-prospex-red/20 py-2.5 rounded font-mono text-xs disabled:opacity-50">
                    <Ban className="w-3.5 h-3.5" /> Blocked (B)
                  </button>
                </div>

                {/* Nav */}
                <div className="flex items-center justify-between mt-1">
                  <button onClick={() => setCurrentIndex(i => Math.max(0, i - 1))} disabled={currentIndex === 0}
                    className="text-[10px] text-prospex-dim hover:text-prospex-text disabled:opacity-40 flex items-center gap-1">
                    <ChevronLeft className="w-3 h-3" /> Previous
                  </button>
                  <span className="text-[10px] font-mono text-prospex-dim">
                    {currentIndex + 1} / {queue.length}
                  </span>
                  <button onClick={() => setCurrentIndex(i => Math.min(queue.length - 1, i + 1))} disabled={currentIndex >= queue.length - 1}
                    className="text-[10px] text-prospex-dim hover:text-prospex-text disabled:opacity-40 flex items-center gap-1">
                    Next <ChevronRight className="w-3 h-3" />
                  </button>
                </div>
              </div>

              {error && (
                <div className="p-2 bg-prospex-red/10 border border-prospex-red/30 rounded text-[11px] text-prospex-red">
                  <AlertCircle className="w-3 h-3 inline mr-1" />{error}
                </div>
              )}
            </>
          ) : phase === 'done' ? (
            <div className="py-8 text-center space-y-3">
              <Trophy className="w-10 h-10 text-prospex-green mx-auto" />
              <p className="text-sm font-mono text-prospex-text">Session complete</p>
              {(() => {
                const stats = queue.reduce((s, r) => {
                  if (r.outcome === 'sent') s.sent++;
                  else if (r.outcome === 'skipped') s.skipped++;
                  else if (r.outcome === 'blocked') s.blocked++;
                  return s;
                }, { sent: 0, skipped: 0, blocked: 0 });
                return (
                  <div className="grid grid-cols-3 gap-2 max-w-sm mx-auto">
                    <div className="p-2.5 bg-prospex-bg rounded border border-prospex-green/40">
                      <p className="text-[9px] font-mono text-prospex-dim uppercase">Sent</p>
                      <p className="text-2xl font-mono font-bold text-prospex-green">{stats.sent}</p>
                    </div>
                    <div className="p-2.5 bg-prospex-bg rounded border border-prospex-border">
                      <p className="text-[9px] font-mono text-prospex-dim uppercase">Skipped</p>
                      <p className="text-2xl font-mono font-bold text-prospex-muted">{stats.skipped}</p>
                    </div>
                    <div className="p-2.5 bg-prospex-bg rounded border border-prospex-red/30">
                      <p className="text-[9px] font-mono text-prospex-dim uppercase">Blocked</p>
                      <p className="text-2xl font-mono font-bold text-prospex-red">{stats.blocked}</p>
                    </div>
                  </div>
                );
              })()}
              <p className="text-[10px] text-prospex-dim mt-2">Your account daily counts + outreach log have been updated.</p>
            </div>
          ) : null}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-prospex-border flex items-center justify-between flex-shrink-0">
          <div className="text-[10px] text-prospex-dim flex items-center gap-1.5">
            <Sparkles className="w-2.5 h-2.5" />
            {phase === 'setup' && 'You still tap "Send" inside Instagram itself — keeps accounts safe.'}
            {phase === 'run' && 'Keyboard: Space=Sent · S=Skip · B=Blocked · O=Open IG'}
            {phase === 'done' && 'Nice work.'}
          </div>
          <div className="flex items-center gap-2">
            {phase === 'setup' && (
              <button onClick={startBulkSend} disabled={loading || !selectedTemplateId || (selectedTemplateId === 'custom' && !customTemplate.trim()) || totalCapacity === 0}
                className="btn-primary text-xs disabled:opacity-50 flex items-center gap-1.5">
                <Rocket className="w-3.5 h-3.5" /> Start · queue {Math.min(eligibleLeads.length, totalCapacity)} leads
              </button>
            )}
            {(phase === 'run' || phase === 'done') && (
              <button onClick={onClose} className="btn-primary text-xs">Close</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
