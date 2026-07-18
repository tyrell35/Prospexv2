'use client';

import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import {
  X, Instagram, MessageCircle, ExternalLink, Check, SkipForward, Ban, Loader2, ChevronLeft, ChevronRight,
  Sparkles, AlertCircle, Flame, Copy, Rocket, User, MapPin, Trophy, Clock, Phone,
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
  notes: string | null; // free-text hint — e.g. "Chrome Profile 3" or "Mobile app slot 1"
}

interface QueueRow {
  lead: Lead;
  sender_account: string;
  sender_notes: string | null; // for the "switch account" banner
  message: string;
  outcome: 'pending' | 'sent' | 'skipped' | 'blocked';
}

// How to distribute leads across warm IG accounts:
//   round_robin — 1 from @a, 1 from @b, 1 from @c, back to @a (fair mix,
//                 but forces an account switch on every send)
//   grouped     — fill @a to its cap first, then @b, then @c
//                 (15 switches for a 450-send day instead of 450)
// Default is 'grouped' because for a 15-account fleet, switching accounts
// in Instagram is by far the biggest per-lead friction — clustering wins.
type SendOrder = 'round_robin' | 'grouped';

type Channel = 'instagram' | 'whatsapp';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  leads: Lead[];
  channel: Channel;
  onCompleted?: (stats: { sent: number; skipped: number; blocked: number }) => void;
}

// Safe daily cap when cold-messaging from a single personal WhatsApp Web
// session — WhatsApp's spam heuristics flag well-spaced velocity around
// this level. Bump higher only for opted-in / existing-customer lists.
const WHATSAPP_SAFE_DAILY_CAP = 50;
// Minimum gap between sends (seconds) — surfaced as a timer + suggestion
// rather than a hard block so the operator can override during a genuine
// busy stretch.
const WHATSAPP_MIN_GAP_SECONDS = 60;

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

// Normalize a phone to E.164 digits-only (no leading +). Strips spaces,
// dashes, parens, dots. If it starts with a country code (like 44, 1, 61)
// we keep it. If it starts with a UK 0 we swap it to 44. If it looks
// short we return null — better a skipped lead than a broken wa.me link.
function normalizeE164(phone: string | null | undefined, country: string | null | undefined): string | null {
  if (!phone) return null;
  let s = String(phone).replace(/[^\d+]/g, '');
  if (s.startsWith('+')) s = s.slice(1);
  // UK convention: 07... → 447...
  if (s.startsWith('0') && (country?.toLowerCase().includes('kingdom') || country?.toLowerCase() === 'uk')) {
    s = '44' + s.slice(1);
  }
  // US convention: 10-digit number without country code → prepend 1
  if (s.length === 10 && (country?.toLowerCase().includes('united states') || country?.toLowerCase().includes('canada') || country?.toLowerCase() === 'us' || country?.toLowerCase() === 'usa')) {
    s = '1' + s;
  }
  if (s.length < 8) return null;
  return s;
}

// wa.me deep link with prefilled message. Opens WhatsApp Web (or the
// mobile app) directly on the chat with the compose box pre-filled —
// user just hits Send inside WhatsApp itself.
function waDmLink(phoneE164: string, message: string): string {
  return `https://wa.me/${phoneE164}?text=${encodeURIComponent(message)}`;
}

function leadContact(lead: Lead, channel: Channel): string | null {
  if (channel === 'instagram') return extractIgHandle(lead);
  if (channel === 'whatsapp') return normalizeE164(lead.phone, lead.country);
  return null;
}

// ═══════════════════════════════════════════════════════
export default function BulkDmSendModal({ isOpen, onClose, leads, channel, onCompleted }: Props) {
  const isIg = channel === 'instagram';
  const isWa = channel === 'whatsapp';
  const channelMeta = isIg
    ? { label: 'Instagram DM', icon: Instagram, color: 'text-pink-400', bg: 'from-pink-500/30 to-fuchsia-500/30', border: 'border-pink-500/40', dot: 'bg-pink-400' }
    : { label: 'WhatsApp', icon: MessageCircle, color: 'text-green-400', bg: 'from-green-500/30 to-emerald-500/30', border: 'border-green-500/40', dot: 'bg-green-400' };

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
  // WhatsApp-only: gap timer between sends (soft — displayed but not enforced)
  const [waLastSentAt, setWaLastSentAt] = useState<number | null>(null);
  const [waGapRemaining, setWaGapRemaining] = useState(0);
  // IG send-order preference — persisted so operator's choice sticks across sessions
  const [sendOrder, setSendOrder] = useState<SendOrder>('grouped');
  // IG-only: has the operator confirmed they've switched to the current cluster's account?
  // Reset whenever the cluster changes. Blocks Open-in-IG until acknowledged so nobody
  // accidentally sends 30 messages from the wrong account.
  const [switchAcknowledged, setSwitchAcknowledged] = useState(false);

  // ─── Load templates + (IG only) warm accounts ─────────────────
  useEffect(() => {
    if (!isOpen) return;
    setPhase('setup');
    setError(null);
    setQueue([]);
    setCurrentIndex(0);
    setSelectedTemplateId('');
    setCustomTemplate('');
    setWaLastSentAt(null);
    setWaGapRemaining(0);
    setSwitchAcknowledged(false);
    // Restore preferred send order from localStorage — sticks across sessions
    if (isIg && typeof window !== 'undefined') {
      const saved = window.localStorage.getItem('prospex_send_order');
      if (saved === 'round_robin' || saved === 'grouped') setSendOrder(saved);
    }
    (async () => {
      setLoading(true);
      const channelFilter = isIg
        ? 'channel.eq.instagram,channel.eq.all'
        : 'channel.eq.whatsapp,channel.eq.all';
      const tplP = supabase.from('conversation_templates').select('id, name, category, content, channel')
        .eq('is_active', true).or(channelFilter).order('category');
      const accP = isIg
        ? supabase.from('ig_accounts').select('id, username, display_name, status, daily_sent_today, daily_limit, daily_target, warmup_stage, warmup_started_at, notes')
            .eq('status', 'active').order('username')
        : Promise.resolve({ data: [] });
      const [tpl, acc] = await Promise.all([tplP, accP]);
      setTemplates((tpl.data || []) as DbTemplate[]);
      setAccounts((acc.data || []) as WarmAccount[]);
      setLoading(false);
    })();
  }, [isOpen, isIg]);

  // ─── WhatsApp: countdown timer between sends ─────────
  useEffect(() => {
    if (!isWa || !waLastSentAt) return;
    const tick = () => {
      const elapsed = (Date.now() - waLastSentAt) / 1000;
      const remaining = Math.max(0, WHATSAPP_MIN_GAP_SECONDS - elapsed);
      setWaGapRemaining(remaining);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [isWa, waLastSentAt]);

  // ─── Filter leads with the required contact channel ──
  const eligibleLeads = useMemo(
    () => leads.filter(l => leadContact(l, channel) !== null),
    [leads, channel]
  );
  const skippedNoHandle = leads.length - eligibleLeads.length;

  // ─── Compute effective remaining capacity ──────────
  // IG: sum of remaining KPI target across active warm accounts (respects
  //     warmup ladder — 5/10/20/30 per account depending on days in ramp).
  // WA: single personal WhatsApp Web — cap at WHATSAPP_SAFE_DAILY_CAP.
  //     We can't read what's been sent today outside Prospex, so the cap
  //     is a per-session limit for this modal opening.
  const accountCapacity = useMemo(() => {
    if (!isIg) return [];
    return accounts.map(a => {
      const w = computeWarmupState(a);
      const used = a.daily_sent_today || 0;
      const remaining = Math.max(0, w.effective_target - used);
      return { username: a.username, remaining, stage: w.stage, target: w.effective_target };
    }).filter(a => a.stage !== 'new' && a.stage !== 'paused' && a.remaining > 0);
  }, [accounts, isIg]);
  const totalCapacity = isIg
    ? accountCapacity.reduce((s, a) => s + a.remaining, 0)
    : WHATSAPP_SAFE_DAILY_CAP;

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
    if (isIg && accountCapacity.length === 0) {
      setError('No warm accounts have capacity left today. Start a warmup or wait for daily reset.');
      return;
    }
    if (eligibleLeads.length === 0) {
      setError(isIg ? 'None of the selected leads have an Instagram handle.' : 'None of the selected leads have a valid phone number.');
      return;
    }

    const rows: QueueRow[] = [];

    if (isIg) {
      // Lookup: username → account row (for pulling notes/hints later)
      const accByName = new Map(accounts.map(a => [a.username, a]));
      const notesFor = (u: string) => accByName.get(u)?.notes || null;

      if (sendOrder === 'grouped') {
        // WATERFALL: fill each account to its remaining capacity in order,
        // then move to next account. Result: consecutive leads in the queue
        // share the same sender, so the operator switches accounts once per
        // ~30 sends instead of every send.
        let leadIdx = 0;
        for (const acc of accountCapacity) {
          for (let i = 0; i < acc.remaining && leadIdx < eligibleLeads.length; i++) {
            const lead = eligibleLeads[leadIdx++];
            rows.push({
              lead, sender_account: acc.username,
              sender_notes: notesFor(acc.username),
              message: personalize(template.content, lead), outcome: 'pending',
            });
          }
          if (leadIdx >= eligibleLeads.length) break;
        }
      } else {
        // ROUND-ROBIN (legacy) — 1 lead per account then rotate. Fairer mix
        // but every send is on a different account.
        const takes = new Map<string, number>();
        let cursor = 0;
        for (const lead of eligibleLeads) {
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
          if (!assigned) break;
          rows.push({
            lead, sender_account: assigned,
            sender_notes: notesFor(assigned),
            message: personalize(template.content, lead), outcome: 'pending',
          });
        }
      }
    } else {
      // WhatsApp: single sender (user's personal WA), cap at safe daily.
      const cap = Math.min(eligibleLeads.length, WHATSAPP_SAFE_DAILY_CAP);
      for (let i = 0; i < cap; i++) {
        const lead = eligibleLeads[i];
        rows.push({
          lead, sender_account: 'personal_whatsapp',
          sender_notes: null,
          message: personalize(template.content, lead), outcome: 'pending',
        });
      }
    }

    if (rows.length === 0) {
      setError('No capacity to send anything today.');
      return;
    }
    setQueue(rows);
    setCurrentIndex(0);
    setSwitchAcknowledged(false); // reset — first cluster needs to be acknowledged
    setPhase('run');
  };

  // ─── Current lead + cluster derivation ────────
  const current = queue[currentIndex];
  const currentContact = current ? leadContact(current.lead, channel) : null;

  // Cluster metadata (grouped mode only): how many consecutive leads share
  // the same sender_account, where the current cluster starts/ends, and
  // whether we're on the very first lead of a new cluster (→ show the
  // "SWITCH TO" banner).
  const clusterInfo = useMemo(() => {
    if (!isIg || sendOrder !== 'grouped' || queue.length === 0 || !current) {
      return { isClusterStart: false, clusterIndex: 0, clusterTotal: 0, clusterSize: 0, positionInCluster: 0, totalClusters: 0 };
    }
    // Cluster start = first lead of the queue, OR previous lead had a different sender
    const prev = currentIndex > 0 ? queue[currentIndex - 1] : null;
    const isClusterStart = !prev || prev.sender_account !== current.sender_account;
    // Count leads in this cluster (contiguous same-sender run around currentIndex)
    let start = currentIndex;
    while (start > 0 && queue[start - 1].sender_account === current.sender_account) start--;
    let end = currentIndex;
    while (end < queue.length - 1 && queue[end + 1].sender_account === current.sender_account) end++;
    const clusterSize = end - start + 1;
    const positionInCluster = currentIndex - start + 1;
    // Total clusters = distinct sender_accounts in queue order
    let totalClusters = 0;
    let clusterIndex = 0;
    let lastSender: string | null = null;
    for (let i = 0; i < queue.length; i++) {
      if (queue[i].sender_account !== lastSender) {
        totalClusters++;
        if (i <= currentIndex) clusterIndex = totalClusters;
      }
      lastSender = queue[i].sender_account;
    }
    return { isClusterStart, clusterIndex, clusterTotal: totalClusters, clusterSize, positionInCluster, totalClusters };
  }, [current, currentIndex, queue, isIg, sendOrder]);

  // Reset the "I've switched" acknowledgement whenever the operator lands
  // on the first lead of a new cluster. Blocks Open-in-IG until they confirm.
  useEffect(() => {
    if (isIg && sendOrder === 'grouped' && clusterInfo.isClusterStart) {
      setSwitchAcknowledged(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.sender_account]);

  // ─── Open in the channel's native app ─────────
  // IG: opens ig.me/m/<handle> — user has to paste the message
  // WA: opens wa.me/<phone>?text=<encoded> — message prefills automatically
  // In grouped IG mode, blocked until the operator confirms they've switched
  // to the correct account (guards against 30 sends going out from the wrong @).
  const openInChannel = async () => {
    if (!current || !currentContact) return;
    if (isIg && sendOrder === 'grouped' && !switchAcknowledged) return;
    if (isIg) {
      try {
        await navigator.clipboard.writeText(current.message);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch { /* clipboard blocked without gesture — no-op, IG still opens */ }
      window.open(igDmLink(currentContact), '_blank', 'noopener,noreferrer');
    } else {
      window.open(waDmLink(currentContact, current.message), '_blank', 'noopener,noreferrer');
    }
  };

  const persistSendOrder = (v: SendOrder) => {
    setSendOrder(v);
    if (typeof window !== 'undefined') window.localStorage.setItem('prospex_send_order', v);
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
            channel,
            stage: 'cold_open',
            message_sent: current.message,
            sent_by: 'manual',
            // WA: no per-account counter to bump; log null so it doesn't
            // show up misleadingly as an @ig_account in the scorecard.
            sender_account: isIg ? current.sender_account : null,
            outcome,
            confirmed: outcome === 'sent',
          }),
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error || 'Log failed');
      }

      // WA-only: reset the pacing timer so the UI can nudge the user
      if (isWa && outcome === 'sent') {
        setWaLastSentAt(Date.now());
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
      if (e.key === 'o' || e.key === 'O') { e.preventDefault(); openInChannel(); }
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
      <div ref={containerRef} className={cn('card bg-prospex-surface max-w-3xl w-full max-h-[92vh] flex flex-col', channelMeta.border)} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="p-4 border-b border-prospex-border flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2">
            <Rocket className={cn('w-5 h-5', channelMeta.color)} />
            <div>
              <h2 className="text-sm font-mono font-bold text-prospex-text">Fast {channelMeta.label} Sender</h2>
              <p className="text-[10px] text-prospex-dim">
                {phase === 'setup' && (isIg
                  ? `${eligibleLeads.length} of ${leads.length} leads have an IG handle · ${totalCapacity} sends available today across ${accountCapacity.length} warm account${accountCapacity.length === 1 ? '' : 's'}`
                  : `${eligibleLeads.length} of ${leads.length} leads have a valid phone · safe daily cap ${WHATSAPP_SAFE_DAILY_CAP}/day from personal WhatsApp Web`
                )}
                {phase === 'run' && `Lead ${currentIndex + 1} of ${queue.length} · Space=Sent · S=Skip · B=Blocked · O=Open ${isIg ? 'IG' : 'WA'} · ←/→=Nav`}
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
                  {skippedNoHandle} lead{skippedNoHandle === 1 ? '' : 's'} without a {isIg ? 'valid IG handle' : 'valid phone number'} will be skipped.
                </div>
              )}
              {isIg && totalCapacity < eligibleLeads.length && totalCapacity > 0 && (
                <div className="p-2 bg-amber-500/10 border border-amber-500/30 rounded text-[11px] text-amber-400">
                  <Flame className="w-3 h-3 inline mr-1" />
                  Only {totalCapacity} sends available today across your warm accounts — the queue will cap at {totalCapacity}. Add more warm accounts to increase daily throughput.
                </div>
              )}
              {isIg && totalCapacity === 0 && (
                <div className="p-3 bg-prospex-red/10 border border-prospex-red/30 rounded text-[11px] text-prospex-red">
                  <AlertCircle className="w-3 h-3 inline mr-1" />
                  No warm accounts with capacity today. Either start a warmup, wait for the daily reset, or graduate an in-warmup account.
                </div>
              )}
              {isWa && (
                <div className="p-2.5 bg-green-500/10 border border-green-500/30 rounded text-[11px] text-green-400 space-y-1">
                  <p><Clock className="w-3 h-3 inline mr-1" /><strong>WhatsApp pacing:</strong> aim for ~60-90 seconds between cold sends. WhatsApp Web flags velocity spikes even for manual sends.</p>
                  <p className="text-green-300/80">Realistic safe cap from a personal WhatsApp: ~{WHATSAPP_SAFE_DAILY_CAP}/day for cold outreach. Higher volumes OK for opted-in contacts.</p>
                </div>
              )}

              {/* Account capacity breakdown (IG only) */}
              {isIg && accountCapacity.length > 0 && (
                <div>
                  <p className="text-[10px] font-mono uppercase text-prospex-dim mb-1.5">Sending from</p>
                  <div className="flex flex-wrap gap-1.5">
                    {accountCapacity.map(a => (
                      <span key={a.username} className="text-[10px] font-mono bg-prospex-bg border border-prospex-border rounded px-2 py-0.5">
                        @{a.username} · <span className={cn('font-bold', channelMeta.color)}>{a.remaining}</span> left
                        {a.stage === 'warming' && <span className="ml-1 text-amber-400">🔥warming</span>}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Send order — grouped vs round-robin — IG only, only useful with 2+ accounts */}
              {isIg && accountCapacity.length >= 2 && (
                <div>
                  <p className="text-[10px] font-mono uppercase text-prospex-dim mb-1.5">Send order</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <button onClick={() => persistSendOrder('grouped')}
                      className={cn('text-left p-2.5 rounded border transition-colors',
                        sendOrder === 'grouped' ? 'bg-orange-500/10 border-orange-500/40 text-prospex-text' : 'bg-prospex-bg border-prospex-border text-prospex-muted hover:text-prospex-text')}>
                      <p className="text-[11px] font-mono flex items-center gap-1.5">
                        {sendOrder === 'grouped' && <Check className="w-3 h-3 text-orange-400" />}
                        🎯 Grouped by account <span className="text-[9px] text-prospex-dim">(recommended)</span>
                      </p>
                      <p className="text-[9px] text-prospex-dim mt-0.5">
                        Fills @account_1 to its cap, then switches. ~{accountCapacity.length} account switches instead of ~{Math.min(eligibleLeads.length, totalCapacity)}.
                      </p>
                    </button>
                    <button onClick={() => persistSendOrder('round_robin')}
                      className={cn('text-left p-2.5 rounded border transition-colors',
                        sendOrder === 'round_robin' ? 'bg-orange-500/10 border-orange-500/40 text-prospex-text' : 'bg-prospex-bg border-prospex-border text-prospex-muted hover:text-prospex-text')}>
                      <p className="text-[11px] font-mono flex items-center gap-1.5">
                        {sendOrder === 'round_robin' && <Check className="w-3 h-3 text-orange-400" />}
                        🔄 Round-robin
                      </p>
                      <p className="text-[9px] text-prospex-dim mt-0.5">
                        Alternates every send. Fairer mix but you switch accounts constantly. Only use for very small batches.
                      </p>
                    </button>
                  </div>
                </div>
              )}
              {isWa && (
                <div>
                  <p className="text-[10px] font-mono uppercase text-prospex-dim mb-1.5">Sending from</p>
                  <span className="inline-flex items-center gap-1.5 text-[10px] font-mono bg-prospex-bg border border-green-500/30 rounded px-2 py-0.5 text-green-400">
                    <Phone className="w-2.5 h-2.5" /> Personal WhatsApp Web
                  </span>
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
                <div className={cn('h-full transition-all', channelMeta.dot)} style={{ width: `${((currentIndex + 1) / queue.length) * 100}%` }} />
              </div>

              {/* SWITCH ACCOUNT banner — IG grouped mode only, at every cluster start */}
              {isIg && sendOrder === 'grouped' && clusterInfo.isClusterStart && (
                <div className={cn(
                  'p-3 rounded-lg border-2 transition-colors',
                  switchAcknowledged ? 'bg-prospex-green/10 border-prospex-green/40' : 'bg-orange-500/15 border-orange-500/50 animate-pulse'
                )}>
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 mt-0.5">
                      {switchAcknowledged ? <Check className="w-5 h-5 text-prospex-green" /> : <div className="w-5 h-5 rounded-full bg-orange-500 flex items-center justify-center text-white text-[11px] font-bold">!</div>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-mono font-bold text-prospex-text">
                        {switchAcknowledged ? '✓ Ready to send from' : '🔔 SWITCH TO'} <span className="text-orange-400">@{current.sender_account}</span>
                        <span className="text-[10px] text-prospex-dim font-normal ml-2">
                          Cluster {clusterInfo.clusterIndex} of {clusterInfo.totalClusters} · {clusterInfo.clusterSize} messages
                        </span>
                      </p>
                      {current.sender_notes && (
                        <p className="text-[10px] text-prospex-cyan mt-1 font-mono">📍 {current.sender_notes}</p>
                      )}
                      {!switchAcknowledged && (
                        <p className="text-[10px] text-prospex-dim mt-1">
                          In Instagram: switch to <strong>@{current.sender_account}</strong>. Then click below to unlock the send button.
                        </p>
                      )}
                    </div>
                    {!switchAcknowledged && (
                      <button onClick={() => setSwitchAcknowledged(true)}
                        className="btn-primary text-xs bg-orange-500/20 text-orange-400 border-orange-500/40 hover:bg-orange-500/30 flex-shrink-0">
                        <Check className="w-3 h-3" /> I&apos;ve switched
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* WA pacing reminder */}
              {isWa && waGapRemaining > 0 && (
                <div className="p-2 bg-amber-500/10 border border-amber-500/30 rounded text-[11px] text-amber-400 flex items-center gap-2">
                  <Clock className="w-3 h-3" />
                  <span>Wait {Math.ceil(waGapRemaining)}s before next send — protects your WhatsApp from velocity flags.</span>
                </div>
              )}

              {/* Lead card */}
              <div className="p-3 bg-prospex-bg rounded-lg border border-prospex-border">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-mono font-bold text-prospex-text truncate">{current.lead.business_name}</p>
                    <div className="flex items-center gap-2 flex-wrap mt-0.5">
                      <span className="text-[10px] text-prospex-dim flex items-center gap-1"><MapPin className="w-2.5 h-2.5" /> {current.lead.city || '—'}</span>
                      {current.lead.niche && <span className="text-[10px] text-prospex-dim">· {current.lead.niche}</span>}
                      <span className={cn('text-[10px] flex items-center gap-1 font-mono', channelMeta.color)}>
                        {isIg ? <Instagram className="w-2.5 h-2.5" /> : <MessageCircle className="w-2.5 h-2.5" />}
                        {isIg ? `@${currentContact}` : `+${currentContact}`}
                      </span>
                    </div>
                  </div>
                  {isIg && (
                    <div className="flex-shrink-0 text-right">
                      <span className="text-[9px] font-mono text-prospex-dim">from</span>
                      <p className={cn('text-[11px] font-mono', channelMeta.color)}>@{current.sender_account}</p>
                    </div>
                  )}
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
                <button onClick={openInChannel}
                  disabled={isIg && sendOrder === 'grouped' && !switchAcknowledged}
                  className={cn(
                    'w-full flex items-center justify-center gap-2 border py-3 rounded-lg font-mono text-sm transition-colors',
                    isIg && sendOrder === 'grouped' && !switchAcknowledged ? 'bg-prospex-bg text-prospex-dim border-prospex-border cursor-not-allowed'
                    : isIg ? 'bg-pink-500/20 text-pink-400 border-pink-500/40 hover:bg-pink-500/30'
                    : 'bg-green-500/20 text-green-400 border-green-500/40 hover:bg-green-500/30'
                  )}>
                  {isIg && sendOrder === 'grouped' && !switchAcknowledged
                    ? <>🔒 Confirm account switch first</>
                    : isIg
                      ? (copied ? <><Check className="w-4 h-4" /> Copied · IG opened → paste + send</> : <><Instagram className="w-4 h-4" /> Open in Instagram (O)</>)
                      : <><MessageCircle className="w-4 h-4" /> Open in WhatsApp Web (O) · message auto-prefills</>
                  }
                </button>
                {isIg && sendOrder === 'grouped' && clusterInfo.clusterSize > 0 && (
                  <p className="text-[10px] text-prospex-dim text-center -mt-1">
                    Sending {clusterInfo.positionInCluster}/{clusterInfo.clusterSize} from @{current.sender_account} · cluster {clusterInfo.clusterIndex} of {clusterInfo.totalClusters}
                  </p>
                )}

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
            {phase === 'setup' && (isIg
              ? 'You still tap "Send" inside Instagram itself — keeps accounts safe.'
              : 'You still tap "Send" inside WhatsApp Web — keeps your number safe.')}
            {phase === 'run' && `Keyboard: Space=Sent · S=Skip · B=Blocked · O=Open ${isIg ? 'IG' : 'WA'}`}
            {phase === 'done' && 'Nice work.'}
          </div>
          <div className="flex items-center gap-2">
            {phase === 'setup' && (
              <button onClick={startBulkSend} disabled={loading || !selectedTemplateId || (selectedTemplateId === 'custom' && !customTemplate.trim()) || (isIg && totalCapacity === 0)}
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
