'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Phone, X, ChevronLeft, ChevronRight, Star, Globe, Instagram, MapPin,
  Clock, User, AlertTriangle, Loader2, ExternalLink, History, StickyNote, Sparkles,
} from 'lucide-react';
import { cn, getScoreColor } from '@/lib/utils';
import {
  OUTCOME_GROUPS, OUTCOME_BY_ID, STAGE_BY_ID, callWindow, WINDOW_CONFIG,
  localTimeLabel, tzShort, callAge, telHref, firstNameOf,
  OWNER_SOURCE_CONFIG, OWNER_CONFIDENCE_CONFIG, isSpeakableName,
  type CallOutcome, type OwnerSource,
} from '@/lib/calling';
import type { CallLead } from '@/lib/types-calling';

interface CallLogRow {
  id: string;
  outcome: string;
  called_at: string;
  called_by: string | null;
  notes: string | null;
  duration_sec: number | null;
  local_time: string | null;
  spoke_to: string | null;
  recording_url: string | null;
  source: string | null;
}

interface Props {
  queue: CallLead[];
  startIndex: number;
  onClose: () => void;
  /** Called after a disposition lands so the parent can refresh its board. */
  onLogged: (leadId: string, outcome: CallOutcome) => void;
}

export default function CallConsole({ queue, startIndex, onClose, onLogged }: Props) {
  const [index, setIndex] = useState(startIndex);
  const [notes, setNotes] = useState('');
  const [spokeTo, setSpokeTo] = useState('');
  const [callbackAt, setCallbackAt] = useState('');
  const [saving, setSaving] = useState<CallOutcome | null>(null);
  const [history, setHistory] = useState<CallLogRow[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [done, setDone] = useState<Set<string>>(new Set());
  const [ownerDraft, setOwnerDraft] = useState('');
  const [editingOwner, setEditingOwner] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const [tick, setTick] = useState(0);

  const lead = queue[index];

  // Re-render each minute so the local clock and window stay honest.
  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 60_000);
    return () => clearInterval(t);
  }, []);

  // Reset per-call scratch fields whenever we move to a new lead.
  useEffect(() => {
    setNotes(''); setSpokeTo(''); setCallbackAt('');
    setShowHistory(false); setEditingOwner(false);
    setOwnerDraft(lead?.owner_name || '');
  }, [lead?.id, lead?.owner_name]);

  const loadHistory = useCallback(async () => {
    if (!lead) return;
    const res = await fetch('/api/call-pipeline', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'get_history', lead_id: lead.id }),
    });
    const data = await res.json();
    setHistory(data.calls || []);
  }, [lead]);

  useEffect(() => { if (showHistory) loadHistory(); }, [showHistory, loadHistory]);

  const go = useCallback((delta: number) => {
    setIndex(i => Math.min(Math.max(i + delta, 0), queue.length - 1));
  }, [queue.length]);

  // Keyboard: arrows move through the queue, Esc closes. Deliberately no
  // hotkeys on the outcome buttons — a mis-keyed disposition is expensive
  // to unpick, so those stay deliberate clicks.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') return;
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') go(1);
      if (e.key === 'ArrowLeft') go(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, onClose]);

  const logOutcome = async (outcome: CallOutcome) => {
    if (!lead || saving) return;
    const cfg = OUTCOME_BY_ID[outcome];
    if (cfg.needsTime && !callbackAt) {
      alert('Set the callback date and time first — that is the whole point of this outcome.');
      return;
    }
    setSaving(outcome);
    try {
      const res = await fetch('/api/call-pipeline', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'log_call',
          lead_id: lead.id,
          outcome,
          notes: notes.trim() || undefined,
          spoke_to: spokeTo.trim() || undefined,
          gatekeeper_name: outcome === 'gatekeeper' ? (spokeTo.trim() || undefined) : undefined,
          callback_at: callbackAt ? new Date(callbackAt).toISOString() : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to log the call');

      setDone(prev => new Set(prev).add(lead.id));
      onLogged(lead.id, outcome);
      if (index < queue.length - 1) go(1); else onClose();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to log the call');
    } finally {
      setSaving(null);
    }
  };

  const saveOwner = async () => {
    if (!lead || !ownerDraft.trim()) { setEditingOwner(false); return; }
    await fetch('/api/call-pipeline', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'update_lead', lead_id: lead.id, updates: { owner_name: ownerDraft.trim() } }),
    });
    lead.owner_name = ownerDraft.trim();
    lead.owner_source = 'manual';
    lead.owner_confidence = 'high';
    setEditingOwner(false);
  };

  const enrichOwner = async () => {
    if (!lead || enriching) return;
    setEnriching(true);
    try {
      const res = await fetch('/api/enrich-owner', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lead_ids: [lead.id], force: true }),
      });
      const data = await res.json();
      const hit = (data.results || [])[0];
      if (hit?.owner_name) {
        lead.owner_name = hit.owner_name;
        lead.owner_role = hit.owner_role;
        lead.owner_source = hit.owner_source;
        lead.owner_confidence = hit.owner_confidence;
        setOwnerDraft(hit.owner_name);
      } else {
        alert(hit?.reason ? `No owner found — ${hit.reason}` : 'No owner name found for this lead.');
      }
    } finally {
      setEnriching(false);
    }
  };

  if (!lead) return null;

  const win = callWindow(lead.timezone, new Date(Date.now() + tick * 0));
  const winCfg = WINDOW_CONFIG[win];
  const stage = STAGE_BY_ID[(lead.call_stage || 'not_called') as keyof typeof STAGE_BY_ID];
  const srcCfg = lead.owner_source ? OWNER_SOURCE_CONFIG[lead.owner_source as OwnerSource] : null;
  const confCfg = lead.owner_confidence ? OWNER_CONFIDENCE_CONFIG[lead.owner_confidence] : null;
  const speakable = isSpeakableName(lead.owner_confidence);
  const firstName = firstNameOf(lead.owner_name);
  const tel = telHref(lead.phone);

  return (
    <div className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-start md:items-center justify-center p-0 md:p-6 overflow-y-auto">
      <div className="w-full max-w-3xl bg-prospex-surface border border-prospex-border md:rounded-xl min-h-screen md:min-h-0 md:max-h-[92vh] flex flex-col">

        {/* ── Header: position in queue + navigation ── */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-prospex-border shrink-0">
          <div className="flex items-center gap-3">
            <Phone className="w-4 h-4 text-prospex-cyan" />
            <span className="font-mono text-xs text-prospex-dim">
              {index + 1} / {queue.length}
              {done.size > 0 && <span className="text-prospex-green ml-2">· {done.size} logged</span>}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => go(-1)} disabled={index === 0}
              className="p-1.5 rounded-lg hover:bg-prospex-bg disabled:opacity-30" aria-label="Previous lead">
              <ChevronLeft className="w-4 h-4 text-prospex-muted" />
            </button>
            <button onClick={() => go(1)} disabled={index >= queue.length - 1}
              className="p-1.5 rounded-lg hover:bg-prospex-bg disabled:opacity-30" aria-label="Next lead">
              <ChevronRight className="w-4 h-4 text-prospex-muted" />
            </button>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-prospex-bg ml-2" aria-label="Close console">
              <X className="w-4 h-4 text-prospex-muted" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* ── Who you are ringing ── */}
          <div className="p-4 md:p-5 border-b border-prospex-border">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <Link href={`/leads/${lead.id}`} target="_blank"
                  className="text-lg md:text-xl font-semibold text-prospex-text hover:text-prospex-cyan inline-flex items-center gap-2">
                  {lead.business_name}
                  <ExternalLink className="w-3.5 h-3.5 text-prospex-dim" />
                </Link>
                <div className="flex items-center gap-3 mt-1 text-xs text-prospex-dim flex-wrap">
                  {lead.city && <span className="inline-flex items-center gap-1"><MapPin className="w-3 h-3" />{lead.city}{lead.country_code ? `, ${lead.country_code}` : ''}</span>}
                  {lead.niche && <span>{lead.niche}</span>}
                  {lead.google_rating != null && (
                    <span className="inline-flex items-center gap-1">
                      <Star className="w-3 h-3 text-amber-400" />{lead.google_rating}
                      {lead.google_review_count != null && <span className="text-prospex-dim">({lead.google_review_count})</span>}
                    </span>
                  )}
                  {lead.lead_score != null && <span className={cn('font-mono font-bold', getScoreColor(lead.lead_score))}>{lead.lead_score}</span>}
                </div>
              </div>

              {/* Local clock — the thing that decides whether to dial at all */}
              <div className="text-right shrink-0">
                <div className={cn('font-mono text-xl md:text-2xl font-bold', winCfg.textClass)}>
                  {localTimeLabel(lead.timezone) || '—'}
                </div>
                <div className="text-[10px] font-mono text-prospex-dim">
                  {winCfg.emoji} {winCfg.label} · {tzShort(lead.timezone)}
                </div>
              </div>
            </div>

            {!winCfg.callable && (
              <div className="mt-3 flex items-start gap-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/30">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400 mt-0.5 shrink-0" />
                <p className="text-xs text-amber-300">
                  It&apos;s <strong>{localTimeLabel(lead.timezone)}</strong> where they are — {winCfg.label.toLowerCase()}. Skip and come back to this one.
                </p>
              </div>
            )}
          </div>

          {/* ── Owner: who to ask for ── */}
          <div className="px-4 md:px-5 py-4 border-b border-prospex-border bg-prospex-bg/40">
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="text-[10px] font-mono uppercase tracking-wider text-prospex-dim">Ask for</span>
              <div className="flex items-center gap-1">
                <button onClick={enrichOwner} disabled={enriching}
                  className="text-[10px] font-mono px-2 py-1 rounded border border-prospex-border text-prospex-muted hover:text-prospex-cyan hover:border-prospex-cyan/40 inline-flex items-center gap-1 disabled:opacity-50">
                  {enriching ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                  {enriching ? 'Looking…' : 'Find owner'}
                </button>
                <button onClick={() => setEditingOwner(v => !v)}
                  className="text-[10px] font-mono px-2 py-1 rounded border border-prospex-border text-prospex-muted hover:text-prospex-cyan hover:border-prospex-cyan/40">
                  {editingOwner ? 'Cancel' : 'Edit'}
                </button>
              </div>
            </div>

            {editingOwner ? (
              <div className="flex gap-2">
                <input value={ownerDraft} onChange={e => setOwnerDraft(e.target.value)} autoFocus
                  onKeyDown={e => { if (e.key === 'Enter') saveOwner(); }}
                  placeholder="Name you got on the call" className="input flex-1" />
                <button onClick={saveOwner} className="btn-primary text-xs px-3">Save</button>
              </div>
            ) : lead.owner_name ? (
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <User className="w-4 h-4 text-prospex-cyan" />
                  <span className="text-base font-semibold text-prospex-text">{lead.owner_name}</span>
                  {lead.owner_role && <span className="text-xs text-prospex-muted">· {lead.owner_role}</span>}
                  {srcCfg && (
                    <span className={cn('text-[10px] font-mono px-1.5 py-0.5 rounded border border-prospex-border', srcCfg.textClass)}
                      title={srcCfg.trust}>
                      {srcCfg.emoji} {srcCfg.short}
                    </span>
                  )}
                  {confCfg && <span className={cn('text-[10px] font-mono', confCfg.textClass)}>{confCfg.emoji} {confCfg.label}</span>}
                </div>
                <p className={cn('text-xs mt-2', speakable ? 'text-prospex-green' : 'text-amber-300')}>
                  {speakable
                    ? `Open with: “Hi, is ${firstName} about?”`
                    : `Unverified — don’t lead with the name. Try: “Who looks after the marketing there?” and confirm if it’s ${firstName}.`}
                </p>
              </div>
            ) : (
              <div>
                <p className="text-sm text-prospex-muted">No name on file.</p>
                <p className="text-xs text-prospex-dim mt-1">
                  Open with: “Who looks after the marketing for the clinic?” — then save the name here.
                </p>
              </div>
            )}

            {lead.gatekeeper_name && (
              <p className="text-xs text-purple-300 mt-2">🚪 Gatekeeper last time: <strong>{lead.gatekeeper_name}</strong></p>
            )}
          </div>

          {/* ── Dial + channels ── */}
          <div className="px-4 md:px-5 py-4 border-b border-prospex-border">
            <div className="flex items-center gap-2 flex-wrap">
              {tel ? (
                <a href={tel} className="btn-success font-mono text-base px-5 py-2.5">
                  <Phone className="w-4 h-4" />{lead.phone_formatted || lead.phone}
                </a>
              ) : (
                <span className="text-sm text-prospex-red">No phone number on file</span>
              )}
              {lead.website && (
                <a href={lead.website} target="_blank" rel="noopener noreferrer" className="btn-ghost text-xs">
                  <Globe className="w-3.5 h-3.5" />Site
                </a>
              )}
              {lead.instagram_url && (
                <a href={lead.instagram_url} target="_blank" rel="noopener noreferrer" className="btn-ghost text-xs">
                  <Instagram className="w-3.5 h-3.5" />IG
                </a>
              )}
              <button onClick={() => setShowHistory(v => !v)} className="btn-ghost text-xs">
                <History className="w-3.5 h-3.5" />
                {lead.call_attempts || 0} {lead.call_attempts === 1 ? 'attempt' : 'attempts'}
              </button>
            </div>

            <div className="flex items-center gap-3 mt-2 text-[11px] font-mono text-prospex-dim flex-wrap">
              <span className={stage?.textClass}>{stage?.emoji} {stage?.label}</span>
              <span>· last call {callAge(lead.last_call_at)}</span>
              {lead.outreach_status && lead.outreach_status !== 'not_started' && (
                <span className="text-prospex-cyan/70">· IG: {lead.outreach_status.replace(/_/g, ' ')}</span>
              )}
            </div>

            {showHistory && (
              <div className="mt-3 space-y-1.5 max-h-48 overflow-y-auto">
                {history.length === 0 && <p className="text-xs text-prospex-dim">No calls logged yet.</p>}
                {history.map(h => (
                  <div key={h.id} className="text-[11px] font-mono px-2 py-1.5 rounded bg-prospex-bg border border-prospex-border">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-prospex-text">{OUTCOME_BY_ID[h.outcome as CallOutcome]?.label || h.outcome}</span>
                      <span className="text-prospex-dim">{callAge(h.called_at)} ago</span>
                      {h.local_time && <span className="text-prospex-dim">· their {h.local_time}</span>}
                      {h.duration_sec != null && <span className="text-prospex-dim">· {Math.round(h.duration_sec / 60)}m</span>}
                      {h.source === 'ghl_webhook' && <span className="text-prospex-cyan/60">· GHL</span>}
                    </div>
                    {h.notes && <p className="text-prospex-muted mt-1 font-sans">{h.notes}</p>}
                    {h.recording_url && (
                      <a href={h.recording_url} target="_blank" rel="noopener noreferrer" className="text-prospex-cyan hover:underline">▶ recording</a>
                    )}
                  </div>
                ))}
              </div>
            )}

            {lead.call_notes && (
              <div className="mt-3 px-3 py-2 rounded-lg bg-prospex-bg border border-prospex-border">
                <p className="text-[10px] font-mono uppercase tracking-wider text-prospex-dim mb-1 inline-flex items-center gap-1">
                  <StickyNote className="w-3 h-3" />Running notes
                </p>
                <pre className="text-[11px] text-prospex-muted whitespace-pre-wrap font-sans max-h-24 overflow-y-auto">{lead.call_notes}</pre>
              </div>
            )}
          </div>

          {/* ── Capture ── */}
          <div className="px-4 md:px-5 py-4 border-b border-prospex-border grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-mono uppercase tracking-wider text-prospex-dim">Who answered</label>
              <input value={spokeTo} onChange={e => setSpokeTo(e.target.value)}
                placeholder="Name, if you got one" className="input mt-1" />
            </div>
            <div>
              <label className="text-[10px] font-mono uppercase tracking-wider text-prospex-dim inline-flex items-center gap-1">
                <Clock className="w-3 h-3" />Callback time
              </label>
              <input type="datetime-local" value={callbackAt} onChange={e => setCallbackAt(e.target.value)} className="input mt-1" />
            </div>
            <div className="md:col-span-2">
              <label className="text-[10px] font-mono uppercase tracking-wider text-prospex-dim">Notes</label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
                placeholder="What was said, objections, when to try again" className="input mt-1 resize-none" />
            </div>
          </div>
        </div>

        {/* ── Dispositions ── */}
        <div className="px-4 md:px-5 py-3 border-t border-prospex-border bg-prospex-bg/60 shrink-0">
          <div className="space-y-2">
            {OUTCOME_GROUPS.map(group => (
              <div key={group.label}>
                <p className="text-[9px] font-mono uppercase tracking-wider text-prospex-dim mb-1">{group.label}</p>
                <div className="flex flex-wrap gap-1.5">
                  {group.outcomes.map(id => {
                    const cfg = OUTCOME_BY_ID[id];
                    return (
                      <button key={id} onClick={() => logOutcome(id)} disabled={!!saving}
                        title={cfg.retryHours ? `Rings again in ${cfg.retryHours}h` : 'No automatic follow-up'}
                        className={cn(
                          'text-xs font-mono px-2.5 py-1.5 rounded-lg border transition-all disabled:opacity-40',
                          cfg.color,
                        )}>
                        {saving === id ? <Loader2 className="w-3 h-3 animate-spin inline" /> : cfg.emoji} {cfg.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          <p className="text-[10px] font-mono text-prospex-dim mt-2">← → moves through the queue · Esc closes</p>
        </div>
      </div>
    </div>
  );
}
