'use client';

import { useState, useEffect } from 'react';
import {
  Bot, Save, Loader2, Plus, Trash2, MessageCircle, Target, Calendar,
  Shield, Zap, Volume2, BookOpen, CheckCircle, AlertTriangle, Settings,
  Copy, Eye, ChevronDown, ChevronUp,
} from 'lucide-react';

interface AgentConfig {
  agent_name: string;
  agent_role: string;
  company_name: string;
  company_description: string;
  services: Array<{ name: string; price: string; description: string }>;
  main_offer: string;
  qualifying_questions: Array<{ question: string; required: boolean }>;
  min_qualifying_score: number;
  booking_link: string;
  booking_type: string;
  tone: string;
  response_style: string;
  common_objections: Array<{ objection: string; response: string }>;
  max_messages_per_conversation: number;
  auto_reply_enabled: boolean;
  send_window_start: number;
  send_window_end: number;
  send_timezone: string;
  instagram_access_token: string;
  instagram_page_id: string;
  webhook_verify_token: string;
}

const DEFAULT_CONFIG: AgentConfig = {
  agent_name: 'Sarah',
  agent_role: 'Client Success Manager',
  company_name: '',
  company_description: 'We help aesthetic clinics and med spas get more clients through targeted digital advertising.',
  services: [
    { name: 'Facebook & Instagram Ads Management', price: '£997/mo', description: 'Full ad campaign management with creative, targeting, and optimization' },
    { name: 'Google Ads Management', price: '£797/mo', description: 'Google Search and Display campaigns for local lead generation' },
  ],
  main_offer: 'Free 30-minute strategy session',
  qualifying_questions: [
    { question: 'What treatments or services do you offer?', required: true },
    { question: 'What is your approximate monthly marketing budget?', required: true },
    { question: 'Are you currently running any paid ads?', required: true },
    { question: 'What is your biggest challenge in getting new clients?', required: false },
    { question: 'When are you looking to get started?', required: false },
  ],
  min_qualifying_score: 3,
  booking_link: '',
  booking_type: 'calendly',
  tone: 'professional_friendly',
  response_style: 'concise',
  common_objections: [
    { objection: 'Too expensive / budget concerns', response: 'Reframe as ROI — share case study results showing 3-5x return within 60 days' },
    { objection: 'Already have an agency', response: 'Ask about current results, offer a free audit as a second opinion' },
    { objection: 'Need to think about it', response: 'Validate their decision, offer to send a case study, set a follow-up time' },
    { objection: 'How did you find me?', response: 'Be honest — researching [niche] businesses in your area as part of our growth team outreach' },
  ],
  max_messages_per_conversation: 20,
  auto_reply_enabled: true,
  send_window_start: 8,
  send_window_end: 21,
  send_timezone: 'Europe/London',
  instagram_access_token: '',
  instagram_page_id: '',
  webhook_verify_token: '',
};

export default function AIAgentConfigPage() {
  const [config, setConfig] = useState<AgentConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testMode, setTestMode] = useState(false);
  const [testMessage, setTestMessage] = useState('');
  const [testReply, setTestReply] = useState('');
  const [testLoading, setTestLoading] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['identity', 'qualifying', 'booking']));

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      const res = await fetch('/api/ai-conversation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'get_config' }),
      });
      const data = await res.json();
      if (data.config) {
        setConfig({ ...DEFAULT_CONFIG, ...data.config });
      }
    } catch {
      // Use defaults
    } finally {
      setLoading(false);
    }
  };

  const saveConfig = async () => {
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const res = await fetch('/api/ai-conversation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save_config', config }),
      });
      if (!res.ok) throw new Error('Failed to save');
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const testConversation = async () => {
    if (!testMessage.trim()) return;
    setTestLoading(true);
    setTestReply('');
    try {
      const res = await fetch('/api/ai-conversation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'process_message',
          channel: 'webchat',
          channel_user_id: 'test_user',
          message_text: testMessage,
          lead_name: 'Test User',
          lead_business: 'Test Beauty Clinic',
        }),
      });
      const data = await res.json();
      setTestReply(data.reply || 'No reply generated');
    } catch (err: unknown) {
      setTestReply('Error: ' + (err instanceof Error ? err.message : 'Failed'));
    } finally {
      setTestLoading(false);
    }
  };

  const toggleSection = (section: string) => {
    const next = new Set(expandedSections);
    if (next.has(section)) next.delete(section);
    else next.add(section);
    setExpandedSections(next);
  };

  const updateField = (field: keyof AgentConfig, value: unknown) => {
    setConfig(prev => ({ ...prev, [field]: value }));
  };

  const addService = () => {
    updateField('services', [...config.services, { name: '', price: '', description: '' }]);
  };

  const removeService = (i: number) => {
    updateField('services', config.services.filter((_, idx) => idx !== i));
  };

  const updateService = (i: number, field: string, value: string) => {
    const updated = [...config.services];
    (updated[i] as Record<string, string>)[field] = value;
    updateField('services', updated);
  };

  const addQuestion = () => {
    updateField('qualifying_questions', [...config.qualifying_questions, { question: '', required: false }]);
  };

  const removeQuestion = (i: number) => {
    updateField('qualifying_questions', config.qualifying_questions.filter((_, idx) => idx !== i));
  };

  const addObjection = () => {
    updateField('common_objections', [...config.common_objections, { objection: '', response: '' }]);
  };

  const removeObjection = (i: number) => {
    updateField('common_objections', config.common_objections.filter((_, idx) => idx !== i));
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto p-6 flex items-center justify-center min-h-[50vh]">
        <Loader2 className="w-8 h-8 animate-spin text-prospex-cyan" />
      </div>
    );
  }

  const Section = ({ id, icon: Icon, title, children }: { id: string; icon: typeof Bot; title: string; children: React.ReactNode }) => (
    <div className="card">
      <button onClick={() => toggleSection(id)} className="w-full p-5 flex items-center justify-between text-left">
        <div className="flex items-center gap-3">
          <Icon className="w-5 h-5 text-prospex-cyan" />
          <h2 className="text-base font-mono font-semibold text-prospex-text">{title}</h2>
        </div>
        {expandedSections.has(id) ? <ChevronUp className="w-4 h-4 text-prospex-dim" /> : <ChevronDown className="w-4 h-4 text-prospex-dim" />}
      </button>
      {expandedSections.has(id) && <div className="px-5 pb-5 space-y-4 border-t border-prospex-border/20 pt-4">{children}</div>}
    </div>
  );

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-mono font-bold text-prospex-text flex items-center gap-3">
            <Bot className="w-7 h-7 text-prospex-cyan" />
            AI Agent Configuration
          </h1>
          <p className="text-sm text-prospex-dim mt-1">Configure your AI sales agent that qualifies leads and books appointments</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setTestMode(!testMode)} className="btn-ghost text-xs">
            <MessageCircle className="w-3 h-3" /> {testMode ? 'Hide Test' : 'Test Agent'}
          </button>
          <button onClick={saveConfig} disabled={saving} className="btn-primary text-sm px-4 py-2">
            {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</>
              : saved ? <><CheckCircle className="w-4 h-4" /> Saved!</>
              : <><Save className="w-4 h-4" /> Save Config</>}
          </button>
        </div>
      </div>

      {error && <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-400">{error}</div>}

      {/* Test Panel */}
      {testMode && (
        <div className="card p-5 border-prospex-cyan/30">
          <h3 className="text-sm font-mono font-semibold text-prospex-cyan mb-3 flex items-center gap-2">
            <Zap className="w-4 h-4" /> Test Your AI Agent
          </h3>
          <p className="text-xs text-prospex-dim mb-3">Send a test message to see how your agent responds</p>
          <div className="flex gap-2">
            <input
              value={testMessage}
              onChange={e => setTestMessage(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && testConversation()}
              placeholder="e.g. Hi! Yes I'd love to hear more about your services..."
              className="input flex-1"
            />
            <button onClick={testConversation} disabled={testLoading} className="btn-primary text-xs px-4">
              {testLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Send'}
            </button>
          </div>
          {testReply && (
            <div className="mt-3 p-3 bg-prospex-cyan/5 border border-prospex-cyan/20 rounded-lg">
              <p className="text-xs text-prospex-dim mb-1 font-mono">{config.agent_name} replies:</p>
              <p className="text-sm text-prospex-text">{testReply}</p>
            </div>
          )}
        </div>
      )}

      {/* Identity */}
      <Section id="identity" icon={Bot} title="Agent Identity">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-mono text-prospex-dim uppercase block mb-1">Agent Name</label>
            <input value={config.agent_name} onChange={e => updateField('agent_name', e.target.value)} placeholder="Sarah" className="input w-full" />
          </div>
          <div>
            <label className="text-xs font-mono text-prospex-dim uppercase block mb-1">Role/Title</label>
            <input value={config.agent_role} onChange={e => updateField('agent_role', e.target.value)} placeholder="Client Success Manager" className="input w-full" />
          </div>
          <div>
            <label className="text-xs font-mono text-prospex-dim uppercase block mb-1">Company Name</label>
            <input value={config.company_name} onChange={e => updateField('company_name', e.target.value)} placeholder="Your Agency Name" className="input w-full" />
          </div>
          <div>
            <label className="text-xs font-mono text-prospex-dim uppercase block mb-1">Tone</label>
            <select value={config.tone} onChange={e => updateField('tone', e.target.value)} className="input w-full">
              <option value="professional_friendly">Professional & Friendly</option>
              <option value="casual">Casual & Relaxed</option>
              <option value="formal">Formal & Polished</option>
              <option value="enthusiastic">Enthusiastic & Energetic</option>
              <option value="consultative">Consultative & Strategic</option>
            </select>
          </div>
        </div>
        <div>
          <label className="text-xs font-mono text-prospex-dim uppercase block mb-1">Company Description</label>
          <textarea value={config.company_description} onChange={e => updateField('company_description', e.target.value)}
            rows={2} placeholder="We help aesthetic clinics get more clients through targeted digital advertising..."
            className="input w-full resize-none" />
        </div>
        <div>
          <label className="text-xs font-mono text-prospex-dim uppercase block mb-1">Main Offer</label>
          <input value={config.main_offer} onChange={e => updateField('main_offer', e.target.value)}
            placeholder="Free 30-minute strategy session" className="input w-full" />
        </div>
      </Section>

      {/* Services */}
      <Section id="services" icon={BookOpen} title={`Services (${config.services.length})`}>
        <div className="space-y-3">
          {config.services.map((service, i) => (
            <div key={i} className="grid grid-cols-1 md:grid-cols-12 gap-2 items-start">
              <input value={service.name} onChange={e => updateService(i, 'name', e.target.value)}
                placeholder="Service name" className="input md:col-span-5 text-sm" />
              <input value={service.price} onChange={e => updateService(i, 'price', e.target.value)}
                placeholder="£997/mo" className="input md:col-span-2 text-sm" />
              <input value={service.description} onChange={e => updateService(i, 'description', e.target.value)}
                placeholder="Brief description" className="input md:col-span-4 text-sm" />
              <button onClick={() => removeService(i)} className="p-2 text-red-400 hover:text-red-300 justify-self-end md:justify-self-auto md:col-span-1">
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
          <button onClick={addService} className="btn-ghost text-xs"><Plus className="w-3 h-3" /> Add Service</button>
        </div>
      </Section>

      {/* Qualifying Questions */}
      <Section id="qualifying" icon={Target} title={`Qualifying Questions (${config.qualifying_questions.length})`}>
        <p className="text-xs text-prospex-dim">The AI will naturally weave these into conversation, asking one at a time.</p>
        <div className="space-y-2">
          {config.qualifying_questions.map((q, i) => (
            <div key={i} className="flex items-center gap-2">
              <input value={q.question} onChange={e => {
                const updated = [...config.qualifying_questions];
                updated[i] = { ...updated[i], question: e.target.value };
                updateField('qualifying_questions', updated);
              }} placeholder="Qualifying question..." className="input flex-1 text-sm" />
              <label className="flex items-center gap-1 text-xs text-prospex-dim shrink-0">
                <input type="checkbox" checked={q.required} onChange={e => {
                  const updated = [...config.qualifying_questions];
                  updated[i] = { ...updated[i], required: e.target.checked };
                  updateField('qualifying_questions', updated);
                }} className="rounded" />
                Required
              </label>
              <button onClick={() => removeQuestion(i)} className="p-1 text-red-400 hover:text-red-300">
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
          <button onClick={addQuestion} className="btn-ghost text-xs"><Plus className="w-3 h-3" /> Add Question</button>
        </div>
        <div>
          <label className="text-xs font-mono text-prospex-dim uppercase block mb-1">
            Min Answers Before Booking (currently {config.min_qualifying_score})
          </label>
          <input type="range" min={1} max={config.qualifying_questions.length || 5}
            value={config.min_qualifying_score}
            onChange={e => updateField('min_qualifying_score', parseInt(e.target.value))}
            className="w-full" />
        </div>
      </Section>

      {/* Booking */}
      <Section id="booking" icon={Calendar} title="Booking Settings">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-mono text-prospex-dim uppercase block mb-1">Booking Link</label>
            <input value={config.booking_link} onChange={e => updateField('booking_link', e.target.value)}
              placeholder="https://calendly.com/yourname/strategy-call" className="input w-full" />
          </div>
          <div>
            <label className="text-xs font-mono text-prospex-dim uppercase block mb-1">Booking Platform</label>
            <select value={config.booking_type} onChange={e => updateField('booking_type', e.target.value)} className="input w-full">
              <option value="calendly">Calendly</option>
              <option value="cal_com">Cal.com</option>
              <option value="acuity">Acuity Scheduling</option>
              <option value="custom_link">Custom Link</option>
              <option value="manual">Manual (no link)</option>
            </select>
          </div>
        </div>
        {!config.booking_link && (
          <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-300">No booking link configured. The AI won&apos;t be able to send a booking link to qualified leads.</p>
          </div>
        )}
      </Section>

      {/* Objection Handling */}
      <Section id="objections" icon={Shield} title={`Objection Handling (${config.common_objections.length})`}>
        <p className="text-xs text-prospex-dim">Teach the AI how to handle common pushback.</p>
        <div className="space-y-3">
          {config.common_objections.map((obj, i) => (
            <div key={i} className="p-3 bg-prospex-surface/50 rounded-lg space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-xs text-red-400 font-mono shrink-0">OBJECTION:</span>
                <input value={obj.objection} onChange={e => {
                  const updated = [...config.common_objections];
                  updated[i] = { ...updated[i], objection: e.target.value };
                  updateField('common_objections', updated);
                }} placeholder="Too expensive..." className="input flex-1 text-sm" />
                <button onClick={() => removeObjection(i)} className="p-1 text-red-400 hover:text-red-300">
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-xs text-green-400 font-mono shrink-0 mt-2">RESPONSE:</span>
                <textarea value={obj.response} onChange={e => {
                  const updated = [...config.common_objections];
                  updated[i] = { ...updated[i], response: e.target.value };
                  updateField('common_objections', updated);
                }} rows={2} placeholder="How the AI should handle this..."
                  className="input flex-1 text-sm resize-none" />
              </div>
            </div>
          ))}
          <button onClick={addObjection} className="btn-ghost text-xs"><Plus className="w-3 h-3" /> Add Objection</button>
        </div>
      </Section>

      {/* Operating Rules */}
      <Section id="rules" icon={Settings} title="Operating Rules">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-mono text-prospex-dim uppercase block mb-1">Send Window Start</label>
            <select value={config.send_window_start} onChange={e => updateField('send_window_start', parseInt(e.target.value))} className="input w-full">
              {Array.from({ length: 24 }, (_, i) => (
                <option key={i} value={i}>{i.toString().padStart(2, '0')}:00</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-mono text-prospex-dim uppercase block mb-1">Send Window End</label>
            <select value={config.send_window_end} onChange={e => updateField('send_window_end', parseInt(e.target.value))} className="input w-full">
              {Array.from({ length: 24 }, (_, i) => (
                <option key={i} value={i}>{i.toString().padStart(2, '0')}:00</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-mono text-prospex-dim uppercase block mb-1">Timezone</label>
            <select value={config.send_timezone} onChange={e => updateField('send_timezone', e.target.value)} className="input w-full">
              <option value="Europe/London">London (GMT/BST)</option>
              <option value="America/New_York">New York (EST)</option>
              <option value="America/Los_Angeles">Los Angeles (PST)</option>
              <option value="America/Toronto">Toronto (EST)</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-mono text-prospex-dim uppercase block mb-1">Max Messages Per Conversation</label>
            <input type="number" value={config.max_messages_per_conversation}
              onChange={e => updateField('max_messages_per_conversation', parseInt(e.target.value))}
              min={5} max={50} className="input w-full" />
          </div>
        </div>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={config.auto_reply_enabled}
            onChange={e => updateField('auto_reply_enabled', e.target.checked)} className="rounded" />
          <span className="text-sm text-prospex-text">Auto-reply to incoming messages (when within send window)</span>
        </label>
      </Section>

      {/* Instagram Integration */}
      <Section id="instagram" icon={Zap} title="Instagram Integration">
        <p className="text-xs text-prospex-dim mb-2">Connect your Instagram Business account to auto-reply to DMs. Requires a Meta App with Instagram Messaging permissions.</p>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-mono text-prospex-dim uppercase block mb-1">Instagram Access Token</label>
            <input type="password" value={config.instagram_access_token}
              onChange={e => updateField('instagram_access_token', e.target.value)}
              placeholder="Your long-lived Instagram access token" className="input w-full" />
          </div>
          <div>
            <label className="text-xs font-mono text-prospex-dim uppercase block mb-1">Page ID</label>
            <input value={config.instagram_page_id}
              onChange={e => updateField('instagram_page_id', e.target.value)}
              placeholder="Your Facebook Page ID linked to Instagram" className="input w-full" />
          </div>
          <div>
            <label className="text-xs font-mono text-prospex-dim uppercase block mb-1">Webhook Verify Token</label>
            <div className="flex gap-2">
              <input value={config.webhook_verify_token}
                onChange={e => updateField('webhook_verify_token', e.target.value)}
                placeholder="Auto-generated" className="input flex-1" readOnly />
              <button onClick={() => navigator.clipboard.writeText(config.webhook_verify_token)} className="btn-ghost text-xs">
                <Copy className="w-3 h-3" /> Copy
              </button>
            </div>
            <p className="text-[10px] text-prospex-dim mt-1">Use this token when setting up the webhook in Meta Developer Console</p>
          </div>
          <div className="p-3 bg-prospex-cyan/5 border border-prospex-cyan/20 rounded-lg">
            <p className="text-xs text-prospex-cyan font-mono mb-1">Webhook URL:</p>
            <code className="text-xs text-prospex-text">https://prospexv2.vercel.app/api/instagram-webhook</code>
          </div>
        </div>
      </Section>

      {/* Save Button (sticky) */}
      <div className="sticky bottom-4 flex justify-end">
        <button onClick={saveConfig} disabled={saving} className="btn-primary text-sm px-6 py-2.5 shadow-lg">
          {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</>
            : saved ? <><CheckCircle className="w-4 h-4" /> Saved!</>
            : <><Save className="w-4 h-4" /> Save Configuration</>}
        </button>
      </div>
    </div>
  );
}
