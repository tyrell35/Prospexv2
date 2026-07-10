'use client';

import { useEffect, useState } from 'react';
import {
  Rocket, Plus, Play, Pause, Trash2, Download, BarChart3, Hammer,
  CheckCircle, XCircle, MessageCircle, Instagram, Phone, Loader2, Filter,
  ListChecks, Users, Activity, X, RefreshCw, AlertCircle, Sparkles, ChevronDown, ChevronRight,
  Flame, Snowflake, Clock, GraduationCap, Info, ShieldAlert,
} from 'lucide-react';
import { WARMUP_PROCEDURE } from '@/lib/ig-warmup';
import { cn } from '@/lib/utils';

// ─── TYPES ──────────────────────────────────────────────

interface Campaign {
  id: string;
  name: string;
  status: string | null;
  channel: string | null;
  campaign_type: string | null;
  script_template: string;
  script_variants: Array<{ id: string; message: string }> | null;
  target_niche: string | null;
  target_cities: string[] | null;
  target_country: string | null;
  daily_limit: number | null;
  min_reviews: number | null;
  max_reviews: number | null;
  total_queued: number | null;
  total_sent: number | null;
  total_replied: number | null;
  reply_rate: number | null;
  created_at: string;
}

interface QueueItem {
  id: string;
  campaign_id: string;
  lead_id: string;
  message_text: string;
  variant_id: string | null;
  ig_account: string | null;
  status: string | null;
  sent_at: string | null;
  scheduled_for: string | null;
  lead_data: {
    business_name?: string;
    city?: string;
    instagram_handle?: string;
    instagram_url?: string;
    phone?: string;
  } | null;
}

interface IgAccount {
  id: string;
  username: string;
  display_name: string | null;
  status: string | null;
  daily_sent_today: number | null;
  daily_limit: number | null;
  daily_target: number | null;
  warmup_stage: 'new' | 'warming' | 'warm' | 'paused' | null;
  warmup_started_at: string | null;
  total_sent: number | null;
  total_replies: number | null;
  last_sent_at: string | null;
  notes: string | null;
  warmup?: {
    stage: 'new' | 'warming' | 'warm' | 'paused';
    effective_target: number;
    hard_limit: number;
    days_in_warmup: number;
    next_step_target: number | null;
    next_step_at: string | null;
    fully_warm: boolean;
    procedure_step: string;
  };
}

interface VariantStat {
  variant_id: string;
  total: number;
  queued: number;
  sent: number;
  replied: number;
  positive: number;
  reply_rate: number;
  positive_rate: number;
}

interface Preset {
  id: string;
  name: string;
  description: string | null;
  channel: string | null;
  campaign_type: string | null;
  category: string | null;
  expected_reply_rate: string | null;
  script_template: string;
  script_variants: Array<{ id: string; message: string }> | null;
  follow_up_scripts: Array<{ message: string }> | null;
}

const CATEGORY_META: Record<string, { label: string; emoji: string; order: number }> = {
  elite: { label: 'Elite High-Response', emoji: '🔥', order: 1 },
  gift_leads: { label: 'Gift Leads', emoji: '🎁', order: 2 },
  competitor_intel: { label: 'Competitor Intel', emoji: '📊', order: 3 },
  ad_intel: { label: 'Ad Intelligence', emoji: '🔴', order: 4 },
  ai_intel: { label: 'AI Search Intel', emoji: '🤖', order: 5 },
  revenue_loss: { label: 'Revenue Loss', emoji: '💰', order: 6 },
  website_intel: { label: 'Website Intel', emoji: '🌐', order: 7 },
  sms_outreach: { label: 'SMS Outreach', emoji: '📱', order: 8 },
  whatsapp_outreach: { label: 'WhatsApp Outreach', emoji: '💬', order: 9 },
  booking: { label: 'Booking', emoji: '📅', order: 10 },
  closing: { label: 'Closing', emoji: '🏆', order: 11 },
  custom: { label: 'Custom', emoji: '✨', order: 99 },
};

function categoryMeta(c: string | null) {
  return CATEGORY_META[c || 'custom'] || { label: c || 'Other', emoji: '✨', order: 50 };
}

function replyRateColor(rate: string | null): string {
  if (!rate) return 'bg-prospex-bg text-prospex-dim border-prospex-border';
  // Parse first number in the string ("12-20%", "35-45%", "N/A — closing script")
  const m = rate.match(/(\d+)/);
  if (!m) return 'bg-prospex-bg text-prospex-dim border-prospex-border';
  const n = parseInt(m[1], 10);
  if (n >= 20) return 'bg-prospex-green/20 text-prospex-green border-prospex-green/40';
  if (n >= 10) return 'bg-amber-500/20 text-amber-400 border-amber-500/40';
  return 'bg-prospex-red/20 text-prospex-red border-prospex-red/40';
}

// ─── HELPERS ────────────────────────────────────────────

async function api<T = Record<string, unknown>>(action: string, body: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch('/api/dm-campaigns', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...body }),
  });
  return res.json() as Promise<T>;
}

function downloadCsv(csv: string, filename: string) {
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const channelIcon = (ch: string | null) => {
  if (ch === 'whatsapp') return <MessageCircle className="w-3.5 h-3.5 text-green-400" />;
  if (ch === 'sms') return <Phone className="w-3.5 h-3.5 text-blue-400" />;
  return <Instagram className="w-3.5 h-3.5 text-pink-400" />;
};

const statusBadge = (status: string | null) => {
  const map: Record<string, string> = {
    active: 'bg-prospex-green/20 text-prospex-green border-prospex-green/40',
    paused: 'bg-amber-500/20 text-amber-400 border-amber-500/40',
    draft: 'bg-prospex-bg text-prospex-dim border-prospex-border',
    queued: 'bg-prospex-cyan/20 text-prospex-cyan border-prospex-cyan/40',
    sent: 'bg-blue-500/20 text-blue-400 border-blue-500/40',
    replied: 'bg-prospex-green/20 text-prospex-green border-prospex-green/40',
    failed: 'bg-prospex-red/20 text-prospex-red border-prospex-red/40',
    warming: 'bg-amber-500/20 text-amber-400 border-amber-500/40',
    resting: 'bg-prospex-bg text-prospex-dim border-prospex-border',
  };
  const cls = map[status || 'draft'] || map.draft;
  return <span className={cn('badge text-[10px]', cls)}>{status || 'draft'}</span>;
};

// ═══════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════

export default function DmCampaignsPage() {
  const [tab, setTab] = useState<'campaigns' | 'queue' | 'accounts'>('campaigns');

  return (
    <div className="max-w-7xl mx-auto space-y-4">
      <div>
        <h1 className="text-xl md:text-2xl font-mono font-bold text-prospex-text flex items-center gap-3">
          <Rocket className="w-5 h-5 md:w-6 md:h-6 text-prospex-cyan" /> DM Campaign Manager
        </h1>
        <p className="text-sm text-prospex-dim mt-1">
          Create campaigns, build personalized queues, export for sending.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-prospex-bg p-1 rounded-lg w-fit">
        {[
          { key: 'campaigns', label: 'Campaigns', icon: Rocket },
          { key: 'queue', label: 'Queue', icon: ListChecks },
          { key: 'accounts', label: 'IG Accounts', icon: Users },
        ].map(t => {
          const Icon = t.icon;
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key as 'campaigns' | 'queue' | 'accounts')}
              className={cn(
                'flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-mono transition-colors',
                active
                  ? 'bg-prospex-cyan/20 text-prospex-cyan border border-prospex-cyan/30'
                  : 'text-prospex-muted hover:text-prospex-text'
              )}
            >
              <Icon className="w-3.5 h-3.5" /> {t.label}
            </button>
          );
        })}
      </div>

      {tab === 'campaigns' && <CampaignsTab />}
      {tab === 'queue' && <QueueTab />}
      {tab === 'accounts' && <AccountsTab />}
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// CAMPAIGNS TAB
// ═══════════════════════════════════════════════════════

function CampaignsTab() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [stats, setStats] = useState<Record<string, VariantStat[]>>({});
  const [galleryOpen, setGalleryOpen] = useState(true);

  const refresh = async () => {
    setLoading(true);
    const res = await api<{ success: boolean; campaigns: Campaign[] }>('get_campaigns');
    setCampaigns(res.campaigns || []);
    setLoading(false);
  };

  useEffect(() => { refresh(); }, []);

  const handleBuild = async (c: Campaign) => {
    setBusy(c.id);
    const res = await api<{ success: boolean; queued: number; message?: string; error?: string }>('build_queue', { campaign_id: c.id });
    setBusy(null);
    if (res.success) {
      alert(`Queued ${res.queued} leads.${res.message ? ` ${res.message}` : ''}`);
      refresh();
    } else {
      alert(`Error: ${res.error || 'failed'}`);
    }
  };

  const handleExport = async (c: Campaign) => {
    setBusy(c.id);
    const res = await api<{ success: boolean; csv: string; rows: number; error?: string }>('export_csv', { campaign_id: c.id });
    setBusy(null);
    if (res.success && res.csv) {
      downloadCsv(res.csv, `${c.name.replace(/[^a-z0-9]/gi, '-').toLowerCase()}-queue.csv`);
    } else {
      alert(`Export failed: ${res.error || 'no data'}`);
    }
  };

  const handleToggleStatus = async (c: Campaign) => {
    const action = c.status === 'paused' ? 'resume_campaign' : 'pause_campaign';
    await api(action, { campaign_id: c.id });
    refresh();
  };

  const handleDelete = async (c: Campaign) => {
    if (!confirm(`Delete campaign "${c.name}" and all its queue rows? Cannot be undone.`)) return;
    await api('delete_campaign', { campaign_id: c.id });
    refresh();
  };

  const handleStats = async (c: Campaign) => {
    setBusy(c.id);
    const res = await api<{ success: boolean; variants: VariantStat[] }>('get_stats', { campaign_id: c.id });
    setBusy(null);
    if (res.success) {
      setStats(prev => ({ ...prev, [c.id]: res.variants }));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button onClick={refresh} className="btn-ghost text-xs"><RefreshCw className="w-3.5 h-3.5" /> Refresh</button>
          <button
            onClick={async () => {
              const res = await api<{ success: boolean; scheduled: number; error?: string }>('schedule_follow_ups', {});
              if (res.success) {
                alert(`Scheduled ${res.scheduled} follow-up message${res.scheduled === 1 ? '' : 's'} across all active campaigns.`);
                refresh();
              } else {
                alert(`Error: ${res.error || 'failed'}`);
              }
            }}
            className="btn-ghost text-xs"
            title="Manually trigger follow-up scheduling for all active campaigns (also runs hourly via cron)"
          >
            <Activity className="w-3.5 h-3.5" /> Schedule Follow-Ups
          </button>
        </div>
        <button onClick={() => setShowForm(true)} className="btn-primary text-xs">
          <Plus className="w-3.5 h-3.5" /> New Campaign
        </button>
      </div>

      {showForm && <CampaignForm onClose={() => setShowForm(false)} onCreated={() => { setShowForm(false); refresh(); }} />}

      {/* Preset Gallery */}
      <div className="card">
        <button
          onClick={() => setGalleryOpen(!galleryOpen)}
          className="w-full flex items-center justify-between p-4 hover:bg-prospex-bg/30 transition-colors"
        >
          <div className="flex items-center gap-3">
            <Sparkles className="w-4 h-4 text-prospex-cyan" />
            <div className="text-left">
              <h3 className="text-sm font-mono font-bold text-prospex-text">Preset Gallery</h3>
              <p className="text-[10px] text-prospex-dim">Pre-built campaigns — pick one to use as a starting point</p>
            </div>
          </div>
          {galleryOpen ? <ChevronDown className="w-4 h-4 text-prospex-dim" /> : <ChevronRight className="w-4 h-4 text-prospex-dim" />}
        </button>
        {galleryOpen && (
          <div className="border-t border-prospex-border p-4">
            <PresetGallery onCloned={() => refresh()} />
          </div>
        )}
      </div>

      {/* User campaigns header */}
      <div className="flex items-center gap-2 pt-2">
        <h3 className="text-xs font-mono text-prospex-dim uppercase tracking-wider">Your Campaigns</h3>
        <div className="flex-1 h-px bg-prospex-border/50" />
      </div>


      {loading ? (
        <div className="card p-8 text-center"><Loader2 className="w-5 h-5 animate-spin text-prospex-cyan mx-auto" /></div>
      ) : campaigns.length === 0 ? (
        <div className="card p-8 text-center">
          <Rocket className="w-8 h-8 text-prospex-dim mx-auto mb-3" />
          <p className="text-sm text-prospex-muted">No campaigns yet. Click <strong>New Campaign</strong> to create one.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {campaigns.map(c => (
            <div key={c.id} className="card p-4">
              <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    {channelIcon(c.channel)}
                    <h3 className="text-sm font-semibold text-prospex-text truncate">{c.name}</h3>
                    {statusBadge(c.status)}
                    <span className="text-[10px] text-prospex-dim font-mono">{c.campaign_type}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-[11px] text-prospex-muted font-mono">
                    {c.target_niche && <span>📂 {c.target_niche}</span>}
                    {c.target_country && <span>🌍 {c.target_country}</span>}
                    {c.target_cities && c.target_cities.length > 0 && (
                      <span>📍 {c.target_cities.slice(0, 3).join(', ')}{c.target_cities.length > 3 ? ` +${c.target_cities.length - 3}` : ''}</span>
                    )}
                    {(c.min_reviews !== null || c.max_reviews !== null) && (
                      <span>⭐ {c.min_reviews ?? '0'}–{c.max_reviews ?? '∞'} reviews</span>
                    )}
                    <span>📤 {c.daily_limit}/day</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-xs">
                    <span><span className="text-prospex-dim">Queued:</span> <span className="font-mono font-bold text-prospex-cyan">{c.total_queued || 0}</span></span>
                    <span><span className="text-prospex-dim">Sent:</span> <span className="font-mono font-bold text-blue-400">{c.total_sent || 0}</span></span>
                    <span><span className="text-prospex-dim">Replied:</span> <span className="font-mono font-bold text-prospex-green">{c.total_replied || 0}</span></span>
                    <span><span className="text-prospex-dim">Reply rate:</span> <span className="font-mono font-bold text-amber-400">{c.reply_rate || 0}%</span></span>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <button disabled={busy === c.id} onClick={() => handleBuild(c)} className="btn-ghost text-[10px] disabled:opacity-50">
                    {busy === c.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Hammer className="w-3 h-3" />} Build Queue
                  </button>
                  <button disabled={busy === c.id} onClick={() => handleExport(c)} className="btn-ghost text-[10px] disabled:opacity-50">
                    <Download className="w-3 h-3" /> Export
                  </button>
                  <button disabled={busy === c.id} onClick={() => handleStats(c)} className="btn-ghost text-[10px] disabled:opacity-50">
                    <BarChart3 className="w-3 h-3" /> Stats
                  </button>
                  <button onClick={() => handleToggleStatus(c)} className="btn-ghost text-[10px]">
                    {c.status === 'paused' ? <><Play className="w-3 h-3" /> Resume</> : <><Pause className="w-3 h-3" /> Pause</>}
                  </button>
                  <button onClick={() => handleDelete(c)} className="btn-ghost text-[10px] text-prospex-red hover:text-prospex-red">
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>

              {/* A/B stats */}
              {stats[c.id] && stats[c.id].length > 0 && (
                <div className="mt-3 pt-3 border-t border-prospex-border/50">
                  <p className="text-[10px] font-mono text-prospex-dim uppercase mb-2">A/B Breakdown</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {stats[c.id].map(v => (
                      <div key={v.variant_id} className="bg-prospex-bg p-3 rounded-lg">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-mono font-bold text-prospex-text">Variant {v.variant_id.toUpperCase()}</span>
                          <span className="text-xs text-amber-400 font-mono">{v.reply_rate}% reply</span>
                        </div>
                        <div className="grid grid-cols-4 gap-1 text-center text-[10px]">
                          <div><p className="text-prospex-dim">Total</p><p className="font-mono">{v.total}</p></div>
                          <div><p className="text-prospex-dim">Sent</p><p className="font-mono">{v.sent}</p></div>
                          <div><p className="text-prospex-dim">Replied</p><p className="font-mono text-prospex-green">{v.replied}</p></div>
                          <div><p className="text-prospex-dim">Positive</p><p className="font-mono text-prospex-cyan">{v.positive}</p></div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── PRESET GALLERY ─────────────────────────────────────

function PresetGallery({ onCloned }: { onCloned: () => void }) {
  const [presets, setPresets] = useState<Preset[]>([]);
  const [loading, setLoading] = useState(true);
  const [cloningId, setCloningId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const res = await api<{ success: boolean; presets: Preset[] }>('get_presets');
      setPresets(res.presets || []);
      setLoading(false);
    })();
  }, []);

  const handleClone = async (preset: Preset) => {
    setCloningId(preset.id);
    const res = await api<{ success: boolean; campaign?: Campaign; error?: string }>('clone_preset', { preset_id: preset.id });
    setCloningId(null);
    if (res.success) {
      onCloned();
    } else {
      alert(`Clone failed: ${res.error || 'unknown error'}`);
    }
  };

  if (loading) return <div className="py-6 text-center"><Loader2 className="w-5 h-5 animate-spin text-prospex-cyan mx-auto" /></div>;
  if (presets.length === 0) return <p className="text-xs text-prospex-dim text-center py-4">No presets seeded.</p>;

  // Group by category
  const grouped: Record<string, Preset[]> = {};
  for (const p of presets) {
    const k = p.category || 'custom';
    if (!grouped[k]) grouped[k] = [];
    grouped[k].push(p);
  }
  const sortedCategories = Object.keys(grouped).sort((a, b) => categoryMeta(a).order - categoryMeta(b).order);

  return (
    <div className="space-y-5">
      {sortedCategories.map(cat => {
        const meta = categoryMeta(cat);
        return (
          <div key={cat}>
            <h4 className="text-[11px] font-mono text-prospex-text uppercase tracking-wider mb-2 flex items-center gap-2">
              <span>{meta.emoji}</span>
              <span>{meta.label}</span>
              <span className="text-prospex-dim font-normal">({grouped[cat].length})</span>
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {grouped[cat].map(p => (
                <div key={p.id} className="bg-prospex-bg border border-prospex-border rounded-lg p-3 hover:border-prospex-cyan/30 transition-colors">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <p className="text-xs font-medium text-prospex-text leading-tight flex-1 min-w-0">{p.name}</p>
                    {channelIcon(p.channel)}
                  </div>
                  {p.description && (
                    <p className="text-[10px] text-prospex-muted line-clamp-2 mb-2">{p.description}</p>
                  )}
                  <div className="flex items-center justify-between gap-2">
                    <span className={cn('badge text-[9px]', replyRateColor(p.expected_reply_rate))}>
                      {p.expected_reply_rate || 'N/A'}
                    </span>
                    <button
                      onClick={() => handleClone(p)}
                      disabled={cloningId === p.id}
                      className="text-[10px] px-2 py-1 rounded bg-prospex-cyan/10 text-prospex-cyan border border-prospex-cyan/30 hover:bg-prospex-cyan/20 disabled:opacity-50 flex items-center gap-1"
                    >
                      {cloningId === p.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                      Use Template
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── CAMPAIGN FORM ──────────────────────────────────────

function CampaignForm({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [channel, setChannel] = useState('instagram');
  const [campaignType, setCampaignType] = useState('cold_open');
  const [scriptTemplate, setScriptTemplate] = useState('');
  const [variantB, setVariantB] = useState('');
  const [followUps, setFollowUps] = useState<string[]>(['']);
  const [followUpDelayHours, setFollowUpDelayHours] = useState(48);
  const [sendWindowStart, setSendWindowStart] = useState('09:00');
  const [sendWindowEnd, setSendWindowEnd] = useState('17:00');
  const [targetNiche, setTargetNiche] = useState('');
  const [targetCities, setTargetCities] = useState('');
  const [targetCountry, setTargetCountry] = useState('United Kingdom');
  const [dailyLimit, setDailyLimit] = useState(30);
  const [minReviews, setMinReviews] = useState<string>('');
  const [maxReviews, setMaxReviews] = useState<string>('');
  const [requireWebsite, setRequireWebsite] = useState(false);
  const [requireInstagram, setRequireInstagram] = useState(true);
  const [excludeWithAds, setExcludeWithAds] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateFollowUp = (i: number, val: string) => {
    setFollowUps(prev => prev.map((s, idx) => idx === i ? val : s));
  };
  const addFollowUp = () => setFollowUps(prev => [...prev, '']);
  const removeFollowUp = (i: number) => setFollowUps(prev => prev.filter((_, idx) => idx !== i));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name.trim() || !scriptTemplate.trim()) {
      setError('Name and script template are required');
      return;
    }
    const cleanFollowUps = followUps.map(s => s.trim()).filter(Boolean);
    setSaving(true);
    const res = await api<{ success: boolean; error?: string }>('create_campaign', {
      name,
      channel,
      campaign_type: campaignType,
      script_template: scriptTemplate,
      variant_b: variantB || undefined,
      follow_up_scripts: cleanFollowUps,
      target_niche: targetNiche || undefined,
      target_cities: targetCities || undefined,
      target_country: targetCountry,
      daily_limit: dailyLimit,
      min_reviews: minReviews === '' ? null : Number(minReviews),
      max_reviews: maxReviews === '' ? null : Number(maxReviews),
      require_website: requireWebsite,
      require_instagram: requireInstagram,
      exclude_with_ads: excludeWithAds,
      follow_up_delay_hours: followUpDelayHours,
      max_follow_ups: cleanFollowUps.length,
      send_window_start: sendWindowStart,
      send_window_end: sendWindowEnd,
    });
    setSaving(false);
    if (res.success) onCreated();
    else setError(res.error || 'Failed to create campaign');
  };

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-prospex-surface border border-prospex-border rounded-xl w-full max-w-2xl mx-2 md:mx-auto max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="p-4 border-b border-prospex-border flex items-center justify-between">
          <h2 className="text-sm font-mono font-bold text-prospex-text">New Campaign</h2>
          <button onClick={onClose} className="text-prospex-dim hover:text-prospex-text"><X className="w-5 h-5" /></button>
        </div>

        <form onSubmit={handleSubmit} className="overflow-y-auto p-4 md:p-5 space-y-4">
          <div>
            <label className="text-[10px] font-mono text-prospex-dim uppercase block mb-1">Name</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. UK Med Spa Cold Open Q2" className="input w-full" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-mono text-prospex-dim uppercase block mb-1">Channel</label>
              <select value={channel} onChange={e => setChannel(e.target.value)} className="input w-full">
                <option value="instagram">Instagram</option>
                <option value="whatsapp">WhatsApp</option>
                <option value="sms">SMS</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] font-mono text-prospex-dim uppercase block mb-1">Type</label>
              <select value={campaignType} onChange={e => setCampaignType(e.target.value)} className="input w-full">
                <option value="cold_open">Cold Open</option>
                <option value="gift_leads">Gift Leads</option>
                <option value="follow_up">Follow Up</option>
                <option value="nurture">Nurture</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-[10px] font-mono text-prospex-dim uppercase block mb-1">Script (Variant A)</label>
            <textarea value={scriptTemplate} onChange={e => setScriptTemplate(e.target.value)} rows={4}
              placeholder="Use {{firstName}}, {{clinicName}}, {{city}}, {{niche}}, {{reviewCount}} for personalization."
              className="w-full bg-prospex-bg border border-prospex-border rounded-lg p-3 text-xs text-prospex-text resize-none focus:border-prospex-cyan/50 focus:outline-none font-mono leading-relaxed" />
            <p className="text-[9px] text-prospex-dim mt-1">Variables: {`{{firstName}} {{clinicName}} {{city}} {{niche}} {{reviewCount}} {{rating}} {{handle}}`}</p>
          </div>

          <div>
            <label className="text-[10px] font-mono text-prospex-dim uppercase block mb-1">Variant B (optional, for A/B test)</label>
            <textarea value={variantB} onChange={e => setVariantB(e.target.value)} rows={3}
              placeholder="Leave blank to skip A/B testing"
              className="w-full bg-prospex-bg border border-prospex-border rounded-lg p-3 text-xs text-prospex-text resize-none focus:border-prospex-cyan/50 focus:outline-none font-mono leading-relaxed" />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[10px] font-mono text-prospex-dim uppercase">Follow-Up Scripts (sent if no reply)</label>
              <button type="button" onClick={addFollowUp} className="text-[10px] text-prospex-cyan hover:text-prospex-cyan/80 font-mono">+ add follow-up</button>
            </div>
            <div className="space-y-2">
              {followUps.map((fu, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className="text-[10px] text-prospex-dim font-mono mt-2 shrink-0 w-12">Step {i + 1}</span>
                  <textarea value={fu} onChange={e => updateFollowUp(i, e.target.value)} rows={2}
                    placeholder={`Follow-up ${i + 1} message — sent ${followUpDelayHours}h after previous`}
                    className="w-full bg-prospex-bg border border-prospex-border rounded-lg p-2 text-xs text-prospex-text resize-none focus:border-prospex-cyan/50 focus:outline-none font-mono leading-relaxed" />
                  {followUps.length > 1 && (
                    <button type="button" onClick={() => removeFollowUp(i)} className="text-prospex-dim hover:text-prospex-red mt-2 shrink-0">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="text-[10px] font-mono text-prospex-dim uppercase block mb-1">Follow-Up Delay (hrs)</label>
              <input type="number" min={1} value={followUpDelayHours} onChange={e => setFollowUpDelayHours(parseInt(e.target.value) || 48)} className="input w-full" />
            </div>
            <div>
              <label className="text-[10px] font-mono text-prospex-dim uppercase block mb-1">Send Window Start</label>
              <input type="time" value={sendWindowStart} onChange={e => setSendWindowStart(e.target.value)} className="input w-full" />
            </div>
            <div>
              <label className="text-[10px] font-mono text-prospex-dim uppercase block mb-1">Send Window End</label>
              <input type="time" value={sendWindowEnd} onChange={e => setSendWindowEnd(e.target.value)} className="input w-full" />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-mono text-prospex-dim uppercase block mb-1">Target Niche</label>
              <input value={targetNiche} onChange={e => setTargetNiche(e.target.value)} placeholder="med spa" className="input w-full" />
            </div>
            <div>
              <label className="text-[10px] font-mono text-prospex-dim uppercase block mb-1">Target Country</label>
              <select value={targetCountry} onChange={e => setTargetCountry(e.target.value)} className="input w-full">
                <option>United Kingdom</option>
                <option>United States</option>
                <option>Canada</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-[10px] font-mono text-prospex-dim uppercase block mb-1">Target Cities (comma-separated)</label>
            <input value={targetCities} onChange={e => setTargetCities(e.target.value)} placeholder="London, Manchester, Birmingham" className="input w-full" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="text-[10px] font-mono text-prospex-dim uppercase block mb-1">Daily Limit</label>
              <input type="number" min={1} value={dailyLimit} onChange={e => setDailyLimit(parseInt(e.target.value) || 30)} className="input w-full" />
            </div>
            <div>
              <label className="text-[10px] font-mono text-prospex-dim uppercase block mb-1">Min Reviews</label>
              <input type="number" min={0} value={minReviews} onChange={e => setMinReviews(e.target.value)} placeholder="0" className="input w-full" />
            </div>
            <div>
              <label className="text-[10px] font-mono text-prospex-dim uppercase block mb-1">Max Reviews</label>
              <input type="number" min={0} value={maxReviews} onChange={e => setMaxReviews(e.target.value)} placeholder="∞" className="input w-full" />
            </div>
          </div>

          <div className="flex flex-wrap gap-3 text-xs">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" checked={requireInstagram} onChange={e => setRequireInstagram(e.target.checked)} />
              <span className="text-prospex-muted">Require Instagram</span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" checked={requireWebsite} onChange={e => setRequireWebsite(e.target.checked)} />
              <span className="text-prospex-muted">Require Website</span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" checked={excludeWithAds} onChange={e => setExcludeWithAds(e.target.checked)} />
              <span className="text-prospex-muted">Exclude leads with pixel/ads</span>
            </label>
          </div>

          {error && (
            <div className="p-3 bg-prospex-red/10 border border-prospex-red/30 rounded-lg flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-prospex-red shrink-0 mt-0.5" />
              <p className="text-xs text-prospex-red">{error}</p>
            </div>
          )}
        </form>

        <div className="p-4 border-t border-prospex-border flex items-center justify-end gap-2">
          <button onClick={onClose} className="btn-ghost text-xs">Cancel</button>
          <button onClick={handleSubmit} disabled={saving} className="btn-primary text-xs disabled:opacity-50">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />} Create Campaign
          </button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// QUEUE TAB
// ═══════════════════════════════════════════════════════

function QueueTab() {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [campaignFilter, setCampaignFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const refresh = async () => {
    setLoading(true);
    const [qRes, cRes] = await Promise.all([
      api<{ success: boolean; queue: QueueItem[] }>('get_queue', { campaign_id: campaignFilter || undefined, status: statusFilter || undefined }),
      api<{ success: boolean; campaigns: Campaign[] }>('get_campaigns'),
    ]);
    setQueue(qRes.queue || []);
    setCampaigns(cRes.campaigns || []);
    setLoading(false);
  };

  useEffect(() => { refresh(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [campaignFilter, statusFilter]);

  const toggleAll = () => {
    if (selectedIds.size === queue.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(queue.map(q => q.id)));
  };

  const bulkUpdate = async (status: string) => {
    if (selectedIds.size === 0) return;
    if (!confirm(`Mark ${selectedIds.size} as ${status}?`)) return;
    await api('update_status', { queue_ids: Array.from(selectedIds), status });
    setSelectedIds(new Set());
    refresh();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Filter className="w-3.5 h-3.5 text-prospex-dim" />
          <select value={campaignFilter} onChange={e => setCampaignFilter(e.target.value)} className="input text-xs py-1.5 w-auto">
            <option value="">All Campaigns</option>
            {campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="input text-xs py-1.5 w-auto">
            <option value="">All Status</option>
            <option value="queued">Queued</option>
            <option value="sent">Sent</option>
            <option value="replied">Replied</option>
            <option value="failed">Failed</option>
          </select>
          <button onClick={refresh} className="btn-ghost text-xs"><RefreshCw className="w-3.5 h-3.5" /> Refresh</button>
        </div>
        {selectedIds.size > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-prospex-cyan font-mono">{selectedIds.size} selected</span>
            <button onClick={() => bulkUpdate('sent')} className="btn-primary text-xs"><CheckCircle className="w-3.5 h-3.5" /> Mark Sent</button>
            <button onClick={() => bulkUpdate('replied')} className="btn text-xs bg-prospex-green/20 text-prospex-green border border-prospex-green/40"><MessageCircle className="w-3.5 h-3.5" /> Mark Replied</button>
            <button onClick={() => bulkUpdate('failed')} className="btn-danger text-xs"><XCircle className="w-3.5 h-3.5" /> Mark Failed</button>
          </div>
        )}
      </div>

      {loading ? (
        <div className="card p-8 text-center"><Loader2 className="w-5 h-5 animate-spin text-prospex-cyan mx-auto" /></div>
      ) : queue.length === 0 ? (
        <div className="card p-8 text-center">
          <ListChecks className="w-8 h-8 text-prospex-dim mx-auto mb-3" />
          <p className="text-sm text-prospex-muted">No queue items{campaignFilter || statusFilter ? ' match these filters' : ' yet — build a queue from a campaign'}.</p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-[800px]">
              <thead>
                <tr className="table-header">
                  <th className="w-10 px-3 py-3"><input type="checkbox" checked={queue.length > 0 && selectedIds.size === queue.length} onChange={toggleAll} className="rounded border-prospex-border bg-prospex-bg" /></th>
                  <th className="text-left px-3 py-3 font-mono text-[10px] text-prospex-dim uppercase">Lead</th>
                  <th className="text-left px-3 py-3 font-mono text-[10px] text-prospex-dim uppercase">City</th>
                  <th className="text-left px-3 py-3 font-mono text-[10px] text-prospex-dim uppercase">Message</th>
                  <th className="text-center px-3 py-3 font-mono text-[10px] text-prospex-dim uppercase">Variant</th>
                  <th className="text-center px-3 py-3 font-mono text-[10px] text-prospex-dim uppercase">Account</th>
                  <th className="text-center px-3 py-3 font-mono text-[10px] text-prospex-dim uppercase">Status</th>
                  <th className="text-left px-3 py-3 font-mono text-[10px] text-prospex-dim uppercase">Sent</th>
                </tr>
              </thead>
              <tbody>
                {queue.map(q => (
                  <tr key={q.id} className="table-row">
                    <td className="px-3 py-2.5"><input type="checkbox" checked={selectedIds.has(q.id)} onChange={() => {
                      const next = new Set(selectedIds);
                      if (next.has(q.id)) next.delete(q.id); else next.add(q.id);
                      setSelectedIds(next);
                    }} className="rounded border-prospex-border bg-prospex-bg" /></td>
                    <td className="px-3 py-2.5 text-prospex-text">{q.lead_data?.business_name || '—'}</td>
                    <td className="px-3 py-2.5 text-prospex-muted">{q.lead_data?.city || '—'}</td>
                    <td className="px-3 py-2.5 text-prospex-muted max-w-[280px] truncate" title={q.message_text}>{q.message_text}</td>
                    <td className="px-3 py-2.5 text-center"><span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-prospex-bg text-prospex-text uppercase">{q.variant_id || 'a'}</span></td>
                    <td className="px-3 py-2.5 text-center text-prospex-muted text-[10px] font-mono">{q.ig_account || '—'}</td>
                    <td className="px-3 py-2.5 text-center">{statusBadge(q.status)}</td>
                    <td className="px-3 py-2.5 text-prospex-dim text-[10px] font-mono">{q.sent_at ? new Date(q.sent_at).toLocaleString() : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// IG ACCOUNTS TAB
// ═══════════════════════════════════════════════════════

function AccountsTab() {
  const [accounts, setAccounts] = useState<IgAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [newUsername, setNewUsername] = useState('');
  const [newDailyLimit, setNewDailyLimit] = useState(30);
  const [newDailyTarget, setNewDailyTarget] = useState(30);
  const [newStage, setNewStage] = useState<'new' | 'warm'>('new');
  const [adding, setAdding] = useState(false);
  const [showProcedure, setShowProcedure] = useState(false);
  // Batch add — paste multiple usernames, one per line or comma-separated
  const [batchMode, setBatchMode] = useState(false);
  const [batchText, setBatchText] = useState('');
  const [batchResult, setBatchResult] = useState<{ added: number; skipped: number; results: Array<{ username: string; status: 'added' | 'skipped_duplicate' }> } | null>(null);

  const refresh = async () => {
    setLoading(true);
    const res = await api<{ success: boolean; accounts: IgAccount[] }>('get_accounts');
    setAccounts(res.accounts || []);
    setLoading(false);
  };

  useEffect(() => { refresh(); }, []);

  const handleAdd = async () => {
    if (!newUsername.trim()) return;
    setAdding(true);
    await api('manage_accounts', {
      sub_action: 'add',
      username: newUsername.trim(),
      daily_limit: newDailyLimit,
      daily_target: newDailyTarget,
      warmup_stage: newStage,
      status: 'active',
    });
    setNewUsername('');
    setNewDailyLimit(30);
    setNewDailyTarget(30);
    setNewStage('new');
    setAdding(false);
    refresh();
  };

  // Parse the pasted batch text into a clean array of handles.
  // Accepts any of: one per line, comma-separated, semicolon-separated, or
  // whitespace-separated. Strips @, trims, dedupes.
  const parsedBatch = batchText
    .split(/[\s,;]+/)
    .map(s => s.trim().replace(/^@/, ''))
    .filter(s => s.length > 0);
  // Dedupe (client-side preview) — server dedupes too but this makes the
  // count in the button accurate before submit.
  const uniqueBatch = Array.from(new Set(parsedBatch.map(s => s.toLowerCase()))).map(k => parsedBatch.find(x => x.toLowerCase() === k) as string);

  const handleBatchAdd = async () => {
    if (uniqueBatch.length === 0) return;
    setAdding(true);
    setBatchResult(null);
    const res = await api<{ success: boolean; inserted_count: number; skipped_count: number; results: Array<{ username: string; status: 'added' | 'skipped_duplicate' }> }>(
      'manage_accounts',
      {
        sub_action: 'add',
        usernames: uniqueBatch,
        daily_limit: newDailyLimit,
        daily_target: newDailyTarget,
        warmup_stage: newStage,
        status: 'active',
      }
    );
    setBatchResult({
      added: res.inserted_count || 0,
      skipped: res.skipped_count || 0,
      results: res.results || [],
    });
    setBatchText('');
    setAdding(false);
    refresh();
  };

  const handleStatus = async (account: IgAccount, status: string) => {
    await api('manage_accounts', { sub_action: 'update', account_id: account.id, status });
    refresh();
  };

  const handleRemove = async (account: IgAccount) => {
    if (!confirm(`Remove @${account.username}?`)) return;
    await api('manage_accounts', { sub_action: 'remove', account_id: account.id });
    refresh();
  };

  const handleResetDaily = async () => {
    if (!confirm('Reset daily counters for all accounts?')) return;
    await api('manage_accounts', { sub_action: 'reset_daily' });
    refresh();
  };

  const newStageCount = accounts.filter(a => (a.warmup_stage || a.warmup?.stage) === 'new').length;
  const handleStartAllNew = async () => {
    if (newStageCount === 0) return;
    if (!confirm(`Start the 14-day warmup on all ${newStageCount} 'new' account${newStageCount === 1 ? '' : 's'}?\n\nEach one begins Day 0 → 5 DMs/day for 3 days, then ramps 10 → 20 → 30.`)) return;
    const res = await api<{ success: boolean; started_count: number }>('manage_accounts', { sub_action: 'start_warmup_all_new' });
    refresh();
    if (res.started_count > 0) alert(`✓ Started warmup on ${res.started_count} account${res.started_count === 1 ? '' : 's'}.`);
  };

  const handleWarmup = async (account: IgAccount, sub_action: 'start_warmup' | 'graduate' | 'pause' | 'resume') => {
    const confirmMsg: Record<string, string> = {
      start_warmup: `Start 14-day warmup for @${account.username}? It'll send max 5/day for 3 days, then ramp: 10 → 20 → 30.`,
      graduate: `Mark @${account.username} as fully warm (30/day cap)?`,
      pause: `Pause @${account.username}? No sends until resumed.`,
      resume: `Resume @${account.username} as fully warm?`,
    };
    if (!confirm(confirmMsg[sub_action])) return;
    await api('manage_accounts', { sub_action, account_id: account.id });
    refresh();
  };

  const handleTargetChange = async (account: IgAccount, daily_target: number) => {
    await api('manage_accounts', { sub_action: 'update', account_id: account.id, daily_target });
    refresh();
  };

  return (
    <div className="space-y-4">
      {/* Warmup procedure — collapsible */}
      <div className="card p-3 border-prospex-cyan/30">
        <button onClick={() => setShowProcedure(v => !v)} className="w-full flex items-center justify-between text-left">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-prospex-cyan" />
            <span className="text-xs font-mono uppercase text-prospex-text">{WARMUP_PROCEDURE.title}</span>
          </div>
          {showProcedure ? <ChevronDown className="w-3.5 h-3.5 text-prospex-dim" /> : <ChevronRight className="w-3.5 h-3.5 text-prospex-dim" />}
        </button>
        {showProcedure && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3 pt-3 border-t border-prospex-border/50">
            <div>
              <h4 className="text-[10px] font-mono uppercase text-prospex-cyan mb-1">Ramp schedule</h4>
              <ul className="space-y-1">
                {WARMUP_PROCEDURE.bullets.map((b, i) => <li key={i} className="text-[10px] text-prospex-muted font-mono">{b}</li>)}
              </ul>
              <h4 className="text-[10px] font-mono uppercase text-prospex-green mt-3 mb-1">✓ Do</h4>
              <ul className="space-y-0.5">
                {WARMUP_PROCEDURE.dos.map((b, i) => <li key={i} className="text-[10px] text-prospex-muted">• {b}</li>)}
              </ul>
            </div>
            <div>
              <h4 className="text-[10px] font-mono uppercase text-prospex-red mb-1">✕ Don&apos;t</h4>
              <ul className="space-y-0.5">
                {WARMUP_PROCEDURE.donts.map((b, i) => <li key={i} className="text-[10px] text-prospex-muted">• {b}</li>)}
              </ul>
              <h4 className="text-[10px] font-mono uppercase text-amber-400 mt-3 mb-1">Signs of an action-block</h4>
              <ul className="space-y-0.5">
                {WARMUP_PROCEDURE.action_block_signs.map((b, i) => <li key={i} className="text-[10px] text-prospex-muted">• {b}</li>)}
              </ul>
              <p className="text-[10px] text-prospex-dim mt-3 italic">If you see any of these, pause the account for 48h before resuming.</p>
            </div>
          </div>
        )}
      </div>

      <div className="card p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-mono text-prospex-dim uppercase">Add Account</h3>
          <div className="flex items-center gap-1">
            <button onClick={() => { setBatchMode(false); setBatchResult(null); }}
              className={cn('text-[10px] px-2 py-0.5 rounded font-mono border',
                !batchMode ? 'bg-prospex-cyan/20 text-prospex-cyan border-prospex-cyan/40' : 'bg-prospex-bg text-prospex-dim border-prospex-border')}>
              One
            </button>
            <button onClick={() => setBatchMode(true)}
              className={cn('text-[10px] px-2 py-0.5 rounded font-mono border',
                batchMode ? 'bg-prospex-cyan/20 text-prospex-cyan border-prospex-cyan/40' : 'bg-prospex-bg text-prospex-dim border-prospex-border')}>
              📥 Batch
            </button>
          </div>
        </div>

        {!batchMode ? (
          <>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
              <input value={newUsername} onChange={e => setNewUsername(e.target.value)} placeholder="@username (no @)" className="input md:col-span-2" />
              <div>
                <input type="number" min={1} value={newDailyTarget} onChange={e => setNewDailyTarget(parseInt(e.target.value) || 30)} placeholder="Target/day" className="input w-full" />
                <p className="text-[9px] text-prospex-dim mt-0.5 px-1">KPI target</p>
              </div>
              <div>
                <input type="number" min={1} value={newDailyLimit} onChange={e => setNewDailyLimit(parseInt(e.target.value) || 30)} placeholder="Hard cap" className="input w-full" />
                <p className="text-[9px] text-prospex-dim mt-0.5 px-1">Hard ceiling</p>
              </div>
              <select value={newStage} onChange={e => setNewStage(e.target.value as 'new' | 'warm')} className="input">
                <option value="new">🆕 New — needs warmup</option>
                <option value="warm">🔥 Warm — skip ramp</option>
              </select>
            </div>
            <div className="flex items-center justify-between mt-3">
              <p className="text-[10px] text-prospex-dim">
                <Info className="w-2.5 h-2.5 inline mr-1" />
                New accounts start with <strong>0 sends</strong> — hit &ldquo;Start warmup&rdquo; on the row to begin the 14-day ramp.
              </p>
              <button onClick={handleAdd} disabled={adding || !newUsername.trim()} className="btn-primary text-xs disabled:opacity-50">
                {adding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />} Add
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="space-y-2">
              <label className="text-[10px] font-mono text-prospex-dim uppercase block">Paste usernames (one per line, or comma-separated)</label>
              <textarea
                value={batchText}
                onChange={e => { setBatchText(e.target.value); setBatchResult(null); }}
                rows={6}
                placeholder="acme_beauty
laser_pro_clinic
@aesthetics_hub
skinstudio_uk, glow_medspa; ultra_beauty"
                className="w-full bg-prospex-bg border border-prospex-border rounded p-2 text-xs font-mono text-prospex-text resize-none focus:border-prospex-cyan/50 focus:outline-none"
              />
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                <div>
                  <input type="number" min={1} value={newDailyTarget} onChange={e => setNewDailyTarget(parseInt(e.target.value) || 30)} placeholder="Target/day" className="input w-full" />
                  <p className="text-[9px] text-prospex-dim mt-0.5 px-1">Applies to every account in the batch</p>
                </div>
                <div>
                  <input type="number" min={1} value={newDailyLimit} onChange={e => setNewDailyLimit(parseInt(e.target.value) || 30)} placeholder="Hard cap" className="input w-full" />
                  <p className="text-[9px] text-prospex-dim mt-0.5 px-1">Hard ceiling per account</p>
                </div>
                <select value={newStage} onChange={e => setNewStage(e.target.value as 'new' | 'warm')} className="input">
                  <option value="new">🆕 All start in 'new' (recommended — begin warmup after)</option>
                  <option value="warm">🔥 All already warm (skip the 14-day ramp)</option>
                </select>
              </div>
              <div className="flex items-center justify-between">
                <p className="text-[10px] text-prospex-dim">
                  <Info className="w-2.5 h-2.5 inline mr-1" />
                  {uniqueBatch.length} handle{uniqueBatch.length === 1 ? '' : 's'} detected
                  {parsedBatch.length !== uniqueBatch.length && <> ({parsedBatch.length - uniqueBatch.length} duplicate{parsedBatch.length - uniqueBatch.length === 1 ? '' : 's'} in paste ignored)</>}.
                  Existing @usernames will be skipped.
                </p>
                <button onClick={handleBatchAdd} disabled={adding || uniqueBatch.length === 0} className="btn-primary text-xs disabled:opacity-50">
                  {adding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />} Add {uniqueBatch.length} account{uniqueBatch.length === 1 ? '' : 's'}
                </button>
              </div>
              {batchResult && (
                <div className="p-2.5 bg-prospex-bg rounded border border-prospex-border">
                  <p className="text-[11px] font-mono text-prospex-text mb-1.5">
                    ✓ {batchResult.added} added
                    {batchResult.skipped > 0 && <span className="text-amber-400"> · {batchResult.skipped} skipped (already exist)</span>}
                  </p>
                  {batchResult.results.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {batchResult.results.map(r => (
                        <span key={r.username} className={cn('text-[9px] font-mono px-1.5 py-0.5 rounded border',
                          r.status === 'added' ? 'bg-prospex-green/10 text-prospex-green border-prospex-green/30' : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                        )}>
                          {r.status === 'added' ? '✓' : '⚠'} @{r.username}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      <div className="flex items-center justify-between flex-wrap gap-2">
        <button onClick={refresh} className="btn-ghost text-xs"><RefreshCw className="w-3.5 h-3.5" /> Refresh</button>
        <div className="flex items-center gap-2">
          {newStageCount > 0 && (
            <button onClick={handleStartAllNew} className="text-xs px-3 py-1.5 rounded border border-prospex-cyan/40 bg-prospex-cyan/10 text-prospex-cyan hover:bg-prospex-cyan/20 font-mono flex items-center gap-1.5" title={`Start warmup on all ${newStageCount} accounts currently in stage='new'`}>
              <Flame className="w-3.5 h-3.5" /> Start warmup on all {newStageCount} new
            </button>
          )}
          <button onClick={handleResetDaily} className="btn-ghost text-xs text-amber-400"><Activity className="w-3.5 h-3.5" /> Reset Daily Counters</button>
        </div>
      </div>

      {loading ? (
        <div className="card p-8 text-center"><Loader2 className="w-5 h-5 animate-spin text-prospex-cyan mx-auto" /></div>
      ) : accounts.length === 0 ? (
        <div className="card p-8 text-center">
          <Users className="w-8 h-8 text-prospex-dim mx-auto mb-3" />
          <p className="text-sm text-prospex-muted">No IG accounts yet. Add one above.</p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-[960px]">
              <thead>
                <tr className="table-header">
                  <th className="text-left px-3 py-3 font-mono text-[10px] text-prospex-dim uppercase">Account</th>
                  <th className="text-left px-3 py-3 font-mono text-[10px] text-prospex-dim uppercase">Warmup</th>
                  <th className="text-center px-3 py-3 font-mono text-[10px] text-prospex-dim uppercase">Today / Target</th>
                  <th className="text-center px-3 py-3 font-mono text-[10px] text-prospex-dim uppercase">Target/day</th>
                  <th className="text-center px-3 py-3 font-mono text-[10px] text-prospex-dim uppercase">Replies</th>
                  <th className="text-left px-3 py-3 font-mono text-[10px] text-prospex-dim uppercase">Last sent</th>
                  <th className="px-3 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {accounts.map(a => {
                  const w = a.warmup;
                  const used = a.daily_sent_today || 0;
                  const target = w?.effective_target ?? (a.daily_target || 30);
                  const hardCap = w?.hard_limit ?? (a.daily_limit || 30);
                  const pct = target > 0 ? Math.min(100, Math.round((used / target) * 100)) : 0;
                  const stage = w?.stage || 'warm';
                  const stageBadge = {
                    new:     { icon: <Snowflake className="w-3 h-3" />, cls: 'text-prospex-dim border-prospex-border',       label: 'not started' },
                    warming: { icon: <Flame className="w-3 h-3" />,     cls: 'text-amber-400 border-amber-500/40',           label: `warming · day ${w?.days_in_warmup ?? 0}` },
                    warm:    { icon: <Flame className="w-3 h-3" />,     cls: 'text-prospex-green border-prospex-green/40',   label: 'fully warm' },
                    paused:  { icon: <Pause className="w-3 h-3" />,     cls: 'text-prospex-red border-prospex-red/40',       label: 'paused' },
                  }[stage];
                  return (
                    <tr key={a.id} className="table-row align-top">
                      <td className="px-3 py-2.5">
                        <p className="text-prospex-text font-mono">@{a.username}</p>
                        {a.display_name && <p className="text-[10px] text-prospex-dim">{a.display_name}</p>}
                        <select value={a.status || 'active'} onChange={e => handleStatus(a, e.target.value)} className="input text-[9px] py-0.5 px-1.5 mt-1 w-auto">
                          <option value="active">active</option>
                          <option value="warming">warming</option>
                          <option value="paused">paused</option>
                          <option value="resting">resting</option>
                        </select>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="space-y-1.5">
                          <span className={cn('inline-flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded border', stageBadge.cls)}>
                            {stageBadge.icon} {stageBadge.label}
                          </span>
                          <p className="text-[9px] text-prospex-dim leading-tight">{w?.procedure_step || `Target ${target}/day`}</p>
                          {w?.next_step_target && w?.next_step_at && (
                            <p className="text-[9px] text-prospex-cyan flex items-center gap-1">
                              <Clock className="w-2.5 h-2.5" /> → {w.next_step_target}/day on {new Date(w.next_step_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                            </p>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <p className="text-prospex-text font-mono">{used} / {target} <span className="text-prospex-dim text-[9px]">· cap {hardCap}</span></p>
                        <div className="w-full bg-prospex-bg rounded-full h-1 mt-1">
                          <div className={cn('h-1 rounded-full', pct >= 100 ? 'bg-prospex-green' : pct >= 80 ? 'bg-prospex-cyan' : 'bg-prospex-cyan/60')} style={{ width: `${pct}%` }} />
                        </div>
                        <p className="text-[9px] text-prospex-dim mt-0.5">{pct}% of target</p>
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <input type="number" min={0} max={hardCap} defaultValue={a.daily_target || 30}
                          onBlur={e => {
                            const v = parseInt(e.target.value);
                            if (!isNaN(v) && v !== (a.daily_target || 30)) handleTargetChange(a, v);
                          }}
                          className="input text-[10px] py-0.5 px-2 w-14 text-center" />
                        <p className="text-[9px] text-prospex-dim mt-0.5">total {a.total_sent || 0}</p>
                      </td>
                      <td className="px-3 py-2.5 text-center text-prospex-green font-mono">{a.total_replies || 0}</td>
                      <td className="px-3 py-2.5 text-prospex-dim text-[10px] font-mono">{a.last_sent_at ? new Date(a.last_sent_at).toLocaleString() : '—'}</td>
                      <td className="px-3 py-2.5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {stage === 'new' && (
                            <button onClick={() => handleWarmup(a, 'start_warmup')} className="text-[10px] font-mono text-prospex-cyan hover:text-prospex-text px-1.5 py-1 rounded border border-prospex-cyan/40" title="Begin 14-day ramp">
                              <Flame className="w-3 h-3 inline mr-1" />Start
                            </button>
                          )}
                          {stage === 'warming' && (w?.fully_warm || (w?.days_in_warmup ?? 0) >= 14) && (
                            <button onClick={() => handleWarmup(a, 'graduate')} className="text-[10px] font-mono text-prospex-green hover:text-prospex-text px-1.5 py-1 rounded border border-prospex-green/40" title="14 days complete">
                              <GraduationCap className="w-3 h-3 inline mr-1" />Graduate
                            </button>
                          )}
                          {(stage === 'warming' || stage === 'warm') && (
                            <button onClick={() => handleWarmup(a, 'pause')} className="text-prospex-dim hover:text-amber-400" title="Pause"><Pause className="w-3.5 h-3.5" /></button>
                          )}
                          {stage === 'paused' && (
                            <button onClick={() => handleWarmup(a, 'resume')} className="text-prospex-dim hover:text-prospex-green" title="Resume"><Play className="w-3.5 h-3.5" /></button>
                          )}
                          <button onClick={() => handleRemove(a)} className="text-prospex-dim hover:text-prospex-red" title="Remove"><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
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
}
