'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { BarChart3, TrendingUp, Send, MessageSquare, Phone, CheckCircle, DollarSign, UserCheck, XCircle, Ghost, Plus, Filter, ArrowRight, Calendar, Zap, Target, Users, ChevronDown, ChevronUp, Clock, Sparkles, AlertTriangle } from 'lucide-react';

// ─── TYPES ──────────────────────────────────────────────────
interface OutreachLog {
 id: string;
 created_at: string;
 lead_name: string;
 lead_business: string;
 niche: string;
 channel: string;
 stage: string;
 outcome: string;
 revenue: number;
 notes: string;
 template_used: string;
}

interface Metrics {
 totals: {
  total: number; sent: number; replied: number; positiveReplies: number;
  booked: number; showed: number; closed: number; lost: number;
  ghosted: number; notInterested: number; totalRevenue: number;
 };
 rates: {
  replyRate: number; positiveReplyRate: number; bookingRate: number;
  showRate: number; closeRate: number; overallConversion: number;
 };
 byChannel: Record<string, { sent: number; replied: number; booked: number; closed: number }>;
 byNiche: Record<string, { sent: number; replied: number; booked: number; closed: number }>;
 byStage: Record<string, { sent: number; replied: number; booked: number }>;
 byTemplate: Record<string, { sent: number; replied: number; booked: number }>;
 dailyTrend: { date: string; sent: number; replied: number; booked: number; closed: number }[];
}

type Period = '7d' | '14d' | '30d' | '90d' | 'all';

const LS_KEY = 'prospex_outreach_logs';

// ─── LOCAL STORAGE FALLBACK ─────────────────────────────────
function getLocalLogs(): OutreachLog[] {
 if (typeof window === 'undefined') return [];
 try {
  return JSON.parse(localStorage.getItem(LS_KEY) || '[]');
 } catch { return []; }
}

function saveLocalLogs(logs: OutreachLog[]) {
 if (typeof window === 'undefined') return;
 localStorage.setItem(LS_KEY, JSON.stringify(logs));
}

function calculateLocalMetrics(logs: OutreachLog[]): Metrics {
 const total = logs.length;
 const replyOutcomes = ['replied', 'positive_reply', 'objection', 'booked', 'showed', 'closed'];
 const positiveOutcomes = ['positive_reply', 'booked', 'showed', 'closed'];
 const bookedOutcomes = ['booked', 'showed', 'closed'];
 const showedOutcomes = ['showed', 'closed'];

 const sent = logs.filter(l => l.outcome !== 'lost').length;
 const replied = logs.filter(l => replyOutcomes.includes(l.outcome)).length;
 const positiveReplies = logs.filter(l => positiveOutcomes.includes(l.outcome)).length;
 const booked = logs.filter(l => bookedOutcomes.includes(l.outcome)).length;
 const showed = logs.filter(l => showedOutcomes.includes(l.outcome)).length;
 const closed = logs.filter(l => l.outcome === 'closed').length;
 const lost = logs.filter(l => l.outcome === 'lost').length;
 const ghosted = logs.filter(l => l.outcome === 'ghosted').length;
 const notInterested = logs.filter(l => l.outcome === 'not_interested').length;
 const totalRevenue = logs.reduce((s, l) => s + (l.revenue || 0), 0);

 const byChannel: Metrics['byChannel'] = {};
 const byNiche: Metrics['byNiche'] = {};
 const byStage: Metrics['byStage'] = {};
 const byTemplate: Metrics['byTemplate'] = {};

 for (const log of logs) {
  // Channel
  if (!byChannel[log.channel]) byChannel[log.channel] = { sent: 0, replied: 0, booked: 0, closed: 0 };
  byChannel[log.channel].sent++;
  if (replyOutcomes.includes(log.outcome)) byChannel[log.channel].replied++;
  if (bookedOutcomes.includes(log.outcome)) byChannel[log.channel].booked++;
  if (log.outcome === 'closed') byChannel[log.channel].closed++;

  // Niche
  const n = log.niche || 'other';
  if (!byNiche[n]) byNiche[n] = { sent: 0, replied: 0, booked: 0, closed: 0 };
  byNiche[n].sent++;
  if (replyOutcomes.includes(log.outcome)) byNiche[n].replied++;
  if (bookedOutcomes.includes(log.outcome)) byNiche[n].booked++;
  if (log.outcome === 'closed') byNiche[n].closed++;

  // Stage
  if (!byStage[log.stage]) byStage[log.stage] = { sent: 0, replied: 0, booked: 0 };
  byStage[log.stage].sent++;
  if (replyOutcomes.includes(log.outcome)) byStage[log.stage].replied++;
  if (bookedOutcomes.includes(log.outcome)) byStage[log.stage].booked++;

  // Template
  const t = log.template_used || 'Custom';
  if (!byTemplate[t]) byTemplate[t] = { sent: 0, replied: 0, booked: 0 };
  byTemplate[t].sent++;
  if (replyOutcomes.includes(log.outcome)) byTemplate[t].replied++;
  if (bookedOutcomes.includes(log.outcome)) byTemplate[t].booked++;
 }

 // Daily trend
 const dailyMap: Record<string, { sent: number; replied: number; booked: number; closed: number }> = {};
 for (let i = 29; i >= 0; i--) {
  const d = new Date(Date.now() - i * 86400000).toISOString().split('T')[0];
  dailyMap[d] = { sent: 0, replied: 0, booked: 0, closed: 0 };
 }
 for (const log of logs) {
  const day = (log.created_at || '').split('T')[0];
  if (dailyMap[day]) {
   dailyMap[day].sent++;
   if (replyOutcomes.includes(log.outcome)) dailyMap[day].replied++;
   if (bookedOutcomes.includes(log.outcome)) dailyMap[day].booked++;
   if (log.outcome === 'closed') dailyMap[day].closed++;
  }
 }

 return {
  totals: { total, sent, replied, positiveReplies, booked, showed, closed, lost, ghosted, notInterested, totalRevenue },
  rates: {
   replyRate: sent > 0 ? (replied / sent) * 100 : 0,
   positiveReplyRate: sent > 0 ? (positiveReplies / sent) * 100 : 0,
   bookingRate: sent > 0 ? (booked / sent) * 100 : 0,
   showRate: booked > 0 ? (showed / booked) * 100 : 0,
   closeRate: showed > 0 ? (closed / showed) * 100 : 0,
   overallConversion: sent > 0 ? (closed / sent) * 100 : 0,
  },
  byChannel, byNiche, byStage, byTemplate,
  dailyTrend: Object.entries(dailyMap).map(([date, data]) => ({ date, ...data })),
 };
}

// ─── MINI BAR CHART ─────────────────────────────────────────
function MiniBar({ data, maxVal, color }: { data: number[]; maxVal: number; color: string }) {
 return (
  <div className="flex items-end gap-[2px] h-12">
   {data.map((v, i) => (
    <div key={i} className="flex-1 min-w-[3px] rounded-t-sm transition-all duration-300" style={{
     height: `${maxVal > 0 ? Math.max((v / maxVal) * 100, v > 0 ? 8 : 0) : 0}%`,
     backgroundColor: color,
     opacity: v > 0 ? 1 : 0.15,
    }} />
   ))}
  </div>
 );
}

// ─── FUNNEL STEP ────────────────────────────────────────────
function FunnelStep({ label, count, rate, color, width, icon }: { label: string; count: number; rate: string; color: string; width: string; icon: React.ReactNode }) {
 return (
  <div className="flex flex-col items-center">
   <div className={`${color} rounded-lg flex items-center justify-center gap-2 py-3 transition-all duration-500`} style={{ width }}>
    {icon}
    <span className="text-sm font-bold text-white">{count}</span>
   </div>
   <p className="text-[10px] text-prospex-muted mt-1">{label}</p>
   <p className="text-[10px] font-medium text-white">{rate}</p>
  </div>
 );
}

// ─── MAIN PAGE ──────────────────────────────────────────────
export default function OutreachAnalyticsPage() {
 const [logs, setLogs] = useState<OutreachLog[]>([]);
 const [metrics, setMetrics] = useState<Metrics | null>(null);
 const [period, setPeriod] = useState<Period>('30d');
 const [showLogForm, setShowLogForm] = useState(false);
 const [showRecentLogs, setShowRecentLogs] = useState(false);
 const [loading, setLoading] = useState(true);

 // Log form state
 const [formData, setFormData] = useState({
  lead_name: '', lead_business: '', niche: 'med-spa', channel: 'whatsapp',
  stage: 'cold_open', outcome: 'sent', revenue: 0, notes: '', template_used: '',
 });

 // Load data
 const loadData = useCallback(async () => {
  setLoading(true);
  try {
   const res = await fetch(`/api/outreach-logs?action=metrics&period=${period}`);
   const data = await res.json();

   if (data.fallback || data.error) {
    // Use localStorage
    const localLogs = getLocalLogs();
    const days: Record<Period, number> = { '7d': 7, '14d': 14, '30d': 30, '90d': 90, 'all': 9999 };
    const cutoff = Date.now() - (days[period] || 30) * 86400000;
    const filtered = localLogs.filter(l => new Date(l.created_at).getTime() >= cutoff);
    setLogs(filtered);
    setMetrics(calculateLocalMetrics(filtered));
   } else {
    setLogs(data.logs || []);
    setMetrics(data.metrics || calculateLocalMetrics(data.logs || []));
   }
  } catch {
   const localLogs = getLocalLogs();
   setLogs(localLogs);
   setMetrics(calculateLocalMetrics(localLogs));
  } finally {
   setLoading(false);
  }
 }, [period]);

 useEffect(() => { loadData(); }, [loadData]);

 // Log activity
 const handleLog = useCallback(async () => {
  if (!formData.lead_name.trim()) return;

  const newLog: OutreachLog = {
   id: crypto.randomUUID(),
   created_at: new Date().toISOString(),
   lead_name: formData.lead_name,
   lead_business: formData.lead_business,
   niche: formData.niche,
   channel: formData.channel,
   stage: formData.stage,
   outcome: formData.outcome,
   revenue: formData.revenue,
   notes: formData.notes,
   template_used: formData.template_used,
  };

  try {
   const res = await fetch('/api/outreach-logs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(newLog),
   });
   const data = await res.json();
   if (data.log) newLog.id = data.log.id;
  } catch { /* localStorage fallback */ }

  // Always save locally too
  const localLogs = getLocalLogs();
  localLogs.unshift(newLog);
  saveLocalLogs(localLogs);

  setFormData({ lead_name: '', lead_business: '', niche: 'med-spa', channel: 'whatsapp', stage: 'cold_open', outcome: 'sent', revenue: 0, notes: '', template_used: '' });
  setShowLogForm(false);
  loadData();
 }, [formData, loadData]);

 // Update outcome
 const handleUpdateOutcome = useCallback(async (logId: string, newOutcome: string, revenue?: number) => {
  try {
   await fetch('/api/outreach-logs', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: logId, outcome: newOutcome, revenue }),
   });
  } catch { /* fallback */ }

  const localLogs = getLocalLogs();
  const idx = localLogs.findIndex(l => l.id === logId);
  if (idx !== -1) {
   localLogs[idx].outcome = newOutcome;
   if (revenue !== undefined) localLogs[idx].revenue = revenue;
   saveLocalLogs(localLogs);
  }
  loadData();
 }, [loadData]);

 const m = metrics;
 const trendSent = m?.dailyTrend.map(d => d.sent) || [];
 const trendReplied = m?.dailyTrend.map(d => d.replied) || [];
 const trendBooked = m?.dailyTrend.map(d => d.booked) || [];
 const maxTrend = Math.max(...trendSent, 1);

 const outcomeColors: Record<string, string> = {
  sent: 'bg-blue-500/20 text-blue-400', replied: 'bg-cyan-500/20 text-cyan-400',
  positive_reply: 'bg-teal-500/20 text-teal-400', objection: 'bg-orange-500/20 text-orange-400',
  booked: 'bg-green-500/20 text-green-400', showed: 'bg-emerald-500/20 text-emerald-400',
  closed: 'bg-yellow-500/20 text-yellow-400', lost: 'bg-red-500/20 text-red-400',
  ghosted: 'bg-gray-500/20 text-gray-400', not_interested: 'bg-red-500/20 text-red-400',
 };

 const outcomeLabels: Record<string, string> = {
  sent: 'Sent', replied: 'Replied', positive_reply: 'Positive Reply', objection: 'Objection',
  booked: 'Booked', showed: 'Showed Up', closed: 'Closed Won', lost: 'Lost',
  ghosted: 'Ghosted', not_interested: 'Not Interested',
 };

 const channelIcons: Record<string, string> = {
  whatsapp: '💬', instagram: '📸', email: '✉️', linkedin: '💼', other: '📱',
 };

 if (loading && !m) {
  return (
   <div className="min-h-screen p-6 flex items-center justify-center">
    <div className="w-8 h-8 border-2 border-prospex-cyan border-t-transparent rounded-full animate-spin" />
   </div>
  );
 }

 return (
  <div className="min-h-screen p-6 max-w-7xl mx-auto">
   {/* Header */}
   <div className="flex items-center justify-between mb-6">
    <div>
     <h1 className="text-2xl font-bold text-white flex items-center gap-2">
      <TrendingUp className="w-6 h-6 text-prospex-cyan" />
      Outreach Analytics
     </h1>
     <p className="text-sm text-prospex-muted mt-1">Track every message, reply, booking, and deal. Know your numbers.</p>
    </div>
    <div className="flex items-center gap-3">
     <div className="flex bg-prospex-surface border border-prospex-border rounded-lg overflow-hidden">
      {(['7d', '14d', '30d', '90d', 'all'] as Period[]).map(p => (
       <button key={p} onClick={() => setPeriod(p)} className={`px-3 py-1.5 text-xs font-semibold transition-colors ${period === p ? 'bg-prospex-cyan text-white ' : 'text-prospex-muted hover:text-white'}`}>
        {p === 'all' ? 'All' : p}
       </button>
      ))}
     </div>
     <button onClick={() => setShowLogForm(!showLogForm)} className="px-4 py-2 bg-prospex-cyan text-white font-semibold text-sm rounded-lg hover:bg-prospex-cyan/80 transition-colors flex items-center gap-1.5">
      <Plus className="w-4 h-4" /> Log Activity
     </button>
    </div>
   </div>

   {/* Log Form */}
   {showLogForm && (
    <div className="bg-prospex-surface border border-prospex-cyan/30 rounded-lg p-4 mb-6">
     <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2"><Plus className="w-4 h-4 text-prospex-cyan" /> Log Outreach Activity</h3>
     <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
      <input type="text" value={formData.lead_name} onChange={e => setFormData(p => ({ ...p, lead_name: e.target.value }))} placeholder="Lead name *" className="px-3 py-2 bg-prospex-bg border border-prospex-border rounded-lg text-white text-sm placeholder:text-prospex-muted focus:outline-none focus:border-prospex-cyan" />
      <input type="text" value={formData.lead_business} onChange={e => setFormData(p => ({ ...p, lead_business: e.target.value }))} placeholder="Business name" className="px-3 py-2 bg-prospex-bg border border-prospex-border rounded-lg text-white text-sm placeholder:text-prospex-muted focus:outline-none focus:border-prospex-cyan" />
      <select value={formData.niche} onChange={e => setFormData(p => ({ ...p, niche: e.target.value }))} className="px-3 py-2 bg-prospex-bg border border-prospex-border rounded-lg text-white text-sm focus:outline-none focus:border-prospex-cyan">
       <option value="med-spa">Med Spa</option><option value="dental">Dental</option><option value="beauty">Beauty/Hair</option><option value="local">Local Business</option><option value="other">Other</option>
      </select>
      <select value={formData.channel} onChange={e => setFormData(p => ({ ...p, channel: e.target.value }))} className="px-3 py-2 bg-prospex-bg border border-prospex-border rounded-lg text-white text-sm focus:outline-none focus:border-prospex-cyan">
       <option value="whatsapp">💬 WhatsApp</option><option value="instagram">📸 Instagram DM</option><option value="email">✉️ Email</option><option value="linkedin">💼 LinkedIn</option>
      </select>
     </div>
     <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
      <select value={formData.stage} onChange={e => setFormData(p => ({ ...p, stage: e.target.value }))} className="px-3 py-2 bg-prospex-bg border border-prospex-border rounded-lg text-white text-sm focus:outline-none focus:border-prospex-cyan">
       <option value="cold_open">Cold Open</option><option value="follow_up_1">Follow-Up #1</option><option value="follow_up_2">Follow-Up #2</option><option value="follow_up_3">Follow-Up #3</option><option value="objection">Objection Handle</option><option value="booking">Booking</option><option value="reactivation">Reactivation</option>
      </select>
      <select value={formData.outcome} onChange={e => setFormData(p => ({ ...p, outcome: e.target.value }))} className="px-3 py-2 bg-prospex-bg border border-prospex-border rounded-lg text-white text-sm focus:outline-none focus:border-prospex-cyan">
       <option value="sent">📤 Sent</option><option value="replied">💬 Replied</option><option value="positive_reply">✅ Positive Reply</option><option value="objection">⚠️ Objection</option><option value="booked">📅 Booked</option><option value="showed">👤 Showed Up</option><option value="closed">🎉 Closed Won</option><option value="lost">❌ Lost</option><option value="ghosted">👻 Ghosted</option><option value="not_interested">🚫 Not Interested</option>
      </select>
      <input type="number" value={formData.revenue || ''} onChange={e => setFormData(p => ({ ...p, revenue: parseFloat(e.target.value) || 0 }))} placeholder="Revenue (£)" className="px-3 py-2 bg-prospex-bg border border-prospex-border rounded-lg text-white text-sm placeholder:text-prospex-muted focus:outline-none focus:border-prospex-cyan" />
      <input type="text" value={formData.template_used} onChange={e => setFormData(p => ({ ...p, template_used: e.target.value }))} placeholder="Template used (optional)" className="px-3 py-2 bg-prospex-bg border border-prospex-border rounded-lg text-white text-sm placeholder:text-prospex-muted focus:outline-none focus:border-prospex-cyan" />
     </div>
     <div className="flex items-center gap-3">
      <input type="text" value={formData.notes} onChange={e => setFormData(p => ({ ...p, notes: e.target.value }))} placeholder="Notes (optional)" className="flex-1 px-3 py-2 bg-prospex-bg border border-prospex-border rounded-lg text-white text-sm placeholder:text-prospex-muted focus:outline-none focus:border-prospex-cyan" />
      <button onClick={handleLog} disabled={!formData.lead_name.trim()} className="px-6 py-2 bg-prospex-cyan text-white font-semibold text-sm rounded-lg hover:bg-prospex-cyan/80 disabled:opacity-50 transition-colors">Save</button>
      <button onClick={() => setShowLogForm(false)} className="px-4 py-2 text-sm text-prospex-muted hover:text-white transition-colors">Cancel</button>
     </div>
    </div>
   )}

   {m && (
    <>
     {/* KPI Cards */}
     <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
      {[
       { label: 'Messages Sent', value: m.totals.sent, icon: <Send className="w-4 h-4" />, color: 'text-blue-400', trend: trendSent, trendColor: '#60a5fa' },
       { label: 'Replies', value: m.totals.replied, icon: <MessageSquare className="w-4 h-4" />, color: 'text-cyan-400', sub: `${m.rates.replyRate.toFixed(1)}%`, trend: trendReplied, trendColor: '#22d3ee' },
       { label: 'Positive Replies', value: m.totals.positiveReplies, icon: <CheckCircle className="w-4 h-4" />, color: 'text-teal-400', sub: `${m.rates.positiveReplyRate.toFixed(1)}%` },
       { label: 'Calls Booked', value: m.totals.booked, icon: <Phone className="w-4 h-4" />, color: 'text-green-400', sub: `${m.rates.bookingRate.toFixed(1)}%`, trend: trendBooked, trendColor: '#4ade80' },
       { label: 'Deals Closed', value: m.totals.closed, icon: <Target className="w-4 h-4" />, color: 'text-yellow-400', sub: `${m.rates.overallConversion.toFixed(1)}%` },
       { label: 'Revenue', value: `£${m.totals.totalRevenue.toLocaleString()}`, icon: <DollarSign className="w-4 h-4" />, color: 'text-emerald-400' },
      ].map((kpi, i) => (
       <div key={i} className="bg-prospex-surface border border-prospex-border rounded-lg p-4">
        <div className="flex items-center gap-1.5 mb-2">
         <span className={kpi.color}>{kpi.icon}</span>
         <span className="text-[10px] text-prospex-muted uppercase">{kpi.label}</span>
        </div>
        <p className="text-2xl font-bold text-white">{kpi.value}</p>
        {kpi.sub && <p className="text-xs text-prospex-muted mt-0.5">conversion: {kpi.sub}</p>}
        {kpi.trend && <div className="mt-2"><MiniBar data={kpi.trend} maxVal={maxTrend} color={kpi.trendColor || '#888'} /></div>}
       </div>
      ))}
     </div>

     {/* Conversion Funnel */}
     <div className="bg-prospex-surface border border-prospex-border rounded-lg p-4 mb-6">
      <h2 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
       <Zap className="w-4 h-4 text-prospex-cyan" /> Conversion Funnel
      </h2>
      <div className="flex items-end justify-between gap-2 px-4 overflow-x-auto min-w-full"><div className="flex items-end justify-between gap-2 min-w-[560px] md:min-w-0 md:w-full">
       <FunnelStep label="Sent" count={m.totals.sent} rate="100%" color="bg-blue-500" width="100%" icon={<Send className="w-4 h-4 text-white" />} />
       <ArrowRight className="w-4 h-4 text-prospex-muted shrink-0 mb-8" />
       <FunnelStep label="Replied" count={m.totals.replied} rate={`${m.rates.replyRate.toFixed(1)}%`} color="bg-cyan-500" width={`${Math.max(m.rates.replyRate * 2.5, 30)}%`} icon={<MessageSquare className="w-4 h-4 text-white" />} />
       <ArrowRight className="w-4 h-4 text-prospex-muted shrink-0 mb-8" />
       <FunnelStep label="Booked" count={m.totals.booked} rate={`${m.rates.bookingRate.toFixed(1)}%`} color="bg-green-500" width={`${Math.max(m.rates.bookingRate * 4, 25)}%`} icon={<Phone className="w-4 h-4 text-white" />} />
       <ArrowRight className="w-4 h-4 text-prospex-muted shrink-0 mb-8" />
       <FunnelStep label="Showed" count={m.totals.showed} rate={`${m.rates.showRate.toFixed(1)}%`} color="bg-emerald-500" width={`${Math.max((m.totals.showed / Math.max(m.totals.sent, 1)) * 250, 20)}%`} icon={<UserCheck className="w-4 h-4 text-white" />} />
       <ArrowRight className="w-4 h-4 text-prospex-muted shrink-0 mb-8" />
       <FunnelStep label="Closed" count={m.totals.closed} rate={`${m.rates.overallConversion.toFixed(1)}%`} color="bg-yellow-500" width={`${Math.max(m.rates.overallConversion * 5, 18)}%`} icon={<Target className="w-4 h-4 text-white" />} />
      </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 mt-4 pt-3 border-t border-prospex-border text-[10px] text-prospex-muted">
       <span>Show Rate: {m.rates.showRate.toFixed(0)}%</span>
       <span>Close Rate: {m.rates.closeRate.toFixed(0)}%</span>
       <span>Lost: {m.totals.lost} · Ghosted: {m.totals.ghosted} · Not Interested: {m.totals.notInterested}</span>
      </div>
     </div>

     {/* Daily Activity Chart */}
     <div className="bg-prospex-surface border border-prospex-border rounded-lg p-4 mb-6">
      <h2 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
       <Calendar className="w-4 h-4 text-prospex-cyan" /> Daily Activity (Last 30 Days)
      </h2>
      <div className="flex items-end gap-[3px] h-32">
       {m.dailyTrend.map((d, i) => {
        const maxD = Math.max(...m.dailyTrend.map(x => x.sent), 1);
        return (
         <div key={i} className="flex-1 flex flex-col items-stretch gap-[1px]" title={`${d.date}: ${d.sent} sent, ${d.replied} replied, ${d.booked} booked`}>
          <div className="bg-blue-400 rounded-t-sm transition-all" style={{ height: `${(d.sent / maxD) * 100}%`, minHeight: d.sent > 0 ? '3px' : '0' }} />
          <div className="bg-cyan-400 rounded-sm transition-all" style={{ height: `${(d.replied / maxD) * 100}%`, minHeight: d.replied > 0 ? '3px' : '0' }} />
          <div className="bg-green-400 rounded-b-sm transition-all" style={{ height: `${(d.booked / maxD) * 100}%`, minHeight: d.booked > 0 ? '3px' : '0' }} />
         </div>
        );
       })}
      </div>
      <div className="flex items-center gap-4 mt-3 pt-2 border-t border-prospex-border">
       <span className="flex items-center gap-1.5 text-[10px] text-prospex-muted"><span className="w-2 h-2 rounded-sm bg-blue-400" /> Sent</span>
       <span className="flex items-center gap-1.5 text-[10px] text-prospex-muted"><span className="w-2 h-2 rounded-sm bg-cyan-400" /> Replied</span>
       <span className="flex items-center gap-1.5 text-[10px] text-prospex-muted"><span className="w-2 h-2 rounded-sm bg-green-400" /> Booked</span>
      </div>
     </div>

     {/* Breakdowns row */}
     <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
      {/* Channel Performance */}
      <div className="bg-prospex-surface border border-prospex-border rounded-lg p-4">
       <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2"><Users className="w-4 h-4 text-prospex-cyan" /> By Channel</h3>
       <div className="space-y-2">
        {Object.entries(m.byChannel).sort((a, b) => b[1].sent - a[1].sent).map(([ch, data]) => (
         <div key={ch} className="flex items-center justify-between p-2 rounded bg-prospex-bg">
          <span className="text-xs text-white flex items-center gap-1.5">{channelIcons[ch] || '📱'} {ch}</span>
          <div className="flex items-center gap-3 text-[10px]">
           <span className="text-blue-400">{data.sent} sent</span>
           <span className="text-cyan-400">{data.replied} replied</span>
           <span className="text-green-400">{data.booked} booked</span>
           <span className="text-yellow-400">{data.closed} closed</span>
           <span className="text-prospex-muted">{data.sent > 0 ? ((data.replied / data.sent) * 100).toFixed(0) : 0}% RR</span>
          </div>
         </div>
        ))}
        {Object.keys(m.byChannel).length === 0 && <p className="text-xs text-prospex-muted text-center py-2">No data yet</p>}
       </div>
      </div>

      {/* Niche Performance */}
      <div className="bg-prospex-surface border border-prospex-border rounded-lg p-4">
       <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2"><Target className="w-4 h-4 text-prospex-cyan" /> By Niche</h3>
       <div className="space-y-2">
        {Object.entries(m.byNiche).sort((a, b) => b[1].sent - a[1].sent).map(([niche, data]) => (
         <div key={niche} className="flex items-center justify-between p-2 rounded bg-prospex-bg">
          <span className="text-xs text-white capitalize">{niche.replace('-', ' ')}</span>
          <div className="flex items-center gap-3 text-[10px]">
           <span className="text-blue-400">{data.sent} sent</span>
           <span className="text-cyan-400">{data.replied} replied</span>
           <span className="text-green-400">{data.booked} booked</span>
           <span className="text-prospex-muted">{data.sent > 0 ? ((data.replied / data.sent) * 100).toFixed(0) : 0}% RR</span>
          </div>
         </div>
        ))}
        {Object.keys(m.byNiche).length === 0 && <p className="text-xs text-prospex-muted text-center py-2">No data yet</p>}
       </div>
      </div>

      {/* Stage Performance */}
      <div className="bg-prospex-surface border border-prospex-border rounded-lg p-4">
       <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2"><BarChart3 className="w-4 h-4 text-prospex-cyan" /> By Stage</h3>
       <div className="space-y-2">
        {Object.entries(m.byStage).sort((a, b) => b[1].sent - a[1].sent).map(([stage, data]) => (
         <div key={stage} className="flex items-center justify-between p-2 rounded bg-prospex-bg">
          <span className="text-xs text-white capitalize">{stage.replace(/_/g, ' ')}</span>
          <div className="flex items-center gap-3 text-[10px]">
           <span className="text-blue-400">{data.sent} sent</span>
           <span className="text-cyan-400">{data.replied} replied</span>
           <span className="text-green-400">{data.booked} booked</span>
           <span className="text-prospex-muted">{data.sent > 0 ? ((data.replied / data.sent) * 100).toFixed(0) : 0}% RR</span>
          </div>
         </div>
        ))}
        {Object.keys(m.byStage).length === 0 && <p className="text-xs text-prospex-muted text-center py-2">No data yet</p>}
       </div>
      </div>
     </div>

     {/* Template Performance */}
     {Object.keys(m.byTemplate).length > 0 && (
      <div className="bg-prospex-surface border border-prospex-border rounded-lg p-4 mb-6">
       <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2"><Sparkles className="w-4 h-4 text-prospex-cyan" /> Template Performance</h3>
       <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
        {Object.entries(m.byTemplate).sort((a, b) => {
         const aRate = a[1].sent > 0 ? a[1].replied / a[1].sent : 0;
         const bRate = b[1].sent > 0 ? b[1].replied / b[1].sent : 0;
         return bRate - aRate;
        }).map(([name, data]) => {
         const rr = data.sent > 0 ? ((data.replied / data.sent) * 100).toFixed(0) : '0';
         return (
          <div key={name} className="flex items-center justify-between p-2.5 rounded bg-prospex-bg">
           <span className="text-xs text-white truncate flex-1">{name}</span>
           <div className="flex items-center gap-2 text-[10px] shrink-0 ml-2">
            <span className="text-blue-400">{data.sent}</span>
            <span className="text-cyan-400">{data.replied}</span>
            <span className="text-green-400">{data.booked}</span>
            <span className="font-medium text-white">{rr}%</span>
           </div>
          </div>
         );
        })}
       </div>
      </div>
     )}

     {/* Recent Activity */}
     <div className="bg-prospex-surface border border-prospex-border rounded-lg overflow-hidden">
      <button onClick={() => setShowRecentLogs(!showRecentLogs)} className="w-full flex items-center justify-between p-4">
       <h3 className="text-sm font-semibold text-white flex items-center gap-2"><Clock className="w-4 h-4 text-prospex-cyan" /> Recent Activity ({logs.length} logs)</h3>
       {showRecentLogs ? <ChevronUp className="w-4 h-4 text-prospex-muted" /> : <ChevronDown className="w-4 h-4 text-prospex-muted" />}
      </button>

      {showRecentLogs && (
       <div className="border-t border-prospex-border max-h-[400px] overflow-y-auto">
        {logs.slice(0, 50).map(log => (
         <div key={log.id} className="flex items-center justify-between px-4 py-2.5 border-b border-prospex-border/50 hover:bg-prospex-bg/50 transition-colors">
          <div className="flex items-center gap-3 flex-1 min-w-0">
           <span className="text-sm shrink-0">{channelIcons[log.channel] || '📱'}</span>
           <div className="min-w-0">
            <p className="text-xs text-white truncate">{log.lead_name}{log.lead_business ? ` — ${log.lead_business}` : ''}</p>
            <p className="text-[10px] text-prospex-muted capitalize">{log.stage.replace(/_/g, ' ')} · {log.niche?.replace('-', ' ')}</p>
           </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 ml-3">
           <select
            value={log.outcome}
            onChange={e => handleUpdateOutcome(log.id, e.target.value)}
            className={`px-2 py-0.5 rounded text-[10px] font-medium border-0 focus:outline-none cursor-pointer ${outcomeColors[log.outcome] || 'bg-gray-500/20 text-gray-400'}`}
           >
            {Object.entries(outcomeLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
           </select>
           {log.revenue > 0 && <span className="text-[10px] text-emerald-400 font-medium">£{log.revenue.toLocaleString()}</span>}
           <span className="text-[10px] text-prospex-muted">{new Date(log.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
          </div>
         </div>
        ))}
        {logs.length === 0 && (
         <div className="p-8 text-center">
          <p className="text-sm text-prospex-muted">No outreach logged yet. Click &quot;Log Activity&quot; to start tracking.</p>
         </div>
        )}
       </div>
      )}
     </div>

     {/* Benchmarks */}
     <div className="mt-6 bg-prospex-surface border border-prospex-border rounded-lg p-4">
      <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-yellow-400" /> Industry Benchmarks</h3>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
       {[
        { label: 'Reply Rate', yours: m.rates.replyRate, benchmark: 15, unit: '%' },
        { label: 'Positive Reply', yours: m.rates.positiveReplyRate, benchmark: 8, unit: '%' },
        { label: 'Booking Rate', yours: m.rates.bookingRate, benchmark: 5, unit: '%' },
        { label: 'Show Rate', yours: m.rates.showRate, benchmark: 80, unit: '%' },
        { label: 'Close Rate', yours: m.rates.closeRate, benchmark: 30, unit: '%' },
       ].map(b => {
        const isAbove = b.yours >= b.benchmark;
        return (
         <div key={b.label} className="p-3 rounded-lg bg-prospex-bg text-center">
          <p className="text-[10px] text-prospex-muted mb-1">{b.label}</p>
          <p className={`text-lg font-bold ${isAbove ? 'text-green-400' : m.totals.sent > 0 ? 'text-red-400' : 'text-prospex-muted'}`}>{b.yours.toFixed(1)}{b.unit}</p>
          <p className="text-[10px] text-prospex-muted">benchmark: {b.benchmark}{b.unit}</p>
          {m.totals.sent > 0 && (
           <p className={`text-[10px] font-medium mt-0.5 ${isAbove ? 'text-green-400' : 'text-red-400'}`}>
            {isAbove ? '↑ Above' : '↓ Below'}
           </p>
          )}
         </div>
        );
       })}
      </div>
     </div>
    </>
   )}

   {/* Empty state */}
   {(!m || m.totals.total === 0) && !loading && (
    <div className="text-center py-16">
     <TrendingUp className="w-16 h-16 text-prospex-cyan/20 mx-auto mb-4" />
     <h3 className="text-lg font-semibold text-white mb-2">Start Tracking Your Outreach</h3>
     <p className="text-sm text-prospex-muted max-w-md mx-auto mb-4">Click &quot;Log Activity&quot; to record each message you send. As you log replies, bookings, and closes, your analytics will populate automatically.</p>
     <button onClick={() => setShowLogForm(true)} className="px-6 py-2.5 bg-prospex-cyan text-white font-semibold rounded-lg hover:bg-prospex-cyan/80 transition-colors">
      <Plus className="w-4 h-4 inline mr-1.5" /> Log Your First Activity
     </button>
    </div>
   )}
  </div>
 );
}
