'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { Database, Search, Shield, Upload, Download, Trash2, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, RefreshCw, ExternalLink, Check, MessageCircle, Instagram, Flame, Sun, Snowflake, Filter, MapPin, Globe, Tag } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { cn, getScoreColor, getSourceConfig, getPriorityConfig, formatDate } from '@/lib/utils';
import type { Lead, TableSort, TableFilter } from '@/lib/types';
import QuickMessage from '@/components/QuickMessage';
import OutreachBlaster from '@/components/OutreachBlaster';
import { Zap } from 'lucide-react';

const PAGE_SIZE = 50;

function ScoreBadge({ score }: { score: number | null }) {
  if (score === null) return <span className="text-xs text-prospex-dim font-mono">—</span>;
  return <span className={cn('font-mono text-sm font-bold', getScoreColor(score))}>{score}</span>;
}

function SourceBadge({ source }: { source: string }) {
  const config = getSourceConfig(source);
  return <span className={cn('badge', config.color)}>{config.label}</span>;
}

function PriorityBadge({ priority }: { priority: 'hot' | 'warm' | 'cold' | null }) {
  if (!priority) return null;
  const config = getPriorityConfig(priority);
  return <span className={cn('badge', config.bg, config.text, config.border)}>{config.emoji} {config.label}</span>;
}

const priorityFilters = [
  { value: null, label: 'All', icon: null },
  { value: 'hot', label: 'Hot', icon: Flame, color: 'text-red-400 bg-red-500/20 border-red-500/40' },
  { value: 'warm', label: 'Warm', icon: Sun, color: 'text-amber-400 bg-amber-500/20 border-amber-500/40' },
  { value: 'cold', label: 'Cold', icon: Snowflake, color: 'text-blue-400 bg-blue-500/20 border-blue-500/40' },
];

const SOURCE_OPTIONS = [
  { value: '', label: 'All Sources' },
  { value: 'google_maps', label: 'Google Maps' },
  { value: 'yelp', label: 'Yelp' },
  { value: 'fresha', label: 'Fresha' },
  { value: 'yell', label: 'Yell.com' },
  { value: 'yellow_pages', label: 'Yellow Pages' },
  { value: 'bark', label: 'Bark.com' },
  { value: 'csv_import', label: 'CSV Import' },
];

export default function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(0);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sort, setSort] = useState<TableSort>({ column: 'created_at', direction: 'desc' });
  const [filter, setFilter] = useState<TableFilter>({ search: '', source: null, priority: null, scoreRange: null, auditStatus: null });
  const [nicheFilter, setNicheFilter] = useState('');
  const [countryFilter, setCountryFilter] = useState('');
  const [cityFilter, setCityFilter] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [msgOpen, setMsgOpen] = useState(false);
  const [msgChannel, setMsgChannel] = useState<'whatsapp' | 'instagram'>('whatsapp');
  const [msgLead, setMsgLead] = useState<Lead | null>(null);
  const [blasterChannel, setBlasterChannel] = useState<null | 'whatsapp' | 'instagram'>(null);

  // Unique values for filter dropdowns
  const [uniqueNiches, setUniqueNiches] = useState<string[]>([]);
  const [uniqueCountries, setUniqueCountries] = useState<string[]>([]);
  const [uniqueCities, setUniqueCities] = useState<string[]>([]);

  // Fetch unique filter values
  useEffect(() => {
    const fetchFilterOptions = async () => {
      const { data: nicheData } = await supabase.from('leads').select('niche').not('niche', 'is', null);
      const niches = [...new Set((nicheData || []).map(d => d.niche).filter(Boolean))].sort();
      setUniqueNiches(niches);

      const { data: countryData } = await supabase.from('leads').select('country').not('country', 'is', null);
      const countries = [...new Set((countryData || []).map(d => d.country).filter(Boolean))].sort();
      setUniqueCountries(countries);

      const { data: cityData } = await supabase.from('leads').select('city').not('city', 'is', null);
      const citiesList = [...new Set((cityData || []).map(d => d.city).filter(Boolean))].sort();
      setUniqueCities(citiesList);
    };
    fetchFilterOptions();
  }, []);

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase.from('leads').select('*', { count: 'exact' })
        .order(sort.column, { ascending: sort.direction === 'asc' })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
      if (filter.search) query = query.or(`business_name.ilike.%${filter.search}%,address.ilike.%${filter.search}%,email.ilike.%${filter.search}%`);
      if (filter.source) query = query.eq('source', filter.source);
      if (filter.priority) query = query.eq('lead_priority', filter.priority);
      if (nicheFilter) query = query.eq('niche', nicheFilter);
      if (countryFilter) query = query.eq('country', countryFilter);
      if (cityFilter) query = query.eq('city', cityFilter);
      const { data, count, error } = await query;
      if (error) throw error;
      setLeads(data || []);
      setTotalCount(count || 0);
    } catch (error) { console.error('Failed to fetch leads:', error); }
    finally { setLoading(false); }
  }, [sort, filter, page, nicheFilter, countryFilter, cityFilter]);

  useEffect(() => { fetchLeads(); }, [fetchLeads]);

  const handleSort = (column: string) => setSort(prev => ({ column, direction: prev.column === column && prev.direction === 'asc' ? 'desc' : 'asc' }));
  const toggleSelect = (id: string) => setSelectedIds(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const toggleSelectAll = () => selectedIds.size === leads.length ? setSelectedIds(new Set()) : setSelectedIds(new Set(leads.map(l => l.id)));

  const handleExportCSV = async () => {
    const toExport = selectedIds.size > 0 ? leads.filter(l => selectedIds.has(l.id)) : leads;
    const headers = ['Business Name', 'Niche', 'Phone', 'Email', 'Website', 'Instagram', 'City', 'Country', 'Address', 'Google Rating', 'Reviews', 'Source', 'Lead Score', 'Priority', 'Audit Score', 'Date Added'];
    const rows = toExport.map(l => [l.business_name, l.niche || '', l.phone || '', l.email || '', l.website || '', l.instagram_url || '', l.city || '', l.country || '', l.address || '', l.google_rating?.toString() || '', l.google_review_count?.toString() || '', l.source, l.lead_score?.toString() || '', l.lead_priority || '', l.audit_score?.toString() || '', formatDate(l.created_at)]);
    const csv = [headers, ...rows].map(row => row.map(cell => `"${(cell || '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a'); link.href = url; link.download = `prospex-leads-${new Date().toISOString().split('T')[0]}.csv`; link.click(); URL.revokeObjectURL(url);
    await supabase.from('activity_log').insert({ action_type: 'export', description: `Exported ${toExport.length} leads to CSV` });
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0 || !confirm(`Delete ${selectedIds.size} leads?`)) return;
    await supabase.from('leads').delete().in('id', Array.from(selectedIds));
    setSelectedIds(new Set()); fetchLeads();
  };

  const clearAllFilters = () => {
    setFilter({ search: '', source: null, priority: null, scoreRange: null, auditStatus: null });
    setNicheFilter('');
    setCountryFilter('');
    setCityFilter('');
    setPage(0);
  };

  const activeFilterCount = [filter.source, filter.priority, nicheFilter, countryFilter, cityFilter].filter(Boolean).length;

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  const SortIcon = ({ column }: { column: string }) => {
    if (sort.column !== column) return <ChevronUp className="w-3 h-3 text-prospex-dim opacity-0 group-hover:opacity-50" />;
    return sort.direction === 'asc' ? <ChevronUp className="w-3 h-3 text-prospex-cyan" /> : <ChevronDown className="w-3 h-3 text-prospex-cyan" />;
  };

  return (
    <div className="max-w-7xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-mono font-bold text-prospex-text flex items-center gap-3"><Database className="w-6 h-6 text-prospex-cyan" />Lead Database</h1>
          <p className="text-sm text-prospex-dim mt-1">
            {totalCount.toLocaleString()} leads
            {selectedIds.size > 0 && <span className="text-prospex-cyan"> · {selectedIds.size} selected</span>}
            {activeFilterCount > 0 && <span className="text-amber-400"> · {activeFilterCount} filter{activeFilterCount > 1 ? 's' : ''} active</span>}
          </p>
        </div>
      </div>

      {/* Priority Filter Tabs */}
      <div className="flex items-center gap-2">
        {priorityFilters.map(pf => (
          <button key={pf.label} onClick={() => { setFilter(prev => ({ ...prev, priority: pf.value })); setPage(0); }}
            className={cn('badge cursor-pointer text-sm py-1.5 px-3 border transition-all',
              filter.priority === pf.value ? (pf.color || 'text-prospex-cyan bg-prospex-cyan/20 border-prospex-cyan/40') : 'text-prospex-muted bg-prospex-surface border-prospex-border hover:border-prospex-dim')}>
            {pf.icon && <pf.icon className="w-3.5 h-3.5 mr-1" />}{pf.label}
          </button>
        ))}
      </div>

      {/* Search + Filter Toolbar */}
      <div className="card p-3 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-prospex-dim" />
            <input type="text" placeholder="Search leads..." value={filter.search} onChange={(e) => setFilter(prev => ({ ...prev, search: e.target.value }))} className="input pl-9" />
          </div>

          <button onClick={() => setShowFilters(!showFilters)}
            className={cn('btn-ghost text-xs border', showFilters || activeFilterCount > 0 ? 'border-prospex-cyan/40 text-prospex-cyan' : 'border-prospex-border')}>
            <Filter className="w-3.5 h-3.5" /> Filters {activeFilterCount > 0 && <span className="ml-1 px-1.5 py-0.5 rounded-full bg-prospex-cyan/20 text-[10px]">{activeFilterCount}</span>}
          </button>

          {selectedIds.size > 0 && (<>
            <div className="w-px h-6 bg-prospex-border" />
            <button onClick={async () => { await fetch('/api/score', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ leadIds: Array.from(selectedIds) }) }); fetchLeads(); }} className="btn-ghost text-xs" title="Score selected leads">⭐ Score ({selectedIds.size})</button>
            <button onClick={async () => { await fetch('/api/enrich', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ leadIds: Array.from(selectedIds) }) }); fetchLeads(); }} className="btn-ghost text-xs" title="Enrich emails from websites">🔍 Enrich ({selectedIds.size})</button>
            <button onClick={() => setBlasterChannel('whatsapp')} className="btn text-xs bg-green-500/20 text-green-400 border border-green-500/30 hover:bg-green-500/30" title="Blast WhatsApp messages"><Zap className="w-3.5 h-3.5" /> Blast WA ({selectedIds.size})</button>
            <button onClick={() => setBlasterChannel('instagram')} className="btn text-xs bg-pink-500/20 text-pink-400 border border-pink-500/30 hover:bg-pink-500/30" title="Blast Instagram DMs"><Zap className="w-3.5 h-3.5" /> Blast IG ({selectedIds.size})</button>
            <button onClick={handleExportCSV} className="btn-primary text-xs"><Download className="w-3.5 h-3.5" /> Export ({selectedIds.size})</button>
            <button onClick={handleBulkDelete} className="btn-danger text-xs"><Trash2 className="w-3.5 h-3.5" /> Delete ({selectedIds.size})</button>
          </>)}
          {selectedIds.size === 0 && <button onClick={handleExportCSV} className="btn-ghost text-xs"><Download className="w-3.5 h-3.5" /> Export All</button>}
        </div>

        {/* Expanded Filters */}
        {showFilters && (
          <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-prospex-border/50">
            <div className="flex items-center gap-1.5">
              <Tag className="w-3.5 h-3.5 text-prospex-dim" />
              <select value={nicheFilter} onChange={(e) => { setNicheFilter(e.target.value); setPage(0); }} className="input w-auto text-xs py-1.5">
                <option value="">All Niches</option>
                {uniqueNiches.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5 text-prospex-dim" />
              <select value={countryFilter} onChange={(e) => { setCountryFilter(e.target.value); setPage(0); }} className="input w-auto text-xs py-1.5">
                <option value="">All Countries</option>
                {uniqueCountries.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-prospex-dim" />
              <select value={cityFilter} onChange={(e) => { setCityFilter(e.target.value); setPage(0); }} className="input w-auto text-xs py-1.5">
                <option value="">All Cities</option>
                {uniqueCities.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-1.5">
              <Database className="w-3.5 h-3.5 text-prospex-dim" />
              <select value={filter.source || ''} onChange={(e) => { setFilter(prev => ({ ...prev, source: e.target.value || null })); setPage(0); }} className="input w-auto text-xs py-1.5">
                {SOURCE_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            {activeFilterCount > 0 && (
              <button onClick={clearAllFilters} className="text-[10px] text-prospex-muted hover:text-red-400 transition-colors underline">Clear all filters</button>
            )}
          </div>
        )}
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="table-header">
                <th className="w-10 px-3 py-3"><input type="checkbox" checked={leads.length > 0 && selectedIds.size === leads.length} onChange={toggleSelectAll} className="rounded border-prospex-border bg-prospex-bg" /></th>
                <th className="text-left px-3 py-3 text-xs font-mono text-prospex-dim uppercase cursor-pointer group" onClick={() => handleSort('business_name')}><span className="flex items-center gap-1">Business <SortIcon column="business_name" /></span></th>
                <th className="text-left px-3 py-3 text-xs font-mono text-prospex-dim uppercase cursor-pointer group" onClick={() => handleSort('niche')}><span className="flex items-center gap-1">Niche <SortIcon column="niche" /></span></th>
                <th className="text-left px-3 py-3 text-xs font-mono text-prospex-dim uppercase cursor-pointer group" onClick={() => handleSort('city')}><span className="flex items-center gap-1">Location <SortIcon column="city" /></span></th>
                <th className="text-left px-3 py-3 text-xs font-mono text-prospex-dim uppercase">Source</th>
                <th className="text-left px-3 py-3 text-xs font-mono text-prospex-dim uppercase cursor-pointer group" onClick={() => handleSort('lead_score')}><span className="flex items-center gap-1">Score <SortIcon column="lead_score" /></span></th>
                <th className="text-left px-3 py-3 text-xs font-mono text-prospex-dim uppercase">Priority</th>
                <th className="text-left px-3 py-3 text-xs font-mono text-prospex-dim uppercase cursor-pointer group" onClick={() => handleSort('google_rating')}><span className="flex items-center gap-1">Rating <SortIcon column="google_rating" /></span></th>
                <th className="text-right px-3 py-3 text-xs font-mono text-prospex-dim uppercase">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} className="text-center py-16"><div className="w-6 h-6 border-2 border-prospex-cyan/30 border-t-prospex-cyan rounded-full animate-spin mx-auto" /><p className="text-xs text-prospex-dim font-mono mt-3">Loading leads...</p></td></tr>
              ) : leads.length === 0 ? (
                <tr><td colSpan={9} className="text-center py-16"><Database className="w-10 h-10 text-prospex-dim mx-auto mb-3" /><p className="text-sm text-prospex-dim font-mono">{activeFilterCount > 0 ? 'No leads match your filters' : 'No leads found'}</p>{activeFilterCount > 0 ? <button onClick={clearAllFilters} className="btn-primary mt-4 inline-flex">Clear Filters</button> : <Link href="/search" className="btn-primary mt-4 inline-flex"><Search className="w-4 h-4" /> Start Searching</Link>}</td></tr>
              ) : leads.map((lead) => (
                <tr key={lead.id} className="table-row">
                  <td className="px-3 py-3"><input type="checkbox" checked={selectedIds.has(lead.id)} onChange={() => toggleSelect(lead.id)} className="rounded border-prospex-border bg-prospex-bg" /></td>
                  <td className="px-3 py-3">
                    <Link href={`/leads/${lead.id}`} className="text-sm font-medium text-prospex-text hover:text-prospex-cyan transition-colors">{lead.business_name}</Link>
                    <p className="text-xs text-prospex-dim mt-0.5 truncate max-w-[200px]">{lead.phone || lead.email || 'No contact info'}</p>
                  </td>
                  <td className="px-3 py-3">
                    {lead.niche ? (
                      <span className="text-xs text-prospex-muted bg-prospex-bg px-2 py-0.5 rounded-full border border-prospex-border">{lead.niche}</span>
                    ) : <span className="text-xs text-prospex-dim">—</span>}
                  </td>
                  <td className="px-3 py-3">
                    <p className="text-xs text-prospex-muted">{lead.city || '—'}</p>
                    {lead.country && <p className="text-[10px] text-prospex-dim">{lead.country}</p>}
                  </td>
                  <td className="px-3 py-3"><SourceBadge source={lead.source} /></td>
                  <td className="px-3 py-3"><ScoreBadge score={lead.lead_score} /></td>
                  <td className="px-3 py-3"><PriorityBadge priority={lead.lead_priority} /></td>
                  <td className="px-3 py-3">{lead.google_rating ? <span className="text-sm font-mono text-prospex-text">{lead.google_rating.toFixed(1)}<span className="text-prospex-dim text-xs ml-1">({lead.google_review_count})</span></span> : <span className="text-xs text-prospex-dim">—</span>}</td>
                  <td className="px-3 py-3 text-right">
                    <div className="flex items-center justify-end gap-0.5">
                      {lead.phone && lead.whatsapp_eligible && <button onClick={() => { setMsgLead(lead); setMsgChannel('whatsapp'); setMsgOpen(true); }} className="p-1.5 rounded hover:bg-green-500/20 text-prospex-dim hover:text-green-400 transition-colors" title="WhatsApp"><MessageCircle className="w-3.5 h-3.5" /></button>}
                      {lead.instagram_url && <button onClick={() => { setMsgLead(lead); setMsgChannel('instagram'); setMsgOpen(true); }} className="p-1.5 rounded hover:bg-pink-500/20 text-prospex-dim hover:text-pink-400 transition-colors" title="Instagram DM"><Instagram className="w-3.5 h-3.5" /></button>}
                      {lead.website && lead.audit_status !== 'complete' && <button onClick={() => fetch('/api/audit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ leadId: lead.id }) }).then(() => fetchLeads())} className="p-1.5 rounded hover:bg-prospex-amber/20 text-prospex-dim hover:text-prospex-amber transition-colors" title="Run Audit"><Shield className="w-3.5 h-3.5" /></button>}
                      {!lead.ghl_contact_id && <button onClick={() => fetch('/api/ghl', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ leadId: lead.id }) }).then(() => fetchLeads())} className="p-1.5 rounded hover:bg-prospex-green/20 text-prospex-dim hover:text-prospex-green transition-colors" title="Push to GHL"><Upload className="w-3.5 h-3.5" /></button>}
                      <Link href={`/leads/${lead.id}`} className="p-1.5 rounded hover:bg-prospex-cyan/20 text-prospex-dim hover:text-prospex-cyan transition-colors" title="View"><ExternalLink className="w-3.5 h-3.5" /></Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-prospex-border">
            <p className="text-xs text-prospex-dim font-mono">Page {page + 1} of {totalPages} · {totalCount} total leads</p>
            <div className="flex items-center gap-1">
              <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} className="btn-ghost p-1.5 disabled:opacity-30"><ChevronLeft className="w-4 h-4" /></button>
              <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} className="btn-ghost p-1.5 disabled:opacity-30"><ChevronRight className="w-4 h-4" /></button>
            </div>
          </div>
        )}
      </div>

      {/* Quick Message Modal */}
      {msgLead && (
        <QuickMessage
          isOpen={msgOpen}
          onClose={() => { setMsgOpen(false); setMsgLead(null); }}
          channel={msgChannel}
          lead={msgLead}
        />
      )}

      {/* Outreach Blaster Modal */}
      <OutreachBlaster
        isOpen={blasterChannel !== null}
        onClose={() => setBlasterChannel(null)}
        channel={blasterChannel || 'whatsapp'}
        leads={leads.filter(l => selectedIds.has(l.id))}
      />
    </div>
  );
}
