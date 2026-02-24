'use client';

import { useState, useEffect, useRef } from 'react';
import { History, Search, Download, Database, ChevronDown, ChevronUp, Check, AlertCircle, Trash2, RefreshCw, Upload, Save } from 'lucide-react';
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
 const [expandedSessions, setExpandedSessions] = useState<Set<string>>(new Set());
 const [searchQuery, setSearchQuery] = useState('');
 const [statusFilter, setStatusFilter] = useState<string>('all');
 const [showFilter, setShowFilter] = useState<'all' | 'unsaved' | 'saved'>('all');
 const [savingLeads, setSavingLeads] = useState<Set<string>>(new Set());
 const [savedLeads, setSavedLeads] = useState<Set<string>>(new Set());
 const [bulkSaving, setBulkSaving] = useState(false);
 const [bulkProgress, setBulkProgress] = useState({ current: 0, total: 0, saved: 0, skipped: 0 });
 const [loading, setLoading] = useState(true);
 const [dbAvailable, setDbAvailable] = useState(false);
 const [dataSource, setDataSource] = useState<string>('loading...');
 const abortBulkRef = useRef(false);

 useEffect(() => { loadEverything(); }, []);

 // ─── LOAD FROM BOTH SOURCES ────────────────────────────────
 const loadEverything = async () => {
  setLoading(true);

  // 1. Always load localStorage first (instant)
  const localSessions = getLocalSessions();
  if (localSessions.length > 0) {
   setSessions(localSessions);
   setDataSource(`${localSessions.length} sessions from browser`);
  }

  // 2. Try Supabase (may not have table yet)
  try {
   const { data: dbSessions, error } = await supabase
    .from('scrape_sessions')
    .select('*')
    .order('created_at', { ascending: false });

   if (error) {
    console.warn('Supabase scrape_sessions not available:', error.message);
    setDbAvailable(false);
    if (localSessions.length > 0) {
     setDataSource(`${localSessions.length} sessions from browser (database table not found)`);
    }
    setLoading(false);
    return;
   }

   setDbAvailable(true);

   const parsed: ScrapeSession[] = (dbSessions || []).map((s: any) => ({
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

   // Merge: deduplicate by scrape_id, prefer Supabase version
   const dbIds = new Set(parsed.map(s => s.scrape_id));
   const localOnly = localSessions.filter(s => !dbIds.has(s.scrape_id));

   const merged = [...parsed, ...localOnly].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
   );

   setSessions(merged);
   setDataSource(`${merged.length} sessions (${parsed.length} from database, ${localOnly.length} local-only)`);
  } catch (err) {
   console.error('Supabase error:', err);
   setDbAvailable(false);
   setDataSource(`${localSessions.length} sessions from browser only`);
  }

  setLoading(false);
 };

 const getLocalSessions = (): ScrapeSession[] => {
  try {
   const raw = localStorage.getItem(LS_KEY);
   if (!raw) return [];
   const parsed = JSON.parse(raw);
   if (!Array.isArray(parsed)) return [];
   return parsed;
  } catch { return []; }
 };

 // ─── MIGRATE LOCAL → SUPABASE ──────────────────────────────
 const migrateToSupabase = async () => {
  const local = getLocalSessions();
  if (local.length === 0) { alert('No localStorage sessions to migrate.'); return; }
  if (!dbAvailable) { alert('Supabase scrape_sessions table not found. Run the SQL migration first.'); return; }

  let migrated = 0;
  let skipped = 0;
  for (const session of local) {
   try {
    const { error } = await supabase.from('scrape_sessions').upsert({
     scrape_id: session.scrape_id,
     created_at: session.created_at,
     niche: session.niche,
     location: session.location,
     country: session.country,
     source: session.source,
     status: session.status,
     total_found: session.total_found || session.leads?.length || 0,
     total_saved: session.total_saved,
     error_message: session.error_message,
     leads: session.leads || [],
    }, { onConflict: 'scrape_id' });
    if (!error) migrated++;
    else skipped++;
   } catch { skipped++; }
  }
  alert(`Migration complete: ${migrated} saved, ${skipped} skipped.`);
  await loadEverything();
 };

 // ─── FILTERING ─────────────────────────────────────────────
 const filtered = sessions.filter(s => {
  if (searchQuery) {
   const q = searchQuery.toLowerCase();
   if (!(s.niche || '').toLowerCase().includes(q) && !(s.location || '').toLowerCase().includes(q) && !(s.country || '').toLowerCase().includes(q)) return false;
  }
  if (statusFilter !== 'all' && s.status !== statusFilter) return false;
  if (showFilter === 'unsaved' && !s.leads.some(l => !l.saved_to_db)) return false;
  if (showFilter === 'saved' && !s.leads.every(l => l.saved_to_db)) return false;
  return true;
 });

 // ─── STATS ─────────────────────────────────────────────────
 const totalLeadsFound = sessions.reduce((sum, s) => sum + (s.leads?.length || s.total_found || 0), 0);
 const allUnsavedLeads: { session: ScrapeSession; lead: ScrapeLogLead; idx: number }[] = [];
 sessions.forEach(s => {
  (s.leads || []).forEach((l, idx) => {
   if (!l.saved_to_db) allUnsavedLeads.push({ session: s, lead: l, idx });
  });
 });
 const totalSaved = totalLeadsFound - allUnsavedLeads.length;

 // ─── SAVE LEAD TO DB ──────────────────────────────────────
 const saveLead = async (session: ScrapeSession, lead: ScrapeLogLead, index: number): Promise<'saved' | 'skipped' | 'error'> => {
  const key = `${session.scrape_id}-${index}`;
  setSavingLeads(prev => new Set(prev).add(key));
  try {
   if (!lead.business_name) return 'skipped';

   const { data: existing } = await supabase
    .from('leads')
    .select('id')
    .eq('business_name', lead.business_name)
    .maybeSingle();

   if (existing) {
    lead.saved_to_db = true;
    updateSessionState(session);
    setSavedLeads(prev => new Set(prev).add(key));
    return 'skipped';
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
    console.error('Insert error:', insertError.message, insertError.details, insertError.hint);
    return 'error';
   }

   lead.saved_to_db = true;
   updateSessionState(session);
   setSavedLeads(prev => new Set(prev).add(key));
   return 'saved';
  } catch (err) {
   console.error('Save error:', err);
   return 'error';
  } finally {
   setSavingLeads(prev => { const next = new Set(prev); next.delete(key); return next; });
  }
 };

 const updateSessionState = (session: ScrapeSession) => {
  session.total_saved = (session.leads || []).filter(l => l.saved_to_db).length;
  setSessions(prev => prev.map(s => s.scrape_id === session.scrape_id ? { ...session } : s));

  // Sync to both stores
  if (dbAvailable) {
   supabase.from('scrape_sessions')
    .update({ leads: session.leads, total_saved: session.total_saved })
    .eq('scrape_id', session.scrape_id).then(() => {});
  }
  try {
   const local = getLocalSessions().map(s => s.scrape_id === session.scrape_id ? session : s);
   localStorage.setItem(LS_KEY, JSON.stringify(local));
  } catch { /* silent */ }
 };

 // ─── SAVE ALL FROM ONE SESSION ────────────────────────────
 const saveAllFromSession = async (session: ScrapeSession) => {
  setBulkSaving(true);
  setBulkProgress({ current: 0, total: session.leads.length, saved: 0, skipped: 0 });
  abortBulkRef.current = false;
  for (let i = 0; i < session.leads.length; i++) {
   if (abortBulkRef.current) break;
   const result = await saveLead(session, session.leads[i], i);
   setBulkProgress(prev => ({
    ...prev, current: i + 1,
    saved: prev.saved + (result === 'saved' ? 1 : 0),
    skipped: prev.skipped + (result !== 'saved' ? 1 : 0),
   }));
  }
  setBulkSaving(false);
 };

 // ─── MASTER SAVE ALL UNSAVED ──────────────────────────────
 const saveAllUnsaved = async () => {
  if (allUnsavedLeads.length === 0) { alert('All leads are already saved!'); return; }
  if (!confirm(`Save ${allUnsavedLeads.length} unsaved leads to the database?`)) return;

  abortBulkRef.current = false;
  setBulkSaving(true);
  setBulkProgress({ current: 0, total: allUnsavedLeads.length, saved: 0, skipped: 0 });

  for (let i = 0; i < allUnsavedLeads.length; i++) {
   if (abortBulkRef.current) break;
   const { session, lead, idx } = allUnsavedLeads[i];
   const result = await saveLead(session, lead, idx);
   setBulkProgress(prev => ({
    ...prev, current: i + 1,
    saved: prev.saved + (result === 'saved' ? 1 : 0),
    skipped: prev.skipped + (result !== 'saved' ? 1 : 0),
   }));
  }
  setBulkSaving(false);
 };

 const stopBulkSave = () => { abortBulkRef.current = true; };

 // ─── EXPAND/COLLAPSE ──────────────────────────────────────
 const toggleExpand = (id: string) => {
  setExpandedSessions(prev => {
   const next = new Set(prev);
   next.has(id) ? next.delete(id) : next.add(id);
   return next;
  });
 };
 const expandAll = () => setExpandedSessions(new Set(filtered.map(s => s.scrape_id)));
 const collapseAll = () => setExpandedSessions(new Set());

 // ─── EXPORT ───────────────────────────────────────────────
 const exportCSV = (session: ScrapeSession) => {
  const headers = ['Business Name','Address','City','Phone','Email','Website','Instagram','Rating','Reviews','Source','Saved'];
  const rows = (session.leads || []).map(l => [
   l.business_name, l.address||'', l.city||'', l.phone||'', l.email||'',
   l.website||'', l.instagram_url||'', l.google_rating?.toString()||'',
   l.google_review_count?.toString()||'', l.source, l.saved_to_db?'Yes':'No'
  ]);
  const csv = [headers.join(','), ...rows.map(r => r.map(v => `"${(v||'').replace(/"/g,'""')}"`).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = `scrape-${session.niche}-${session.location}.csv`; a.click();
 };

 const exportAllCSV = () => {
  const headers = ['Date','Niche','Location','Country','Business Name','Address','Phone','Email','Website','Instagram','Rating','Reviews','Source','Saved'];
  const rows: string[][] = [];
  sessions.forEach(s => (s.leads||[]).forEach(l => {
   rows.push([s.created_at, s.niche, s.location, s.country, l.business_name,
    l.address||'', l.phone||'', l.email||'', l.website||'', l.instagram_url||'',
    l.google_rating?.toString()||'', l.google_review_count?.toString()||'', l.source, l.saved_to_db?'Yes':'No']);
  }));
  const csv = [headers.join(','), ...rows.map(r => r.map(v => `"${(v||'').replace(/"/g,'""')}"`).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = `all-scrape-history-${new Date().toISOString().split('T')[0]}.csv`; a.click();
 };

 // ─── DELETE ───────────────────────────────────────────────
 const deleteSession = async (scrapeId: string) => {
  if (!confirm('Delete this scrape session?')) return;
  if (dbAvailable) await supabase.from('scrape_sessions').delete().eq('scrape_id', scrapeId);
  try {
   const local = getLocalSessions().filter(s => s.scrape_id !== scrapeId);
   localStorage.setItem(LS_KEY, JSON.stringify(local));
  } catch {}
  setSessions(prev => prev.filter(s => s.scrape_id !== scrapeId));
 };

 const clearAll = async () => {
  if (!confirm('Clear ALL scrape history?')) return;
  if (dbAvailable) await supabase.from('scrape_sessions').delete().neq('scrape_id', '');
  localStorage.removeItem(LS_KEY);
  setSessions([]);
 };

 // ═══════════════════════════════════════════════════════════
 // RENDER
 // ═══════════════════════════════════════════════════════════
 return (
  <div className="min-h-screen p-6 max-w-6xl mx-auto">
   {/* Header */}
   <div className="flex items-center justify-between mb-6">
    <div>
     <h1 className="text-2xl font-bold text-white flex items-center gap-2">
      <History className="w-6 h-6 text-prospex-cyan" />
      Scrape History & Lead Log
     </h1>
     <p className="text-sm text-prospex-muted mt-1">{dataSource}</p>
    </div>
    <div className="flex items-center gap-2">
     <button onClick={migrateToSupabase} className="text-xs text-prospex-muted hover:text-prospex-cyan transition-colors flex items-center gap-1">
      <Upload className="w-3 h-3" /> Migrate Local → DB
     </button>
     <button onClick={clearAll} className="text-xs text-prospex-muted hover:text-red-400 transition-colors">Clear All</button>
    </div>
   </div>

   {/* Stats */}
   <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
    {[
     { label: 'Total Scrapes', value: sessions.length, color: 'text-blue-400' },
     { label: 'Total Leads', value: totalLeadsFound, color: 'text-cyan-400' },
     { label: 'Saved to DB', value: totalSaved, color: 'text-green-400' },
     { label: 'Unsaved Leads', value: allUnsavedLeads.length, color: allUnsavedLeads.length > 0 ? 'text-amber-400' : 'text-green-400' },
     { label: 'Sessions w/ Unsaved', value: sessions.filter(s => s.leads?.some(l => !l.saved_to_db)).length, color: 'text-orange-400' },
    ].map(stat => (
     <div key={stat.label} className="bg-prospex-surface border border-prospex-border rounded-lg p-3">
      <p className="text-[10px] uppercase tracking-wider text-prospex-muted">{stat.label}</p>
      <p className={`text-xl font-bold font-mono mt-0.5 ${stat.color}`}>{stat.value.toLocaleString()}</p>
     </div>
    ))}
   </div>

   {/* ═══ MASTER SAVE ALL UNSAVED ═══ */}
   {allUnsavedLeads.length > 0 && (
    <div className="mb-4 p-4 bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent border-2 border-amber-500/30 rounded-xl">
     <div className="flex items-center justify-between flex-wrap gap-3">
      <div className="flex items-center gap-3">
       <div className="w-12 h-12 rounded-lg bg-amber-500/20 flex items-center justify-center">
        <Database className="w-6 h-6 text-amber-400" />
       </div>
       <div>
        <p className="text-base font-bold text-white">
         {allUnsavedLeads.length.toLocaleString()} unsaved leads
        </p>
        <p className="text-xs text-prospex-muted">
         Across {sessions.filter(s => s.leads?.some(l => !l.saved_to_db)).length} scrape sessions — save them all in one click
        </p>
       </div>
      </div>
      <div className="flex items-center gap-2">
       {bulkSaving ? (
        <>
         <div className="text-right mr-2">
          <p className="text-sm text-white font-mono font-bold">{bulkProgress.current}/{bulkProgress.total}</p>
          <p className="text-[10px] text-prospex-muted">{bulkProgress.saved} new · {bulkProgress.skipped} skipped</p>
         </div>
         <button onClick={stopBulkSave} className="px-4 py-2.5 bg-red-500/20 text-red-400 text-sm font-semibold rounded-lg hover:bg-red-500/30">
          Stop
         </button>
        </>
       ) : (
        <button onClick={saveAllUnsaved} className="px-5 py-3 bg-amber-500 text-black font-bold text-sm rounded-lg hover:bg-amber-400 transition-colors flex items-center gap-2 shadow-lg shadow-amber-500/20">
         <Save className="w-5 h-5" />
         Save All {allUnsavedLeads.length.toLocaleString()} to Database
        </button>
       )}
      </div>
     </div>
     {bulkSaving && (
      <div className="mt-3">
       <div className="w-full bg-prospex-bg rounded-full h-2.5 overflow-hidden">
        <div className="bg-amber-500 h-2.5 rounded-full transition-all duration-300"
         style={{ width: `${bulkProgress.total > 0 ? (bulkProgress.current / bulkProgress.total) * 100 : 0}%` }} />
       </div>
       <p className="text-[10px] text-prospex-muted mt-1 text-center">
        {Math.round(bulkProgress.total > 0 ? (bulkProgress.current / bulkProgress.total) * 100 : 0)}% complete
       </p>
      </div>
     )}
    </div>
   )}

   {/* All saved success */}
   {allUnsavedLeads.length === 0 && sessions.length > 0 && (
    <div className="mb-4 p-3 bg-green-500/10 border border-green-500/20 rounded-lg flex items-center gap-2">
     <Check className="w-4 h-4 text-green-400" />
     <span className="text-sm text-green-400">All {totalLeadsFound.toLocaleString()} leads are saved to your database.</span>
    </div>
   )}

   {/* Filters */}
   <div className="flex items-center gap-3 mb-4 flex-wrap">
    <div className="relative flex-1 min-w-[200px]">
     <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-prospex-muted" />
     <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search niche, location, country..."
      className="w-full pl-10 pr-4 py-2 bg-prospex-surface border border-prospex-border rounded-lg text-sm text-white placeholder:text-prospex-muted focus:outline-none focus:border-prospex-cyan" />
    </div>
    <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="bg-prospex-surface border border-prospex-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-prospex-cyan">
     <option value="all">All Status</option>
     <option value="complete">Complete</option>
     <option value="partial">Partial</option>
     <option value="error">Error</option>
    </select>

    {/* Saved/Unsaved toggle */}
    <div className="flex bg-prospex-surface border border-prospex-border rounded-lg overflow-hidden">
     {(['all', 'unsaved', 'saved'] as const).map(f => (
      <button key={f} onClick={() => setShowFilter(f)}
       className={cn('px-3 py-2 text-xs font-mono transition-colors',
        showFilter === f ? 'bg-prospex-cyan text-white font-bold' : 'text-prospex-muted hover:text-white')}>
       {f === 'unsaved' ? `Unsaved (${allUnsavedLeads.length})` : f === 'saved' ? 'Saved' : 'All'}
      </button>
     ))}
    </div>

    <button onClick={expandAll} className="btn-ghost text-[10px] px-2 py-1.5">Expand All</button>
    <button onClick={collapseAll} className="btn-ghost text-[10px] px-2 py-1.5">Collapse</button>
    <button onClick={loadEverything} className="btn-ghost text-xs flex items-center gap-1"><RefreshCw className="w-3 h-3" /> Refresh</button>
    <button onClick={exportAllCSV} className="btn-ghost text-xs flex items-center gap-1"><Download className="w-3 h-3" /> Export All</button>
   </div>

   {/* Loading */}
   {loading && sessions.length === 0 && (
    <div className="text-center py-12">
     <RefreshCw className="w-8 h-8 text-prospex-cyan animate-spin mx-auto mb-3" />
     <p className="text-sm text-prospex-muted">Loading scrape history...</p>
    </div>
   )}

   {/* Empty */}
   {!loading && filtered.length === 0 && (
    <div className="bg-prospex-surface border border-prospex-border rounded-lg p-12 text-center">
     <History className="w-12 h-12 text-prospex-dim mx-auto mb-3" />
     <p className="text-sm text-prospex-muted">
      {sessions.length === 0
       ? 'No scrape history yet. Run a search or city scraper and results will appear here.'
       : showFilter === 'unsaved'
        ? 'All leads are saved! No unsaved leads found.'
        : 'No scrapes match your filter.'}
     </p>
    </div>
   )}

   {/* Session List */}
   {filtered.length > 0 && (
    <div className="space-y-2">
     {filtered.map(session => {
      const isExpanded = expandedSessions.has(session.scrape_id);
      const leads = session.leads || [];
      const unsavedCount = leads.filter(l => !l.saved_to_db).length;
      const statusColor = session.status === 'complete' ? 'text-green-400 bg-green-500/10 border-green-500/20' :
       session.status === 'error' ? 'text-red-400 bg-red-500/10 border-red-500/20' :
       session.status === 'partial' ? 'text-amber-400 bg-amber-500/10 border-amber-500/20' :
       'text-blue-400 bg-blue-500/10 border-blue-500/20';

      return (
       <div key={session.scrape_id} className="bg-prospex-surface border border-prospex-border rounded-lg overflow-hidden">
        {/* Session Header */}
        <button onClick={() => toggleExpand(session.scrape_id)} className="w-full flex items-center justify-between p-3 hover:bg-prospex-bg/30 transition-colors text-left">
         <div className="flex items-center gap-3 min-w-0">
          <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center text-xs font-bold shrink-0',
           unsavedCount > 0 ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' : 'bg-green-500/10 text-green-400 border border-green-500/20')}>
           {leads.length}
          </div>
          <div className="min-w-0">
           <p className="text-sm font-medium text-white truncate">
            {session.niche} <span className="text-prospex-muted">in</span> {session.location}, {session.country}
           </p>
           <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <span className="text-[10px] text-prospex-muted">{formatRelativeTime(session.created_at)}</span>
            <span className="text-[10px] text-prospex-muted">·</span>
            <span className="text-[10px] text-prospex-muted">{session.source}</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded border ${statusColor}`}>{session.status}</span>
            {unsavedCount > 0 ? (
             <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 text-amber-400 font-bold">{unsavedCount} unsaved</span>
            ) : leads.length > 0 ? (
             <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/10 border border-green-500/20 text-green-400">All saved ✓</span>
            ) : null}
           </div>
          </div>
         </div>
         <div className="flex items-center gap-2 shrink-0 ml-3">
          <span className="text-xs text-prospex-muted font-mono">{session.total_saved}/{leads.length}</span>
          {isExpanded ? <ChevronUp className="w-4 h-4 text-prospex-muted" /> : <ChevronDown className="w-4 h-4 text-prospex-muted" />}
         </div>
        </button>

        {/* Expanded Content */}
        {isExpanded && (
         <div className="border-t border-prospex-border">
          <div className="flex items-center justify-between px-4 py-2 bg-prospex-bg/30 border-b border-prospex-border/50">
           <div className="flex items-center gap-2">
            <button onClick={() => saveAllFromSession(session)} disabled={bulkSaving}
             className="flex items-center gap-1.5 px-3 py-1.5 bg-prospex-cyan text-white font-semibold text-xs rounded-lg hover:bg-prospex-cyan/80 disabled:opacity-50">
             {bulkSaving ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Database className="w-3 h-3" />}
             Push All to DB ({leads.length})
            </button>
            <button onClick={() => exportCSV(session)} className="flex items-center gap-1.5 px-3 py-1.5 bg-prospex-bg border border-prospex-border text-xs text-white rounded-lg hover:border-prospex-cyan/40">
             <Download className="w-3 h-3" /> CSV
            </button>
           </div>
           <button onClick={() => deleteSession(session.scrape_id)} className="flex items-center gap-1 text-[10px] text-prospex-muted hover:text-red-400">
            <Trash2 className="w-3 h-3" /> Delete
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
             {leads.map((lead, idx) => {
              if (showFilter === 'unsaved' && lead.saved_to_db) return null;
              const key = `${session.scrape_id}-${idx}`;
              const isSaving = savingLeads.has(key);
              return (
               <tr key={idx} className={cn('border-t border-prospex-border/30 hover:bg-prospex-bg/20', lead.saved_to_db && 'opacity-50')}>
                <td className="px-3 py-2">
                 <p className="text-xs font-medium text-white">{lead.business_name}</p>
                 <p className="text-[10px] text-prospex-muted truncate max-w-[200px]">{lead.address || lead.city || '—'}</p>
                </td>
                <td className="px-3 py-2">{lead.phone ? <span className="text-[10px] text-prospex-muted font-mono">{lead.phone}</span> : <span className="text-[10px] text-prospex-dim">—</span>}</td>
                <td className="px-3 py-2">{lead.email ? <span className="text-[10px] text-prospex-muted truncate block max-w-[140px]">{lead.email}</span> : <span className="text-[10px] text-prospex-dim">—</span>}</td>
                <td className="px-3 py-2">
                 {lead.website ? (
                  <a href={lead.website} target="_blank" rel="noopener noreferrer" className="text-[10px] text-prospex-cyan hover:underline truncate block max-w-[120px]">
                   {lead.website.replace(/^https?:\/\/(www\.)?/,'').slice(0,25)}
                  </a>
                 ) : <span className="text-[10px] text-prospex-dim">—</span>}
                </td>
                <td className="px-3 py-2">
                 {lead.google_rating ? (
                  <span className="text-[10px] font-mono text-white">{lead.google_rating.toFixed(1)} <span className="text-prospex-muted">({lead.google_review_count})</span></span>
                 ) : <span className="text-[10px] text-prospex-dim">—</span>}
                </td>
                <td className="px-3 py-2">
                 {lead.saved_to_db ? (
                  <span className="text-[10px] text-green-400 flex items-center gap-1"><Check className="w-3 h-3" /> Saved</span>
                 ) : (
                  <span className="text-[10px] text-amber-400 font-bold">Unsaved</span>
                 )}
                </td>
                <td className="px-3 py-2 text-right">
                 <button onClick={() => saveLead(session, lead, idx)} disabled={isSaving || lead.saved_to_db}
                  className={cn('flex items-center gap-1 px-2 py-1 text-[10px] rounded transition-colors ml-auto',
                   lead.saved_to_db ? 'bg-green-500/10 text-green-400 cursor-default' : 'bg-prospex-cyan/20 text-prospex-cyan hover:bg-prospex-cyan/30 disabled:opacity-50')}>
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

   {/* DB status footer */}
   <div className="mt-6 text-center">
    <p className="text-[10px] text-prospex-dim">
     {dbAvailable ? '✓ Connected to Supabase' : '⚠ Supabase scrape_sessions table not found — showing browser data only'}
    </p>
   </div>
  </div>
 );
}
