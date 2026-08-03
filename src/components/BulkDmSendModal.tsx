'use client';

import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import {
  X, Instagram, MessageCircle, ExternalLink, Check, SkipForward, Ban, Loader2, ChevronLeft, ChevronRight,
  Sparkles, AlertCircle, Flame, Copy, Rocket, User, MapPin, Trophy, Clock, Phone,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { computeWarmupState } from '@/lib/ig-warmup';
import { useAuth } from '@/lib/auth-context';
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
  // When set, the modal opens with ONLY this account included (all others
  // in the fleet start disabled). Used by Hot List Quick DM to pre-pick
  // an account before opening the send flow. Operator can still toggle
  // the others on via the switcher.
  initialAccount?: string;
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

// Two ways to open Instagram to a specific user, with different reliability
// tradeoffs. User picks their preferred primary path via the setup toggle;
// the other one is always shown as a fallback tap.
//
//   igDirectDmLink  — ig.me/m/<handle>. On mobile app / IG Web with app
//                     handoff: opens DM composer instantly (best case
//                     0-click after landing). On desktop web without the
//                     mobile app: unpredictable; often lands on IG home
//                     page. Fastest when it works.
//   igProfileLink   — instagram.com/<handle>/. Always opens the target's
//                     profile page. User clicks Message from there (one
//                     extra tap) and lands in the composer with recipient
//                     locked in. 100% reliable across every browser.
function igDirectDmLink(handle: string): string {
  return `https://ig.me/m/${handle}`;
}
function igProfileLink(handle: string): string {
  return `https://www.instagram.com/${handle}/`;
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
export default function BulkDmSendModal({ isOpen, onClose, leads, channel, onCompleted, initialAccount }: Props) {
  const { teamMember, user } = useAuth();
  // Operator label — used to attribute each send to a specific team member
  // in outreach_logs.sent_by. Falls back to 'manual' if no auth context.
  const operatorLabel = teamMember?.full_name || teamMember?.email || user?.email || 'manual';
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
  // IG DM open mode — 'direct' tries ig.me/m/ first (faster if it works),
  // 'profile' goes straight to profile URL (reliable). Persisted.
  const [igOpenMode, setIgOpenMode] = useState<'direct' | 'profile'>('profile');
  // Set of account usernames the operator has explicitly excluded for this
  // session. Defaults to empty (all available accounts included). Not
  // persisted — it's a per-session choice, not a long-term pref.
  const [disabledAccounts, setDisabledAccounts] = useState<Set<string>>(new Set());
  // Recent-leads popover — shows the last N leads sent from a specific
  // account, so operator can avoid double-messaging across sessions.
  interface RecentLead { lead_business: string | null; created_at: string; outcome: string | null; lead_id: string | null }
  const [recentForAccount, setRecentForAccount] = useState<string | null>(null);
  const [recentLeads, setRecentLeads] = useState<RecentLead[]>([]);
  const [recentLoading, setRecentLoading] = useState(false);
  // Turbo mode — collapses "open IG" + "log sent" + "advance" into one action.
  // Trusts the operator to actually complete the send inside Instagram; log
  // fires optimistically the moment Open is tapped. Persisted.
  const [turboMode, setTurboMode] = useState(false);
  // Wall-clock start of the run phase — used to compute avg time per lead
  // in the session summary.
  const [sessionStartTs, setSessionStartTs] = useState<number | null>(null);
  // Mid-session swap: reassign the current lead's sender_account without
  // touching the rest of the queue. Toggled by tapping "from @xxx" label.
  const [showSwapPicker, setShowSwapPicker] = useState(false);
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
    setDisabledAccounts(new Set());
    // Restore preferred send order + DM open mode from localStorage
    if (isIg && typeof window !== 'undefined') {
      const saved = window.localStorage.getItem('prospex_send_order');
      if (saved === 'round_robin' || saved === 'grouped') setSendOrder(saved);
      const savedMode = window.localStorage.getItem('prospex_ig_open_mode');
      if (savedMode === 'direct' || savedMode === 'profile') setIgOpenMode(savedMode);
      setTurboMode(window.localStorage.getItem('prospex_turbo_mode') === '1');
    }
    (async () => {
      setLoading(true);
      const channelFilter = isIg
        ? 'channel.eq.instagram,channel.eq.all'
        : 'channel.eq.whatsapp,channel.eq.all';
      const tplP = supabase.from('conversation_templates').select('id, name, category, content, channel')
        .eq('is_active', true).or(channelFilter).order('category');
      // Load ALL ig_accounts (was filtering to status='active' only, which
      // silently hid accounts in warming/paused/resting states from the
      // fleet view — operator would see "12 accounts configured, 2 selectable"
      // with no way to see why the other 10 were missing).
      // The accountCapacity memo below still filters to only sendable ones
      // for the queue; the setup screen now shows the full fleet with reasons.
      const accP = isIg
        ? supabase.from('ig_accounts').select('id, username, display_name, status, daily_sent_today, daily_limit, daily_target, warmup_stage, warmup_started_at, notes')
            .order('username')
        : Promise.resolve({ data: [] });
      const [tpl, acc] = await Promise.all([tplP, accP]);
      const loadedAccounts = (acc.data || []) as WarmAccount[];
      setTemplates((tpl.data || []) as DbTemplate[]);
      setAccounts(loadedAccounts);
      // If caller pre-selected a specific account (Hot List Quick DM flow),
      // start the session with only that account included. Operator can
      // still open others via the switcher chips.
      if (initialAccount && isIg) {
        setDisabledAccounts(new Set(loadedAccounts.filter(a => a.username !== initialAccount).map(a => a.username)));
      }
      setLoading(false);
    })();
  }, [isOpen, isIg, initialAccount]);

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
  // Every account gets a status verdict so the setup screen can show the
  // full fleet + explain why each unavailable one isn't in rotation.
  const accountStatus = useMemo(() => {
    if (!isIg) return [];
    return accounts.map(a => {
      const w = computeWarmupState(a);
      const used = a.daily_sent_today || 0;
      const remaining = Math.max(0, w.effective_target - used);
      let reason: string | null = null;
      if (a.status && a.status !== 'active') reason = `status: ${a.status}`;
      else if (w.stage === 'new') reason = 'warmup not started';
      else if (w.stage === 'paused') reason = 'paused';
      else if (remaining <= 0) reason = `at cap · ${used}/${w.effective_target} today`;
      return {
        username: a.username, remaining, stage: w.stage, target: w.effective_target,
        used, status: a.status, unavailable: reason !== null, reason,
        display_name: a.display_name, notes: a.notes,
        hard_limit: w.hard_limit,
      };
    });
  }, [accounts, isIg]);

  // accountCapacity = the pool the queue actually draws from. Requires
  // (a) not unavailable (warmup / status / at-cap gates) AND
  // (b) not disabled by the operator's session-level selection.
  const accountCapacity = useMemo(
    () => accountStatus.filter(a => !a.unavailable && !disabledAccounts.has(a.username)),
    [accountStatus, disabledAccounts],
  );
  const availableAccounts = useMemo(
    () => accountStatus.filter(a => !a.unavailable),
    [accountStatus],
  );
  const unavailableAccounts = useMemo(
    () => accountStatus.filter(a => a.unavailable),
    [accountStatus],
  );
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
    setSessionStartTs(Date.now());
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

  // Prefetch the next lead's IG profile page so it's warm in the browser
  // cache before the operator taps Open. Cuts ~500-1500ms off perceived
  // load time per lead. Fire-and-forget — no error handling needed.
  useEffect(() => {
    if (!isIg || phase !== 'run') return;
    const nextIdx = currentIndex + 1;
    if (nextIdx >= queue.length) return;
    const nextLead = queue[nextIdx];
    const nextHandle = leadContact(nextLead.lead, 'instagram');
    if (!nextHandle) return;
    const url = igOpenMode === 'direct' ? igDirectDmLink(nextHandle) : igProfileLink(nextHandle);
    const link = document.createElement('link');
    link.rel = 'prefetch';
    link.href = url;
    link.crossOrigin = 'anonymous';
    document.head.appendChild(link);
    return () => { document.head.removeChild(link); };
  }, [currentIndex, queue, isIg, phase, igOpenMode]);

  // ─── Open in the channel's native app ─────────
  // IG: primary route depends on igOpenMode preference. Either way, message
  //     is copied to clipboard first so the user can paste-and-send.
  // WA: opens wa.me/<phone>?text=<encoded> — message prefills automatically
  // Grouped IG mode blocks until switchAcknowledged (safety gate).
  const copyMessageIg = async () => {
    if (!current) return;
    try {
      await navigator.clipboard.writeText(current.message);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard blocked without gesture — non-fatal */ }
  };

  const openInChannel = async () => {
    if (!current || !currentContact) return;
    if (isIg && sendOrder === 'grouped' && !switchAcknowledged) return;
    if (isIg) {
      await copyMessageIg();
      const url = igOpenMode === 'direct' ? igDirectDmLink(currentContact) : igProfileLink(currentContact);
      window.open(url, '_blank', 'noopener,noreferrer');
    } else {
      window.open(waDmLink(currentContact, current.message), '_blank', 'noopener,noreferrer');
    }
  };

  // Fallback opener — always uses the OTHER route than what the primary
  // tried. If primary was direct DM and landed on IG home, one click here
  // opens the profile page instead. If primary was profile-first, this
  // gives the operator a chance to try the direct DM shortlink.
  const openIgFallback = async () => {
    if (!current || !currentContact) return;
    await copyMessageIg();
    const url = igOpenMode === 'direct' ? igProfileLink(currentContact) : igDirectDmLink(currentContact);
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const persistSendOrder = (v: SendOrder) => {
    setSendOrder(v);
    if (typeof window !== 'undefined') window.localStorage.setItem('prospex_send_order', v);
  };
  const persistIgOpenMode = (v: 'direct' | 'profile') => {
    setIgOpenMode(v);
    if (typeof window !== 'undefined') window.localStorage.setItem('prospex_ig_open_mode', v);
  };
  const persistTurboMode = (v: boolean) => {
    setTurboMode(v);
    if (typeof window !== 'undefined') window.localStorage.setItem('prospex_turbo_mode', v ? '1' : '0');
  };

  // Swap the current lead's sender_account mid-session. Updates only the
  // current lead's queue row — later leads keep their original assignment,
  // so a mid-cluster swap doesn't shred the grouped-mode structure.
  // If swapping into a new account, reset the switch-acknowledged gate
  // so the operator visibly confirms the account change before sending.
  const swapCurrentLeadAccount = (newUsername: string) => {
    if (!current || newUsername === current.sender_account) {
      setShowSwapPicker(false);
      return;
    }
    const newNotes = accounts.find(a => a.username === newUsername)?.notes || null;
    setQueue(prev => prev.map((r, i) => i === currentIndex
      ? { ...r, sender_account: newUsername, sender_notes: newNotes }
      : r));
    if (sendOrder === 'grouped') setSwitchAcknowledged(false);
    setShowSwapPicker(false);
  };

  // Auto-close swap picker when advancing to a different lead.
  useEffect(() => { setShowSwapPicker(false); }, [currentIndex]);

  // Open the recent-leads popover for a specific account. Fetches last 20
  // sent-outreach logs where sender_account=<username> so operator can
  // eyeball who's already been contacted from that account today/recently.
  const openRecentForAccount = async (username: string) => {
    setRecentForAccount(username);
    setRecentLeads([]);
    setRecentLoading(true);
    try {
      const { data } = await supabase
        .from('outreach_logs')
        .select('lead_business, created_at, outcome, lead_id')
        .eq('sender_account', username)
        .eq('outcome', 'sent')
        .order('created_at', { ascending: false })
        .limit(20);
      setRecentLeads((data || []) as RecentLead[]);
    } finally { setRecentLoading(false); }
  };

  // TURBO: one action = open IG + copy message + log sent + advance.
  // Fires the log optimistically the moment the operator taps Open, on the
  // assumption they'll follow through with paste+send inside Instagram.
  // If they don't, the counter over-reports for that lead — that's the
  // knowingly-accepted trade-off for max throughput.
  const openAndAdvance = async () => {
    if (!current || !currentContact) return;
    if (isIg && sendOrder === 'grouped' && !switchAcknowledged) return;
    await openInChannel();
    // Small tick so the new tab opens visibly before we advance in the
    // background — avoids the "click did nothing" feel if the tab was
    // blocked or slow. Then log + advance.
    setTimeout(() => { logAndAdvance('sent'); }, 60);
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
            sent_by: operatorLabel,
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
      else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        // Turbo mode makes the primary key do the full cycle (open + log + advance).
        // Standard mode keeps Space = "just log sent" so the operator can advance
        // without re-opening a tab they already opened.
        if (isIg && turboMode) openAndAdvance();
        else logAndAdvance('sent');
      }
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
        <div className="p-3 md:p-4 border-b border-prospex-border flex items-center justify-between flex-shrink-0 gap-2">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <Rocket className={cn('w-5 h-5 flex-shrink-0', channelMeta.color)} />
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-mono font-bold text-prospex-text truncate">Fast {channelMeta.label}</h2>
              <p className="text-[10px] text-prospex-dim leading-tight">
                {phase === 'setup' && (isIg
                  ? <>{eligibleLeads.length} of {leads.length} leads · {totalCapacity} sends left today<span className="hidden md:inline"> across {accountCapacity.length} warm account{accountCapacity.length === 1 ? '' : 's'}</span></>
                  : <>{eligibleLeads.length} of {leads.length} leads · cap {WHATSAPP_SAFE_DAILY_CAP}/day<span className="hidden md:inline"> from personal WhatsApp Web</span></>
                )}
                {phase === 'run' && <>Lead {currentIndex + 1} of {queue.length}<span className="hidden md:inline"> · Space={isIg && turboMode ? 'Open+Sent+Next ⚡' : 'Sent'} · S=Skip · B=Blocked · O=Open {isIg ? 'IG' : 'WA'}</span></>}
                {phase === 'done' && 'Session complete'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-prospex-dim hover:text-prospex-text p-2 rounded flex-shrink-0 min-w-[40px] min-h-[40px] flex items-center justify-center" title="Close">
            <X className="w-5 h-5 md:w-4 md:h-4" />
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

              {/* Account switcher (IG only) — grid of info-rich cards.
                  Each card shows: @username, notes hint (Chrome Profile X),
                  sent today vs target with visual progress bar, remaining
                  capacity, warmup stage. Click to include/exclude from
                  the session queue. At-cap accounts are excluded from
                  this list entirely — they appear only in the "not
                  sending today" panel below. */}
              {isIg && availableAccounts.length > 0 && (
                <div>
                  <p className="text-[10px] font-mono uppercase text-prospex-dim mb-1.5 flex items-center justify-between gap-2 flex-wrap">
                    <span>
                      Sending from · <span className="text-prospex-cyan">{accountCapacity.length} of {availableAccounts.length} selected</span>
                      <span className="text-prospex-dim normal-case ml-1">· click any card to toggle</span>
                    </span>
                    <span className="flex items-center gap-2">
                      <button onClick={() => setDisabledAccounts(new Set())}
                        className="text-[10px] text-prospex-cyan hover:underline normal-case min-h-[28px] px-1">
                        Select all
                      </button>
                      <span className="text-prospex-dim">·</span>
                      <button onClick={() => setDisabledAccounts(new Set(availableAccounts.map(a => a.username)))}
                        className="text-[10px] text-prospex-dim hover:text-prospex-text normal-case min-h-[28px] px-1">
                        Clear
                      </button>
                    </span>
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                    {availableAccounts.map(a => {
                      const isDisabled = disabledAccounts.has(a.username);
                      const pct = a.target > 0 ? Math.min(100, Math.round((a.used / a.target) * 100)) : 0;
                      const barColor = pct >= 100 ? 'bg-prospex-green'
                        : pct >= 80 ? 'bg-prospex-cyan'
                        : pct >= 50 ? 'bg-amber-400'
                        : 'bg-prospex-cyan/40';
                      return (
                        <button key={a.username}
                          onClick={() => setDisabledAccounts(prev => {
                            const next = new Set(prev);
                            if (next.has(a.username)) next.delete(a.username);
                            else next.add(a.username);
                            return next;
                          })}
                          title={isDisabled ? `Click to include @${a.username} in this session` : `Click to exclude @${a.username} from this session`}
                          className={cn('text-left rounded-lg border transition-colors p-2.5 min-h-[80px]',
                            isDisabled
                              ? 'bg-prospex-bg border-prospex-border/50 opacity-60 hover:opacity-100'
                              : 'bg-prospex-cyan/5 border-prospex-cyan/40 hover:bg-prospex-cyan/10')}>
                          <div className="flex items-start justify-between gap-1.5 mb-1">
                            <div className="min-w-0 flex-1">
                              <p className={cn('text-xs font-mono font-bold truncate',
                                isDisabled ? 'text-prospex-dim line-through' : 'text-prospex-text')}>
                                @{a.username}
                              </p>
                              {(a.notes || a.display_name) && (
                                <p className="text-[9px] text-prospex-dim truncate mt-0.5" title={a.notes || a.display_name || ''}>
                                  {a.notes || a.display_name}
                                </p>
                              )}
                            </div>
                            {a.stage === 'warming' && (
                              <span className="text-[9px] font-mono text-amber-400 flex-shrink-0" title="Warming up — target ramps up daily">🔥 warm</span>
                            )}
                          </div>
                          <div className="flex items-center justify-between text-[10px] font-mono mb-1">
                            <span className={isDisabled ? 'text-prospex-dim' : 'text-prospex-muted'}>
                              {a.used}/{a.target} sent
                            </span>
                            <span className={cn('font-bold', isDisabled ? 'text-prospex-dim' : channelMeta.color)}>
                              {a.remaining} left
                            </span>
                          </div>
                          <div className="w-full h-1 bg-prospex-bg rounded-full overflow-hidden">
                            <div className={cn('h-full transition-all', isDisabled ? 'bg-prospex-border' : barColor)} style={{ width: `${pct}%` }} />
                          </div>
                          <div className="flex items-center justify-between text-[9px] text-prospex-dim mt-1">
                            <span>hard cap {a.hard_limit}</span>
                            <span>{isDisabled ? '✕ excluded' : '✓ in queue'}</span>
                          </div>
                          {/* Card actions — hoist above the button's click
                              handler with stopPropagation so tapping them
                              doesn't also toggle include/exclude. */}
                          <div className="flex items-center gap-2 mt-1.5 pt-1.5 border-t border-prospex-border/30">
                            <a href={`https://www.instagram.com/${a.username}/`} target="_blank" rel="noopener noreferrer"
                              onClick={e => e.stopPropagation()}
                              className="text-[9px] font-mono text-prospex-dim hover:text-pink-400 flex items-center gap-1 min-h-[28px]"
                              title={`Open @${a.username} on Instagram in a new tab`}>
                              <ExternalLink className="w-2.5 h-2.5" /> Open profile
                            </a>
                            <span className="text-prospex-dim">·</span>
                            <button onClick={e => { e.stopPropagation(); openRecentForAccount(a.username); }}
                              className="text-[9px] font-mono text-prospex-dim hover:text-prospex-cyan flex items-center gap-1 min-h-[28px]"
                              title={`Show recent sends from @${a.username}`}>
                              📋 Recent sent
                            </button>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  {accountCapacity.length === 0 && (
                    <p className="text-[10px] text-amber-400 mt-1.5">
                      ⚠ No accounts selected — click any card above to include it.
                    </p>
                  )}
                </div>
              )}

              {/* Unavailable accounts — the fix for "I have 12 accounts but
                  only 2 selectable". Shows the full unavailable set with
                  the reason each is out, plus a link to the IG Accounts
                  page where the operator can start warmup / resume / etc. */}
              {isIg && unavailableAccounts.length > 0 && (
                <div className="p-2.5 rounded border border-amber-500/30 bg-amber-500/5">
                  <p className="text-[10px] font-mono uppercase text-amber-400 mb-1.5 flex items-center justify-between gap-2">
                    <span>⚠ {unavailableAccounts.length} account{unavailableAccounts.length === 1 ? '' : 's'} not sending today</span>
                    <a href="/dm-campaigns" target="_blank" rel="noopener noreferrer"
                       className="text-[10px] text-prospex-cyan underline hover:text-prospex-text normal-case">
                      Fix in IG Accounts →
                    </a>
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {unavailableAccounts.map(a => {
                      const badge = a.reason?.includes('not started') ? '🆕'
                        : a.reason === 'paused' ? '⏸'
                        : a.reason?.includes('at cap') ? '🔴'
                        : a.reason?.startsWith('status:') ? '⏹'
                        : '⚠';
                      return (
                        <span key={a.username}
                              className="text-[10px] font-mono bg-prospex-bg border border-amber-500/20 rounded px-2 py-0.5 text-prospex-muted"
                              title={a.reason || 'unavailable'}>
                          {badge} @{a.username} <span className="text-prospex-dim">· {a.reason}</span>
                        </span>
                      );
                    })}
                  </div>
                  <p className="text-[9px] text-prospex-dim mt-2 leading-tight">
                    🆕 = warmup not started (click Start on the row) · ⏸ = paused · 🔴 = hit today&apos;s target · ⏹ = status not active
                  </p>
                </div>
              )}

              {/* IG DM open mode — direct vs profile. Applies whether or not you're using grouped mode. */}
              {isIg && (
                <div>
                  <p className="text-[10px] font-mono uppercase text-prospex-dim mb-1.5">How to open Instagram</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <button onClick={() => persistIgOpenMode('profile')}
                      className={cn('text-left p-2.5 rounded border transition-colors',
                        igOpenMode === 'profile' ? 'bg-pink-500/10 border-pink-500/40 text-prospex-text' : 'bg-prospex-bg border-prospex-border text-prospex-muted hover:text-prospex-text')}>
                      <p className="text-[11px] font-mono flex items-center gap-1.5">
                        {igOpenMode === 'profile' && <Check className="w-3 h-3 text-pink-400" />}
                        🔗 Open profile <span className="text-[9px] text-prospex-dim">(recommended)</span>
                      </p>
                      <p className="text-[9px] text-prospex-dim mt-0.5">
                        Always lands on the target&apos;s profile page. Click Message → paste → send. Works on every browser.
                      </p>
                    </button>
                    <button onClick={() => persistIgOpenMode('direct')}
                      className={cn('text-left p-2.5 rounded border transition-colors',
                        igOpenMode === 'direct' ? 'bg-pink-500/10 border-pink-500/40 text-prospex-text' : 'bg-prospex-bg border-prospex-border text-prospex-muted hover:text-prospex-text')}>
                      <p className="text-[11px] font-mono flex items-center gap-1.5">
                        {igOpenMode === 'direct' && <Check className="w-3 h-3 text-pink-400" />}
                        🚀 Direct DM <span className="text-[9px] text-prospex-dim">(faster if it works)</span>
                      </p>
                      <p className="text-[9px] text-prospex-dim mt-0.5">
                        Tries ig.me/m/&lt;handle&gt; — jumps straight to DM composer on mobile or if IG app is installed. Fallback button always visible if it lands on home page.
                      </p>
                    </button>
                  </div>
                </div>
              )}

              {/* Turbo mode — for max-speed operators. Open action becomes
                  a one-key round-trip (open → log sent → advance). */}
              {isIg && (
                <div>
                  <p className="text-[10px] font-mono uppercase text-prospex-dim mb-1.5">Send speed</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <button onClick={() => persistTurboMode(false)}
                      className={cn('text-left p-2.5 rounded border transition-colors',
                        !turboMode ? 'bg-pink-500/10 border-pink-500/40 text-prospex-text' : 'bg-prospex-bg border-prospex-border text-prospex-muted hover:text-prospex-text')}>
                      <p className="text-[11px] font-mono flex items-center gap-1.5">
                        {!turboMode && <Check className="w-3 h-3 text-pink-400" />}
                        🎯 Standard <span className="text-[9px] text-prospex-dim">(2 keys per lead)</span>
                      </p>
                      <p className="text-[9px] text-prospex-dim mt-0.5">
                        <kbd>O</kbd> opens IG · <kbd>Space</kbd> logs sent + advances. Log fires only when you confirm you actually sent.
                      </p>
                    </button>
                    <button onClick={() => persistTurboMode(true)}
                      className={cn('text-left p-2.5 rounded border transition-colors',
                        turboMode ? 'bg-orange-500/10 border-orange-500/40 text-prospex-text' : 'bg-prospex-bg border-prospex-border text-prospex-muted hover:text-prospex-text')}>
                      <p className="text-[11px] font-mono flex items-center gap-1.5">
                        {turboMode && <Check className="w-3 h-3 text-orange-400" />}
                        ⚡ Turbo <span className="text-[9px] text-prospex-dim">(1 key per lead)</span>
                      </p>
                      <p className="text-[9px] text-prospex-dim mt-0.5">
                        <kbd>Space</kbd> opens IG + logs sent + advances all at once. Log is optimistic — trusts you to complete the send in IG.
                      </p>
                    </button>
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
                {/* Grouped by category — native <optgroup> keeps the picker
                    scannable when there are 30+ templates. Category display
                    order matches the playbook's own flow. */}
                <select value={selectedTemplateId} onChange={e => setSelectedTemplateId(e.target.value)} className="input w-full text-xs">
                  <option value="">— pick a template —</option>
                  <option value="custom">✍️ Custom message (write your own)</option>
                  {(() => {
                    const groupOrder = ['cold_open', 'audition_opener', 'objection', 'closing', 'follow_up', 'voice_note', 'greeting', 'qualifying', 'booking', 'case_study', 'social_proof', 'general', 'gift_leads', 'sms_sequence', 'top_tier_no_ads', 'top_tier_with_ads', 'top_tier_multi_device'];
                    const groupLabels: Record<string, string> = {
                      cold_open: '🎯 Cold Open',
                      audition_opener: '🔥 Audition Openers',
                      objection: '🛡️ Objection Handlers',
                      closing: '✅ Close',
                      follow_up: '🔁 Follow-Up Sequence',
                      voice_note: '🎙️ Voice Note',
                      greeting: '👋 Greeting',
                      qualifying: '🔍 Qualifying',
                      booking: '📅 Booking',
                      case_study: '📊 Case Study',
                      social_proof: '⭐ Social Proof',
                      general: 'General',
                      gift_leads: '🎁 Gift Leads',
                      sms_sequence: '📱 SMS Sequence',
                      top_tier_no_ads: '🏆 Top Tier · No Ads',
                      top_tier_with_ads: '🏆 Top Tier · With Ads',
                      top_tier_multi_device: '🏆 Top Tier · Multi-Device',
                    };
                    const byCategory = new Map<string, typeof templates>();
                    for (const t of templates) {
                      const k = t.category || 'general';
                      if (!byCategory.has(k)) byCategory.set(k, []);
                      byCategory.get(k)!.push(t);
                    }
                    // Sort — known categories in playbook order first, then any unknown ones alphabetically
                    const known = groupOrder.filter(k => byCategory.has(k));
                    const unknown = Array.from(byCategory.keys()).filter(k => !groupOrder.includes(k)).sort();
                    return [...known, ...unknown].map(cat => (
                      <optgroup key={cat} label={groupLabels[cat] || cat}>
                        {byCategory.get(cat)!.map(t => (
                          <option key={t.id} value={t.id}>{t.name}</option>
                        ))}
                      </optgroup>
                    ));
                  })()}
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
                    <div className="flex-shrink-0 text-right relative">
                      <button onClick={() => setShowSwapPicker(v => !v)}
                        className="text-right hover:bg-prospex-bg rounded px-1.5 py-1 -mx-1 -my-1 transition-colors"
                        title="Tap to swap this lead's sender account">
                        <span className="text-[9px] font-mono text-prospex-dim block">from ▾</span>
                        <p className={cn('text-[11px] font-mono', channelMeta.color)}>@{current.sender_account}</p>
                      </button>
                      {/* Mid-session swap picker — only shows accounts that
                          are (a) in this session's queue eligibility AND
                          (b) not the current lead's already-assigned one. */}
                      {showSwapPicker && (
                        <div className="absolute right-0 top-full mt-1 z-20 min-w-[220px] card bg-prospex-surface border border-pink-500/40 shadow-xl p-1.5 text-left space-y-0.5 max-h-64 overflow-y-auto">
                          <p className="text-[9px] font-mono text-prospex-dim uppercase px-2 py-1">Swap to another account</p>
                          {accountCapacity.filter(a => a.username !== current.sender_account).length === 0 ? (
                            <p className="text-[10px] text-prospex-dim italic px-2 py-2">No other selected accounts have capacity right now.</p>
                          ) : accountCapacity.filter(a => a.username !== current.sender_account).map(a => (
                            <button key={a.username} onClick={() => swapCurrentLeadAccount(a.username)}
                              className="w-full text-left px-2 py-1.5 rounded hover:bg-pink-500/10 flex items-center justify-between gap-2 min-h-[32px]">
                              <span className="text-[11px] font-mono text-prospex-text truncate">@{a.username}</span>
                              <span className="text-[9px] font-mono text-prospex-dim flex-shrink-0">{a.remaining} left</span>
                            </button>
                          ))}
                        </div>
                      )}
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
                <button onClick={isIg && turboMode ? openAndAdvance : openInChannel}
                  disabled={isIg && sendOrder === 'grouped' && !switchAcknowledged}
                  className={cn(
                    'w-full flex items-center justify-center gap-2 border py-3 rounded-lg font-mono text-sm transition-colors',
                    isIg && sendOrder === 'grouped' && !switchAcknowledged ? 'bg-prospex-bg text-prospex-dim border-prospex-border cursor-not-allowed'
                    : isIg && turboMode ? 'bg-gradient-to-r from-orange-500/25 to-pink-500/25 text-orange-300 border-orange-500/50 hover:from-orange-500/40 hover:to-pink-500/40'
                    : isIg ? 'bg-pink-500/20 text-pink-400 border-pink-500/40 hover:bg-pink-500/30'
                    : 'bg-green-500/20 text-green-400 border-green-500/40 hover:bg-green-500/30'
                  )}>
                  {isIg && sendOrder === 'grouped' && !switchAcknowledged
                    ? <>🔒 Confirm account switch first</>
                    : isIg && turboMode
                      ? <>⚡ Open @{currentContact} + Log Sent + Next (Space)</>
                    : isIg
                      ? (copied
                          ? (igOpenMode === 'direct'
                              ? <><Check className="w-4 h-4" /> Copied · paste in DM → send</>
                              : <><Check className="w-4 h-4" /> Copied · click <strong>Message</strong> on profile → paste → send</>)
                          : (igOpenMode === 'direct'
                              ? <><Instagram className="w-4 h-4" /> Open DM with @{currentContact} (O)</>
                              : <><Instagram className="w-4 h-4" /> Open @{currentContact} profile (O)</>))
                      : <><MessageCircle className="w-4 h-4" /> Open in WhatsApp Web (O) · message auto-prefills</>
                  }
                </button>

                {/* Fallback: always visible when IG, one tap to try the OTHER route.
                    Direct-DM mode users need this when ig.me lands on home page;
                    profile-first users can use it to try the app shortcut. */}
                {isIg && (!(sendOrder === 'grouped' && !switchAcknowledged)) && (
                  <button onClick={openIgFallback}
                    className="w-full text-xs text-prospex-dim hover:text-prospex-text py-2 rounded border border-prospex-border/50 hover:border-prospex-border transition-colors flex items-center justify-center gap-1.5 -mt-1"
                    title={igOpenMode === 'direct'
                      ? 'Didn’t land on the DM? One click opens the profile — click Message from there.'
                      : 'Try the direct DM shortlink (works if you’re on mobile or have the IG app installed).'}>
                    {igOpenMode === 'direct'
                      ? <>🔗 Fallback: open profile instead</>
                      : <>🚀 Try direct DM shortlink</>}
                  </button>
                )}
                {isIg && sendOrder === 'grouped' && clusterInfo.clusterSize > 0 && (
                  <p className="text-[10px] text-prospex-dim text-center -mt-1">
                    Sending {clusterInfo.positionInCluster}/{clusterInfo.clusterSize} from @{current.sender_account} · cluster {clusterInfo.clusterIndex} of {clusterInfo.totalClusters}
                  </p>
                )}

                {/* Mobile: Sent is full-width primary, Skip + Blocked share a smaller row.
                    That way the main "I did it" tap target is unmissably thumb-sized. */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                  <button onClick={() => logAndAdvance('sent')} disabled={logging}
                    className="col-span-1 md:col-span-1 flex items-center justify-center gap-2 bg-prospex-green/20 text-prospex-green border border-prospex-green/40 hover:bg-prospex-green/30 py-3 md:py-2.5 rounded font-mono text-sm md:text-xs min-h-[48px] md:min-h-0 disabled:opacity-50">
                    {logging ? <Loader2 className="w-4 h-4 md:w-3.5 md:h-3.5 animate-spin" /> : <Check className="w-4 h-4 md:w-3.5 md:h-3.5" />} Sent (␣)
                  </button>
                  <div className="grid grid-cols-2 gap-2 md:contents">
                    <button onClick={() => logAndAdvance('skipped')} disabled={logging}
                      className="flex items-center justify-center gap-1.5 bg-prospex-bg text-prospex-muted border border-prospex-border hover:text-prospex-text py-3 md:py-2.5 rounded font-mono text-xs min-h-[44px] md:min-h-0 disabled:opacity-50">
                      <SkipForward className="w-3.5 h-3.5" /> Skip (S)
                    </button>
                    <button onClick={() => logAndAdvance('blocked')} disabled={logging}
                      className="flex items-center justify-center gap-1.5 bg-prospex-red/10 text-prospex-red border border-prospex-red/30 hover:bg-prospex-red/20 py-3 md:py-2.5 rounded font-mono text-xs min-h-[44px] md:min-h-0 disabled:opacity-50">
                      <Ban className="w-3.5 h-3.5" /> Blocked (B)
                    </button>
                  </div>
                </div>

                {/* Nav */}
                <div className="flex items-center justify-between mt-1">
                  <button onClick={() => setCurrentIndex(i => Math.max(0, i - 1))} disabled={currentIndex === 0}
                    className="text-xs md:text-[10px] text-prospex-dim hover:text-prospex-text disabled:opacity-40 flex items-center gap-1 min-h-[36px] px-2">
                    <ChevronLeft className="w-4 h-4 md:w-3 md:h-3" /> Previous
                  </button>
                  <span className="text-xs md:text-[10px] font-mono text-prospex-dim">
                    {currentIndex + 1} / {queue.length}
                  </span>
                  <button onClick={() => setCurrentIndex(i => Math.min(queue.length - 1, i + 1))} disabled={currentIndex >= queue.length - 1}
                    className="text-xs md:text-[10px] text-prospex-dim hover:text-prospex-text disabled:opacity-40 flex items-center gap-1 min-h-[36px] px-2">
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
            <div className="py-6 text-center space-y-4">
              <Trophy className="w-10 h-10 text-prospex-green mx-auto" />
              <p className="text-sm font-mono text-prospex-text">Session complete</p>
              {(() => {
                const stats = queue.reduce((s, r) => {
                  if (r.outcome === 'sent') s.sent++;
                  else if (r.outcome === 'skipped') s.skipped++;
                  else if (r.outcome === 'blocked') s.blocked++;
                  return s;
                }, { sent: 0, skipped: 0, blocked: 0 });
                const elapsedMs = sessionStartTs ? Date.now() - sessionStartTs : 0;
                const elapsedSec = Math.round(elapsedMs / 1000);
                const elapsedMin = Math.floor(elapsedSec / 60);
                const remSec = elapsedSec % 60;
                const elapsedLabel = elapsedMin > 0 ? `${elapsedMin}m ${remSec}s` : `${remSec}s`;
                const avgSecPerLead = stats.sent > 0 ? Math.round(elapsedSec / stats.sent) : 0;
                // Per-account tally for IG sessions — WhatsApp has a single sender.
                const perAccount = new Map<string, { sent: number; skipped: number; blocked: number }>();
                if (isIg) {
                  for (const r of queue) {
                    const acc = r.sender_account || '(unknown)';
                    const entry = perAccount.get(acc) || { sent: 0, skipped: 0, blocked: 0 };
                    if (r.outcome === 'sent') entry.sent++;
                    else if (r.outcome === 'skipped') entry.skipped++;
                    else if (r.outcome === 'blocked') entry.blocked++;
                    perAccount.set(acc, entry);
                  }
                }
                return (
                  <>
                    {/* Headline tiles */}
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

                    {/* Timing */}
                    {stats.sent > 0 && sessionStartTs && (
                      <div className="max-w-sm mx-auto text-[11px] font-mono text-prospex-dim flex items-center justify-center gap-3 flex-wrap">
                        <span>⏱ {elapsedLabel} elapsed</span>
                        <span className="text-prospex-border">·</span>
                        <span>{avgSecPerLead}s per sent lead</span>
                      </div>
                    )}

                    {/* Per-account breakdown (IG only) */}
                    {isIg && perAccount.size > 0 && (
                      <div className="max-w-md mx-auto text-left">
                        <p className="text-[10px] font-mono text-prospex-dim uppercase mb-2 text-center">
                          👤 By account
                        </p>
                        <div className="space-y-1 max-h-48 overflow-y-auto">
                          {Array.from(perAccount.entries())
                            .sort((a, b) => b[1].sent - a[1].sent)
                            .map(([acc, s]) => (
                              <div key={acc} className="flex items-center justify-between gap-2 text-[11px] font-mono bg-prospex-bg rounded px-2 py-1">
                                <span className="text-prospex-text truncate">@{acc}</span>
                                <span className="text-prospex-dim flex-shrink-0">
                                  <span className="text-prospex-green">{s.sent} sent</span>
                                  {s.skipped > 0 && <span className="text-prospex-muted"> · {s.skipped} skip</span>}
                                  {s.blocked > 0 && <span className="text-prospex-red/80"> · {s.blocked} block</span>}
                                </span>
                              </div>
                            ))}
                        </div>
                      </div>
                    )}
                  </>
                );
              })()}
              <p className="text-[10px] text-prospex-dim">Account daily counts + outreach log updated.</p>
            </div>
          ) : null}
        </div>

        {/* Footer — stacks on mobile so the Start button is full-width + thumb-friendly */}
        <div className="p-3 border-t border-prospex-border flex-shrink-0 flex flex-col md:flex-row md:items-center md:justify-between gap-2">
          <div className="text-[10px] text-prospex-dim items-center gap-1.5 hidden md:flex">
            <Sparkles className="w-2.5 h-2.5" />
            {phase === 'setup' && (isIg
              ? 'You still tap "Send" inside Instagram itself — keeps accounts safe.'
              : 'You still tap "Send" inside WhatsApp Web — keeps your number safe.')}
            {phase === 'run' && `Keyboard: Space=${isIg && turboMode ? 'Open+Sent+Next ⚡' : 'Sent'} · S=Skip · B=Blocked · O=Open ${isIg ? 'IG' : 'WA'}`}
            {phase === 'done' && 'Nice work.'}
          </div>
          <div className="flex items-center gap-2 w-full md:w-auto">
            {phase === 'setup' && (
              <button onClick={startBulkSend} disabled={loading || !selectedTemplateId || (selectedTemplateId === 'custom' && !customTemplate.trim()) || (isIg && totalCapacity === 0)}
                className="btn-primary text-sm md:text-xs disabled:opacity-50 flex items-center justify-center gap-1.5 w-full md:w-auto min-h-[48px] md:min-h-0">
                <Rocket className="w-4 h-4 md:w-3.5 md:h-3.5" /> Start · queue {Math.min(eligibleLeads.length, totalCapacity)} leads
              </button>
            )}
            {(phase === 'run' || phase === 'done') && (
              <button onClick={onClose} className="btn-primary text-sm md:text-xs w-full md:w-auto min-h-[48px] md:min-h-0 justify-center">Close</button>
            )}
          </div>
        </div>
      </div>

      {/* Recent-sent popover — appears on top of the main modal when
          operator taps "Recent sent" on any account card. Shows the
          last 20 leads sent from that account so operator can spot
          duplicates before re-messaging the same clinic. */}
      {recentForAccount && (
        <div className="fixed inset-0 bg-black/60 z-[210] flex items-center justify-center p-4" onClick={() => setRecentForAccount(null)}>
          <div className="bg-prospex-surface border border-prospex-cyan/40 rounded-lg shadow-2xl max-w-md w-full max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="p-3 border-b border-prospex-border flex items-center justify-between flex-shrink-0">
              <p className="text-xs font-mono font-bold text-prospex-text">
                📋 Recent sent from <span className="text-prospex-cyan">@{recentForAccount}</span>
              </p>
              <button onClick={() => setRecentForAccount(null)}
                className="text-prospex-dim hover:text-prospex-text p-1.5 min-w-[36px] min-h-[36px] flex items-center justify-center">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              {recentLoading ? (
                <div className="py-8 text-center">
                  <Loader2 className="w-4 h-4 text-prospex-cyan animate-spin mx-auto" />
                </div>
              ) : recentLeads.length === 0 ? (
                <p className="text-[11px] text-prospex-dim italic text-center py-8">
                  No recorded sends from this account yet.
                </p>
              ) : (
                <div className="space-y-1">
                  {recentLeads.map((r, i) => {
                    const ageMs = Date.now() - new Date(r.created_at).getTime();
                    const ageHrs = Math.floor(ageMs / 3_600_000);
                    const ageDays = Math.floor(ageHrs / 24);
                    const ageLabel = ageDays > 0 ? `${ageDays}d ago` : ageHrs > 0 ? `${ageHrs}h ago` : 'just now';
                    return (
                      <div key={`${r.lead_id}-${i}`} className="flex items-center justify-between gap-2 text-[11px] font-mono bg-prospex-bg rounded px-2 py-1.5">
                        <span className="text-prospex-text truncate flex-1">
                          {r.lead_business || '(unknown)'}
                        </span>
                        <span className="text-prospex-dim flex-shrink-0">{ageLabel}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="p-2 border-t border-prospex-border text-[10px] text-prospex-dim text-center">
              Last {recentLeads.length} sent · newest first · use this to avoid double-messaging
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
