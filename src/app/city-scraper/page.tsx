'use client';

import { useState, useRef, useCallback } from 'react';
import {
  MapPin, Play, Pause, RotateCcw, Download, Check, X, Loader2,
  Building2, Globe2, ChevronDown, ChevronRight, Search, Database,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import NicheAutocomplete from '@/components/NicheAutocomplete';
import { UK_AFFLUENT_CITIES, US_AFFLUENT_CITIES, CA_AFFLUENT_CITIES, getCitiesByRegion, getRegions } from '@/lib/affluent-cities';
import type { CityData } from '@/lib/affluent-cities';

interface LeadResult {
  business_name: string;
  address: string | null;
  city: string | null;
  country: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  instagram_url: string | null;
  google_rating: number | null;
  google_review_count: number | null;
  google_maps_url: string | null;
  source: string;
}

interface CityResult {
  city: CityData;
  status: 'pending' | 'scraping' | 'done' | 'error';
  leadsFound: number;
  leadsSaved: number;
  error?: string;
  leads: LeadResult[];
}

export default function CityScraper() {
  const [country, setCountry] = useState<'uk' | 'us' | 'ca'>('uk');
  const [niche, setNiche] = useState('');
  const [selectedRegions, setSelectedRegions] = useState<Set<string>>(new Set());
  const [selectedCities, setSelectedCities] = useState<Set<string>>(new Set());
  const [results, setResults] = useState<CityResult[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [expandedRegions, setExpandedRegions] = useState<Set<string>>(new Set());
  const [expandedCity, setExpandedCity] = useState<string | null>(null);
  const [searchFilter, setSearchFilter] = useState('');
  const [savingAll, setSavingAll] = useState(false);
  const [saveComplete, setSaveComplete] = useState(false);
  const abortRef = useRef(false);
  const pauseRef = useRef(false);

  const cities = country === 'uk' ? UK_AFFLUENT_CITIES : country === 'us' ? US_AFFLUENT_CITIES : CA_AFFLUENT_CITIES;
  const countryName = country === 'uk' ? 'United Kingdom' : country === 'us' ? 'United States' : 'Canada';
  const regions = getRegions(cities);
  const citiesByRegion = getCitiesByRegion(cities);

  const filteredRegions = searchFilter
    ? regions.filter(r =>
        r.toLowerCase().includes(searchFilter.toLowerCase()) ||
        citiesByRegion[r].some(c => c.name.toLowerCase().includes(searchFilter.toLowerCase()))
      )
    : regions;

  const toggleRegion = (region: string) => {
    const next = new Set(selectedRegions);
    const nextCities = new Set(selectedCities);
    if (next.has(region)) {
      next.delete(region);
      citiesByRegion[region].forEach(c => nextCities.delete(`${c.name}|${c.region}`));
    } else {
      next.add(region);
      citiesByRegion[region].forEach(c => nextCities.add(`${c.name}|${c.region}`));
    }
    setSelectedRegions(next);
    setSelectedCities(nextCities);
  };

  const toggleCity = (city: CityData) => {
    const key = `${city.name}|${city.region}`;
    const next = new Set(selectedCities);
    if (next.has(key)) next.delete(key); else next.add(key);
    setSelectedCities(next);
    const regionCities = citiesByRegion[city.region];
    const allSelected = regionCities.every(c => next.has(`${c.name}|${c.region}`));
    const nextRegions = new Set(selectedRegions);
    if (allSelected) nextRegions.add(city.region); else nextRegions.delete(city.region);
    setSelectedRegions(nextRegions);
  };

  const selectAll = () => { setSelectedRegions(new Set(regions)); setSelectedCities(new Set(cities.map(c => `${c.name}|${c.region}`))); };
  const clearAll = () => { setSelectedRegions(new Set()); setSelectedCities(new Set()); };
  const toggleExpandRegion = (region: string) => { const next = new Set(expandedRegions); if (next.has(region)) next.delete(region); else next.add(region); setExpandedRegions(next); };

  const getSelectedCityObjects = useCallback((): CityData[] => {
    return cities.filter(c => selectedCities.has(`${c.name}|${c.region}`));
  }, [cities, selectedCities]);

  const startScraping = async () => {
    if (!niche.trim()) { alert('Enter a niche to search for'); return; }
    const citiesToScrape = getSelectedCityObjects();
    if (citiesToScrape.length === 0) { alert('Select at least one city'); return; }

    abortRef.current = false;
    pauseRef.current = false;
    setIsRunning(true);
    setIsPaused(false);
    setSaveComplete(false);

    const initialResults: CityResult[] = citiesToScrape.map(city => ({
      city, status: 'pending', leadsFound: 0, leadsSaved: 0, leads: [],
    }));
    setResults(initialResults);

    for (let i = 0; i < citiesToScrape.length; i++) {
      if (abortRef.current) break;
      while (pauseRef.current && !abortRef.current) { await new Promise(resolve => setTimeout(resolve, 500)); }
      if (abortRef.current) break;

      setCurrentIndex(i);
      setResults(prev => prev.map((r, idx) => idx === i ? { ...r, status: 'scraping' } : r));

      try {
        const response = await fetch('/api/scrape', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ niche: niche.trim(), location: citiesToScrape[i].name, country: countryName, source: 'google_maps' }),
        });
        const data = await response.json();

        if (!response.ok) {
          setResults(prev => prev.map((r, idx) => idx === i ? { ...r, status: 'error', error: data.error || 'Scrape failed' } : r));
          continue;
        }

        const foundLeads: LeadResult[] = data.results || [];

        // Auto-save leads to Supabase with niche & country
        let savedCount = 0;
        if (foundLeads.length > 0) {
          for (const lead of foundLeads) {
            if (!lead.business_name) continue;
            try {
              const { data: existing } = await supabase
                .from('leads')
                .select('id')
                .eq('business_name', lead.business_name)
                .maybeSingle();
              if (existing) continue;

              const { error: insertErr } = await supabase.from('leads').insert({
                business_name: lead.business_name,
                niche: niche.trim() || null,
                address: lead.address || null,
                city: lead.city || citiesToScrape[i].name || null,
                country: countryName || null,
                phone: lead.phone || null,
                email: lead.email || null,
                website: lead.website || null,
                instagram_url: lead.instagram_url || null,
                google_rating: lead.google_rating || null,
                google_review_count: lead.google_review_count || null,
                source: lead.source || 'google_maps',
              });
              if (!insertErr) savedCount++;
              else console.error('Auto-save error:', insertErr.message);
            } catch { /* continue */ }
          }
        }

        // Log to scrape history (localStorage + Supabase)
        const citySessionData = {
          scrape_id: `city-${Date.now()}-${i}`,
          created_at: new Date().toISOString(),
          niche: niche.trim(), location: citiesToScrape[i].name, country: countryName,
          source: 'google_maps', status: 'complete',
          total_found: foundLeads.length, total_saved: savedCount,
          error_message: null,
          leads: foundLeads.map(l => ({ ...l, saved_to_db: savedCount > 0 })),
        };
        try {
          const logRaw = localStorage.getItem('prospex_scrape_log') || '[]';
          const log = JSON.parse(logRaw);
          log.unshift(citySessionData);
          localStorage.setItem('prospex_scrape_log', JSON.stringify(log.slice(0, 200)));
        } catch { /* silent */ }
        supabase.from('scrape_sessions').insert(citySessionData).then(() => {});

        setResults(prev => prev.map((r, idx) => idx === i ? {
          ...r, status: 'done', leadsFound: foundLeads.length, leadsSaved: savedCount, leads: foundLeads,
        } : r));
      } catch (error) {
        setResults(prev => prev.map((r, idx) => idx === i ? { ...r, status: 'error', error: error instanceof Error ? error.message : 'Network error' } : r));
      }

      if (i < citiesToScrape.length - 1) await new Promise(resolve => setTimeout(resolve, 2000));
    }
    setIsRunning(false);
  };

  const pauseScraping = () => { pauseRef.current = !pauseRef.current; setIsPaused(!isPaused); };
  const stopScraping = () => { abortRef.current = true; setIsRunning(false); setIsPaused(false); };

  const saveAllToDatabase = async () => {
    const allLeads = results.flatMap(r => r.leads.map(l => ({ ...l, scraped_city: r.city.name })));
    if (allLeads.length === 0) return;
    setSavingAll(true);
    let saved = 0;
    let skipped = 0;
    for (const lead of allLeads) {
      if (!lead.business_name) continue;
      try {
        // Check duplicate
        const { data: existing } = await supabase
          .from('leads')
          .select('id')
          .eq('business_name', lead.business_name)
          .maybeSingle();

        if (existing) { skipped++; continue; }

        const { error } = await supabase.from('leads').insert({
          business_name: lead.business_name,
          niche: niche.trim() || null,
          address: lead.address || null,
          city: lead.city || lead.scraped_city || null,
          country: countryName || null,
          phone: lead.phone || null,
          email: lead.email || null,
          website: lead.website || null,
          instagram_url: lead.instagram_url || null,
          google_rating: lead.google_rating || null,
          google_review_count: lead.google_review_count || null,
          source: lead.source || 'google_maps',
        });

        if (error) {
          console.error('Insert error:', error.message, error.details);
        } else {
          saved++;
        }
      } catch (err) { console.error('Save error:', err); }
    }
    console.log(`Save complete: ${saved} saved, ${skipped} skipped`);
    if (saved > 0 || skipped > 0) {
      setSaveComplete(true);
      setResults(prev => prev.map(r => ({ ...r, leadsSaved: r.leads.length })));
    }
    setSavingAll(false);
  };

  const exportResults = () => {
    const allLeads = results.flatMap(r => r.leads.map(l => ({ ...l, scraped_city: r.city.name, region: r.city.region })));
    if (allLeads.length === 0) return;
    const headers = ['Business Name', 'City', 'Region', 'Phone', 'Email', 'Website', 'Instagram', 'Rating', 'Reviews', 'Address', 'Source'];
    const rows = allLeads.map(l => [l.business_name, l.scraped_city, l.region, l.phone || '', l.email || '', l.website || '', l.instagram_url || '', l.google_rating?.toString() || '', l.google_review_count?.toString() || '', l.address || '', l.source]);
    const csv = [headers, ...rows].map(row => row.map(cell => `"${(cell || '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `city-scrape-${niche}-${new Date().toISOString().split('T')[0]}.csv`; a.click(); URL.revokeObjectURL(url);
  };

  const doneCount = results.filter(r => r.status === 'done').length;
  const errorCount = results.filter(r => r.status === 'error').length;
  const totalFound = results.reduce((sum, r) => sum + r.leadsFound, 0);
  const totalSaved = results.reduce((sum, r) => sum + r.leadsSaved, 0);

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="card p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-mono font-bold text-prospex-text flex items-center gap-3">
              <MapPin className="w-6 h-6 text-violet-400" /> City Scraper
            </h1>
            <p className="text-sm text-prospex-dim mt-1">Bulk scrape leads from affluent cities in UK, US &amp; Canada — all results auto-save to your lead database</p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-mono text-prospex-dim uppercase mb-1.5">Niche</label>
            <NicheAutocomplete value={niche} onChange={setNiche} placeholder="e.g. med spa, aesthetic clinic" disabled={isRunning} />
          </div>
          <div>
            <label className="block text-xs font-mono text-prospex-dim uppercase mb-1.5">Country</label>
            <div className="flex gap-2">
              {([['uk', '🇬🇧 UK'], ['us', '🇺🇸 US'], ['ca', '🇨🇦 CA']] as const).map(([c, label]) => (
                <button key={c} onClick={() => { setCountry(c as 'uk' | 'us' | 'ca'); clearAll(); }} disabled={isRunning}
                  className={cn('flex-1 py-2 rounded-lg text-sm font-medium border transition-all',
                    country === c ? 'bg-prospex-cyan/20 border-prospex-cyan/40 text-prospex-cyan' : 'bg-prospex-surface border-prospex-border text-prospex-muted')}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="md:col-span-2 flex items-end gap-2">
            {!isRunning ? (
              <button onClick={startScraping} disabled={selectedCities.size === 0 || !niche.trim()} className="btn-primary flex-1 text-sm">
                <Play className="w-4 h-4" /> Scrape {selectedCities.size} Cities
              </button>
            ) : (
              <>
                <button onClick={pauseScraping} className="btn flex-1 text-sm bg-amber-500/20 text-amber-400 border border-amber-500/40">
                  {isPaused ? <><Play className="w-4 h-4" /> Resume</> : <><Pause className="w-4 h-4" /> Pause</>}
                </button>
                <button onClick={stopScraping} className="btn text-sm bg-red-500/20 text-red-400 border border-red-500/40">
                  <X className="w-4 h-4" /> Stop
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* City Selector */}
        <div className="card p-0 max-h-[600px] flex flex-col">
          <div className="p-4 border-b border-prospex-border flex items-center justify-between shrink-0">
            <h2 className="font-mono font-semibold text-prospex-text text-sm flex items-center gap-2">
              <Building2 className="w-4 h-4 text-violet-400" /> {selectedCities.size} of {cities.length} cities selected
            </h2>
            <div className="flex items-center gap-2">
              <button onClick={selectAll} disabled={isRunning} className="btn-ghost text-[10px]">Select All</button>
              <button onClick={clearAll} disabled={isRunning} className="btn-ghost text-[10px]">Clear</button>
            </div>
          </div>
          <div className="px-4 py-2 border-b border-prospex-border shrink-0">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-prospex-dim" />
              <input value={searchFilter} onChange={(e) => setSearchFilter(e.target.value)} className="input pl-9 text-xs" placeholder="Filter cities or regions..." />
            </div>
          </div>
          <div className="overflow-y-auto flex-1">
            {filteredRegions.map(region => {
              const regionCities = citiesByRegion[region].filter(c => !searchFilter || c.name.toLowerCase().includes(searchFilter.toLowerCase()) || region.toLowerCase().includes(searchFilter.toLowerCase()));
              if (regionCities.length === 0) return null;
              const isExpanded = expandedRegions.has(region);
              const selectedInRegion = regionCities.filter(c => selectedCities.has(`${c.name}|${c.region}`)).length;
              return (
                <div key={region} className="border-b border-prospex-border/30">
                  <div className="flex items-center gap-2 px-4 py-2.5 hover:bg-prospex-surface/50 cursor-pointer" onClick={() => toggleExpandRegion(region)}>
                    <button onClick={(e) => { e.stopPropagation(); toggleRegion(region); }} disabled={isRunning}
                      className={cn('w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-all',
                        selectedRegions.has(region) ? 'bg-cyan-500 border-cyan-500' : selectedInRegion > 0 ? 'border-cyan-500/50 bg-cyan-500/20' : 'border-prospex-border')}>
                      {(selectedRegions.has(region) || selectedInRegion > 0) && <Check className="w-2.5 h-2.5 text-white" />}
                    </button>
                    {isExpanded ? <ChevronDown className="w-3.5 h-3.5 text-prospex-dim" /> : <ChevronRight className="w-3.5 h-3.5 text-prospex-dim" />}
                    <span className="text-xs font-mono font-semibold text-prospex-text flex-1">{region}</span>
                    <span className="text-[10px] text-prospex-dim font-mono">{selectedInRegion}/{regionCities.length}</span>
                  </div>
                  {isExpanded && (
                    <div className="pl-10 pr-4 pb-2 space-y-0.5">
                      {regionCities.map(city => {
                        const key = `${city.name}|${city.region}`;
                        return (
                          <label key={key} className="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-prospex-surface/50 cursor-pointer">
                            <input type="checkbox" checked={selectedCities.has(key)} onChange={() => toggleCity(city)} disabled={isRunning} className="w-3.5 h-3.5 rounded border-prospex-border accent-cyan-500" />
                            <span className="text-xs text-prospex-muted">{city.name}</span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Results / Progress */}
        <div className="card p-0 max-h-[600px] flex flex-col">
          <div className="p-4 border-b border-prospex-border flex items-center justify-between shrink-0">
            <h2 className="font-mono font-semibold text-prospex-text text-sm flex items-center gap-2">
              <Globe2 className="w-4 h-4 text-green-400" /> Scraping Progress
            </h2>
            <div className="flex items-center gap-1.5">
              {totalFound > 0 && !isRunning && (
                <button onClick={saveAllToDatabase} disabled={savingAll || saveComplete}
                  className={cn('flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-semibold rounded-lg transition-all',
                    saveComplete ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 'bg-prospex-cyan text-white hover:bg-prospex-cyan/80')}>
                  {savingAll ? <><Loader2 className="w-3 h-3 animate-spin" /> Saving...</> : saveComplete ? <><Check className="w-3 h-3" /> All Saved</> : <><Database className="w-3 h-3" /> Save All to DB</>}
                </button>
              )}
              {results.length > 0 && (
                <button onClick={exportResults} className="btn-ghost text-[10px]"><Download className="w-3 h-3" /> CSV</button>
              )}
            </div>
          </div>

          {results.length > 0 && (
            <div className="grid grid-cols-4 gap-3 p-4 border-b border-prospex-border shrink-0">
              {[
                { val: `${doneCount}/${results.length}`, label: 'Completed', color: 'text-cyan-400' },
                { val: totalFound, label: 'Leads Found', color: 'text-green-400' },
                { val: totalSaved, label: 'Saved to DB', color: 'text-violet-400' },
                { val: errorCount, label: 'Errors', color: 'text-red-400' },
              ].map(s => (
                <div key={s.label} className="text-center">
                  <p className={`text-xl font-mono font-bold ${s.color}`}>{s.val}</p>
                  <p className="text-[10px] text-prospex-dim font-mono">{s.label}</p>
                </div>
              ))}
            </div>
          )}

          {isRunning && results.length > 0 && (
            <div className="px-4 py-2 border-b border-prospex-border shrink-0">
              <div className="w-full bg-prospex-surface rounded-full h-2">
                <div className="h-2 rounded-full bg-gradient-to-r from-cyan-500 to-violet-500 transition-all duration-500"
                  style={{ width: `${((doneCount + errorCount) / results.length) * 100}%` }} />
              </div>
              <p className="text-[10px] text-prospex-dim font-mono mt-1 text-center">
                {isPaused ? '⏸ Paused' : `Scraping ${results[currentIndex]?.city.name || '...'}...`} ({doneCount + errorCount}/{results.length})
              </p>
            </div>
          )}

          <div className="overflow-y-auto flex-1">
            {results.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full p-8 text-center">
                <MapPin className="w-10 h-10 text-prospex-dim/30 mb-3" />
                <p className="text-sm text-prospex-dim">Select cities and click &quot;Scrape&quot; to begin</p>
                <p className="text-xs text-prospex-dim/50 mt-1">All leads auto-save to your database with niche &amp; country tags</p>
              </div>
            ) : (
              <div className="divide-y divide-prospex-border/30">
                {results.map((r, i) => (
                  <div key={i}>
                    <div
                      onClick={() => r.status === 'done' && r.leads.length > 0 ? setExpandedCity(expandedCity === r.city.name ? null : r.city.name) : undefined}
                      className={cn('flex items-center justify-between px-4 py-2.5 text-xs',
                        r.status === 'scraping' && 'bg-cyan-500/5',
                        r.status === 'error' && 'bg-red-500/5',
                        r.status === 'done' && r.leads.length > 0 && 'cursor-pointer hover:bg-prospex-bg/30')}>
                      <div className="flex items-center gap-2.5 min-w-0">
                        {r.status === 'pending' && <div className="w-2 h-2 rounded-full bg-prospex-dim/30" />}
                        {r.status === 'scraping' && <Loader2 className="w-3.5 h-3.5 text-cyan-400 animate-spin" />}
                        {r.status === 'done' && <Check className="w-3.5 h-3.5 text-green-400" />}
                        {r.status === 'error' && <X className="w-3.5 h-3.5 text-red-400" />}
                        <div className="min-w-0">
                          <p className="text-prospex-text font-mono truncate">{r.city.name}</p>
                          <p className="text-prospex-dim text-[10px]">{r.city.region}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-3">
                        {r.status === 'done' && (
                          <>
                            <p className="font-mono text-green-400">{r.leadsFound} found · {r.leadsSaved} saved</p>
                            {r.leads.length > 0 && (expandedCity === r.city.name ? <ChevronDown className="w-3.5 h-3.5 text-prospex-dim" /> : <ChevronRight className="w-3.5 h-3.5 text-prospex-dim" />)}
                          </>
                        )}
                        {r.status === 'error' && <p className="font-mono text-red-400 truncate max-w-[140px]">{r.error}</p>}
                        {r.status === 'scraping' && <p className="font-mono text-cyan-400">Scraping...</p>}
                      </div>
                    </div>
                    {expandedCity === r.city.name && r.leads.length > 0 && (
                      <div className="bg-prospex-bg/50 border-t border-prospex-border/20 px-4 py-2">
                        <table className="w-full">
                          <thead>
                            <tr>
                              {['Business', 'Phone', 'Email', 'Instagram', 'Rating'].map(h => (
                                <th key={h} className="text-left px-2 py-1.5 text-[9px] font-mono text-prospex-dim uppercase">{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {r.leads.map((lead, li) => (
                              <tr key={li} className="border-t border-prospex-border/10">
                                <td className="px-2 py-1.5">
                                  <p className="text-[10px] text-white font-medium">{lead.business_name}</p>
                                  <p className="text-[9px] text-prospex-dim truncate max-w-[160px]">{lead.address || '—'}</p>
                                </td>
                                <td className="px-2 py-1.5 text-[10px] text-prospex-muted font-mono">{lead.phone || '—'}</td>
                                <td className="px-2 py-1.5 text-[10px] text-prospex-muted truncate max-w-[120px]">{lead.email || '—'}</td>
                                <td className="px-2 py-1.5">
                                  {lead.instagram_url ? <a href={lead.instagram_url} target="_blank" rel="noopener noreferrer" className="text-[10px] text-pink-400 hover:text-pink-300">@{lead.instagram_url.split('/').filter(Boolean).pop()}</a> : <span className="text-[10px] text-prospex-dim">—</span>}
                                </td>
                                <td className="px-2 py-1.5">
                                  {lead.google_rating ? <span className="text-[10px] font-mono text-white">{lead.google_rating.toFixed(1)} <span className="text-prospex-dim">({lead.google_review_count})</span></span> : <span className="text-[10px] text-prospex-dim">—</span>}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
