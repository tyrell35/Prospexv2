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
  Zap,
  TrendingDown,
  XCircle,
  Clock,
  Trophy,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { cn, getScoreColor, getScoreBgColor, getGrade, getSourceConfig, getPriorityConfig, formatDate, formatRelativeTime } from '@/lib/utils';
import type { Lead, DeepAudit, ActivityLog } from '@/lib/types';
import SendConfirmModal from '@/components/SendConfirmModal';

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
  const [playbooks, setPlaybooks] = useState<Array<{ id: string; content: string | null; growth_score: number | null; recommended_tier: string | null; status: string | null; created_at: string }>>([]);
  const [revenueLoss, setRevenueLoss] = useState<{
    total_estimated_monthly_loss: number;
    total_estimated_annual_loss: number;
    pitch_hook: string;
    top_3_fixes: string[];
    review_gap: { gap: number };
    website_losses: { website_score: number | null };
    ad_gap: { competitors_running_ads: number };
  } | null>(null);
  const [calcLoading, setCalcLoading] = useState(false);

  const calculateRevenueLoss = async () => {
    setCalcLoading(true);
    try {
      const res = await fetch('/api/revenue-loss', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'calculate', lead_id: leadId }),
      });
      const data = await res.json();
      if (data.success) setRevenueLoss(data.result);
    } catch {} finally {
      setCalcLoading(false);
    }
  };
  const [copied, setCopied] = useState<string | null>(null);
  const [proofAssets, setProofAssets] = useState<Array<{ id: string; asset_type: string; title: string; description: string | null; metric_before: string | null; metric_after: string | null; metric_timeframe: string | null; share_slug: string | null }>>([]);
  const [quickLinks, setQuickLinks] = useState<Array<{ id: string; name: string; url: string; emoji: string | null }>>([]);
  const [startingSequence, setStartingSequence] = useState(false);
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [templateChannel, setTemplateChannel] = useState<'instagram' | 'whatsapp' | 'sms'>('instagram');
  const [templates, setTemplates] = useState<any[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<any>(null);
  const [editedMessage, setEditedMessage] = useState('');
  const [copiedMessage, setCopiedMessage] = useState(false);
  const [templateFilter, setTemplateFilter] = useState('all');

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

      // Fetch all playbooks for this lead
      const { data: pbAllData } = await supabase
        .from('playbooks')
        .select('id, content, growth_score, recommended_tier, status, created_at')
        .eq('lead_id', leadId)
        .order('created_at', { ascending: false });
      setPlaybooks(pbAllData || []);
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

  // Load social proof assets + quick links once
  useEffect(() => {
    supabase.from('social_proof_assets')
      .select('id, asset_type, title, description, metric_before, metric_after, metric_timeframe, share_slug')
      .eq('is_active', true)
      .order('asset_type')
      .then(({ data }) => setProofAssets((data || []) as typeof proofAssets));
    supabase.from('quick_links')
      .select('id, name, url, emoji')
      .eq('is_active', true)
      .order('category')
      .then(({ data }) => setQuickLinks((data || []) as typeof quickLinks));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleStartSequence = async () => {
    if (!lead) return;
    setStartingSequence(true);
    const channel: 'instagram' | 'whatsapp' | 'sms' = lead.instagram_url ? 'instagram' : lead.phone ? 'whatsapp' : 'sms';
    const res = await fetch('/api/follow-ups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'start_sequence', lead_id: lead.id, channel }),
    });
    const data = await res.json();
    setStartingSequence(false);
    if (data.success) {
      router.push('/follow-ups');
    } else {
      alert(`Failed to start sequence: ${data.error || 'unknown error'}`);
    }
  };

  const copyProofStory = (asset: typeof proofAssets[number]) => {
    const firstName = lead?.business_name?.split(/[\s\-&]/)[0] || 'there';
    const tail = asset.share_slug ? `\nFull story: https://infinityclients.com/case/${asset.share_slug}` : '';
    const msg = `Hey ${firstName}, thought this was relevant — ${asset.description}${tail}\n\nWant the playbook?`;
    navigator.clipboard.writeText(msg);
    setCopied(`proof-${asset.id}`);
    setTimeout(() => setCopied(null), 2000);
  };

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

  const personalizeTemplate = (template: string): string => {
    if (!lead) return template;
    const firstName = lead.business_name?.split(' ')[0] || 'there';
    return template
      .replace(/\{\{first_name\}\}/g, firstName)
      .replace(/\{\{business_name\}\}/g, lead.business_name || '')
      .replace(/\{\{city\}\}/g, lead.city || '')
      .replace(/\{\{niche\}\}/g, lead.niche || 'aesthetic treatments')
      .replace(/\{\{treatment\}\}/g, lead.niche || 'aesthetic treatments')
      .replace(/\{\{their_reviews\}\}/g, String(lead.google_review_count || ''))
      .replace(/\{\{rating\}\}/g, String(lead.google_rating || ''))
      .replace(/\{\{website_score\}\}/g, String(lead.audit_score || ''))
      .replace(/\{\{load_time\}\}/g, '4.5')
      .replace(/\{\{competitor_reviews\}\}/g, '')
      .replace(/\{\{competitor_count\}\}/g, '')
      .replace(/\{\{competitor_name\}\}/g, '')
      .replace(/\{\{avg_reviews\}\}/g, '')
      .replace(/\{\{day\}\}/g, 'Tuesday')
      .replace(/\{\{time\}\}/g, '2pm')
      .replace(/\{\{day1\}\}/g, 'Tuesday')
      .replace(/\{\{time1\}\}/g, '2pm')
      .replace(/\{\{day2\}\}/g, 'Thursday')
      .replace(/\{\{time2\}\}/g, '11am')
      .replace(/\{\{booking_link\}\}/g, 'book.infinityclients.com');
  };

  const loadTemplates = async (channel: 'instagram' | 'whatsapp' | 'sms') => {
    setTemplateChannel(channel);

    const { data } = await supabase
      .from('conversation_templates')
      .select('*')
      .or(`channel.eq.${channel},channel.eq.all`)
      .order('category', { ascending: true });

    const filled = (data || []).map((t: any) => ({
      ...t,
      filled_content: personalizeTemplate(t.content),
    }));

    setTemplates(filled);
    setShowTemplatePicker(true);
    setSelectedTemplate(null);
    setEditedMessage('');
  };

  const selectTemplate = (template: any) => {
    setSelectedTemplate(template);
    setEditedMessage(template.filled_content);
  };

  const [confirmSendOpen, setConfirmSendOpen] = useState(false);
  const [confirmSendPayload, setConfirmSendPayload] = useState<{ message: string; stage: string; templateName: string; channel: 'instagram' | 'whatsapp' | 'sms' } | null>(null);

  const copyAndOpen = (openLink: boolean) => {
    navigator.clipboard.writeText(editedMessage);
    setCopiedMessage(true);
    setTimeout(() => setCopiedMessage(false), 3000);

    if (openLink) {
      if (templateChannel === 'instagram') {
        const handle = lead?.instagram_url?.split('/').filter(Boolean).pop() || '';
        window.open(`https://www.instagram.com/direct/t/${handle}/`, '_blank');
      } else if (templateChannel === 'whatsapp') {
        const phone = (lead?.phone_formatted || lead?.phone || '').replace(/[^0-9+]/g, '');
        window.open(`https://wa.me/${phone}?text=${encodeURIComponent(editedMessage)}`, '_blank');
      }
    }

    // Open the post-send confirmation modal — user picks account + confirms outcome.
    // Only actually opens on real send-and-open, not on plain Copy.
    if (openLink && lead?.id) {
      setConfirmSendPayload({
        message: editedMessage,
        stage: selectedTemplate?.category || 'cold_open',
        templateName: selectedTemplate?.name || 'Custom',
        channel: templateChannel,
      });
      setConfirmSendOpen(true);
    }
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
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <Link href="/leads" className="btn-ghost text-xs self-start">
          <ArrowLeft className="w-4 h-4" /> Back to Leads
        </Link>
        <div className="flex items-center gap-2 flex-wrap">
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
          {lead.instagram_url && (
            <button onClick={() => loadTemplates('instagram')}
              className="flex items-center gap-2 px-3 py-2 text-xs font-semibold rounded-lg bg-pink-500/20 text-pink-400 border border-pink-500/30 hover:bg-pink-500/30 transition-colors">
              <Instagram className="w-4 h-4" /> Send IG DM
            </button>
          )}
          {lead.phone && (
            <button onClick={() => loadTemplates('whatsapp')}
              className="flex items-center gap-2 px-3 py-2 text-xs font-semibold rounded-lg bg-green-500/20 text-green-400 border border-green-500/30 hover:bg-green-500/30 transition-colors">
              <MessageCircle className="w-4 h-4" /> Send WhatsApp
            </button>
          )}
          {lead.phone && (
            <button onClick={() => loadTemplates('sms')}
              className="flex items-center gap-2 px-3 py-2 text-xs font-semibold rounded-lg bg-blue-500/20 text-blue-400 border border-blue-500/30 hover:bg-blue-500/30 transition-colors">
              <Phone className="w-4 h-4" /> SMS Scripts
            </button>
          )}
          {!lead.ghl_contact_id && (
            <button onClick={handleGHLPush} disabled={ghlLoading} className="btn-success text-xs">
              {ghlLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
              Push to GHL
            </button>
          )}
          <button
            onClick={handleStartSequence}
            disabled={startingSequence}
            className="flex items-center gap-2 px-3 py-2 text-xs font-semibold rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/30 hover:bg-amber-500/30 transition-colors disabled:opacity-50"
          >
            {startingSequence ? <Loader2 className="w-4 h-4 animate-spin" /> : <Clock className="w-4 h-4" />}
            Start Follow-Up Sequence
          </button>
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

      {/* Revenue Loss Calculator */}
      <div className="card p-4 border-red-500/20">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-mono font-semibold text-red-400 flex items-center gap-2">
            <TrendingDown className="w-4 h-4" /> Revenue Loss Calculator
          </h3>
          <button
            onClick={calculateRevenueLoss}
            disabled={calcLoading}
            className="text-xs px-3 py-1.5 bg-red-500/10 text-red-400 rounded-lg hover:bg-red-500/20 border border-red-500/20 disabled:opacity-50"
          >
            {calcLoading ? 'Calculating...' : revenueLoss ? 'Recalculate' : 'Calculate Lost Revenue'}
          </button>
        </div>
        {revenueLoss && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 bg-red-500/5 rounded-lg text-center">
                <p className="text-2xl font-mono font-bold text-red-400">£{revenueLoss.total_estimated_monthly_loss.toLocaleString()}</p>
                <p className="text-[10px] text-prospex-dim uppercase">Est. Monthly Loss</p>
              </div>
              <div className="p-3 bg-red-500/5 rounded-lg text-center">
                <p className="text-2xl font-mono font-bold text-red-400">£{revenueLoss.total_estimated_annual_loss.toLocaleString()}</p>
                <p className="text-[10px] text-prospex-dim uppercase">Est. Annual Loss</p>
              </div>
            </div>
            <div className="p-3 bg-prospex-bg rounded-lg">
              <p className="text-xs text-prospex-text font-semibold mb-1">Pitch Hook (copy this):</p>
              <p className="text-xs text-prospex-muted italic">{revenueLoss.pitch_hook}</p>
            </div>
            <div className="space-y-1">
              <p className="text-[10px] text-prospex-dim uppercase font-mono">Top fixes:</p>
              {revenueLoss.top_3_fixes.map((fix: string, i: number) => (
                <p key={i} className="text-xs text-prospex-muted">• {fix}</p>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-2 text-center text-[10px]">
              <div className="p-2 bg-prospex-bg rounded">
                <p className="text-amber-400 font-mono font-bold">{revenueLoss.review_gap.gap}</p>
                <p className="text-prospex-dim">Review Gap</p>
              </div>
              <div className="p-2 bg-prospex-bg rounded">
                <p className="text-blue-400 font-mono font-bold">{revenueLoss.website_losses.website_score ?? '—'}/100</p>
                <p className="text-prospex-dim">Website Score</p>
              </div>
              <div className="p-2 bg-prospex-bg rounded">
                <p className="text-purple-400 font-mono font-bold">{revenueLoss.ad_gap.competitors_running_ads}</p>
                <p className="text-prospex-dim">Comps Running Ads</p>
              </div>
            </div>
          </div>
        )}
        {!revenueLoss && !calcLoading && (
          <p className="text-xs text-prospex-dim">Click &quot;Calculate Lost Revenue&quot; to see how much money this business is leaving on the table vs competitors.</p>
        )}
      </div>

      {/* Social Proof Arsenal */}
      {(proofAssets.length > 0 || quickLinks.length > 0) && (
        <div className="card p-4 border-amber-500/20">
          <h3 className="text-sm font-mono font-semibold text-amber-400 flex items-center gap-2 mb-3">
            <Trophy className="w-4 h-4" /> Social Proof Arsenal
          </h3>
          {proofAssets.length > 0 && (
            <div className="space-y-2">
              {proofAssets.map(asset => (
                <div key={asset.id} className="flex items-center justify-between gap-2 p-2 bg-prospex-bg rounded-lg">
                  <div className="min-w-0">
                    <p className="text-xs text-prospex-text font-medium truncate">{asset.title}</p>
                    {asset.metric_before && asset.metric_after && (
                      <p className="text-[10px] text-prospex-dim">
                        <span className="text-prospex-red">{asset.metric_before}</span>
                        <span className="mx-1">→</span>
                        <span className="text-prospex-green">{asset.metric_after}</span>
                        {asset.metric_timeframe && <span className="text-prospex-dim"> in {asset.metric_timeframe}</span>}
                      </p>
                    )}
                  </div>
                  <button onClick={() => copyProofStory(asset)}
                    className={cn('text-[10px] px-2 py-1 rounded shrink-0',
                      copied === `proof-${asset.id}`
                        ? 'bg-prospex-green/20 text-prospex-green'
                        : 'bg-amber-500/10 text-amber-400 hover:bg-amber-500/20')}>
                    {copied === `proof-${asset.id}` ? <><Check className="w-3 h-3 inline" /> Copied</> : 'Copy Story'}
                  </button>
                </div>
              ))}
            </div>
          )}
          {quickLinks.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-prospex-border/20">
              {quickLinks.map(link => (
                <button key={link.id}
                  onClick={() => { navigator.clipboard.writeText(link.url); setCopied(`link-${link.id}`); setTimeout(() => setCopied(null), 1500); }}
                  className={cn('text-[10px] px-2 py-1 rounded border transition-colors',
                    copied === `link-${link.id}`
                      ? 'bg-prospex-green/20 text-prospex-green border-prospex-green/40'
                      : 'bg-prospex-surface text-prospex-dim border-prospex-border hover:text-prospex-text')}>
                  {link.emoji && <span className="mr-1">{link.emoji}</span>}
                  {copied === `link-${link.id}` ? 'Copied!' : link.name}
                </button>
              ))}
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
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
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
      <div className="card p-4 mt-4">
        <h3 className="text-sm font-mono font-semibold text-prospex-text mb-3 flex items-center gap-2">
          <Zap className="w-4 h-4 text-green-400" /> Generated Pitches
          {pitches.length > 0 && <span className="text-xs text-prospex-dim font-normal">({pitches.length})</span>}
        </h3>
        {pitches.length > 0 ? (
          <div className="space-y-2">
            {pitches.map(p => (
              <Link
                key={p.id}
                href={`/pitch/${p.id}`}
                target="_blank"
                className="flex items-center justify-between p-2 bg-prospex-bg rounded-lg hover:bg-prospex-surface transition-colors"
              >
                <div className="min-w-0">
                  <p className="text-sm text-prospex-text truncate">{p.title || p.pitch_type || 'Pitch'}</p>
                  <p className="text-[10px] text-prospex-dim">
                    {p.pitch_type ? `${p.pitch_type} • ` : ''}{new Date(p.created_at).toLocaleDateString()}
                  </p>
                </div>
                <ExternalLink className="w-3 h-3 text-prospex-dim flex-shrink-0" />
              </Link>
            ))}
          </div>
        ) : (
          <p className="text-xs text-prospex-dim">No pitches yet. Run a Deep Audit first, then click Generate Pitch.</p>
        )}
      </div>

      {/* Playbooks */}
      <div className="card p-4 mt-4">
        <h3 className="text-sm font-mono font-semibold text-prospex-text mb-3 flex items-center gap-2">
          <FileText className="w-4 h-4 text-purple-400" /> Playbooks
          {playbooks.length > 0 && <span className="text-xs text-prospex-dim font-normal">({playbooks.length})</span>}
        </h3>
        {(() => {
          const status = ((lead as unknown as { playbook_status?: string }).playbook_status) || (playbooks.length > 0 ? 'ready' : 'none');
          if (status === 'ready' && playbooks.length > 0) {
            return (
              <div className="space-y-2">
                {playbooks.map(pb => (
                  <div key={pb.id} className="p-3 bg-prospex-bg rounded-lg">
                    <p className="text-sm text-prospex-text">Growth Score: {pb.growth_score ?? '—'}/100</p>
                    <p className="text-[10px] text-prospex-dim">
                      Tier: {pb.recommended_tier ?? '—'} • {new Date(pb.created_at).toLocaleDateString()}
                    </p>
                    <details className="mt-2">
                      <summary className="text-xs text-prospex-cyan cursor-pointer">View Content</summary>
                      <div className="mt-2 text-xs text-prospex-muted whitespace-pre-wrap">{pb.content || ''}</div>
                    </details>
                  </div>
                ))}
              </div>
            );
          }
          if (status === 'generating') {
            return <p className="text-xs text-amber-400">⏳ Generating playbook...</p>;
          }
          if (status === 'failed') {
            return <p className="text-xs text-red-400">❌ Playbook generation failed. Try again.</p>;
          }
          return <p className="text-xs text-prospex-dim">No playbook yet. Click &quot;Generate Playbook&quot; to create one.</p>;
        })()}
      </div>

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

      {/* Template Picker Modal */}
      {showTemplatePicker && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setShowTemplatePicker(false)}>
          <div className="bg-prospex-surface border border-prospex-border rounded-xl w-full max-w-3xl mx-2 md:mx-auto max-h-[90vh] md:max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>

            <div className="p-4 border-b border-prospex-border flex items-center justify-between">
              <div className="flex items-center gap-3">
                {templateChannel === 'instagram' && <Instagram className="w-5 h-5 text-pink-400" />}
                {templateChannel === 'whatsapp' && <MessageCircle className="w-5 h-5 text-green-400" />}
                {templateChannel === 'sms' && <Phone className="w-5 h-5 text-blue-400" />}
                <div>
                  <h2 className="text-sm font-mono font-bold text-prospex-text">
                    {templateChannel === 'instagram' ? 'Instagram DM' : templateChannel === 'whatsapp' ? 'WhatsApp' : 'SMS'} — {lead?.business_name}
                  </h2>
                  <p className="text-[10px] text-prospex-dim">{templates.length} templates available • Variables auto-filled with lead data</p>
                </div>
              </div>
              <button onClick={() => setShowTemplatePicker(false)} className="text-prospex-dim hover:text-prospex-text">
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <div className="flex flex-col md:flex-row flex-1 overflow-hidden">
              <div className="w-full md:w-1/2 border-b md:border-b-0 md:border-r border-prospex-border overflow-y-auto p-3 space-y-1 max-h-[40vh] md:max-h-none">
                <div className="flex flex-wrap gap-1 mb-3 pb-2 border-b border-prospex-border/30">
                  {['all', 'cold_open', 'gift_leads', 'follow_up', 'booking', 'objection', 'closing'].map(cat => (
                    <button key={cat} onClick={() => setTemplateFilter(cat)}
                      className={`text-[9px] px-2 py-1 rounded-full font-mono transition-colors ${
                        templateFilter === cat
                          ? 'bg-prospex-cyan/20 text-prospex-cyan border border-prospex-cyan/30'
                          : 'bg-prospex-bg text-prospex-dim hover:text-prospex-text'
                      }`}>
                      {cat === 'all' ? 'All' : cat.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                    </button>
                  ))}
                </div>

                {templates
                  .filter(t => templateFilter === 'all' || t.category === templateFilter)
                  .map((t: any) => (
                  <button key={t.id} onClick={() => selectTemplate(t)}
                    className={`w-full text-left p-2.5 rounded-lg transition-colors ${
                      selectedTemplate?.id === t.id
                        ? 'bg-prospex-cyan/10 border border-prospex-cyan/30'
                        : 'hover:bg-prospex-bg border border-transparent'
                    }`}>
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-medium text-prospex-text truncate">{t.name}</p>
                      <span className="text-[8px] px-1.5 py-0.5 rounded bg-prospex-bg text-prospex-dim font-mono shrink-0 ml-2">
                        {t.category?.replace(/_/g, ' ')}
                      </span>
                    </div>
                    <p className="text-[10px] text-prospex-dim mt-1 line-clamp-2">{t.filled_content?.slice(0, 80)}...</p>
                  </button>
                ))}
              </div>

              <div className="w-full md:w-1/2 p-4 flex flex-col">
                {selectedTemplate ? (
                  <>
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-xs font-mono font-semibold text-prospex-text">{selectedTemplate.name}</h3>
                      <span className="text-[8px] px-1.5 py-0.5 rounded bg-prospex-surface text-prospex-dim">
                        {selectedTemplate.channel} • {selectedTemplate.category?.replace(/_/g, ' ')}
                      </span>
                    </div>

                    <textarea
                      value={editedMessage}
                      onChange={e => setEditedMessage(e.target.value)}
                      className="flex-1 w-full bg-prospex-bg border border-prospex-border rounded-lg p-3 text-xs text-prospex-text resize-none focus:border-prospex-cyan/50 focus:outline-none font-mono leading-relaxed"
                      placeholder="Select a template from the left..."
                    />

                    <div className="flex items-center justify-between mt-2">
                      <p className="text-[9px] text-prospex-dim">{editedMessage.length} characters</p>
                      {editedMessage.includes('{{') && (
                        <p className="text-[9px] text-amber-400">⚠️ Some variables need manual replacement</p>
                      )}
                    </div>

                    <div className="flex gap-2 mt-3">
                      <button onClick={() => copyAndOpen(false)}
                        className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-colors ${
                          copiedMessage
                            ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                            : 'bg-prospex-bg text-prospex-muted border border-prospex-border hover:border-prospex-cyan/30'
                        }`}>
                        {copiedMessage ? '✓ Copied!' : '📋 Copy Message'}
                      </button>
                      <button onClick={() => copyAndOpen(true)}
                        className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-colors ${
                          templateChannel === 'instagram'
                            ? 'bg-pink-500/20 text-pink-400 border border-pink-500/30 hover:bg-pink-500/30'
                            : templateChannel === 'whatsapp'
                            ? 'bg-green-500/20 text-green-400 border border-green-500/30 hover:bg-green-500/30'
                            : 'bg-blue-500/20 text-blue-400 border border-blue-500/30 hover:bg-blue-500/30'
                        }`}>
                        {templateChannel === 'instagram' ? '📤 Copy & Open IG'
                         : templateChannel === 'whatsapp' ? '📤 Copy & Open WA'
                         : '📋 Copy SMS'}
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="flex-1 flex items-center justify-center">
                    <div className="text-center">
                      <MessageCircle className="w-8 h-8 text-prospex-dim mx-auto mb-2" />
                      <p className="text-xs text-prospex-dim">Select a template from the left</p>
                      <p className="text-[10px] text-prospex-dim mt-1">Variables like name, city, and review count are auto-filled</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Post-send confirmation modal — pops after Copy & Open in the template picker */}
      <SendConfirmModal
        isOpen={confirmSendOpen}
        onClose={() => setConfirmSendOpen(false)}
        onLogged={() => setConfirmSendOpen(false)}
        lead={lead && confirmSendPayload ? { id: lead.id, business_name: lead.business_name } : null}
        channel={confirmSendPayload?.channel || 'instagram'}
        stage={confirmSendPayload?.stage}
        messageSent={confirmSendPayload?.message}
        templateName={confirmSendPayload?.templateName}
      />
    </div>
  );
}
