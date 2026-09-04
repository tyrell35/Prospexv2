'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import {
  Phone, X, ChevronLeft, ChevronRight, Star, Globe, Instagram, MapPin,
  Clock, User, AlertTriangle, Loader2, ExternalLink, History, StickyNote, Sparkles,
  MessageSquare, Send, Building2, Check, CloudOff, Save,
} from 'lucide-react';
import { cn, getScoreColor } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
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

  // GoHighLevel bridge — dialling and messaging happen in GHL, not here.
  const [ghlBusy, setGhlBusy] = useState<null | 'open' | 'sms'>(null);
  const [ghlError, setGhlError] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<Array<{ key: string; label: string; emoji: string; countries: string[]; configured: boolean }>>([]);
  const [smsOpen, setSmsOpen] = useState(false);
  const [smsText, setSmsText] = useState('');
  const [bookingLink, setBookingLink] = useState('');

  // ── Note drafts ──────────────────────────────────────────
  // Notes used to live only in React state and were committed solely by
  // tapping a disposition, so switching lead — or a mobile browser
  // reclaiming the tab — threw them away silently. Three layers now:
  //   1. localStorage on every keystroke  (instant, survives a crash)
  //   2. debounced save to the server     (survives a device switch)
  //   3. a flush on pagehide via beacon   (survives backgrounding)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'local'>('idle');
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [noteSaving, setNoteSaving] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Mirrors the live capture so flush handlers read current values without
  // being re-registered on every keystroke.
  const draftRef = useRef({ leadId: '', notes: '', spokeTo: '', callbackAt: '' });

  const lead = queue[index];

  // Re-render each minute so the local clock and window stay honest.
  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 60_000);
    return () => clearInterval(t);
  }, []);

  // Moving to a new lead: flush whatever was being typed on the previous
  // one, then hydrate this lead's draft. Nothing is discarded.
  useEffect(() => {
    const prev = draftRef.current;
    if (prev.leadId && prev.leadId !== lead?.id && (prev.notes || prev.spokeTo || prev.callbackAt)) {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      pushDraft(prev);
    }

    if (!lead) return;
    // Whichever copy is newer wins. The server copy is what survives a
    // device switch; the local copy is what survives a failed autosave, and
    // in that case it is the fresher of the two.
    const server = lead.call_draft;
    const local = readLocal(lead.id);
    const serverAt = lead.call_draft_updated_at ? new Date(lead.call_draft_updated_at).getTime() : 0;
    const localAt = local?.at || 0;
    const useLocal = !!local && localAt > serverAt;
    const restored = useLocal
      ? { notes: local?.notes || '', spokeTo: local?.spokeTo || '', callbackAt: local?.callbackAt || '' }
      : { notes: server?.notes || '', spokeTo: server?.spoke_to || '', callbackAt: server?.callback_at || '' };

    setNotes(restored.notes);
    setSpokeTo(restored.spokeTo);
    setCallbackAt(restored.callbackAt);
    draftRef.current = { leadId: lead.id, ...restored };
    const hasDraft = !!(restored.notes || restored.spokeTo || restored.callbackAt);
    setSaveState(hasDraft ? (useLocal ? 'local' : 'saved') : 'idle');
    setSavedAt(useLocal ? new Date(localAt).toISOString() : lead.call_draft_updated_at || null);
    // A local copy that never reached the server gets one more attempt now.
    if (useLocal) pushDraft({ leadId: lead.id, ...restored });

    setShowHistory(false); setEditingOwner(false);
    setSmsOpen(false); setSmsText(''); setGhlError(null);
    setOwnerDraft(lead.owner_name || '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lead?.id, lead?.owner_name]);

  const lsKey = (id: string) => `prospex:call-draft:${id}`;

  const readLocal = (id: string) => {
    try {
      const raw = localStorage.getItem(lsKey(id));
      return raw ? JSON.parse(raw) as { notes?: string; spokeTo?: string; callbackAt?: string; at?: number } : null;
    } catch { return null; }
  };
  const writeLocal = (id: string, d: { notes: string; spokeTo: string; callbackAt: string }) => {
    try {
      if (!d.notes && !d.spokeTo && !d.callbackAt) localStorage.removeItem(lsKey(id));
      // Stamped so a local copy written after a failed server save is not
      // overwritten by the staler server copy on the next open.
      else localStorage.setItem(lsKey(id), JSON.stringify({ ...d, at: Date.now() }));
    } catch { /* private mode / quota — the server copy still covers us */ }
  };
  const clearLocal = (id: string) => { try { localStorage.removeItem(lsKey(id)); } catch {} };

  /** Persist the draft server-side. `beacon` is used on pagehide, where a
   *  normal fetch would be cancelled as the tab goes away. */
  const pushDraft = useCallback((
    d: { leadId: string; notes: string; spokeTo: string; callbackAt: string },
    beacon = false,
  ) => {
    if (!d.leadId) return;
    const payload = JSON.stringify({
      action: 'save_draft', lead_id: d.leadId,
      notes: d.notes, spoke_to: d.spokeTo, callback_at: d.callbackAt,
    });
    if (beacon && typeof navigator !== 'undefined' && navigator.sendBeacon) {
      // sendBeacon carries cookies, which is how the route authenticates.
      navigator.sendBeacon('/api/call-pipeline', new Blob([payload], { type: 'application/json' }));
      return;
    }
    setSaveState('saving');
    fetch('/api/call-pipeline', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload, keepalive: true,
    })
      .then(r => { if (!r.ok) throw new Error(); setSaveState('saved'); setSavedAt(new Date().toISOString()); })
      // The keystroke is already in localStorage, so say so rather than
      // implying the note was lost.
      .catch(() => setSaveState('local'));
  }, []);

  /** Called on every keystroke: local now, server shortly after. */
  const touchDraft = useCallback((next: Partial<{ notes: string; spokeTo: string; callbackAt: string }>) => {
    const d = { ...draftRef.current, ...next };
    draftRef.current = d;
    if (!d.leadId) return;
    writeLocal(d.leadId, { notes: d.notes, spokeTo: d.spokeTo, callbackAt: d.callbackAt });
    setSaveState('saving');
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => pushDraft(draftRef.current), 1200);
  }, [pushDraft]);

  // Flush when the tab is hidden or torn down — the common way a phone
  // loses an unsaved note.
  useEffect(() => {
    const flush = () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      const d = draftRef.current;
      if (d.leadId && (d.notes || d.spokeTo || d.callbackAt)) pushDraft(d, true);
    };
    const onVis = () => { if (document.visibilityState === 'hidden') flush(); };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onVis);
      flush();
    };
  }, [pushDraft]);

  // Which sub-account covers which country — fetched rather than hardcoded
  // so the console and the server can never disagree about routing.
  useEffect(() => {
    fetch('/api/ghl-bridge', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'accounts' }),
    }).then(r => r.json()).then(d => setAccounts(d.accounts || [])).catch(() => {});

    // Booking URL is configured once in Settings; the console just uses it.
    // Supabase's builder returns a PromiseLike, so this is awaited inside an
    // async IIFE rather than chained with .catch().
    (async () => {
      try {
        const { data } = await supabase.from('settings').select('calendar_url').limit(1).maybeSingle();
        setBookingLink((data as { calendar_url?: string } | null)?.calendar_url || '');
      } catch { /* no calendar configured yet — the button stays disabled */ }
    })();
  }, []);

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

      // The disposition carried the draft with it — retire it so it cannot
      // reappear on the next visit to this lead.
      if (saveTimer.current) clearTimeout(saveTimer.current);
      clearLocal(lead.id);
      draftRef.current = { leadId: lead.id, notes: '', spokeTo: '', callbackAt: '' };
      setSaveState('idle'); setSavedAt(null);

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

  /**
   * Open the lead inside GoHighLevel, creating the contact in the correct
   * regional sub-account first if it isn't there yet. The actual dial then
   * happens on GHL's own dialer — Prospex never places the call.
   */
  const openInGhl = async () => {
    if (!lead || ghlBusy) return;
    setGhlBusy('open'); setGhlError(null);
    try {
      const res = await fetch('/api/ghl-bridge', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'open', lead_id: lead.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not open the lead in GoHighLevel');
      lead.ghl_contact_id = data.contact_id;
      window.open(data.url, '_blank', 'noopener');
    } catch (err) {
      setGhlError(err instanceof Error ? err.message : 'GoHighLevel bridge failed');
    } finally {
      setGhlBusy(null);
    }
  };

  /** Commit the draft as a permanent note — no disposition required.
   *  For "spoke to Amy, ring back Tuesday" when the call has no outcome yet. */
  const saveNote = async () => {
    if (!lead || noteSaving) return;
    if (!notes.trim() && !spokeTo.trim()) return;
    setNoteSaving(true);
    try {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      const res = await fetch('/api/call-pipeline', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save_note', lead_id: lead.id,
          note: notes.trim(), spoke_to: spokeTo.trim(),
          callback_at: callbackAt ? new Date(callbackAt).toISOString() : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not save the note');

      // Committed — the draft is retired on both sides.
      clearLocal(lead.id);
      draftRef.current = { leadId: lead.id, notes: '', spokeTo: '', callbackAt: '' };
      lead.call_notes = lead.call_notes ? `${lead.call_notes}\n${data.entry}` : data.entry;
      lead.call_draft = null;
      setNotes(''); setSpokeTo('');
      setSaveState('idle'); setSavedAt(null);
      if (showHistory) loadHistory();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not save the note');
    } finally {
      setNoteSaving(false);
    }
  };

  const sendSms = async () => {
    if (!lead || !smsText.trim() || ghlBusy) return;
    setGhlBusy('sms'); setGhlError(null);
    try {
      const res = await fetch('/api/ghl-bridge', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'message', lead_id: lead.id, type: 'SMS', message: smsText.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not send the message');
      setSmsText(''); setSmsOpen(false);
      if (showHistory) loadHistory();
    } catch (err) {
      setGhlError(err instanceof Error ? err.message : 'Send failed');
    } finally {
      setGhlBusy(null);
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
  const routed = accounts.find(a => lead.country_code && a.countries.includes(lead.country_code));

  // Only greet by name when the name is actually verified — same rule the
  // spoken opener follows.
  const greeting = speakable && firstName ? `Hi ${firstName}` : 'Hi';
  const smsTemplates = [
    { label: 'info', body: `${greeting}, you asked for more info — sending it over now.` },
    { label: 'recap', body: `${greeting}, great speaking just now. Here are the details we went through.` },
    { label: 'missed', body: `${greeting}, tried you just now about ${lead.business_name}. When suits for a quick word?` },
  ];

  // Two-step, because a link dropped cold reads as spam and hurts
  // deliverability. Ask first, send once they say yes.
  const askPermission = `${greeting}, happy to send over a 2-minute breakdown of what we'd do for ${lead.business_name} — ok to send it here?`;
  const sendBooking = bookingLink
    ? `${greeting}, here you go — grab whichever time suits: ${bookingLink}`
    : '';

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
              {/* Primary path: dial inside GoHighLevel. Prospex decides who to
                  ring and remembers the outcome; GHL owns the phone line. */}
              <button onClick={openInGhl} disabled={!!ghlBusy || !lead.phone}
                title={routed ? `Opens in ${routed.label}` : 'Opens the contact in GoHighLevel'}
                className="btn-success font-mono text-base px-5 py-2.5 disabled:opacity-40">
                {ghlBusy === 'open' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Phone className="w-4 h-4" />}
                {lead.phone_formatted || lead.phone || 'No number'}
                <span className="text-[10px] opacity-70">↗ GHL</span>
              </button>

              <button onClick={() => setSmsOpen(v => !v)} disabled={!lead.phone}
                className="btn-ghost text-xs border border-prospex-border disabled:opacity-40">
                <MessageSquare className="w-3.5 h-3.5" />Send info
              </button>

              {tel && (
                <a href={tel} className="btn-ghost text-xs border border-prospex-border"
                   title="Fall back to this device's dialer — the call will NOT be logged by GoHighLevel">
                  <Phone className="w-3.5 h-3.5" />Device
                </a>
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
              {routed && (
                <span className={cn('inline-flex items-center gap-1', routed.configured ? 'text-prospex-muted' : 'text-amber-300')}
                  title={routed.configured ? `${lead.country_code} leads are dialled from ${routed.label}` : `${routed.label} has no credentials set in Vercel yet`}>
                  <Building2 className="w-3 h-3" />{routed.emoji} {routed.label}
                  {!routed.configured && ' · not configured'}
                </span>
              )}
            </div>

            {ghlError && (
              <div className="mt-2 flex items-start gap-2 px-3 py-2 rounded-lg bg-prospex-red/10 border border-prospex-red/30">
                <AlertTriangle className="w-3.5 h-3.5 text-prospex-red mt-0.5 shrink-0" />
                <p className="text-xs text-prospex-red/90">{ghlError}</p>
              </div>
            )}

            {/* They showed interest — the two taps that follow. Prefills the
                composer rather than sending blind, so the wording can be
                adjusted before it goes. */}
            <div className="flex items-center gap-1.5 mt-2 flex-wrap">
              <span className="text-[10px] font-mono uppercase tracking-wider text-prospex-dim">They're keen</span>
              <button onClick={() => { setSmsText(askPermission); setSmsOpen(true); }}
                title="Ask before sending a link — a cold link reads as spam and hurts deliverability"
                className="text-[11px] font-mono px-2 py-1 rounded border bg-amber-500/15 text-amber-300 border-amber-500/40 hover:bg-amber-500/25">
                🙋 Ask to send info
              </button>
              <button onClick={() => { setSmsText(sendBooking); setSmsOpen(true); }}
                disabled={!bookingLink}
                title={bookingLink ? 'Send the calendar link' : 'Set a Calendar Booking URL in Settings first'}
                className="text-[11px] font-mono px-2 py-1 rounded border bg-prospex-green/15 text-prospex-green border-prospex-green/40 hover:bg-prospex-green/25 disabled:opacity-40">
                📅 Send booking link
              </button>
              {!bookingLink && (
                <span className="text-[10px] font-mono text-prospex-dim">no calendar URL in Settings</span>
              )}
            </div>

            {smsOpen && (
              <div className="mt-3 p-3 rounded-lg bg-prospex-bg border border-prospex-border">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-prospex-dim">
                    SMS via {routed?.label || 'GoHighLevel'}
                  </span>
                  <div className="flex gap-1">
                    {smsTemplates.map(t => (
                      <button key={t.label} onClick={() => setSmsText(t.body)}
                        className="text-[9px] font-mono px-1.5 py-0.5 rounded border border-prospex-border text-prospex-dim hover:text-prospex-cyan">
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>
                <textarea value={smsText} onChange={e => setSmsText(e.target.value)} rows={3}
                  placeholder="What are you sending them?" className="input resize-none" />
                <div className="flex items-center justify-between mt-2">
                  <span className="text-[10px] font-mono text-prospex-dim">{smsText.length} chars · logged to this lead&apos;s timeline</span>
                  <button onClick={sendSms} disabled={!smsText.trim() || !!ghlBusy} className="btn-primary text-xs disabled:opacity-40">
                    {ghlBusy === 'sms' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}Send
                  </button>
                </div>
              </div>
            )}

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
          <div className="px-4 md:px-5 py-4 border-b border-prospex-border">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-mono uppercase tracking-wider text-prospex-dim">Capture</span>
              {/* Never leave the operator guessing whether typing was kept. */}
              <span className="text-[10px] font-mono inline-flex items-center gap-1">
                {saveState === 'saving' && <><Loader2 className="w-3 h-3 animate-spin text-prospex-dim" /><span className="text-prospex-dim">Saving…</span></>}
                {saveState === 'saved' && <><Check className="w-3 h-3 text-prospex-green" /><span className="text-prospex-green">Saved{savedAt ? ` ${new Date(savedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}` : ''}</span></>}
                {saveState === 'local' && <><CloudOff className="w-3 h-3 text-amber-400" /><span className="text-amber-300">Saved on this device — will sync</span></>}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-mono uppercase tracking-wider text-prospex-dim">Who answered</label>
                <input value={spokeTo} onChange={e => { setSpokeTo(e.target.value); touchDraft({ spokeTo: e.target.value }); }}
                  onBlur={() => pushDraft(draftRef.current)}
                  placeholder="Name, if you got one" className="input mt-1" />
              </div>
              <div>
                <label className="text-[10px] font-mono uppercase tracking-wider text-prospex-dim inline-flex items-center gap-1">
                  <Clock className="w-3 h-3" />Callback time
                </label>
                <input type="datetime-local" value={callbackAt}
                  onChange={e => { setCallbackAt(e.target.value); touchDraft({ callbackAt: e.target.value }); }}
                  onBlur={() => pushDraft(draftRef.current)} className="input mt-1" />
              </div>
              <div className="md:col-span-2">
                <label className="text-[10px] font-mono uppercase tracking-wider text-prospex-dim">Notes</label>
                <textarea value={notes} onChange={e => { setNotes(e.target.value); touchDraft({ notes: e.target.value }); }}
                  onBlur={() => pushDraft(draftRef.current)} rows={3}
                  placeholder="What was said, objections, when to try again" className="input mt-1 resize-none" />
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 mt-2 flex-wrap">
              <p className="text-[10px] font-mono text-prospex-dim">
                Autosaves as you type. Tapping an outcome below files this with the call.
              </p>
              <button onClick={saveNote} disabled={noteSaving || (!notes.trim() && !spokeTo.trim())}
                title="Record this against the lead without logging a call outcome"
                className="btn-ghost text-xs border border-prospex-border disabled:opacity-40">
                {noteSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                Save note only
              </button>
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
