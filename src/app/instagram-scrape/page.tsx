'use client';

import { useState } from 'react';
import {
  Instagram, Search, Loader2, Download, Database, CheckCircle, Users,
  Mail, Phone, Globe, ExternalLink, ChevronDown, ChevronUp, Zap,
  AlertTriangle, RefreshCw, Filter, Star, Eye,
} from 'lucide-react';
import LocationAutocomplete from '@/components/LocationAutocomplete';

const COUNTRIES = ['United Kingdom', 'United States', 'Canada', 'Australia', 'Ireland', 'Germany', 'France', 'Spain', 'Italy', 'Netherlands'];

interface InstagramLead {
  username: string;
  full_name: string;
  business_name: string;
  bio: string;
  website: string | null;
  email: string | null;
  phone: string | null;
  follower_count: number | null;
  following_count: number | null;
  post_count: number | null;
  is_business: boolean;
  business_category: string | null;
  profile_url: string;
  profile_pic: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
}

export default function InstagramScrapePage() {
  const [niche, setNiche] = useState('');
  const [location, setLocation] = useState('');
  const [country, setCountry] = useState('United Kingdom');
  const [method, setMethod] = useState<'google' | 'apify'>('google');
  const [maxResults, setMaxResults] = useState(20);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [leads, setLeads] = useState<InstagramLead[]>([]);
  const [totalFound, setTotalFound] = useState(0);
  const [savedCount, setSavedCount] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [filterHasEmail, setFilterHasEmail] = useState(false);
  const [filterHasPhone, setFilterHasPhone] = useState(false);

  const handleScrape = async () => {
    if (!niche || !location) return;
    setLoading(true);
    setError(null);
    setLeads([]);
    setSaved(false);
    setSavedCount(0);
    try {
      const res = await fetch('/api/instagram-scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ niche, location, country, method, maxResults, saveToDb: false }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Scrape failed');
      setLeads(data.leads || []);
      setTotalFound(data.total_found || 0);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Instagram scrape failed');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveAll = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/instagram-scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ niche, location, country, method, maxResults, saveToDb: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Save failed');
      setSavedCount(data.saved_to_db || 0);
      setSaved(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleExportCSV = () => {
    if (leads.length === 0) return;
    const headers = ['Username', 'Business Name', 'Email', 'Phone', 'Website', 'Bio', 'Followers', 'Posts', 'City', 'Profile URL'];
    const rows = filteredLeads.map(l => [
      l.username, l.business_name, l.email || '', l.phone || '', l.website || '',
      `"${(l.bio || '').replace(/"/g, '""')}"`, l.follower_count || '', l.post_count || '',
      l.city || '', l.profile_url,
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `instagram-${niche}-${location}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  const filteredLeads = leads.filter(l => {
    if (filterHasEmail && !l.email) return false;
    if (filterHasPhone && !l.phone) return false;
    return true;
  });

  const displayLeads = showAll ? filteredLeads : filteredLeads.slice(0, 10);
  const withEmail = leads.filter(l => l.email).length;
  const withPhone = leads.filter(l => l.phone).length;
  const withWebsite = leads.filter(l => l.website).length;
  const businessAccounts = leads.filter(l => l.is_business).length;

  const formatCount = (n: number | null): string => {
    if (!n) return '—';
    if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
    return n.toString();
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-mono font-bold text-prospex-text flex items-center gap-3">
          <Instagram className="w-7 h-7 text-pink-400" />
          Instagram Scraper
        </h1>
        <p className="text-sm text-prospex-dim mt-1">Find B2B business profiles on Instagram with public contact info</p>
      </div>

      {/* Search Form */}
      <div className="card p-6">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div>
            <label className="text-xs font-mono text-prospex-dim uppercase block mb-1.5">Niche</label>
            <input value={niche} onChange={e => setNiche(e.target.value)}
              placeholder="e.g. med spa, aesthetics, beauty"
              className="input w-full" />
          </div>
          <div>
            <label className="text-xs font-mono text-prospex-dim uppercase block mb-1.5">Location</label>
            <LocationAutocomplete value={location} onChange={setLocation} country={country}
              placeholder="e.g. London, Manchester" />
          </div>
          <div>
            <label className="text-xs font-mono text-prospex-dim uppercase block mb-1.5">Country</label>
            <select value={country} onChange={e => setCountry(e.target.value)} className="input w-full">
              {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-mono text-prospex-dim uppercase block mb-1.5">Method</label>
            <select value={method} onChange={e => setMethod(e.target.value as 'google' | 'apify')} className="input w-full">
              <option value="google">Google + Firecrawl (Free)</option>
              <option value="apify">Apify (Paid — more data)</option>
            </select>
          </div>
          <div className="flex items-end">
            <button onClick={handleScrape} disabled={loading || !niche || !location}
              className="btn-primary w-full py-2.5">
              {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Searching...</>
                : <><Instagram className="w-4 h-4" /> Find Profiles</>}
            </button>
          </div>
        </div>

        {/* Method info */}
        <div className="mt-3 flex items-start gap-2">
          {method === 'google' ? (
            <p className="text-[10px] text-prospex-dim">
              <span className="text-green-400 font-semibold">Free method:</span> Searches Google for Instagram business profiles, then scrapes contact info via Firecrawl. Requires FIRECRAWL_API_KEY + (GOOGLE_API_KEY + GOOGLE_CSE_ID or SERPAPI_KEY).
            </p>
          ) : (
            <p className="text-[10px] text-prospex-dim">
              <span className="text-cyan-400 font-semibold">Paid method:</span> Uses Apify&apos;s Instagram scraper for deeper data including business emails, phone numbers, and follower metrics. Requires APIFY_API_KEY (~$49/mo).
            </p>
          )}
        </div>

        {error && (
          <div className="mt-3 p-3 bg-red-500/10 border border-red-500/20 rounded-lg flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        {loading && (
          <div className="mt-4 p-4 bg-pink-500/5 border border-pink-500/20 rounded-lg">
            <p className="text-sm text-pink-400 font-mono">Searching Instagram for {niche} businesses in {location}...</p>
            <p className="text-xs text-prospex-dim mt-1">
              {method === 'google' ? 'Searching Google → scraping profiles via Firecrawl...' : 'Running Apify Instagram scraper...'}
              This may take 30-90 seconds.
            </p>
          </div>
        )}
      </div>

      {/* Results */}
      {leads.length > 0 && (
        <>
          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div className="card p-4 text-center">
              <Users className="w-5 h-5 text-pink-400 mx-auto mb-1" />
              <p className="text-2xl font-mono font-bold text-prospex-text">{totalFound}</p>
              <p className="text-[10px] text-prospex-dim uppercase font-mono">Profiles Found</p>
            </div>
            <div className="card p-4 text-center">
              <Mail className="w-5 h-5 text-green-400 mx-auto mb-1" />
              <p className="text-2xl font-mono font-bold text-green-400">{withEmail}</p>
              <p className="text-[10px] text-prospex-dim uppercase font-mono">With Email</p>
            </div>
            <div className="card p-4 text-center">
              <Phone className="w-5 h-5 text-blue-400 mx-auto mb-1" />
              <p className="text-2xl font-mono font-bold text-blue-400">{withPhone}</p>
              <p className="text-[10px] text-prospex-dim uppercase font-mono">With Phone</p>
            </div>
            <div className="card p-4 text-center">
              <Globe className="w-5 h-5 text-cyan-400 mx-auto mb-1" />
              <p className="text-2xl font-mono font-bold text-cyan-400">{withWebsite}</p>
              <p className="text-[10px] text-prospex-dim uppercase font-mono">With Website</p>
            </div>
            <div className="card p-4 text-center">
              <Star className="w-5 h-5 text-amber-400 mx-auto mb-1" />
              <p className="text-2xl font-mono font-bold text-amber-400">{businessAccounts}</p>
              <p className="text-[10px] text-prospex-dim uppercase font-mono">Business Accts</p>
            </div>
          </div>

          {/* Actions Bar */}
          <div className="card p-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3">
                {/* Filters */}
                <label className="flex items-center gap-1.5 text-xs text-prospex-dim cursor-pointer">
                  <input type="checkbox" checked={filterHasEmail} onChange={e => setFilterHasEmail(e.target.checked)} className="rounded" />
                  Has email ({withEmail})
                </label>
                <label className="flex items-center gap-1.5 text-xs text-prospex-dim cursor-pointer">
                  <input type="checkbox" checked={filterHasPhone} onChange={e => setFilterHasPhone(e.target.checked)} className="rounded" />
                  Has phone ({withPhone})
                </label>
                <span className="text-xs text-prospex-dim font-mono">
                  Showing {filteredLeads.length} of {leads.length}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={handleExportCSV} className="btn-ghost text-xs">
                  <Download className="w-3 h-3" /> Export CSV
                </button>
                <button onClick={handleSaveAll} disabled={saving || saved} className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                  saved ? 'bg-green-500/20 text-green-400 border border-green-500/40'
                    : 'bg-prospex-cyan text-white hover:bg-prospex-cyan/80'
                }`}>
                  {saving ? <><RefreshCw className="w-3 h-3 animate-spin" /> Saving...</>
                    : saved ? <><CheckCircle className="w-3 h-3" /> {savedCount} Saved to DB</>
                    : <><Database className="w-3 h-3" /> Save All to DB</>}
                </button>
              </div>
            </div>
          </div>

          {/* Lead Cards */}
          <div className="space-y-3">
            {displayLeads.map((lead, i) => (
              <div key={i} className="card p-4 hover:border-pink-500/30 transition-colors">
                <div className="flex items-start gap-4">
                  {/* Avatar */}
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-pink-500 to-purple-500 flex items-center justify-center text-white font-bold text-sm shrink-0">
                    {lead.username.slice(0, 2).toUpperCase()}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-prospex-text">{lead.business_name || lead.username}</p>
                      <a href={lead.profile_url} target="_blank" rel="noopener noreferrer"
                        className="text-[10px] text-pink-400 hover:text-pink-300 flex items-center gap-0.5">
                        @{lead.username} <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                      {lead.is_business && (
                        <span className="text-[9px] px-1.5 py-0.5 bg-cyan-500/10 text-cyan-400 rounded-full border border-cyan-500/20">Business</span>
                      )}
                      {lead.business_category && (
                        <span className="text-[9px] px-1.5 py-0.5 bg-purple-500/10 text-purple-400 rounded-full">{lead.business_category}</span>
                      )}
                    </div>

                    {lead.bio && (
                      <p className="text-xs text-prospex-muted mt-1 line-clamp-2">{lead.bio}</p>
                    )}

                    {/* Contact Row */}
                    <div className="flex items-center gap-4 mt-2 flex-wrap">
                      {lead.email && (
                        <span className="text-[11px] text-green-400 flex items-center gap-1">
                          <Mail className="w-3 h-3" /> {lead.email}
                        </span>
                      )}
                      {lead.phone && (
                        <span className="text-[11px] text-blue-400 flex items-center gap-1">
                          <Phone className="w-3 h-3" /> {lead.phone}
                        </span>
                      )}
                      {lead.website && (
                        <a href={lead.website} target="_blank" rel="noopener noreferrer"
                          className="text-[11px] text-cyan-400 hover:text-cyan-300 flex items-center gap-1">
                          <Globe className="w-3 h-3" /> {lead.website.replace(/https?:\/\/(www\.)?/, '').slice(0, 30)}
                        </a>
                      )}
                      {lead.city && (
                        <span className="text-[11px] text-prospex-dim">📍 {lead.city}</span>
                      )}
                    </div>
                  </div>

                  {/* Metrics */}
                  <div className="shrink-0 text-right space-y-1">
                    {lead.follower_count !== null && (
                      <div>
                        <p className="text-sm font-mono font-bold text-prospex-text">{formatCount(lead.follower_count)}</p>
                        <p className="text-[9px] text-prospex-dim uppercase">followers</p>
                      </div>
                    )}
                    {lead.post_count !== null && (
                      <p className="text-[10px] text-prospex-dim font-mono">{formatCount(lead.post_count)} posts</p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Show More */}
          {!showAll && filteredLeads.length > 10 && (
            <button onClick={() => setShowAll(true)} className="w-full text-center py-3 text-xs text-prospex-cyan hover:text-prospex-text font-mono transition-colors">
              Show all {filteredLeads.length} profiles
            </button>
          )}
        </>
      )}

      {/* Empty State */}
      {!loading && leads.length === 0 && !error && (
        <div className="card p-12 text-center">
          <Instagram className="w-12 h-12 text-prospex-dim mx-auto mb-3" />
          <p className="text-sm text-prospex-dim font-mono">Search for business profiles on Instagram</p>
          <p className="text-xs text-prospex-dim mt-2">Enter a niche and location to find B2B accounts with public contact info</p>
        </div>
      )}
    </div>
  );
}
