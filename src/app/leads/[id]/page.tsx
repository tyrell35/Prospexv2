'use client';

import { useEffect, useState } from 'react';
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
  ScrollText,
  Copy,
  Send,
  Loader2,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Download,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { cn, getScoreColor, getScoreBgColor, getGrade, getSourceConfig, getPriorityConfig, formatDate, formatRelativeTime } from '@/lib/utils';
import type { Lead, DeepAudit, ActivityLog } from '@/lib/types';

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
  const [playbook, setPlaybook] = useState<Record<string, unknown> | null>(null);
  const [playbookLoading, setPlaybookLoading] = useState(false);
  const [playbookExpanded, setPlaybookExpanded] = useState(false);
  const [pitches, setPitches] = useState<Array<{ id: string; pitch_type: string | null; title: string | null; created_at: string; status: string | null }>>([]);
  const [copied, setCopied] = useState<string | null>(null);

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

      // Fetch playbook if exists
      const { data: pbData } = await supabase
        .from('playbooks')
        .select('*')
        .eq('lead_id', leadId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      setPlaybook(pbData as Record<string, unknown> | null);

      // Fetch pitches for this lead
      const { data: pitchData } = await supabase
        .from('pitches')
        .select('id, pitch_type, title, created_at, status')
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

  const handleGeneratePlaybook = async () => {
    if (!lead) return;
    setPlaybookLoading(true);
    try {
      const res = await fetch('/api/generate-playbook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lead_id: lead.id }),
      });
      if (res.ok) {
        await fetchLead();
        setPlaybookExpanded(true);
      }
    } catch (err) {
      console.error('Playbook generation failed:', err);
    } finally {
      setPlaybookLoading(false);
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  };

  const postPlaybookToSlack = async () => {
    if (!lead || !playbook) return;
    await fetch('/api/slack-post', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lead_id: lead.id, playbook_id: playbook.id }),
    });
    setCopied('slack');
    setTimeout(() => setCopied(null), 2000);
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
          {lead.phone && lead.whatsapp_eligible && (
            <a href={`https://wa.me/${(lead.phone_formatted || lead.phone).replace(/[^0-9]/g, "")}?text=Hi%2C%20I%20came%20across%20your%20business%20and%20wanted%20to%20reach%20out.`} target="_blank" rel="noopener noreferrer" className="btn text-xs bg-green-500/20 text-green-400 border border-green-500/40 hover:bg-green-500/30">
              <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
            </a>
          )}
          {lead.phone && !lead.whatsapp_eligible && (
            <span className="btn text-xs bg-gray-500/10 text-prospex-dim border border-prospex-border cursor-default" title="Landline - not on WhatsApp">
              <MessageCircle className="w-3.5 h-3.5" /> Landline
            </span>
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
          {/* Playbook status + action */}
          {(() => {
            const status = ((lead as unknown as { playbook_status?: string }).playbook_status) || (playbook ? 'ready' : 'none');
            if (playbookLoading || status === 'generating') {
              return (
                <span className="badge bg-prospex-cyan/20 text-prospex-cyan border border-prospex-cyan/40">
                  <Loader2 className="w-3 h-3 animate-spin" /> Generating…
                </span>
              );
            }
            if (status === 'ready' && playbook) {
              return (
                <button onClick={() => { setPlaybookExpanded(true); setTimeout(() => document.getElementById('playbook-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50); }} className="btn text-xs bg-prospex-green/20 text-prospex-green border border-prospex-green/40 hover:bg-prospex-green/30">
                  <ScrollText className="w-3.5 h-3.5" /> View Playbook
                </button>
              );
            }
            if (status === 'failed') {
              return (
                <button onClick={handleGeneratePlaybook} className="btn text-xs bg-prospex-red/20 text-prospex-red border border-prospex-red/40 hover:bg-prospex-red/30">
                  <RefreshCw className="w-3.5 h-3.5" /> Retry Playbook
                </button>
              );
            }
            return (
              <button onClick={handleGeneratePlaybook} className="btn text-xs bg-prospex-cyan/20 text-prospex-cyan border border-prospex-cyan/40 hover:bg-prospex-cyan/30">
                <ScrollText className="w-3.5 h-3.5" /> Generate Playbook
              </button>
            );
          })()}
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

      {/* Growth Playbook */}
      {playbookLoading && (
        <div className="card p-6 border-prospex-cyan/30">
          <div className="flex items-center gap-3">
            <Loader2 className="w-5 h-5 text-prospex-cyan animate-spin" />
            <div>
              <p className="text-sm font-mono text-prospex-cyan">Generating Growth Playbook for {lead.business_name}...</p>
              <p className="text-xs text-prospex-dim mt-1">This takes 30-60 seconds. Analysing market, competitors, and revenue opportunities.</p>
            </div>
          </div>
        </div>
      )}
      {playbook && (
        <div id="playbook-section" className="card p-6 border-prospex-cyan/30">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-mono font-semibold text-prospex-text flex items-center gap-2">
              <ScrollText className="w-5 h-5 text-prospex-cyan" />
              Growth Playbook
            </h2>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono text-prospex-dim">
                Generated {playbook.created_at ? new Date(playbook.created_at as string).toLocaleDateString('en-GB') : ''}
              </span>
              <span className={cn('badge text-[10px]',
                playbook.status === 'ready' ? 'bg-prospex-green/20 text-prospex-green border-prospex-green/40' :
                playbook.status === 'sent' ? 'bg-prospex-cyan/20 text-prospex-cyan border-prospex-cyan/40' :
                'bg-prospex-dim/20 text-prospex-dim'
              )}>{String(playbook.status)}</span>
            </div>
          </div>

          {/* Scores row */}
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div className="p-3 rounded-lg bg-prospex-bg border border-prospex-border text-center">
              <p className="text-[10px] font-mono text-prospex-dim uppercase">Growth Score</p>
              <p className={cn('text-xl font-mono font-bold mt-1', getScoreColor(Number(playbook.growth_score) || 0))}>
                {String(playbook.growth_score || '—')}<span className="text-xs text-prospex-dim">/100</span>
              </p>
            </div>
            <div className="p-3 rounded-lg bg-prospex-bg border border-prospex-border text-center">
              <p className="text-[10px] font-mono text-prospex-dim uppercase">Revenue Leak</p>
              <p className="text-xl font-mono font-bold text-prospex-red mt-1">{String(playbook.revenue_leak || '—')}<span className="text-xs text-prospex-dim">/mo</span></p>
            </div>
            <div className="p-3 rounded-lg bg-prospex-bg border border-prospex-border text-center">
              <p className="text-[10px] font-mono text-prospex-dim uppercase">Recommended Tier</p>
              <p className="text-xl font-mono font-bold text-prospex-amber mt-1">{String(playbook.recommended_tier || '—')}</p>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2 mb-4">
            {!!playbook.email_subject && (
              <button onClick={() => copyToClipboard(`Subject: ${String(playbook.email_subject)}\n\n${String(playbook.email_body || '')}`, 'email')}
                className="btn text-xs bg-prospex-bg border border-prospex-border text-prospex-muted hover:text-prospex-text">
                {copied === 'email' ? <Check className="w-3 h-3 text-prospex-green" /> : <Copy className="w-3 h-3" />}
                Copy Email
              </button>
            )}
            {!!playbook.dm_text && (
              <button onClick={() => copyToClipboard(String(playbook.dm_text), 'dm')}
                className="btn text-xs bg-prospex-bg border border-prospex-border text-prospex-muted hover:text-prospex-text">
                {copied === 'dm' ? <Check className="w-3 h-3 text-prospex-green" /> : <Copy className="w-3 h-3" />}
                Copy DM
              </button>
            )}
            <button onClick={postPlaybookToSlack}
              className="btn text-xs bg-prospex-bg border border-prospex-border text-prospex-muted hover:text-prospex-text">
              {copied === 'slack' ? <Check className="w-3 h-3 text-prospex-green" /> : <Send className="w-3 h-3" />}
              Post to Slack
            </button>
            <button disabled className="btn text-xs bg-prospex-bg border border-prospex-border text-prospex-dim cursor-not-allowed opacity-50">
              <Download className="w-3 h-3" /> Download PDF
            </button>
          </div>

          {/* Outreach copy */}
          {!!playbook.email_subject && (
            <div className="p-3 rounded-lg bg-prospex-bg border border-prospex-border mb-3">
              <p className="text-[10px] font-mono text-prospex-dim uppercase mb-1">Cold Email</p>
              <p className="text-xs font-mono text-prospex-amber mb-1">Subject: {String(playbook.email_subject)}</p>
              <p className="text-xs font-mono text-prospex-muted whitespace-pre-wrap">{String(playbook.email_body || '')}</p>
            </div>
          )}
          {!!playbook.dm_text && (
            <div className="p-3 rounded-lg bg-prospex-bg border border-prospex-border mb-3">
              <p className="text-[10px] font-mono text-prospex-dim uppercase mb-1">Instagram DM</p>
              <p className="text-xs font-mono text-prospex-muted whitespace-pre-wrap">{String(playbook.dm_text)}</p>
            </div>
          )}

          {/* Expandable full playbook */}
          <button onClick={() => setPlaybookExpanded(!playbookExpanded)}
            className="w-full flex items-center justify-between p-3 rounded-lg bg-prospex-bg border border-prospex-border hover:border-prospex-cyan/30 transition-colors">
            <span className="text-xs font-mono text-prospex-muted flex items-center gap-2">
              <Sparkles className="w-3 h-3 text-prospex-cyan" />
              Full Growth Playbook ({String(playbook.content || '').split('\n').length} lines)
            </span>
            {playbookExpanded ? <ChevronUp className="w-4 h-4 text-prospex-dim" /> : <ChevronDown className="w-4 h-4 text-prospex-dim" />}
          </button>
          {playbookExpanded && (
            <div className="mt-3 p-4 rounded-lg bg-prospex-bg border border-prospex-border max-h-[500px] overflow-y-auto">
              <pre className="text-xs font-mono text-prospex-muted whitespace-pre-wrap leading-relaxed">{String(playbook.content || '')}</pre>
            </div>
          )}
        </div>
      )}

      {/* Pitches */}
      {pitches.length > 0 && (
        <div className="card p-6">
          <h2 className="font-mono font-semibold text-prospex-text mb-4 flex items-center gap-2">
            <ScrollText className="w-5 h-5 text-prospex-cyan" />
            Pitches <span className="text-xs text-prospex-dim font-normal">({pitches.length})</span>
          </h2>
          <div className="divide-y divide-prospex-border">
            {pitches.map(p => (
              <Link
                key={p.id}
                href={`/pitch/${p.id}`}
                className="flex items-center justify-between py-3 px-2 -mx-2 rounded hover:bg-prospex-bg"
              >
                <div className="min-w-0">
                  <div className="text-sm font-mono text-prospex-text truncate">
                    {p.title || p.pitch_type || 'Pitch'}
                  </div>
                  <div className="text-[11px] text-prospex-dim mt-0.5">
                    {p.pitch_type ? <span className="uppercase tracking-wider mr-2">{p.pitch_type}</span> : null}
                    {new Date(p.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </div>
                </div>
                {p.status && (
                  <span className="badge text-[10px] bg-prospex-bg border border-prospex-border text-prospex-muted">{p.status}</span>
                )}
              </Link>
            ))}
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
