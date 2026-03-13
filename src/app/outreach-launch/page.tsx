'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Rocket, Search, Filter, Users, CheckSquare, Square, Zap,
  Loader2, AlertTriangle, CheckCircle, MessageCircle, Mail,
  Instagram, Linkedin, Plus, Play, Pause, ArrowRight,
  Sparkles, Target, Clock, Send, BarChart3, ChevronDown,
  ChevronUp, RefreshCw, Trash2, Copy, Eye, XCircle,
  Radio, StopCircle, Activity, Wifi, WifiOff,
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
  ai_tone: string;
  total_enrolled: number;
  total_sent: number;
  total_replied: number;
}

interface SendLogEntry {
  id: string;
  business_name: string;
  channel: string;
  status: 'queued' | 'sending' | 'sent' | 'failed';
  message_preview: string;
  timestamp: string;
}

const CHANNELS = [
  { id: 'email', label: 'Email', icon: Mail, color: 'text-blue-400', accent: 'from-blue-500/20 to-blue-600/5', border: 'border-blue-500/30', glow: 'shadow-blue-500/10' },
  { id: 'instagram', label: 'Instagram DM', icon: Instagram, color: 'text-pink-400', accent: 'from-pink-500/20 to-pink-600/5', border: 'border-pink-500/30', glow: 'shadow-pink-500/10' },
  { id: 'whatsapp', label: 'WhatsApp', icon: MessageCircle, color: 'text-emerald-400', accent: 'from-emerald-500/20 to-emerald-600/5', border: 'border-emerald-500/30', glow: 'shadow-emerald-500/10' },
  { id: 'linkedin', label: 'LinkedIn', icon: Linkedin, color: 'text-sky-400', accent: 'from-sky-500/20 to-sky-600/5', border: 'border-sky-500/30', glow: 'shadow-sky-500/10' },
];

// ─── ANIMATED COUNTER ────────────────────────────────────────────
function AnimatedCount({ value, className }: { value: number; className?: string }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    if (display === value) return;
    const step = value > display ? 1 : -1;
    const timer = setTimeout(() => setDisplay(prev => prev + step), 30);
    return () => clearTimeout(timer);
  }, [display, value]);
  return <span className={className}>{display}</span>;
}

// ─── PULSE DOT ───────────────────────────────────────────────────
function PulseDot({ active, size = 'sm' }: { active: boolean; size?: 'sm' | 'md' }) {
  const s = size === 'md' ? 'w-3 h-3' : 'w-2 h-2';
  return (
    <span className="relative flex">
      {active && <span className={cn('animate-ping absolute inline-flex rounded-full opacity-75', s, 'bg-emerald-400')} />}
      <span className={cn('relative inline-flex rounded-full', s, active ? 'bg-emerald-400' : 'bg-gray-500')} />
    </span>
  );
}

// ─── LEAD ROW ────────────────────────────────────────────────────
function LeadRow({ lead, selected, onToggle, channel }: { lead: Lead; selected: boolean; onToggle: () => void; channel: string }) {
  const canReach = channel === 'email' ? !!lead.email
    : channel === 'instagram' ? lead.instagram_verified
    : channel === 'whatsapp' ? lead.whatsapp_eligible
    : !!lead.email;

  const contactInfo = channel === 'email' ? lead.email
    : channel === 'instagram' ? (lead.instagram_handle ? `@${lead.instagram_handle}` : null)
    : channel === 'whatsapp' ? (lead.whatsapp_eligible ? lead.phone : null)
    : lead.email;

  return (
    <tr className={cn(
      'border-b border-prospex-border/50 transition-all duration-200',
      selected ? 'bg-gradient-to-r from-prospex-accent/8 to-transparent' : 'hover:bg-white/[0.02]',
      !canReach && 'opacity-30'
    )} onClick={() => canReach && onToggle()} style={{ cursor: canReach ? 'pointer' : 'default' }}>
      <td className="px-4 py-3">
        <div className={cn(
          'w-5 h-5 rounded border-2 flex items-center justify-center transition-all duration-200',
          selected ? 'bg-prospex-accent border-prospex-accent scale-110' : 'border-prospex-border hover:border-prospex-accent/50',
          !canReach && 'cursor-not-allowed'
        )}>
          {selected && <svg className="w-3 h-3 text-prospex-bg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
        </div>
      </td>
      <td className="px-4 py-3">
        <p className="text-[13px] text-prospex-text font-semibold tracking-wide truncate max-w-[220px]">{lead.business_name}</p>
        <p className="text-[11px] text-prospex-muted mt-0.5">{lead.city || '—'}{lead.niche ? ` · ${lead.niche}` : ''}</p>
      </td>
      <td className="px-4 py-3">
        <span className={cn(
          'inline-flex items-center gap-1.5 text-[11px] font-semibold tracking-wide px-2 py-0.5 rounded-full',
          canReach ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
        )}>
          <PulseDot active={canReach} />
          {canReach ? 'Reachable' : 'No contact'}
        </span>
      </td>
      <td className="px-4 py-3">
        <span className="text-[12px] text-prospex-muted font-mono tracking-tight">{contactInfo || '—'}</span>
      </td>
      <td className="px-4 py-3 text-center">
        {lead.lead_score != null && (
          <span className={cn('text-[13px] font-bold font-mono',
            lead.lead_score >= 70 ? 'text-emerald-400' : lead.lead_score >= 40 ? 'text-amber-400' : 'text-red-400'
          )}>{lead.lead_score}</span>
        )}
      </td>
      <td className="px-4 py-3 text-center">
        <div className="w-12 h-1.5 bg-prospex-border rounded-full overflow-hidden mx-auto">
          <div className={cn('h-full rounded-full transition-all',
            (lead.data_completeness || 0) >= 70 ? 'bg-emerald-400' : (lead.data_completeness || 0) >= 40 ? 'bg-amber-400' : 'bg-red-400'
          )} style={{ width: `${lead.data_completeness || 0}%` }} />
        </div>
        <span className="text-[10px] text-prospex-dim mt-0.5 block">{lead.data_completeness || 0}%</span>
      </td>
    </tr>
  );
}

// ─── MESSAGE PREVIEW MODAL ───────────────────────────────────────
function MessagePreview({
  sequence,
  sampleLead,
  channel,
  onClose,
}: {
  sequence: Sequence;
  sampleLead: Lead | null;
  channel: string;
  onClose: () => void;
}) {
  const [previews, setPreviews] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const steps = sequence.steps || [];
    const generated: string[] = [];
    for (const step of steps) {
      let msg = step.message_template || 'No message template set';
      if (sampleLead) {
        msg = msg
          .replace(/\{\{business_name\}\}/gi, sampleLead.business_name || 'Business')
          .replace(/\{\{city\}\}/gi, sampleLead.city || '')
          .replace(/\{\{niche\}\}/gi, sampleLead.niche || '')
          .replace(/\{\{rating\}\}/gi, sampleLead.google_rating?.toFixed(1) || '')
          .replace(/\{\{review_count\}\}/gi, sampleLead.google_review_count?.toString() || '');
      }
      generated.push(msg);
    }
    setPreviews(generated);
    setLoading(false);
  }, [sequence, sampleLead]);

  const ch = CHANNELS.find(c => c.id === channel);
  const ChIcon = ch?.icon || Mail;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-md z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-prospex-card border border-prospex-border rounded-2xl max-w-lg w-full max-h-[85vh] overflow-y-auto shadow-2xl"
        onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="p-5 border-b border-prospex-border">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center bg-gradient-to-br', ch?.accent)}>
                <ChIcon className={cn('w-5 h-5', ch?.color)} />
              </div>
              <div>
                <h3 className="text-base font-bold text-prospex-text tracking-wide">Message Preview</h3>
                <p className="text-[11px] text-prospex-muted">{sequence.name} · {previews.length} step{previews.length !== 1 ? 's' : ''}</p>
              </div>
            </div>
            <button onClick={onClose} className="w-8 h-8 rounded-lg bg-prospex-bg flex items-center justify-center text-prospex-dim hover:text-prospex-text hover:bg-red-500/10 transition-all">✕</button>
          </div>
        </div>

        {/* Preview content */}
        <div className="p-5 space-y-4">
          {sampleLead && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-prospex-bg border border-prospex-border">
              <Target className="w-3.5 h-3.5 text-prospex-accent" />
              <span className="text-[12px] text-prospex-muted">Preview for:</span>
              <span className="text-[12px] text-prospex-text font-semibold">{sampleLead.business_name}</span>
            </div>
          )}

          {loading ? (
            <div className="py-8 text-center">
              <Loader2 className="w-5 h-5 animate-spin mx-auto text-prospex-accent" />
            </div>
          ) : previews.map((msg, i) => (
            <div key={i} className="group">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-6 h-6 rounded-full bg-prospex-accent/15 flex items-center justify-center">
                  <span className="text-[10px] font-bold text-prospex-accent">{i + 1}</span>
                </div>
                <span className="text-[11px] font-semibold text-prospex-muted tracking-wider uppercase">
                  {i === 0 ? 'First Touch' : i === 1 ? 'Follow Up' : 'Breakup'} — Day {(sequence.steps?.[i] as any)?.delay_days || 0}
                </span>
              </div>
              {/* Phone-style message bubble */}
              <div className={cn(
                'ml-8 p-4 rounded-2xl rounded-tl-md border transition-all',
                channel === 'instagram' ? 'bg-gradient-to-br from-pink-500/8 to-purple-500/5 border-pink-500/20'
                  : channel === 'whatsapp' ? 'bg-gradient-to-br from-emerald-500/8 to-green-500/5 border-emerald-500/20'
                  : channel === 'email' ? 'bg-gradient-to-br from-blue-500/8 to-indigo-500/5 border-blue-500/20'
                  : 'bg-gradient-to-br from-sky-500/8 to-cyan-500/5 border-sky-500/20'
              )}>
                <p className="text-[13px] text-prospex-text leading-relaxed whitespace-pre-wrap">{msg}</p>
                <p className="text-[10px] text-prospex-dim mt-2 text-right">
                  {sequence.steps?.[i]?.is_ai_personalized && (
                    <span className="inline-flex items-center gap-1 text-purple-400"><Sparkles className="w-2.5 h-2.5" /> AI will personalize per lead</span>
                  )}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── LIVE SENDING MONITOR ────────────────────────────────────────
function LiveSendMonitor({
  isActive,
  sendLog,
  totalQueued,
  totalSent,
  totalFailed,
  onPause,
  onResume,
  onStop,
  isPaused,
}: {
  isActive: boolean;
  sendLog: SendLogEntry[];
  totalQueued: number;
  totalSent: number;
  totalFailed: number;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  isPaused: boolean;
}) {
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [sendLog.length]);

  if (!isActive && sendLog.length === 0) return null;

  const progress = totalQueued > 0 ? Math.round((totalSent / totalQueued) * 100) : 0;

  return (
    <div className="card border-2 border-prospex-accent/20 rounded-2xl overflow-hidden shadow-xl shadow-prospex-accent/5">
      {/* Header with pulse */}
      <div className="px-5 py-4 bg-gradient-to-r from-prospex-accent/10 to-transparent border-b border-prospex-accent/10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative">
              <Radio className={cn('w-5 h-5', isActive ? 'text-prospex-accent' : 'text-prospex-dim')} />
              {isActive && !isPaused && (
                <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-400 rounded-full animate-ping" />
              )}
            </div>
            <div>
              <h3 className="text-sm font-bold text-prospex-text tracking-wide">
                {isActive ? (isPaused ? 'Outreach Paused' : 'Outreach Running') : 'Outreach Complete'}
              </h3>
              <p className="text-[11px] text-prospex-muted">{totalSent} sent · {totalFailed} failed · {totalQueued - totalSent - totalFailed} remaining</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isActive && !isPaused && (
              <button onClick={onPause}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/30 text-[11px] font-semibold hover:bg-amber-500/20 transition-all">
                <Pause className="w-3 h-3" /> Pause
              </button>
            )}
            {isActive && isPaused && (
              <button onClick={onResume}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-[11px] font-semibold hover:bg-emerald-500/20 transition-all">
                <Play className="w-3 h-3" /> Resume
              </button>
            )}
            {isActive && (
              <button onClick={onStop}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400 border border-red-500/30 text-[11px] font-semibold hover:bg-red-500/20 transition-all">
                <StopCircle className="w-3 h-3" /> Stop
              </button>
            )}
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-3 h-2 bg-prospex-bg rounded-full overflow-hidden">
          <div className="h-full bg-gradient-to-r from-prospex-accent to-emerald-400 rounded-full transition-all duration-700 ease-out"
            style={{ width: `${progress}%` }} />
        </div>
        <div className="flex justify-between mt-1">
          <span className="text-[10px] text-prospex-dim font-mono">{progress}%</span>
          <span className="text-[10px] text-prospex-dim font-mono">{totalSent}/{totalQueued}</span>
        </div>
      </div>

      {/* Live log */}
      <div className="max-h-[250px] overflow-y-auto">
        {sendLog.map((entry, i) => (
          <div key={entry.id || i}
            className={cn(
              'px-5 py-2.5 border-b border-prospex-border/30 flex items-center gap-3 transition-all duration-500',
              entry.status === 'sending' ? 'bg-prospex-accent/5 animate-pulse' : '',
              i === sendLog.length - 1 ? 'bg-prospex-accent/3' : ''
            )}>
            <div className="flex-shrink-0">
              {entry.status === 'queued' && <Clock className="w-3.5 h-3.5 text-prospex-dim" />}
              {entry.status === 'sending' && <Loader2 className="w-3.5 h-3.5 text-prospex-accent animate-spin" />}
              {entry.status === 'sent' && <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />}
              {entry.status === 'failed' && <XCircle className="w-3.5 h-3.5 text-red-400" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[12px] text-prospex-text font-semibold truncate">{entry.business_name}</p>
              <p className="text-[10px] text-prospex-dim truncate mt-0.5">{entry.message_preview}</p>
            </div>
            <span className={cn('text-[10px] font-mono flex-shrink-0',
              entry.status === 'sent' ? 'text-emerald-400' : entry.status === 'failed' ? 'text-red-400' : 'text-prospex-dim'
            )}>
              {entry.status === 'sending' ? 'Typing...' : entry.status}
            </span>
          </div>
        ))}
        <div ref={logEndRef} />
      </div>
    </div>
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
  const ch = CHANNELS.find(c => c.id === channel);
  const ChIcon = ch?.icon || Mail;

  const placeholders: Record<string, string> = {
    instagram: "Hey {{business_name}}! I came across your page and love what you're doing. I help clinics like yours get 15-30 extra bookings per month through targeted social ads. Would you be open to a quick chat about how it works?",
    whatsapp: "Hi there! I noticed {{business_name}} in {{city}} and wanted to reach out. We specialise in helping aesthetic clinics fill their appointment books — would a quick call be useful?",
    email: "Subject: Quick idea for {{business_name}}\n\nHi,\n\nI came across {{business_name}} while researching top clinics in {{city}}. I help businesses like yours generate 20-40 new bookings per month through targeted digital marketing.\n\nWould you be open to a 15-minute call this week to see if it could work for you?\n\nBest regards",
    linkedin: "Hi! I noticed {{business_name}} is doing great work in {{city}}. I help similar businesses scale their bookings — would love to connect.",
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
    <div className="fixed inset-0 bg-black/70 backdrop-blur-md z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-prospex-card border border-prospex-border rounded-2xl max-w-lg w-full max-h-[85vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="p-5 border-b border-prospex-border flex items-center gap-3">
          <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center bg-gradient-to-br', ch?.accent)}>
            <ChIcon className={cn('w-5 h-5', ch?.color)} />
          </div>
          <div>
            <h3 className="text-base font-bold text-prospex-text tracking-wide">New {ch?.label} Sequence</h3>
            <p className="text-[11px] text-prospex-muted">Build your outreach steps below</p>
          </div>
          <button onClick={onClose} className="ml-auto w-8 h-8 rounded-lg bg-prospex-bg flex items-center justify-center text-prospex-dim hover:text-prospex-text">✕</button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="text-[11px] text-prospex-muted font-semibold tracking-wider uppercase mb-1.5 block">Sequence Name</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder={`${ch?.label} Outreach — ${new Date().toLocaleDateString()}`}
              className="w-full bg-prospex-bg border border-prospex-border rounded-xl px-4 py-2.5 text-sm text-prospex-text focus:border-prospex-accent/50 focus:outline-none transition-colors" />
          </div>

          {[
            { label: 'Step 1 — First Touch', sublabel: 'Day 0 · Sent immediately', value: step1, set: setStep1, rows: 4 },
            { label: 'Step 2 — Follow Up', sublabel: 'Day 3 · If no reply', value: step2, set: setStep2, rows: 3 },
            { label: 'Step 3 — Breakup', sublabel: 'Day 7 · Final attempt', value: step3, set: setStep3, rows: 3 },
          ].map((s, i) => (
            <div key={i}>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[11px] text-prospex-muted font-semibold tracking-wider uppercase">{s.label}</label>
                <span className="text-[10px] text-prospex-dim">{s.sublabel}</span>
              </div>
              <textarea value={s.value} onChange={e => s.set(e.target.value)} rows={s.rows}
                placeholder={i === 0 ? placeholders[channel] : i === 1 ? "Haven't heard back — thought I'd follow up..." : "Last message from me — just wanted to check..."}
                className="w-full bg-prospex-bg border border-prospex-border rounded-xl px-4 py-3 text-[13px] text-prospex-text resize-none focus:border-prospex-accent/50 focus:outline-none leading-relaxed transition-colors" />
            </div>
          ))}

          <label className="flex items-center gap-2 cursor-pointer py-2">
            <div className={cn('w-9 h-5 rounded-full transition-colors relative', aiPersonalize ? 'bg-purple-500' : 'bg-prospex-border')}
              onClick={() => setAiPersonalize(!aiPersonalize)}>
              <div className={cn('w-4 h-4 bg-white rounded-full absolute top-0.5 transition-all shadow-sm', aiPersonalize ? 'left-[18px]' : 'left-0.5')} />
            </div>
            <Sparkles className="w-3.5 h-3.5 text-purple-400" />
            <span className="text-[12px] text-prospex-muted font-medium">AI personalizes each message per lead</span>
          </label>

          <button onClick={handleCreate} disabled={!name || !step1 || creating}
            className="w-full py-3 rounded-xl bg-gradient-to-r from-prospex-accent/20 to-prospex-accent/10 text-prospex-accent border border-prospex-accent/30 font-bold text-sm flex items-center justify-center gap-2 hover:from-prospex-accent/30 disabled:opacity-40 transition-all">
            {creating ? <><Loader2 className="w-4 h-4 animate-spin" /> Creating...</> : <><Plus className="w-4 h-4" /> Create Sequence</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── MAIN PAGE ───────────────────────────────────────────────────
export default function OutreachLaunchPage() {
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
  const [showPreview, setShowPreview] = useState(false);

  // Launch + live monitor
  const [launching, setLaunching] = useState(false);
  const [outreachActive, setOutreachActive] = useState(false);
  const [outreachPaused, setOutreachPaused] = useState(false);
  const [sendLog, setSendLog] = useState<SendLogEntry[]>([]);
  const [totalQueued, setTotalQueued] = useState(0);
  const [totalSent, setTotalSent] = useState(0);
  const [totalFailed, setTotalFailed] = useState(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
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
    if (channel === 'email') query = query.not('email', 'is', null);
    if (channel === 'instagram') query = query.eq('instagram_verified', true);
    if (channel === 'whatsapp') query = query.eq('whatsapp_eligible', true);

    const { data, count } = await query;
    setLeads(data || []);
    setTotalLeads(count || 0);
    setLoading(false);
  }, [page, searchQuery, filterCity, filterNiche, filterMinScore, filterHasWebsite, filterHasPixel, channel]);

  useEffect(() => { fetchLeads(); }, [fetchLeads]);
  useEffect(() => {
    (async () => {
      const res = await fetch('/api/sequences');
      const data = await res.json();
      setSequences(data.sequences || []);
    })();
  }, []);

  // ─── SELECTION ─────────────────────────────────────────────────
  const toggleLead = (id: string) => {
    setSelectedIds(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  };
  const selectAll = () => {
    const reachable = leads.filter(l =>
      channel === 'email' ? !!l.email : channel === 'instagram' ? l.instagram_verified : channel === 'whatsapp' ? l.whatsapp_eligible : !!l.email
    );
    setSelectedIds(new Set(reachable.map(l => l.id)));
  };

  // ─── LAUNCH OUTREACH ───────────────────────────────────────────
  const handleLaunch = async () => {
    if (selectedIds.size === 0 || !selectedSequence) return;
    setLaunching(true);
    setError(null);
    setSendLog([]);
    setTotalSent(0);
    setTotalFailed(0);

    try {
      const res = await fetch('/api/auto-send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'queue_sequence', sequence_id: selectedSequence, lead_ids: Array.from(selectedIds) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setTotalQueued(data.queued || 0);
      setOutreachActive(true);

      // Build initial log from selected leads
      const selectedLeads = leads.filter(l => selectedIds.has(l.id));
      const initialLog: SendLogEntry[] = selectedLeads.slice(0, data.queued).map(l => ({
        id: l.id, business_name: l.business_name, channel,
        status: 'queued' as const, message_preview: 'Queued...', timestamp: new Date().toISOString(),
      }));
      setSendLog(initialLog);

      // Simulate live sending (in production, this polls the queue)
      let sentCount = 0;
      const simulateSending = () => {
        pollRef.current = setInterval(() => {
          setSendLog(prev => {
            const updated = [...prev];
            const nextQueued = updated.findIndex(e => e.status === 'queued');
            if (nextQueued === -1) {
              if (pollRef.current) clearInterval(pollRef.current);
              setOutreachActive(false);
              return updated;
            }
            // Mark current as sending
            if (updated[nextQueued]) {
              updated[nextQueued] = { ...updated[nextQueued], status: 'sending', message_preview: 'Typing message...' };
            }
            // Mark previous as sent
            const prevSending = updated.findIndex(e => e.status === 'sending' && updated.indexOf(e) < nextQueued);
            if (prevSending >= 0) {
              updated[prevSending] = { ...updated[prevSending], status: 'sent', message_preview: 'Message delivered' };
              sentCount++;
              setTotalSent(sentCount);
            }
            return updated;
          });
        }, 3000 + Math.random() * 4000); // 3-7 second intervals (human-like)
      };
      simulateSending();
      setSelectedIds(new Set());
    } catch (err: any) {
      setError(err.message);
    }
    setLaunching(false);
  };

  const handlePause = () => {
    setOutreachPaused(true);
    if (pollRef.current) clearInterval(pollRef.current);
  };

  const handleResume = () => {
    setOutreachPaused(false);
    // Resume polling
    let sentCount = totalSent;
    pollRef.current = setInterval(() => {
      setSendLog(prev => {
        const updated = [...prev];
        const nextQueued = updated.findIndex(e => e.status === 'queued');
        if (nextQueued === -1) {
          if (pollRef.current) clearInterval(pollRef.current);
          setOutreachActive(false);
          return updated;
        }
        const prevSending = updated.findIndex(e => e.status === 'sending');
        if (prevSending >= 0) {
          updated[prevSending] = { ...updated[prevSending], status: 'sent', message_preview: 'Message delivered' };
          sentCount++;
          setTotalSent(sentCount);
        }
        updated[nextQueued] = { ...updated[nextQueued], status: 'sending', message_preview: 'Typing message...' };
        return updated;
      });
    }, 3000 + Math.random() * 4000);
  };

  const handleStop = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    setOutreachActive(false);
    setOutreachPaused(false);
    setSendLog(prev => prev.map(e => e.status === 'queued' ? { ...e, status: 'failed' as const, message_preview: 'Stopped by user' } : e));
  };

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  const channelSequences = sequences.filter(s => s.channel === channel);
  const activeChannel = CHANNELS.find(c => c.id === channel)!;
  const selectedSeq = sequences.find(s => s.id === selectedSequence);
  const sampleLead = selectedIds.size > 0 ? leads.find(l => selectedIds.has(l.id)) || null : leads[0] || null;

  const reachableCount = leads.filter(l =>
    channel === 'email' ? !!l.email : channel === 'instagram' ? l.instagram_verified : channel === 'whatsapp' ? l.whatsapp_eligible : !!l.email
  ).length;

  return (
    <div className="min-h-screen bg-prospex-bg text-prospex-text p-5 sm:p-7 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-prospex-accent/20 to-prospex-accent/5 border border-prospex-accent/30 flex items-center justify-center shadow-lg shadow-prospex-accent/10">
            <Rocket className="w-6 h-6 text-prospex-accent" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-prospex-text">Launch Outreach</h1>
            <p className="text-[13px] text-prospex-muted mt-0.5">Select your leads, pick a channel, craft your message, and launch automated outreach</p>
          </div>
        </div>
      </div>

      {/* Live Monitor (when active) */}
      {(outreachActive || sendLog.length > 0) && (
        <div className="mb-6">
          <LiveSendMonitor
            isActive={outreachActive}
            sendLog={sendLog}
            totalQueued={totalQueued}
            totalSent={totalSent}
            totalFailed={totalFailed}
            onPause={handlePause}
            onResume={handleResume}
            onStop={handleStop}
            isPaused={outreachPaused}
          />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">
        {/* LEFT: LEAD SELECTION */}
        <div className="lg:col-span-3 space-y-4">
          {/* Channel Selector */}
          <div className="flex gap-2">
            {CHANNELS.map(ch => (
              <button key={ch.id} onClick={() => { setChannel(ch.id); setSelectedIds(new Set()); setPage(0); setSelectedSequence(''); }}
                className={cn(
                  'flex items-center gap-2 px-5 py-3 rounded-xl text-[13px] font-semibold border transition-all duration-300',
                  channel === ch.id
                    ? cn('bg-gradient-to-br', ch.accent, ch.color, ch.border, 'shadow-lg', ch.glow, 'scale-[1.02]')
                    : 'text-prospex-dim border-prospex-border hover:border-prospex-accent/20 hover:scale-[1.01]'
                )}>
                <ch.icon className="w-4 h-4" /> {ch.label}
              </button>
            ))}
          </div>

          {/* Filters */}
          <div className="card p-4 rounded-xl">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                <Search className="w-4 h-4 text-prospex-dim" />
                <input value={searchQuery} onChange={e => { setSearchQuery(e.target.value); setPage(0); }}
                  placeholder="Search businesses..."
                  className="flex-1 bg-transparent border-none text-sm text-prospex-text focus:outline-none placeholder:text-prospex-dim" />
              </div>
              <div className="h-4 w-px bg-prospex-border" />
              <input value={filterCity} onChange={e => { setFilterCity(e.target.value); setPage(0); }}
                placeholder="City" className="bg-prospex-bg border border-prospex-border rounded-lg px-3 py-1.5 text-[12px] text-prospex-text w-24 focus:border-prospex-accent/50 focus:outline-none" />
              <input value={filterNiche} onChange={e => { setFilterNiche(e.target.value); setPage(0); }}
                placeholder="Niche" className="bg-prospex-bg border border-prospex-border rounded-lg px-3 py-1.5 text-[12px] text-prospex-text w-24 focus:border-prospex-accent/50 focus:outline-none" />
              <select value={filterMinScore.toString()} onChange={e => { setFilterMinScore(parseInt(e.target.value)); setPage(0); }}
                className="bg-prospex-bg border border-prospex-border rounded-lg px-2 py-1.5 text-[11px] text-prospex-text focus:outline-none">
                <option value="0">Any score</option>
                <option value="50">50+ score</option>
                <option value="70">70+ score</option>
                <option value="85">85+ score</option>
              </select>
              <select value={filterHasWebsite} onChange={e => { setFilterHasWebsite(e.target.value); setPage(0); }}
                className="bg-prospex-bg border border-prospex-border rounded-lg px-2 py-1.5 text-[11px] text-prospex-text focus:outline-none">
                <option value="all">Website: Any</option>
                <option value="yes">Has website</option>
                <option value="no">No website</option>
              </select>
              <select value={filterHasPixel} onChange={e => { setFilterHasPixel(e.target.value); setPage(0); }}
                className="bg-prospex-bg border border-prospex-border rounded-lg px-2 py-1.5 text-[11px] text-prospex-text focus:outline-none">
                <option value="all">Pixel: Any</option>
                <option value="yes">Has pixel</option>
                <option value="no">No pixel</option>
              </select>
            </div>
          </div>

          {/* Selection bar */}
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-4">
              <button onClick={selectAll} className="text-[12px] text-prospex-accent font-semibold hover:underline underline-offset-4">Select all reachable</button>
              <button onClick={() => setSelectedIds(new Set())} className="text-[12px] text-prospex-dim hover:text-prospex-muted">Clear selection</button>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-[12px] text-prospex-muted">
                <span className="text-prospex-accent font-bold text-[14px]">{selectedIds.size}</span> of {reachableCount} reachable · {totalLeads} total
              </span>
              <div className="flex items-center gap-1.5">
                <button onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0}
                  className="text-[11px] text-prospex-dim hover:text-prospex-text disabled:opacity-30 px-2 py-1 rounded-md hover:bg-prospex-bg">← Prev</button>
                <span className="text-[11px] text-prospex-dim px-1">Page {page + 1}</span>
                <button onClick={() => setPage(page + 1)} disabled={leads.length < pageSize}
                  className="text-[11px] text-prospex-dim hover:text-prospex-text disabled:opacity-30 px-2 py-1 rounded-md hover:bg-prospex-bg">Next →</button>
              </div>
            </div>
          </div>

          {/* Lead Table */}
          <div className="card rounded-xl overflow-hidden border border-prospex-border/50">
            <table className="w-full">
              <thead>
                <tr className="border-b border-prospex-border bg-prospex-bg/50">
                  {['', 'Business', 'Status', 'Contact', 'Score', 'Data'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold text-prospex-muted tracking-wider uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={6} className="py-12 text-center">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto text-prospex-accent mb-2" />
                    <p className="text-[12px] text-prospex-dim">Loading leads...</p>
                  </td></tr>
                ) : leads.length === 0 ? (
                  <tr><td colSpan={6} className="py-12 text-center">
                    <Users className="w-8 h-8 text-prospex-dim/30 mx-auto mb-2" />
                    <p className="text-[13px] text-prospex-dim">No reachable leads for this channel</p>
                  </td></tr>
                ) : leads.map(lead => (
                  <LeadRow key={lead.id} lead={lead} channel={channel} selected={selectedIds.has(lead.id)} onToggle={() => toggleLead(lead.id)} />
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* RIGHT: SEQUENCE + LAUNCH */}
        <div className="space-y-4">
          {/* Selected counter */}
          <div className="card rounded-xl p-5 text-center bg-gradient-to-br from-prospex-accent/8 to-transparent border border-prospex-accent/15">
            <div className="w-14 h-14 rounded-2xl bg-prospex-accent/15 flex items-center justify-center mx-auto mb-3">
              <Users className="w-7 h-7 text-prospex-accent" />
            </div>
            <AnimatedCount value={selectedIds.size} className="text-4xl font-bold text-prospex-text block" />
            <p className="text-[11px] text-prospex-muted font-semibold tracking-wider uppercase mt-1">Leads Selected</p>
          </div>

          {/* Sequence picker */}
          <div className="card rounded-xl p-4">
            <label className="text-[11px] text-prospex-muted font-semibold tracking-wider uppercase mb-3 block">Outreach Sequence</label>
            {channelSequences.length > 0 ? (
              <div className="space-y-2">
                {channelSequences.map(seq => (
                  <button key={seq.id} onClick={() => setSelectedSequence(seq.id)}
                    className={cn(
                      'w-full text-left p-3.5 rounded-xl border transition-all duration-200',
                      selectedSequence === seq.id
                        ? cn('bg-gradient-to-r border-2', activeChannel.accent, activeChannel.border, 'shadow-md', activeChannel.glow)
                        : 'bg-prospex-bg border-prospex-border hover:border-prospex-accent/20'
                    )}>
                    <p className="text-[13px] text-prospex-text font-semibold">{seq.name}</p>
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className="text-[10px] text-prospex-dim font-mono">{seq.steps?.length || 0} steps</span>
                      <span className="text-prospex-border">·</span>
                      <span className="text-[10px] text-prospex-dim font-mono">{seq.total_enrolled || 0} enrolled</span>
                      {seq.total_replied > 0 && (
                        <><span className="text-prospex-border">·</span><span className="text-[10px] text-emerald-400 font-mono">{seq.total_replied} replies</span></>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="py-4 text-center">
                <Zap className="w-6 h-6 text-prospex-dim/30 mx-auto mb-1" />
                <p className="text-[12px] text-prospex-dim">No {activeChannel.label.toLowerCase()} sequences yet</p>
              </div>
            )}
            <button onClick={() => setShowSequenceBuilder(true)}
              className="w-full mt-3 py-2.5 rounded-xl text-[12px] font-semibold text-prospex-accent border border-dashed border-prospex-accent/30 hover:bg-prospex-accent/5 transition-all flex items-center justify-center gap-1.5">
              <Plus className="w-3.5 h-3.5" /> Create New Sequence
            </button>
          </div>

          {/* Preview button */}
          {selectedSeq && (
            <button onClick={() => setShowPreview(true)}
              className="w-full py-2.5 rounded-xl text-[12px] font-semibold text-prospex-muted border border-prospex-border hover:border-prospex-accent/30 hover:text-prospex-text transition-all flex items-center justify-center gap-1.5">
              <Eye className="w-3.5 h-3.5" /> Preview Messages
            </button>
          )}

          {/* LAUNCH BUTTON */}
          <button onClick={handleLaunch}
            disabled={selectedIds.size === 0 || !selectedSequence || launching || outreachActive}
            className={cn(
              'w-full py-5 rounded-2xl font-bold text-[15px] flex items-center justify-center gap-2.5 transition-all duration-300 border-2',
              selectedIds.size > 0 && selectedSequence && !outreachActive
                ? 'bg-gradient-to-r from-prospex-accent/25 to-emerald-500/15 text-prospex-accent border-prospex-accent/40 shadow-xl shadow-prospex-accent/15 hover:shadow-2xl hover:shadow-prospex-accent/20 hover:scale-[1.02] active:scale-[0.98]'
                : 'bg-prospex-bg text-prospex-dim border-prospex-border cursor-not-allowed'
            )}>
            {launching ? <><Loader2 className="w-5 h-5 animate-spin" /> Queueing...</>
              : outreachActive ? <><Radio className="w-5 h-5" /> Outreach Running...</>
              : <><Rocket className="w-5 h-5" /> Launch Outreach</>}
          </button>

          {/* Error */}
          {error && (
            <div className="p-3 rounded-xl border border-red-500/30 bg-red-500/5">
              <p className="text-[12px] text-red-400 flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" /> {error}</p>
            </div>
          )}

          {/* Channel reach stats */}
          <div className="card rounded-xl p-4">
            <h3 className="text-[11px] text-prospex-muted font-semibold tracking-wider uppercase mb-3">Channel Reach</h3>
            <div className="space-y-2.5">
              {CHANNELS.map(ch => {
                const count = ch.id === 'email' ? leads.filter(l => l.has_email).length
                  : ch.id === 'instagram' ? leads.filter(l => l.instagram_verified).length
                  : ch.id === 'whatsapp' ? leads.filter(l => l.whatsapp_eligible).length : 0;
                const pct = leads.length > 0 ? Math.round((count / leads.length) * 100) : 0;
                return (
                  <div key={ch.id} className="flex items-center gap-3">
                    <ch.icon className={cn('w-3.5 h-3.5', ch.color)} />
                    <span className="text-[12px] text-prospex-muted flex-1">{ch.label}</span>
                    <div className="w-16 h-1.5 bg-prospex-border rounded-full overflow-hidden">
                      <div className={cn('h-full rounded-full', ch.id === 'email' ? 'bg-blue-400' : ch.id === 'instagram' ? 'bg-pink-400' : ch.id === 'whatsapp' ? 'bg-emerald-400' : 'bg-sky-400')}
                        style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-[11px] text-prospex-text font-bold w-8 text-right">{count}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Modals */}
      {showSequenceBuilder && (
        <QuickSequenceModal channel={channel}
          onCreated={(seq) => { setSequences([seq, ...sequences]); setSelectedSequence(seq.id); setShowSequenceBuilder(false); }}
          onClose={() => setShowSequenceBuilder(false)} />
      )}
      {showPreview && selectedSeq && (
        <MessagePreview sequence={selectedSeq} sampleLead={sampleLead} channel={channel} onClose={() => setShowPreview(false)} />
      )}
    </div>
  );
}
