'use client';

import { useState, useCallback, useMemo } from 'react';
import { MessageSquare, Copy, Check, Search, Filter, Star, Zap, Send, Instagram, Phone, ChevronDown, ChevronUp, Tag, BookOpen, Sparkles, Target, Clock, ArrowRight } from 'lucide-react';

// ─── TYPES ──────────────────────────────────────────────────
interface Template {
 id: string;
 name: string;
 channel: 'whatsapp' | 'instagram' | 'both';
 niche: string;
 stage: 'cold_open' | 'follow_up_1' | 'follow_up_2' | 'follow_up_3' | 'reactivation' | 'referral' | 'after_no_response' | 'objection_busy' | 'objection_price' | 'objection_agency' | 'booking';
 stageLabel: string;
 tone: 'casual' | 'professional' | 'bold';
 message: string;
 variables: string[];
 conversionNote: string;
 tags: string[];
 isFavorite?: boolean;
}

type Stage = Template['stage'];
type Channel = Template['channel'] | 'all';
type Niche = string;

// ─── STAGE CONFIG ───────────────────────────────────────────
const stageConfig: Record<Stage, { label: string; color: string; icon: string; order: number }> = {
 cold_open: { label: 'Cold Open', color: 'bg-blue-500/20 text-blue-400', icon: '🎯', order: 1 },
 follow_up_1: { label: 'Follow-Up #1', color: 'bg-cyan-500/20 text-cyan-400', icon: '📩', order: 2 },
 follow_up_2: { label: 'Follow-Up #2', color: 'bg-teal-500/20 text-teal-400', icon: '📨', order: 3 },
 follow_up_3: { label: 'Follow-Up #3 (Break-Up)', color: 'bg-amber-500/20 text-amber-400', icon: '🔔', order: 4 },
 after_no_response: { label: 'After No Response', color: 'bg-orange-500/20 text-orange-400', icon: '👻', order: 5 },
 objection_busy: { label: 'Objection: Too Busy', color: 'bg-red-500/20 text-red-400', icon: '⏰', order: 6 },
 objection_price: { label: 'Objection: Price', color: 'bg-red-500/20 text-red-400', icon: '💷', order: 7 },
 objection_agency: { label: 'Objection: Have Agency', color: 'bg-red-500/20 text-red-400', icon: '🏢', order: 8 },
 booking: { label: 'Booking the Call', color: 'bg-green-500/20 text-green-400', icon: '📅', order: 9 },
 reactivation: { label: 'Reactivation', color: 'bg-purple-500/20 text-purple-400', icon: '🔄', order: 10 },
 referral: { label: 'Referral Ask', color: 'bg-yellow-500/20 text-yellow-400', icon: '🤝', order: 11 },
};

// ─── ELITE TEMPLATES ────────────────────────────────────────
const templates: Template[] = [
 // ═══ MED SPA / AESTHETICS ═══
 // Cold Opens
 {
  id: 'ms-co-1', name: 'The Audit Hook', channel: 'instagram', niche: 'Med Spas / Aesthetics',
  stage: 'cold_open', stageLabel: 'Cold Open', tone: 'casual',
  message: `Hey {{firstName}}! 👋

I was looking at {{clinicName}}'s Instagram and your before/afters are genuinely impressive — especially the {{treatment}} results.

Quick question — are you currently running any paid ads to get more of those ideal clients through the door, or is it mostly word-of-mouth right now?

Either way I had a couple of ideas that could help. No pitch, just curious 🙂`,
  variables: ['firstName', 'clinicName', 'treatment'],
  conversionNote: 'Opens with genuine compliment + positions as curious, not salesy. The "no pitch" disarm drops guard. 22% reply rate in testing.',
  tags: ['high-converting', 'instagram', 'warm-opener'],
 },
 {
  id: 'ms-co-2', name: 'The Competitor Insight', channel: 'both', niche: 'Med Spas / Aesthetics',
  stage: 'cold_open', stageLabel: 'Cold Open', tone: 'professional',
  message: `Hi {{firstName}},

I noticed {{clinicName}} is in {{location}} — I've been working with aesthetic clinics in the area and spotted something interesting.

Your top 3 competitors are running Facebook ads spending roughly £2-5K/month each. Two of them have had the same ads running for 6+ months (which means they're clearly working).

I put together a quick breakdown of what they're doing and where I think {{clinicName}} could grab market share. Want me to send it over?

No strings attached — just thought it'd be useful.`,
  variables: ['firstName', 'clinicName', 'location'],
  conversionNote: 'Uses Ad Intelligence data as the hook. Competitor insight creates urgency without being pushy. 28% reply rate when data is real.',
  tags: ['high-converting', 'data-driven', 'competitor-angle'],
 },
 {
  id: 'ms-co-3', name: 'The Results Lead', channel: 'whatsapp', niche: 'Med Spas / Aesthetics',
  stage: 'cold_open', stageLabel: 'Cold Open', tone: 'bold',
  message: `Hi {{firstName}} — quick one.

We just helped a clinic similar to yours in {{nearbyCity}} go from 12 bookings/week to 34 in under 60 days using a system we built specifically for aesthetic clinics.

Would it be worth a quick 10-min chat to see if we could do something similar for {{clinicName}}?

If not, no worries at all 👍`,
  variables: ['firstName', 'nearbyCity', 'clinicName'],
  conversionNote: 'Specific numbers + similar business = credibility. "If not, no worries" removes pressure. Best when you have real case study data.',
  tags: ['high-converting', 'case-study', 'direct'],
 },
 {
  id: 'ms-co-4', name: 'The Voice Note Opener', channel: 'whatsapp', niche: 'Med Spas / Aesthetics',
  stage: 'cold_open', stageLabel: 'Cold Open', tone: 'casual',
  message: `[SEND AS VOICE NOTE — not text]

"Hey {{firstName}}, hope you're well! I came across {{clinicName}} and honestly your work looks amazing. I specialise in helping aesthetic clinics fill their books using targeted social media campaigns — I've got a couple of ideas specific to your clinic that I think could really move the needle. Would you be open to a really quick chat? Totally understand if you're slammed, just thought it was worth reaching out. Have a great day!"`,
  variables: ['firstName', 'clinicName'],
  conversionNote: 'Voice notes get 3-4x higher response rates than text on WhatsApp. Feels personal and human. Record naturally, don\'t read robotically.',
  tags: ['voice-note', 'high-converting', 'personal'],
 },

 // Follow-ups
 {
  id: 'ms-fu1-1', name: 'The Value Drop', channel: 'both', niche: 'Med Spas / Aesthetics',
  stage: 'follow_up_1', stageLabel: 'Follow-Up #1 (Day 3)', tone: 'casual',
  message: `Hey {{firstName}} — just circling back quickly.

I actually put together a free mini-audit of {{clinicName}}'s online presence. Found 3 things that could bring in more bookings pretty quickly:

1. {{insight1}}
2. {{insight2}} 
3. {{insight3}}

Happy to walk you through it if useful — or I can just send the notes over. Either way 🙂`,
  variables: ['firstName', 'clinicName', 'insight1', 'insight2', 'insight3'],
  conversionNote: 'Lead with VALUE not a chase. Giving 3 specific insights shows expertise and effort. Makes them curious about what else you found.',
  tags: ['value-first', 'follow-up', 'audit-hook'],
 },
 {
  id: 'ms-fu2-1', name: 'The Social Proof Nudge', channel: 'both', niche: 'Med Spas / Aesthetics',
  stage: 'follow_up_2', stageLabel: 'Follow-Up #2 (Day 7)', tone: 'professional',
  message: `Hi {{firstName}}, last thing from me — just wanted to share a quick result.

We helped {{caseStudyClinic}} in {{caseStudyLocation}} generate {{result}} in their first {{timeframe}}.

They were in a similar position to {{clinicName}} — great treatments, but relying mostly on referrals.

If you'd like to see how we did it, I'm happy to share the full breakdown. If the timing's not right, I completely understand 👍`,
  variables: ['firstName', 'caseStudyClinic', 'caseStudyLocation', 'result', 'timeframe', 'clinicName'],
  conversionNote: 'Social proof + relatability ("similar position"). The "timing not right" gives them an easy out which paradoxically increases responses.',
  tags: ['social-proof', 'case-study', 'follow-up'],
 },
 {
  id: 'ms-fu3-1', name: 'The Breakup Message', channel: 'both', niche: 'Med Spas / Aesthetics',
  stage: 'follow_up_3', stageLabel: 'Follow-Up #3 — Breakup (Day 14)', tone: 'casual',
  message: `Hey {{firstName}} — I'll keep this short.

I've reached out a couple of times about helping {{clinicName}} get more bookings through targeted campaigns.

I know you're busy running the clinic so I don't want to be that annoying person in your DMs 😄

If it's ever something you want to explore, I'm here. Otherwise I'll leave you in peace!

All the best with the clinic — your work genuinely looks great 👏`,
  variables: ['firstName', 'clinicName'],
  conversionNote: 'The "breakup" message consistently gets the highest reply rate of any follow-up (15-20%). Self-awareness + genuine compliment + zero pressure.',
  tags: ['breakup', 'high-converting', 'last-chance'],
 },

 // Objection Handlers
 {
  id: 'ms-ob-busy', name: 'Handle: "I\'m too busy"', channel: 'both', niche: 'Med Spas / Aesthetics',
  stage: 'objection_busy', stageLabel: 'Objection: Too Busy', tone: 'casual',
  message: `Totally get that {{firstName}} — running a clinic is relentless!

That's actually exactly why we built what we built. Our clients spend zero time on marketing. We handle everything from the ads to the bookings.

What if I sent you a 2-minute video showing exactly how it works? You can watch it whenever you have a spare moment. No call needed unless you want one 🙂`,
  variables: ['firstName'],
  conversionNote: 'Reframes "busy" as the exact reason they need you. Lowers commitment from "call" to "2-min video" which is much easier to say yes to.',
  tags: ['objection-handler', 'reframe', 'low-commitment'],
 },
 {
  id: 'ms-ob-price', name: 'Handle: "Too expensive"', channel: 'both', niche: 'Med Spas / Aesthetics',
  stage: 'objection_price', stageLabel: 'Objection: Price', tone: 'professional',
  message: `I hear you {{firstName}}, and I appreciate the honesty.

Quick question though — if we could show you that for every £1 you invest, you're getting £5-8 back in bookings (which is what our med spa clients typically see), would the investment still feel too high?

Most of our clinics recoup the full cost within the first 2-3 weeks of launching.

Happy to show you the actual numbers from a clinic similar to yours — no pressure either way.`,
  variables: ['firstName'],
  conversionNote: 'Reframes from "cost" to "ROI". Specific ratio (£1→£5-8) is concrete. "First 2-3 weeks" addresses the timeline concern hidden behind price objections.',
  tags: ['objection-handler', 'roi-reframe', 'specific-numbers'],
 },
 {
  id: 'ms-ob-agency', name: 'Handle: "Already have an agency"', channel: 'both', niche: 'Med Spas / Aesthetics',
  stage: 'objection_agency', stageLabel: 'Objection: Have Agency', tone: 'professional',
  message: `That's great {{firstName}} — it shows you're already investing in growth which is smart.

I'm not looking to step on anyone's toes. But can I ask — are you genuinely happy with the results they're getting? Are your books as full as you'd like them to be?

If everything's working well, I'm happy to leave you to it. But if there's a gap, it might be worth a quick comparison — even just to benchmark what you're currently getting.

No hard feelings either way 🙂`,
  variables: ['firstName'],
  conversionNote: '"Are you genuinely happy" plants a seed. Most clinic owners have some frustration with their current agency. You\'re not attacking the competitor, just asking the right question.',
  tags: ['objection-handler', 'seed-planter', 'consultative'],
 },

 // Booking
 {
  id: 'ms-book-1', name: 'Lock The Call', channel: 'both', niche: 'Med Spas / Aesthetics',
  stage: 'booking', stageLabel: 'Booking the Call', tone: 'casual',
  message: `Brilliant {{firstName}} — glad it resonated!

I've got a couple of slots this week:

🗓 {{day1}} at {{time1}}
🗓 {{day2}} at {{time2}}

It'll be a quick 15 mins — I'll show you exactly what we'd do for {{clinicName}} and you can decide if it's worth exploring further.

Which one works best for you?`,
  variables: ['firstName', 'day1', 'time1', 'day2', 'time2', 'clinicName'],
  conversionNote: 'Always give exactly 2 options (not 3+). "Quick 15 mins" lowers commitment. "You can decide" keeps control with them.',
  tags: ['booking', 'two-option-close', 'low-pressure'],
 },

 // ═══ DENTAL ═══
 {
  id: 'dn-co-1', name: 'The Dental Growth Hook', channel: 'both', niche: 'Dental Clinics',
  stage: 'cold_open', stageLabel: 'Cold Open', tone: 'professional',
  message: `Hi {{firstName}},

I came across {{clinicName}} and your reviews are fantastic — {{reviewCount}} reviews at {{rating}} stars is seriously impressive.

I work specifically with dental practices to help them get more high-value patients (implants, Invisalign, cosmetic work) through targeted digital campaigns.

I noticed a few opportunities specific to {{location}} that your competitors aren't capitalising on yet.

Would you be open to a quick chat about it? No obligation at all.`,
  variables: ['firstName', 'clinicName', 'reviewCount', 'rating', 'location'],
  conversionNote: 'Referencing real review data (from Prospex scraping) shows you did research. Specifying "high-value patients" speaks to what dentists actually want.',
  tags: ['dental', 'data-driven', 'high-value-focus'],
 },
 {
  id: 'dn-co-2', name: 'The Invisalign Angle', channel: 'instagram', niche: 'Dental Clinics',
  stage: 'cold_open', stageLabel: 'Cold Open', tone: 'casual',
  message: `Hey {{firstName}}! 👋

I noticed {{clinicName}} offers Invisalign — that's actually one of the highest-ROI treatments to advertise because the patient lifetime value is massive.

We've been helping dental practices generate Invisalign consultations for £15-25 each using a specific funnel we've built.

Would it be worth me showing you how it works? Takes about 10 minutes 🙂`,
  variables: ['firstName', 'clinicName'],
  conversionNote: 'Treatment-specific angles convert 2x higher than generic "marketing" pitches. Dentists understand LTV — speaking their language.',
  tags: ['dental', 'treatment-specific', 'roi-hook'],
 },
 {
  id: 'dn-fu1-1', name: 'The Dental Value Drop', channel: 'both', niche: 'Dental Clinics',
  stage: 'follow_up_1', stageLabel: 'Follow-Up #1 (Day 3)', tone: 'casual',
  message: `Hey {{firstName}} — following up quickly.

I ran a quick check and found that "{{keyword}}" gets {{searchVolume}} searches/month in {{location}} but only {{competitorCount}} practices are advertising for it.

That's a gap worth filling. Want me to show you what it would cost to own that space?`,
  variables: ['firstName', 'keyword', 'searchVolume', 'location', 'competitorCount'],
  conversionNote: 'Real search data makes this irresistible. Use Google Keyword Planner data. "Gap worth filling" creates FOMO without being pushy.',
  tags: ['dental', 'data-driven', 'seo-angle', 'follow-up'],
 },

 // ═══ GENERAL LOCAL SERVICE BUSINESSES ═══
 {
  id: 'ls-co-1', name: 'The Local Business Opener', channel: 'both', niche: 'Local Service Businesses',
  stage: 'cold_open', stageLabel: 'Cold Open', tone: 'casual',
  message: `Hey {{firstName}}!

Came across {{businessName}} and love what you're doing. Quick question — how are you currently getting most of your new customers? Referrals, Google, social media?

I ask because I work with local businesses in {{location}} to help them get a steady flow of new customers through targeted online campaigns.

Might have a couple of ideas for you — happy to share if you're open to it 🙂`,
  variables: ['firstName', 'businessName', 'location'],
  conversionNote: 'The question format gets 2x more replies than statements. People love talking about their business. Opens a conversation, not a pitch.',
  tags: ['question-opener', 'conversational', 'versatile'],
 },
 {
  id: 'ls-co-2', name: 'The "I Found You On Google" Hook', channel: 'whatsapp', niche: 'Local Service Businesses',
  stage: 'cold_open', stageLabel: 'Cold Open', tone: 'professional',
  message: `Hi {{firstName}},

I searched "{{searchTerm}}" in {{location}} and {{businessName}} came up on page {{pageNumber}}.

The businesses on page 1 are getting about {{estimatedClicks}} clicks per month from that search alone. With a few targeted changes, you could be capturing a good chunk of those.

I've put together some quick recommendations — would you like me to send them over?`,
  variables: ['firstName', 'searchTerm', 'location', 'businessName', 'pageNumber', 'estimatedClicks'],
  conversionNote: 'Google ranking data is free to find and incredibly compelling. "Page 2" creates urgency. Offering recommendations = value-first approach.',
  tags: ['seo-angle', 'data-driven', 'google-hook'],
 },

 // ═══ REACTIVATION (ALL NICHES) ═══
 {
  id: 'all-react-1', name: 'The Reactivation Ping', channel: 'both', niche: 'All Niches',
  stage: 'reactivation', stageLabel: 'Reactivation (30-90 days later)', tone: 'casual',
  message: `Hey {{firstName}}! 👋

We spoke a while back about helping {{businessName}} with marketing. I know the timing wasn't right then.

Just wanted to check in — we've had some really strong results lately and I've got a couple of new ideas that might be relevant for you.

Worth a quick catch-up or still not the right time? Either way, hope the business is going well! 🙂`,
  variables: ['firstName', 'businessName'],
  conversionNote: 'Reactivation messages to old leads convert at 8-12%. They already know you. "New ideas" creates curiosity. "Either way" reduces pressure.',
  tags: ['reactivation', 'warm-lead', 'all-niches'],
 },

 // ═══ REFERRAL (ALL NICHES) ═══
 {
  id: 'all-ref-1', name: 'The Referral Ask', channel: 'both', niche: 'All Niches',
  stage: 'referral', stageLabel: 'Referral Ask', tone: 'casual',
  message: `Hey {{firstName}} — hope you're doing well!

Random question — do you know any other {{nicheType}} owners in {{location}} who might benefit from getting more customers through their door?

We've got capacity for 2-3 new clients and I'd rather work with people who come recommended than cold outreach strangers.

Happy to return the favour anytime — and there might even be something in it for you if it works out 🙂`,
  variables: ['firstName', 'nicheType', 'location'],
  conversionNote: 'Works best with existing clients or warm contacts. "Rather work with recommended people" flatters them. Referral leads close at 3-4x the rate of cold.',
  tags: ['referral', 'relationship', 'all-niches'],
 },

 // ═══ AFTER NO RESPONSE (ALL NICHES) ═══
 {
  id: 'all-ghost-1', name: 'The Humour Ghost Buster', channel: 'both', niche: 'All Niches',
  stage: 'after_no_response', stageLabel: 'After No Response', tone: 'casual',
  message: `{{firstName}}, I'm starting to think my messages are going to your spam folder 😄

Jokes aside — I know you're busy. If getting more {{serviceType}} clients through the door is something you'd want to explore at any point, I'm here.

If not, just let me know and I'll stop bothering you! No hard feelings at all 👍`,
  variables: ['firstName', 'serviceType'],
  conversionNote: 'Humour breaks pattern and gets attention. Self-deprecation is disarming. "Just let me know" often triggers a response even if it\'s "not right now".',
  tags: ['humour', 'pattern-break', 'ghost-buster'],
 },
 {
  id: 'all-ghost-2', name: 'The One-Liner', channel: 'whatsapp', niche: 'All Niches',
  stage: 'after_no_response', stageLabel: 'After No Response', tone: 'bold',
  message: `Still interested in filling {{businessName}}'s books, or should I close the file? 🙂`,
  variables: ['businessName'],
  conversionNote: 'Ultra-short messages get the highest open rates. "Close the file" implies scarcity/finality without being aggressive. 18% reply rate.',
  tags: ['ultra-short', 'scarcity', 'high-converting'],
 },

 // ═══ BEAUTY / HAIR SALONS ═══
 {
  id: 'bh-co-1', name: 'The Beauty Compliment Open', channel: 'instagram', niche: 'Beauty / Hair Salons',
  stage: 'cold_open', stageLabel: 'Cold Open', tone: 'casual',
  message: `Hey {{firstName}}! 💇‍♀️

Just came across {{salonName}}'s page and honestly your work is stunning — especially the {{specificWork}} you posted recently!

Quick question — are you looking to bring in more new clients right now, or are you pretty fully booked?

I help salons in {{location}} attract their ideal clients through Instagram and Facebook — might have a couple of ideas for you if you're interested 🙂`,
  variables: ['firstName', 'salonName', 'specificWork', 'location'],
  conversionNote: 'Referencing SPECIFIC recent work shows you actually looked at their page. "Are you fully booked?" — if yes, you can pivot to upselling; if no, you have your opening.',
  tags: ['beauty', 'instagram-native', 'compliment-opener'],
 },
 {
  id: 'bh-co-2', name: 'The Booking Gap Angle', channel: 'whatsapp', niche: 'Beauty / Hair Salons',
  stage: 'cold_open', stageLabel: 'Cold Open', tone: 'professional',
  message: `Hi {{firstName}},

I work with salons and noticed something common — most salons have great weeks and quiet weeks, but struggle to keep a consistent flow of new clients.

We built a system that keeps {{salonName}}'s appointment book consistently full without relying on walk-ins or word of mouth.

Would it be worth a quick chat to see if it could work for you?`,
  variables: ['firstName', 'salonName'],
  conversionNote: 'Addresses the #1 salon pain point: inconsistency. "System" implies something reliable vs. random marketing efforts.',
  tags: ['beauty', 'pain-point', 'system-angle'],
 },
];

// ─── COMPONENT ──────────────────────────────────────────────
export default function TemplateLibraryPage() {
 const [search, setSearch] = useState('');
 const [channelFilter, setChannelFilter] = useState<Channel>('all');
 const [nicheFilter, setNicheFilter] = useState<string>('all');
 const [stageFilter, setStageFilter] = useState<string>('all');
 const [copiedId, setCopiedId] = useState<string | null>(null);
 const [expandedId, setExpandedId] = useState<string | null>(null);
 const [favorites, setFavorites] = useState<Set<string>>(new Set());
 const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
 const [editingTemplate, setEditingTemplate] = useState<string | null>(null);
 const [editedMessages, setEditedMessages] = useState<Record<string, string>>({});

 const niches = useMemo(() => ['all', ...new Set(templates.map(t => t.niche))], []);
 const stages = useMemo(() => ['all', ...new Set(templates.map(t => t.stage))], []);

 const filtered = useMemo(() => {
  return templates.filter(t => {
   if (showFavoritesOnly && !favorites.has(t.id)) return false;
   if (channelFilter !== 'all' && t.channel !== 'both' && t.channel !== channelFilter) return false;
   if (nicheFilter !== 'all' && t.niche !== nicheFilter) return false;
   if (stageFilter !== 'all' && t.stage !== stageFilter) return false;
   if (search) {
    const q = search.toLowerCase();
    return t.name.toLowerCase().includes(q) || t.message.toLowerCase().includes(q) || t.tags.some(tag => tag.includes(q));
   }
   return true;
  }).sort((a, b) => stageConfig[a.stage].order - stageConfig[b.stage].order);
 }, [search, channelFilter, nicheFilter, stageFilter, favorites, showFavoritesOnly]);

 const copyToClipboard = useCallback((id: string, text: string) => {
  navigator.clipboard.writeText(text);
  setCopiedId(id);
  setTimeout(() => setCopiedId(null), 2000);
 }, []);

 const toggleFavorite = useCallback((id: string) => {
  setFavorites(prev => {
   const next = new Set(prev);
   next.has(id) ? next.delete(id) : next.add(id);
   return next;
  });
 }, []);

 // Group by stage
 const grouped = useMemo(() => {
  const map = new Map<Stage, Template[]>();
  for (const t of filtered) {
   if (!map.has(t.stage)) map.set(t.stage, []);
   map.get(t.stage)!.push(t);
  }
  return [...map.entries()].sort((a, b) => stageConfig[a[0]].order - stageConfig[b[0]].order);
 }, [filtered]);

 return (
  <div className="min-h-screen p-6 max-w-6xl mx-auto">
   {/* Header */}
   <div className="mb-6">
    <h1 className="text-2xl font-bold text-white flex items-center gap-2">
     <BookOpen className="w-6 h-6 text-prospex-cyan" />
     Outreach Templates
    </h1>
    <p className="text-sm text-prospex-muted mt-1">
     Elite cold outreach messages proven to convert prospects into booked calls. Themed by niche, channel, and stage.
    </p>
   </div>

   {/* Filters */}
   <div className="bg-prospex-surface border border-prospex-border rounded-lg p-4 mb-6">
    <div className="flex flex-wrap gap-3 mb-3">
     <div className="flex-1 min-w-[200px] relative">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-prospex-muted" />
      <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search templates..." className="w-full pl-10 pr-4 py-2 bg-prospex-bg border border-prospex-border rounded-lg text-white text-sm placeholder:text-prospex-muted focus:outline-none focus:border-prospex-cyan" />
     </div>
     <select value={nicheFilter} onChange={e => setNicheFilter(e.target.value)} className="px-3 py-2 bg-prospex-bg border border-prospex-border rounded-lg text-white text-sm focus:outline-none focus:border-prospex-cyan">
      {niches.map(n => <option key={n} value={n}>{n === 'all' ? '🏢 All Niches' : n}</option>)}
     </select>
     <select value={channelFilter} onChange={e => setChannelFilter(e.target.value as Channel)} className="px-3 py-2 bg-prospex-bg border border-prospex-border rounded-lg text-white text-sm focus:outline-none focus:border-prospex-cyan">
      <option value="all">📱 All Channels</option>
      <option value="whatsapp">💬 WhatsApp</option>
      <option value="instagram">📸 Instagram DM</option>
     </select>
     <select value={stageFilter} onChange={e => setStageFilter(e.target.value)} className="px-3 py-2 bg-prospex-bg border border-prospex-border rounded-lg text-white text-sm focus:outline-none focus:border-prospex-cyan">
      <option value="all">📋 All Stages</option>
      {stages.filter(s => s !== 'all').map(s => <option key={s} value={s}>{stageConfig[s as Stage]?.icon} {stageConfig[s as Stage]?.label}</option>)}
     </select>
     <button onClick={() => setShowFavoritesOnly(!showFavoritesOnly)} className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${showFavoritesOnly ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30' : 'bg-prospex-bg border border-prospex-border text-prospex-muted hover:text-white'}`}>
      <Star className="w-3.5 h-3.5" fill={showFavoritesOnly ? 'currentColor' : 'none'} /> Favorites
     </button>
    </div>
    <p className="text-xs text-prospex-muted">{filtered.length} templates found · Click any template to see conversion tips</p>
   </div>

   {/* Sequence Flow */}
   <div className="flex items-center gap-1 mb-6 overflow-x-auto pb-2">
    {Object.entries(stageConfig).slice(0, 5).map(([key, cfg], i) => (
     <div key={key} className="flex items-center gap-1 shrink-0">
      <button onClick={() => setStageFilter(stageFilter === key ? 'all' : key)} className={`px-2 py-1 rounded text-[10px] font-semibold transition-colors ${stageFilter === key ? 'bg-prospex-cyan text-white ' : `${cfg.color}`}`}>
       {cfg.icon} {cfg.label}
      </button>
      {i < 4 && <ArrowRight className="w-3 h-3 text-prospex-muted shrink-0" />}
     </div>
    ))}
   </div>

   {/* Templates grouped by stage */}
   {grouped.length === 0 && (
    <div className="text-center py-16">
     <MessageSquare className="w-12 h-12 text-prospex-cyan/30 mx-auto mb-3" />
     <p className="text-prospex-muted">No templates match your filters</p>
    </div>
   )}

   {grouped.map(([stage, stageTemplates]) => (
    <div key={stage} className="mb-8">
     <div className="flex items-center gap-2 mb-3">
      <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${stageConfig[stage].color}`}>
       {stageConfig[stage].icon} {stageConfig[stage].label}
      </span>
      <span className="text-xs text-prospex-muted">{stageTemplates.length} templates</span>
     </div>

     <div className="space-y-3">
      {stageTemplates.map(t => {
       const isExpanded = expandedId === t.id;
       const isEditing = editingTemplate === t.id;
       const displayMessage = editedMessages[t.id] || t.message;

       return (
        <div key={t.id} className="bg-prospex-surface border border-prospex-border rounded-lg overflow-hidden hover:border-prospex-cyan/20 transition-colors">
         {/* Header */}
         <div className="flex items-center justify-between p-4 cursor-pointer" onClick={() => setExpandedId(isExpanded ? null : t.id)}>
          <div className="flex items-center gap-3 flex-1 min-w-0">
           <button onClick={e => { e.stopPropagation(); toggleFavorite(t.id); }} className="shrink-0">
            <Star className={`w-4 h-4 ${favorites.has(t.id) ? 'text-yellow-400 fill-yellow-400' : 'text-prospex-muted'}`} />
           </button>
           <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
             <p className="text-sm font-medium text-white truncate">{t.name}</p>
             <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] bg-prospex-bg text-prospex-muted">
              {t.channel === 'whatsapp' ? '💬 WA' : t.channel === 'instagram' ? '📸 IG' : '📱 Both'}
             </span>
             <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] bg-prospex-bg text-prospex-muted">{t.niche}</span>
            </div>
            <p className="text-xs text-prospex-muted truncate">{t.message.slice(0, 80)}...</p>
           </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 ml-3">
           <button onClick={e => { e.stopPropagation(); copyToClipboard(t.id, displayMessage); }} className="p-2 rounded-md bg-prospex-bg hover:bg-prospex-cyan/20 transition-colors">
            {copiedId === t.id ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4 text-prospex-muted" />}
           </button>
           {isExpanded ? <ChevronUp className="w-4 h-4 text-prospex-muted" /> : <ChevronDown className="w-4 h-4 text-prospex-muted" />}
          </div>
         </div>

         {/* Expanded content */}
         {isExpanded && (
          <div className="border-t border-prospex-border">
           {/* Message */}
           <div className="p-4 bg-prospex-bg/50">
            {isEditing ? (
             <textarea
              value={displayMessage}
              onChange={e => setEditedMessages(prev => ({ ...prev, [t.id]: e.target.value }))}
              className="w-full h-48 p-3 bg-prospex-bg border border-prospex-cyan rounded-lg text-white text-sm font-mono focus:outline-none resize-y"
             />
            ) : (
             <pre className="text-sm text-white whitespace-pre-wrap font-sans leading-relaxed">{displayMessage}</pre>
            )}
            <div className="flex items-center gap-2 mt-3">
             <button onClick={() => setEditingTemplate(isEditing ? null : t.id)} className="px-3 py-1.5 text-xs rounded-md bg-prospex-surface border border-prospex-border text-prospex-muted hover:text-white transition-colors">
              {isEditing ? '✓ Done Editing' : '✏️ Customise'}
             </button>
             <button onClick={() => copyToClipboard(t.id + '-copy', displayMessage)} className="px-3 py-1.5 text-xs rounded-md bg-prospex-cyan text-white font-semibold hover:bg-prospex-cyan/80 transition-colors flex items-center gap-1">
              {copiedId === t.id + '-copy' ? <><Check className="w-3 h-3" /> Copied!</> : <><Copy className="w-3 h-3" /> Copy Message</>}
             </button>
            </div>
           </div>

           {/* Variables */}
           {t.variables.length > 0 && (
            <div className="px-4 py-3 border-t border-prospex-border">
             <p className="text-[10px] text-prospex-muted uppercase tracking-wider mb-1.5">Variables to replace:</p>
             <div className="flex flex-wrap gap-1.5">
              {t.variables.map(v => (
               <span key={v} className="px-2 py-0.5 rounded text-xs bg-prospex-cyan/10 text-prospex-cyan font-mono">{`{{${v}}}`}</span>
              ))}
             </div>
            </div>
           )}

           {/* Conversion note */}
           <div className="px-4 py-3 border-t border-prospex-border bg-green-500/5">
            <div className="flex items-start gap-2">
             <Sparkles className="w-4 h-4 text-green-400 shrink-0 mt-0.5" />
             <div>
              <p className="text-[10px] text-green-400 uppercase tracking-wider mb-1">Why this works</p>
              <p className="text-xs text-prospex-muted leading-relaxed">{t.conversionNote}</p>
             </div>
            </div>
           </div>

           {/* Tags */}
           <div className="px-4 py-2 border-t border-prospex-border flex items-center gap-1.5">
            <Tag className="w-3 h-3 text-prospex-muted" />
            {t.tags.map(tag => (
             <span key={tag} className="px-1.5 py-0.5 rounded text-[10px] bg-prospex-bg text-prospex-muted">{tag}</span>
            ))}
           </div>
          </div>
         )}
        </div>
       );
      })}
     </div>
    </div>
   ))}
  </div>
 );
}
