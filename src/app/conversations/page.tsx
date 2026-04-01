'use client';

import { useState, useEffect, useRef } from 'react';
import {
  MessageCircle, Search, Loader2, Send, Bot, User, UserCheck, Clock,
  CheckCircle, XCircle, AlertTriangle, Calendar, Star, Filter, RefreshCw,
  Instagram, Mail, Linkedin, MessageSquare, Phone, Globe, ChevronDown,
  Zap, Target, ArrowRight, ExternalLink, Sparkles,
} from 'lucide-react';

interface Conversation {
  id: string;
  lead_name: string;
  lead_business: string;
  channel: string;
  status: string;
  sentiment: string;
  priority: string;
  qualifying_score: number;
  is_qualified: boolean;
  total_messages: number;
  last_message_at: string;
  last_message_preview: string;
  updated_at: string;
  booking_sent_at: string | null;
  booked_at: string | null;
  tags: string[];
}

interface Message {
  id: string;
  conversation_id: string;
  role: string;
  sender_name: string;
  content: string;
  content_type: string;
  ai_intent_detected: string;
  delivery_status: string;
  created_at: string;
}

const channelIcons: Record<string, typeof Instagram> = {
  instagram: Instagram,
  email: Mail,
  linkedin: Linkedin,
  whatsapp: MessageSquare,
  sms: Phone,
  webchat: Globe,
};

const statusConfig: Record<string, { label: string; color: string }> = {
  new: { label: 'New', color: 'bg-blue-500/20 text-blue-400' },
  greeting: { label: 'Greeting', color: 'bg-blue-500/20 text-blue-400' },
  qualifying: { label: 'Qualifying', color: 'bg-yellow-500/20 text-yellow-400' },
  objection: { label: 'Objection', color: 'bg-orange-500/20 text-orange-400' },
  nurturing: { label: 'Nurturing', color: 'bg-purple-500/20 text-purple-400' },
  booking: { label: 'Booking', color: 'bg-cyan-500/20 text-cyan-400' },
  booked: { label: 'Booked ✓', color: 'bg-green-500/20 text-green-400' },
  handed_off: { label: 'Human', color: 'bg-amber-500/20 text-amber-400' },
  closed_won: { label: 'Won', color: 'bg-green-500/20 text-green-400' },
  closed_lost: { label: 'Lost', color: 'bg-red-500/20 text-red-400' },
  paused: { label: 'Paused', color: 'bg-gray-500/20 text-gray-400' },
};

const sentimentEmoji: Record<string, string> = {
  positive: '🟢',
  neutral: '🟡',
  negative: '🔴',
  hot: '🔥',
};

export default function ConversationsPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConv, setSelectedConv] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [msgsLoading, setMsgsLoading] = useState(false);
  const [filter, setFilter] = useState({ channel: 'all', status: 'all', search: '' });
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [humanMessage, setHumanMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [simulateMessage, setSimulateMessage] = useState('');
  const [simulating, setSimulating] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadConversations();
    // Poll every 15 seconds
    const interval = setInterval(loadConversations, 15000);
    return () => clearInterval(interval);
  }, [filter.channel, filter.status, filter.search]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const loadConversations = async () => {
    try {
      const res = await fetch('/api/ai-conversation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'get_conversations', ...filter }),
      });
      const data = await res.json();
      setConversations(data.conversations || []);
      setCounts(data.counts || {});
    } catch {
      // Retry silently
    } finally {
      setLoading(false);
    }
  };

  const loadMessages = async (conv: Conversation) => {
    setSelectedConv(conv);
    setMsgsLoading(true);
    try {
      const res = await fetch('/api/ai-conversation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'get_conversation', conversation_id: conv.id }),
      });
      const data = await res.json();
      setMessages(data.messages || []);
      if (data.conversation) setSelectedConv(data.conversation);
    } catch {
      // Handle error
    } finally {
      setMsgsLoading(false);
    }
  };

  const sendHumanMsg = async () => {
    if (!humanMessage.trim() || !selectedConv) return;
    setSending(true);
    try {
      await fetch('/api/ai-conversation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'send_human_message',
          conversation_id: selectedConv.id,
          content: humanMessage,
          sender_name: 'You',
        }),
      });
      setHumanMessage('');
      await loadMessages(selectedConv);
    } catch {
      // Handle error
    } finally {
      setSending(false);
    }
  };

  // Simulate an incoming message (for testing)
  const simulateIncoming = async () => {
    if (!simulateMessage.trim() || !selectedConv) return;
    setSimulating(true);
    try {
      await fetch('/api/ai-conversation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'process_message',
          conversation_id: selectedConv.id,
          message_text: simulateMessage,
          channel: selectedConv.channel,
          sender_name: selectedConv.lead_name,
        }),
      });
      setSimulateMessage('');
      await loadMessages(selectedConv);
      loadConversations();
    } catch {
      // Handle error
    } finally {
      setSimulating(false);
    }
  };

  const updateStatus = async (status: string) => {
    if (!selectedConv) return;
    await fetch('/api/ai-conversation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'update_status', conversation_id: selectedConv.id, status }),
    });
    loadConversations();
    loadMessages(selectedConv);
  };

  const timeAgo = (date: string) => {
    if (!date) return '';
    const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
    if (seconds < 60) return 'now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
    return `${Math.floor(seconds / 86400)}d`;
  };

  const totalActive = Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-4">
        <h1 className="text-2xl font-mono font-bold text-prospex-text flex items-center gap-3">
          <MessageCircle className="w-7 h-7 text-prospex-cyan" />
          Conversations
          {totalActive > 0 && <span className="text-sm font-normal bg-prospex-cyan/20 text-prospex-cyan px-2 py-0.5 rounded-full">{totalActive} active</span>}
        </h1>
        <p className="text-sm text-prospex-dim mt-1">AI-powered inbox — qualifying leads and booking appointments across all channels</p>
      </div>

      <div className="flex gap-4" style={{ height: 'calc(100vh - 180px)' }}>
        {/* Left: Conversation List */}
        <div className="w-80 shrink-0 flex flex-col card overflow-hidden">
          {/* Filters */}
          <div className="p-3 border-b border-prospex-border/20 space-y-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-prospex-dim" />
              <input
                value={filter.search}
                onChange={e => setFilter(f => ({ ...f, search: e.target.value }))}
                placeholder="Search conversations..."
                className="input w-full pl-9 text-xs py-1.5"
              />
            </div>
            <div className="flex gap-1">
              <select value={filter.channel} onChange={e => setFilter(f => ({ ...f, channel: e.target.value }))} className="input text-[10px] py-1 flex-1">
                <option value="all">All Channels</option>
                <option value="instagram">Instagram</option>
                <option value="email">Email</option>
                <option value="linkedin">LinkedIn</option>
                <option value="whatsapp">WhatsApp</option>
                <option value="webchat">Web Chat</option>
              </select>
              <select value={filter.status} onChange={e => setFilter(f => ({ ...f, status: e.target.value }))} className="input text-[10px] py-1 flex-1">
                <option value="all">All Status</option>
                <option value="new">New</option>
                <option value="qualifying">Qualifying</option>
                <option value="objection">Objection</option>
                <option value="booking">Booking</option>
                <option value="booked">Booked</option>
                <option value="handed_off">Human</option>
              </select>
            </div>
          </div>

          {/* Quick Stats */}
          <div className="flex items-center gap-2 px-3 py-2 border-b border-prospex-border/20 text-[10px] text-prospex-dim">
            {counts.qualifying && <span className="bg-yellow-500/10 text-yellow-400 px-1.5 py-0.5 rounded">🎯 {counts.qualifying} qualifying</span>}
            {counts.booking && <span className="bg-cyan-500/10 text-cyan-400 px-1.5 py-0.5 rounded">📅 {counts.booking} booking</span>}
            {counts.booked && <span className="bg-green-500/10 text-green-400 px-1.5 py-0.5 rounded">✓ {counts.booked} booked</span>}
          </div>

          {/* Conversation List */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-prospex-cyan" />
              </div>
            ) : conversations.length === 0 ? (
              <div className="text-center py-8 px-4">
                <MessageCircle className="w-8 h-8 text-prospex-dim mx-auto mb-2" />
                <p className="text-xs text-prospex-dim">No conversations yet</p>
                <p className="text-[10px] text-prospex-dim mt-1">Use the Test panel or start outreach to begin conversations</p>
              </div>
            ) : (
              conversations.map(conv => {
                const ChannelIcon = channelIcons[conv.channel] || Globe;
                const statusCfg = statusConfig[conv.status] || statusConfig.new;
                const isSelected = selectedConv?.id === conv.id;

                return (
                  <button key={conv.id} onClick={() => loadMessages(conv)}
                    className={`w-full text-left p-3 border-b border-prospex-border/10 hover:bg-prospex-surface/50 transition-colors ${isSelected ? 'bg-prospex-cyan/5 border-l-2 border-l-prospex-cyan' : ''}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <ChannelIcon className="w-3 h-3 text-prospex-muted shrink-0" />
                          <p className="text-sm font-medium text-prospex-text truncate">{conv.lead_name}</p>
                          <span className="text-[10px]">{sentimentEmoji[conv.sentiment] || ''}</span>
                        </div>
                        {conv.lead_business && (
                          <p className="text-[10px] text-prospex-dim truncate mt-0.5">{conv.lead_business}</p>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <span className="text-[10px] text-prospex-dim">{timeAgo(conv.last_message_at)}</span>
                        <div className="mt-0.5">
                          <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-mono ${statusCfg.color}`}>
                            {statusCfg.label}
                          </span>
                        </div>
                      </div>
                    </div>
                    {conv.last_message_preview && (
                      <p className="text-[11px] text-prospex-muted mt-1 truncate">{conv.last_message_preview}</p>
                    )}
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[9px] text-prospex-dim font-mono">{conv.total_messages} msgs</span>
                      {conv.qualifying_score > 0 && (
                        <span className="text-[9px] text-prospex-dim font-mono">Score: {conv.qualifying_score}</span>
                      )}
                      {conv.is_qualified && <span className="text-[9px] text-green-400">✓ Qualified</span>}
                      {conv.priority === 'urgent' && <span className="text-[9px] text-red-400">🔥 Urgent</span>}
                      {conv.priority === 'high' && <span className="text-[9px] text-amber-400">⚡ High</span>}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Right: Conversation Detail */}
        <div className="flex-1 flex flex-col card overflow-hidden">
          {!selectedConv ? (
            <div className="flex-1 flex items-center justify-center text-center px-8">
              <div>
                <Bot className="w-12 h-12 text-prospex-dim mx-auto mb-3" />
                <p className="text-sm text-prospex-dim font-mono">Select a conversation</p>
                <p className="text-xs text-prospex-dim mt-1">or simulate one using the test panel below</p>
              </div>
            </div>
          ) : (
            <>
              {/* Header */}
              <div className="p-4 border-b border-prospex-border/20">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-base font-semibold text-prospex-text">{selectedConv.lead_name}</h2>
                      {selectedConv.is_qualified && (
                        <span className="text-[10px] px-1.5 py-0.5 bg-green-500/20 text-green-400 rounded-full flex items-center gap-1">
                          <CheckCircle className="w-3 h-3" /> Qualified
                        </span>
                      )}
                    </div>
                    {selectedConv.lead_business && (
                      <p className="text-xs text-prospex-dim">{selectedConv.lead_business}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      value={selectedConv.status}
                      onChange={e => updateStatus(e.target.value)}
                      className="input text-[10px] py-1 px-2"
                    >
                      {Object.entries(statusConfig).map(([k, v]) => (
                        <option key={k} value={k}>{v.label}</option>
                      ))}
                    </select>
                    <span className={`text-[10px] px-2 py-1 rounded-full font-mono ${statusConfig[selectedConv.status]?.color || ''}`}>
                      {statusConfig[selectedConv.status]?.label || selectedConv.status}
                    </span>
                  </div>
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {msgsLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-5 h-5 animate-spin text-prospex-cyan" />
                  </div>
                ) : messages.length === 0 ? (
                  <p className="text-center text-xs text-prospex-dim py-4">No messages yet</p>
                ) : (
                  messages.map(msg => {
                    const isLead = msg.role === 'lead';
                    const isAI = msg.role === 'ai_agent';
                    const isHuman = msg.role === 'human_agent';

                    return (
                      <div key={msg.id} className={`flex ${isLead ? 'justify-start' : 'justify-end'}`}>
                        <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 ${
                          isLead ? 'bg-prospex-surface/80 border border-prospex-border/20'
                          : isAI ? 'bg-prospex-cyan/10 border border-prospex-cyan/20'
                          : 'bg-purple-500/10 border border-purple-500/20'
                        }`}>
                          <div className="flex items-center gap-1.5 mb-1">
                            {isLead && <User className="w-3 h-3 text-prospex-dim" />}
                            {isAI && <Bot className="w-3 h-3 text-prospex-cyan" />}
                            {isHuman && <UserCheck className="w-3 h-3 text-purple-400" />}
                            <span className="text-[10px] font-mono text-prospex-dim">
                              {msg.sender_name || (isLead ? 'Lead' : isAI ? 'AI Agent' : 'You')}
                            </span>
                            <span className="text-[10px] text-prospex-dim">
                              {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                            {msg.ai_intent_detected && isLead && (
                              <span className="text-[9px] px-1 py-0.5 bg-prospex-bg rounded text-prospex-dim">
                                {msg.ai_intent_detected}
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-prospex-text whitespace-pre-wrap">{msg.content}</p>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Input Area */}
              <div className="p-3 border-t border-prospex-border/20 space-y-2">
                {/* Simulate Lead Message (for testing) */}
                <div className="flex gap-2">
                  <div className="flex-1 relative">
                    <Sparkles className="w-3 h-3 absolute left-3 top-1/2 -translate-y-1/2 text-amber-400" />
                    <input
                      value={simulateMessage}
                      onChange={e => setSimulateMessage(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && simulateIncoming()}
                      placeholder="Simulate lead reply (test AI response)..."
                      className="input w-full pl-8 text-xs py-1.5"
                    />
                  </div>
                  <button onClick={simulateIncoming} disabled={simulating || !simulateMessage.trim()}
                    className="bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1">
                    {simulating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
                    Simulate
                  </button>
                </div>

                {/* Human Override Message */}
                <div className="flex gap-2">
                  <div className="flex-1 relative">
                    <UserCheck className="w-3 h-3 absolute left-3 top-1/2 -translate-y-1/2 text-purple-400" />
                    <input
                      value={humanMessage}
                      onChange={e => setHumanMessage(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && sendHumanMsg()}
                      placeholder="Send as yourself (override AI)..."
                      className="input w-full pl-8 text-xs py-1.5"
                    />
                  </div>
                  <button onClick={sendHumanMsg} disabled={sending || !humanMessage.trim()}
                    className="btn-primary text-xs px-3 py-1.5 flex items-center gap-1">
                    {sending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                    Send
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
