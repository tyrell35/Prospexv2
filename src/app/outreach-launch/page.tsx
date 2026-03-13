'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Rocket, Search, Filter, Users, CheckSquare, Square, Zap,
  Loader2, AlertTriangle, CheckCircle, MessageCircle, Mail,
  Instagram, Linkedin, Plus, Play, Pause, ArrowRight,
  Sparkles, Target, Clock, Send, BarChart3, ChevronDown,
  ChevronUp, RefreshCw, Trash2, Copy, Eye, XCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';

// ─── TYPES ───────────────────────────────────────────────────────
interface Lead {
  id: string;
  business_name: string;
  email: string | null;
  phone: string | null;
  phone_type: string | null;
  whatsapp_eligible: boolean;
  instagram_url: string | null;
  instagram_handle: string | null;
  instagram_verified: boolean;
  website: string | null;
  city: string | null;
  country: string | null;
  niche: string | null;
  google_rating: number | null;
  google_review_count: number | null;
  lead_score: number | null;
  lead_priority: string | null;
  data_completeness: number;
  has_website: boolean;
  has_email: boolean;
  has_phone: boolean;
  has_social: boolean;
  has_pixel: boolean;
  cms_platform: string | null;
  contact_quality_score: number;
}

interface Sequence {
  id: string;
  name: string;
  channel: string;
  status: string;
  steps: any[];
  total_enrolled: number;
  total_sent: number;
  total_replied: number;
}

interface QueueStatus {
  queue_size: number;
  sent_today: number;
  daily_limit: number;
  within_send_window: boolean;
  settings: any;
}

const CHANNELS = [
  { id: 'email', label: 'Email', icon: Mail, color: 'text-blue-400', bg: 'bg-blue-500/15 border-blue-500/30', requires: 'email' },
  { id: 'instagram', label: 'Instagram', icon: Instagram, color: 'text-pink-400', bg: 'bg-pink-500/15 border-pink-500/30', requires: 'instagram_verified' },
  { id: 'whatsapp', label: 'WhatsApp', icon: MessageCircle, color: 'text-green-400', bg: 'bg-green-500/15 border-green-500/30', requires: 'whatsapp_eligible' },
  { id: 'linkedin', label: 'LinkedIn', icon: Linkedin, color: 'text-sky-400', bg: 'bg-sky-500/15 border-sky-500/30', requires: 'email' },
];

// ─── LEAD ROW ────────────────────────────────────────────────────
function LeadRow({ lead, selected, onToggle, channel }: { lead: Lead; selected: boolean; onToggle: () => void; channel: string }) {
  const ch = CHANNELS.find(c => c.id === channel);
  const canReach = channel === 'email' ? !!lead.email
    : channel === 'instagram' ? lead.instagram_verified
    : channel === 'whatsapp' ? lead.whatsapp_eligible
    : !!lead.email;
  
  return (
    <tr className={cn(
      'border-b border-prospex-border transition-colors',
      selected ? 'bg-prospex-accent/5' : 'hover:bg-prospex-bg',
      !canReach && 'opacity-40'
    )}>
      <td className="px-3 py-2.5">
        <button onClick={onToggle} disabled={!canReach} className="disabled:cursor-not-allowed">
          {selected ? <CheckSquare className="w-4 h-4 text-prospex-accent" /> : <Square className="w-4 h-4 text-prospex-dim" />}
        </button>
      </td>
      <td className="px-3 py-2.5">
        <p className="text-sm text-prospex-text font-medium truncate max-w-[200px]">{lead.business_name}</p>
        <p className="text-[10px] text-prospex-dim font-mono">{lead.city || '—'}</p>
      </td>
      <td className="px-3 py-2.5">
        <span className={cn('text-xs font-mono', canReach ? 'text-green-400' : 'text-red-400')}>
          {canReach ? '✓ Reachable' : '✗ No contact'}
        </span>
      </td>
      <td className="px-3 py-2.5 text-xs font-mono text-prospex-muted">
        {channel === 'email' && (lead.email || '—')}
        {channel === 'instagram' && (lead.instagram_handle ? `@${lead.instagram_handle}` : '—')}
        {channel === 'whatsapp' && (lead.whatsapp_eligible ? lead.phone : '—')}
        {channel === 'linkedin' && (lead.email || '—')}
      </td>
      <td className="px-3 py-2.5">
        {lead.lead_score != null && (
          <span className={cn('text-xs font-mono font-bold',
            lead.lead_score >= 70 ? 'text-green-400' : lead.lead_score >= 40 ? 'text-yellow-400' : 'text-red-400'
          )}>{lead.lead_score}</span>
        )}
      </td>
      <td className="px-3 py-2.5">
        <span className={cn('text-[10px] font-mono',
          (lead.data_completeness || 0) >= 70 ? 'text-green-400' : (lead.data_completeness || 0) >= 40 ? 'text-yellow-400' : 'text-red-400'
        )}>{lead.data_completeness || 0}%</span>
      </td>
    </tr>
  );
}

// ─── QUICK SEQUENCE CREATOR ──────────────────────────────────────
function QuickSequenceModal({ channel, onCreated, onClose }: { channel: string; onCreated: (seq: Sequence) => void; onClose: () => void }) {
  const [name, setName] = useState('');
  const [step1, setStep1] = useState('');
  const [step2, setStep2] = useState('');
  const [step3, setStep3] = useState('');
  const [aiPersonalize, setAiPersonalize] = useState(true);
  const [creating, setCreating] = useState(false);

  const placeholders: Record<string, string> = {
    instagram: 'Hey {{business_name}}, love what you guys are doing...',
    whatsapp: 'Hi, I came across {{business_name}} and...',
    email: 'Subject: Quick question about {{business_name}}...',
    linkedin: 'Hi, I noticed {{business_name}} is...',
  };

  const handleCreate = async () => {
    if (!name || !step1) return;
    setCreating(true);
    try {
      const steps = [
        { step_number: 1, delay_days: 0, message_template: step1, condition: 'always', is_ai_personalized: aiPersonalize },
      ];
      if (step2) steps.push({ step_number: 2, delay_days: 3, message_template: step2, condition: 'if_no_reply', is_ai_personalized: aiPersonalize });
      if (step3) steps.push({ step_number: 3, delay_days: 7, message_template: step3, condition: 'if_no_reply', is_ai_personalized: aiPersonalize });

      const res = await fetch('/api/sequences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create', name, channel, steps, ai_personalization_enabled: aiPersonalize }),
      });
      const data = await res.json();
      if (data.sequence) onCreated(data.sequence);
    } catch {}
    setCreating(false);
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-prospex-card border border-prospex-border rounded-xl max-w-lg w-full max-h-[80vh] overflow-y-auto p-5" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-prospex-text">Quick Sequence Builder</h3>
          <button onClick={onClose} className="text-prospex-dim hover:text-prospex-text">✕</button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-[10px] text-prospex-dim font-mono uppercase mb-1 block">Sequence Name</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder={`${channel} outreach - ${new Date().toLocaleDateString()}`}
              className="w-full bg-prospex-bg border border-prospex-border rounded px-3 py-2 text-sm text-prospex-text" />
          </div>

          <div>
            <label className="text-[10px] text-prospex-dim font-mono uppercase mb-1 block">Step 1 — First Touch (Day 0)</label>
            <textarea value={step1} onChange={e => setStep1(e.target.value)} rows={3} placeholder={placeholders[channel] || ''}
              className="w-full bg-prospex-bg border border-prospex-border rounded px-3 py-2 text-sm text-prospex-text resize-none" />
          </div>

          <div>
            <label className="text-[10px] text-prospex-dim font-mono uppercase mb-1 block">Step 2 — Follow Up (Day 3) <span className="text-prospex-muted">optional</span></label>
            <textarea value={step2} onChange={e => setStep2(e.target.value)} rows={2} placeholder="Follow-up if no reply..."
              className="w-full bg-prospex-bg border border-prospex-border rounded px-3 py-2 text-sm text-prospex-text resize-none" />
          </div>

          <div>
            <label className="text-[10px] text-prospex-dim font-mono uppercase mb-1 block">Step 3 — Breakup (Day 7) <span className="text-prospex-muted">optional</span></label>
            <textarea value={step3} onChange={e => setStep3(e.target.value)} rows={2} placeholder="Final message if still no reply..."
              className="w-full bg-prospex-bg border border-prospex-border rounded px-3 py-2 text-sm text-prospex-text resize-none" />
          </div>

          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 text-xs text-prospex-muted cursor-pointer">
              <input type="checkbox" checked={aiPersonalize} onChange={e => setAiPersonalize(e.target.checked)} className="accent-purple-500" />
              <Sparkles className="w-3 h-3 text-purple-400" /> AI personalize each message per lead
            </label>
          </div>

          <button onClick={handleCreate} disabled={!name || !step1 || creating}
            className="w-full btn bg-prospex-accent/15 hover:bg-prospex-accent/25 text-prospex-accent border border-prospex-accent/30 py-2.5 flex items-center justify-center gap-2 disabled:opacity-50">
            {creating ? <><Loader2 className="w-4 h-4 animate-spin" /> Creating...</> : <><Plus className="w-4 h-4" /> Create Sequence</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── MAIN PAGE ───────────────────────────────────────────────────
export default function OutreachLaunchPage() {
  // Lead selection
  const [leads, setLeads] = useState<Lead[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [totalLeads, setTotalLeads] = useState(0);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCity, setFilterCity] = useState('');
  const [filterNiche, setFilterNiche] = useState('');
  const [filterMinScore, setFilterMinScore] = useState(0);
  const [filterHasWebsite, setFilterHasWebsite] = useState<string>('all');
  const [filterHasPixel, setFilterHasPixel] = useState<string>('all');
  const [page, setPage] = useState(0);
  const pageSize = 50;

  // Channel & sequence
  const [channel, setChannel] = useState('instagram');
  const [sequences, setSequences] = useState<Sequence[]>([]);
  const [selectedSequence, setSelectedSequence] = useState<string>('');
  const [showSequenceBuilder, setShowSequenceBuilder] = useState(false);

  // Launch state
  const [launching, setLaunching] = useState(false);
  const [launchResult, setLaunchResult] = useState<any>(null);
  const [queueStatus, setQueueStatus] = useState<QueueStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  // ─── FETCH LEADS ───────────────────────────────────────────────
  const fetchLeads = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from('leads')
      .select('id, business_name, email, phone, phone_type, whatsapp_eligible, instagram_url, instagram_handle, instagram_verified, website, city, country, niche, google_rating, google_review_count, lead_score, lead_priority, data_completeness, has_website, has_email, has_phone, has_social, has_pixel, cms_platform, contact_quality_score', { count: 'exact' })
      .order('lead_score', { ascending: false, nullsFirst: false })
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (searchQuery) query = query.ilike('business_name', `%${searchQuery}%`);
    if (filterCity) query = query.ilike('city', `%${filterCity}%`);
    if (filterNiche) query = query.ilike('niche', `%${filterNiche}%`);
    if (filterMinScore > 0) query = query.gte('lead_score', filterMinScore);
    if (filterHasWebsite === 'yes') query = query.eq('has_website', true);
    if (filterHasWebsite === 'no') query = query.eq('has_website', false);
    if (filterHasPixel === 'yes') query = query.eq('has_pixel', true);
    if (filterHasPixel === 'no') query = query.eq('has_pixel', false);

    // Channel-specific filtering
    if (channel === 'email') query = query.not('email', 'is', null);
    if (channel === 'instagram') query = query.eq('instagram_verified', true);
    if (channel === 'whatsapp') query = query.eq('whatsapp_eligible', true);

    const { data, count, error: fetchErr } = await query;
    if (fetchErr) setError(fetchErr.message);
    setLeads(data || []);
    setTotalLeads(count || 0);
    setLoading(false);
  }, [page, searchQuery, filterCity, filterNiche, filterMinScore, filterHasWebsite, filterHasPixel, channel]);

  useEffect(() => { fetchLeads(); }, [fetchLeads]);

  // ─── FETCH SEQUENCES ───────────────────────────────────────────
  useEffect(() => {
    (async () => {
      const res = await fetch('/api/sequences');
      const data = await res.json();
      setSequences(data.sequences || []);
    })();
  }, []);

  // ─── FETCH QUEUE STATUS ────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/auto-send?view=status');
        const data = await res.json();
        setQueueStatus(data);
      } catch {}
    })();
  }, [launchResult]);

  // ─── SELECT / DESELECT ─────────────────────────────────────────
  const toggleLead = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    const reachable = leads.filter(l => {
      if (channel === 'email') return !!l.email;
      if (channel === 'instagram') return l.instagram_verified;
      if (channel === 'whatsapp') return l.whatsapp_eligible;
      return !!l.email;
    });
    setSelectedIds(new Set(reachable.map(l => l.id)));
  };

  const deselectAll = () => setSelectedIds(new Set());

  // ─── LAUNCH OUTREACH ───────────────────────────────────────────
  const handleLaunch = async () => {
    if (selectedIds.size === 0 || !selectedSequence) {
      setError('Select leads and a sequence first');
      return;
    }

    setLaunching(true);
    setError(null);
    setLaunchResult(null);

    try {
      const res = await fetch('/api/auto-send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'queue_sequence',
          sequence_id: selectedSequence,
          lead_ids: Array.from(selectedIds),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Launch failed');
      setLaunchResult(data);
      setSelectedIds(new Set());
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLaunching(false);
    }
  };

  // ─── STATS ─────────────────────────────────────────────────────
  const reachableCount = leads.filter(l => {
    if (channel === 'email') return !!l.email;
    if (channel === 'instagram') return l.instagram_verified;
    if (channel === 'whatsapp') return l.whatsapp_eligible;
    return !!l.email;
  }).length;

  const channelSequences = sequences.filter(s => s.channel === channel);

  return (
    <div className="min-h-screen bg-prospex-bg text-prospex-text p-4 sm:p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Rocket className="w-6 h-6 text-prospex-accent" /> Launch Outreach
        </h1>
        <p className="text-sm text-prospex-muted mt-1">Select leads → Pick sequence → Launch automated outreach with human-like pacing</p>
      </div>

      {/* Queue Status Bar */}
      {queueStatus && (
        <div className="card p-3 mb-4 flex flex-wrap items-center gap-4 text-xs font-mono">
          <span className={cn('flex items-center gap-1', queueStatus.within_send_window ? 'text-green-400' : 'text-yellow-400')}>
            <Clock className="w-3 h-3" />
            {queueStatus.within_send_window ? 'Send window OPEN' : 'Outside send window'}
          </span>
          <span className="text-prospex-muted">
            Queue: <span className="text-prospex-text">{queueStatus.queue_size}</span> pending
          </span>
          <span className="text-prospex-muted">
            Sent today: <span className="text-prospex-text">{queueStatus.sent_today}</span>/{queueStatus.daily_limit}
          </span>
          {queueStatus.settings?.channel_limits && (
            <span className="text-prospex-dim">
              {channel}: {(queueStatus.settings.channel_limits as any)[channel] || '—'}
            </span>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* ─── LEFT: LEAD SELECTION ──────────────────────────────── */}
        <div className="lg:col-span-3 space-y-4">

          {/* Channel Selector */}
          <div className="card p-4">
            <label className="text-[10px] text-prospex-dim font-mono uppercase mb-2 block">Channel</label>
            <div className="flex gap-2">
              {CHANNELS.map(ch => (
                <button key={ch.id} onClick={() => { setChannel(ch.id); setSelectedIds(new Set()); setPage(0); }}
                  className={cn(
                    'flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-mono border transition-colors',
                    channel === ch.id ? cn(ch.bg, ch.color, 'font-bold') : 'text-prospex-dim border-prospex-border hover:border-prospex-accent/20'
                  )}>
                  <ch.icon className="w-4 h-4" /> {ch.label}
                </button>
              ))}
            </div>
          </div>

          {/* Filters */}
          <div className="card p-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                <Search className="w-4 h-4 text-prospex-dim" />
                <input value={searchQuery} onChange={e => { setSearchQuery(e.target.value); setPage(0); }}
                  placeholder="Search business name..."
                  className="flex-1 bg-prospex-bg border border-prospex-border rounded px-3 py-1.5 text-sm text-prospex-text" />
              </div>
              <input value={filterCity} onChange={e => { setFilterCity(e.target.value); setPage(0); }}
                placeholder="City..." className="bg-prospex-bg border border-prospex-border rounded px-3 py-1.5 text-sm text-prospex-text w-28" />
              <input value={filterNiche} onChange={e => { setFilterNiche(e.target.value); setPage(0); }}
                placeholder="Niche..." className="bg-prospex-bg border border-prospex-border rounded px-3 py-1.5 text-sm text-prospex-text w-28" />
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-prospex-dim font-mono">Score:</span>
                <input type="number" value={filterMinScore} onChange={e => { setFilterMinScore(parseInt(e.target.value) || 0); setPage(0); }}
                  className="bg-prospex-bg border border-prospex-border rounded px-2 py-1.5 text-xs text-prospex-text w-14" min={0} max={100} />
                <span className="text-[10px] text-prospex-dim">+</span>
              </div>
              <select value={filterHasWebsite} onChange={e => { setFilterHasWebsite(e.target.value); setPage(0); }}
                className="bg-prospex-bg border border-prospex-border rounded px-2 py-1.5 text-[10px] font-mono text-prospex-text">
                <option value="all">Website: Any</option>
                <option value="yes">Has website</option>
                <option value="no">No website</option>
              </select>
              <select value={filterHasPixel} onChange={e => { setFilterHasPixel(e.target.value); setPage(0); }}
                className="bg-prospex-bg border border-prospex-border rounded px-2 py-1.5 text-[10px] font-mono text-prospex-text">
                <option value="all">Pixel: Any</option>
                <option value="yes">Has pixel</option>
                <option value="no">No pixel</option>
              </select>
            </div>
          </div>

          {/* Selection Controls */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button onClick={selectAll} className="text-xs text-prospex-accent hover:underline font-mono">Select all reachable</button>
              <button onClick={deselectAll} className="text-xs text-prospex-dim hover:underline font-mono">Clear</button>
              <span className="text-xs text-prospex-muted font-mono">
                <span className="text-prospex-accent font-bold">{selectedIds.size}</span> selected of {reachableCount} reachable ({totalLeads} total)
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0}
                className="text-xs text-prospex-dim hover:text-prospex-text disabled:opacity-30 font-mono">← Prev</button>
              <span className="text-[10px] text-prospex-dim font-mono">Page {page + 1}</span>
              <button onClick={() => setPage(page + 1)} disabled={leads.length < pageSize}
                className="text-xs text-prospex-dim hover:text-prospex-text disabled:opacity-30 font-mono">Next →</button>
            </div>
          </div>

          {/* Lead Table */}
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-prospex-border bg-prospex-bg">
                    <th className="px-3 py-2 text-left w-8"></th>
                    <th className="px-3 py-2 text-left text-[10px] font-mono text-prospex-dim uppercase">Business</th>
                    <th className="px-3 py-2 text-left text-[10px] font-mono text-prospex-dim uppercase">Status</th>
                    <th className="px-3 py-2 text-left text-[10px] font-mono text-prospex-dim uppercase">Contact</th>
                    <th className="px-3 py-2 text-left text-[10px] font-mono text-prospex-dim uppercase">Score</th>
                    <th className="px-3 py-2 text-left text-[10px] font-mono text-prospex-dim uppercase">Data %</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={6} className="px-3 py-8 text-center">
                      <Loader2 className="w-5 h-5 animate-spin mx-auto text-prospex-accent" />
                    </td></tr>
                  ) : leads.length === 0 ? (
                    <tr><td colSpan={6} className="px-3 py-8 text-center text-sm text-prospex-dim">
                      No leads match your filters for this channel
                    </td></tr>
                  ) : leads.map(lead => (
                    <LeadRow key={lead.id} lead={lead} channel={channel}
                      selected={selectedIds.has(lead.id)} onToggle={() => toggleLead(lead.id)} />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* ─── RIGHT: SEQUENCE + LAUNCH ──────────────────────────── */}
        <div className="space-y-4">

          {/* Selected Count */}
          <div className="card p-4 text-center">
            <Users className="w-8 h-8 text-prospex-accent mx-auto mb-2" />
            <p className="text-3xl font-mono font-bold text-prospex-text">{selectedIds.size}</p>
            <p className="text-[10px] font-mono text-prospex-dim uppercase mt-1">Leads Selected</p>
          </div>

          {/* Sequence Picker */}
          <div className="card p-4">
            <label className="text-[10px] text-prospex-dim font-mono uppercase mb-2 block">Select Sequence</label>
            {channelSequences.length > 0 ? (
              <div className="space-y-2">
                {channelSequences.map(seq => (
                  <button key={seq.id} onClick={() => setSelectedSequence(seq.id)}
                    className={cn(
                      'w-full text-left p-3 rounded border transition-colors',
                      selectedSequence === seq.id
                        ? 'bg-prospex-accent/10 border-prospex-accent/40'
                        : 'bg-prospex-bg border-prospex-border hover:border-prospex-accent/20'
                    )}>
                    <p className="text-sm text-prospex-text font-medium">{seq.name}</p>
                    <div className="flex items-center gap-2 mt-1 text-[10px] text-prospex-dim font-mono">
                      <span>{seq.steps?.length || 0} steps</span>
                      <span>•</span>
                      <span>{seq.total_enrolled || 0} enrolled</span>
                      {seq.total_replied > 0 && <span>• {seq.total_replied} replies</span>}
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-xs text-prospex-dim text-center py-2">No {channel} sequences yet</p>
            )}

            <button onClick={() => setShowSequenceBuilder(true)}
              className="w-full mt-2 btn text-xs bg-prospex-bg hover:bg-prospex-accent/10 text-prospex-accent border border-prospex-border py-2 flex items-center justify-center gap-1">
              <Plus className="w-3 h-3" /> Create New Sequence
            </button>
          </div>

          {/* Launch Button */}
          <button onClick={handleLaunch}
            disabled={selectedIds.size === 0 || !selectedSequence || launching}
            className={cn(
              'w-full py-4 rounded-xl font-bold text-base flex items-center justify-center gap-2 transition-all border',
              selectedIds.size > 0 && selectedSequence
                ? 'bg-prospex-accent/20 hover:bg-prospex-accent/30 text-prospex-accent border-prospex-accent/40 shadow-lg shadow-prospex-accent/10'
                : 'bg-prospex-bg text-prospex-dim border-prospex-border cursor-not-allowed'
            )}>
            {launching ? (
              <><Loader2 className="w-5 h-5 animate-spin" /> Queueing...</>
            ) : (
              <><Rocket className="w-5 h-5" /> Launch Outreach ({selectedIds.size} leads)</>
            )}
          </button>

          {/* Launch Result */}
          {launchResult && (
            <div className="card p-4 border-green-500/30 bg-green-500/5">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle className="w-5 h-5 text-green-400" />
                <span className="text-sm text-green-400 font-semibold">Outreach Queued!</span>
              </div>
              <p className="text-xs text-prospex-muted font-mono">
                {launchResult.queued} leads queued for {channel} outreach. Messages will send automatically during your send window (9am-8pm Mon-Sat) with human-like pacing.
              </p>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="card p-3 border-red-500/30 bg-red-500/5">
              <p className="text-xs text-red-400 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> {error}
              </p>
            </div>
          )}

          {/* Quick Stats */}
          <div className="card p-4">
            <h3 className="text-[10px] text-prospex-dim font-mono uppercase mb-3">Channel Reach</h3>
            <div className="space-y-2">
              {CHANNELS.map(ch => {
                const count = ch.id === 'email' ? leads.filter(l => l.has_email).length
                  : ch.id === 'instagram' ? leads.filter(l => l.instagram_verified).length
                  : ch.id === 'whatsapp' ? leads.filter(l => l.whatsapp_eligible).length
                  : 0;
                const pct = leads.length > 0 ? Math.round((count / leads.length) * 100) : 0;
                return (
                  <div key={ch.id} className="flex items-center gap-2">
                    <ch.icon className={cn('w-3 h-3', ch.color)} />
                    <span className="text-xs text-prospex-muted font-mono flex-1">{ch.label}</span>
                    <span className="text-xs font-mono text-prospex-text">{count}</span>
                    <span className="text-[10px] text-prospex-dim font-mono">({pct}%)</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Sequence Builder Modal */}
      {showSequenceBuilder && (
        <QuickSequenceModal
          channel={channel}
          onCreated={(seq) => {
            setSequences([seq, ...sequences]);
            setSelectedSequence(seq.id);
            setShowSequenceBuilder(false);
          }}
          onClose={() => setShowSequenceBuilder(false)}
        />
      )}
    </div>
  );
}
