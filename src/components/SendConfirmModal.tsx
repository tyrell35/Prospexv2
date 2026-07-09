'use client';

import { useEffect, useState } from 'react';
import { X, Check, XCircle, FileEdit, Ban, AlertCircle, Loader2, Plus, MessageCircle, Instagram, Phone, Flame, Snowflake } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { computeWarmupState } from '@/lib/ig-warmup';

// ─── Types ──────────────────────────────────────────────

type Outcome = 'sent' | 'draft' | 'blocked' | 'unsent';

interface IgAccount {
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

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onLogged?: (result: { outcome: Outcome; account: string | null }) => void;

  // What was sent — for the log entry
  lead: {
    id: string;
    business_name: string;
  } | null;
  channel: 'instagram' | 'whatsapp' | 'sms';
  stage?: string;
  messageSent?: string;
  templateName?: string;
}

const LAST_ACCOUNT_KEY = 'prospex_last_ig_account';
const LAST_WHATSAPP_KEY = 'prospex_last_whatsapp_number';

const channelMeta = {
  instagram: { label: 'Instagram DM', icon: Instagram, color: 'text-pink-400', bg: 'bg-pink-500/20 border-pink-500/40' },
  whatsapp:  { label: 'WhatsApp',      icon: MessageCircle, color: 'text-green-400', bg: 'bg-green-500/20 border-green-500/40' },
  sms:       { label: 'SMS',           icon: Phone, color: 'text-blue-400', bg: 'bg-blue-500/20 border-blue-500/40' },
};

const outcomeMeta: Record<Outcome, { label: string; help: string; icon: typeof Check; cls: string }> = {
  sent:    { label: 'Sent',    help: 'Message went through — log it and bump my account counter', icon: Check,     cls: 'bg-prospex-green/20 text-prospex-green border-prospex-green/40 hover:bg-prospex-green/30' },
  draft:   { label: 'Draft',   help: 'Left in drafts / will send later',                          icon: FileEdit,  cls: 'bg-amber-500/20 text-amber-400 border-amber-500/40 hover:bg-amber-500/30' },
  blocked: { label: 'Blocked', help: 'Account restricted / message rejected',                     icon: Ban,       cls: 'bg-prospex-red/20 text-prospex-red border-prospex-red/40 hover:bg-prospex-red/30' },
  unsent:  { label: 'Unsent',  help: 'Changed my mind / didn\'t actually send',                   icon: XCircle,   cls: 'bg-prospex-bg text-prospex-dim border-prospex-border hover:text-prospex-text' },
};

// ═══════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════

export default function SendConfirmModal({ isOpen, onClose, onLogged, lead, channel, stage = 'cold_open', messageSent, templateName }: Props) {
  const [outcome, setOutcome] = useState<Outcome>('sent');
  const [accounts, setAccounts] = useState<IgAccount[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<string>('');
  const [whatsappNumber, setWhatsappNumber] = useState<string>('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAddAccount, setShowAddAccount] = useState(false);
  const [newAccountUsername, setNewAccountUsername] = useState('');
  const [addingAccount, setAddingAccount] = useState(false);

  // Load IG accounts + last-used
  useEffect(() => {
    if (!isOpen) return;
    setOutcome('sent');
    setError(null);
    setNotes('');
    (async () => {
      if (channel === 'instagram') {
        const { data } = await supabase
          .from('ig_accounts')
          .select('id, username, display_name, status, daily_sent_today, daily_limit, daily_target, warmup_stage, warmup_started_at')
          .in('status', ['active', 'warming'])
          .order('username');
        setAccounts((data || []) as IgAccount[]);
        const last = typeof window !== 'undefined' ? localStorage.getItem(LAST_ACCOUNT_KEY) : null;
        if (last && (data || []).some(a => (a as IgAccount).username === last)) {
          setSelectedAccount(last);
        } else if ((data || []).length > 0) {
          setSelectedAccount((data![0] as IgAccount).username);
        }
      }
      if (channel === 'whatsapp') {
        const last = typeof window !== 'undefined' ? localStorage.getItem(LAST_WHATSAPP_KEY) : null;
        setWhatsappNumber(last || '');
      }
    })();
  }, [isOpen, channel]);

  const handleAddAccount = async () => {
    const username = newAccountUsername.trim().replace(/^@/, '');
    if (!username) return;
    setAddingAccount(true);
    setError(null);
    try {
      const res = await fetch('/api/dm-campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'manage_accounts', sub_action: 'add', username, daily_limit: 30, status: 'active' }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Failed to add account');
      // reload accounts
      const { data: fresh } = await supabase
        .from('ig_accounts')
        .select('id, username, display_name, status, daily_sent_today, daily_limit, daily_target, warmup_stage, warmup_started_at')
        .in('status', ['active', 'warming'])
        .order('username');
      setAccounts((fresh || []) as IgAccount[]);
      setSelectedAccount(username);
      setNewAccountUsername('');
      setShowAddAccount(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Add account failed');
    } finally { setAddingAccount(false); }
  };

  const handleSubmit = async () => {
    if (!lead) return;
    setSaving(true);
    setError(null);

    // Which "account" to log — depends on channel
    let sender: string | null = null;
    if (channel === 'instagram') {
      if (!selectedAccount) {
        setError('Pick an Instagram account (or add one).');
        setSaving(false);
        return;
      }
      // Warmup gate — only enforced when the user is logging a real send.
      // Drafts/blocked/unsent still log so the audit trail stays honest.
      if (outcome === 'sent') {
        const acc = accounts.find(a => a.username === selectedAccount);
        if (acc) {
          const w = computeWarmupState(acc);
          const used = acc.daily_sent_today || 0;
          if (w.stage === 'new') {
            setError(`@${selectedAccount} hasn't started warmup. Go to DM Campaigns → IG Accounts → click "Start" first.`);
            setSaving(false); return;
          }
          if (w.stage === 'paused') {
            setError(`@${selectedAccount} is paused. Resume it in DM Campaigns → IG Accounts before sending.`);
            setSaving(false); return;
          }
          if (used >= w.hard_limit) {
            setError(`@${selectedAccount} has hit its hard cap for today (${w.hard_limit}). Wait until the daily reset, or use a different account.`);
            setSaving(false); return;
          }
        }
      }
      sender = selectedAccount;
      if (typeof window !== 'undefined') localStorage.setItem(LAST_ACCOUNT_KEY, selectedAccount);
    } else if (channel === 'whatsapp') {
      sender = whatsappNumber.trim() || null;
      if (sender && typeof window !== 'undefined') localStorage.setItem(LAST_WHATSAPP_KEY, sender);
    }

    try {
      const res = await fetch('/api/outreach-tracker', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'log_outreach',
          lead_id: lead.id,
          channel,
          stage,
          message_sent: messageSent,
          sent_by: 'manual',
          sender_account: sender,
          outcome,
          confirmed: true,
          notes,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Log failed');
      onLogged?.({ outcome, account: sender });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Log failed');
    } finally { setSaving(false); }
  };

  if (!isOpen || !lead) return null;
  const cm = channelMeta[channel];
  const ChannelIcon = cm.icon;

  return (
    <div className="fixed inset-0 bg-black/70 z-[200] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-prospex-surface border border-prospex-border rounded-xl w-full max-w-lg mx-2 md:mx-auto" onClick={e => e.stopPropagation()}>
        <div className="p-4 border-b border-prospex-border flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <div className={cn('w-8 h-8 rounded-lg border flex items-center justify-center shrink-0', cm.bg)}>
              <ChannelIcon className={cn('w-4 h-4', cm.color)} />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-mono font-bold text-prospex-text">Log {cm.label}</h2>
              <p className="text-[10px] text-prospex-dim truncate">{lead.business_name} {templateName && <span>· template: <span className="text-prospex-muted">{templateName}</span></span>}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-prospex-dim hover:text-prospex-text" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Outcome buttons */}
          <div>
            <label className="text-[10px] font-mono text-prospex-dim uppercase block mb-2">Did the message send?</label>
            <div className="grid grid-cols-2 gap-2">
              {(['sent', 'draft', 'blocked', 'unsent'] as Outcome[]).map(o => {
                const om = outcomeMeta[o];
                const OIcon = om.icon;
                const active = outcome === o;
                return (
                  <button key={o} onClick={() => setOutcome(o)}
                    className={cn('p-2.5 rounded-lg border transition-colors text-left flex items-start gap-2',
                      active ? om.cls : 'bg-prospex-bg border-prospex-border text-prospex-muted hover:text-prospex-text')}>
                    <OIcon className="w-4 h-4 mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs font-mono font-semibold">{om.label}</p>
                      <p className="text-[9px] opacity-80 leading-tight">{om.help}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Instagram: account picker */}
          {channel === 'instagram' && (
            <div>
              <label className="text-[10px] font-mono text-prospex-dim uppercase block mb-1">Sent from account</label>
              {accounts.length === 0 && !showAddAccount ? (
                <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg space-y-2">
                  <p className="text-xs text-amber-400">No Instagram accounts registered yet.</p>
                  <button onClick={() => setShowAddAccount(true)} className="btn-primary text-xs">
                    <Plus className="w-3.5 h-3.5" /> Add my first account
                  </button>
                </div>
              ) : showAddAccount ? (
                <div className="flex items-center gap-2">
                  <input value={newAccountUsername} onChange={e => setNewAccountUsername(e.target.value)}
                    placeholder="@handle (no @)" className="input flex-1" autoFocus />
                  <button onClick={handleAddAccount} disabled={addingAccount || !newAccountUsername.trim()} className="btn-primary text-xs disabled:opacity-50">
                    {addingAccount ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  </button>
                  <button onClick={() => { setShowAddAccount(false); setNewAccountUsername(''); }} className="btn-ghost text-xs">Cancel</button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <select value={selectedAccount} onChange={e => setSelectedAccount(e.target.value)} className="input flex-1">
                    {accounts.map(a => {
                      const w = computeWarmupState(a);
                      const used = a.daily_sent_today || 0;
                      const remain = Math.max(0, w.effective_target - used);
                      const blocked = w.stage === 'new' || w.stage === 'paused' || used >= w.hard_limit;
                      const stageLabel = w.stage === 'new' ? '🆕 not started' : w.stage === 'paused' ? '⏸ paused' : w.stage === 'warming' ? `🔥 warming d${w.days_in_warmup}` : '🔥 warm';
                      return (
                        <option key={a.id} value={a.username} disabled={blocked && outcome === 'sent'}>
                          @{a.username} · {stageLabel} · {used}/{w.effective_target}{blocked ? ' (blocked)' : ` · ${remain} left`}
                        </option>
                      );
                    })}
                  </select>
                  <button onClick={() => setShowAddAccount(true)} className="btn-ghost text-xs" title="Add another account">
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
              {/* Live target-vs-actual bar + warmup status for selected account */}
              {selectedAccount && !showAddAccount && (() => {
                const a = accounts.find(x => x.username === selectedAccount);
                if (!a) return null;
                const w = computeWarmupState(a);
                const used = a.daily_sent_today || 0;
                const pct = w.effective_target > 0 ? Math.min(100, Math.round((used / w.effective_target) * 100)) : 0;
                const overTarget = used >= w.effective_target && w.stage !== 'new' && w.stage !== 'paused';
                const atHardCap = used >= w.hard_limit;
                const stageIcon = w.stage === 'new' || w.stage === 'paused' ? <Snowflake className="w-2.5 h-2.5" /> : <Flame className="w-2.5 h-2.5" />;
                const stageCls = w.stage === 'paused' ? 'text-prospex-red border-prospex-red/40'
                  : w.stage === 'new' ? 'text-prospex-dim border-prospex-border'
                  : w.stage === 'warming' ? 'text-amber-400 border-amber-500/40'
                  : 'text-prospex-green border-prospex-green/40';
                return (
                  <div className="mt-2 space-y-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={cn('inline-flex items-center gap-1 text-[9px] font-mono px-1.5 py-0.5 rounded border', stageCls)}>
                        {stageIcon} {w.stage}{w.stage === 'warming' ? ` · day ${w.days_in_warmup}` : ''}
                      </span>
                      <span className="text-[9px] text-prospex-dim">{w.procedure_step}</span>
                    </div>
                    <div className="w-full h-1 bg-prospex-bg rounded-full">
                      <div className={cn('h-1 rounded-full', atHardCap ? 'bg-prospex-red' : overTarget ? 'bg-amber-400' : pct >= 80 ? 'bg-prospex-cyan' : 'bg-prospex-cyan/60')} style={{ width: `${pct}%` }} />
                    </div>
                    <p className="text-[9px] text-prospex-dim">
                      {used}/{w.effective_target} target{overTarget && !atHardCap && ` · ⚠ over KPI · hard cap ${w.hard_limit}`}
                      {atHardCap && ` · 🛑 hard cap ${w.hard_limit} hit — do not send`}
                    </p>
                    {(w.stage === 'new' || w.stage === 'paused') && (
                      <div className="p-2 bg-prospex-red/10 border border-prospex-red/30 rounded text-[10px] text-prospex-red flex items-start gap-1.5">
                        <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" />
                        {w.stage === 'new' ? 'Warmup not started for this account. Open DM Campaigns → IG Accounts → Start warmup first.' : 'Account is paused. Resume from DM Campaigns → IG Accounts before sending.'}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          )}

          {/* WhatsApp: sender number (optional, remembered) */}
          {channel === 'whatsapp' && (
            <div>
              <label className="text-[10px] font-mono text-prospex-dim uppercase block mb-1">Sent from (my phone / WhatsApp Business #)</label>
              <input value={whatsappNumber} onChange={e => setWhatsappNumber(e.target.value)}
                placeholder="+44 7... (optional — remembered for next time)" className="input w-full" />
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="text-[10px] font-mono text-prospex-dim uppercase block mb-1">Notes (optional)</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
              placeholder="Anything worth remembering about this send"
              className="w-full bg-prospex-bg border border-prospex-border rounded-lg p-2 text-xs text-prospex-text resize-none focus:border-prospex-cyan/50 focus:outline-none" />
          </div>

          {error && (
            <div className="p-2.5 bg-prospex-red/10 border border-prospex-red/30 rounded-lg flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-prospex-red shrink-0 mt-0.5" />
              <p className="text-xs text-prospex-red">{error}</p>
            </div>
          )}
        </div>

        <div className="p-4 border-t border-prospex-border flex items-center justify-end gap-2">
          <button onClick={onClose} className="btn-ghost text-xs">Skip / don&apos;t log</button>
          <button onClick={handleSubmit} disabled={saving} className={cn('btn text-xs border disabled:opacity-50', outcomeMeta[outcome].cls)}>
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Log as {outcomeMeta[outcome].label.toLowerCase()}
          </button>
        </div>
      </div>
    </div>
  );
}
