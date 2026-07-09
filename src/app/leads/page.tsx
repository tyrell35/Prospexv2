'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { Database, Search, Shield, Upload, Download, Trash2, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, RefreshCw, ExternalLink, Check, MessageCircle, Instagram, Flame, Sun, Snowflake, Filter, MapPin, Globe, Tag } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { cn, getScoreColor, getSourceConfig, getPriorityConfig, formatDate } from '@/lib/utils';
import type { Lead, TableSort, TableFilter } from '@/lib/types';
import QuickMessage from '@/components/QuickMessage';
import OutreachBlaster from '@/components/OutreachBlaster';
import BulkDmSendModal from '@/components/BulkDmSendModal';
import TodaysDmsStrip from '@/components/TodaysDmsStrip';
import ExportLeadsModal from '@/components/ExportLeadsModal';
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
  const [countyFilter, setCountyFilter] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [msgOpen, setMsgOpen] = useState(false);
  const [msgChannel, setMsgChannel] = useState<'whatsapp' | 'instagram'>('whatsapp');
  const [msgLead, setMsgLead] = useState<Lead | null>(null);
  const [blasterChannel, setBlasterChannel] = useState<null | 'whatsapp' | 'instagram'>(null);
  const [fastBlastChannel, setFastBlastChannel] = useState<null | 'instagram' | 'whatsapp'>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [enriching, setEnriching] = useState(false);

  // Unique values for filter dropdowns
  const [uniqueNiches, setUniqueNiches] = useState<string[]>([]);
  const [uniqueCountries, setUniqueCountries] = useState<string[]>([]);
  const [uniqueCities, setUniqueCities] = useState<string[]>([]);
  const [uniqueCounties, setUniqueCounties] = useState<string[]>([]);

  // ─── Device / machine filter ─────────────────────────────
  interface DeviceOption { device_name: string; tier: 'A' | 'B' | 'C'; }
  const [deviceCatalog, setDeviceCatalog] = useState<DeviceOption[]>([]);
  const [deviceFilter, setDeviceFilter] = useState<string[]>([]);          // exact device_name values
  const [deviceTierFilter, setDeviceTierFilter] = useState<'A' | 'B' | ''>('');
  const [deviceMatchMode, setDeviceMatchMode] = useState<'any' | 'all'>('any');
  const [deviceIdMask, setDeviceIdMask] = useState<Set<string> | null>(null); // ids that pass current filter

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

      const { data: countyData } = await supabase.from('leads').select('county').not('county', 'is', null);
      const countiesList = [...new Set((countyData || []).map(d => d.county).filter(Boolean))].sort();
      setUniqueCounties(countiesList);

      // Devices from the seeded dictionary — Tier A/B are worth filtering on
      const { data: devData } = await supabase.from('device_keywords').select('device_name, tier').eq('active', true).in('tier', ['A', 'B']).order('tier').order('device_name');
      setDeviceCatalog((devData || []) as DeviceOption[]);
    };
    fetchFilterOptions();
  }, []);

  // Resolve device filter → set of lead_ids that match. Runs whenever the
  // device filter changes; leaves deviceIdMask=null if nothing selected so
  // fetchLeads knows to skip the extra WHERE clause.
  useEffect(() => {
    const hasFilter = deviceFilter.length > 0 || !!deviceTierFilter;
    if (!hasFilter) { setDeviceIdMask(null); return; }
    let cancelled = false;
    (async () => {
      let q = supabase.from('hunt_enrichment').select('lead_id, devices_found, tier_a_count, tier_b_count').limit(20000);
      // Array containment vs overlap depending on mode
      if (deviceFilter.length > 0) {
        if (deviceMatchMode === 'all') q = q.contains('devices_found', deviceFilter);
        else q = q.overlaps('devices_found', deviceFilter);
      }
      if (deviceTierFilter === 'A') q = q.gte('tier_a_count', 1);
      if (deviceTierFilter === 'B') q = q.gte('tier_b_count', 1);
      const { data } = await q;
      if (cancelled) return;
      setDeviceIdMask(new Set((data || []).map(r => (r as { lead_id: string }).lead_id)));
    })();
    return () => { cancelled = true; };
  }, [deviceFilter, deviceTierFilter, deviceMatchMode]);

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
      if (countyFilter) query = query.eq('county', countyFilter);
      // Device filter — apply the pre-resolved id mask
      if (deviceIdMask) {
        const ids = Array.from(deviceIdMask);
        if (ids.length === 0) {
          setLeads([]); setTotalCount(0); setLoading(false); return;
        }
        query = query.in('id', ids);
      }
      const { data, count, error } = await query;
      if (error) throw error;
      setLeads(data || []);
      setTotalCount(count || 0);
    } catch (error) { console.error('Failed to fetch leads:', error); }
    finally { setLoading(false); }
  }, [sort, filter, page, nicheFilter, countryFilter, cityFilter, countyFilter, deviceIdMask]);

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
    setCountyFilter('');
    setDeviceFilter([]);
    setDeviceTierFilter('');
    setPage(0);
  };

  const activeFilterCount = [filter.source, filter.priority, nicheFilter, countryFilter, cityFilter, countyFilter, deviceTierFilter, deviceFilter.length > 0 ? 'devices' : null].filter(Boolean).length;

  const toggleDeviceInFilter = (name: string) => {
    setDeviceFilter(prev => prev.includes(name) ? prev.filter(x => x !== name) : [...prev, name]);
    setPage(0);
  };

  const enrichSelected = async () => {
    if (selectedIds.size === 0 || enriching) return;
    setEnriching(true);
    try {
      const res = await fetch('/api/hunt/enrich', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lead_ids: Array.from(selectedIds), refetch: true }),
      });
      const data = await res.json();
      if (data.success) {
        alert(`Enriched ${data.processed} lead${data.processed === 1 ? '' : 's'}. ${data.with_devices || 0} had detected devices.`);
        fetchLeads();
      } else {
        alert(`Enrich failed: ${data.error || 'unknown'}`);
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Enrich failed');
    } finally { setEnriching(false); }
  };

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  const SortIcon = ({ column }: { column: string }) => {
    if (sort.column !== column) return <ChevronUp className="w-3 h-3 text-prospex-dim opacity-0 group-hover:opacity-50" />;
    return sort.direction === 'asc' ? <ChevronUp className="w-3 h-3 text-prospex-cyan" /> : <ChevronDown className="w-3 h-3 text-prospex-cyan" />;
  };

  return (
    <div className="max-w-7xl mx-auto space-y-4">
      {/* Today's DMs — live per-account tally + push to Slack */}
      <TodaysDmsStrip />

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
            <button
              onClick={enrichSelected}
              disabled={enriching}
              title="Detect devices/machines by scanning each lead's website"
              className="btn-ghost text-xs disabled:opacity-50"
            >
              {enriching ? '⏳' : '🔬'} Enrich Devices ({selectedIds.size})
            </button>
            <button onClick={() => setBlasterChannel('whatsapp')} className="btn text-xs bg-green-500/20 text-green-400 border border-green-500/30 hover:bg-green-500/30" title="Blast WhatsApp messages"><Zap className="w-3.5 h-3.5" /> Blast WA ({selectedIds.size})</button>
            <button onClick={() => setBlasterChannel('instagram')} className="btn text-xs bg-pink-500/20 text-pink-400 border border-pink-500/30 hover:bg-pink-500/30" title="Blast Instagram DMs · confirm each send"><Zap className="w-3.5 h-3.5" /> Blast IG ({selectedIds.size})</button>
            <button onClick={() => setFastBlastChannel('instagram')} className="btn text-xs bg-gradient-to-r from-pink-500/30 to-fuchsia-500/30 text-pink-300 border border-pink-500/50 hover:from-pink-500/40 hover:to-fuchsia-500/40" title="Fast Blast IG · round-robin across warm accounts, one-tap send, keyboard shortcuts">🚀 Fast IG ({selectedIds.size})</button>
            <button onClick={() => setFastBlastChannel('whatsapp')} className="btn text-xs bg-gradient-to-r from-green-500/30 to-emerald-500/30 text-green-300 border border-green-500/50 hover:from-green-500/40 hover:to-emerald-500/40" title="Fast Blast WhatsApp · opens wa.me deep link with prefilled message per lead"><MessageCircle className="w-3.5 h-3.5" /> Fast WA ({selectedIds.size})</button>
            <button onClick={handleExportCSV} className="btn-primary text-xs"><Download className="w-3.5 h-3.5" /> Export ({selectedIds.size})</button>
            <button onClick={handleBulkDelete} className="btn-danger text-xs"><Trash2 className="w-3.5 h-3.5" /> Delete ({selectedIds.size})</button>
          </>)}
          {selectedIds.size === 0 && (
            <button onClick={() => setExportOpen(true)} className="btn-ghost text-xs" title="Export with country filter & format options (Standard / Meta / Skool)">
              <Download className="w-3.5 h-3.5" /> Export
            </button>
          )}
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
            {uniqueCounties.length > 0 && (
              <div className="flex items-center gap-1.5" title="UK county rollup — e.g. 'Dorset' matches Bournemouth, Poole, Dorchester etc.">
                <MapPin className="w-3.5 h-3.5 text-prospex-cyan" />
                <select value={countyFilter} onChange={(e) => { setCountyFilter(e.target.value); setPage(0); }} className="input w-auto text-xs py-1.5">
                  <option value="">All Counties (UK)</option>
                  {uniqueCounties.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            )}
            <div className="flex items-center gap-1.5">
              <Database className="w-3.5 h-3.5 text-prospex-dim" />
              <select value={filter.source || ''} onChange={(e) => { setFilter(prev => ({ ...prev, source: e.target.value || null })); setPage(0); }} className="input w-auto text-xs py-1.5">
                {SOURCE_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            {activeFilterCount > 0 && (
              <button onClick={clearAllFilters} className="text-[10px] text-prospex-muted hover:text-red-400 transition-colors underline">Clear all filters</button>
            )}

            {/* Devices / Machines filter */}
            <div className="w-full mt-2 pt-2 border-t border-prospex-border/50">
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <span className="text-[10px] font-mono text-prospex-dim uppercase">🔬 Devices</span>
                <div className="flex items-center gap-1">
                  {(['A', 'B'] as const).map(t => (
                    <button key={t} onClick={() => { setDeviceTierFilter(deviceTierFilter === t ? '' : t); setPage(0); }}
                      className={cn('text-[10px] px-2 py-0.5 rounded font-mono',
                        deviceTierFilter === t
                          ? (t === 'A' ? 'bg-prospex-cyan/20 text-prospex-cyan border border-prospex-cyan/30' : 'bg-amber-500/20 text-amber-400 border border-amber-500/30')
                          : 'bg-prospex-bg text-prospex-dim hover:text-prospex-text')}>
                      Any Tier {t}
                    </button>
                  ))}
                </div>
                {deviceFilter.length > 1 && (
                  <div className="flex items-center gap-1">
                    <button onClick={() => setDeviceMatchMode('any')}
                      className={cn('text-[9px] px-1.5 py-0.5 rounded font-mono',
                        deviceMatchMode === 'any' ? 'bg-prospex-cyan/20 text-prospex-cyan border border-prospex-cyan/30' : 'bg-prospex-bg text-prospex-dim')}>
                      any match
                    </button>
                    <button onClick={() => setDeviceMatchMode('all')}
                      className={cn('text-[9px] px-1.5 py-0.5 rounded font-mono',
                        deviceMatchMode === 'all' ? 'bg-prospex-cyan/20 text-prospex-cyan border border-prospex-cyan/30' : 'bg-prospex-bg text-prospex-dim')}>
                      all match
                    </button>
                  </div>
                )}
                {(deviceFilter.length > 0 || deviceTierFilter) && (
                  <span className="text-[10px] text-prospex-dim">
                    {deviceIdMask ? `matches ${deviceIdMask.size} enriched lead${deviceIdMask.size === 1 ? '' : 's'}` : '…'}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {deviceCatalog.map(d => {
                  const active = deviceFilter.includes(d.device_name);
                  const tierColor = d.tier === 'A' ? 'text-prospex-cyan border-prospex-cyan/30' : 'text-amber-400 border-amber-500/30';
                  return (
                    <button key={d.device_name} onClick={() => toggleDeviceInFilter(d.device_name)}
                      className={cn('text-[10px] px-2 py-0.5 rounded-full font-mono border transition-colors',
                        active ? 'bg-prospex-cyan/10 text-prospex-cyan border-prospex-cyan/40' : `bg-prospex-bg ${tierColor} hover:text-prospex-text`)}>
                      {d.tier === 'A' ? '🔥 ' : ''}{d.device_name}
                    </button>
                  );
                })}
                {deviceCatalog.length === 0 && (
                  <span className="text-[10px] text-prospex-dim">Loading devices…</span>
                )}
              </div>
              {(deviceFilter.length > 0 || deviceTierFilter) && deviceIdMask && deviceIdMask.size === 0 && (
                <p className="text-[10px] text-amber-400 mt-2">
                  No enriched leads matched. Tick some leads → click <strong>🔬 Enrich Devices</strong> to run detection on them first.
                </p>
              )}
            </div>
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

      {/* Outreach Blaster Modal (confirm-per-send) */}
      <OutreachBlaster
        isOpen={blasterChannel !== null}
        onClose={() => setBlasterChannel(null)}
        channel={blasterChannel || 'whatsapp'}
        leads={leads.filter(l => selectedIds.has(l.id))}
      />

      {/* Fast Blast — IG (round-robin + warmup-aware) or WhatsApp Web (wa.me deep link) */}
      <BulkDmSendModal
        isOpen={fastBlastChannel !== null}
        onClose={() => setFastBlastChannel(null)}
        channel={fastBlastChannel || 'instagram'}
        leads={leads.filter(l => selectedIds.has(l.id))}
        onCompleted={() => { fetchLeads(); }}
      />

      {/* Export Modal */}
      <ExportLeadsModal isOpen={exportOpen} onClose={() => setExportOpen(false)} />
    </div>
  );
}
