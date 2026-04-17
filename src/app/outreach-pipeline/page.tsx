'use client';

import { useState, useEffect } from 'react';
import {
  Send, Users, Loader2, Search, Filter, Clock, CheckCircle, XCircle,
  MessageCircle, AlertTriangle, Calendar, ChevronDown, ChevronUp,
  Instagram, Mail, Phone, Globe, ExternalLink, RefreshCw, Zap,
  ArrowRight, Eye, Target, TrendingUp, Bell,
} from 'lucide-react';

interface PipelineLead {
  id: string;
  business_name: string;
  niche: string;
  city: string;
  country: string;
  phone: string | null;
  email: string | null;
  instagram_url: string | null;
  website: string | null;
  google_rating: number | null;
  google_review_count: number | null;
  outreach_status: string;
  outreach_channel: string | null;
  first_outreach_at: string | null;
  last_outreach_at: string | null;
  follow_up_count: number;
  response_status: string;
  responded_at: string | null;
  response_sentiment: string | null;
  pipeline_stage: string;
  assigned_to: string | null;
  next_action: string | null;
  next_action_at: string | null;
  outreach_notes: string | null;
  booked_at: string | null;
  lead_priority: string | null;
  conversation_status: string | null;
}

interface PipelineStats {
  total_outreached: number;
  by_status: Record<string, number>;
  response_rate: number;
  responded: number;
  by_response: Record<string, number>;
  by_sentiment: Record<string, number>;
  due_actions: number;
}

const statusConfig: Record<string, { label: string; color: string; emoji: string }> = {
  dm_sent: { label: 'DM Sent', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30', emoji: '📤' },
  follow_up_1: { label: 'Follow-Up 1', color: 'bg-amber-500/20 text-amber-400 border-amber-500/30', emoji: '🔁' },
  follow_up_2: { label: 'Follow-Up 2', color: 'bg-orange-500/20 text-orange-400 border-orange-500/30', emoji: '🔁' },
  follow_up_3: { label: 'Follow-Up 3', color: 'bg-red-500/20 text-red-400 border-red-500/30', emoji: '⚠️' },
  responded: { label: 'Responded', color: 'bg-green-500/20 text-green-400 border-green-500/30', emoji: '💬' },
  booked: { label: 'Booked', color: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30', emoji: '📅' },
  closed_won: { label: 'Won', color: 'bg-green-500/20 text-green-400 border-green-500/30', emoji: '🎉' },
  closed_lost: { label: 'Lost', color: 'bg-gray-500/20 text-gray-400 border-gray-500/30', emoji: '❌' },
};

const sentimentConfig: Record<string, { label: string; color: string }> = {
  positive: { label: '🟢 Positive', color: 'text-green-400' },
  neutral: { label: '🟡 Neutral', color: 'text-yellow-400' },
  negative: { label: '🔴 Negative', color: 'text-red-400' },
  objection: { label: '🟠 Objection', color: 'text-orange-400' },
};

export default function OutreachPipelinePage() {
  const [leads, setLeads] = useState<PipelineLead[]>([]);
  const [stats, setStats] = useState<PipelineStats | null>(null);
  const [dueActions, setDueActions] = useState<PipelineLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState({ status: 'all', channel: 'all', search: '' });
  const [expandedLead, setExpandedLead] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [showDuePanel, setShowDuePanel] = useState(true);

  useEffect(() => {
    loadAll();
  }, [filter.status, filter.channel]);

  const loadAll = async () => {
    await Promise.all([loadPipeline(), loadStats(), loadDueActions()]);
    setLoading(false);
  };

  const loadPipeline = async () => {
    const res = await fetch('/api/outreach-tracker', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'get_pipeline', filter_status: filter.status, filter_channel: filter.channel, search: filter.search }),
    });
    const data = await res.json();
    setLeads(data.leads || []);
  };

  const loadStats = async () => {
    const res = await fetch('/api/outreach-tracker', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'get_stats' }),
    });
    const data = await res.json();
    setStats(data.stats || null);
  };

  const loadDueActions = async () => {
    const res = await fetch('/api/outreach-tracker', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'get_due_actions' }),
    });
    const data = await res.json();
    setDueActions(data.due_actions || []);
  };

  const logOutreach = async (leadId: string, stage: string) => {
    setActionLoading(leadId);
    await fetch('/api/outreach-tracker', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'log_outreach', lead_id: leadId, stage, channel: 'instagram' }),
    });
    await loadAll();
    setActionLoading(null);
  };

  const markResponded = async (leadId: string, sentiment: string) => {
    setActionLoading(leadId);
    await fetch('/api/outreach-tracker', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'mark_responded', lead_id: leadId, sentiment }),
    });
    await loadAll();
    setActionLoading(null);
  };

  const updateStatus = async (leadId: string, status: string) => {
    setActionLoading(leadId);
    await fetch('/api/outreach-tracker', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'update_status', lead_id: leadId, outreach_status: status }),
    });
    await loadAll();
    setActionLoading(null);
  };

  const timeAgo = (date: string | null) => {
    if (!date) return '—';
    const s = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
    if (s < 60) return 'now';
    if (s < 3600) return `${Math.floor(s / 60)}m`;
    if (s < 86400) return `${Math.floor(s / 3600)}h`;
    return `${Math.floor(s / 86400)}d`;
  };

  const filteredLeads = leads.filter(l => {
    if (filter.search) {
      const q = filter.search.toLowerCase();
      return l.business_name?.toLowerCase().includes(q) || l.city?.toLowerCase().includes(q);
    }
    return true;
  });

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto flex items-center justify-center min-h-[50vh]">
        <Loader2 className="w-8 h-8 animate-spin text-prospex-cyan" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-mono font-bold text-prospex-text flex items-center gap-3">
            <Send className="w-7 h-7 text-prospex-cyan" />
            Outreach Pipeline
          </h1>
          <p className="text-sm text-prospex-dim mt-1">Track every DM, follow-up, and response across your outreach</p>
        </div>
        <button onClick={() => loadAll()} className="btn-ghost text-xs">
          <RefreshCw className="w-3 h-3" /> Refresh
        </button>
      </div>

      {/* Stats Bar */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          <div className="card p-3 text-center">
            <p className="text-xl font-mono font-bold text-prospex-text">{stats.total_outreached}</p>
            <p className="text-[10px] text-prospex-dim uppercase font-mono">Total Outreached</p>
          </div>
          <div className="card p-3 text-center">
            <p className="text-xl font-mono font-bold text-blue-400">{stats.by_status.dm_sent || 0}</p>
            <p className="text-[10px] text-prospex-dim uppercase font-mono">DM Sent</p>
          </div>
          <div className="card p-3 text-center">
            <p className="text-xl font-mono font-bold text-amber-400">{(stats.by_status.follow_up_1 || 0) + (stats.by_status.follow_up_2 || 0) + (stats.by_status.follow_up_3 || 0)}</p>
            <p className="text-[10px] text-prospex-dim uppercase font-mono">Following Up</p>
          </div>
          <div className="card p-3 text-center">
            <p className="text-xl font-mono font-bold text-green-400">{stats.responded}</p>
            <p className="text-[10px] text-prospex-dim uppercase font-mono">Responded</p>
          </div>
          <div className="card p-3 text-center">
            <p className="text-xl font-mono font-bold text-cyan-400">{stats.by_status.booked || 0}</p>
            <p className="text-[10px] text-prospex-dim uppercase font-mono">Booked</p>
          </div>
          <div className="card p-3 text-center border-prospex-cyan/30">
            <p className="text-xl font-mono font-bold text-prospex-cyan">{stats.response_rate}%</p>
            <p className="text-[10px] text-prospex-dim uppercase font-mono">Response Rate</p>
          </div>
        </div>
      )}

      {/* Due Actions Panel */}
      {dueActions.length > 0 && showDuePanel && (
        <div className="card p-4 border-amber-500/30">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-mono font-semibold text-amber-400 flex items-center gap-2">
              <Bell className="w-4 h-4" /> Due Today ({dueActions.length} actions)
            </h2>
            <button onClick={() => setShowDuePanel(false)} className="text-prospex-dim hover:text-prospex-text">
              <XCircle className="w-4 h-4" />
            </button>
          </div>
          <div className="space-y-2">
            {dueActions.slice(0, 5).map(lead => (
              <div key={lead.id} className="flex items-center justify-between p-2 bg-amber-500/5 rounded-lg">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-prospex-text font-medium truncate">{lead.business_name}</p>
                  <p className="text-[10px] text-prospex-dim">{lead.next_action} • {lead.city}</p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0 ml-2">
                  {lead.outreach_status?.startsWith('follow_up') || lead.outreach_status === 'dm_sent' ? (
                    <>
                      <button onClick={() => logOutreach(lead.id, 'follow_up')} disabled={actionLoading === lead.id}
                        className="text-[10px] px-2 py-1 bg-amber-500/20 text-amber-400 rounded-md hover:bg-amber-500/30">
                        {actionLoading === lead.id ? <Loader2 className="w-3 h-3 animate-spin" /> : '📤 Follow Up'}
                      </button>
                      <button onClick={() => markResponded(lead.id, 'positive')} disabled={actionLoading === lead.id}
                        className="text-[10px] px-2 py-1 bg-green-500/20 text-green-400 rounded-md hover:bg-green-500/30">
                        💬 Responded
                      </button>
                    </>
                  ) : (
                    <button onClick={() => updateStatus(lead.id, 'booked')} disabled={actionLoading === lead.id}
                      className="text-[10px] px-2 py-1 bg-cyan-500/20 text-cyan-400 rounded-md hover:bg-cyan-500/30">
                      📅 Booked
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="card p-3">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-prospex-dim" />
            <input value={filter.search} onChange={e => { setFilter(f => ({ ...f, search: e.target.value })); }}
              onKeyDown={e => e.key === 'Enter' && loadPipeline()}
              placeholder="Search by business name or city..." className="input w-full pl-9 text-xs py-1.5" />
          </div>
          <select value={filter.status} onChange={e => setFilter(f => ({ ...f, status: e.target.value }))} className="input text-xs py-1.5">
            <option value="all">All Stages</option>
            <option value="dm_sent">DM Sent</option>
            <option value="follow_up_1">Follow-Up 1</option>
            <option value="follow_up_2">Follow-Up 2</option>
            <option value="follow_up_3">Follow-Up 3</option>
            <option value="responded">Responded</option>
            <option value="booked">Booked</option>
            <option value="closed_won">Won</option>
            <option value="closed_lost">Lost</option>
          </select>
          <select value={filter.channel} onChange={e => setFilter(f => ({ ...f, channel: e.target.value }))} className="input text-xs py-1.5">
            <option value="all">All Channels</option>
            <option value="instagram">Instagram</option>
            <option value="email">Email</option>
            <option value="linkedin">LinkedIn</option>
            <option value="whatsapp">WhatsApp</option>
          </select>
          <span className="text-xs text-prospex-dim font-mono">{filteredLeads.length} leads</span>
        </div>
      </div>

      {/* Pipeline Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-prospex-border/20">
                {['Business', 'Status', 'Follow-Ups', 'Response', 'Last Activity', 'Next Action', 'Actions'].map(h => (
                  <th key={h} className="text-left px-3 py-2.5 text-[10px] font-mono text-prospex-dim uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredLeads.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-sm text-prospex-dim">
                    No outreached leads yet. Start by sending DMs from the Lead Database.
                  </td>
                </tr>
              ) : (
                filteredLeads.map(lead => {
                  const sc = statusConfig[lead.outreach_status] || statusConfig.dm_sent;
                  const isExpanded = expandedLead === lead.id;
                  const isOverdue = lead.next_action_at && new Date(lead.next_action_at) < new Date();
                  const isLoading = actionLoading === lead.id;

                  return (
                    <tr key={lead.id} className="border-b border-prospex-border/10 hover:bg-prospex-surface/30 transition-colors">
                      <td className="px-3 py-2.5">
                        <button onClick={() => setExpandedLead(isExpanded ? null : lead.id)} className="text-left">
                          <p className="text-sm font-medium text-prospex-text">{lead.business_name}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[10px] text-prospex-dim">{lead.city}</span>
                            {lead.instagram_url && <Instagram className="w-3 h-3 text-pink-400" />}
                            {lead.email && <Mail className="w-3 h-3 text-green-400" />}
                            {lead.google_rating && <span className="text-[10px] text-yellow-400">★ {lead.google_rating}</span>}
                          </div>
                        </button>
                        {isExpanded && (
                          <div className="mt-2 p-2 bg-prospex-surface/30 rounded-lg space-y-1 text-[10px]">
                            {lead.phone && <p className="text-prospex-muted">📞 {lead.phone}</p>}
                            {lead.email && <p className="text-prospex-muted">✉️ {lead.email}</p>}
                            {lead.instagram_url && <a href={lead.instagram_url} target="_blank" rel="noopener noreferrer" className="text-pink-400 hover:text-pink-300 block">🔗 {lead.instagram_url}</a>}
                            {lead.outreach_notes && <p className="text-prospex-dim mt-1">📝 {lead.outreach_notes}</p>}
                            <div className="flex gap-1 mt-1">
                              <a href={`/leads/${lead.id}`} className="text-prospex-cyan hover:underline">View Lead →</a>
                            </div>
                          </div>
                        )}
                      </td>

                      <td className="px-3 py-2.5">
                        <span className={`text-[10px] px-2 py-1 rounded-full border font-mono ${sc.color}`}>
                          {sc.emoji} {sc.label}
                        </span>
                      </td>

                      <td className="px-3 py-2.5 text-center">
                        <span className="text-sm font-mono text-prospex-text">{lead.follow_up_count}</span>
                        <p className="text-[9px] text-prospex-dim">sent</p>
                      </td>

                      <td className="px-3 py-2.5">
                        {lead.response_status === 'responded' ? (
                          <div>
                            <span className={`text-[10px] font-medium ${sentimentConfig[lead.response_sentiment || 'neutral']?.color || 'text-prospex-dim'}`}>
                              {sentimentConfig[lead.response_sentiment || 'neutral']?.label || '💬 Responded'}
                            </span>
                            {lead.responded_at && <p className="text-[9px] text-prospex-dim">{timeAgo(lead.responded_at)} ago</p>}
                          </div>
                        ) : (
                          <span className="text-[10px] text-prospex-dim">No response</span>
                        )}
                      </td>

                      <td className="px-3 py-2.5">
                        <p className="text-[10px] text-prospex-muted">{timeAgo(lead.last_outreach_at)} ago</p>
                        {lead.first_outreach_at && <p className="text-[9px] text-prospex-dim">Started {timeAgo(lead.first_outreach_at)} ago</p>}
                      </td>

                      <td className="px-3 py-2.5">
                        {lead.next_action ? (
                          <div>
                            <p className={`text-[10px] ${isOverdue ? 'text-red-400 font-semibold' : 'text-prospex-muted'}`}>
                              {isOverdue ? '⚠️ ' : ''}{lead.next_action}
                            </p>
                            <p className="text-[9px] text-prospex-dim">
                              {isOverdue ? 'OVERDUE' : `Due ${timeAgo(lead.next_action_at)}`}
                            </p>
                          </div>
                        ) : (
                          <span className="text-[10px] text-prospex-dim">—</span>
                        )}
                      </td>

                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1">
                          {isLoading ? (
                            <Loader2 className="w-3 h-3 animate-spin text-prospex-cyan" />
                          ) : (
                            <>
                              {lead.outreach_status !== 'responded' && lead.outreach_status !== 'booked' && lead.outreach_status !== 'closed_won' && lead.outreach_status !== 'closed_lost' && (
                                <>
                                  <button onClick={() => logOutreach(lead.id, 'follow_up')} title="Log follow-up sent"
                                    className="text-[9px] px-1.5 py-1 bg-amber-500/10 text-amber-400 rounded hover:bg-amber-500/20">
                                    📤 FU
                                  </button>
                                  <button onClick={() => markResponded(lead.id, 'positive')} title="Mark as responded (positive)"
                                    className="text-[9px] px-1.5 py-1 bg-green-500/10 text-green-400 rounded hover:bg-green-500/20">
                                    💬 +
                                  </button>
                                  <button onClick={() => markResponded(lead.id, 'objection')} title="Mark as responded (objection)"
                                    className="text-[9px] px-1.5 py-1 bg-orange-500/10 text-orange-400 rounded hover:bg-orange-500/20">
                                    💬 ?
                                  </button>
                                </>
                              )}
                              {lead.outreach_status === 'responded' && (
                                <button onClick={() => updateStatus(lead.id, 'booked')} title="Mark as booked"
                                  className="text-[9px] px-1.5 py-1 bg-cyan-500/10 text-cyan-400 rounded hover:bg-cyan-500/20">
                                  📅 Book
                                </button>
                              )}
                              {lead.outreach_status !== 'closed_lost' && lead.outreach_status !== 'closed_won' && (
                                <button onClick={() => updateStatus(lead.id, 'closed_lost')} title="Mark as lost"
                                  className="text-[9px] px-1.5 py-1 bg-red-500/10 text-red-400 rounded hover:bg-red-500/20">
                                  ✕
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Empty State */}
      {filteredLeads.length === 0 && !loading && (
        <div className="card p-8 text-center">
          <Send className="w-10 h-10 text-prospex-dim mx-auto mb-3" />
          <p className="text-sm text-prospex-dim font-mono">No outreach tracked yet</p>
          <p className="text-xs text-prospex-dim mt-1">When you send DMs from the Lead Database, they will appear here with full pipeline tracking</p>
        </div>
      )}
    </div>
  );
}
