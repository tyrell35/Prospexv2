'use client';

import { useState, useCallback } from 'react';
import { Search, TrendingUp, Clock, Target, Zap, Eye, ChevronDown, ChevronUp, ExternalLink, Flame, Trophy, Leaf, AlertTriangle, Sparkles, BarChart3, Users, Play, Pause, Filter } from 'lucide-react';

interface AdResult {
 ad_id: string;
 page_id: string;
 page_name: string;
 ad_creative_bodies: string[];
 ad_creative_link_titles: string[];
 ad_creative_link_descriptions: string[];
 ad_creative_link_captions: string[];
 ad_delivery_start_time: string;
 ad_delivery_stop_time: string | null;
 ad_snapshot_url: string;
 publisher_platforms: string[];
 estimated_audience_size: { lower_bound: number; upper_bound: number } | null;
 days_running: number;
 is_active: boolean;
 longevity_tier: string;
 longevity_color: string;
 longevity_score: number;
}

interface AdvertiserProfile {
 page_id: string;
 page_name: string;
 total_ads: number;
 active_ads: number;
 winner_ads: number;
 evergreen_ads: number;
 longest_running_days: number;
 avg_ad_duration: number;
 platforms: string[];
 creative_diversity: number;
 advertiser_score: number;
 advertiser_tier: string;
 ad_spend_signal: string;
 ads: AdResult[];
}

interface TrendInsight {
 type: string;
 title: string;
 detail: string;
 icon: string;
}

interface Stats {
 total_ads: number;
 active_ads: number;
 total_advertisers: number;
 heavy_spenders: number;
 winner_ads: number;
 evergreen_ads: number;
 avg_duration: number;
 longest_ad_days: number;
}

type ViewMode = 'advertisers' | 'winners' | 'all';
type TierFilter = 'all' | 'Evergreen' | 'Proven Winner' | 'Winner' | 'Performing' | 'Testing';

// ─── LONGEVITY BAR ──────────────────────────────────────────
function LongevityBar({ days, maxDays }: { days: number; maxDays: number }) {
 const pct = Math.min((days / Math.max(maxDays, 1)) * 100, 100);
 let color = 'bg-gray-500';
 if (days >= 365) color = 'bg-yellow-400';
 else if (days >= 180) color = 'bg-emerald-400';
 else if (days >= 90) color = 'bg-green-400';
 else if (days >= 60) color = 'bg-orange-400';
 else if (days >= 30) color = 'bg-amber-400';
 else if (days >= 7) color = 'bg-blue-400';

 return (
  <div className="flex items-center gap-2 w-full">
   <div className="flex-1 h-2 bg-prospex-surface rounded-full overflow-hidden">
    <div className={`h-full ${color} rounded-full transition-all duration-500`} style={{ width: `${pct}%` }} />
   </div>
   <span className="text-xs text-prospex-muted whitespace-nowrap">{days}d</span>
  </div>
 );
}

// ─── TIER BADGE ─────────────────────────────────────────────
function TierBadge({ tier, score }: { tier: string; score?: number }) {
 const config: Record<string, { bg: string; text: string; icon: React.ReactNode }> = {
  'Evergreen': { bg: 'bg-yellow-500/20', text: 'text-yellow-400', icon: <Leaf className="w-3 h-3" /> },
  'Proven Winner': { bg: 'bg-emerald-500/20', text: 'text-emerald-400', icon: <Trophy className="w-3 h-3" /> },
  'Winner': { bg: 'bg-green-500/20', text: 'text-green-400', icon: <Trophy className="w-3 h-3" /> },
  'Performing': { bg: 'bg-orange-500/20', text: 'text-orange-400', icon: <TrendingUp className="w-3 h-3" /> },
  'Gaining Traction': { bg: 'bg-amber-500/20', text: 'text-amber-400', icon: <Zap className="w-3 h-3" /> },
  'Testing': { bg: 'bg-blue-500/20', text: 'text-blue-400', icon: <Play className="w-3 h-3" /> },
  'Just Launched': { bg: 'bg-gray-500/20', text: 'text-gray-400', icon: <Sparkles className="w-3 h-3" /> },
  // Advertiser tiers
  'Ad Machine': { bg: 'bg-yellow-500/20', text: 'text-yellow-400', icon: <Flame className="w-3 h-3" /> },
  'Heavy Spender': { bg: 'bg-emerald-500/20', text: 'text-emerald-400', icon: <Target className="w-3 h-3" /> },
  'Active Advertiser': { bg: 'bg-blue-500/20', text: 'text-blue-400', icon: <BarChart3 className="w-3 h-3" /> },
  'Light Advertiser': { bg: 'bg-gray-500/20', text: 'text-gray-400', icon: <Users className="w-3 h-3" /> },
  'Casual Advertiser': { bg: 'bg-gray-500/20', text: 'text-gray-400', icon: <Pause className="w-3 h-3" /> },
 };
 const c = config[tier] || config['Just Launched'];
 return (
  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${c.bg} ${c.text}`}>
   {c.icon} {tier}{score !== undefined ? ` (${score})` : ''}
  </span>
 );
}

// ─── AD CARD ────────────────────────────────────────────────
function AdCard({ ad, maxDays }: { ad: AdResult; maxDays: number }) {
 const [expanded, setExpanded] = useState(false);
 const bodyText = ad.ad_creative_bodies[0] || 'No ad copy available';
 const titleText = ad.ad_creative_link_titles[0] || '';
 const truncatedBody = bodyText.length > 200 ? bodyText.slice(0, 200) + '...' : bodyText;
 const startDate = ad.ad_delivery_start_time ? new Date(ad.ad_delivery_start_time).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Unknown';

 return (
  <div className="bg-prospex-surface border border-prospex-border rounded-lg p-4 hover:border-prospex-cyan/30 transition-colors">
   <div className="flex items-start justify-between gap-3 mb-3">
    <div className="flex-1 min-w-0">
     <div className="flex items-center gap-2 mb-1">
      <TierBadge tier={ad.longevity_tier} />
      {ad.is_active && <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-green-500/20 text-green-400">● LIVE</span>}
      {!ad.is_active && <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-red-500/20 text-red-400">● ENDED</span>}
     </div>
     <p className="text-sm font-medium text-white truncate">{ad.page_name}</p>
    </div>
    <div className="text-right shrink-0">
     <p className="text-lg font-bold text-white">{ad.days_running}<span className="text-xs text-prospex-muted ml-0.5">days</span></p>
     <p className="text-[10px] text-prospex-muted">since {startDate}</p>
    </div>
   </div>

   <LongevityBar days={ad.days_running} maxDays={maxDays} />

   <div className="mt-3">
    {titleText && <p className="text-sm font-medium text-prospex-cyan mb-1">{titleText}</p>}
    <p className="text-xs text-prospex-muted leading-relaxed">
     {expanded ? bodyText : truncatedBody}
    </p>
    {bodyText.length > 200 && (
     <button onClick={() => setExpanded(!expanded)} className="text-xs text-prospex-cyan hover:underline mt-1 flex items-center gap-1">
      {expanded ? <><ChevronUp className="w-3 h-3" /> Less</> : <><ChevronDown className="w-3 h-3" /> Full copy</>}
     </button>
    )}
   </div>

   <div className="flex items-center justify-between mt-3 pt-3 border-t border-prospex-border">
    <div className="flex gap-1.5">
     {ad.publisher_platforms.map(p => (
      <span key={p} className="px-1.5 py-0.5 rounded text-[10px] bg-prospex-bg text-prospex-muted capitalize">{p}</span>
     ))}
    </div>
    {ad.ad_snapshot_url && (
     <a href={ad.ad_snapshot_url} target="_blank" rel="noopener noreferrer" className="text-xs text-prospex-cyan hover:underline flex items-center gap-1">
      <ExternalLink className="w-3 h-3" /> View Ad
     </a>
    )}
   </div>
  </div>
 );
}

// ─── ADVERTISER CARD ────────────────────────────────────────
function AdvertiserCard({ profile, maxDays, onPushToLeads }: { profile: AdvertiserProfile; maxDays: number; onPushToLeads: (p: AdvertiserProfile) => void }) {
 const [expanded, setExpanded] = useState(false);
 const [showAds, setShowAds] = useState(false);

 return (
  <div className="bg-prospex-surface border border-prospex-border rounded-lg overflow-hidden">
   <div className="p-4">
    <div className="flex items-start justify-between gap-3 mb-3">
     <div className="flex-1 min-w-0">
      <div className="flex items-center gap-2 mb-1">
       <p className="text-base font-semibold text-white truncate">{profile.page_name}</p>
       <TierBadge tier={profile.advertiser_tier} score={profile.advertiser_score} />
      </div>
      <p className="text-xs text-prospex-muted">
       {profile.active_ads} active · {profile.total_ads} total · Est. {profile.ad_spend_signal}
      </p>
     </div>
     <button
      onClick={() => onPushToLeads(profile)}
      className="shrink-0 px-3 py-1.5 text-xs font-semibold rounded-md bg-prospex-cyan text-white hover:bg-prospex-cyan/80 transition-colors"
     >
      + Add as Lead
     </button>
    </div>

    {/* Score bar */}
    <div className="mb-3">
     <div className="flex items-center justify-between mb-1">
      <span className="text-xs text-prospex-muted">Advertiser Score</span>
      <span className="text-xs font-bold text-white">{profile.advertiser_score}/100</span>
     </div>
     <div className="h-2 bg-prospex-bg rounded-full overflow-hidden">
      <div
       className={`h-full rounded-full transition-all duration-500 ${
        profile.advertiser_score >= 80 ? 'bg-yellow-400' :
        profile.advertiser_score >= 60 ? 'bg-emerald-400' :
        profile.advertiser_score >= 40 ? 'bg-blue-400' : 'bg-gray-400'
       }`}
       style={{ width: `${profile.advertiser_score}%` }}
      />
     </div>
    </div>

    {/* Stats grid */}
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
     <div className="bg-prospex-bg rounded-md p-2 text-center">
      <p className="text-sm font-bold text-white">{profile.winner_ads}</p>
      <p className="text-[10px] text-prospex-muted">Winners (90d+)</p>
     </div>
     <div className="bg-prospex-bg rounded-md p-2 text-center">
      <p className="text-sm font-bold text-white">{profile.evergreen_ads}</p>
      <p className="text-[10px] text-prospex-muted">Evergreen (1yr+)</p>
     </div>
     <div className="bg-prospex-bg rounded-md p-2 text-center">
      <p className="text-sm font-bold text-white">{profile.longest_running_days}d</p>
      <p className="text-[10px] text-prospex-muted">Longest Ad</p>
     </div>
     <div className="bg-prospex-bg rounded-md p-2 text-center">
      <p className="text-sm font-bold text-white">{profile.creative_diversity}</p>
      <p className="text-[10px] text-prospex-muted">Unique Creatives</p>
     </div>
    </div>

    {/* Platforms */}
    <div className="flex items-center gap-1.5 mb-2">
     <span className="text-[10px] text-prospex-muted">Platforms:</span>
     {profile.platforms.map(p => (
      <span key={p} className="px-1.5 py-0.5 rounded text-[10px] bg-prospex-bg text-prospex-muted capitalize">{p}</span>
     ))}
    </div>

    <button onClick={() => setShowAds(!showAds)} className="w-full text-xs text-prospex-cyan hover:underline flex items-center justify-center gap-1 mt-2">
     {showAds ? <><ChevronUp className="w-3 h-3" /> Hide Ads</> : <><ChevronDown className="w-3 h-3" /> Show {profile.total_ads} Ads</>}
    </button>
   </div>

   {/* Expandable ads list */}
   {showAds && (
    <div className="border-t border-prospex-border bg-prospex-bg/50 p-3 space-y-3 max-h-[600px] overflow-y-auto">
     {profile.ads.map(ad => (
      <AdCard key={ad.ad_id} ad={ad} maxDays={maxDays} />
     ))}
    </div>
   )}
  </div>
 );
}

// ─── MAIN PAGE ──────────────────────────────────────────────
export default function AdIntelligencePage() {
 const [searchTerm, setSearchTerm] = useState('');
 const [country, setCountry] = useState('United Kingdom');
 const [loading, setLoading] = useState(false);
 const [error, setError] = useState('');
 const [ads, setAds] = useState<AdResult[]>([]);
 const [profiles, setProfiles] = useState<AdvertiserProfile[]>([]);
 const [trends, setTrends] = useState<TrendInsight[]>([]);
 const [stats, setStats] = useState<Stats | null>(null);
 const [viewMode, setViewMode] = useState<ViewMode>('advertisers');
 const [tierFilter, setTierFilter] = useState<TierFilter>('all');
 const [pushingLead, setPushingLead] = useState<string | null>(null);

 const maxDays = ads.length > 0 ? Math.max(...ads.map(a => a.days_running)) : 365;

 const handleSearch = useCallback(async () => {
  if (!searchTerm.trim()) return;
  setLoading(true);
  setError('');
  setAds([]);
  setProfiles([]);
  setTrends([]);
  setStats(null);

  try {
   const res = await fetch('/api/ad-library', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ searchTerm: searchTerm.trim(), country, limit: 200 }),
   });
   const data = await res.json();
   if (!res.ok) throw new Error(data.error || 'Search failed');
   setAds(data.ads || []);
   setProfiles(data.profiles || []);
   setTrends(data.trends || []);
   setStats(data.stats || null);
  } catch (err: unknown) {
   setError(err instanceof Error ? err.message : 'Search failed');
  } finally {
   setLoading(false);
  }
 }, [searchTerm, country]);

 const handlePushToLeads = useCallback(async (profile: AdvertiserProfile) => {
  setPushingLead(profile.page_id);
  try {
   // Search Facebook page to get website/contact info
   const res = await fetch('/api/scrape', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
     action: 'ad-library-lead',
     pageName: profile.page_name,
     pageId: profile.page_id,
     adSpendSignal: profile.ad_spend_signal,
     advertiserScore: profile.advertiser_score,
     advertiserTier: profile.advertiser_tier,
     activeAds: profile.active_ads,
     winnerAds: profile.winner_ads,
     longestRunningDays: profile.longest_running_days,
    }),
   });
   if (res.ok) {
    alert(`${profile.page_name} added to leads!`);
   } else {
    // Fallback: just add with what we have
    alert(`Lead saved with limited info. Enrich manually from Lead Database.`);
   }
  } catch {
   alert(`Could not auto-enrich. Add ${profile.page_name} manually.`);
  } finally {
   setPushingLead(null);
  }
 }, []);

 // Filter ads based on tier
 const filteredAds = tierFilter === 'all' ? ads : ads.filter(a => a.longevity_tier === tierFilter);
 const winnersOnly = ads.filter(a => a.days_running >= 90 && a.is_active);

 const presetSearches = [
  'med spa', 'aesthetic clinic', 'botox', 'laser hair removal',
  'teeth whitening', 'dental implants', 'skin clinic', 'body contouring',
  'hair transplant', 'lip filler', 'dermal filler', 'facial aesthetics',
  'CoolSculpting', 'hydrafacial', 'cosmetic dentist', 'invisalign',
 ];

 return (
  <div className="min-h-screen p-6 max-w-7xl mx-auto">
   {/* Header */}
   <div className="mb-6">
    <h1 className="text-2xl font-bold text-white flex items-center gap-2">
     <Eye className="w-6 h-6 text-prospex-cyan" />
     Ad Intelligence
    </h1>
    <p className="text-sm text-prospex-muted mt-1">
     Spy on competitor ads. The longer an ad runs, the more money it&apos;s making.
    </p>
   </div>

   {/* Search */}
   <div className="bg-prospex-surface border border-prospex-border rounded-lg p-4 mb-6">
    <div className="flex gap-3 mb-3">
     <div className="flex-1 relative">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-prospex-muted" />
      <input
       type="text"
       value={searchTerm}
       onChange={e => setSearchTerm(e.target.value)}
       onKeyDown={e => e.key === 'Enter' && handleSearch()}
       placeholder="Search ads... e.g. 'med spa', 'botox', 'laser hair removal'"
       className="w-full pl-10 pr-4 py-2.5 bg-prospex-bg border border-prospex-border rounded-lg text-white placeholder:text-prospex-muted text-sm focus:outline-none focus:border-prospex-cyan"
      />
     </div>
     <select
      value={country}
      onChange={e => setCountry(e.target.value)}
      className="px-3 py-2.5 bg-prospex-bg border border-prospex-border rounded-lg text-white text-sm focus:outline-none focus:border-prospex-cyan"
     >
      <option value="United Kingdom">🇬🇧 United Kingdom</option>
      <option value="United States">🇺🇸 United States</option>
      <option value="Canada">🇨🇦 Canada</option>
      <option value="Australia">🇦🇺 Australia</option>
      <option value="Ireland">🇮🇪 Ireland</option>
     </select>
     <button
      onClick={handleSearch}
      disabled={loading || !searchTerm.trim()}
      className="px-6 py-2.5 bg-prospex-cyan text-white font-semibold rounded-lg hover:bg-prospex-cyan/80 disabled:opacity-50 disabled:cursor-not-allowed text-sm transition-colors"
     >
      {loading ? 'Scanning...' : 'Search Ads'}
     </button>
    </div>

    {/* Preset searches */}
    <div className="flex flex-wrap gap-1.5">
     {presetSearches.map(term => (
      <button
       key={term}
       onClick={() => { setSearchTerm(term); }}
       className="px-2 py-1 text-[11px] rounded-md bg-prospex-bg hover:bg-prospex-cyan/20 text-prospex-muted hover:text-white transition-colors"
      >
       {term}
      </button>
     ))}
    </div>
   </div>

   {/* Error */}
   {error && (
    <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 mb-6">
     <p className="text-sm text-red-400 flex items-center gap-2">
      <AlertTriangle className="w-4 h-4" /> {error}
     </p>
     {error.includes('access token') && (
      <p className="text-xs text-prospex-muted mt-2">
       You need a Meta Ad Library API token. Go to{' '}
       <a href="https://developers.facebook.com/tools/explorer/" target="_blank" rel="noopener noreferrer" className="text-prospex-cyan hover:underline">
        Facebook Developer Tools
       </a>{' '}
       → Get token → Add as META_AD_LIBRARY_TOKEN in Settings.
      </p>
     )}
    </div>
   )}

   {/* Loading */}
   {loading && (
    <div className="flex flex-col items-center justify-center py-20">
     <div className="w-10 h-10 border-2 border-prospex-cyan border-t-transparent rounded-full animate-spin mb-4" />
     <p className="text-sm text-prospex-muted">Scanning Meta Ad Library...</p>
     <p className="text-xs text-prospex-muted mt-1">Analyzing ad longevity & scoring advertisers</p>
    </div>
   )}

   {/* Results */}
   {stats && !loading && (
    <>
     {/* Stats bar */}
     <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3 mb-6">
      {[
       { label: 'Total Ads', value: stats.total_ads, icon: <BarChart3 className="w-4 h-4" /> },
       { label: 'Active', value: stats.active_ads, icon: <Play className="w-4 h-4 text-green-400" /> },
       { label: 'Advertisers', value: stats.total_advertisers, icon: <Users className="w-4 h-4" /> },
       { label: 'Heavy Spenders', value: stats.heavy_spenders, icon: <Flame className="w-4 h-4 text-orange-400" /> },
       { label: 'Winners (90d+)', value: stats.winner_ads, icon: <Trophy className="w-4 h-4 text-green-400" /> },
       { label: 'Evergreen (1yr+)', value: stats.evergreen_ads, icon: <Leaf className="w-4 h-4 text-yellow-400" /> },
       { label: 'Avg Duration', value: `${stats.avg_duration}d`, icon: <Clock className="w-4 h-4" /> },
       { label: 'Longest Ad', value: `${stats.longest_ad_days}d`, icon: <Target className="w-4 h-4 text-prospex-cyan" /> },
      ].map(s => (
       <div key={s.label} className="bg-prospex-surface border border-prospex-border rounded-lg p-3 text-center">
        <div className="flex items-center justify-center gap-1.5 mb-1">{s.icon}</div>
        <p className="text-lg font-bold text-white">{s.value}</p>
        <p className="text-[10px] text-prospex-muted">{s.label}</p>
       </div>
      ))}
     </div>

     {/* Trend insights */}
     {trends.length > 0 && (
      <div className="mb-6">
       <h2 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-prospex-cyan" /> Trend Insights
       </h2>
       <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {trends.map((t, i) => (
         <div key={i} className="bg-prospex-surface border border-prospex-border rounded-lg p-4">
          <div className="flex items-start gap-3">
           <span className="text-xl">{t.icon}</span>
           <div>
            <p className="text-sm font-medium text-white">{t.title}</p>
            <p className="text-xs text-prospex-muted mt-1 leading-relaxed">{t.detail}</p>
           </div>
          </div>
         </div>
        ))}
       </div>
      </div>
     )}

     {/* Longevity distribution chart */}
     <div className="bg-prospex-surface border border-prospex-border rounded-lg p-4 mb-6">
      <h2 className="text-sm font-semibold text-white mb-3">Ad Longevity Distribution</h2>
      <div className="flex items-end gap-1 h-32">
       {(() => {
        const buckets = [
         { label: '<7d', min: 0, max: 7, color: 'bg-gray-500' },
         { label: '7-30d', min: 7, max: 30, color: 'bg-blue-400' },
         { label: '30-60d', min: 30, max: 60, color: 'bg-amber-400' },
         { label: '60-90d', min: 60, max: 90, color: 'bg-orange-400' },
         { label: '90-180d', min: 90, max: 180, color: 'bg-green-400' },
         { label: '180-365d', min: 180, max: 365, color: 'bg-emerald-400' },
         { label: '365d+', min: 365, max: Infinity, color: 'bg-yellow-400' },
        ];
        const counts = buckets.map(b => ads.filter(a => a.days_running >= b.min && a.days_running < b.max).length);
        const maxCount = Math.max(...counts, 1);

        return buckets.map((b, i) => (
         <div key={b.label} className="flex-1 flex flex-col items-center gap-1">
          <span className="text-[10px] text-white font-medium">{counts[i]}</span>
          <div className="w-full flex items-end" style={{ height: '80px' }}>
           <div
            className={`w-full ${b.color} rounded-t-sm transition-all duration-500`}
            style={{ height: `${(counts[i] / maxCount) * 100}%`, minHeight: counts[i] > 0 ? '4px' : '0' }}
           />
          </div>
          <span className="text-[9px] text-prospex-muted">{b.label}</span>
         </div>
        ));
       })()}
      </div>
      <div className="flex items-center justify-between mt-3 pt-3 border-t border-prospex-border">
       <span className="text-[10px] text-prospex-muted">← Short-lived (bad ads)</span>
       <span className="text-[10px] text-prospex-muted">Long-running (money makers) →</span>
      </div>
     </div>

     {/* View toggle + filter */}
     <div className="flex items-center justify-between mb-4">
      <div className="flex gap-2">
       {[
        { key: 'advertisers' as ViewMode, label: 'Advertisers', icon: <Users className="w-3.5 h-3.5" /> },
        { key: 'winners' as ViewMode, label: `Winners (${winnersOnly.length})`, icon: <Trophy className="w-3.5 h-3.5" /> },
        { key: 'all' as ViewMode, label: `All Ads (${ads.length})`, icon: <BarChart3 className="w-3.5 h-3.5" /> },
       ].map(v => (
        <button
         key={v.key}
         onClick={() => setViewMode(v.key)}
         className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
          viewMode === v.key ? 'bg-prospex-cyan text-white font-semibold' : 'bg-prospex-surface text-prospex-muted hover:text-white'
         }`}
        >
         {v.icon} {v.label}
        </button>
       ))}
      </div>

      {viewMode === 'all' && (
       <div className="flex items-center gap-2">
        <Filter className="w-3.5 h-3.5 text-prospex-muted" />
        <select
         value={tierFilter}
         onChange={e => setTierFilter(e.target.value as TierFilter)}
         className="px-2 py-1 bg-prospex-bg border border-prospex-border rounded text-xs text-white focus:outline-none focus:border-prospex-cyan"
        >
         <option value="all">All Tiers</option>
         <option value="Evergreen">🌿 Evergreen (365d+)</option>
         <option value="Proven Winner">🏆 Proven Winner (180d+)</option>
         <option value="Winner">✅ Winner (90d+)</option>
         <option value="Performing">🔥 Performing (60d+)</option>
         <option value="Testing">🧪 Testing (7d+)</option>
        </select>
       </div>
      )}
     </div>

     {/* Advertiser view */}
     {viewMode === 'advertisers' && (
      <div className="space-y-4">
       {profiles.map(p => (
        <AdvertiserCard key={p.page_id} profile={p} maxDays={maxDays} onPushToLeads={handlePushToLeads} />
       ))}
       {profiles.length === 0 && (
        <p className="text-center text-prospex-muted py-8">No advertisers found</p>
       )}
      </div>
     )}

     {/* Winners view */}
     {viewMode === 'winners' && (
      <div className="space-y-3">
       <p className="text-xs text-prospex-muted mb-2">Showing only active ads running 90+ days — these are proven money-makers.</p>
       <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {winnersOnly.map(ad => (
         <AdCard key={ad.ad_id} ad={ad} maxDays={maxDays} />
        ))}
       </div>
       {winnersOnly.length === 0 && (
        <p className="text-center text-prospex-muted py-8">No winner ads found. Try a broader search term.</p>
       )}
      </div>
     )}

     {/* All ads view */}
     {viewMode === 'all' && (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
       {filteredAds.map(ad => (
        <AdCard key={ad.ad_id} ad={ad} maxDays={maxDays} />
       ))}
       {filteredAds.length === 0 && (
        <p className="text-center text-prospex-muted py-8 col-span-2">No ads match the current filter.</p>
       )}
      </div>
     )}
    </>
   )}

   {/* Empty state */}
   {!stats && !loading && !error && (
    <div className="flex flex-col items-center justify-center py-20 text-center">
     <Eye className="w-16 h-16 text-prospex-cyan/30 mb-4" />
     <h3 className="text-lg font-semibold text-white mb-2">Search the Meta Ad Library</h3>
     <p className="text-sm text-prospex-muted max-w-md">
      Find every business running Facebook and Instagram ads in your niche.
      Our algorithm scores each ad by longevity — the longer it runs, the more money it&apos;s making.
     </p>
     <div className="mt-6 bg-prospex-surface border border-prospex-border rounded-lg p-4 max-w-sm w-full text-left">
      <p className="text-xs font-medium text-white mb-2">How longevity scoring works:</p>
      <div className="space-y-1.5">
       {[
        { tier: 'Evergreen', days: '365+ days', desc: 'Printing money. Study this ad.' },
        { tier: 'Proven Winner', days: '180+ days', desc: 'Consistently profitable creative.' },
        { tier: 'Winner', days: '90+ days', desc: 'Clearly working. Worth modelling.' },
        { tier: 'Performing', days: '60+ days', desc: 'Showing promise, still proving itself.' },
        { tier: 'Testing', days: '7-30 days', desc: 'New test. May not survive.' },
       ].map(l => (
        <div key={l.tier} className="flex items-center gap-2">
         <TierBadge tier={l.tier} />
         <span className="text-[10px] text-prospex-muted">{l.days} — {l.desc}</span>
        </div>
       ))}
      </div>
     </div>
    </div>
   )}
  </div>
 );
}
