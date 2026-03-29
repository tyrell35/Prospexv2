'use client';

import { useEffect, useState, useCallback } from 'react';
import { Globe, Search, Play, Loader2, Check, Filter, ToggleLeft, ToggleRight, MapPin, TrendingUp, Users, Clock } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';

interface Area {
  id: string;
  area_name: string;
  city: string;
  country: string;
  region: string | null;
  affluent_tier: number;
  last_scanned: string | null;
  times_scanned: number;
  total_prospects_found: number;
  qualified_prospects_found: number;
  active: boolean;
}

export default function AreasPage() {
  const [areas, setAreas] = useState<Area[]>([]);
  const [filtered, setFiltered] = useState<Area[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [countryFilter, setCountryFilter] = useState<string>('all');
  const [tierFilter, setTierFilter] = useState<string>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const fetchAreas = useCallback(async () => {
    const { data } = await supabase
      .from('affluent_areas')
      .select('*')
      .order('scan_priority', { ascending: true })
      .order('area_name', { ascending: true });
    if (data) {
      setAreas(data);
      setFiltered(data);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchAreas(); }, [fetchAreas]);

  useEffect(() => {
    let result = areas;
    if (countryFilter !== 'all') result = result.filter(a => a.country === countryFilter);
    if (tierFilter !== 'all') result = result.filter(a => a.affluent_tier === parseInt(tierFilter));
    if (search) {
      const s = search.toLowerCase();
      result = result.filter(a => a.area_name.toLowerCase().includes(s) || a.city.toLowerCase().includes(s) || (a.region || '').toLowerCase().includes(s));
    }
    setFiltered(result);
  }, [areas, countryFilter, tierFilter, search]);

  const handleScanSelected = async () => {
    if (selected.size === 0) return;
    setScanning(true);
    setScanResult(null);
    try {
      const ids = Array.from(selected);
      const results: Record<string, unknown>[] = [];
      for (const id of ids) {
        const res = await fetch(`/api/scan-areas?area_id=${id}`);
        const data = await res.json();
        results.push(data);
      }
      const total = results.reduce((s, r) => s + (Number(r.total_found) || 0), 0);
      const qualified = results.reduce((s, r) => s + (Number(r.qualified) || 0), 0);
      setScanResult(`Scanned ${ids.length} areas — ${total} prospects found, ${qualified} qualified`);
      setSelected(new Set());
      fetchAreas();
    } catch (err) {
      setScanResult(`Error: ${String(err)}`);
    }
    setScanning(false);
  };

  const handleScanBatch = async () => {
    setScanning(true);
    setScanResult(null);
    try {
      const res = await fetch('/api/scan-areas?count=3');
      const data = await res.json();
      setScanResult(`Scanned ${data.areas_scanned || 0} areas — ${data.total_found || 0} prospects, ${data.qualified || 0} qualified`);
      fetchAreas();
    } catch (err) {
      setScanResult(`Error: ${String(err)}`);
    }
    setScanning(false);
  };

  const toggleActive = async (id: string, current: boolean) => {
    await supabase.from('affluent_areas').update({ active: !current }).eq('id', id);
    setAreas(prev => prev.map(a => a.id === id ? { ...a, active: !current } : a));
  };

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // Stats
  const totalAreas = areas.length;
  const scannedThisWeek = areas.filter(a => {
    if (!a.last_scanned) return false;
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return new Date(a.last_scanned).getTime() > weekAgo;
  }).length;
  const prospectsThisWeek = areas.reduce((s, a) => s + (a.qualified_prospects_found || 0), 0);
  const tierCounts = { 1: areas.filter(a => a.affluent_tier === 1).length, 2: areas.filter(a => a.affluent_tier === 2).length, 3: areas.filter(a => a.affluent_tier === 3).length };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 text-prospex-cyan animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-mono text-prospex-text flex items-center gap-3">
            <Globe className="w-6 h-6 text-prospex-cyan" />
            Affluent Areas
          </h1>
          <p className="text-sm text-prospex-muted mt-1 font-mono">215 premium areas • automated prospect scanning</p>
        </div>
        <div className="flex items-center gap-3">
          {selected.size > 0 && (
            <button onClick={handleScanSelected} disabled={scanning}
              className="flex items-center gap-2 px-4 py-2 bg-prospex-green/20 border border-prospex-green/40 text-prospex-green rounded-lg text-sm font-mono hover:bg-prospex-green/30 transition-all disabled:opacity-50">
              {scanning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              Scan Selected ({selected.size})
            </button>
          )}
          <button onClick={handleScanBatch} disabled={scanning}
            className="flex items-center gap-2 px-4 py-2 bg-prospex-cyan/20 border border-prospex-cyan/40 text-prospex-cyan rounded-lg text-sm font-mono hover:bg-prospex-cyan/30 transition-all disabled:opacity-50">
            {scanning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            Scan Next 3
          </button>
        </div>
      </div>

      {/* Scan result banner */}
      {scanResult && (
        <div className="p-3 rounded-lg bg-prospex-green/10 border border-prospex-green/30 text-prospex-green text-sm font-mono flex items-center gap-2">
          <Check className="w-4 h-4" /> {scanResult}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Total Areas', value: totalAreas, icon: MapPin, color: 'cyan' },
          { label: 'Scanned This Week', value: scannedThisWeek, icon: Clock, color: 'blue' },
          { label: 'Qualified Prospects', value: prospectsThisWeek, icon: Users, color: 'green' },
          { label: 'Tier Distribution', value: `${tierCounts[1]}/${tierCounts[2]}/${tierCounts[3]}`, icon: TrendingUp, color: 'amber' },
        ].map(stat => (
          <div key={stat.label} className="p-4 rounded-lg bg-prospex-card border border-prospex-border">
            <div className="flex items-center gap-2 mb-2">
              <stat.icon className={`w-4 h-4 text-prospex-${stat.color}`} />
              <span className="text-xs font-mono text-prospex-dim uppercase">{stat.label}</span>
            </div>
            <p className={`text-2xl font-bold font-mono text-prospex-${stat.color}`}>{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-prospex-dim" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search areas..."
            className="w-full pl-10 pr-4 py-2.5 bg-prospex-card border border-prospex-border rounded-lg text-sm font-mono text-prospex-text placeholder:text-prospex-dim focus:border-prospex-cyan/50 focus:outline-none" />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-prospex-dim" />
          <select value={countryFilter} onChange={e => setCountryFilter(e.target.value)}
            className="bg-prospex-card border border-prospex-border rounded-lg px-3 py-2.5 text-sm font-mono text-prospex-text focus:border-prospex-cyan/50 focus:outline-none">
            <option value="all">All Countries</option>
            <option value="UK">UK</option>
            <option value="US">US</option>
            <option value="CA">Canada</option>
          </select>
          <select value={tierFilter} onChange={e => setTierFilter(e.target.value)}
            className="bg-prospex-card border border-prospex-border rounded-lg px-3 py-2.5 text-sm font-mono text-prospex-text focus:border-prospex-cyan/50 focus:outline-none">
            <option value="all">All Tiers</option>
            <option value="1">Tier 1 (Ultra)</option>
            <option value="2">Tier 2 (Premium)</option>
            <option value="3">Tier 3 (Affluent)</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="bg-prospex-card border border-prospex-border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-prospex-border">
                <th className="px-4 py-3 text-left text-[10px] font-mono uppercase tracking-wider text-prospex-dim">
                  <input type="checkbox" className="rounded border-prospex-border"
                    onChange={e => {
                      if (e.target.checked) setSelected(new Set(filtered.map(a => a.id)));
                      else setSelected(new Set());
                    }} />
                </th>
                <th className="px-4 py-3 text-left text-[10px] font-mono uppercase tracking-wider text-prospex-dim">Area</th>
                <th className="px-4 py-3 text-left text-[10px] font-mono uppercase tracking-wider text-prospex-dim">City</th>
                <th className="px-4 py-3 text-left text-[10px] font-mono uppercase tracking-wider text-prospex-dim">Country</th>
                <th className="px-4 py-3 text-left text-[10px] font-mono uppercase tracking-wider text-prospex-dim">Tier</th>
                <th className="px-4 py-3 text-left text-[10px] font-mono uppercase tracking-wider text-prospex-dim">Last Scanned</th>
                <th className="px-4 py-3 text-left text-[10px] font-mono uppercase tracking-wider text-prospex-dim">Prospects</th>
                <th className="px-4 py-3 text-left text-[10px] font-mono uppercase tracking-wider text-prospex-dim">Active</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(area => (
                <tr key={area.id} className={cn('border-b border-prospex-border/50 hover:bg-prospex-bg/50 transition-colors', selected.has(area.id) && 'bg-prospex-cyan/5')}>
                  <td className="px-4 py-3">
                    <input type="checkbox" checked={selected.has(area.id)} onChange={() => toggleSelect(area.id)} className="rounded border-prospex-border" />
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm font-mono text-prospex-text font-medium">{area.area_name}</span>
                    {area.region && <span className="text-xs text-prospex-dim ml-2">{area.region}</span>}
                  </td>
                  <td className="px-4 py-3 text-sm font-mono text-prospex-muted">{area.city}</td>
                  <td className="px-4 py-3">
                    <span className={cn('text-xs font-mono px-2 py-1 rounded-full',
                      area.country === 'UK' ? 'bg-blue-500/20 text-blue-400' :
                      area.country === 'US' ? 'bg-red-500/20 text-red-400' :
                      'bg-amber-500/20 text-amber-400'
                    )}>{area.country}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn('text-xs font-mono font-bold',
                      area.affluent_tier === 1 ? 'text-prospex-amber' :
                      area.affluent_tier === 2 ? 'text-prospex-cyan' :
                      'text-prospex-muted'
                    )}>T{area.affluent_tier}</span>
                  </td>
                  <td className="px-4 py-3 text-xs font-mono text-prospex-dim">
                    {area.last_scanned ? new Date(area.last_scanned).toLocaleDateString('en-GB') : 'Never'}
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm font-mono text-prospex-green">{area.qualified_prospects_found || 0}</span>
                    <span className="text-xs text-prospex-dim"> / {area.total_prospects_found || 0}</span>
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => toggleActive(area.id, area.active)} className="transition-colors">
                      {area.active
                        ? <ToggleRight className="w-5 h-5 text-prospex-green" />
                        : <ToggleLeft className="w-5 h-5 text-prospex-dim" />}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-3 border-t border-prospex-border text-xs font-mono text-prospex-dim">
          Showing {filtered.length} of {areas.length} areas
        </div>
      </div>
    </div>
  );
}
