'use client';

import { useState, useEffect, useCallback } from 'react';
import { X, MessageCircle, Instagram, Copy, ExternalLink, Check, ChevronDown, Send, Sparkles, BookOpen } from 'lucide-react';
import SendConfirmModal from './SendConfirmModal';

// ─── TYPES ──────────────────────────────────────────────────
interface QuickMessageProps {
 isOpen: boolean;
 onClose: () => void;
 channel: 'whatsapp' | 'instagram';
 lead: {
  id?: string;                    // used for logging via SendConfirmModal
  business_name: string;
  phone?: string | null;
  instagram_url?: string | null;
  city?: string | null;
  google_rating?: number | null;
  google_review_count?: number | null;
  website?: string | null;
 };
}

interface QuickTemplate {
 id: string;
 name: string;
 stage: string;
 message: string;
}

const QUICK_TEMPLATES: QuickTemplate[] = [
 { id: 'cold-1', name: 'Casual Question Opener', stage: 'Cold Open', message: `Hey {{firstName}} 👋 quick question — are you currently running any paid ads for {{clinicName}} or relying mostly on word of mouth and organic?` },
 { id: 'cold-2', name: 'Compliment + Curiosity', stage: 'Cold Open', message: `Hey! Just came across {{clinicName}} — your {{specificThing}} looks amazing. Quick question, are you actively looking to bring in more {{treatmentType}} bookings or are you at capacity right now?` },
 { id: 'cold-3', name: 'Competitor Insight', stage: 'Cold Open', message: `Hey {{firstName}} — I noticed a few clinics near {{city}} are running some really aggressive ad campaigns right now. I've got some intel on what's working for them. Worth sharing?` },
 { id: 'cold-4', name: 'Google Reviews Opener', stage: 'Cold Open', message: `Hey {{firstName}} — noticed {{clinicName}} has {{reviewCount}} Google reviews which is solid. Have you thought about turning those into a client-generating machine? A lot of clinics with similar reviews are getting 30-50 new enquiries/month from it.` },
 { id: 'fu-1', name: 'Value Drop (Audit)', stage: 'Follow-Up', message: `Hey {{firstName}} — I actually ran a quick check on {{clinicName}}'s online presence and found a few things that might be costing you new bookings. Nothing major to fix but the impact could be significant. Want me to send over what I found?` },
 { id: 'fu-2', name: 'Case Study Drop', stage: 'Follow-Up', message: `Hey {{firstName}} — just wanted to share a quick result. We helped a {{niche}} in {{city}} go from 12 to 47 new enquiries per month in 6 weeks. Similar size to {{clinicName}}. Would the strategy behind that be useful for you?` },
 { id: 'breakup', name: 'Breakup Message', stage: 'Breakup', message: `Hey {{firstName}} — I've reached out a couple of times and I get it, you're probably flat out. I'll close your file on my end. If you ever want to explore getting more {{treatmentType}} clients, I'm here. No hard feelings either way 👊` },
 { id: 'objection-busy', name: 'Handle: Too Busy', stage: 'Objection', message: `Totally get it — if you're busy that's actually a good sign! What if I just sent you a 2-min video showing exactly what we'd do? No call needed. If it makes sense, great. If not, no worries at all.` },
 { id: 'objection-agency', name: 'Handle: Have Agency', stage: 'Objection', message: `Nice, good to hear you're investing in marketing. Genuine question — are you happy with the results you're getting? A lot of people I speak to have an agency but aren't seeing the ROI they expected.` },
 { id: 'booking', name: '2-Option Close', stage: 'Booking', message: `Brilliant — let's get something in. I've got a 15-min slot free {{option1}} or {{option2}}. Which works better for you?` },
 { id: 'reactivation', name: 'Circle Back', stage: 'Reactivation', message: `Hey {{firstName}} — we chatted a while back about {{clinicName}}. Since then we've developed some new strategies that are working really well for {{niche}} in {{city}}. Worth a quick chat to see if it's relevant?` },
 { id: 'custom', name: 'Write Custom Message', stage: 'Custom', message: '' },
];

// ─── COMPONENT ──────────────────────────────────────────────
export default function QuickMessage({ isOpen, onClose, channel, lead }: QuickMessageProps) {
 const [selectedTemplate, setSelectedTemplate] = useState<string>('cold-1');
 const [message, setMessage] = useState('');
 const [copied, setCopied] = useState(false);
 const [sent, setSent] = useState(false);
 const [showTemplates, setShowTemplates] = useState(false);

 // Auto-fill template with lead data
 const fillTemplate = useCallback((templateMessage: string) => {
  let filled = templateMessage;
  const firstName = lead.business_name?.split(/[\s\-&]/)[0] || 'there';
  filled = filled.replace(/\{\{firstName\}\}/g, firstName);
  filled = filled.replace(/\{\{clinicName\}\}/g, lead.business_name || 'your clinic');
  filled = filled.replace(/\{\{city\}\}/g, lead.city || 'your area');
  filled = filled.replace(/\{\{reviewCount\}\}/g, String(lead.google_review_count || 'great'));
  filled = filled.replace(/\{\{niche\}\}/g, 'clinic');
  filled = filled.replace(/\{\{specificThing\}\}/g, 'treatment menu');
  filled = filled.replace(/\{\{treatmentType\}\}/g, 'treatment');
  filled = filled.replace(/\{\{option1\}\}/g, 'Tuesday at 11am');
  filled = filled.replace(/\{\{option2\}\}/g, 'Thursday at 2pm');
  return filled;
 }, [lead]);

 // Set initial message when opening
 useEffect(() => {
  if (isOpen) {
   const tmpl = QUICK_TEMPLATES.find(t => t.id === selectedTemplate);
   if (tmpl && tmpl.id !== 'custom') {
    setMessage(fillTemplate(tmpl.message));
   }
   setCopied(false);
   setSent(false);
  }
 }, [isOpen, selectedTemplate, fillTemplate]);

 const handleSelectTemplate = (id: string) => {
  setSelectedTemplate(id);
  const tmpl = QUICK_TEMPLATES.find(t => t.id === id);
  if (tmpl && tmpl.id !== 'custom') {
   setMessage(fillTemplate(tmpl.message));
  } else {
   setMessage('');
  }
  setShowTemplates(false);
 };

 const handleCopy = () => {
  navigator.clipboard.writeText(message);
  setCopied(true);
  setTimeout(() => setCopied(false), 2000);
 };

 const [confirmOpen, setConfirmOpen] = useState(false);

 const handleSend = () => {
  if (channel === 'whatsapp') {
   const phone = lead.phone?.replace(/[^0-9+]/g, '').replace('+', '') || '';
   if (!phone) return;
   const encoded = encodeURIComponent(message);
   window.open(`https://wa.me/${phone}?text=${encoded}`, '_blank');
  } else {
   // Instagram — open DM inbox + copy message
   const handle = lead.instagram_url?.replace(/https?:\/\/(www\.)?instagram\.com\/?/, '').replace(/\/$/, '') || '';
   navigator.clipboard.writeText(message);
   setCopied(true);
   if (handle) {
    window.open(`https://ig.me/m/${handle}`, '_blank');
   } else if (lead.instagram_url) {
    window.open(lead.instagram_url, '_blank');
   }
  }
  setSent(true);
  // Pop the confirmation modal — only writes to outreach_logs on user confirm.
  if (lead.id) setConfirmOpen(true);
 };

 const currentTemplate = QUICK_TEMPLATES.find(t => t.id === selectedTemplate);
 const wordCount = message.trim().split(/\s+/).filter(Boolean).length;
 const charCount = message.length;
 const instagramHandle = lead.instagram_url?.replace(/https?:\/\/(www\.)?instagram\.com\/?/, '').replace(/\/$/, '') || '';

 if (!isOpen) return null;

 return (
  <>
  <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4" onClick={onClose}>
   <div className="bg-prospex-surface border border-prospex-border rounded-xl shadow-2xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
    {/* Header */}
    <div className={`flex items-center justify-between p-4 border-b border-prospex-border rounded-t-xl ${channel === 'whatsapp' ? 'bg-green-500/10' : 'bg-gradient-to-r from-pink-500/10 via-purple-500/10 to-orange-500/10'}`}>
     <div className="flex items-center gap-2.5">
      {channel === 'whatsapp' ? (
       <div className="w-8 h-8 rounded-full bg-green-500/20 flex items-center justify-center"><MessageCircle className="w-4 h-4 text-green-400" /></div>
      ) : (
       <div className="w-8 h-8 rounded-full bg-pink-500/20 flex items-center justify-center"><Instagram className="w-4 h-4 text-pink-400" /></div>
      )}
      <div>
       <p className="text-sm font-semibold text-white">
        {channel === 'whatsapp' ? 'WhatsApp Message' : 'Instagram DM'}
       </p>
       <p className="text-[10px] text-prospex-muted">
        {channel === 'whatsapp'
         ? `To: ${lead.phone || 'No phone number'}`
         : `To: @${instagramHandle || 'No handle'}`
        }
       </p>
      </div>
     </div>
     <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-prospex-bg text-prospex-muted hover:text-white transition-colors"><X className="w-4 h-4" /></button>
    </div>

    {/* Lead Info */}
    <div className="px-4 py-2.5 bg-prospex-bg/50 border-b border-prospex-border flex items-center gap-3">
     <div className="w-8 h-8 rounded-lg bg-prospex-cyan/10 flex items-center justify-center text-xs font-bold text-prospex-cyan">
      {lead.business_name?.charAt(0) || '?'}
     </div>
     <div className="flex-1 min-w-0">
      <p className="text-xs font-medium text-white truncate">{lead.business_name}</p>
      <p className="text-[10px] text-prospex-muted">{[lead.city, lead.google_rating ? `${lead.google_rating}★ (${lead.google_review_count})` : null].filter(Boolean).join(' · ')}</p>
     </div>
    </div>

    {/* Template Picker */}
    <div className="px-4 pt-3 pb-2">
     <div className="relative">
      <button onClick={() => setShowTemplates(!showTemplates)} className="w-full flex items-center justify-between px-3 py-2 bg-prospex-bg border border-prospex-border rounded-lg text-sm text-white hover:border-prospex-cyan/40 transition-colors">
       <span className="flex items-center gap-2">
        <BookOpen className="w-3.5 h-3.5 text-prospex-cyan" />
        <span className="text-prospex-muted text-xs mr-1">{currentTemplate?.stage}:</span>
        {currentTemplate?.name || 'Select Template'}
       </span>
       <ChevronDown className={`w-4 h-4 text-prospex-muted transition-transform ${showTemplates ? 'rotate-180' : ''}`} />
      </button>

      {showTemplates && (
       <div className="absolute top-full left-0 right-0 mt-1 bg-prospex-surface border border-prospex-border rounded-lg shadow-xl z-10 max-h-64 overflow-y-auto">
        {QUICK_TEMPLATES.map(t => (
         <button key={t.id} onClick={() => handleSelectTemplate(t.id)} className={`w-full text-left px-3 py-2 text-xs hover:bg-prospex-bg transition-colors flex items-center gap-2 ${selectedTemplate === t.id ? 'bg-prospex-cyan/10 text-prospex-cyan' : 'text-white'}`}>
          <span className="text-[10px] text-prospex-muted w-16 shrink-0">{t.stage}</span>
          <span className="truncate">{t.name}</span>
         </button>
        ))}
       </div>
      )}
     </div>
    </div>

    {/* Message Editor */}
    <div className="px-4 pb-3">
     <textarea
      value={message}
      onChange={e => setMessage(e.target.value)}
      rows={6}
      className="w-full px-3 py-2.5 bg-prospex-bg border border-prospex-border rounded-lg text-sm text-white placeholder:text-prospex-muted focus:outline-none focus:border-prospex-cyan resize-none"
      placeholder="Type your message..."
     />
     <div className="flex items-center justify-between mt-1.5">
      <div className="flex items-center gap-3">
       <span className={`text-[10px] ${wordCount > 60 ? 'text-red-400' : wordCount > 40 ? 'text-amber-400' : 'text-prospex-muted'}`}>
        {wordCount} words · {charCount} chars
       </span>
       {wordCount > 60 && <span className="text-[10px] text-red-400">Cold opens work best under 60 words</span>}
      </div>
      <button onClick={handleCopy} className="flex items-center gap-1 text-[10px] text-prospex-muted hover:text-white transition-colors">
       {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
       {copied ? 'Copied!' : 'Copy'}
      </button>
     </div>
    </div>

    {/* Action Buttons */}
    <div className="px-4 pb-4">
     {sent ? (
      <div className="flex items-center justify-center gap-2 py-3 rounded-lg bg-green-500/10 border border-green-500/20">
       <Check className="w-4 h-4 text-green-400" />
       <span className="text-sm text-green-400 font-medium">
        {channel === 'whatsapp' ? 'Opened in WhatsApp!' : 'Copied & opened Instagram!'}
       </span>
      </div>
     ) : (
      <div className="flex items-center gap-2">
       <button
        onClick={handleSend}
        disabled={!message.trim() || (channel === 'whatsapp' && !lead.phone) || (channel === 'instagram' && !lead.instagram_url)}
        className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg font-medium text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
         channel === 'whatsapp'
          ? 'bg-green-500 hover:bg-green-600 text-white'
          : 'bg-gradient-to-r from-pink-500 via-purple-500 to-orange-500 hover:opacity-90 text-white'
        }`}
       >
        {channel === 'whatsapp' ? (
         <><Send className="w-4 h-4" /> Open in WhatsApp</>
        ) : (
         <><Instagram className="w-4 h-4" /> Copy & Open Instagram</>
        )}
       </button>
      </div>
     )}

     {channel === 'whatsapp' && !lead.phone && (
      <p className="text-[10px] text-red-400 mt-2 text-center">No phone number available for this lead</p>
     )}
     {channel === 'instagram' && !lead.instagram_url && (
      <p className="text-[10px] text-red-400 mt-2 text-center">No Instagram URL available for this lead</p>
     )}

     {/* Fallback: explicit button to open the confirm modal after user's back from IG */}
     {sent && lead.id && (
      <button
       onClick={(e) => { e.stopPropagation(); setConfirmOpen(true); }}
       className="w-full mt-2 py-2 text-xs font-semibold rounded-lg bg-prospex-cyan/20 text-prospex-cyan border border-prospex-cyan/40 hover:bg-prospex-cyan/30 transition-colors flex items-center justify-center gap-2"
      >
       <Check className="w-3.5 h-3.5" /> Log this send · pick account
      </button>
     )}
    </div>
   </div>
  </div>

  {/* Post-send confirmation modal — rendered AS SIBLING of the QuickMessage
      backdrop (not a child) so it lives in its own stacking context and
      clicks on its backdrop don't propagate up to close QuickMessage. */}
  <SendConfirmModal
   isOpen={confirmOpen}
   onClose={() => setConfirmOpen(false)}
   onLogged={() => { setConfirmOpen(false); onClose(); }}
   lead={lead.id ? { id: lead.id, business_name: lead.business_name } : null}
   channel={channel}
   stage={(() => {
    const tmpl = QUICK_TEMPLATES.find(t => t.id === selectedTemplate);
    if (tmpl?.stage === 'Cold Open') return 'cold_open';
    if (tmpl?.stage === 'Follow-Up') return 'follow_up_1';
    if (tmpl?.stage === 'Breakup') return 'follow_up_3';
    if (tmpl?.stage === 'Objection') return 'objection';
    if (tmpl?.stage === 'Booking') return 'booking';
    if (tmpl?.stage === 'Reactivation') return 'reactivation';
    return 'cold_open';
   })()}
   messageSent={message}
   templateName={QUICK_TEMPLATES.find(t => t.id === selectedTemplate)?.name}
  />
  </>
 );
}
