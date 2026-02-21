'use client';

import { useState } from 'react';
import {
  BarChart3,
  Search,
  Loader2,
  TrendingUp,
  TrendingDown,
  Globe,
  Star,
  MessageCircle,
  Megaphone,
  Calendar,
  Users,
  Target,
  AlertTriangle,
  CheckCircle,
  XCircle,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Database,
  Shield,
  Check,
  RefreshCw,
} from 'lucide-react';
import { cn, getScoreColor } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import LocationAutocomplete from '@/components/LocationAutocomplete';

const COUNTRIES = ['United Kingdom', 'United States', 'Canada', 'Australia', 'Ireland', 'Germany', 'France', 'Spain', 'Italy', 'Netherlands'];

interface MarketBusiness {
  id?: string;
  business_name: string;
  website: string | null;
  phone: string | null;
  email: string | null;
  address?: string | null;
  city?: string | null;
  google_rating: number | null;
  google_review_count: number | null;
  has_website: boolean;
  website_score: number | null;
  has_ssl: boolean;
  has_booking: boolean;
  has_social_media: boolean;
  ad_activity: 'active' | 'pixel_only' | 'none' | 'unknown';
  social_platforms: string[];
  strengths: string[];
  weaknesses: string[];
  instagram_url?: string | null;
}

interface MarketAnalysis {
  niche: string;
  location: string;
  country: string;
  total_businesses: number;
  market_overview: {
    avg_rating: number;
    avg_review_count: number;
    avg_website_score: number;
    pct_with_website: number;
    pct_with_email: number;
    pct_with_booking: number;
    pct_with_ssl: number;
    pct_with_social: number;
    pct_running_ads: number;
  };
  top_performers: MarketBusiness[];
  weakest_performers: MarketBusiness[];
  all_businesses: MarketBusiness[];
  opportunities: string[];
  pitch_angles: { angle: string; target_count: number; description: string }[];
}

function StatCard({ icon: Icon, label, value, subtext, color }: { icon: typeof Star; label: string; value: string; subtext?: string; color: string }) {
  return (
    <div className="card p-4 text-center">
      <Icon className={cn('w-5 h-5 mx-auto mb-2', color)} />
      <p className="text-2xl font-mono font-bold text-prospex-text">{value}</p>
      <p className="text-xs font-mono text-prospex-dim uppercase mt-1">{label}</p>
      {subtext && <p className="text-[10px] text-prospex-muted mt-1">{subtext}</p>}
    </div>
  );
}

function AdBadge({ activity }: { activity: string }) {
  const configs: Record<string, { label: string; color: string }> = {
    active: { label: '🟢 Running Ads', color: 'bg-green-500/20 text-green-400 border-green-500/40' },
    pixel_only: { label: '🟡 Pixel Only', color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/40' },
    none: { label: '🔴 No Ads', color: 'bg-red-500/20 text-red-400 border-red-500/40' },
    unknown: { label: '⚪ Unknown', color: 'bg-gray-500/20 text-gray-400 border-gray-500/40' },
  };
  const config = configs[activity] || configs.unknown;
  return <span className={cn('badge text-[10px]', config.color)}>{config.label}</span>;
}

export default function MarketAnalysisPage() {
  const [niche, setNiche] = useState('');
  const [location, setLocation] = useState('');
  const [country, setCountry] = useState('United Kingdom');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<MarketAnalysis | null>(null);
  const [expandedBusiness, setExpandedBusiness] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const [savingLeads, setSavingLeads] = useState<Set<string>>(new Set());
  const [savedLeads, setSavedLeads] = useState<Set<string>>(new Set());
  const [auditingLeads, setAuditingLeads] = useState<Set<string>>(new Set());
  const [auditedLeads, setAuditedLeads] = useState<Set<string>>(new Set());
  const [savingAll, setSavingAll] = useState(false);
  const [allSaved, setAllSaved] = useState(false);

  const handleAnalyze = async () => {
    if (!niche || !location) return;
    setLoading(true);
    setError(null);
    setAnalysis(null);
    setSavedLeads(new Set());
    setAuditedLeads(new Set());
    setAllSaved(false);
    try {
      const response = await fetch('/api/market-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ niche, location, country }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Analysis failed');
      setAnalysis(data.analysis);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Analysis failed');
    } finally {
      setLoading(false);
    }
  };

  const saveToDatabase = async (business: MarketBusiness) => {
    const key = business.business_name;
    setSavingLeads(prev => new Set(prev).add(key));
    try {
      const { data: existing } = await supabase
        .from('leads')
        .select('id')
        .eq('business_name', business.business_name)
        .maybeSingle();

      if (existing) {
        setSavedLeads(prev => new Set(prev).add(key));
        business.id = existing.id;
        return existing.id;
      }

      const { data, error: insertError } = await supabase.from('leads').insert({
        business_name: business.business_name,
        niche: analysis?.niche || null,
        address: business.address || null,
        city: business.city || analysis?.location || null,
        country: analysis?.country || null,
        phone: business.phone || null,
        email: business.email || null,
        website: business.website || null,
        instagram_url: business.instagram_url || null,
        google_rating: business.google_rating || null,
        google_review_count: business.google_review_count || null,
        source: 'market_analysis',
        lead_priority: 'new',
      }).select('id').single();

      if (insertError) throw insertError;
      setSavedLeads(prev => new Set(prev).add(key));
      business.id = data?.id;
      return data?.id;
    } catch (err) {
      console.error('Failed to save lead:', err);
      return null;
    } finally {
      setSavingLeads(prev => { const next = new Set(prev); next.delete(key); return next; });
    }
  };

  const saveAllToDatabase = async () => {
    if (!analysis) return;
    setSavingAll(true);
    for (const business of analysis.all_businesses) {
      if (savedLeads.has(business.business_name)) continue;
      await saveToDatabase(business);
    }
    setSavingAll(false);
    setAllSaved(true);
  };

  const saveAndAudit = async (business: MarketBusiness) => {
    const key = business.business_name;
    setAuditingLeads(prev => new Set(prev).add(key));
    try {
      let leadId = business.id;
      if (!leadId && !savedLeads.has(key)) {
        leadId = await saveToDatabase(business);
      }
      if (!leadId) {
        const { data: existing } = await supabase
          .from('leads')
          .select('id')
          .eq('business_name', business.business_name)
          .maybeSingle();
        leadId = existing?.id;
      }
      if (!leadId) throw new Error('Could not save lead');

      const auditResponse = await fetch('/api/pitch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId }),
      });
      if (auditResponse.ok) {
        setAuditedLeads(prev => new Set(prev).add(key));
      }
    } catch (err) {
      console.error('Audit failed:', err);
    } finally {
      setAuditingLeads(prev => { const next = new Set(prev); next.delete(key); return next; });
    }
  };

  const savedCount = savedLeads.size;
  const totalBusinesses = analysis?.all_businesses.length || 0;

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-mono font-bold text-prospex-text flex items-center gap-3">
          <BarChart3 className="w-7 h-7 text-prospex-cyan" />
          Market Analysis
        </h1>
        <p className="text-sm text-prospex-dim mt-1">Analyze the competitive landscape for any niche + location</p>
      </div>

      <div className="card p-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="text-xs font-mono text-prospex-dim uppercase block mb-1.5">Niche</label>
            <input value={niche} onChange={e => setNiche(e.target.value)} placeholder="e.g. med spa, dentist, hair salon" className="input w-full" />
          </div>
          <div>
            <label className="text-xs font-mono text-prospex-dim uppercase block mb-1.5">Location</label>
            <LocationAutocomplete value={location} onChange={setLocation} country={country} placeholder="e.g. Leeds, Manchester, London" />
          </div>
          <div>
            <label className="text-xs font-mono text-prospex-dim uppercase block mb-1.5">Country</label>
            <select value={country} onChange={e => setCountry(e.target.value)} className="input w-full">
              {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="flex items-end">
            <button onClick={handleAnalyze} disabled={loading || !niche || !location} className="btn-primary w-full py-2.5">
              {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Analyzing market...</> : <><Search className="w-4 h-4" /> Analyze Market</>}
            </button>
          </div>
        </div>
        {error && <p className="text-sm text-prospex-red mt-3">{error}</p>}
        {loading && (
          <div className="mt-4 p-4 bg-prospex-cyan/5 border border-prospex-cyan/20 rounded-lg">
            <p className="text-sm text-prospex-cyan font-mono">Scanning websites, detecting ads, and building competitive landscape...</p>
            <p className="text-xs text-prospex-dim mt-1">This takes 30-60 seconds as we analyze each business&apos;s website</p>
          </div>
        )}
      </div>

      {analysis && (
        <>
          <div>
            <h2 className="text-lg font-mono font-semibold text-prospex-text mb-3 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-prospex-cyan" />
              Market Overview — {analysis.total_businesses} businesses in {analysis.location}
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
              <StatCard icon={Star} label="Avg Rating" value={`${analysis.market_overview.avg_rating}`} subtext="out of 5.0" color="text-yellow-400" />
              <StatCard icon={MessageCircle} label="Avg Reviews" value={`${analysis.market_overview.avg_review_count}`} subtext="per business" color="text-blue-400" />
              <StatCard icon={Globe} label="Avg Website Score" value={`${analysis.market_overview.avg_website_score}`} subtext="out of 100" color="text-cyan-400" />
              <StatCard icon={Megaphone} label="Running Ads" value={`${analysis.market_overview.pct_running_ads}%`} subtext="of businesses" color="text-green-400" />
              <StatCard icon={Calendar} label="Online Booking" value={`${analysis.market_overview.pct_with_booking}%`} subtext="of businesses" color="text-purple-400" />
            </div>
          </div>

          <div className="card p-6">
            <h2 className="text-lg font-mono font-semibold text-prospex-text mb-4 flex items-center gap-2">
              <Target className="w-5 h-5 text-prospex-red" />
              Pitch Angles — Where to Focus Outreach
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {analysis.pitch_angles.map((angle, i) => (
                <div key={i} className="p-4 bg-prospex-surface/50 border border-prospex-border/30 rounded-lg hover:border-prospex-cyan/30 transition-colors">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-base font-medium text-prospex-text">{angle.angle}</span>
                    <span className="badge bg-prospex-red/20 text-prospex-red border-prospex-red/40 text-xs font-mono">{angle.target_count} leads</span>
                  </div>
                  <p className="text-xs text-prospex-muted leading-relaxed">{angle.description}</p>
                </div>
              ))}
            </div>
          </div>

          {analysis.opportunities.length > 0 && (
            <div className="card p-6">
              <h2 className="text-lg font-mono font-semibold text-prospex-text mb-4 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-400" />
                Market Opportunities
              </h2>
              <div className="space-y-3">
                {analysis.opportunities.map((opp, i) => (
                  <div key={i} className="flex items-start gap-3 p-3 bg-amber-500/5 border border-amber-500/10 rounded-lg">
                    <span className="text-amber-400 text-sm mt-0.5">💡</span>
                    <p className="text-sm text-prospex-text">{opp}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="card p-6">
              <h2 className="text-base font-mono font-semibold text-prospex-text mb-4 flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-prospex-green" />
                Top Performers
              </h2>
              <div className="space-y-3">
                {analysis.top_performers.slice(0, 5).map((b, i) => {
                  const key = b.business_name;
                  const isSaving = savingLeads.has(key);
                  const isSaved = savedLeads.has(key);
                  const isAuditing = auditingLeads.has(key);
                  const isAudited = auditedLeads.has(key);
                  return (
                    <div key={i} className="p-3 bg-green-500/5 border border-green-500/10 rounded-lg">
                      <div className="flex items-center justify-between">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-mono text-prospex-dim">#{i + 1}</span>
                            <p className="text-sm font-medium text-prospex-text truncate">{b.business_name}</p>
                          </div>
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            {b.google_rating && <span className="text-xs text-yellow-400 font-mono">★ {b.google_rating}</span>}
                            {b.google_review_count !== null && <span className="text-xs text-prospex-dim font-mono">({b.google_review_count} reviews)</span>}
                            {b.website_score !== null && <span className={cn('text-xs font-mono', getScoreColor(b.website_score))}>Web: {b.website_score}</span>}
                            <AdBadge activity={b.ad_activity} />
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0 ml-2">
                          <button onClick={(e) => { e.stopPropagation(); saveToDatabase(b); }} disabled={isSaving || isSaved}
                            className={cn('flex items-center gap-1 px-2 py-1 text-[10px] rounded-md font-medium transition-colors',
                              isSaved ? 'bg-green-500/20 text-green-400' : 'bg-prospex-cyan/10 text-prospex-cyan hover:bg-prospex-cyan/20')}>
                            {isSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : isSaved ? <Check className="w-3 h-3" /> : <Database className="w-3 h-3" />}
                            {isSaved ? 'Saved' : 'Save'}
                          </button>
                          <button onClick={(e) => { e.stopPropagation(); saveAndAudit(b); }} disabled={isAuditing || isAudited}
                            className={cn('flex items-center gap-1 px-2 py-1 text-[10px] rounded-md font-medium transition-colors',
                              isAudited ? 'bg-green-500/20 text-green-400' : 'bg-purple-500/10 text-purple-400 hover:bg-purple-500/20')}>
                            {isAuditing ? <Loader2 className="w-3 h-3 animate-spin" /> : isAudited ? <Check className="w-3 h-3" /> : <Shield className="w-3 h-3" />}
                            {isAudited ? 'Audited' : 'Audit'}
                          </button>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1 mt-2">
                        {b.strengths.map((s, j) => <span key={j} className="text-[10px] px-1.5 py-0.5 bg-green-500/10 text-green-400 rounded">{s}</span>)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="card p-6">
              <h2 className="text-base font-mono font-semibold text-prospex-text mb-4 flex items-center gap-2">
                <TrendingDown className="w-5 h-5 text-prospex-red" />
                Weakest Performers (Best Pitch Targets)
              </h2>
              <div className="space-y-3">
                {analysis.weakest_performers.slice(0, 5).map((b, i) => {
                  const key = b.business_name;
                  const isSaving = savingLeads.has(key);
                  const isSaved = savedLeads.has(key);
                  const isAuditing = auditingLeads.has(key);
                  const isAudited = auditedLeads.has(key);
                  return (
                    <div key={i} className="p-3 bg-red-500/5 border border-red-500/10 rounded-lg">
                      <div className="flex items-center justify-between">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-prospex-text truncate">{b.business_name}</p>
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            {b.google_rating && <span className="text-xs text-yellow-400 font-mono">★ {b.google_rating}</span>}
                            {b.google_review_count !== null && <span className="text-xs text-prospex-dim font-mono">({b.google_review_count} reviews)</span>}
                            {b.website_score !== null && <span className={cn('text-xs font-mono', getScoreColor(b.website_score))}>Web: {b.website_score}</span>}
                            <AdBadge activity={b.ad_activity} />
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0 ml-2">
                          <button onClick={(e) => { e.stopPropagation(); saveToDatabase(b); }} disabled={isSaving || isSaved}
                            className={cn('flex items-center gap-1 px-2 py-1 text-[10px] rounded-md font-medium transition-colors',
                              isSaved ? 'bg-green-500/20 text-green-400' : 'bg-prospex-cyan/10 text-prospex-cyan hover:bg-prospex-cyan/20')}>
                            {isSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : isSaved ? <Check className="w-3 h-3" /> : <Database className="w-3 h-3" />}
                            {isSaved ? 'Saved' : 'Save'}
                          </button>
                          <button onClick={(e) => { e.stopPropagation(); saveAndAudit(b); }} disabled={isAuditing || isAudited}
                            className={cn('flex items-center gap-1 px-2 py-1 text-[10px] rounded-md font-medium transition-colors',
                              isAudited ? 'bg-green-500/20 text-green-400' : 'bg-purple-500/10 text-purple-400 hover:bg-purple-500/20')}>
                            {isAuditing ? <Loader2 className="w-3 h-3 animate-spin" /> : isAudited ? <Check className="w-3 h-3" /> : <Shield className="w-3 h-3" />}
                            {isAudited ? 'Audited' : 'Audit'}
                          </button>
                          {(isSaved || b.id) && (
                            <a href={`/leads/${b.id}`} className="flex items-center gap-1 px-2 py-1 text-[10px] rounded-md font-medium bg-prospex-bg text-prospex-muted hover:text-prospex-cyan transition-colors">
                              <ExternalLink className="w-3 h-3" /> View
                            </a>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1 mt-2">
                        {b.weaknesses.map((w, j) => <span key={j} className="text-[10px] px-1.5 py-0.5 bg-red-500/10 text-red-400 rounded">{w}</span>)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="card p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-mono font-semibold text-prospex-text flex items-center gap-2">
                <Users className="w-5 h-5 text-prospex-cyan" />
                All Businesses ({analysis.all_businesses.length})
              </h2>
              <div className="flex items-center gap-2">
                <button onClick={saveAllToDatabase} disabled={savingAll || allSaved}
                  className={cn('flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors',
                    allSaved ? 'bg-green-500/20 text-green-400 border border-green-500/40' : 'bg-prospex-cyan text-white hover:bg-prospex-cyan/80')}>
                  {savingAll ? <><RefreshCw className="w-3 h-3 animate-spin" /> Saving {savedCount}/{totalBusinesses}...</>
                    : allSaved ? <><Check className="w-3 h-3" /> All Saved to DB</>
                    : <><Database className="w-3 h-3" /> Save All to DB ({totalBusinesses})</>}
                </button>
                <button onClick={() => setShowAll(!showAll)} className="btn-ghost text-xs">
                  {showAll ? <><ChevronUp className="w-3 h-3" /> Collapse</> : <><ChevronDown className="w-3 h-3" /> Show All</>}
                </button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="table-header">
                    <th className="text-left px-3 py-2.5 text-xs font-mono text-prospex-dim uppercase">Business</th>
                    <th className="text-center px-3 py-2.5 text-xs font-mono text-prospex-dim uppercase">Rating</th>
                    <th className="text-center px-3 py-2.5 text-xs font-mono text-prospex-dim uppercase">Reviews</th>
                    <th className="text-center px-3 py-2.5 text-xs font-mono text-prospex-dim uppercase">Web Score</th>
                    <th className="text-center px-3 py-2.5 text-xs font-mono text-prospex-dim uppercase">Booking</th>
                    <th className="text-center px-3 py-2.5 text-xs font-mono text-prospex-dim uppercase">Social</th>
                    <th className="text-center px-3 py-2.5 text-xs font-mono text-prospex-dim uppercase">Ads</th>
                    <th className="text-right px-3 py-2.5 text-xs font-mono text-prospex-dim uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {(showAll ? analysis.all_businesses : analysis.all_businesses.slice(0, 10)).map((b, i) => {
                    const key = b.business_name;
                    const isSaving = savingLeads.has(key);
                    const isSaved = savedLeads.has(key);
                    const isAuditing = auditingLeads.has(key);
                    const isAudited = auditedLeads.has(key);
                    return (
                      <tr key={i} className="table-row hover:bg-prospex-surface/50">
                        <td className="px-3 py-2.5">
                          <button onClick={() => setExpandedBusiness(expandedBusiness === b.business_name ? null : b.business_name)} className="text-left">
                            <p className="text-sm font-medium text-prospex-text">{b.business_name}</p>
                            {b.website && <p className="text-[10px] text-prospex-muted truncate max-w-[200px]">{b.website}</p>}
                          </button>
                          {expandedBusiness === b.business_name && (
                            <div className="mt-2 space-y-1">
                              <div className="flex flex-wrap gap-1">
                                {b.strengths.map((s, j) => <span key={`s${j}`} className="text-[10px] px-1.5 py-0.5 bg-green-500/10 text-green-400 rounded">{s}</span>)}
                                {b.weaknesses.map((w, j) => <span key={`w${j}`} className="text-[10px] px-1.5 py-0.5 bg-red-500/10 text-red-400 rounded">{w}</span>)}
                              </div>
                              {b.phone && <p className="text-[10px] text-prospex-muted">📞 {b.phone}</p>}
                              {b.email && <p className="text-[10px] text-prospex-muted">✉️ {b.email}</p>}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <span className="text-xs font-mono text-yellow-400">{b.google_rating ? `★ ${b.google_rating}` : '—'}</span>
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <span className="text-xs font-mono text-prospex-muted">{b.google_review_count ?? '—'}</span>
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          {b.website_score !== null ? (
                            <span className={cn('text-xs font-mono font-bold', getScoreColor(b.website_score))}>{b.website_score}</span>
                          ) : (
                            <span className="text-xs text-prospex-dim">{b.has_website ? '—' : 'None'}</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          {b.has_booking ? <CheckCircle className="w-4 h-4 text-green-400 mx-auto" /> : <XCircle className="w-4 h-4 text-red-400/40 mx-auto" />}
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          {b.social_platforms.length > 0 ? (
                            <span className="text-xs text-prospex-muted">{b.social_platforms.length} platforms</span>
                          ) : (
                            <XCircle className="w-4 h-4 text-red-400/40 mx-auto" />
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-center"><AdBadge activity={b.ad_activity} /></td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center justify-end gap-1.5">
                            <button onClick={() => saveToDatabase(b)} disabled={isSaving || isSaved}
                              className={cn('flex items-center gap-1 px-2 py-1 text-[10px] rounded-md font-medium transition-colors',
                                isSaved ? 'bg-green-500/20 text-green-400' : 'bg-prospex-cyan/10 text-prospex-cyan hover:bg-prospex-cyan/20')}
                              title="Save to Lead Database">
                              {isSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : isSaved ? <Check className="w-3 h-3" /> : <Database className="w-3 h-3" />}
                              {isSaved ? 'Saved' : 'Save'}
                            </button>
                            <button onClick={() => saveAndAudit(b)} disabled={isAuditing || isAudited}
                              className={cn('flex items-center gap-1 px-2 py-1 text-[10px] rounded-md font-medium transition-colors',
                                isAudited ? 'bg-green-500/20 text-green-400' : 'bg-purple-500/10 text-purple-400 hover:bg-purple-500/20')}
                              title="Save + Run Deep Audit">
                              {isAuditing ? <Loader2 className="w-3 h-3 animate-spin" /> : isAudited ? <Check className="w-3 h-3" /> : <Shield className="w-3 h-3" />}
                              {isAudited ? 'Done' : 'Audit'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {!showAll && analysis.all_businesses.length > 10 && (
              <button onClick={() => setShowAll(true)} className="w-full text-center py-3 text-xs text-prospex-cyan hover:text-prospex-text transition-colors font-mono">
                Show all {analysis.all_businesses.length} businesses
              </button>
            )}
          </div>
        </>
      )}

      {!analysis && !loading && (
        <div className="card p-12 text-center">
          <BarChart3 className="w-12 h-12 text-prospex-dim mx-auto mb-3" />
          <p className="text-sm text-prospex-dim font-mono">Enter a niche and location to analyze the competitive landscape</p>
          <p className="text-xs text-prospex-dim mt-2">We&apos;ll scan websites, detect ad activity, and identify your best pitch targets</p>
        </div>
      )}
    </div>
  );
}
