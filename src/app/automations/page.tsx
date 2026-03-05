'use client';

import { useState, useEffect } from 'react';
import {
  Zap, Plus, Trash2, Edit3, Play, Pause, ArrowRight,
  Loader2, AlertTriangle, CheckCircle, Clock, Target,
  MessageCircle, Calendar, Users, Bell, Send, Tag,
  Bot, GitBranch, Settings, Activity,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface AutomationRule {
  id: string;
  name: string;
  description: string;
  is_active: boolean;
  priority: number;
  trigger_type: string;
  trigger_conditions: Record<string, any>;
  action_type: string;
  action_config: Record<string, any>;
  times_fired: number;
  last_fired_at: string | null;
  execution_log: any[];
  created_at: string;
}

const TRIGGERS: Record<string, { label: string; icon: typeof Zap; color: string; fields: { key: string; label: string; type: string; options?: string[] }[] }> = {
  reply_received: { label: 'Reply Received', icon: MessageCircle, color: 'text-blue-400', fields: [
    { key: 'channel', label: 'Channel', type: 'select', options: ['any', 'email', 'instagram', 'whatsapp', 'linkedin'] },
  ]},
  intent_detected: { label: 'Intent Detected', icon: Target, color: 'text-green-400', fields: [
    { key: 'intent', label: 'Intent', type: 'select', options: ['positive_interest', 'pricing_inquiry', 'objection', 'not_interested', 'booking_ready', 'question'] },
    { key: 'channel', label: 'Channel', type: 'select', options: ['any', 'email', 'instagram', 'whatsapp', 'linkedin'] },
  ]},
  no_reply_timeout: { label: 'No Reply Timeout', icon: Clock, color: 'text-yellow-400', fields: [
    { key: 'timeout_days', label: 'Days without reply', type: 'number' },
  ]},
  lead_score_changed: { label: 'Lead Score Changed', icon: Activity, color: 'text-orange-400', fields: [
    { key: 'min_score', label: 'Min score threshold', type: 'number' },
  ]},
  booking_confirmed: { label: 'Booking Confirmed', icon: Calendar, color: 'text-emerald-400', fields: [] },
  pipeline_stage_changed: { label: 'Pipeline Stage Changed', icon: GitBranch, color: 'text-purple-400', fields: [
    { key: 'pipeline_stage', label: 'Stage', type: 'select', options: ['lead', 'contacted', 'pitched', 'booked', 'closed_won', 'closed_lost'] },
  ]},
  manual: { label: 'Manual Trigger', icon: Play, color: 'text-gray-400', fields: [] },
};

const ACTIONS: Record<string, { label: string; icon: typeof Zap; color: string; fields: { key: string; label: string; type: string; options?: string[] }[] }> = {
  activate_ai_qualifier: { label: 'Activate AI Qualifier', icon: Bot, color: 'text-purple-400', fields: [
    { key: 'qualifier_type', label: 'Qualifier type', type: 'select', options: ['standard', 'aggressive', 'nurture'] },
  ]},
  move_pipeline: { label: 'Move Pipeline Stage', icon: GitBranch, color: 'text-blue-400', fields: [
    { key: 'pipeline_stage', label: 'Move to stage', type: 'select', options: ['lead', 'contacted', 'pitched', 'booked', 'closed_won', 'closed_lost'] },
  ]},
  update_lead_status: { label: 'Update Lead Priority', icon: Target, color: 'text-orange-400', fields: [
    { key: 'lead_priority', label: 'Set priority', type: 'select', options: ['hot', 'warm', 'cold'] },
  ]},
  push_to_ghl: { label: 'Push to GHL', icon: Send, color: 'text-green-400', fields: [
    { key: 'ghl_tags', label: 'Tags (comma-separated)', type: 'text' },
  ]},
  send_slack_alert: { label: 'Send Slack Alert', icon: Bell, color: 'text-yellow-400', fields: [
    { key: 'slack_webhook', label: 'Slack Webhook URL', type: 'text' },
  ]},
  pause_sequence: { label: 'Pause Sequence', icon: Pause, color: 'text-red-400', fields: [] },
  enroll_in_sequence: { label: 'Enroll in Sequence', icon: Users, color: 'text-cyan-400', fields: [
    { key: 'sequence_id', label: 'Sequence ID', type: 'text' },
  ]},
  tag_lead: { label: 'Tag Lead', icon: Tag, color: 'text-pink-400', fields: [
    { key: 'tags', label: 'Tags (comma-separated)', type: 'text' },
  ]},
};

// ─── RULE CARD ───────────────────────────────────────────────────
function RuleCard({
  rule,
  onEdit,
  onToggle,
  onDelete,
}: {
  rule: AutomationRule;
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const trigger = TRIGGERS[rule.trigger_type] || { label: rule.trigger_type, icon: Zap, color: 'text-gray-400' };
  const action = ACTIONS[rule.action_type] || { label: rule.action_type, icon: Zap, color: 'text-gray-400' };
  const TriggerIcon = trigger.icon;
  const ActionIcon = action.icon;

  return (
    <div className={cn('card p-4 transition-colors', rule.is_active ? 'hover:border-prospex-accent/20' : 'opacity-60')}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-prospex-text text-sm">{rule.name}</h3>
            <span className={cn('text-[9px] font-mono px-1.5 py-0.5 rounded-full border',
              rule.is_active ? 'bg-green-500/15 text-green-400 border-green-500/30' : 'bg-gray-500/15 text-gray-400 border-gray-500/30')}>
              {rule.is_active ? 'Active' : 'Inactive'}
            </span>
          </div>
          {rule.description && <p className="text-[10px] text-prospex-dim mt-0.5">{rule.description}</p>}
        </div>
        <div className="flex items-center gap-1">
          <button onClick={onToggle} className="p-1 rounded hover:bg-prospex-bg text-prospex-dim">
            {rule.is_active ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
          </button>
          <button onClick={onEdit} className="p-1 rounded hover:bg-prospex-bg text-prospex-dim">
            <Edit3 className="w-3.5 h-3.5" />
          </button>
          <button onClick={onDelete} className="p-1 rounded hover:bg-prospex-bg text-prospex-dim hover:text-red-400">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Trigger → Action visual */}
      <div className="flex items-center gap-2 mb-3 p-2 bg-prospex-bg rounded border border-prospex-border">
        <div className="flex items-center gap-1.5">
          <TriggerIcon className={cn('w-4 h-4', trigger.color)} />
          <span className="text-xs font-mono text-prospex-text">{trigger.label}</span>
        </div>
        {Object.entries(rule.trigger_conditions).filter(([_, v]) => v && v !== 'any').map(([k, v]) => (
          <span key={k} className="text-[9px] bg-prospex-card px-1.5 py-0.5 rounded border border-prospex-border text-prospex-muted font-mono">
            {k}: {String(v)}
          </span>
        ))}
        <ArrowRight className="w-4 h-4 text-prospex-accent mx-1" />
        <div className="flex items-center gap-1.5">
          <ActionIcon className={cn('w-4 h-4', action.color)} />
          <span className="text-xs font-mono text-prospex-text">{action.label}</span>
        </div>
      </div>

      {/* Stats */}
      <div className="flex items-center gap-4 text-[10px] font-mono text-prospex-dim">
        <span>Fired {rule.times_fired}x</span>
        {rule.last_fired_at && <span>Last: {new Date(rule.last_fired_at).toLocaleDateString()}</span>}
        <span>Priority: {rule.priority}</span>
      </div>
    </div>
  );
}

// ─── RULE BUILDER MODAL ──────────────────────────────────────────
function RuleBuilder({
  rule,
  onSave,
  onClose,
}: {
  rule: AutomationRule | null;
  onSave: (data: any) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(rule?.name || '');
  const [description, setDescription] = useState(rule?.description || '');
  const [triggerType, setTriggerType] = useState(rule?.trigger_type || 'reply_received');
  const [triggerConditions, setTriggerConditions] = useState<Record<string, any>>(rule?.trigger_conditions || {});
  const [actionType, setActionType] = useState(rule?.action_type || 'move_pipeline');
  const [actionConfig, setActionConfig] = useState<Record<string, any>>(rule?.action_config || {});
  const [priority, setPriority] = useState(rule?.priority || 50);

  const triggerDef = TRIGGERS[triggerType];
  const actionDef = ACTIONS[actionType];

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-prospex-card border border-prospex-border rounded-xl max-w-lg w-full max-h-[85vh] overflow-y-auto p-5" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-prospex-text">{rule ? 'Edit Rule' : 'New Automation Rule'}</h2>
          <button onClick={onClose} className="text-prospex-dim hover:text-prospex-text text-lg">✕</button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-[10px] text-prospex-dim font-mono uppercase mb-1 block">Rule Name</label>
            <input value={name} onChange={e => setName(e.target.value)}
              placeholder='e.g. "Hot lead → AI Qualifier"'
              className="w-full bg-prospex-bg border border-prospex-border rounded px-3 py-2 text-sm text-prospex-text" />
          </div>

          <div>
            <label className="text-[10px] text-prospex-dim font-mono uppercase mb-1 block">Description</label>
            <input value={description} onChange={e => setDescription(e.target.value)}
              placeholder="What does this rule do?"
              className="w-full bg-prospex-bg border border-prospex-border rounded px-3 py-2 text-sm text-prospex-text" />
          </div>

          {/* Trigger */}
          <div className="p-3 bg-prospex-bg rounded border border-prospex-border">
            <label className="text-xs text-prospex-text font-semibold mb-2 block flex items-center gap-1">
              <Zap className="w-3.5 h-3.5 text-yellow-400" /> When this happens...
            </label>
            <select value={triggerType} onChange={e => { setTriggerType(e.target.value); setTriggerConditions({}); }}
              className="w-full bg-prospex-card border border-prospex-border rounded px-2 py-1.5 text-xs text-prospex-text mb-2">
              {Object.entries(TRIGGERS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            {triggerDef?.fields.map(field => (
              <div key={field.key} className="mt-2">
                <label className="text-[10px] text-prospex-dim font-mono mb-1 block">{field.label}</label>
                {field.type === 'select' ? (
                  <select value={triggerConditions[field.key] || ''} onChange={e => setTriggerConditions({ ...triggerConditions, [field.key]: e.target.value })}
                    className="w-full bg-prospex-card border border-prospex-border rounded px-2 py-1 text-xs text-prospex-text">
                    <option value="">Any</option>
                    {field.options?.map(o => <option key={o} value={o}>{o.replace(/_/g, ' ')}</option>)}
                  </select>
                ) : (
                  <input type={field.type} value={triggerConditions[field.key] || ''}
                    onChange={e => setTriggerConditions({ ...triggerConditions, [field.key]: field.type === 'number' ? parseInt(e.target.value) : e.target.value })}
                    className="w-full bg-prospex-card border border-prospex-border rounded px-2 py-1 text-xs text-prospex-text" />
                )}
              </div>
            ))}
          </div>

          {/* Arrow */}
          <div className="flex justify-center">
            <ArrowRight className="w-5 h-5 text-prospex-accent rotate-90" />
          </div>

          {/* Action */}
          <div className="p-3 bg-prospex-bg rounded border border-prospex-border">
            <label className="text-xs text-prospex-text font-semibold mb-2 block flex items-center gap-1">
              <Play className="w-3.5 h-3.5 text-green-400" /> Do this...
            </label>
            <select value={actionType} onChange={e => { setActionType(e.target.value); setActionConfig({}); }}
              className="w-full bg-prospex-card border border-prospex-border rounded px-2 py-1.5 text-xs text-prospex-text mb-2">
              {Object.entries(ACTIONS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            {actionDef?.fields.map(field => (
              <div key={field.key} className="mt-2">
                <label className="text-[10px] text-prospex-dim font-mono mb-1 block">{field.label}</label>
                {field.type === 'select' ? (
                  <select value={actionConfig[field.key] || ''} onChange={e => setActionConfig({ ...actionConfig, [field.key]: e.target.value })}
                    className="w-full bg-prospex-card border border-prospex-border rounded px-2 py-1 text-xs text-prospex-text">
                    {field.options?.map(o => <option key={o} value={o}>{o.replace(/_/g, ' ')}</option>)}
                  </select>
                ) : (
                  <input value={actionConfig[field.key] || ''}
                    onChange={e => setActionConfig({ ...actionConfig, [field.key]: e.target.value })}
                    placeholder={field.label}
                    className="w-full bg-prospex-card border border-prospex-border rounded px-2 py-1 text-xs text-prospex-text" />
                )}
              </div>
            ))}
          </div>

          {/* Priority */}
          <div className="flex items-center gap-3">
            <label className="text-[10px] text-prospex-dim font-mono">Priority:</label>
            <input type="range" min={0} max={100} value={priority}
              onChange={e => setPriority(parseInt(e.target.value))}
              className="flex-1 accent-prospex-accent" />
            <span className="text-xs font-mono text-prospex-text w-8 text-right">{priority}</span>
          </div>

          {/* Save */}
          <div className="flex justify-end gap-2 pt-2 border-t border-prospex-border">
            <button onClick={onClose} className="btn btn-sm text-xs text-prospex-dim border border-prospex-border px-4 py-2">Cancel</button>
            <button disabled={!name} onClick={() => onSave({
              id: rule?.id, name, description, trigger_type: triggerType,
              trigger_conditions: triggerConditions, action_type: actionType,
              action_config: actionConfig, priority,
            })}
              className="btn btn-sm text-xs bg-prospex-accent/15 text-prospex-accent border border-prospex-accent/30 px-4 py-2 disabled:opacity-50">
              {rule ? 'Update' : 'Create'} Rule
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── MAIN PAGE ───────────────────────────────────────────────────
export default function AutomationsPage() {
  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [showBuilder, setShowBuilder] = useState(false);
  const [editingRule, setEditingRule] = useState<AutomationRule | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchRules = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/automations');
      const data = await res.json();
      setRules(data.rules || []);
    } catch (err: any) {
      setError(err.message);
    }
    setLoading(false);
  };

  useEffect(() => { fetchRules(); }, []);

  const handleSave = async (data: any) => {
    try {
      if (data.id) {
        await fetch('/api/automations', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });
      } else {
        await fetch('/api/automations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });
      }
      setShowBuilder(false);
      setEditingRule(null);
      fetchRules();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleToggle = async (rule: AutomationRule) => {
    await fetch('/api/automations', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: rule.id, is_active: !rule.is_active }),
    });
    fetchRules();
  };

  const handleDelete = async (rule: AutomationRule) => {
    if (!confirm(`Delete "${rule.name}"?`)) return;
    await fetch(`/api/automations?id=${rule.id}`, { method: 'DELETE' });
    fetchRules();
  };

  const activeRules = rules.filter(r => r.is_active);
  const totalFired = rules.reduce((s, r) => s + (r.times_fired || 0), 0);

  return (
    <div className="min-h-screen bg-prospex-bg text-prospex-text p-4 sm:p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Settings className="w-6 h-6 text-prospex-accent" /> Automation Rules
          </h1>
          <p className="text-sm text-prospex-muted mt-1">When [trigger] happens → Do [action] automatically</p>
        </div>
        <button onClick={() => { setEditingRule(null); setShowBuilder(true); }}
          className="btn bg-prospex-accent/15 hover:bg-prospex-accent/25 text-prospex-accent border border-prospex-accent/30 px-4 py-2 flex items-center gap-2 text-sm font-semibold">
          <Plus className="w-4 h-4" /> New Rule
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="card p-3 text-center">
          <p className="text-xl font-mono font-bold text-prospex-text">{rules.length}</p>
          <p className="text-[9px] font-mono text-prospex-dim uppercase">Total Rules</p>
        </div>
        <div className="card p-3 text-center">
          <p className="text-xl font-mono font-bold text-green-400">{activeRules.length}</p>
          <p className="text-[9px] font-mono text-prospex-dim uppercase">Active</p>
        </div>
        <div className="card p-3 text-center">
          <p className="text-xl font-mono font-bold text-prospex-text">{totalFired}</p>
          <p className="text-[9px] font-mono text-prospex-dim uppercase">Times Fired</p>
        </div>
      </div>

      {error && (
        <div className="card p-3 mb-4 border-red-500/30 bg-red-500/5">
          <p className="text-sm text-red-400 flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> {error}</p>
        </div>
      )}

      {loading ? (
        <div className="card p-8 text-center">
          <Loader2 className="w-6 h-6 animate-spin mx-auto text-prospex-accent mb-2" />
        </div>
      ) : rules.length > 0 ? (
        <div className="space-y-3">
          {rules.map(rule => (
            <RuleCard key={rule.id} rule={rule}
              onEdit={() => { setEditingRule(rule); setShowBuilder(true); }}
              onToggle={() => handleToggle(rule)}
              onDelete={() => handleDelete(rule)}
            />
          ))}
        </div>
      ) : (
        <div className="card p-12 text-center">
          <Settings className="w-12 h-12 text-prospex-accent/30 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-prospex-text mb-2">No Automation Rules Yet</h2>
          <p className="text-sm text-prospex-muted mb-4 max-w-md mx-auto">
            Create rules like: "When reply intent = positive interest AND lead score &gt; 70 → Activate AI qualifier"
          </p>
          <button onClick={() => { setEditingRule(null); setShowBuilder(true); }}
            className="btn bg-prospex-accent/15 text-prospex-accent border border-prospex-accent/30 px-4 py-2 text-sm">
            <Plus className="w-4 h-4 inline mr-1" /> Create First Rule
          </button>
        </div>
      )}

      {showBuilder && (
        <RuleBuilder
          rule={editingRule}
          onSave={handleSave}
          onClose={() => { setShowBuilder(false); setEditingRule(null); }}
        />
      )}
    </div>
  );
}
