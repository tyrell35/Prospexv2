'use client';

import { useState, useEffect, useRef } from 'react';
import {
  MessageSquare, Loader2, Send, Sparkles, Bot, User,
  Mail, Instagram, Linkedin, MessageCircle, Filter,
  CheckCircle, XCircle, AlertTriangle, Clock, Target,
  ThumbsUp, ThumbsDown, HelpCircle, DollarSign, Calendar,
  ArrowRight, RefreshCw, ChevronDown, Zap,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface Conversation {
  id: string;
  business_name: string;
  contact_name: string | null;
  contact_handle: string | null;
  channel: string;
  status: string;
  latest_intent: string;
  intent_confidence: number;
  message_count: number;
  lead_score: number | null;
  lead_priority: string | null;
  pipeline_stage: string | null;
  ai_handling_active: boolean;
  last_inbound_at: string | null;
  last_activity_at: string;
  messages?: any[];
}

interface ConvoStats {
  total: number;
  active: number;
  needs_human: number;
  ai_handling: number;
  booked: number;
  by_intent: Record<string, number>;
  by_channel: Record<string, number>;
}

const CHANNEL_ICONS: Record<string, { icon: typeof Mail; color: string; label: string }> = {
  email: { icon: Mail, color: 'text-blue-400', label: 'Email' },
  instagram: { icon: Instagram, color: 'text-pink-400', label: 'Instagram' },
  whatsapp: { icon: MessageCircle, color: 'text-green-400', label: 'WhatsApp' },
  linkedin: { icon: Linkedin, color: 'text-sky-400', label: 'LinkedIn' },
  sms: { icon: MessageCircle, color: 'text-yellow-400', label: 'SMS' },
  ghl: { icon: MessageSquare, color: 'text-purple-400', label: 'GHL' },
};

const INTENT_CONFIG: Record<string, { icon: typeof ThumbsUp; color: string; label: string; bg: string }> = {
  positive_interest: { icon: ThumbsUp, color: 'text-green-400', label: 'Interested', bg: 'bg-green-500/15 border-green-500/30' },
  pricing_inquiry: { icon: DollarSign, color: 'text-yellow-400', label: 'Pricing', bg: 'bg-yellow-500/15 border-yellow-500/30' },
  objection: { icon: AlertTriangle, color: 'text-orange-400', label: 'Objection', bg: 'bg-orange-500/15 border-orange-500/30' },
  not_interested: { icon: ThumbsDown, color: 'text-red-400', label: 'Not Interested', bg: 'bg-red-500/15 border-red-500/30' },
  booking_ready: { icon: Calendar, color: 'text-emerald-400', label: 'Ready to Book', bg: 'bg-emerald-500/15 border-emerald-500/30' },
  question: { icon: HelpCircle, color: 'text-blue-400', label: 'Question', bg: 'bg-blue-500/15 border-blue-500/30' },
  spam: { icon: XCircle, color: 'text-gray-400', label: 'Spam', bg: 'bg-gray-500/15 border-gray-500/30' },
  unknown: { icon: HelpCircle, color: 'text-gray-400', label: 'Unknown', bg: 'bg-gray-500/15 border-gray-500/30' },
};

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  active: { label: 'Active', color: 'text-green-400' },
  waiting_reply: { label: 'Awaiting Reply', color: 'text-yellow-400' },
  replied: { label: 'Replied', color: 'text-blue-400' },
  ai_handling: { label: 'AI Handling', color: 'text-purple-400' },
  needs_human: { label: 'Needs Human', color: 'text-red-400' },
  booked: { label: 'Booked', color: 'text-emerald-400' },
  closed: { label: 'Closed', color: 'text-gray-400' },
  archived: { label: 'Archived', color: 'text-gray-500' },
};

function IntentBadge({ intent }: { intent: string }) {
  const config = INTENT_CONFIG[intent] || INTENT_CONFIG.unknown;
  const Icon = config.icon;
  return (
    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold border', config.bg, config.color)}>
      <Icon className="w-3 h-3" /> {config.label}
    </span>
  );
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

// ─── CONVERSATION LIST ITEM ─────────────────────────────────────
function ConvoListItem({ convo, isSelected, onClick }: { convo: Conversation; isSelected: boolean; onClick: () => void }) {
  const ch = CHANNEL_ICONS[convo.channel] || CHANNEL_ICONS.email;
  const ChIcon = ch.icon;
  const statusCfg = STATUS_LABELS[convo.status] || STATUS_LABELS.active;

  return (
    <button onClick={onClick}
      className={cn(
        'w-full text-left p-3 border-b border-prospex-border transition-colors',
        isSelected ? 'bg-prospex-accent/10 border-l-2 border-l-prospex-accent' : 'hover:bg-prospex-bg border-l-2 border-l-transparent'
      )}>
      <div className="flex items-start gap-2">
        <ChIcon className={cn('w-4 h-4 mt-0.5 flex-shrink-0', ch.color)} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-semibold text-prospex-text truncate">{convo.business_name}</span>
            <span className="text-[9px] text-prospex-dim font-mono flex-shrink-0">
              {convo.last_activity_at ? timeAgo(convo.last_activity_at) : '—'}
            </span>
          </div>
          <div className="flex items-center gap-1.5 mt-1">
            <IntentBadge intent={convo.latest_intent} />
            {convo.ai_handling_active && (
              <span className="text-[9px] text-purple-400 font-mono flex items-center gap-0.5">
                <Bot className="w-2.5 h-2.5" /> AI
              </span>
            )}
            <span className={cn('text-[9px] font-mono', statusCfg.color)}>{statusCfg.label}</span>
          </div>
          <div className="flex items-center gap-2 mt-1 text-[9px] text-prospex-dim font-mono">
            <span>{convo.message_count} msgs</span>
            {convo.lead_score && <span>Score: {convo.lead_score}</span>}
          </div>
        </div>
      </div>
    </button>
  );
}

// ─── MESSAGE THREAD ──────────────────────────────────────────────
function MessageThread({
  conversation,
  onSendMessage,
  onTakeOver,
  sending,
}: {
  conversation: Conversation;
  onSendMessage: (text: string) => void;
  onTakeOver: () => void;
  sending: boolean;
}) {
  const [input, setInput] = useState('');
  const messagesEnd = useRef<HTMLDivElement>(null);
  const messages = conversation.messages || [];

  useEffect(() => {
    messagesEnd.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const handleSend = () => {
    if (!input.trim()) return;
    onSendMessage(input.trim());
    setInput('');
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-3 border-b border-prospex-border flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-prospex-text">{conversation.business_name}</h3>
          <div className="flex items-center gap-2 mt-0.5">
            <IntentBadge intent={conversation.latest_intent} />
            {conversation.contact_handle && (
              <span className="text-[10px] text-prospex-dim font-mono">{conversation.contact_handle}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {conversation.ai_handling_active && (
            <button onClick={onTakeOver}
              className="btn btn-sm text-[10px] bg-red-500/10 text-red-400 border border-red-500/30 px-3 py-1.5">
              <User className="w-3 h-3 inline mr-1" /> Take Over from AI
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.map((msg: any, i: number) => (
          <div key={msg.id || i} className={cn('flex', msg.direction === 'outbound' ? 'justify-end' : 'justify-start')}>
            <div className={cn(
              'max-w-[75%] rounded-lg px-3 py-2',
              msg.direction === 'outbound'
                ? 'bg-prospex-accent/15 border border-prospex-accent/30'
                : 'bg-prospex-card border border-prospex-border'
            )}>
              <div className="flex items-center gap-1.5 mb-1">
                {msg.direction === 'outbound' ? (
                  msg.is_ai_generated
                    ? <Bot className="w-3 h-3 text-purple-400" />
                    : <User className="w-3 h-3 text-prospex-accent" />
                ) : (
                  <User className="w-3 h-3 text-prospex-muted" />
                )}
                <span className="text-[9px] text-prospex-dim font-mono">{msg.sender || (msg.direction === 'outbound' ? 'You' : 'Prospect')}</span>
                <span className="text-[9px] text-prospex-dim font-mono">
                  {msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                </span>
              </div>
              <p className="text-sm text-prospex-text whitespace-pre-wrap">{msg.content}</p>
            </div>
          </div>
        ))}
        <div ref={messagesEnd} />
      </div>

      {/* Input */}
      <div className="p-3 border-t border-prospex-border">
        <div className="flex gap-2">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
            placeholder="Type a message..."
            className="flex-1 bg-prospex-bg border border-prospex-border rounded-lg px-3 py-2 text-sm text-prospex-text"
          />
          <button onClick={handleSend} disabled={!input.trim() || sending}
            className="btn bg-prospex-accent/15 text-prospex-accent border border-prospex-accent/30 px-3 disabled:opacity-50">
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── MAIN PAGE ───────────────────────────────────────────────────
export default function ConversationsPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [stats, setStats] = useState<ConvoStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Conversation | null>(null);
  const [sending, setSending] = useState(false);

  // Filters
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterIntent, setFilterIntent] = useState<string>('all');
  const [filterChannel, setFilterChannel] = useState<string>('all');

  const fetchConversations = async () => {
    try {
      const params = new URLSearchParams();
      if (filterStatus !== 'all') params.set('status', filterStatus);
      if (filterIntent !== 'all') params.set('intent', filterIntent);
      if (filterChannel !== 'all') params.set('channel', filterChannel);

      const res = await fetch(`/api/conversations?${params}`);
      const data = await res.json();
      setConversations(data.conversations || []);
      setStats(data.stats || null);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { fetchConversations(); }, [filterStatus, filterIntent, filterChannel]);

  // Auto-refresh every 30s
  useEffect(() => {
    const interval = setInterval(fetchConversations, 30000);
    return () => clearInterval(interval);
  }, [filterStatus, filterIntent, filterChannel]);

  const selectConversation = async (convo: Conversation) => {
    // Fetch full conversation with messages
    const res = await fetch(`/api/conversations?id=${convo.id}`);
    const data = await res.json();
    setSelected(data.conversation || convo);
  };

  const handleSendMessage = async (text: string) => {
    if (!selected) return;
    setSending(true);
    try {
      await fetch('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'send_message', conversation_id: selected.id, message_text: text }),
      });
      // Refresh the selected conversation
      await selectConversation(selected);
    } catch {}
    setSending(false);
  };

  const handleTakeOver = async () => {
    if (!selected) return;
    await fetch('/api/conversations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'take_over', conversation_id: selected.id }),
    });
    await selectConversation(selected);
  };

  return (
    <div className="min-h-screen bg-prospex-bg text-prospex-text flex flex-col" style={{ height: '100vh' }}>
      {/* Header */}
      <div className="p-4 border-b border-prospex-border flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-prospex-accent" /> Conversations
          </h1>
          {stats && (
            <div className="flex items-center gap-3 mt-1 text-[10px] font-mono text-prospex-muted">
              <span>{stats.total} total</span>
              <span className="text-green-400">{stats.active} active</span>
              <span className="text-purple-400">{stats.ai_handling} AI handling</span>
              <span className="text-red-400">{stats.needs_human} need human</span>
              <span className="text-emerald-400">{stats.booked} booked</span>
            </div>
          )}
        </div>
        <button onClick={fetchConversations}
          className="btn btn-sm text-xs text-prospex-dim border border-prospex-border px-3 py-1.5 flex items-center gap-1">
          <RefreshCw className="w-3 h-3" /> Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="px-4 py-2 border-b border-prospex-border flex flex-wrap items-center gap-2">
        <Filter className="w-3 h-3 text-prospex-dim" />
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          className="bg-prospex-card border border-prospex-border rounded px-2 py-1 text-[10px] font-mono text-prospex-text">
          <option value="all">All Status</option>
          {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select value={filterIntent} onChange={e => setFilterIntent(e.target.value)}
          className="bg-prospex-card border border-prospex-border rounded px-2 py-1 text-[10px] font-mono text-prospex-text">
          <option value="all">All Intents</option>
          {Object.entries(INTENT_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select value={filterChannel} onChange={e => setFilterChannel(e.target.value)}
          className="bg-prospex-card border border-prospex-border rounded px-2 py-1 text-[10px] font-mono text-prospex-text">
          <option value="all">All Channels</option>
          {Object.entries(CHANNEL_ICONS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>

      {/* Split View */}
      <div className="flex-1 flex overflow-hidden">
        {/* Conversation List */}
        <div className="w-80 lg:w-96 border-r border-prospex-border overflow-y-auto flex-shrink-0">
          {loading ? (
            <div className="p-8 text-center">
              <Loader2 className="w-5 h-5 animate-spin mx-auto text-prospex-accent mb-2" />
              <p className="text-xs text-prospex-muted">Loading...</p>
            </div>
          ) : conversations.length === 0 ? (
            <div className="p-8 text-center">
              <MessageSquare className="w-8 h-8 text-prospex-dim mx-auto mb-2" />
              <p className="text-xs text-prospex-muted">No conversations yet.</p>
              <p className="text-[10px] text-prospex-dim mt-1">Replies from your outreach will appear here.</p>
            </div>
          ) : (
            conversations.map(convo => (
              <ConvoListItem
                key={convo.id}
                convo={convo}
                isSelected={selected?.id === convo.id}
                onClick={() => selectConversation(convo)}
              />
            ))
          )}
        </div>

        {/* Message Thread */}
        <div className="flex-1 flex flex-col">
          {selected ? (
            <MessageThread
              conversation={selected}
              onSendMessage={handleSendMessage}
              onTakeOver={handleTakeOver}
              sending={sending}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center text-center p-8">
              <div>
                <MessageSquare className="w-12 h-12 text-prospex-dim mx-auto mb-3" />
                <p className="text-sm text-prospex-muted">Select a conversation to view messages</p>
                <p className="text-[10px] text-prospex-dim mt-1">
                  AI intent classification runs automatically on every inbound reply
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
