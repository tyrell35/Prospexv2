'use client';

import { useState, useEffect } from 'react';
import {
  Zap, Plus, Play, Pause, Trash2, Edit3, Users, Send, Clock,
  MessageCircle, Mail, Instagram, Linkedin, ChevronDown, ChevronUp,
  Loader2, CheckCircle, AlertTriangle, ArrowRight, Sparkles,
  BarChart3, Target, Copy, RefreshCw, XCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';

interface Sequence {
  id: string;
  name: string;
  description: string;
  status: string;
  channel: string;
  niche: string;
  steps: SequenceStep[];
  ai_tone: string;
  ai_context: string;
  ai_personalization_enabled: boolean;
  total_enrolled: number;
  total_sent: number;
  total_replied: number;
  total_booked: number;
  reply_rate: number;
  booking_rate: number;
  send_window_start: number;
  send_window_end: number;
  send_days: string[];
  send_timezone: string;
  created_at: string;
  updated_at: string;
}

interface SequenceStep {
  step_number: number;
  delay_days: number;
  channel?: string;
  message_template: string;
  subject?: string;
  is_ai_personalized: boolean;
  ai_prompt?: string;
  condition: string;
}

const CHANNELS = [
  { id: 'email', label: 'Email', icon: Mail, color: 'text-blue-400' },
  { id: 'instagram', label: 'Instagram', icon: Instagram, color: 'text-pink-400' },
  { id: 'whatsapp', label: 'WhatsApp', icon: MessageCircle, color: 'text-green-400' },
  { id: 'linkedin', label: 'LinkedIn', icon: Linkedin, color: 'text-sky-400' },
];

const AI_TONES = [
  { id: 'professional_friendly', label: 'Professional & Friendly' },
  { id: 'casual', label: 'Casual' },
  { id: 'formal', label: 'Formal' },
  { id: 'bold', label: 'Bold & Direct' },
  { id: 'empathetic', label: 'Empathetic' },
];

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-500/15 text-gray-400 border-gray-500/30',
  active: 'bg-green-500/15 text-green-400 border-green-500/30',
  paused: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
  completed: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  archived: 'bg-red-500/15 text-red-400 border-red-500/30',
};

// ─── SEQUENCE CARD ───────────────────────────────────────────────
function SequenceCard({
  seq,
  onEdit,
  onToggle,
  onDelete,
}: {
  seq: Sequence;
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const channelConfig = CHANNELS.find(c => c.id === seq.channel) || CHANNELS[0];
  const Icon = channelConfig.icon;

  return (
    <div className="card p-4 hover:border-prospex-accent/20 transition-colors">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Icon className={cn('w-4 h-4', channelConfig.color)} />
            <h3 className="font-semibold text-prospex-text truncate">{seq.name}</h3>
            <span className={cn('text-[10px] font-mono px-2 py-0.5 rounded-full border', STATUS_COLORS[seq.status] || STATUS_COLORS.draft)}>
              {seq.status}
            </span>
          </div>
          {seq.description && <p className="text-xs text-prospex-muted line-clamp-1">{seq.description}</p>}
        </div>
        <div className="flex items-center gap-1">
          <button onClick={onToggle} className="p-1.5 rounded hover:bg-prospex-bg text-prospex-dim hover:text-prospex-text">
            {seq.status === 'active' ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          </button>
          <button onClick={onEdit} className="p-1.5 rounded hover:bg-prospex-bg text-prospex-dim hover:text-prospex-text">
            <Edit3 className="w-4 h-4" />
          </button>
          <button onClick={onDelete} className="p-1.5 rounded hover:bg-prospex-bg text-prospex-dim hover:text-red-400">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Steps preview */}
      <div className="flex items-center gap-1 mb-3 overflow-x-auto">
        {seq.steps?.map((step, i) => (
          <div key={i} className="flex items-center gap-1">
            <div className="px-2 py-1 bg-prospex-bg rounded border border-prospex-border text-[10px] font-mono text-prospex-muted whitespace-nowrap">
              {step.delay_days > 0 ? `Day ${step.delay_days}` : 'Day 0'}
              {step.is_ai_personalized && <Sparkles className="w-2.5 h-2.5 inline ml-1 text-purple-400" />}
            </div>
            {i < seq.steps.length - 1 && <ArrowRight className="w-3 h-3 text-prospex-dim flex-shrink-0" />}
          </div>
        ))}
        {(!seq.steps || seq.steps.length === 0) && (
          <span className="text-[10px] text-prospex-dim font-mono">No steps defined</span>
        )}
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-4 gap-2">
        {[
          { label: 'Enrolled', value: seq.total_enrolled, icon: Users },
          { label: 'Sent', value: seq.total_sent, icon: Send },
          { label: 'Replied', value: seq.total_replied, icon: MessageCircle },
          { label: 'Booked', value: seq.total_booked, icon: CheckCircle },
        ].map(stat => (
          <div key={stat.label} className="text-center">
            <p className="text-sm font-mono font-bold text-prospex-text">{stat.value}</p>
            <p className="text-[9px] font-mono text-prospex-dim uppercase">{stat.label}</p>
          </div>
        ))}
      </div>

      {(seq.total_sent > 0) && (
        <div className="mt-2 pt-2 border-t border-prospex-border flex gap-4 text-[10px] font-mono text-prospex-muted">
          <span>Reply rate: <span className="text-prospex-accent">{seq.reply_rate || (seq.total_sent > 0 ? ((seq.total_replied / seq.total_sent) * 100).toFixed(1) : 0)}%</span></span>
          <span>Book rate: <span className="text-green-400">{seq.booking_rate || (seq.total_replied > 0 ? ((seq.total_booked / seq.total_replied) * 100).toFixed(1) : 0)}%</span></span>
        </div>
      )}
    </div>
  );
}

// ─── SEQUENCE BUILDER MODAL ──────────────────────────────────────
function SequenceBuilder({
  sequence,
  onSave,
  onClose,
}: {
  sequence: Sequence | null;
  onSave: (seq: Partial<Sequence>) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(sequence?.name || '');
  const [description, setDescription] = useState(sequence?.description || '');
  const [channel, setChannel] = useState(sequence?.channel || 'instagram');
  const [niche, setNiche] = useState(sequence?.niche || 'med spa');
  const [aiTone, setAiTone] = useState(sequence?.ai_tone || 'professional_friendly');
  const [aiContext, setAiContext] = useState(sequence?.ai_context || '');
  const [aiEnabled, setAiEnabled] = useState(sequence?.ai_personalization_enabled !== false);
  const [steps, setSteps] = useState<SequenceStep[]>(
    sequence?.steps || [
      { step_number: 1, delay_days: 0, message_template: '', condition: 'always', is_ai_personalized: true },
    ]
  );

  const addStep = () => {
    const lastDelay = steps[steps.length - 1]?.delay_days || 0;
    setSteps([...steps, {
      step_number: steps.length + 1,
      delay_days: lastDelay + 3,
      message_template: '',
      condition: 'if_no_reply',
      is_ai_personalized: true,
    }]);
  };

  const updateStep = (idx: number, updates: Partial<SequenceStep>) => {
    setSteps(steps.map((s, i) => i === idx ? { ...s, ...updates } : s));
  };

  const removeStep = (idx: number) => {
    setSteps(steps.filter((_, i) => i !== idx).map((s, i) => ({ ...s, step_number: i + 1 })));
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-prospex-card border border-prospex-border rounded-xl max-w-2xl w-full max-h-[85vh] overflow-y-auto p-5" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-prospex-text">{sequence ? 'Edit Sequence' : 'New Sequence'}</h2>
          <button onClick={onClose} className="text-prospex-dim hover:text-prospex-text text-lg">✕</button>
        </div>

        <div className="space-y-4">
          {/* Basic Info */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] text-prospex-dim font-mono uppercase mb-1 block">Sequence Name</label>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Med Spa IG Cold Outreach"
                className="w-full bg-prospex-bg border border-prospex-border rounded px-3 py-2 text-sm text-prospex-text" />
            </div>
            <div>
              <label className="text-[10px] text-prospex-dim font-mono uppercase mb-1 block">Niche</label>
              <input value={niche} onChange={e => setNiche(e.target.value)} placeholder="med spa"
                className="w-full bg-prospex-bg border border-prospex-border rounded px-3 py-2 text-sm text-prospex-text" />
            </div>
          </div>

          <div>
            <label className="text-[10px] text-prospex-dim font-mono uppercase mb-1 block">Description</label>
            <input value={description} onChange={e => setDescription(e.target.value)} placeholder="Brief description..."
              className="w-full bg-prospex-bg border border-prospex-border rounded px-3 py-2 text-sm text-prospex-text" />
          </div>

          {/* Channel Select */}
          <div>
            <label className="text-[10px] text-prospex-dim font-mono uppercase mb-1 block">Channel</label>
            <div className="flex gap-2">
              {CHANNELS.map(ch => (
                <button key={ch.id} onClick={() => setChannel(ch.id)}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-2 rounded text-xs font-mono border transition-colors',
                    channel === ch.id
                      ? 'bg-prospex-accent/15 text-prospex-accent border-prospex-accent/40'
                      : 'bg-prospex-bg text-prospex-dim border-prospex-border hover:border-prospex-accent/20'
                  )}>
                  <ch.icon className="w-3.5 h-3.5" /> {ch.label}
                </button>
              ))}
            </div>
          </div>

          {/* AI Settings */}
          <div className="p-3 bg-prospex-bg rounded border border-prospex-border">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-prospex-text font-semibold flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5 text-purple-400" /> AI Personalization
              </span>
              <button onClick={() => setAiEnabled(!aiEnabled)}
                className={cn('w-8 h-4 rounded-full transition-colors relative', aiEnabled ? 'bg-purple-500' : 'bg-prospex-border')}>
                <div className={cn('w-3 h-3 bg-white rounded-full absolute top-0.5 transition-all', aiEnabled ? 'left-4.5' : 'left-0.5')} />
              </button>
            </div>
            {aiEnabled && (
              <div className="space-y-2">
                <div>
                  <label className="text-[10px] text-prospex-dim font-mono mb-1 block">Tone</label>
                  <select value={aiTone} onChange={e => setAiTone(e.target.value)}
                    className="w-full bg-prospex-card border border-prospex-border rounded px-2 py-1.5 text-xs text-prospex-text">
                    {AI_TONES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] text-prospex-dim font-mono mb-1 block">Extra Context for AI</label>
                  <input value={aiContext} onChange={e => setAiContext(e.target.value)}
                    placeholder="e.g. focus on their ad weaknesses, mention free audit"
                    className="w-full bg-prospex-card border border-prospex-border rounded px-2 py-1.5 text-xs text-prospex-text" />
                </div>
              </div>
            )}
          </div>

          {/* Steps */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs text-prospex-text font-semibold">Sequence Steps</label>
              <button onClick={addStep} className="text-[10px] text-prospex-accent flex items-center gap-1 hover:underline">
                <Plus className="w-3 h-3" /> Add Step
              </button>
            </div>
            <div className="space-y-3">
              {steps.map((step, idx) => (
                <div key={idx} className="p-3 bg-prospex-bg rounded border border-prospex-border">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-mono text-prospex-accent font-bold">Step {step.step_number}</span>
                    <div className="flex items-center gap-2">
                      <select value={step.condition} onChange={e => updateStep(idx, { condition: e.target.value })}
                        className="bg-prospex-card border border-prospex-border rounded px-2 py-1 text-[10px] text-prospex-text">
                        <option value="always">Always send</option>
                        <option value="if_no_reply">If no reply</option>
                        <option value="if_opened">If opened</option>
                      </select>
                      {steps.length > 1 && (
                        <button onClick={() => removeStep(idx)} className="text-red-400 hover:text-red-300">
                          <XCircle className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mb-2">
                    <Clock className="w-3 h-3 text-prospex-dim" />
                    <span className="text-[10px] text-prospex-dim font-mono">Wait</span>
                    <input type="number" min={0} value={step.delay_days}
                      onChange={e => updateStep(idx, { delay_days: parseInt(e.target.value) || 0 })}
                      className="w-12 bg-prospex-card border border-prospex-border rounded px-2 py-1 text-xs text-prospex-text text-center" />
                    <span className="text-[10px] text-prospex-dim font-mono">days{idx === 0 ? ' (0 = send immediately)' : ''}</span>
                  </div>
                  <textarea
                    value={step.message_template}
                    onChange={e => updateStep(idx, { message_template: e.target.value })}
                    placeholder={idx === 0
                      ? 'First touch message template... Use {{business_name}}, {{weakness}}, etc.'
                      : 'Follow-up message... Reference the first message or add new value.'}
                    rows={3}
                    className="w-full bg-prospex-card border border-prospex-border rounded px-2 py-1.5 text-xs text-prospex-text resize-none"
                  />
                  <div className="flex items-center gap-2 mt-1">
                    <label className="flex items-center gap-1 text-[10px] text-prospex-dim cursor-pointer">
                      <input type="checkbox" checked={step.is_ai_personalized}
                        onChange={e => updateStep(idx, { is_ai_personalized: e.target.checked })}
                        className="accent-purple-500" />
                      <Sparkles className="w-2.5 h-2.5 text-purple-400" /> AI personalize per lead
                    </label>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Save */}
          <div className="flex justify-end gap-2 pt-2 border-t border-prospex-border">
            <button onClick={onClose} className="btn btn-sm text-xs text-prospex-dim border border-prospex-border px-4 py-2">Cancel</button>
            <button
              onClick={() => onSave({
                id: sequence?.id,
                name, description, channel, niche, steps,
                ai_tone: aiTone, ai_context: aiContext,
                ai_personalization_enabled: aiEnabled,
              })}
              disabled={!name}
              className="btn btn-sm text-xs bg-prospex-accent/15 text-prospex-accent border border-prospex-accent/30 px-4 py-2 disabled:opacity-50"
            >
              {sequence ? 'Update' : 'Create'} Sequence
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── MAIN PAGE ───────────────────────────────────────────────────
export default function SequencesPage() {
  const [sequences, setSequences] = useState<Sequence[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showBuilder, setShowBuilder] = useState(false);
  const [editingSequence, setEditingSequence] = useState<Sequence | null>(null);
  const [filterChannel, setFilterChannel] = useState<string>('all');

  const fetchSequences = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/sequences');
      const data = await res.json();
      setSequences(data.sequences || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchSequences(); }, []);

  const handleSave = async (seqData: Partial<Sequence>) => {
    try {
      if (seqData.id) {
        await fetch('/api/sequences', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(seqData),
        });
      } else {
        await fetch('/api/sequences', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'create', ...seqData }),
        });
      }
      setShowBuilder(false);
      setEditingSequence(null);
      fetchSequences();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleToggle = async (seq: Sequence) => {
    const newStatus = seq.status === 'active' ? 'paused' : 'active';
    await fetch('/api/sequences', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: seq.id, status: newStatus }),
    });
    fetchSequences();
  };

  const handleDelete = async (seq: Sequence) => {
    if (!confirm(`Delete "${seq.name}"? This cannot be undone.`)) return;
    await fetch(`/api/sequences?id=${seq.id}`, { method: 'DELETE' });
    fetchSequences();
  };

  const filtered = filterChannel === 'all' ? sequences : sequences.filter(s => s.channel === filterChannel);

  // Aggregate stats
  const totalEnrolled = sequences.reduce((s, seq) => s + (seq.total_enrolled || 0), 0);
  const totalSent = sequences.reduce((s, seq) => s + (seq.total_sent || 0), 0);
  const totalReplied = sequences.reduce((s, seq) => s + (seq.total_replied || 0), 0);
  const totalBooked = sequences.reduce((s, seq) => s + (seq.total_booked || 0), 0);

  return (
    <div className="min-h-screen bg-prospex-bg text-prospex-text p-4 sm:p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Zap className="w-6 h-6 text-prospex-accent" /> Outreach Sequences
          </h1>
          <p className="text-sm text-prospex-muted mt-1">Multi-channel outreach with AI personalization</p>
        </div>
        <button onClick={() => { setEditingSequence(null); setShowBuilder(true); }}
          className="btn bg-prospex-accent/15 hover:bg-prospex-accent/25 text-prospex-accent border border-prospex-accent/30 px-4 py-2 flex items-center gap-2 text-sm font-semibold">
          <Plus className="w-4 h-4" /> New Sequence
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        {[
          { label: 'Enrolled', value: totalEnrolled, icon: Users, color: 'text-blue-400' },
          { label: 'Sent', value: totalSent, icon: Send, color: 'text-purple-400' },
          { label: 'Replied', value: totalReplied, icon: MessageCircle, color: 'text-orange-400' },
          { label: 'Booked', value: totalBooked, icon: CheckCircle, color: 'text-green-400' },
        ].map(s => (
          <div key={s.label} className="card p-3 text-center">
            <s.icon className={cn('w-4 h-4 mx-auto mb-1', s.color)} />
            <p className="text-xl font-mono font-bold text-prospex-text">{s.value}</p>
            <p className="text-[9px] font-mono text-prospex-dim uppercase">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Filter */}
      <div className="flex items-center gap-2 mb-4">
        <span className="text-[10px] text-prospex-dim font-mono">Channel:</span>
        {[{ id: 'all', label: 'All' }, ...CHANNELS].map(ch => (
          <button key={ch.id} onClick={() => setFilterChannel(ch.id)}
            className={cn(
              'text-[10px] font-mono px-2.5 py-1 rounded border transition-colors',
              filterChannel === ch.id
                ? 'bg-prospex-accent/15 text-prospex-accent border-prospex-accent/30'
                : 'text-prospex-dim border-prospex-border hover:border-prospex-accent/20'
            )}>
            {ch.label}
          </button>
        ))}
        <span className="text-[10px] text-prospex-dim font-mono ml-auto">{filtered.length} sequences</span>
      </div>

      {/* Error */}
      {error && (
        <div className="card p-3 mb-4 border-red-500/30 bg-red-500/5">
          <p className="text-sm text-red-400 flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> {error}</p>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="card p-8 text-center">
          <Loader2 className="w-6 h-6 animate-spin mx-auto text-prospex-accent mb-2" />
          <p className="text-sm text-prospex-muted">Loading sequences...</p>
        </div>
      )}

      {/* Sequence Grid */}
      {!loading && filtered.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(seq => (
            <SequenceCard
              key={seq.id}
              seq={seq}
              onEdit={() => { setEditingSequence(seq); setShowBuilder(true); }}
              onToggle={() => handleToggle(seq)}
              onDelete={() => handleDelete(seq)}
            />
          ))}
        </div>
      )}

      {/* Empty State */}
      {!loading && filtered.length === 0 && (
        <div className="card p-12 text-center">
          <Zap className="w-12 h-12 text-prospex-accent/30 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-prospex-text mb-2">No Sequences Yet</h2>
          <p className="text-sm text-prospex-muted mb-4 max-w-md mx-auto">
            Create multi-step outreach sequences with AI-personalised messages across Instagram, WhatsApp, LinkedIn, and Email.
          </p>
          <button onClick={() => { setEditingSequence(null); setShowBuilder(true); }}
            className="btn bg-prospex-accent/15 text-prospex-accent border border-prospex-accent/30 px-4 py-2 text-sm">
            <Plus className="w-4 h-4 inline mr-1" /> Create First Sequence
          </button>
        </div>
      )}

      {/* Builder Modal */}
      {showBuilder && (
        <SequenceBuilder
          sequence={editingSequence}
          onSave={handleSave}
          onClose={() => { setShowBuilder(false); setEditingSequence(null); }}
        />
      )}
    </div>
  );
}
