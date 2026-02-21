'use client';

import { useState, useEffect, useCallback } from 'react';
import { History, Search, Download, Database, ChevronDown, ChevronUp, Check, Clock, AlertCircle, Trash2, RefreshCw, Filter, Save, ExternalLink, MessageCircle, Instagram } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { cn, formatRelativeTime } from '@/lib/utils';

// ─── TYPES ──────────────────────────────────────────────────
interface ScrapeLogEntry {
 id: string;
 scrape_id: string;
 created_at: string;
 niche: string;
 location: string;
 country: string;
 source: string;
 status: 'started' | 'partial' | 'complete' | 'error';
 total_found: number;
 total_saved: number;
 error_message: string | null;
 leads: ScrapeLogLead[];
}

interface ScrapeLogLead {
 business_name: string;
 address: string | null;
 city: string | null;
 phone: string | null;
 email: string | null;
 website: string | null;
 instagram_url: string | null;
 google_rating: number | null;
 google_review_count: number | null;
 google_maps_url: string | null;
 source: string;
 saved_to_db: boolean;
}

interface ScrapeSession {
 scrape_id: string;
 created_at: string;
 niche: string;
 location: string;
 country: string;
 source: string;
 status: string;
 total_found: number;
 total_saved: number;
 error_message: string | null;
 leads: ScrapeLogLead[];
}

const LS_KEY = 'prospex_scrape_log';

// ─── HELPERS ────────────────────────────────────────────────
function getStoredLog(): ScrapeSession[] {
 try {
  const raw = localStorage.getItem(LS_KEY);
  if (!raw) return [];
  return JSON.parse(raw);
 } catch { return []; }
}

function saveLog(sessions: ScrapeSession[]) {
 // Keep last 100 sessions max
 const trimmed = sessions.slice(0, 100);
 localStorage.setItem(LS_KEY, JSON.stringify(trimmed));
}

// ─── MAIN PAGE ──────────────────────────────────────────────
export default function ScrapeHistoryPage() {
 const [sessions, setSessions] = useState<ScrapeSession[]>([]);
 const [expandedSession, setExpandedSession] = useState<string | null>(null);
 const [searchQuery, setSearchQuery] = useState('');
 const [statusFilter, setStatusFilter] = useState<string>('all');
 const [savingLeads, setSavingLeads] = useState<Set<string>>(new Set());
 const [savedLeads, setSavedLeads] = useState<Set<string>>(new Set());
 const [bulkSaving, setBulkSaving] = useState(false);

 // Load from localStorage
 useEffect(() => {
  const stored = getStoredLog();
  setSessions(stored);
 }, []);

 // Filter sessions
 const filtered = sessions.filter(s => {
  if (searchQuery) {
   const q = searchQuery.toLowerCase();
   if (!s.niche.toLowerCase().includes(q) && !s.location.toLowerCase().includes(q) && !s.country.toLowerCase().includes(q)) return false;
  }
  if (statusFilter !== 'all' && s.status !== statusFilter) return false;
  return true;
 });

 // Stats
 const totalScrapes = sessions.length;
 const totalLeadsFound = sessions.reduce((sum, s) => sum + s.total_found, 0);
 const totalLeadsSaved = sessions.reduce((sum, s) => sum + s.total_saved, 0);
 const unsavedLeads = totalLeadsFound - totalLeadsSaved;
 const errorScrapes = sessions.filter(s => s.status === 'error').length;

 // Save individual lead to database
 const saveLead = async (session: ScrapeSession, lead: ScrapeLogLead, index: number) => {
  const key = `${session.scrape_id}-${index}`;
  setSavingLeads(prev => new Set(prev).add(key));
  try {
   const { data: existing } = await supabase
    .from('leads')
    .select('id')
    .eq('business_name', lead.business_name)
    .eq('city', lead.city || session.location)
    .maybeSingle();

   if (existing) {
    // Update existing
    await supabase.from('leads').update({
     phone: lead.phone || undefined,
     email: lead.email || undefined,
     website: lead.website || undefined,
     instagram_url: lead.instagram_url || undefined,
     google_rating: lead.google_rating || undefined,
     google_review_count: lead.google_review_count || undefined,
     updated_at: new Date().toISOString(),
    }).eq('id', existing.id);
   } else {
    // Insert new
    await supabase.from('leads').insert({
     business_name: lead.business_name,
     address: lead.address,
     city: lead.city || session.location,
     country: session.country,
     phone: lead.phone,
     email: lead.email,
     website: lead.website,
     instagram_url: lead.instagram_url,
     google_rating: lead.google_rating,
     google_review_count: lead.google_review_count,
     google_maps_url: lead.google_maps_url,
     source: lead.source || session.source,
    });
   }

   // Mark as saved in log
   lead.saved_to_db = true;
   session.total_saved = session.leads.filter(l => l.saved_to_db).length;
   const updated = sessions.map(s => s.scrape_id === session.scrape_id ? { ...session } : s);
   setSessions(updated);
   saveLog(updated);
   setSavedLeads(prev => new Set(prev).add(key));
  } catch (err) {
   console.error('Failed to save lead:', err);
  } finally {
   setSavingLeads(prev => { const next = new Set(prev); next.delete(key); return next; });
  }
 };

 // Save all unsaved leads from a session
 const saveAllFromSession = async (session: ScrapeSession) => {
  setBulkSaving(true);
  const unsaved = session.leads.filter(l => !l.saved_to_db);
  for (let i = 0; i < unsaved.length; i++) {
   const originalIndex = session.leads.indexOf(unsaved[i]);
   await saveLead(session, unsaved[i], originalIndex);
  }
  setBulkSaving(false);
 };

 // Export session leads as CSV
 const exportCSV = (session: ScrapeSession) => {
  const headers = ['Business Name', 'Address', 'City', 'Phone', 'Email', 'Website', 'Instagram', 'Rating', 'Reviews', 'Source', 'Saved to DB'];
  const rows = session.leads.map(l => [
   l.business_name, l.address || '', l.city || '', l.phone || '', l.email || '',
   l.website || '', l.instagram_url || '', l.google_rating?.toString() || '', l.google_review_count?.toString() || '',
   l.source, l.saved_to_db ? 'Yes' : 'No'
  ]);
  const csv = [headers.join(','), ...rows.map(r => r.map(v => `"${v.replace(/"/g, '""')}"`).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `scrape-${session.niche}-${session.location}-${new Date(session.created_at).toISOString().split('T')[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
 };

 // Delete a session
 const deleteSession = (scrapeId: string) => {
  if (!confirm('Delete this scrape log? The leads already saved to your database will remain.')) return;
  const updated = sessions.filter(s => s.scrape_id !== scrapeId);
  setSessions(updated);
  saveLog(updated);
 };

 // Clear all logs
 const clearAll = () => {
  if (!confirm('Clear ALL scrape history logs? Leads already saved to your database will remain.')) return;
  setSessions([]);
  saveLog([]);
 };

 return (
  <div className="min-h-screen p-6 max-w-6xl mx-auto">
   {/* Header */}
   <div className="flex items-center justify-between mb-6">
    <div>
     <h1 className="text-2xl font-bold text-white flex items-center gap-2">
      <History className="w-6 h-6 text-prospex-cyan" />
      Scrape History & Lead Log
     </h1>
     <p className="text-sm text-prospex-muted mt-1">Every lead from every scrape is automatically logged here — nothing gets lost.</p>
    </div>
    <button onClick={clearAll} className="text-xs text-prospex-muted hover:text-red-400 transition-colors">Clear All Logs</button>
   </div>

   {/* Stats */}
   <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
    {[
     { label: 'Total Scrapes', value: totalScrapes, color: 'text-blue-400' },
     { label: 'Leads Found', value: totalLeadsFound, color: 'text-cyan-400' },
     { label: 'Leads Saved', value: totalLeadsSaved, color: 'text-green-400' },
     { label: 'Unsaved Leads', value: unsavedLeads, color: unsavedLeads > 0 ? 'text-amber-400' : 'text-green-400' },
     { label: 'Failed Scrapes', value: errorScrapes, color: errorScrapes > 0 ? 'text-red-400' : 'text-green-400' },
    ].map(stat => (
     <div key={stat.label} className="bg-prospex-surface border border-prospex-border rounded-lg p-3">
      <p className="text-[10px] uppercase tracking-wider text-prospex-muted">{stat.label}</p>
      <p className={`text-xl font-bold font-mono mt-0.5 ${stat.color}`}>{stat.value}</p>
     </div>
    ))}
   </div>

   {/* Unsaved Leads Alert */}
   {unsavedLeads > 0 && (
    <div className="mb-6 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg flex items-center justify-between">
     <div className="flex items-center gap-2">
      <AlertCircle className="w-4 h-4 text-amber-400" />
      <span className="text-sm text-amber-300">You have <strong>{unsavedLeads}</strong> leads from past scrapes that haven't been saved to your database yet.</span>
     </div>
    </div>
   )}

   {/* Filters */}
   <div className="flex items-center gap-3 mb-4">
    <div className="relative flex-1">
     <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-prospex-muted" />
     <input
      type="text"
      value={searchQuery}
      onChange={e => setSearchQuery(e.target.value)}
      placeholder="Search by niche, location, or country..."
      className="w-full pl-10 pr-4 py-2 bg-prospex-surface border border-prospex-border rounded-lg text-sm text-white placeholder:text-prospex-muted focus:outline-none focus:border-prospex-cyan"
     />
    </div>
    <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="bg-prospex-surface border border-prospex-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-prospex-cyan">
     <option value="all">All Status</option>
     <option value="complete">Complete</option>
     <option value="partial">Partial</option>
     <option value="error">Error</option>
    </select>
   </div>

   {/* Sessions List */}
   {filtered.length === 0 ? (
    <div className="bg-prospex-surface border border-prospex-border rounded-lg p-12 text-center">
     <History className="w-12 h-12 text-prospex-dim mx-auto mb-3" />
     <p className="text-sm text-prospex-muted">
      {sessions.length === 0
       ? 'No scrape history yet. Run a search and all results will be automatically logged here.'
       : 'No scrapes match your filter.'
      }
     </p>
    </div>
   ) : (
    <div className="space-y-3">
     {filtered.map(session => {
      const isExpanded = expandedSession === session.scrape_id;
      const unsavedCount = session.leads.filter(l => !l.saved_to_db).length;
      const statusColor = session.status === 'complete' ? 'text-green-400 bg-green-500/10 border-green-500/20' :
       session.status === 'error' ? 'text-red-400 bg-red-500/10 border-red-500/20' :
       session.status === 'partial' ? 'text-amber-400 bg-amber-500/10 border-amber-500/20' :
       'text-blue-400 bg-blue-500/10 border-blue-500/20';

      return (
       <div key={session.scrape_id} className="bg-prospex-surface border border-prospex-border rounded-lg overflow-hidden">
        {/* Session Header */}
        <button onClick={() => setExpandedSession(isExpanded ? null : session.scrape_id)} className="w-full flex items-center justify-between p-4 hover:bg-prospex-bg/30 transition-colors">
         <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-lg bg-prospex-cyan/10 flex items-center justify-center text-sm font-bold text-prospex-cyan shrink-0">
           {session.total_found}
          </div>
          <div className="text-left min-w-0">
           <p className="text-sm font-medium text-white truncate">
            {session.niche} <span className="text-prospex-muted">in</span> {session.location}, {session.country}
           </p>
           <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[10px] text-prospex-muted">{formatRelativeTime(session.created_at)}</span>
            <span className="text-[10px] text-prospex-muted">·</span>
            <span className="text-[10px] text-prospex-muted">{session.source}</span>
            <span className="text-[10px] text-prospex-muted">·</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded border ${statusColor}`}>{session.status}</span>
            {unsavedCount > 0 && (
             <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 text-amber-400">
              {unsavedCount} unsaved
             </span>
            )}
           </div>
          </div>
         </div>
         <div className="flex items-center gap-2 shrink-0 ml-3">
          <span className="text-xs text-prospex-muted font-mono">
           {session.total_saved}/{session.total_found} saved
          </span>
          {isExpanded ? <ChevronUp className="w-4 h-4 text-prospex-muted" /> : <ChevronDown className="w-4 h-4 text-prospex-muted" />}
         </div>
        </button>

        {/* Expanded Leads Table */}
        {isExpanded && (
         <div className="border-t border-prospex-border">
          {/* Session Actions */}
          <div className="flex items-center justify-between px-4 py-2.5 bg-prospex-bg/30 border-b border-prospex-border/50">
           <div className="flex items-center gap-2">
            {unsavedCount > 0 && (
             <button onClick={() => saveAllFromSession(session)} disabled={bulkSaving} className="flex items-center gap-1.5 px-3 py-1.5 bg-prospex-cyan text-white font-semibold text-xs rounded-lg hover:bg-prospex-cyan/80 disabled:opacity-50">
              {bulkSaving ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
              Save All Unsaved ({unsavedCount})
             </button>
            )}
            <button onClick={() => exportCSV(session)} className="flex items-center gap-1.5 px-3 py-1.5 bg-prospex-bg border border-prospex-border text-xs text-white rounded-lg hover:border-prospex-cyan/40">
             <Download className="w-3 h-3" /> Export CSV
            </button>
           </div>
           <button onClick={() => deleteSession(session.scrape_id)} className="flex items-center gap-1 text-[10px] text-prospex-muted hover:text-red-400 transition-colors">
            <Trash2 className="w-3 h-3" /> Delete Log
           </button>
          </div>

          {session.error_message && (
           <div className="px-4 py-2 bg-red-500/5 border-b border-red-500/10">
            <p className="text-xs text-red-400">Error: {session.error_message}</p>
           </div>
          )}

          {/* Leads Table */}
          <div className="overflow-x-auto">
           <table className="w-full">
            <thead>
             <tr className="bg-prospex-bg/50">
              <th className="text-left px-3 py-2 text-[10px] font-mono text-prospex-muted uppercase">Business</th>
              <th className="text-left px-3 py-2 text-[10px] font-mono text-prospex-muted uppercase">Phone</th>
              <th className="text-left px-3 py-2 text-[10px] font-mono text-prospex-muted uppercase">Email</th>
              <th className="text-left px-3 py-2 text-[10px] font-mono text-prospex-muted uppercase">Instagram</th>
              <th className="text-left px-3 py-2 text-[10px] font-mono text-prospex-muted uppercase">Rating</th>
              <th className="text-left px-3 py-2 text-[10px] font-mono text-prospex-muted uppercase">Status</th>
              <th className="text-right px-3 py-2 text-[10px] font-mono text-prospex-muted uppercase">Action</th>
             </tr>
            </thead>
            <tbody>
             {session.leads.map((lead, idx) => {
              const key = `${session.scrape_id}-${idx}`;
              const isSaving = savingLeads.has(key);
              const justSaved = savedLeads.has(key);

              return (
               <tr key={idx} className={cn('border-t border-prospex-border/30 hover:bg-prospex-bg/20', lead.saved_to_db && 'opacity-60')}>
                <td className="px-3 py-2">
                 <p className="text-xs font-medium text-white">{lead.business_name}</p>
                 <p className="text-[10px] text-prospex-muted truncate max-w-[200px]">{lead.address || lead.city || '—'}</p>
                </td>
                <td className="px-3 py-2">
                 {lead.phone ? (
                  <span className="text-[10px] text-prospex-muted font-mono">{lead.phone}</span>
                 ) : <span className="text-[10px] text-prospex-dim">—</span>}
                </td>
                <td className="px-3 py-2">
                 {lead.email ? (
                  <span className="text-[10px] text-prospex-muted truncate block max-w-[140px]">{lead.email}</span>
                 ) : <span className="text-[10px] text-prospex-dim">—</span>}
                </td>
                <td className="px-3 py-2">
                 {lead.instagram_url ? (
                  <a href={lead.instagram_url} target="_blank" rel="noopener noreferrer" className="text-[10px] text-pink-400 hover:text-pink-300">
                   @{lead.instagram_url.split('/').filter(Boolean).pop()}
                  </a>
                 ) : <span className="text-[10px] text-prospex-dim">—</span>}
                </td>
                <td className="px-3 py-2">
                 {lead.google_rating ? (
                  <span className="text-[10px] font-mono text-white">
                   {lead.google_rating.toFixed(1)} <span className="text-prospex-muted">({lead.google_review_count})</span>
                  </span>
                 ) : <span className="text-[10px] text-prospex-dim">—</span>}
                </td>
                <td className="px-3 py-2">
                 {lead.saved_to_db ? (
                  <span className="text-[10px] text-green-400 flex items-center gap-1"><Check className="w-3 h-3" /> Saved</span>
                 ) : (
                  <span className="text-[10px] text-amber-400">Unsaved</span>
                 )}
                </td>
                <td className="px-3 py-2 text-right">
                 {lead.saved_to_db ? (
                  <span className="text-[10px] text-prospex-dim">In database</span>
                 ) : (
                  <button
                   onClick={() => saveLead(session, lead, idx)}
                   disabled={isSaving}
                   className="flex items-center gap-1 px-2 py-1 bg-prospex-cyan/20 text-prospex-cyan text-[10px] rounded hover:bg-prospex-cyan/30 transition-colors ml-auto disabled:opacity-50"
                  >
                   {isSaving ? <RefreshCw className="w-2.5 h-2.5 animate-spin" /> : justSaved ? <Check className="w-2.5 h-2.5" /> : <Database className="w-2.5 h-2.5" />}
                   {isSaving ? 'Saving...' : justSaved ? 'Saved!' : 'Save'}
                  </button>
                 )}
                </td>
               </tr>
              );
             })}
            </tbody>
           </table>
          </div>
         </div>
        )}
       </div>
      );
     })}
    </div>
   )}
  </div>
 );
}
