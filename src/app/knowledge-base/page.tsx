'use client';

import { useState, useEffect, useCallback } from 'react';
import { BookOpen, Link2, Video, Shield, FileText, Target, Clock, ChevronDown, ChevronUp, Edit3, Save, Plus, Trash2, ExternalLink, Copy, Check, Search, Sparkles, Users, MessageSquare, Phone, Zap, Star, AlertTriangle } from 'lucide-react';

// ─── TYPES ──────────────────────────────────────────────────
interface KBItem {
 id: string;
 title: string;
 url?: string;
 description: string;
 type: 'link' | 'video' | 'text' | 'checklist';
}

interface KBSection {
 id: string;
 title: string;
 icon: string;
 color: string;
 items: KBItem[];
}

const LS_KEY = 'prospex_knowledge_base';

// ─── DEFAULT CONTENT ────────────────────────────────────────
const DEFAULT_SECTIONS: KBSection[] = [
 {
  id: 'links',
  title: 'Key Links & Resources',
  icon: 'link',
  color: 'text-blue-400',
  items: [
   { id: 'l1', title: 'VSL (Video Sales Letter)', url: '', description: 'Your main VSL link — send to prospects after booking. Replace this URL with yours.', type: 'link' },
   { id: 'l2', title: 'Booking Calendar', url: '', description: 'Your Calendly/GHL/Cal.com booking link. This is what prospects click to schedule a call.', type: 'link' },
   { id: 'l3', title: 'Case Study Page', url: '', description: 'Link to your case study or results page to share as social proof.', type: 'link' },
   { id: 'l4', title: 'Client Onboarding Form', url: '', description: 'New client intake form — send after closing.', type: 'link' },
   { id: 'l5', title: 'Proposal / Pricing Document', url: '', description: 'Your pricing deck or proposal template.', type: 'link' },
   { id: 'l6', title: 'Agency Website', url: '', description: 'Your agency homepage for credibility.', type: 'link' },
  ]
 },
 {
  id: 'outreach-training',
  title: 'Outreach Training & Scripts',
  icon: 'message',
  color: 'text-cyan-400',
  items: [
   { id: 'ot1', title: 'Cold Outreach Golden Rules', description: '1. Lead with THEM not you — reference their business specifically\n2. Ask questions — questions get 2x more replies than statements\n3. Keep cold opens under 60 words — shorter = higher reply rate\n4. One CTA only — never give two things to do\n5. Send voice notes on WhatsApp — 3-4x higher response than text\n6. Follow up minimum 4 times — the breakup message (Day 14) has the highest reply rate\n7. Pattern interrupt — break the "salesy DM" pattern they\'re used to ignoring\n8. Personalise everything — reference their Instagram, Google reviews, city, specific treatments', type: 'text' },
   { id: 'ot2', title: 'The Perfect Cold Open Script', description: 'Structure: Compliment/Observation + Specific Detail + Question\n\nExample:\n"Hey [name] — just came across [clinic name] and your [specific treatment/thing you noticed] looks amazing. Quick question — are you actively looking to bring in more [treatment type] bookings or are you at capacity right now?"\n\nWhy it works:\n→ Shows you actually looked at their business (not copy-paste)\n→ Compliment lowers their guard\n→ Question creates engagement (they have to think about an answer)\n→ "At capacity" gives them a face-saving out (paradoxically increases replies)', type: 'text' },
   { id: 'ot3', title: 'Follow-Up Sequence Timing', description: 'Day 1: Cold Open (personalised question)\nDay 3: Follow-Up #1 — Value drop (free audit insight or tip)\nDay 7: Follow-Up #2 — Social proof (case study or result)\nDay 14: Follow-Up #3 — Breakup message (highest reply rate at 15-20%)\nDay 45+: Reactivation (new angle or fresh results)\n\nRule: Never follow up with "just checking in" or "circling back." Always add new value or a new angle. Each follow-up should stand alone as a compelling message.', type: 'text' },
   { id: 'ot4', title: 'WhatsApp Voice Note Script', description: 'Voice notes get 3-4x higher response rates than text on WhatsApp.\n\nScript (keep under 30 seconds):\n"Hey [name], [your name] here. I came across [clinic name] and I was genuinely impressed with [specific thing]. I work with [niche] businesses in [area] to help them get more [result]. I had a quick idea for you — mind if I share it?"\n\nTips:\n→ Smile while recording (they can hear it)\n→ Speak naturally, not scripted\n→ Keep it conversational, like you\'re talking to a friend\n→ End with a question to prompt a reply\n→ 15-30 seconds max', type: 'text' },
   { id: 'ot5', title: 'Banned Phrases (Never Say These)', description: '❌ "Hope this finds you well" — generic, screams spam\n❌ "Just reaching out" — no purpose, easily ignored\n❌ "I\'d love to" — makes it about you not them\n❌ "Touch base" — corporate jargon, zero urgency\n❌ "Quick question" as the entire opener — too vague\n❌ "We help businesses like yours" — heard it 100 times\n❌ "Are you the decision maker?" — insulting\n❌ "Do you have 15 minutes?" — too much commitment upfront\n❌ "I noticed your website could use some work" — offensive\n❌ "We guarantee results" — unbelievable, triggers skepticism', type: 'text' },
   { id: 'ot6', title: 'Power Words That Convert', description: '✅ "Quick question" (followed by a REAL question)\n✅ "Noticed" / "Came across" — shows research\n✅ "Genuine question" — signals authenticity\n✅ "Would it be useful if..." — low commitment offer\n✅ "Curious" — non-threatening, invites dialogue\n✅ "Results" / "Enquiries" / "Bookings" — outcome language\n✅ "Similar to yours" — relatability\n✅ "In [their city]" — local relevance\n✅ "No strings" / "No obligation" — removes risk\n✅ "2-minute video" — specific, low time commitment\n✅ "What specifically..." — deepens engagement\n✅ Numbers: "47 new enquiries" beats "more enquiries"', type: 'text' },
  ]
 },
 {
  id: 'objection-handling',
  title: 'Objection Handling Playbook',
  icon: 'shield',
  color: 'text-orange-400',
  items: [
   { id: 'oh1', title: '"I\'m too busy right now"', description: 'What it really means: Not convinced of the value yet.\n\nResponse:\n"Totally get it — if you\'re busy that\'s actually a good sign! What if I just sent you a 2-min video showing exactly what we\'d do? No call needed. If it makes sense, great. If not, no worries at all."\n\nWhy it works:\n→ Validates their objection (doesn\'t push back)\n→ Reframes busy as positive\n→ Lowers the commitment (video vs call)\n→ Removes all pressure with "no worries"\n→ 2-min video is specific and feels fast', type: 'text' },
   { id: 'oh2', title: '"It\'s too expensive" / "What\'s the price?"', description: 'What it really means: They don\'t see the ROI yet.\n\nResponse:\n"Totally fair question. Most of our clients see a 5-8x return — so for every £1 they spend, they get £5-8 back in new bookings. For a clinic like yours, that could mean [X] new clients per month paying [Y] each. Usually pays for itself within 2-3 weeks. Want me to run some numbers specific to [clinic name]?"\n\nWhy it works:\n→ Shifts from cost to investment\n→ Specific ratio (5-8x) is credible\n→ Makes it about THEIR specific return\n→ "Run some numbers" = free value, not a sales pitch\n→ 2-3 week payback creates urgency', type: 'text' },
   { id: 'oh3', title: '"We already have an agency / someone doing this"', description: 'What it really means: Convince me yours is better.\n\nResponse:\n"Nice, good to hear you\'re investing in marketing. Genuine question — are you happy with the results you\'re getting? A lot of people I speak to have an agency but aren\'t seeing the ROI they expected."\n\nWhy it works:\n→ Compliments their decision (not combative)\n→ "Genuine question" signals you\'re not just selling\n→ Plants doubt without being pushy\n→ 80% of people with agencies ARE unhappy with results\n→ Opens door for comparison conversation\n\nIf they say YES they\'re happy: "That\'s great, honestly rare to hear. If things ever change, I\'m here."\nIf they say NO or MAYBE: "What specifically isn\'t working? I see this a lot and might be able to help diagnose why."', type: 'text' },
   { id: 'oh4', title: '"Send me some info / Send me an email"', description: 'What it really means: 80% of the time this is a polite brush-off.\n\nResponse:\n"Of course — what specifically would be most useful for you? I can send a case study from a similar clinic, or a breakdown of what we\'d actually do for [clinic name]. Which would be more helpful?"\n\nWhy it works:\n→ Doesn\'t just comply (which leads to ghosting)\n→ "What specifically" forces them to engage\n→ Two specific options feel helpful, not salesy\n→ If they pick one, they\'re actually interested\n→ If they dodge, they were never interested (move on)\n\nAlternative: "Sure! Before I do — is there a specific challenge you\'re trying to solve? I want to make sure I send the right thing rather than a generic deck."', type: 'text' },
   { id: 'oh5', title: '"Not interested"', description: 'What it really means: Your pitch didn\'t land. Try a different angle.\n\nResponse (Immediate):\n"No problem at all, appreciate you letting me know. Out of curiosity, is it the timing or the approach that doesn\'t fit right now?"\n\nResponse (Day 14 follow-up):\n"Hey [name] — you mentioned you weren\'t interested last time and I totally respect that. Just wanted to share that we recently helped [similar clinic] in [city] get [specific result]. Thought it might change things. Either way, no hard feelings 👊"\n\nWhy it works:\n→ Graceful exit preserves the relationship\n→ Curiosity question sometimes reveals the REAL objection\n→ The follow-up is a fresh angle (new proof), not repeating the same pitch\n→ People\'s situations change — what was wrong 2 weeks ago may be right now', type: 'text' },
   { id: 'oh6', title: '"Can you guarantee results?"', description: 'What it really means: They\'ve been burned before or they\'re risk-averse.\n\nResponse:\n"I never guarantee specific numbers because every business is different — and honestly, anyone who does guarantee exact figures is probably not being straight with you. What I can show you is what we\'ve done for similar clinics in [city]. For example, [clinic name] went from [X] to [Y] enquiries in [timeframe]. Would seeing a breakdown of how we did that be useful?"\n\nWhy it works:\n→ Honesty builds trust (counterintuitive but powerful)\n→ Subtly positions competitors who guarantee as untrustworthy\n→ Pivots to real proof (case study)\n→ "Would it be useful" is a soft close to continue the conversation', type: 'text' },
  ]
 },
 {
  id: 'sops',
  title: 'SOPs & Daily Workflows',
  icon: 'clock',
  color: 'text-green-400',
  items: [
   { id: 'sop1', title: 'Daily Outreach SOP (60 minutes)', description: 'MORNING BLOCK (30 mins) — New Outreach\n1. Open Prospex → Search or City Scraper → Find 20-30 new prospects\n2. Open Templates → Pick cold open template for your niche\n3. For each prospect: Customise template → Copy → Send via WhatsApp/Instagram\n4. Log each send in Outreach Analytics (10 sec per lead)\n\nMIDDAY BLOCK (15 mins) — Handle Replies\n1. Check WhatsApp and Instagram for replies\n2. Update outcomes in Outreach Analytics (Sent → Replied)\n3. For positive replies → Use Booking template to lock the call\n4. For objections → Check Objection Handling section above\n5. Stuck? → Use AI Outreach Coach "Help Me Respond" mode\n\nAFTERNOON BLOCK (15 mins) — Follow-Ups\n1. Check your logs: Who did you message 3 days ago? → Send Follow-Up #1\n2. Who did you message 7 days ago? → Send Follow-Up #2\n3. Who did you message 14 days ago? → Send Breakup Message\n4. Log all follow-ups in Outreach Analytics', type: 'text' },
   { id: 'sop2', title: 'Weekly Review SOP (15 minutes)', description: 'Every Friday:\n\n1. CHECK YOUR NUMBERS\n  → Open Outreach Analytics → Set to 7d view\n  → Note: Messages sent, reply rate, bookings, closes\n\n2. IDENTIFY WHAT\'S WORKING\n  → Which channel has highest reply rate? (WhatsApp vs Instagram)\n  → Which niche is converting best?\n  → Which templates are getting most replies?\n  → Double down on what\'s working\n\n3. IDENTIFY WHAT\'S NOT WORKING\n  → Reply rate below 15%? Your messages need improving\n  → Replies but no bookings? Your follow-up game needs work\n  → Bookings but no shows? Add confirmation messages + reminders\n  → Use AI Coach "Analyse Conversation" on your worst conversations\n\n4. SET NEXT WEEK\'S TARGETS\n  → Cold opens: 100-150 per week\n  → Follow-ups: 50-75 per week\n  → Target: 5-15 discovery calls booked', type: 'text' },
   { id: 'sop3', title: 'Pre-Call Preparation SOP (5 minutes)', description: 'Before every discovery call:\n\n1. REVIEW THE LEAD\n  → Open their lead profile in Prospex\n  → Note: Google rating, review count, audit score, website\n  → Check their Instagram (recent posts, follower count, engagement)\n\n2. PREPARE TALKING POINTS\n  → 3 specific problems you noticed (from audit data)\n  → 1 competitor insight (who\'s ranking above them)\n  → 1 case study relevant to their niche + city\n\n3. HAVE READY\n  → Screen share with their audit/data open\n  → Pricing ready (don\'t fumble when they ask)\n  → Booking link for next step (if they\'re interested)\n  → Onboarding form link (if they close on the call)\n\n4. MINDSET\n  → You\'re a consultant, not a salesperson\n  → Ask questions first, present solutions second\n  → If they\'re not a fit, tell them honestly', type: 'text' },
   { id: 'sop4', title: 'New Client Onboarding SOP', description: '✅ Day 0 (Close Day)\n  → Send onboarding form immediately\n  → Send welcome message/video\n  → Add to client management system\n  → Set up Slack/WhatsApp communication channel\n\n✅ Day 1-2\n  → Review completed onboarding form\n  → Get all access credentials (ad accounts, Google Business, website)\n  → Set up tracking and reporting\n\n✅ Day 3-5\n  → Complete full audit and strategy document\n  → Present strategy to client (share screen)\n  → Get approval to launch\n\n✅ Week 1-2\n  → Launch campaigns / implement changes\n  → Set up automated reporting\n  → Schedule first results review call (Week 2)\n\n✅ Ongoing\n  → Weekly optimisation\n  → Bi-weekly or monthly reporting call\n  → Proactive communication (don\'t wait for them to ask)', type: 'text' },
   { id: 'sop5', title: 'Target KPIs & Benchmarks', description: 'OUTREACH METRICS (Weekly targets)\n  → Cold opens sent: 100-150\n  → Reply rate: 15-25%\n  → Positive reply rate: 8-15%\n  → Discovery calls booked: 5-15\n  → Show rate: 80%+\n  → Close rate: 30-50%\n\nREVENUE TARGETS\n  → Average client value: £1,000-3,000/month\n  → Close 2-4 clients per month = £2,000-12,000 MRR\n  → 6-month target: 10-20 active clients\n\nTIME ALLOCATION (Daily)\n  → Outreach: 60 mins (morning)\n  → Client delivery: 3-4 hours\n  → Admin/reporting: 30 mins\n  → Learning/improvement: 30 mins\n  → Sales calls: As scheduled', type: 'text' },
  ]
 },
];

// ─── ICON MAP ───────────────────────────────────────────────
function SectionIcon({ icon, className }: { icon: string; className?: string }) {
 switch (icon) {
  case 'link': return <Link2 className={className} />;
  case 'message': return <MessageSquare className={className} />;
  case 'shield': return <Shield className={className} />;
  case 'clock': return <Clock className={className} />;
  case 'video': return <Video className={className} />;
  default: return <FileText className={className} />;
 }
}

// ─── MAIN PAGE ──────────────────────────────────────────────
export default function KnowledgeBasePage() {
 const [sections, setSections] = useState<KBSection[]>(DEFAULT_SECTIONS);
 const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['links']));
 const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
 const [editingItem, setEditingItem] = useState<string | null>(null);
 const [searchQuery, setSearchQuery] = useState('');
 const [copied, setCopied] = useState<string | null>(null);

 // Load from localStorage
 useEffect(() => {
  try {
   const stored = localStorage.getItem(LS_KEY);
   if (stored) {
    const parsed = JSON.parse(stored);
    if (parsed && Array.isArray(parsed) && parsed.length > 0) {
     setSections(parsed);
    }
   }
  } catch { /* use defaults */ }
 }, []);

 // Save to localStorage
 const saveData = useCallback((data: KBSection[]) => {
  setSections(data);
  localStorage.setItem(LS_KEY, JSON.stringify(data));
 }, []);

 const toggleSection = (id: string) => {
  setExpandedSections(prev => {
   const next = new Set(prev);
   if (next.has(id)) next.delete(id); else next.add(id);
   return next;
  });
 };

 const toggleItem = (id: string) => {
  setExpandedItems(prev => {
   const next = new Set(prev);
   if (next.has(id)) next.delete(id); else next.add(id);
   return next;
  });
 };

 const updateItem = (sectionId: string, itemId: string, field: keyof KBItem, value: string) => {
  const updated = sections.map(s => {
   if (s.id !== sectionId) return s;
   return { ...s, items: s.items.map(item => item.id === itemId ? { ...item, [field]: value } : item) };
  });
  saveData(updated);
 };

 const addItem = (sectionId: string) => {
  const updated = sections.map(s => {
   if (s.id !== sectionId) return s;
   const newItem: KBItem = {
    id: `custom-${Date.now()}`,
    title: 'New Resource',
    url: '',
    description: 'Click edit to add content.',
    type: s.id === 'links' ? 'link' : 'text',
   };
   return { ...s, items: [...s.items, newItem] };
  });
  saveData(updated);
 };

 const deleteItem = (sectionId: string, itemId: string) => {
  const updated = sections.map(s => {
   if (s.id !== sectionId) return s;
   return { ...s, items: s.items.filter(item => item.id !== itemId) };
  });
  saveData(updated);
 };

 const handleCopy = (text: string, itemId: string) => {
  navigator.clipboard.writeText(text);
  setCopied(itemId);
  setTimeout(() => setCopied(null), 2000);
 };

 // Filter items by search
 const filteredSections = sections.map(section => ({
  ...section,
  items: section.items.filter(item => {
   if (!searchQuery.trim()) return true;
   const q = searchQuery.toLowerCase();
   return item.title.toLowerCase().includes(q) || item.description.toLowerCase().includes(q);
  })
 })).filter(s => s.items.length > 0 || !searchQuery.trim());

 return (
  <div className="min-h-screen p-6 max-w-5xl mx-auto">
   {/* Header */}
   <div className="flex items-center justify-between mb-6">
    <div>
     <h1 className="text-2xl font-bold text-white flex items-center gap-2">
      <BookOpen className="w-6 h-6 text-prospex-cyan" />
      Knowledge Base
     </h1>
     <p className="text-sm text-prospex-muted mt-1">Your VSL links, booking links, training materials, scripts, and SOPs — all in one place.</p>
    </div>
   </div>

   {/* Search */}
   <div className="relative mb-6">
    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-prospex-muted" />
    <input
     type="text"
     value={searchQuery}
     onChange={e => setSearchQuery(e.target.value)}
     placeholder="Search knowledge base..."
     className="w-full pl-10 pr-4 py-2.5 bg-prospex-surface border border-prospex-border rounded-lg text-sm text-white placeholder:text-prospex-muted focus:outline-none focus:border-prospex-cyan"
    />
   </div>

   {/* Quick Links Bar (if links have URLs) */}
   {sections[0]?.items.some(i => i.url) && (
    <div className="flex flex-wrap gap-2 mb-6">
     {sections[0].items.filter(i => i.url).map(item => (
      <a key={item.id} href={item.url} target="_blank" rel="noopener noreferrer"
       className="flex items-center gap-1.5 px-3 py-1.5 bg-prospex-surface border border-prospex-border rounded-lg text-xs text-white hover:border-prospex-cyan/40 transition-colors">
       <ExternalLink className="w-3 h-3 text-prospex-cyan" />
       {item.title}
      </a>
     ))}
    </div>
   )}

   {/* Sections */}
   <div className="space-y-4">
    {filteredSections.map(section => (
     <div key={section.id} className="bg-prospex-surface border border-prospex-border rounded-lg overflow-hidden">
      {/* Section Header */}
      <button
       onClick={() => toggleSection(section.id)}
       className="w-full flex items-center justify-between p-4 hover:bg-prospex-bg/50 transition-colors"
      >
       <div className="flex items-center gap-2.5">
        <SectionIcon icon={section.icon} className={`w-5 h-5 ${section.color}`} />
        <h2 className="text-sm font-semibold text-white">{section.title}</h2>
        <span className="text-[10px] text-prospex-muted bg-prospex-bg px-2 py-0.5 rounded-full">{section.items.length}</span>
       </div>
       {expandedSections.has(section.id) ? <ChevronUp className="w-4 h-4 text-prospex-muted" /> : <ChevronDown className="w-4 h-4 text-prospex-muted" />}
      </button>

      {/* Section Content */}
      {expandedSections.has(section.id) && (
       <div className="border-t border-prospex-border">
        {section.items.map(item => (
         <div key={item.id} className="border-b border-prospex-border/50 last:border-b-0">
          {/* Item Header */}
          <div className="flex items-center justify-between px-4 py-3 hover:bg-prospex-bg/30 transition-colors">
           <button onClick={() => toggleItem(item.id)} className="flex items-center gap-2 flex-1 min-w-0 text-left">
            {item.type === 'link' ? <Link2 className="w-3.5 h-3.5 text-blue-400 shrink-0" /> :
             item.type === 'video' ? <Video className="w-3.5 h-3.5 text-red-400 shrink-0" /> :
             <FileText className="w-3.5 h-3.5 text-prospex-muted shrink-0" />}
            <span className="text-sm text-white truncate">{item.title}</span>
            {item.url && (
             <span className="text-[10px] text-prospex-muted truncate max-w-[200px]">{item.url}</span>
            )}
           </button>
           <div className="flex items-center gap-1 shrink-0 ml-2">
            {item.url && (
             <a href={item.url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="p-1.5 rounded hover:bg-prospex-bg text-prospex-muted hover:text-white transition-colors" title="Open link">
              <ExternalLink className="w-3 h-3" />
             </a>
            )}
            <button onClick={(e) => { e.stopPropagation(); handleCopy(item.url || item.description, item.id); }} className="p-1.5 rounded hover:bg-prospex-bg text-prospex-muted hover:text-white transition-colors" title="Copy">
             {copied === item.id ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
            </button>
            <button onClick={(e) => { e.stopPropagation(); setEditingItem(editingItem === item.id ? null : item.id); toggleItem(item.id); }} className="p-1.5 rounded hover:bg-prospex-bg text-prospex-muted hover:text-prospex-cyan transition-colors" title="Edit">
             <Edit3 className="w-3 h-3" />
            </button>
            <button onClick={(e) => { e.stopPropagation(); if (confirm('Delete this item?')) deleteItem(section.id, item.id); }} className="p-1.5 rounded hover:bg-red-500/20 text-prospex-muted hover:text-red-400 transition-colors" title="Delete">
             <Trash2 className="w-3 h-3" />
            </button>
           </div>
          </div>

          {/* Item Content (expanded) */}
          {(expandedItems.has(item.id) || editingItem === item.id) && (
           <div className="px-4 pb-3">
            {editingItem === item.id ? (
             <div className="space-y-2">
              <input
               type="text"
               value={item.title}
               onChange={e => updateItem(section.id, item.id, 'title', e.target.value)}
               className="w-full px-3 py-2 bg-prospex-bg border border-prospex-border rounded-lg text-sm text-white focus:outline-none focus:border-prospex-cyan"
               placeholder="Title"
              />
              {(item.type === 'link' || item.url !== undefined) && (
               <input
                type="url"
                value={item.url || ''}
                onChange={e => updateItem(section.id, item.id, 'url', e.target.value)}
                className="w-full px-3 py-2 bg-prospex-bg border border-prospex-border rounded-lg text-sm text-white focus:outline-none focus:border-prospex-cyan"
                placeholder="https://..."
               />
              )}
              <textarea
               value={item.description}
               onChange={e => updateItem(section.id, item.id, 'description', e.target.value)}
               rows={6}
               className="w-full px-3 py-2 bg-prospex-bg border border-prospex-border rounded-lg text-sm text-white focus:outline-none focus:border-prospex-cyan resize-none"
               placeholder="Description or content..."
              />
              <button onClick={() => setEditingItem(null)} className="px-4 py-1.5 bg-prospex-cyan text-white font-semibold text-xs rounded-lg hover:bg-prospex-cyan/80 flex items-center gap-1">
               <Save className="w-3 h-3" /> Done Editing
              </button>
             </div>
            ) : (
             <div className="bg-prospex-bg/50 rounded-lg p-3">
              <pre className="text-xs text-prospex-text whitespace-pre-wrap font-sans leading-relaxed">{item.description}</pre>
             </div>
            )}
           </div>
          )}
         </div>
        ))}

        {/* Add Item Button */}
        <button
         onClick={() => addItem(section.id)}
         className="w-full flex items-center justify-center gap-1.5 py-2.5 text-xs text-prospex-muted hover:text-white hover:bg-prospex-bg/50 transition-colors"
        >
         <Plus className="w-3.5 h-3.5" /> Add Item
        </button>
       </div>
      )}
     </div>
    ))}
   </div>

   {/* Reset to Defaults */}
   <div className="mt-6 flex items-center justify-between">
    <p className="text-[10px] text-prospex-muted">All changes save automatically to your browser.</p>
    <button
     onClick={() => { if (confirm('Reset all knowledge base content to defaults? Your custom edits will be lost.')) { saveData(DEFAULT_SECTIONS); } }}
     className="text-[10px] text-prospex-muted hover:text-red-400 transition-colors"
    >
     Reset to Defaults
    </button>
   </div>
  </div>
 );
}
