'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import {
  Clock, AlertTriangle, Calendar, Activity, Loader2, Copy, Check, ExternalLink,
  MessageCircle, Instagram, Phone, Trophy, Skull, SkipForward, ChevronDown, ChevronRight,
  RefreshCw, Plus, X, Search, Sparkles, Send, Mail,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';

// ─── TYPES ──────────────────────────────────────────────

interface Lead {
  id: string;
  business_name: string;
  city: string | null;
  niche: string | null;
  phone: string | null;
  phone_formatted: string | null;
  instagram_url: string | null;
  instagram_handle: string | null;
  google_review_count: number | null;
  google_rating: number | null;
  audit_score: number | null;
  outreach_status: string | null;
}

interface Sequence {
  id: string;
  lead_id: string;
  campaign_id: string | null;
  status: string;
  current_step: number;
  max_steps: number;
  channel: string;
  started_at: string;
  last_touchpoint_at: string | null;
  next_touchpoint_at: string | null;
  completed_at: string | null;
  touchpoints: Array<{ step: number; type?: string; sent_at: string; message: string }>;
  replied: boolean;
  replied_at: string | null;
  reply_sentiment: string | null;
  outcome: string | null;
  notes: string | null;
  leads?: Lead | null;
}

interface QueueItem {
  sequence: Sequence;
  step_index: number;
  step_type: string;
  step_label: string;
  message: string;
  days_since_last: number;
  is_overdue: boolean;
}

interface ProofAsset {
  id: string;
  asset_type: string;
  title: string;
  description: string | null;
  metric_before: string | null;
  metric_after: string | null;
  metric_timeframe: string | null;
  share_slug: string | null;
}

interface QuickLink {
  id: string;
  name: string;
  url: string;
  category: string | null;
  emoji: string | null;
}

// ─── HELPERS ────────────────────────────────────────────

async function api<T = Record<string, unknown>>(action: string, body: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch('/api/follow-ups', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...body }),
  });
  return res.json() as Promise<T>;
}

const channelIcon = (ch: string) => {
  if (ch === 'whatsapp') return <MessageCircle className="w-3.5 h-3.5 text-green-400" />;
  if (ch === 'sms') return <Phone className="w-3.5 h-3.5 text-blue-400" />;
  return <Instagram className="w-3.5 h-3.5 text-pink-400" />;
};

const channelLabel = (ch: string) => ch === 'whatsapp' ? 'WhatsApp' : ch === 'sms' ? 'SMS' : 'Instagram';

function buildOpenUrl(item: QueueItem): string | null {
  const lead = item.sequence.leads;
  if (!lead) return null;
  const ch = item.sequence.channel;
  if (ch === 'whatsapp') {
    const phone = (lead.phone_formatted || lead.phone || '').replace(/[^0-9+]/g, '').replace('+', '');
    if (!phone) return null;
    return `https://wa.me/${phone}?text=${encodeURIComponent(item.message)}`;
  }
  if (ch === 'instagram') {
    const url = lead.instagram_url || '';
    const handle = lead.instagram_handle || url.replace(/https?:\/\/(www\.)?instagram\.com\/?/, '').replace(/\/$/, '').split('/')[0];
    if (handle) return `https://ig.me/m/${handle}`;
    return url || null;
  }
  // SMS — no universal URL, copy + flag
  return null;
}

const sentimentBadge = (s: string | null) => {
  if (s === 'positive') return <span className="badge text-[9px] bg-prospex-green/20 text-prospex-green border-prospex-green/40">Positive</span>;
  if (s === 'negative') return <span className="badge text-[9px] bg-prospex-red/20 text-prospex-red border-prospex-red/40">Negative</span>;
  if (s === 'neutral') return <span className="badge text-[9px] bg-amber-500/20 text-amber-400 border-amber-500/40">Neutral</span>;
  return null;
};

// ═══════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════

export default function FollowUpsPage() {
  const [stats, setStats] = useState({ overdue: 0, due_today: 0, total_active: 0 });
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [completed, setCompleted] = useState<Sequence[]>([]);
  const [proofAssets, setProofAssets] = useState<ProofAsset[]>([]);
  const [quickLinks, setQuickLinks] = useState<QuickLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [completedOpen, setCompletedOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const [statsRes, queueRes, completedRes] = await Promise.all([
      api<{ success: boolean; overdue: number; due_today: number; total_active: number }>('get_stats'),
      api<{ success: boolean; queue: QueueItem[] }>('get_queue'),
      api<{ success: boolean; sequences: Sequence[] }>('get_completed'),
    ]);
    if (statsRes.success) setStats({ overdue: statsRes.overdue, due_today: statsRes.due_today, total_active: statsRes.total_active });
    setQueue(queueRes.queue || []);
    setCompleted(completedRes.sequences || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
    Promise.all([
      supabase.from('social_proof_assets').select('id, asset_type, title, description, metric_before, metric_after, metric_timeframe, share_slug').eq('is_active', true).order('asset_type'),
      supabase.from('quick_links').select('id, name, url, category, emoji').eq('is_active', true).order('category'),
    ]).then(([proofRes, linksRes]) => {
      setProofAssets((proofRes.data || []) as ProofAsset[]);
      setQuickLinks((linksRes.data || []) as QuickLink[]);
    });
  }, [refresh]);

  const flashCopy = (id: string) => { setCopiedId(id); setTimeout(() => setCopiedId(null), 1500); };

  const copyMessage = (item: QueueItem) => {
    navigator.clipboard.writeText(item.message);
    flashCopy(`msg-${item.sequence.id}`);
  };

  const sendNow = async (item: QueueItem) => {
    navigator.clipboard.writeText(item.message);
    const url = buildOpenUrl(item);
    if (url) window.open(url, '_blank');
    await api('complete_touchpoint', { sequence_id: item.sequence.id, message: item.message });
    refresh();
  };

  const handleSkip = async (item: QueueItem) => {
    await api('skip_step', { sequence_id: item.sequence.id });
    refresh();
  };

  const handleReplied = async (item: QueueItem) => {
    const sentiment = prompt('Reply sentiment? (positive / negative / neutral)', 'positive') as 'positive' | 'negative' | 'neutral' | null;
    if (!sentiment) return;
    await api('mark_replied', { sequence_id: item.sequence.id, sentiment });
    refresh();
  };

  const handleBooked = async (item: QueueItem) => {
    await api('mark_replied', { sequence_id: item.sequence.id, sentiment: 'positive', reply_text: 'Booked a call' });
    refresh();
  };

  const handleDead = async (item: QueueItem) => {
    if (!confirm(`Mark ${item.sequence.leads?.business_name || 'this lead'} as dead and stop the sequence?`)) return;
    await api('mark_dead', { sequence_id: item.sequence.id });
    refresh();
  };

  const copyLink = (link: QuickLink) => {
    navigator.clipboard.writeText(link.url);
    flashCopy(`link-${link.id}`);
  };

  const copyProofStory = (asset: ProofAsset, leadName?: string) => {
    const opener = leadName ? `Hey ${leadName.split(/[\s\-&]/)[0]}` : `Hey`;
    const tail = asset.share_slug ? `\nFull story: https://infinityclients.com/case/${asset.share_slug}` : '';
    const msg = `${opener}, thought this was relevant — ${asset.description}${tail}\n\nWant the playbook?`;
    navigator.clipboard.writeText(msg);
    flashCopy(`proof-${asset.id}`);
  };

  return (
    <div className="max-w-7xl mx-auto space-y-4">
      <div className="flex items-start justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl md:text-2xl font-mono font-bold text-prospex-text flex items-center gap-3">
            <Clock className="w-5 h-5 md:w-6 md:h-6 text-prospex-cyan" /> Follow-Up Command Center
          </h1>
          <p className="text-sm text-prospex-dim mt-1">Who needs a follow-up today, what to send, and one-click access to social proof.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={refresh} className="btn-ghost text-xs"><RefreshCw className="w-3.5 h-3.5" /> Refresh</button>
          <button onClick={() => setShowAddModal(true)} className="btn-primary text-xs"><Plus className="w-3.5 h-3.5" /> Add to Sequence</button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="card p-4 border-prospex-red/40">
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle className="w-4 h-4 text-prospex-red" />
            <p className="text-[10px] font-mono text-prospex-dim uppercase">Overdue</p>
          </div>
          <p className="text-3xl font-mono font-bold text-prospex-red">{stats.overdue}</p>
          <p className="text-[10px] text-prospex-dim mt-1">leads past their next touchpoint</p>
        </div>
        <div className="card p-4 border-amber-500/40">
          <div className="flex items-center gap-2 mb-1">
            <Calendar className="w-4 h-4 text-amber-400" />
            <p className="text-[10px] font-mono text-prospex-dim uppercase">Due Today</p>
          </div>
          <p className="text-3xl font-mono font-bold text-amber-400">{stats.due_today}</p>
          <p className="text-[10px] text-prospex-dim mt-1">scheduled in the next few hours</p>
        </div>
        <div className="card p-4 border-prospex-cyan/40">
          <div className="flex items-center gap-2 mb-1">
            <Activity className="w-4 h-4 text-prospex-cyan" />
            <p className="text-[10px] font-mono text-prospex-dim uppercase">Total Active</p>
          </div>
          <p className="text-3xl font-mono font-bold text-prospex-cyan">{stats.total_active}</p>
          <p className="text-[10px] text-prospex-dim mt-1">sequences in flight</p>
        </div>
      </div>

      {/* Quick Links bar */}
      {quickLinks.length > 0 && (
        <div className="card p-3 flex items-center gap-2 flex-wrap">
          <span className="text-[10px] font-mono text-prospex-dim uppercase mr-1">Quick Links</span>
          {quickLinks.map(link => (
            <button
              key={link.id}
              onClick={() => copyLink(link)}
              className={cn(
                'flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-mono border transition-colors',
                copiedId === `link-${link.id}`
                  ? 'bg-prospex-green/20 text-prospex-green border-prospex-green/40'
                  : 'bg-prospex-bg border-prospex-border text-prospex-muted hover:text-prospex-text hover:border-prospex-cyan/30'
              )}
              title={`Copy ${link.url}`}
            >
              {link.emoji && <span>{link.emoji}</span>}
              <span>{copiedId === `link-${link.id}` ? 'Copied!' : link.name}</span>
            </button>
          ))}
        </div>
      )}

      {/* Main grid: queue + proof arsenal */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Action Queue */}
        <div className="lg:col-span-2 space-y-3">
          <h2 className="text-xs font-mono text-prospex-dim uppercase tracking-wider">Action Queue ({queue.length})</h2>
          {loading ? (
            <div className="card p-8 text-center"><Loader2 className="w-5 h-5 animate-spin text-prospex-cyan mx-auto" /></div>
          ) : queue.length === 0 ? (
            <div className="card p-8 text-center">
              <Sparkles className="w-8 h-8 text-prospex-dim mx-auto mb-3" />
              <p className="text-sm text-prospex-muted">Inbox zero — no follow-ups due right now.</p>
              <p className="text-[11px] text-prospex-dim mt-1">Use <strong>Add to Sequence</strong> above or open a lead and click <em>Start Follow-Up Sequence</em>.</p>
            </div>
          ) : (
            queue.map(item => (
              <QueueRow
                key={item.sequence.id}
                item={item}
                onCopy={() => copyMessage(item)}
                onSend={() => sendNow(item)}
                onReplied={() => handleReplied(item)}
                onBooked={() => handleBooked(item)}
                onSkip={() => handleSkip(item)}
                onDead={() => handleDead(item)}
                copiedId={copiedId}
              />
            ))
          )}
        </div>

        {/* Social Proof Arsenal */}
        <aside className="space-y-3">
          <h2 className="text-xs font-mono text-amber-400 uppercase tracking-wider flex items-center gap-2">
            <Trophy className="w-3.5 h-3.5" /> Social Proof Arsenal
          </h2>
          {proofAssets.length === 0 ? (
            <div className="card p-4 text-center text-xs text-prospex-dim">No active assets yet.</div>
          ) : (
            proofAssets.map(asset => (
              <div key={asset.id} className="card p-3 border-amber-500/20">
                <p className="text-[10px] font-mono text-amber-400 uppercase mb-1">{asset.asset_type.replace(/_/g, ' ')}</p>
                <p className="text-xs font-medium text-prospex-text leading-tight mb-1">{asset.title}</p>
                {asset.metric_before && asset.metric_after && (
                  <p className="text-[10px] text-prospex-muted mb-2">
                    <span className="text-prospex-red">{asset.metric_before}</span>
                    <span className="text-prospex-dim mx-1">→</span>
                    <span className="text-prospex-green">{asset.metric_after}</span>
                    {asset.metric_timeframe && <span className="text-prospex-dim"> in {asset.metric_timeframe}</span>}
                  </p>
                )}
                <div className="flex flex-wrap items-center gap-1.5 mt-2">
                  <button
                    onClick={() => copyProofStory(asset)}
                    className={cn('text-[10px] px-2 py-1 rounded border transition-colors',
                      copiedId === `proof-${asset.id}`
                        ? 'bg-prospex-green/20 text-prospex-green border-prospex-green/40'
                        : 'bg-amber-500/10 text-amber-400 border-amber-500/30 hover:bg-amber-500/20')}
                  >
                    {copiedId === `proof-${asset.id}` ? <><Check className="w-3 h-3 inline" /> Copied</> : <><Copy className="w-3 h-3 inline" /> Copy Story</>}
                  </button>
                  {asset.share_slug && (
                    <button
                      onClick={() => { navigator.clipboard.writeText(`https://infinityclients.com/case/${asset.share_slug}`); flashCopy(`share-${asset.id}`); }}
                      className={cn('text-[10px] px-2 py-1 rounded border transition-colors',
                        copiedId === `share-${asset.id}`
                          ? 'bg-prospex-green/20 text-prospex-green border-prospex-green/40'
                          : 'bg-prospex-bg text-prospex-muted border-prospex-border hover:text-prospex-text')}
                    >
                      {copiedId === `share-${asset.id}` ? 'Copied' : 'Share Link'}
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </aside>
      </div>

      {/* Completed / Replied panel */}
      <div className="card">
        <button onClick={() => setCompletedOpen(!completedOpen)} className="w-full flex items-center justify-between p-4 hover:bg-prospex-bg/30 transition-colors">
          <div className="flex items-center gap-2">
            <Mail className="w-4 h-4 text-prospex-dim" />
            <h3 className="text-xs font-mono text-prospex-text uppercase tracking-wider">Replied / Completed / Dead ({completed.length})</h3>
          </div>
          {completedOpen ? <ChevronDown className="w-4 h-4 text-prospex-dim" /> : <ChevronRight className="w-4 h-4 text-prospex-dim" />}
        </button>
        {completedOpen && (
          <div className="border-t border-prospex-border p-3 space-y-2">
            {completed.length === 0 ? (
              <p className="text-xs text-prospex-dim text-center py-4">Nothing here yet.</p>
            ) : completed.map(seq => (
              <div key={seq.id} className="flex items-center justify-between gap-3 p-2 bg-prospex-bg rounded-lg">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={cn('badge text-[9px]',
                      seq.status === 'replied' ? 'bg-prospex-green/20 text-prospex-green border-prospex-green/40' :
                      seq.status === 'dead' ? 'bg-prospex-red/20 text-prospex-red border-prospex-red/40' :
                      'bg-prospex-bg text-prospex-dim border-prospex-border'
                    )}>{seq.status}</span>
                    {sentimentBadge(seq.reply_sentiment)}
                    <p className="text-xs text-prospex-text truncate">{seq.leads?.business_name || '—'}</p>
                  </div>
                  <p className="text-[10px] text-prospex-dim mt-0.5">
                    {seq.replied_at ? new Date(seq.replied_at).toLocaleString() : new Date(seq.started_at).toLocaleString()}
                  </p>
                </div>
                {seq.lead_id && (
                  <Link href={`/leads/${seq.lead_id}`} className="text-prospex-cyan text-[10px] hover:underline flex items-center gap-1">
                    View <ExternalLink className="w-3 h-3" />
                  </Link>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {showAddModal && <AddToSequenceModal onClose={() => setShowAddModal(false)} onCreated={() => { setShowAddModal(false); refresh(); }} />}
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// QUEUE ROW
// ═══════════════════════════════════════════════════════

function QueueRow({ item, onCopy, onSend, onReplied, onBooked, onSkip, onDead, copiedId }: {
  item: QueueItem;
  onCopy: () => void;
  onSend: () => void;
  onReplied: () => void;
  onBooked: () => void;
  onSkip: () => void;
  onDead: () => void;
  copiedId: string | null;
}) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const lead = item.sequence.leads;
  const overdueColor = item.is_overdue ? 'border-prospex-red/40' : 'border-prospex-border';

  return (
    <div className={cn('card border', overdueColor)}>
      <div className="p-3 md:p-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              {channelIcon(item.sequence.channel)}
              <Link href={`/leads/${item.sequence.lead_id}`} className="text-sm font-semibold text-prospex-text hover:text-prospex-cyan truncate">
                {lead?.business_name || 'Unknown lead'}
              </Link>
              {lead?.city && <span className="text-[10px] text-prospex-dim">📍 {lead.city}</span>}
              {item.is_overdue && <span className="badge text-[9px] bg-prospex-red/20 text-prospex-red border-prospex-red/40">Overdue</span>}
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-[10px] text-prospex-muted font-mono">
              <span>Step {item.step_index + 1} of {item.sequence.max_steps + 1} — <span className="text-prospex-text">{item.step_label}</span></span>
              <span>·</span>
              <span>{item.days_since_last}d since last touchpoint</span>
              <span>·</span>
              <span>{channelLabel(item.sequence.channel)}</span>
            </div>
          </div>
        </div>

        {/* Pre-filled message preview */}
        <div className="mt-3 p-3 bg-prospex-bg border border-prospex-border rounded-lg">
          <p className="text-[10px] font-mono text-prospex-dim uppercase mb-1">Send next</p>
          <p className="text-xs text-prospex-text whitespace-pre-wrap font-mono leading-relaxed">{item.message}</p>
        </div>

        {/* Action buttons */}
        <div className="flex flex-wrap items-center gap-1.5 mt-3">
          <button
            onClick={onCopy}
            className={cn('btn text-[10px] border', copiedId === `msg-${item.sequence.id}`
              ? 'bg-prospex-green/20 text-prospex-green border-prospex-green/40'
              : 'bg-prospex-bg border-prospex-border text-prospex-muted hover:text-prospex-text')}
          >
            {copiedId === `msg-${item.sequence.id}` ? <><Check className="w-3 h-3" /> Copied</> : <><Copy className="w-3 h-3" /> Copy</>}
          </button>
          <button
            onClick={onSend}
            className={cn('btn text-[10px] border',
              item.sequence.channel === 'whatsapp' ? 'bg-green-500/20 text-green-400 border-green-500/40 hover:bg-green-500/30' :
              item.sequence.channel === 'instagram' ? 'bg-pink-500/20 text-pink-400 border-pink-500/40 hover:bg-pink-500/30' :
              'bg-blue-500/20 text-blue-400 border-blue-500/40 hover:bg-blue-500/30')}
          >
            <Send className="w-3 h-3" /> Send &amp; Open
          </button>
          <div className="w-px h-4 bg-prospex-border mx-1" />
          <button onClick={onReplied} className="btn text-[10px] bg-prospex-cyan/20 text-prospex-cyan border border-prospex-cyan/40 hover:bg-prospex-cyan/30">
            <MessageCircle className="w-3 h-3" /> Replied
          </button>
          <button onClick={onBooked} className="btn text-[10px] bg-prospex-green/20 text-prospex-green border border-prospex-green/40 hover:bg-prospex-green/30">
            📅 Booked
          </button>
          <button onClick={onSkip} className="btn text-[10px] bg-prospex-bg border border-prospex-border text-prospex-muted hover:text-prospex-text">
            <SkipForward className="w-3 h-3" /> Skip
          </button>
          <button onClick={onDead} className="btn text-[10px] text-prospex-red hover:text-prospex-red border border-transparent hover:border-prospex-red/40">
            <Skull className="w-3 h-3" /> Dead
          </button>
          <button onClick={() => setHistoryOpen(!historyOpen)} className="btn text-[10px] text-prospex-dim hover:text-prospex-text border border-transparent ml-auto">
            {historyOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />} History ({item.sequence.touchpoints?.length || 0})
          </button>
        </div>
      </div>

      {/* Touchpoint history */}
      {historyOpen && (
        <div className="border-t border-prospex-border bg-prospex-bg/30 p-3 space-y-2">
          {(item.sequence.touchpoints || []).length === 0 ? (
            <p className="text-[10px] text-prospex-dim text-center py-2">No touchpoints sent yet.</p>
          ) : (
            (item.sequence.touchpoints || []).map((tp, i) => (
              <div key={i} className="text-xs">
                <p className="text-[10px] font-mono text-prospex-dim mb-0.5">
                  Step {tp.step + 1} · {tp.type || `step_${tp.step}`} · {new Date(tp.sent_at).toLocaleString()}
                </p>
                <p className="text-[11px] text-prospex-muted whitespace-pre-wrap pl-2 border-l-2 border-prospex-border">{tp.message}</p>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// ADD TO SEQUENCE MODAL
// ═══════════════════════════════════════════════════════

function AddToSequenceModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<Lead[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [channel, setChannel] = useState<'instagram' | 'whatsapp' | 'sms'>('instagram');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!search.trim()) { setResults([]); return; }
    let cancelled = false;
    setSearching(true);
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from('leads')
        .select('id, business_name, city, niche, phone, phone_formatted, instagram_url, instagram_handle, google_review_count, google_rating, audit_score, outreach_status')
        .or(`business_name.ilike.%${search}%,city.ilike.%${search}%`)
        .limit(20);
      if (!cancelled) {
        setResults((data || []) as Lead[]);
        setSearching(false);
      }
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [search]);

  const handleStart = async () => {
    if (!selectedLead) return;
    setCreating(true);
    setError(null);
    const res = await api<{ success: boolean; already_active?: boolean; error?: string }>('start_sequence', {
      lead_id: selectedLead.id,
      channel,
    });
    setCreating(false);
    if (res.success) {
      if (res.already_active) {
        setError('Lead already has an active sequence — opened in queue.');
        setTimeout(onCreated, 800);
      } else {
        onCreated();
      }
    } else {
      setError(res.error || 'Failed to start sequence');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-prospex-surface border border-prospex-border rounded-xl w-full max-w-xl mx-2 md:mx-auto max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="p-4 border-b border-prospex-border flex items-center justify-between">
          <h2 className="text-sm font-mono font-bold text-prospex-text flex items-center gap-2"><Plus className="w-4 h-4" /> Add Lead to Sequence</h2>
          <button onClick={onClose} className="text-prospex-dim hover:text-prospex-text"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-4 space-y-3 overflow-y-auto">
          <div>
            <label className="text-[10px] font-mono text-prospex-dim uppercase block mb-1">Search Leads</label>
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-prospex-dim" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Business name or city" className="input w-full pl-9" autoFocus />
            </div>
            {searching && <p className="text-[10px] text-prospex-dim mt-1">Searching…</p>}
          </div>

          {results.length > 0 && (
            <div className="space-y-1 max-h-[260px] overflow-y-auto">
              {results.map(l => (
                <button key={l.id} onClick={() => setSelectedLead(l)}
                  className={cn('w-full text-left p-2.5 rounded-lg border transition-colors',
                    selectedLead?.id === l.id ? 'bg-prospex-cyan/10 border-prospex-cyan/40' : 'bg-prospex-bg border-prospex-border hover:border-prospex-cyan/30')}>
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium text-prospex-text truncate">{l.business_name}</p>
                    <div className="flex items-center gap-1 shrink-0">
                      {l.instagram_url && <Instagram className="w-3 h-3 text-pink-400" />}
                      {l.phone && <MessageCircle className="w-3 h-3 text-green-400" />}
                    </div>
                  </div>
                  <p className="text-[10px] text-prospex-dim mt-0.5">{l.city || '—'}{l.niche ? ` · ${l.niche}` : ''}</p>
                </button>
              ))}
            </div>
          )}

          {selectedLead && (
            <div>
              <label className="text-[10px] font-mono text-prospex-dim uppercase block mb-1">Channel</label>
              <div className="flex gap-2">
                {(['instagram', 'whatsapp', 'sms'] as const).map(ch => (
                  <button key={ch} onClick={() => setChannel(ch)}
                    className={cn('flex-1 py-2 text-xs font-mono rounded-lg border transition-colors',
                      channel === ch
                        ? 'bg-prospex-cyan/10 text-prospex-cyan border-prospex-cyan/40'
                        : 'bg-prospex-bg text-prospex-muted border-prospex-border hover:text-prospex-text')}>
                    {channelIcon(ch)} <span className="ml-1">{channelLabel(ch)}</span>
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-prospex-dim mt-2">
                Sequence: 7 touchpoints over 14 days (cold open → value add → competitor move → social proof → mini audit → breakup).
              </p>
            </div>
          )}

          {error && <p className="text-xs text-prospex-red">{error}</p>}
        </div>

        <div className="p-4 border-t border-prospex-border flex items-center justify-end gap-2">
          <button onClick={onClose} className="btn-ghost text-xs">Cancel</button>
          <button onClick={handleStart} disabled={!selectedLead || creating} className="btn-primary text-xs disabled:opacity-50">
            {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Clock className="w-3.5 h-3.5" />} Start Sequence
          </button>
        </div>
      </div>
    </div>
  );
}
