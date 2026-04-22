'use client';

import { useState, useEffect, useMemo } from 'react';
import { X, MessageCircle, Instagram, ExternalLink, Check, SkipForward, Zap, ChevronRight, AlertCircle } from 'lucide-react';

interface BlasterLead {
  id: string;
  business_name: string;
  phone?: string | null;
  instagram_url?: string | null;
  city?: string | null;
  google_rating?: number | null;
  google_review_count?: number | null;
  niche?: string | null;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  channel: 'whatsapp' | 'instagram';
  leads: BlasterLead[];
}

interface Template {
  id: string;
  name: string;
  stage: string;
  message: string;
}

const TEMPLATES: Template[] = [
  { id: 'cold-1', name: 'Casual Question Opener', stage: 'Cold Open', message: `Hey {{firstName}} 👋 quick question — are you currently running any paid ads for {{clinicName}} or relying mostly on word of mouth and organic?` },
  { id: 'cold-2', name: 'Compliment + Curiosity', stage: 'Cold Open', message: `Hey! Just came across {{clinicName}} — your treatment menu looks amazing. Quick question, are you actively looking to bring in more {{treatmentType}} bookings or are you at capacity right now?` },
  { id: 'cold-3', name: 'Competitor Insight', stage: 'Cold Open', message: `Hey {{firstName}} — I noticed a few clinics near {{city}} are running some really aggressive ad campaigns right now. I've got some intel on what's working for them. Worth sharing?` },
  { id: 'cold-4', name: 'Google Reviews Opener', stage: 'Cold Open', message: `Hey {{firstName}} — noticed {{clinicName}} has {{reviewCount}} Google reviews which is solid. Have you thought about turning those into a client-generating machine? A lot of clinics with similar reviews are getting 30-50 new enquiries/month from it.` },
  { id: 'fu-1', name: 'Value Drop (Audit)', stage: 'Follow-Up', message: `Hey {{firstName}} — I actually ran a quick check on {{clinicName}}'s online presence and found a few things that might be costing you new bookings. Want me to send over what I found?` },
  { id: 'fu-2', name: 'Case Study Drop', stage: 'Follow-Up', message: `Hey {{firstName}} — just wanted to share a quick result. We helped a {{niche}} in {{city}} go from 12 to 47 new enquiries per month in 6 weeks. Similar size to {{clinicName}}. Would the strategy behind that be useful for you?` },
  { id: 'breakup', name: 'Breakup Message', stage: 'Breakup', message: `Hey {{firstName}} — I've reached out a couple of times and I get it, you're probably flat out. I'll close your file on my end. If you ever want to explore getting more {{treatmentType}} clients, I'm here. No hard feelings either way 👊` },
];

function fillTemplate(template: string, lead: BlasterLead): string {
  const firstName = lead.business_name?.split(/[\s\-&]/)[0] || 'there';
  return template
    .replace(/\{\{firstName\}\}/g, firstName)
    .replace(/\{\{clinicName\}\}/g, lead.business_name || 'your clinic')
    .replace(/\{\{city\}\}/g, lead.city || 'your area')
    .replace(/\{\{reviewCount\}\}/g, String(lead.google_review_count || 'great'))
    .replace(/\{\{niche\}\}/g, lead.niche || 'clinic')
    .replace(/\{\{treatmentType\}\}/g, 'treatment');
}

function isEligible(lead: BlasterLead, channel: 'whatsapp' | 'instagram'): boolean {
  if (channel === 'whatsapp') return !!lead.phone && lead.phone.replace(/[^0-9]/g, '').length >= 7;
  return !!lead.instagram_url;
}

function buildOpenUrl(lead: BlasterLead, channel: 'whatsapp' | 'instagram', message: string): string | null {
  if (channel === 'whatsapp') {
    const phone = (lead.phone || '').replace(/[^0-9+]/g, '').replace('+', '');
    if (!phone) return null;
    return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
  }
  const url = lead.instagram_url || '';
  const handleMatch = url.replace(/https?:\/\/(www\.)?instagram\.com\/?/, '').replace(/\/$/, '').split('/')[0];
  if (handleMatch) return `https://ig.me/m/${handleMatch}`;
  return url || null;
}

const STAGE_MAP: Record<string, string> = { 'Cold Open': 'cold_open', 'Follow-Up': 'follow_up_1', 'Breakup': 'follow_up_3' };

function logOutreach(lead: BlasterLead, channel: string, template: Template | undefined, message: string) {
  const stage = STAGE_MAP[template?.stage || ''] || 'cold_open';

  try {
    const logsRaw = localStorage.getItem('prospex_outreach_logs') || '[]';
    const logs = JSON.parse(logsRaw);
    logs.unshift({
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
      lead_id: lead.id,
      lead_name: lead.business_name,
      channel,
      stage,
      outcome: 'sent',
      message,
      source: 'blaster',
    });
    localStorage.setItem('prospex_outreach_logs', JSON.stringify(logs.slice(0, 1000)));
  } catch {}

  // Also fire to backend tracker (best-effort)
  fetch('/api/outreach-tracker', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'log_outreach',
      lead_id: lead.id,
      channel,
      stage,
      message_sent: message,
      sent_by: 'blaster',
    }),
  }).catch(() => {});
}

export default function OutreachBlaster({ isOpen, onClose, channel, leads }: Props) {
  const eligibleLeads = useMemo(() => leads.filter(l => isEligible(l, channel)), [leads, channel]);
  const ineligibleCount = leads.length - eligibleLeads.length;

  const [phase, setPhase] = useState<'template' | 'sending' | 'done'>('template');
  const [templateId, setTemplateId] = useState('cold-1');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [editedMessage, setEditedMessage] = useState('');
  const [sentIds, setSentIds] = useState<Set<string>>(new Set());
  const [skippedIds, setSkippedIds] = useState<Set<string>>(new Set());

  const template = TEMPLATES.find(t => t.id === templateId);
  const currentLead: BlasterLead | undefined = eligibleLeads[currentIndex];

  // Reset state when opened or channel changes
  useEffect(() => {
    if (isOpen) {
      setPhase('template');
      setCurrentIndex(0);
      setSentIds(new Set());
      setSkippedIds(new Set());
      setTemplateId('cold-1');
    }
  }, [isOpen, channel]);

  // Refill message when lead or template changes during sending
  useEffect(() => {
    if (phase === 'sending' && currentLead && template) {
      setEditedMessage(fillTemplate(template.message, currentLead));
    }
  }, [phase, currentIndex, templateId, currentLead, template]);

  const advance = () => {
    if (currentIndex + 1 >= eligibleLeads.length) {
      setPhase('done');
    } else {
      setCurrentIndex(i => i + 1);
    }
  };

  const handleSend = () => {
    if (!currentLead) return;
    const url = buildOpenUrl(currentLead, channel, editedMessage);
    navigator.clipboard.writeText(editedMessage).catch(() => {});
    if (url) window.open(url, '_blank');
    setSentIds(prev => new Set(prev).add(currentLead.id));
    logOutreach(currentLead, channel, template, editedMessage);
    advance();
  };

  const handleSkip = () => {
    if (!currentLead) return;
    setSkippedIds(prev => new Set(prev).add(currentLead.id));
    advance();
  };

  const handleStop = () => {
    setPhase('done');
  };

  if (!isOpen) return null;

  const ChannelIcon = channel === 'whatsapp' ? MessageCircle : Instagram;
  const channelLabel = channel === 'whatsapp' ? 'WhatsApp' : 'Instagram';
  const channelColor = channel === 'whatsapp' ? 'text-green-400' : 'text-pink-400';
  const channelBg = channel === 'whatsapp' ? 'bg-green-500/20 border-green-500/30 hover:bg-green-500/30' : 'bg-pink-500/20 border-pink-500/30 hover:bg-pink-500/30';

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-prospex-surface border border-prospex-border rounded-xl w-full max-w-2xl mx-2 md:mx-auto max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="p-4 border-b border-prospex-border flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div className={`w-9 h-9 rounded-lg ${channelBg} flex items-center justify-center shrink-0`}>
              <ChannelIcon className={`w-4 h-4 ${channelColor}`} />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-mono font-bold text-prospex-text flex items-center gap-2">
                <Zap className="w-3.5 h-3.5 text-prospex-cyan" /> {channelLabel} Blaster
              </h2>
              <p className="text-[10px] text-prospex-dim">
                {phase === 'template' && `${eligibleLeads.length} eligible · ${ineligibleCount} skipped (no ${channel === 'whatsapp' ? 'phone' : 'IG handle'})`}
                {phase === 'sending' && `Lead ${currentIndex + 1} of ${eligibleLeads.length}`}
                {phase === 'done' && 'Done'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-prospex-dim hover:text-prospex-text" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Progress bar (sending/done only) */}
        {phase !== 'template' && (
          <div className="h-1 bg-prospex-bg">
            <div
              className="h-full bg-prospex-cyan transition-all duration-300"
              style={{ width: `${((sentIds.size + skippedIds.size) / Math.max(eligibleLeads.length, 1)) * 100}%` }}
            />
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 md:p-5">
          {/* PHASE 1: TEMPLATE PICKER */}
          {phase === 'template' && (
            <div className="space-y-4">
              {eligibleLeads.length === 0 ? (
                <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm text-amber-400 font-mono">No eligible leads</p>
                    <p className="text-xs text-prospex-muted mt-1">
                      None of your selected leads have a {channel === 'whatsapp' ? 'phone number' : 'Instagram URL'}.
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  <div>
                    <p className="text-xs font-mono text-prospex-dim uppercase mb-2">Pick a Template</p>
                    <div className="space-y-1.5 max-h-[320px] overflow-y-auto">
                      {TEMPLATES.map(t => (
                        <button
                          key={t.id}
                          onClick={() => setTemplateId(t.id)}
                          className={`w-full text-left p-3 rounded-lg border transition-colors ${
                            templateId === t.id
                              ? 'bg-prospex-cyan/10 border-prospex-cyan/40'
                              : 'bg-prospex-bg border-prospex-border hover:border-prospex-cyan/30'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <p className="text-xs font-medium text-prospex-text">{t.name}</p>
                            <span className="text-[8px] px-1.5 py-0.5 rounded bg-prospex-surface text-prospex-dim font-mono">{t.stage}</span>
                          </div>
                          <p className="text-[10px] text-prospex-muted line-clamp-2">{t.message}</p>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="p-3 bg-prospex-bg/50 border border-prospex-border rounded-lg text-xs text-prospex-muted space-y-1">
                    <p className="text-prospex-text font-mono text-[11px] uppercase">How it works</p>
                    <p>• Click <strong>Copy &amp; Open</strong> for each lead — the message is copied to your clipboard and {channelLabel} opens in a new tab.</p>
                    <p>• Paste (if needed) and tap <strong>Send</strong> on the platform.</p>
                    <p>• Come back, click <strong>Next</strong> to load the next lead. Skip leads you don&apos;t want to message.</p>
                    <p className="text-amber-400/80">⚠️ Pace yourself — bursts of identical messages can flag your account on either platform.</p>
                  </div>
                </>
              )}
            </div>
          )}

          {/* PHASE 2: SENDING */}
          {phase === 'sending' && currentLead && (
            <div className="space-y-3">
              <div className="p-3 bg-prospex-bg border border-prospex-border rounded-lg">
                <p className="text-[10px] font-mono text-prospex-dim uppercase">Sending to</p>
                <p className="text-base font-semibold text-prospex-text mt-0.5">{currentLead.business_name}</p>
                <div className="flex flex-wrap items-center gap-2 mt-1.5 text-[10px] text-prospex-dim">
                  {currentLead.city && <span>📍 {currentLead.city}</span>}
                  {channel === 'whatsapp' && currentLead.phone && <span>📞 {currentLead.phone}</span>}
                  {channel === 'instagram' && currentLead.instagram_url && (
                    <a href={currentLead.instagram_url} target="_blank" rel="noopener noreferrer" className="text-pink-400 hover:underline flex items-center gap-1">
                      <Instagram className="w-3 h-3" /> Profile <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                  )}
                </div>
              </div>

              <div>
                <label className="text-[10px] font-mono text-prospex-dim uppercase block mb-1">Message (editable)</label>
                <textarea
                  value={editedMessage}
                  onChange={e => setEditedMessage(e.target.value)}
                  rows={6}
                  className="w-full bg-prospex-bg border border-prospex-border rounded-lg p-3 text-xs text-prospex-text resize-none focus:border-prospex-cyan/50 focus:outline-none font-mono leading-relaxed"
                />
                <div className="flex items-center justify-between mt-1">
                  <p className="text-[9px] text-prospex-dim">{editedMessage.length} chars</p>
                  {editedMessage.includes('{{') && (
                    <p className="text-[9px] text-amber-400">⚠️ Unfilled variables — replace before sending</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* PHASE 3: DONE */}
          {phase === 'done' && (
            <div className="text-center py-8 space-y-3">
              <div className="w-16 h-16 mx-auto rounded-full bg-prospex-green/20 border border-prospex-green/40 flex items-center justify-center">
                <Check className="w-8 h-8 text-prospex-green" />
              </div>
              <div>
                <p className="text-base font-mono text-prospex-text">Blast complete</p>
                <p className="text-xs text-prospex-dim mt-1">
                  <span className="text-prospex-green font-mono">{sentIds.size} sent</span>
                  {skippedIds.size > 0 && <> · <span className="text-amber-400 font-mono">{skippedIds.size} skipped</span></>}
                  {ineligibleCount > 0 && <> · <span className="text-prospex-dim font-mono">{ineligibleCount} ineligible</span></>}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="p-4 border-t border-prospex-border bg-prospex-bg/30">
          {phase === 'template' && (
            <div className="flex items-center gap-2">
              <button onClick={onClose} className="btn-ghost text-xs flex-1 md:flex-none">Cancel</button>
              <button
                onClick={() => { setPhase('sending'); setCurrentIndex(0); }}
                disabled={eligibleLeads.length === 0}
                className="btn-primary text-xs flex-1 md:flex-none disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Zap className="w-3.5 h-3.5" /> Start ({eligibleLeads.length})
              </button>
            </div>
          )}

          {phase === 'sending' && currentLead && (
            <div className="flex items-center gap-2">
              <button onClick={handleStop} className="btn-ghost text-xs">Stop</button>
              <button onClick={handleSkip} className="btn text-xs bg-prospex-bg border border-prospex-border text-prospex-muted hover:text-prospex-text">
                <SkipForward className="w-3.5 h-3.5" /> Skip
              </button>
              <button
                onClick={handleSend}
                className={`btn text-xs flex-1 border ${channelBg} ${channelColor}`}
              >
                <ExternalLink className="w-3.5 h-3.5" /> Copy &amp; Open <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {phase === 'done' && (
            <button onClick={onClose} className="btn-primary text-xs w-full">Close</button>
          )}
        </div>
      </div>
    </div>
  );
}
