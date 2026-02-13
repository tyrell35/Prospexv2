'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Globe,
  Phone,
  Mail,
  MapPin,
  Star,
  Shield,
  Microscope,
  Upload,
  Trash2,
  ExternalLink,
  MessageCircle,
  Instagram,
  FileText,
  Check,
  X,
  RefreshCw,
  AlertCircle,
  Loader2,
  Send,
  Copy,
  Zap,
  ChevronDown,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { cn, getScoreColor, getScoreBgColor, getGrade, getSourceConfig, getPriorityConfig, formatDate, formatRelativeTime } from '@/lib/utils';
import type { Lead, DeepAudit, ActivityLog } from '@/lib/types';

interface Pitch {
  id: string;
  pitch_type: string;
  title: string;
  status: string;
  view_count: number;
  created_at: string;
}

function AuditCheck({ label, value, type = 'boolean' }: { label: string; value: boolean | number | null; type?: 'boolean' | 'score' }) {
  if (value === null || value === undefined) {
    return (
      <div className="flex items-center justify-between py-2 border-b border-prospex-border/30">
        <span className="text-sm text-prospex-muted">{label}</span>
        <span className="text-xs text-prospex-dim font-mono">Not checked</span>
      </div>
    );
  }

  if (type === 'score') {
    const numValue = value as number;
    return (
      <div className="flex items-center justify-between py-2 border-b border-prospex-border/30">
        <span className="text-sm text-prospex-muted">{label}</span>
        <span className={cn('text-sm font-mono font-bold', getScoreColor(numValue))}>
          {numValue}/100
        </span>
      </div>
    );
  }

  const passed = value as boolean;
  return (
    <div className="flex items-center justify-between py-2 border-b border-prospex-border/30">
      <span className="text-sm text-prospex-muted">{label}</span>
      {passed ? (
        <span className="flex items-center gap-1 text-xs font-mono text-prospex-green">
          <Check className="w-3.5 h-3.5" /> Pass
        </span>
      ) : (
        <span className="flex items-center gap-1 text-xs font-mono text-prospex-red">
          <X className="w-3.5 h-3.5" /> Fail
        </span>
      )}
    </div>
  );
}

export default function LeadDetailPage() {
  const params = useParams();
  const router = useRouter();
  const leadId = params.id as string;
  const [lead, setLead] = useState<Lead | null>(null);
  const [deepAudit, setDeepAudit] = useState<DeepAudit | null>(null);
  const [activities, setActivities] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [auditLoading, setAuditLoading] = useState(false);
  const [ghlLoading, setGhlLoading] = useState(false);
  const [deepAuditLoading, setDeepAuditLoading] = useState(false);
  const [pitches, setPitches] = useState<Pitch[]>([]);
  const [pitchLoading, setPitchLoading] = useState(false);
  const [showPitchMenu, setShowPitchMenu] = useState(false);
  const [copiedPitchId, setCopiedPitchId] = useState<string | null>(null);
  const pitchMenuRef = useRef<HTMLDivElement>(null);

  // Close pitch menu on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (pitchMenuRef.current && !pitchMenuRef.current.contains(e.target as Node)) {
        setShowPitchMenu(false);
      }
    };
    if (showPitchMenu) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showPitchMenu]);

  const fetchLead = async () => {
    try {
      const { data, error } = await supabase
        .from('leads')
        .select('*')
        .eq('id', leadId)
        .single();

      if (error) throw error;
      setLead(data);

      // Fetch deep audit if exists
      const { data: daData } = await supabase
        .from('deep_audits')
        .select('*')
        .eq('lead_id', leadId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      setDeepAudit(daData);

      // Fetch activities
      const { data: actData } = await supabase
        .from('activity_log')
        .select('*')
        .eq('lead_id', leadId)
        .order('created_at', { ascending: false })
        .limit(20);

      setActivities(actData || []);

      // Fetch pitches for this lead
      const { data: pitchData } = await supabase
        .from('pitches')
        .select('id, pitch_type, title, status, view_count, created_at')
        .eq('lead_id', leadId)
        .order('created_at', { ascending: false });

      setPitches(pitchData || []);
    } catch (error) {
      console.error('Failed to fetch lead:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLead();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadId]);

  const handleRunAudit = async () => {
    if (!lead) return;
    setAuditLoading(true);
    try {
      const response = await fetch('/api/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId: lead.id }),
      });
      if (response.ok) {
        await fetchLead();
      }
    } catch (error) {
      console.error('Audit failed:', error);
    } finally {
      setAuditLoading(false);
    }
  };

  const handleDeepAudit = async () => {
    if (!lead) return;
    setDeepAuditLoading(true);
    try {
      const response = await fetch('/api/deep-audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId: lead.id }),
      });
      if (response.ok) {
        await fetchLead();
      }
    } catch (error) {
      console.error('Deep audit failed:', error);
    } finally {
      setDeepAuditLoading(false);
    }
  };

  const handleGHLPush = async () => {
    if (!lead) return;
    setGhlLoading(true);
    try {
      const response = await fetch('/api/ghl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId: lead.id }),
      });
      if (response.ok) {
        await fetchLead();
      }
    } catch (error) {
      console.error('GHL push failed:', error);
    } finally {
      setGhlLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!lead) return;
    if (!confirm(`Delete "${lead.business_name}"? This cannot be undone.`)) return;

    await supabase.from('leads').delete().eq('id', lead.id);
    router.push('/leads');
  };

  const handleGeneratePitch = async (pitchType: string) => {
    if (!lead) return;
    setPitchLoading(true);
    setShowPitchMenu(false);
    try {
      const response = await fetch('/api/pitch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId: lead.id, pitchType }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Pitch generation failed');
      await fetchLead();
    } catch (error) {
      console.error('Pitch generation failed:', error);
      alert(error instanceof Error ? error.message : 'Pitch generation failed');
    } finally {
      setPitchLoading(false);
    }
  };

  const handleCopyPitchUrl = (pitchId: string) => {
    const url = `${window.location.origin}/pitch/${pitchId}`;
    navigator.clipboard.writeText(url);
    setCopiedPitchId(pitchId);
    setTimeout(() => setCopiedPitchId(null), 2000);
  };

  const getPitchTypeConfig = (type: string) => {
    const configs: Record<string, { label: string; emoji: string; color: string; description: string }> = {
      seo: { label: 'SEO Pitch', emoji: '🔍', color: 'bg-blue-500/20 text-blue-400 border-blue-500/40', description: 'Show them their missing Google rankings' },
      reviews: { label: 'Reviews Pitch', emoji: '⭐', color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/40', description: 'Highlight their reputation gaps' },
      ai_visibility: { label: 'AI Visibility Pitch', emoji: '🤖', color: 'bg-purple-500/20 text-purple-400 border-purple-500/40', description: 'Show they\'re invisible to ChatGPT & AI search' },
      competitor: { label: 'Competitor Pitch', emoji: '⚔️', color: 'bg-orange-500/20 text-orange-400 border-orange-500/40', description: 'Compare them against local competitors' },
      comprehensive: { label: 'Full Pitch', emoji: '🚀', color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40', description: 'Complete digital domination roadmap' },
    };
    return configs[type] || { label: type, emoji: '📄', color: 'bg-gray-500/20 text-gray-400 border-gray-500/40', description: '' };
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-2 border-prospex-cyan/30 border-t-prospex-cyan rounded-full animate-spin" />
      </div>
    );
  }

  if (!lead) {
    return (
      <div className="text-center py-20">
        <AlertCircle className="w-12 h-12 text-prospex-red mx-auto mb-3" />
        <p className="text-lg font-mono text-prospex-text">Lead not found</p>
        <Link href="/leads" className="btn-primary mt-4 inline-flex">
          <ArrowLeft className="w-4 h-4" /> Back to Leads
        </Link>
      </div>
    );
  }

  const sourceConfig = getSourceConfig(lead.source);

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Back + Actions */}
      <div className="flex items-center justify-between">
        <Link href="/leads" className="btn-ghost text-xs">
          <ArrowLeft className="w-4 h-4" /> Back to Leads
        </Link>
        <div className="flex items-center gap-2">
          {lead.website && lead.audit_status !== 'complete' && (
            <button onClick={handleRunAudit} disabled={auditLoading} className="btn-primary text-xs">
              {auditLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Shield className="w-3.5 h-3.5" />}
              Run Audit
            </button>
          )}
          <button onClick={handleDeepAudit} disabled={deepAuditLoading} className="btn text-xs bg-purple-500/20 text-purple-400 border border-purple-500/40 hover:bg-purple-500/30">
            {deepAuditLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Microscope className="w-3.5 h-3.5" />}
            Deep Audit
          </button>
          <div className="relative" ref={pitchMenuRef}>
            <button onClick={() => setShowPitchMenu(!showPitchMenu)} disabled={pitchLoading} className="btn text-xs bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 hover:bg-emerald-500/30">
              {pitchLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
              Generate Pitch
              <ChevronDown className="w-3 h-3" />
            </button>
            {showPitchMenu && (
              <div className="absolute right-0 top-full mt-1 w-72 bg-prospex-card border border-prospex-border rounded-lg shadow-xl z-50 overflow-hidden">
                <div className="p-2 border-b border-prospex-border">
                  <p className="text-[10px] font-mono text-prospex-dim uppercase px-2">Select pitch type</p>
                </div>
                {['seo', 'reviews', 'ai_visibility', 'competitor', 'comprehensive'].map(type => {
                  const config = getPitchTypeConfig(type);
                  return (
                    <button key={type} onClick={() => handleGeneratePitch(type)} className="w-full text-left px-4 py-3 hover:bg-prospex-surface transition-colors flex items-start gap-3 border-b border-prospex-border/30 last:border-0">
                      <span className="text-lg">{config.emoji}</span>
                      <div>
                        <p className="text-sm font-medium text-prospex-text">{config.label}</p>
                        <p className="text-[11px] text-prospex-dim mt-0.5">{config.description}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          {lead.phone && (
            <a href={`https://wa.me/${lead.phone.replace(/[^0-9]/g, "")}?text=Hi%2C%20I%20came%20across%20your%20business%20and%20wanted%20to%20reach%20out.`} target="_blank" rel="noopener noreferrer" className="btn text-xs bg-green-500/20 text-green-400 border border-green-500/40 hover:bg-green-500/30">
              <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
            </a>
          )}
          {lead.instagram_url && (
            <a href={`https://ig.me/m/${lead.instagram_url.replace(/https?:\/\/(www\.)?instagram\.com\/?/, "").replace(/\/$/, "")}`} target="_blank" rel="noopener noreferrer" className="btn text-xs bg-pink-500/20 text-pink-400 border border-pink-500/40 hover:bg-pink-500/30">
              <Instagram className="w-3.5 h-3.5" /> Instagram DM
            </a>
          )}
          {!lead.ghl_contact_id && (
            <button onClick={handleGHLPush} disabled={ghlLoading} className="btn-success text-xs">
              {ghlLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
              Push to GHL
            </button>
          )}
          <button onClick={handleDelete} className="btn-danger text-xs">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Business Info + Score */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Business Info */}
        <div className="lg:col-span-2 card p-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h1 className="text-xl font-mono font-bold text-prospex-text">{lead.business_name}</h1>
              <div className="flex items-center gap-2 mt-2">
                <span className={cn('badge', sourceConfig.color)}>{sourceConfig.label}</span>
                {lead.ghl_contact_id && (
                  <span className="badge bg-prospex-green/20 text-prospex-green border-prospex-green/40">
                    <Check className="w-3 h-3" /> In GHL
                  </span>
                )}
              </div>
            </div>
            {lead.google_rating && (
              <div className="text-right">
                <div className="flex items-center gap-1">
                  <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" />
                  <span className="font-mono font-bold text-lg text-prospex-text">{lead.google_rating.toFixed(1)}</span>
                </div>
                <p className="text-xs text-prospex-dim">{lead.google_review_count} reviews</p>
              </div>
            )}
          </div>

          <div className="space-y-3 mt-6">
            {lead.address && (
              <div className="flex items-center gap-3 text-sm">
                <MapPin className="w-4 h-4 text-prospex-dim shrink-0" />
                <span className="text-prospex-muted">{lead.address}</span>
              </div>
            )}
            {lead.phone && (
              <div className="flex items-center gap-3 text-sm">
                <Phone className="w-4 h-4 text-prospex-dim shrink-0" />
                <a href={`tel:${lead.phone}`} className="text-prospex-cyan hover:underline">{lead.phone}</a>
              </div>
            )}
            {lead.email && (
              <div className="flex items-center gap-3 text-sm">
                <Mail className="w-4 h-4 text-prospex-dim shrink-0" />
                <a href={`mailto:${lead.email}`} className="text-prospex-cyan hover:underline">{lead.email}</a>
              </div>
            )}
            {lead.website && (
              <div className="flex items-center gap-3 text-sm">
                <Globe className="w-4 h-4 text-prospex-dim shrink-0" />
                <a href={lead.website} target="_blank" rel="noopener noreferrer" className="text-prospex-cyan hover:underline flex items-center gap-1">
                  {lead.website} <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            )}
          </div>

          <p className="text-xs text-prospex-dim mt-4 font-mono">
            Added {formatDate(lead.created_at)} · Updated {formatRelativeTime(lead.updated_at)}
          </p>
        </div>

        {/* Score Card */}
        <div className="card p-6 flex flex-col items-center justify-center text-center">
          {lead.lead_score !== null ? (
            <>
              <p className="text-xs font-mono text-prospex-dim uppercase tracking-wider mb-2">Lead Score</p>
              <div className={cn('w-24 h-24 rounded-full border-4 flex items-center justify-center', getScoreBgColor(lead.lead_score))}>
                <span className={cn('text-3xl font-mono font-bold', getScoreColor(lead.lead_score))}>
                  {lead.lead_score}
                </span>
              </div>
              <p className={cn('text-lg font-mono font-bold mt-2', getScoreColor(lead.lead_score))}>
                Grade {lead.lead_grade}
              </p>
              {lead.lead_priority && (
                <div className="mt-2">
                  {(() => {
                    const pc = getPriorityConfig(lead.lead_priority);
                    return <span className={cn('badge text-sm', pc.bg, pc.text, pc.border)}>{pc.emoji} {pc.label}</span>;
                  })()}
                </div>
              )}
            </>
          ) : (
            <>
              <p className="text-xs font-mono text-prospex-dim uppercase tracking-wider mb-2">Lead Score</p>
              <div className="w-24 h-24 rounded-full border-4 border-prospex-border flex items-center justify-center">
                <span className="text-2xl font-mono text-prospex-dim">—</span>
              </div>
              <p className="text-xs text-prospex-dim mt-3">Run an audit to generate score</p>
            </>
          )}
        </div>
      </div>

      {/* Website Audit Results */}
      {lead.audit_data && (
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-mono font-semibold text-prospex-text flex items-center gap-2">
              <Shield className="w-5 h-5 text-prospex-amber" />
              Website Audit
            </h2>
            {lead.audit_score !== null && (
              <span className={cn('text-lg font-mono font-bold', getScoreColor(lead.audit_score))}>
                {lead.audit_score}/100
              </span>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
            <div>
              <AuditCheck label="SSL Certificate (HTTPS)" value={lead.audit_data.ssl_check} />
              <AuditCheck label="Mobile-Friendly Score" value={lead.audit_data.mobile_score} type="score" />
              <AuditCheck label="Page Speed Score" value={lead.audit_data.speed_score} type="score" />
              <AuditCheck label="Social Media Links" value={lead.audit_data.has_social_media} />
              <AuditCheck label="Click-to-Call" value={lead.audit_data.has_click_to_call} />
              <AuditCheck label="Video on Homepage" value={lead.audit_data.has_video} />
            </div>
            <div>
              <AuditCheck label="AI Chatbot" value={lead.audit_data.has_chatbot} />
              <AuditCheck label="Online Booking" value={lead.audit_data.has_booking} />
              <AuditCheck label="Meta Description" value={lead.audit_data.has_meta_description} />
              <AuditCheck label="H1 Tag" value={lead.audit_data.has_h1} />
              <AuditCheck label="Google Analytics" value={lead.audit_data.has_analytics} />
              <AuditCheck label="Schema Markup" value={lead.audit_data.has_schema} />
            </div>
          </div>
        </div>
      )}

      {/* Deep Audit Summary */}
      {deepAudit && deepAudit.status === 'complete' && (
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-mono font-semibold text-prospex-text flex items-center gap-2">
              <Microscope className="w-5 h-5 text-purple-400" />
              Deep Audit
            </h2>
            <Link href={`/deep-audit/${deepAudit.id}`} className="btn-ghost text-xs">
              Full Report <ExternalLink className="w-3 h-3" />
            </Link>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'SEO', score: deepAudit.seo_score, color: 'text-blue-400' },
              { label: 'Competitors', score: deepAudit.competitor_score, color: 'text-orange-400' },
              { label: 'Reviews', score: deepAudit.reviews_score, color: 'text-yellow-400' },
              { label: 'AI Visibility', score: deepAudit.ai_visibility_score, color: 'text-purple-400' },
            ].map(module => (
              <div key={module.label} className="text-center">
                <p className="text-xs font-mono text-prospex-dim uppercase">{module.label}</p>
                <p className={cn('text-2xl font-mono font-bold mt-1', module.score !== null ? getScoreColor(module.score) : 'text-prospex-dim')}>
                  {module.score ?? '—'}
                </p>
              </div>
            ))}
          </div>
          {deepAudit.overall_score !== null && (
            <div className="mt-4 pt-4 border-t border-prospex-border text-center">
              <p className="text-xs font-mono text-prospex-dim uppercase">Overall Deep Audit Score</p>
              <p className={cn('text-3xl font-mono font-bold mt-1', getScoreColor(deepAudit.overall_score))}>
                {deepAudit.overall_score}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Pitches */}
      {(pitches.length > 0 || pitchLoading) && (
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-mono font-semibold text-prospex-text flex items-center gap-2">
              <Zap className="w-5 h-5 text-emerald-400" />
              Generated Pitches
            </h2>
            <span className="text-xs text-prospex-dim font-mono">{pitches.length} pitch{pitches.length !== 1 ? 'es' : ''}</span>
          </div>
          {pitchLoading && (
            <div className="flex items-center gap-3 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-lg mb-4">
              <Loader2 className="w-5 h-5 text-emerald-400 animate-spin" />
              <div>
                <p className="text-sm font-medium text-emerald-400">Generating pitch...</p>
                <p className="text-xs text-prospex-dim mt-0.5">Analyzing audit data and building your pitch page</p>
              </div>
            </div>
          )}
          <div className="space-y-3">
            {pitches.map(pitch => {
              const config = getPitchTypeConfig(pitch.pitch_type);
              const pitchUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/pitch/${pitch.id}`;
              return (
                <div key={pitch.id} className="flex items-center justify-between p-4 bg-prospex-surface/50 border border-prospex-border/30 rounded-lg hover:border-prospex-border transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-xl">{config.emoji}</span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-prospex-text truncate">{pitch.title}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={cn('badge text-[10px]', config.color)}>{config.label}</span>
                        <span className="text-[10px] text-prospex-dim font-mono">{formatRelativeTime(pitch.created_at)}</span>
                        {pitch.view_count > 0 && (
                          <span className="text-[10px] text-prospex-cyan font-mono">👁 {pitch.view_count} view{pitch.view_count !== 1 ? 's' : ''}</span>
                        )}
                        {pitch.status === 'viewed' && (
                          <span className="badge text-[10px] bg-prospex-green/20 text-prospex-green border-prospex-green/40">Viewed</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-4">
                    <button onClick={() => handleCopyPitchUrl(pitch.id)} className="btn-ghost text-xs">
                      {copiedPitchId === pitch.id ? <><Check className="w-3.5 h-3.5 text-prospex-green" /> Copied</> : <><Copy className="w-3.5 h-3.5" /> Copy Link</>}
                    </button>
                    <a href={`/pitch/${pitch.id}`} target="_blank" rel="noopener noreferrer" className="btn-ghost text-xs">
                      <ExternalLink className="w-3.5 h-3.5" /> View
                    </a>
                    {lead?.phone && (
                      <a href={`https://wa.me/${lead.phone.replace(/[^0-9]/g, "")}?text=${encodeURIComponent(`Hi! I put together a quick report for ${lead.business_name} — take a look: ${pitchUrl}`)}`} target="_blank" rel="noopener noreferrer" className="btn text-xs bg-green-500/20 text-green-400 border border-green-500/40 hover:bg-green-500/30">
                        <Send className="w-3.5 h-3.5" /> Send
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Activity Timeline */}
      <div className="card p-6">
        <h2 className="font-mono font-semibold text-prospex-text mb-4">Activity Timeline</h2>
        {activities.length === 0 ? (
          <p className="text-xs text-prospex-dim font-mono">No activity recorded for this lead</p>
        ) : (
          <div className="space-y-3">
            {activities.map(activity => (
              <div key={activity.id} className="flex items-start gap-3">
                <div className="w-2 h-2 rounded-full bg-prospex-cyan mt-1.5 shrink-0" />
                <div>
                  <p className="text-sm text-prospex-text">{activity.description}</p>
                  <p className="text-[10px] text-prospex-dim font-mono">{formatRelativeTime(activity.created_at)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
