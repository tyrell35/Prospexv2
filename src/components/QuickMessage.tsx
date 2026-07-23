'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { X, MessageCircle, Instagram, Copy, Check, ChevronDown, Send, BookOpen, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
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
  niche?: string | null;
  google_rating?: number | null;
  google_review_count?: number | null;
  website?: string | null;
  audit_score?: number | null;
 };
}

interface DbTemplate {
 id: string;
 name: string;
 category: string | null;
 content: string;
 channel: string | null;
}

// A synthetic entry that always appears first — clears the editor for a
// custom message. Matches the pattern used in the lead detail template picker.
const CUSTOM_TEMPLATE: DbTemplate = {
 id: 'custom',
 name: '✍️ Write Custom Message',
 category: 'custom',
 content: '',
 channel: null,
};

// Display helpers ────────────────────────────────────────────
const CATEGORY_LABEL: Record<string, string> = {
 all: 'All',
 custom: '✍️ Custom',
 cold_open: 'Cold Open',
 gift_leads: 'Gift Leads',
 follow_up: 'Follow-Up',
 objection: 'Objection',
 booking: 'Booking',
 closing: 'Closing',
 case_study: 'Case Study',
 social_proof: 'Social Proof',
 greeting: 'Greeting',
 qualifying: 'Qualifying',
 general: 'General',
 sms_sequence: 'SMS Sequence',
 top_tier_no_ads: '👑 Elite · No Ads',
 top_tier_with_ads: '👑 Elite · Live Ads',
 top_tier_multi_device: '👑 Multi-Device',
};

function categoryLabel(c: string | null): string {
 if (!c) return 'General';
 return CATEGORY_LABEL[c] || c.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

// ─── COMPONENT ──────────────────────────────────────────────

export default function QuickMessage({ isOpen, onClose, channel, lead }: QuickMessageProps) {
 const [templates, setTemplates] = useState<DbTemplate[]>([]);
 const [templatesLoading, setTemplatesLoading] = useState(false);
 const [selectedTemplateId, setSelectedTemplateId] = useState<string>('custom');
 const [categoryFilter, setCategoryFilter] = useState<string>('all');
 const [message, setMessage] = useState('');
 const [copied, setCopied] = useState(false);
 const [sent, setSent] = useState(false);
 const [showTemplates, setShowTemplates] = useState(false);
 const [confirmOpen, setConfirmOpen] = useState(false);

 // Load templates from the SAME conversation_templates table the lead detail
 // page uses. Matches on channel (instagram / whatsapp / all).
 useEffect(() => {
  if (!isOpen) return;
  let cancelled = false;
  setTemplatesLoading(true);
  (async () => {
   const { data } = await supabase
    .from('conversation_templates')
    .select('id, name, category, content, channel')
    .eq('is_active', true)
    .or(`channel.eq.${channel},channel.eq.all`)
    .order('category', { ascending: true });
   if (!cancelled) {
    setTemplates((data || []) as DbTemplate[]);
    setTemplatesLoading(false);
   }
  })();
  return () => { cancelled = true; };
 }, [isOpen, channel]);

 // Same personalisation function as the lead detail template picker.
 // Supports both {{firstName}} and {{first_name}} styles for compatibility
 // with older templates and the DM Campaign presets.
 const personalize = useCallback((content: string): string => {
  const firstName = lead.business_name?.split(/[\s\-&]/)[0] || 'there';
  return content
   .replace(/\{\{firstName\}\}/g, firstName)
   .replace(/\{\{first_name\}\}/g, firstName)
   .replace(/\{\{clinicName\}\}/g, lead.business_name || 'your clinic')
   .replace(/\{\{business_name\}\}/g, lead.business_name || 'your business')
   .replace(/\{\{city\}\}/g, lead.city || 'your area')
   .replace(/\{\{niche\}\}/g, lead.niche || 'aesthetic treatments')
   .replace(/\{\{treatment\}\}/g, lead.niche || 'aesthetic treatments')
   .replace(/\{\{treatmentType\}\}/g, lead.niche || 'treatment')
   .replace(/\{\{their_reviews\}\}/g, String(lead.google_review_count || ''))
   .replace(/\{\{reviewCount\}\}/g, String(lead.google_review_count || 'great'))
   .replace(/\{\{review_count\}\}/g, String(lead.google_review_count || ''))
   .replace(/\{\{rating\}\}/g, String(lead.google_rating || ''))
   .replace(/\{\{website_score\}\}/g, String(lead.audit_score || ''))
   .replace(/\{\{load_time\}\}/g, '4.5')
   .replace(/\{\{specificThing\}\}/g, 'treatment menu')
   .replace(/\{\{day\}\}/g, 'Tuesday')
   .replace(/\{\{time\}\}/g, '2pm')
   .replace(/\{\{day1\}\}/g, 'Tuesday')
   .replace(/\{\{time1\}\}/g, '11am')
   .replace(/\{\{day2\}\}/g, 'Thursday')
   .replace(/\{\{time2\}\}/g, '2pm')
   .replace(/\{\{option1\}\}/g, 'Tuesday at 11am')
   .replace(/\{\{option2\}\}/g, 'Thursday at 2pm')
   .replace(/\{\{booking_link\}\}/g, 'book.infinityclients.com')
   .replace(/\{\{top_device\}\}/g, '')
   .replace(/\{\{device_list\}\}/g, '');
 }, [lead]);

 // Reset the editor when the modal opens or channel changes.
 useEffect(() => {
  if (!isOpen) return;
  setSelectedTemplateId('custom');
  setMessage('');
  setCopied(false);
  setSent(false);
  setCategoryFilter('all');
 }, [isOpen, channel]);

 // Combined list (custom always first) + filter chips derived from what
 // actually loaded so we never show an empty category.
 const allTemplates = useMemo(() => [CUSTOM_TEMPLATE, ...templates], [templates]);
 const categories = useMemo(() => {
  const set = new Set<string>();
  for (const t of templates) if (t.category) set.add(t.category);
  return Array.from(set).sort();
 }, [templates]);
 const visible = useMemo(() =>
  // Custom always shows regardless of filter
  allTemplates.filter(t => t.id === 'custom' || categoryFilter === 'all' || t.category === categoryFilter)
 , [allTemplates, categoryFilter]);
 const currentTemplate = allTemplates.find(t => t.id === selectedTemplateId);

 const selectTemplate = (t: DbTemplate) => {
  setSelectedTemplateId(t.id);
  if (t.id === 'custom') {
   setMessage('');
  } else {
   setMessage(personalize(t.content));
  }
  setShowTemplates(false);
 };

 const handleCopy = () => {
  navigator.clipboard.writeText(message);
  setCopied(true);
  setTimeout(() => setCopied(false), 2000);
 };

 const handleSend = () => {
  if (channel === 'whatsapp') {
   const phone = lead.phone?.replace(/[^0-9+]/g, '').replace('+', '') || '';
   if (!phone) return;
   const encoded = encodeURIComponent(message);
   window.open(`https://wa.me/${phone}?text=${encoded}`, '_blank');
  } else {
   const handle = lead.instagram_url?.replace(/https?:\/\/(www\.)?instagram\.com\/?/, '').replace(/\/$/, '') || '';
   navigator.clipboard.writeText(message);
   setCopied(true);
   if (handle) window.open(`https://www.instagram.com/${handle}/`, '_blank');
   else if (lead.instagram_url) window.open(lead.instagram_url, '_blank');
  }
  setSent(true);
  if (lead.id) setConfirmOpen(true);
 };

 // Map DB category → outreach_log stage
 const stageForLog = (): string => {
  const cat = currentTemplate?.category || 'cold_open';
  if (cat.startsWith('top_tier_')) return 'cold_open';
  if (cat === 'follow_up') return 'follow_up_1';
  if (cat === 'objection') return 'objection';
  if (cat === 'booking') return 'booking';
  return cat;
 };

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
         : `To: @${instagramHandle || 'No handle'}`}
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

    {/* Category filter chips — only render if we have >6 templates so tiny pools stay simple */}
    {categories.length > 0 && templates.length > 6 && (
     <div className="px-4 pt-3 flex items-center gap-1 flex-wrap">
      <button
       onClick={() => setCategoryFilter('all')}
       className={`text-[10px] px-2 py-0.5 rounded-full font-mono transition-colors ${
        categoryFilter === 'all'
         ? 'bg-prospex-cyan/20 text-prospex-cyan border border-prospex-cyan/30'
         : 'bg-prospex-bg text-prospex-dim hover:text-prospex-text'
       }`}
      >All</button>
      {categories.map(cat => (
       <button key={cat}
        onClick={() => setCategoryFilter(cat)}
        className={`text-[10px] px-2 py-0.5 rounded-full font-mono transition-colors ${
         categoryFilter === cat
          ? 'bg-prospex-cyan/20 text-prospex-cyan border border-prospex-cyan/30'
          : 'bg-prospex-bg text-prospex-dim hover:text-prospex-text'
        }`}
       >{categoryLabel(cat)}</button>
      ))}
     </div>
    )}

    {/* Template Picker */}
    <div className="px-4 pt-3 pb-2">
     <div className="relative">
      <button onClick={() => setShowTemplates(!showTemplates)}
       className="w-full flex items-center justify-between px-3 py-2 bg-prospex-bg border border-prospex-border rounded-lg text-sm text-white hover:border-prospex-cyan/40 transition-colors"
      >
       <span className="flex items-center gap-2 min-w-0">
        <BookOpen className="w-3.5 h-3.5 text-prospex-cyan shrink-0" />
        {templatesLoading ? (
         <span className="text-prospex-muted text-xs">Loading templates…</span>
        ) : (
         <>
          <span className="text-prospex-muted text-xs mr-1">{categoryLabel(currentTemplate?.category ?? null)}:</span>
          <span className="truncate">{currentTemplate?.name || 'Select Template'}</span>
         </>
        )}
       </span>
       <ChevronDown className={`w-4 h-4 text-prospex-muted transition-transform shrink-0 ${showTemplates ? 'rotate-180' : ''}`} />
      </button>

      {showTemplates && (
       <div className="absolute top-full left-0 right-0 mt-1 bg-prospex-surface border border-prospex-border rounded-lg shadow-xl z-10 max-h-72 overflow-y-auto">
        {templatesLoading ? (
         <div className="p-3 text-center"><Loader2 className="w-4 h-4 animate-spin text-prospex-dim mx-auto" /></div>
        ) : visible.length === 0 ? (
         <p className="p-3 text-center text-xs text-prospex-dim">No templates match this filter.</p>
        ) : visible.map(t => (
         <button key={t.id} onClick={() => selectTemplate(t)}
          className={`w-full text-left px-3 py-2 text-xs hover:bg-prospex-bg transition-colors flex items-center gap-2 ${
           selectedTemplateId === t.id ? 'bg-prospex-cyan/10 text-prospex-cyan' : 'text-white'
          }`}
         >
          <span className="text-[10px] text-prospex-muted w-24 shrink-0 truncate">{categoryLabel(t.category)}</span>
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
      placeholder={selectedTemplateId === 'custom' ? 'Type your custom message…' : 'Type your message…'}
     />
     <div className="flex items-center justify-between mt-1.5">
      <div className="flex items-center gap-3">
       <span className={`text-[10px] ${wordCount > 60 ? 'text-red-400' : wordCount > 40 ? 'text-amber-400' : 'text-prospex-muted'}`}>
        {wordCount} words · {charCount} chars
       </span>
       {wordCount > 60 && <span className="text-[10px] text-red-400">Cold opens work best under 60 words</span>}
       {message.includes('{{') && <span className="text-[10px] text-amber-400">⚠️ Unfilled variables</span>}
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

  {/* Post-send confirmation modal — rendered AS SIBLING of QuickMessage
      backdrop so its own stacking context isn't nested inside. */}
  <SendConfirmModal
   isOpen={confirmOpen}
   onClose={() => setConfirmOpen(false)}
   onLogged={() => { setConfirmOpen(false); onClose(); }}
   lead={lead.id ? { id: lead.id, business_name: lead.business_name } : null}
   channel={channel}
   stage={stageForLog()}
   messageSent={message}
   templateName={currentTemplate?.name}
  />
  </>
 );
}
