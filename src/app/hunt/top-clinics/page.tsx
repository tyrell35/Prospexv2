'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import {
  Crown, Loader2, RefreshCw, Filter, Upload, ExternalLink, Radio, Zap,
  Building2, MapPin, Sparkles, AlertTriangle, ArrowLeft, MessageSquare,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ─── Types ──────────────────────────────────────────────

type Strictness = 'strict' | 'relaxed_reviews' | 'relaxed_estidx' | 'relaxed_both';
type SuggestedTemplate = 'top_tier_no_ads' | 'top_tier_with_ads' | 'top_tier_multi_device';

interface Pick {
  lead_id: string;
  business_name: string;
  city: string | null;
  country: string | null;
  website: string | null;
  ghl_contact_id: string | null;
  email: string | null;
  phone: string | null;
  phone_formatted: string | null;
  instagram_handle: string | null;
  instagram_url: string | null;
  band: string | null;
  total_score: number | null;
  establishment_index: number | null;
  devices_found: string[] | null;
  tier_a_count: number | null;
  tier_b_count: number | null;
  booking_system: string | null;
  google_review_count: number | null;
  google_rating: number | null;
  has_other_agency: boolean | null;
  ads_active: boolean | null;
  ad_count: number | null;
  ad_days_running: number | null;
  library_url: string | null;
  strictness: Strictness;
  suggested_template: SuggestedTemplate;
}

interface Group {
  city: string;
  strictness: Strictness;
  picks: Pick[];
}

interface ApiResp {
  success: boolean;
  criteria?: unknown;
  stats: { cities: number; top_tier: number; relaxed_1: number; relaxed_2: number; relaxed_3: number };
  groups: Group[];
}

// ─── Meta labels ────────────────────────────────────────

const strictnessMeta: Record<Strictness, { label: string; help: string; badge: string }> = {
  strict:           { label: 'Elite',                help: '≥40 reviews · EstIdx ≥60 · Tier A device',   badge: 'bg-prospex-cyan/20 text-prospex-cyan border-prospex-cyan/40' },
  relaxed_reviews:  { label: 'Elite (relaxed rev)',  help: '≥20 reviews · EstIdx ≥60 · Tier A device',   badge: 'bg-amber-500/10 text-amber-400 border-amber-500/30' },
  relaxed_estidx:   { label: 'Established (relaxed est)', help: '≥40 reviews · EstIdx ≥40 · Tier A device', badge: 'bg-amber-500/10 text-amber-400 border-amber-500/30' },
  relaxed_both:     { label: 'Emerging',             help: '≥15 reviews · EstIdx ≥40',                    badge: 'bg-prospex-dim/20 text-prospex-dim border-prospex-border' },
};

const templateMeta: Record<SuggestedTemplate, { label: string; emoji: string }> = {
  top_tier_no_ads:        { label: 'Established + No Ads',    emoji: '💤' },
  top_tier_with_ads:      { label: 'Established + Live Ads',  emoji: '📡' },
  top_tier_multi_device:  { label: 'Multi-Device Elite',      emoji: '🏆' },
};

// ═══════════════════════════════════════════════════════
// PAGE
// ═══════════════════════════════════════════════════════

export default function TopClinicsPage() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [stats, setStats] = useState({ cities: 0, top_tier: 0, relaxed_1: 0, relaxed_2: 0, relaxed_3: 0 });
  const [loading, setLoading] = useState(true);
  const [country, setCountry] = useState<'all' | 'GB' | 'US' | 'CA'>('GB');
  const [city, setCity] = useState('');
  const [perCity, setPerCity] = useState(10);
  const [includeAgency, setIncludeAgency] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pushingId, setPushingId] = useState<string | null>(null);
  const [personalizingId, setPersonalizingId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ country, per_city: String(perCity), min: '5' });
    if (city.trim()) params.set('city', city.trim());
    if (includeAgency) params.set('include_agency', 'true');
    const res = await fetch(`/api/hunt/top-clinics?${params.toString()}`);
    const data = (await res.json()) as ApiResp & { error?: string };
    if (!data.success) {
      setError(data.error || 'Failed to load');
      setLoading(false);
      return;
    }
    setGroups(data.groups || []);
    setStats(data.stats || { cities: 0, top_tier: 0, relaxed_1: 0, relaxed_2: 0, relaxed_3: 0 });
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const pushToGhl = async (leadId: string) => {
    setPushingId(leadId);
    try {
      const res = await fetch('/api/ghl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId }),
      });
      if (!res.ok) throw new Error(`GHL push failed (${res.status})`);
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'GHL push failed');
    } finally { setPushingId(null); }
  };

  const personalize = async (leadId: string, tier: SuggestedTemplate) => {
    setPersonalizingId(leadId);
    try {
      const res = await fetch('/api/hunt/personalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lead_ids: [leadId], channel: 'instagram_dm', tier }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Personalization failed');
      alert(`Opener generated. Angle: ${data.results?.[0]?.angle || '—'}`);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Personalization failed');
    } finally { setPersonalizingId(null); }
  };

  const totalPicks = useMemo(() => groups.reduce((n, g) => n + g.picks.length, 0), [groups]);

  return (
    <div className="max-w-7xl mx-auto space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link href="/hunt" className="text-prospex-dim hover:text-prospex-text text-xs flex items-center gap-1">
              <ArrowLeft className="w-3 h-3" /> Hunt Mode
            </Link>
          </div>
          <h1 className="text-xl md:text-2xl font-mono font-bold text-prospex-text flex items-center gap-3">
            <Crown className="w-5 h-5 md:w-6 md:h-6 text-prospex-cyan" /> Top Clinic Finder
          </h1>
          <p className="text-sm text-prospex-dim mt-1">
            The ~5 % of scored leads worth a personal message. Progressive relaxation ensures every city gets picks.
          </p>
        </div>
        <button onClick={load} disabled={loading} className="btn-ghost text-xs">
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} Refresh
        </button>
      </div>

      {/* Filter bar */}
      <div className="card p-3 flex items-center gap-2 flex-wrap">
        <Filter className="w-3.5 h-3.5 text-prospex-dim" />
        <select value={country} onChange={e => setCountry(e.target.value as typeof country)} className="input text-xs py-1.5 w-auto">
          <option value="all">All countries</option>
          <option value="GB">🇬🇧 UK</option>
          <option value="US">🇺🇸 US</option>
          <option value="CA">🇨🇦 Canada</option>
        </select>
        <input value={city} onChange={e => setCity(e.target.value)} placeholder="Specific city…" className="input text-xs py-1.5 w-40" />
        <div className="flex items-center gap-1.5">
          <label className="text-[10px] text-prospex-dim uppercase font-mono">Per city</label>
          <input type="number" min={3} max={50} value={perCity} onChange={e => setPerCity(parseInt(e.target.value) || 10)} className="input text-xs py-1.5 w-16" />
        </div>
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input type="checkbox" checked={includeAgency} onChange={e => setIncludeAgency(e.target.checked)} />
          <span className="text-[10px] text-prospex-muted">Include agency-managed (switch pitch)</span>
        </label>
        <button onClick={load} className="btn-primary text-xs ml-auto">Apply</button>
      </div>

      {/* Stats histogram */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="card p-3 border-prospex-border">
          <p className="text-[10px] font-mono text-prospex-dim uppercase">Cities</p>
          <p className="text-2xl font-mono font-bold text-prospex-text">{stats.cities}</p>
        </div>
        <div className="card p-3 border-prospex-cyan/40">
          <p className="text-[10px] font-mono text-prospex-cyan uppercase">🏆 Elite</p>
          <p className="text-2xl font-mono font-bold text-prospex-cyan">{stats.top_tier}</p>
        </div>
        <div className="card p-3 border-amber-500/30">
          <p className="text-[10px] font-mono text-amber-400 uppercase">Elite (relaxed rev)</p>
          <p className="text-2xl font-mono font-bold text-amber-400">{stats.relaxed_1}</p>
        </div>
        <div className="card p-3 border-amber-500/30">
          <p className="text-[10px] font-mono text-amber-400 uppercase">Established</p>
          <p className="text-2xl font-mono font-bold text-amber-400">{stats.relaxed_2}</p>
        </div>
        <div className="card p-3 border-prospex-border">
          <p className="text-[10px] font-mono text-prospex-dim uppercase">Emerging</p>
          <p className="text-2xl font-mono font-bold text-prospex-dim">{stats.relaxed_3}</p>
        </div>
      </div>

      {error && (
        <div className="card p-3 border-prospex-red/40 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-prospex-red shrink-0 mt-0.5" />
          <p className="text-xs text-prospex-red">{error}</p>
        </div>
      )}

      {loading ? (
        <div className="card p-8 text-center"><Loader2 className="w-5 h-5 animate-spin text-prospex-cyan mx-auto" /></div>
      ) : totalPicks === 0 ? (
        <div className="card p-8 text-center">
          <Sparkles className="w-8 h-8 text-prospex-dim mx-auto mb-3" />
          <p className="text-sm text-prospex-muted">No scored leads match yet.</p>
          <p className="text-[11px] text-prospex-dim mt-1">
            Run a hunt from <Link href="/hunt" className="text-prospex-cyan hover:underline">Hunt Mode</Link> to populate <code>hunt_scores</code> first.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map(g => {
            const sm = strictnessMeta[g.strictness];
            return (
              <div key={g.city} className="card p-4">
                <div className="flex items-center gap-3 flex-wrap mb-3">
                  <MapPin className="w-4 h-4 text-prospex-cyan" />
                  <h2 className="text-sm font-mono font-semibold text-prospex-text">{g.city}</h2>
                  <span className={cn('badge text-[10px]', sm.badge)}>{sm.label}</span>
                  <span className="text-[10px] text-prospex-dim">{sm.help}</span>
                  <span className="ml-auto text-[10px] text-prospex-dim">{g.picks.length} picks</span>
                </div>
                <div className="space-y-2">
                  {g.picks.map(p => <PickCard key={p.lead_id} p={p} onPushGhl={() => pushToGhl(p.lead_id)} onPersonalize={() => personalize(p.lead_id, p.suggested_template)} pushing={pushingId === p.lead_id} personalizing={personalizingId === p.lead_id} />)}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// PICK CARD
// ═══════════════════════════════════════════════════════

function PickCard({ p, onPushGhl, onPersonalize, pushing, personalizing }: {
  p: Pick;
  onPushGhl: () => void;
  onPersonalize: () => void;
  pushing: boolean;
  personalizing: boolean;
}) {
  const tmpl = templateMeta[p.suggested_template];
  const devices = p.devices_found || [];
  const email = p.email;
  const phone = p.phone_formatted || p.phone;
  const igHandle = p.instagram_handle;

  return (
    <div className="bg-prospex-bg border border-prospex-border rounded-lg p-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <Crown className="w-3.5 h-3.5 text-prospex-cyan" />
            <span className="text-lg font-mono font-bold text-prospex-text">{p.total_score}</span>
            <Link href={`/leads/${p.lead_id}`} className="text-sm font-semibold text-prospex-cyan hover:underline truncate">
              {p.business_name}
            </Link>
            <span className={cn('badge text-[9px] bg-prospex-cyan/10 text-prospex-cyan border-prospex-cyan/30')}>
              {tmpl.emoji} {tmpl.label}
            </span>
            {p.has_other_agency && <span className="badge text-[9px] bg-amber-500/20 text-amber-400 border-amber-500/40">⚠️ other-agency</span>}
          </div>

          <div className="mt-2 grid grid-cols-2 md:grid-cols-5 gap-2 text-[10px] font-mono">
            <span className="text-prospex-muted">EstIdx: <span className="text-prospex-text">{p.establishment_index ?? '—'}</span></span>
            <span className="text-prospex-muted">Reviews: <span className="text-prospex-text">{p.google_review_count ?? '—'}{p.google_rating ? ` · ${p.google_rating.toFixed(1)}★` : ''}</span></span>
            <span className="text-prospex-muted">Tier A/B: <span className="text-prospex-text">{p.tier_a_count ?? 0}/{p.tier_b_count ?? 0}</span></span>
            <span className="text-prospex-muted">Booking: <span className="text-prospex-text">{p.booking_system || '—'}</span></span>
            <span className="text-prospex-muted">Band: <span className="text-prospex-text">{p.band || '—'}</span></span>
          </div>

          <div className="mt-2 text-[11px] text-prospex-muted space-y-1">
            {devices.length > 0 && (
              <p><Building2 className="w-3 h-3 inline mr-1 text-prospex-dim" /> Devices: <span className="text-prospex-text">{devices.slice(0, 4).join(', ')}</span></p>
            )}
            <p className="flex items-center gap-2 flex-wrap">
              {p.ads_active
                ? <span className="text-prospex-green flex items-center gap-1"><Radio className="w-3 h-3" /> {p.ad_count} active ads · {p.ad_days_running ?? '?'}d</span>
                : <span className="text-prospex-dim">💤 no active ads</span>}
              {p.library_url && (
                <a href={p.library_url} target="_blank" rel="noopener noreferrer" className="text-prospex-cyan hover:underline text-[10px] flex items-center gap-0.5">
                  Ad Library <ExternalLink className="w-2.5 h-2.5" />
                </a>
              )}
            </p>
            {(email || phone || igHandle) && (
              <p className="text-[10px] text-prospex-dim">
                {email && <span>📧 {email}</span>}
                {email && (phone || igHandle) && <span> · </span>}
                {phone && <span>📞 {phone}</span>}
                {phone && igHandle && <span> · </span>}
                {igHandle && <span>@{igHandle.replace(/^@/, '')}</span>}
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button onClick={onPersonalize} disabled={personalizing} className="btn text-[10px] bg-prospex-cyan/20 text-prospex-cyan border border-prospex-cyan/40 hover:bg-prospex-cyan/30 disabled:opacity-50">
            {personalizing ? <Loader2 className="w-3 h-3 animate-spin" /> : <MessageSquare className="w-3 h-3" />} Generate Opener
          </button>
          <Link href={`/leads/${p.lead_id}`} className="btn-ghost text-[10px]">
            <ExternalLink className="w-3 h-3" /> View
          </Link>
          {!p.ghl_contact_id && (
            <button onClick={onPushGhl} disabled={pushing} className="btn text-[10px] bg-prospex-green/20 text-prospex-green border border-prospex-green/40 hover:bg-prospex-green/30 disabled:opacity-50">
              {pushing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />} Push to GHL
            </button>
          )}
          {p.ghl_contact_id && (
            <span className="badge text-[9px] bg-prospex-green/20 text-prospex-green border-prospex-green/40"><Zap className="w-3 h-3 inline mr-0.5" /> In GHL</span>
          )}
        </div>
      </div>
    </div>
  );
}
