'use client';

import { useState, useEffect } from 'react';
import { History, Search, Download, Database, ChevronDown, ChevronUp, Check, Clock, AlertCircle, Trash2, RefreshCw, Filter, ExternalLink, Upload } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { cn, formatRelativeTime } from '@/lib/utils';

// ─── TYPES ──────────────────────────────────────────────────
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
 id?: string;
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

// ─── MAIN PAGE ──────────────────────────────────────────────
export default function ScrapeHistoryPage() {
 const [sessions, setSessions] = useState<ScrapeSession[]>([]);
 const [expandedSession, setExpandedSession] = useState<string | null>(null);
 const [searchQuery, setSearchQuery] = useState('');
 const [statusFilter, setStatusFilter] = useState<string>('all');
 const [savingLeads, setSavingLeads] = useState<Set<string>>(new Set());
 const [savedLeads, setSavedLeads] = useState<Set<string>>(new Set());
 const [bulkSaving, setBulkSaving] = useState(false);
 const [loading, setLoading] = useState(true);
 const [migrating, setMigrating] = useState(false);

 // Load from Supabase + migrate localStorage
 useEffect(() => {
  loadSessions();
 }, []);

 const loadSessions = async () => {
  setLoading(true);
  try {
   // Load from Supabase
   const { data: dbSessions, error } = await supabase
    .from('scrape_sessions')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(500);

   if (error) {
    console.error('Failed to load from Supabase:', error.message);
    // Fall back to localStorage
    const local = getLocalSessions();
    setSessions(local);
    setLoading(false);
    return;
   }

   const supabaseSessions: ScrapeSession[] = (dbSessions || []).map((s: any) => ({
    id: s.id,
    scrape_id: s.scrape_id,
    created_at: s.created_at,
    niche: s.niche || '',
    location: s.location || '',
    country: s.country || '',
    source: s.source || 'google_maps',
    status: s.status || 'complete',
    total_found: s.total_found || 0,
    total_saved: s.total_saved || 0,
    error_message: s.error_message,
    leads: Array.isArray(s.leads) ? s.leads : [],
   }));

   // Also check localStorage for any sessions not yet in Supabase
   const local = getLocalSessions();
   const dbIds = new Set(supabaseSessions.map(s => s.scrape_id));
   const localOnly = local.filter(s => !dbIds.has(s.scrape_id));

   // Auto-migrate local-only sessions to Supabase in background
   if (localOnly.length > 0) {
    migrateToSupabase(localOnly);
   }

   // Merge: Supabase sessions + local-only sessions
   const merged = [...supabaseSessions, ...localOnly].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
   );

   setSessions(merged);
  } catch (err) {
   console.error('Load error:', err);
   setSessions(getLocalSessions());
  }
  setLoading(false);
 };

 const getLocalSessions = (): ScrapeSession[] => {
  try {
   const raw = localStorage.getItem(LS_KEY);
   if (!raw) return [];
   return JSON.parse(raw);
  } catch { return []; }
 };

 const migrateToSupabase = async (localSessions: ScrapeSession[]) => {
  setMigrating(true);
  let migrated = 0;
  for (const session of localSessions) {
   try {
    const { error } = await supabase.from('scrape_sessions').insert({
     scrape_id: session.scrape_id,
     created_at: session.created_at,
     niche: session.niche,
     location: session.location,
     country: session.country,
     source: session.source,
     status: session.status,
     total_found: session.total_found,
     total_saved: session.total_saved,
     error_message: session.error_message,
     leads: session.leads,
    });
    if (!error) migrated++;
   } catch { /* skip duplicates */ }
  }
  if (migrated > 0) {
   console.log(`Migrated ${migrated} sessions from localStorage to Supabase`);
  }
  setMigrating(false);
 };

 // Force migrate button
 const forceMigrate = async () => {
  const local = getLocalSessions();
  if (local.length === 0) { alert('No localStorage sessions to migrate.'); return; }
  await migrateToSupabase(local);
  await loadSessions();
 };

 // Filter sessions
 const filtered = sessions.filter(s => {
  if (searchQuery) {
   const q = searchQuery.toLowerCase();
   if (!(s.niche || '').toLowerCase().includes(q) && !(s.location || '').toLowerCase().includes(q) && !(s.country || '').toLowerCase().includes(q)) return false;
  }
  if (statusFilter !== 'all' && s.status !== statusFilter) return false;
  return true;
 });

 // Stats
 const totalScrapes = sessions.length;
 const totalLeadsFound = sessions.reduce((sum, s) => sum + (s.total_found || s.leads.length), 0);
 const totalLeadsSaved = sessions.reduce((sum, s) => sum + s.total_saved, 0);
 const unsavedLeads = totalLeadsFound - totalLeadsSaved;
 const errorScrapes = sessions.filter(s => s.status === 'error').length;

 // Save individual lead to leads table
 const saveLead = async (session: ScrapeSession, lead: ScrapeLogLead, index: number) => {
  const key = `${session.scrape_id}-${index}`;
  setSavingLeads(prev => new Set(prev).add(key));
  try {
   const { data: existing } = await supabase
    .from('leads')
    .select('id')
    .eq('business_name', lead.business_name)
    .maybeSingle();

   if (existing) {
    lead.saved_to_db = true;
    updateSessionInState(session);
    setSavedLeads(prev => new Set(prev).add(key));
    return;
   }

   const { error: insertError } = await supabase.from('leads').insert({
    business_name: lead.business_name,
    address: lead.address || null,
    city: lead.city || session.location || null,
    country: session.country || null,
    niche: session.niche || null,
    phone: lead.phone || null,
    email: lead.email || null,
    website: lead.website || null,
    instagram_url: lead.instagram_url || null,
    google_rating: lead.google_rating || null,
    google_review_count: lead.google_review_count || null,
    source: lead.source || session.source || 'google_maps',
   });

   if (insertError) {
    console.error('Insert error:', insertError.message, insertError.details);
    return;
   }

   lead.saved_to_db = true;
   updateSessionInState(session);
   setSavedLeads(prev => new Set(prev).add(key));
  } catch (err) {
   console.error('Save error:', err);
  } finally {
   setSavingLeads(prev => { const next = new Set(prev); next.delete(key); return next; });
  }
 };

 const updateSessionInState = (session: ScrapeSession) => {
  session.total_saved = session.leads.filter(l => l.saved_to_db).length;
  const updated = sessions.map(s => s.scrape_id === session.scrape_id ? { ...session } : s);
  setSessions(updated);
  // Also update in Supabase
  supabase.from('scrape_sessions')
   .update({ leads: session.leads, total_saved: session.total_saved })
   .eq('scrape_id', session.scrape_id)
   .then(() => {});
  // Update localStorage too
  try {
   const local = getLocalSessions().map(s => s.scrape_id === session.scrape_id ? { ...session } : s);
   localStorage.setItem(LS_KEY, JSON.stringify(local.slice(0, 100)));
  } catch { /* silent */ }
 };

 const saveAllFromSession = async (session: ScrapeSession) => {
  setBulkSaving(true);
  for (let i = 0; i < session.leads.length; i++) {
   await saveLead(session, session.leads[i], i);
  }
  setBulkSaving(false);
 };

 const exportCSV = (session: ScrapeSession) => {
  const headers = ['Business Name', 'Address', 'City', 'Phone', 'Email', 'Website', 'Instagram', 'Rating', 'Reviews', 'Source', 'Saved to DB'];
  const rows = session.leads.map(l => [
   l.business_name, l.address || '', l.city || '', l.phone || '', l.email || '',
   l.website || '', l.instagram_url || '', l.google_rating?.toString() || '', l.google_review_count?.toString() || '',
   l.source, l.saved_to_db ? 'Yes' : 'No'
  ]);
  const csv = [headers.join(','), ...rows.map(r => r.map(v => `"${(v || '').replace(/"/g, '""')}"`).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `scrape-${session.niche}-${session.location}-${new Date(session.created_at).toISOString().split('T')[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
 };

 const deleteSession = async (scrapeId: string) => {
  if (!confirm('Delete this scrape log? Leads already saved to your database will remain.')) return;
  // Delete from Supabase
  await supabase.from('scrape_sessions').delete().eq('scrape_id', scrapeId);
  // Delete from localStorage
  try {
   const local = getLocalSessions().filter(s => s.scrape_id !== scrapeId);
   localStorage.setItem(LS_KEY, JSON.stringify(local));
  } catch { /* silent */ }
  setSessions(prev => prev.filter(s => s.scrape_id !== scrapeId));
 };

 const clearAll = async () => {
  if (!confirm('Clear ALL scrape history logs? Leads already saved to your database will remain.')) return;
  // Delete all from Supabase
  await supabase.from('scrape_sessions').delete().neq('scrape_id', '');
  localStorage.removeItem(LS_KEY);
  setSessions([]);
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
     <p className="text-sm text-prospex-muted mt-1">
      Every lead from every scrape — stored permanently in your database.
      {migrating && <span className="text-prospex-cyan ml-2">Migrating old data...</span>}
     </p>
    </div>
    <div className="flex items-center gap-2">
     <button onClick={forceMigrate} className="text-xs text-prospex-muted hover:text-prospex-cyan transition-colors flex items-center gap-1" title="Migrate localStorage sessions to Supabase">
      <Upload className="w-3 h-3" /> Migrate Local
     </button>
     <button onClick={clearAll} className="text-xs text-prospex-muted hover:text-red-400 transition-colors">Clear All</button>
    </div>
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

   {/* Filters */}
   <div className="flex items-center gap-3 mb-4">
    <div className="relative flex-1">
     <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-prospex-muted" />
     <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search by niche, location, or country..."
      className="w-full pl-10 pr-4 py-2 bg-prospex-surface border border-prospex-border rounded-lg text-sm text-white placeholder:text-prospex-muted focus:outline-none focus:border-prospex-cyan" />
    </div>
    <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="bg-prospex-surface border border-prospex-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-prospex-cyan">
     <option value="all">All Status</option>
     <option value="complete">Complete</option>
     <option value="partial">Partial</option>
     <option value="error">Error</option>
    </select>
    <button onClick={loadSessions} className="btn-ghost text-xs flex items-center gap-1">
     <RefreshCw className="w-3 h-3" /> Refresh
    </button>
   </div>

   {/* Loading */}
   {loading && (
    <div className="text-center py-12">
     <RefreshCw className="w-8 h-8 text-prospex-cyan animate-spin mx-auto mb-3" />
     <p className="text-sm text-prospex-muted">Loading scrape history...</p>
    </div>
   )}

   {/* Sessions List */}
   {!loading && filtered.length === 0 ? (
    <div className="bg-prospex-surface border border-prospex-border rounded-lg p-12 text-center">
     <History className="w-12 h-12 text-prospex-dim mx-auto mb-3" />
     <p className="text-sm text-prospex-muted">
      {sessions.length === 0
       ? 'No scrape history yet. Run a search and all results will be automatically logged here.'
       : 'No scrapes match your filter.'}
     </p>
    </div>
   ) : !loading && (
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
        <button onClick={() => setExpandedSession(isExpanded ? null : session.scrape_id)} className="w-full flex items-center justify-between p-4 hover:bg-prospex-bg/30 transition-colors">
         <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-lg bg-prospex-cyan/10 flex items-center justify-center text-sm font-bold text-prospex-cyan shrink-0">
           {session.leads.length || session.total_found}
          </div>
          <div className="text-left min-w-0">
           <p className="text-sm font-medium text-white truncate">
            {session.niche} <span className="text-prospex-muted">in</span> {session.location}, {session.country}
           </p>
           <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <span className="text-[10px] text-prospex-muted">{formatRelativeTime(session.created_at)}</span>
            <span className="text-[10px] text-prospex-muted">·</span>
            <span className="text-[10px] text-prospex-muted">{session.source}</span>
            <span className="text-[10px] text-prospex-muted">·</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded border ${statusColor}`}>{session.status}</span>
            {unsavedCount > 0 && (
             <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 text-amber-400">{unsavedCount} unsaved</span>
            )}
           </div>
          </div>
         </div>
         <div className="flex items-center gap-2 shrink-0 ml-3">
          <span className="text-xs text-prospex-muted font-mono">
           {session.total_saved}/{session.leads.length || session.total_found} saved
          </span>
          {isExpanded ? <ChevronUp className="w-4 h-4 text-prospex-muted" /> : <ChevronDown className="w-4 h-4 text-prospex-muted" />}
         </div>
        </button>

        {isExpanded && (
         <div className="border-t border-prospex-border">
          <div className="flex items-center justify-between px-4 py-2.5 bg-prospex-bg/30 border-b border-prospex-border/50">
           <div className="flex items-center gap-2">
            <button onClick={() => saveAllFromSession(session)} disabled={bulkSaving} className="flex items-center gap-1.5 px-3 py-1.5 bg-prospex-cyan text-white font-semibold text-xs rounded-lg hover:bg-prospex-cyan/80 disabled:opacity-50">
             {bulkSaving ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Database className="w-3 h-3" />}
             Push All to DB ({session.leads.length})
            </button>
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

          <div className="overflow-x-auto">
           <table className="w-full">
            <thead>
             <tr className="bg-prospex-bg/50">
              <th className="text-left px-3 py-2 text-[10px] font-mono text-prospex-muted uppercase">Business</th>
              <th className="text-left px-3 py-2 text-[10px] font-mono text-prospex-muted uppercase">Phone</th>
              <th className="text-left px-3 py-2 text-[10px] font-mono text-prospex-muted uppercase">Email</th>
              <th className="text-left px-3 py-2 text-[10px] font-mono text-prospex-muted uppercase">Website</th>
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
                 {lead.phone ? <span className="text-[10px] text-prospex-muted font-mono">{lead.phone}</span> : <span className="text-[10px] text-prospex-dim">—</span>}
                </td>
                <td className="px-3 py-2">
                 {lead.email ? <span className="text-[10px] text-prospex-muted truncate block max-w-[140px]">{lead.email}</span> : <span className="text-[10px] text-prospex-dim">—</span>}
                </td>
                <td className="px-3 py-2">
                 {lead.website ? (
                  <a href={lead.website} target="_blank" rel="noopener noreferrer" className="text-[10px] text-prospex-cyan hover:underline truncate block max-w-[120px]">
                   {lead.website.replace(/^https?:\/\/(www\.)?/, '').slice(0, 25)}
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
                 <button
                  onClick={() => saveLead(session, lead, idx)}
                  disabled={isSaving || (lead.saved_to_db && !justSaved)}
                  className={cn(
                   'flex items-center gap-1 px-2 py-1 text-[10px] rounded transition-colors ml-auto',
                   lead.saved_to_db
                    ? 'bg-green-500/10 text-green-400 cursor-default'
                    : 'bg-prospex-cyan/20 text-prospex-cyan hover:bg-prospex-cyan/30 disabled:opacity-50'
                  )}
                 >
                  {isSaving ? <RefreshCw className="w-2.5 h-2.5 animate-spin" /> : lead.saved_to_db ? <Check className="w-2.5 h-2.5" /> : <Database className="w-2.5 h-2.5" />}
                  {isSaving ? 'Saving...' : lead.saved_to_db ? 'In DB' : 'Save'}
                 </button>
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
