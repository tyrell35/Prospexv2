'use client';

import { useState, useCallback } from 'react';
import { Brain, Send, MessageSquare, Sparkles, AlertTriangle, Zap, Copy, Check, RotateCcw, ChevronDown, ChevronUp, Target, TrendingUp, BookOpen, Lightbulb } from 'lucide-react';

type CoachMode = 'critique' | 'respond' | 'analyze' | 'roleplay';

interface CoachResponse {
 mode: CoachMode;
 content: string;
 timestamp: Date;
}

const SYSTEM_PROMPT = `You are an elite outreach and sales coach specialising in helping marketing agencies close clients via WhatsApp and Instagram DM. Your expertise is in cold outreach to med spas, aesthetic clinics, dental clinics, and local service businesses in the UK, US, and Canada.

Your coaching style:
- Direct and actionable — no fluff
- Reference specific sales psychology principles (pattern interrupt, loss aversion, social proof, reciprocity, commitment/consistency)
- Rate messages on a scale of 1-10 with specific reasons
- Always provide a rewritten "elite version" when critiquing
- Use frameworks: AIDA (Attention, Interest, Desire, Action), PAS (Problem, Agitate, Solve), Before-After-Bridge
- Reference what top closers do differently
- Be encouraging but honest — point out weaknesses clearly

Key principles you coach on:
1. NEVER lead with what you do. Lead with THEM — their business, their problem, their opportunity.
2. Ask questions, don't pitch. Questions get 2x more replies.
3. Keep it short. Under 60 words for cold opens. Under 100 for follow-ups.
4. One CTA only. Never give more than one thing to do.
5. Use pattern interrupts — break the "salesy DM" pattern they see every day.
6. Personalisation must be REAL — not just {{firstName}}. Reference something specific about their business.
7. Voice notes on WhatsApp get 3-4x higher reply rates than text.
8. The "breakup message" (3rd follow-up) consistently gets the highest reply rate.
9. Never use phrases like "I hope this email finds you well", "I'd love to", "Just reaching out", "Touch base", "Circle back".
10. Objections are buying signals. Don't fear them — reframe them.
11. "Too busy" means "not convinced of the value yet". "Too expensive" means "I don't see the ROI". "I have an agency" means "convince me yours is better".
12. Always end with a question or clear next step.
13. Use the 2-option close when booking: give exactly 2 time slots.
14. Social proof should include specific numbers and locations.
15. Urgency must be real — fake scarcity kills trust.`;

export default function OutreachCoachPage() {
 const [mode, setMode] = useState<CoachMode>('critique');
 const [input, setInput] = useState('');
 const [context, setContext] = useState('');
 const [niche, setNiche] = useState('med-spa');
 const [loading, setLoading] = useState(false);
 const [error, setError] = useState('');
 const [responses, setResponses] = useState<CoachResponse[]>([]);
 const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
 const [expandedGuide, setExpandedGuide] = useState(false);

 const modeConfig: Record<CoachMode, { label: string; icon: React.ReactNode; placeholder: string; contextLabel: string; color: string; description: string }> = {
  critique: {
   label: 'Critique My Message',
   icon: <Target className="w-4 h-4" />,
   placeholder: 'Paste the outreach message you want critiqued...\n\nExample:\n"Hey! I run a marketing agency and we help med spas get more clients. Would you be interested in chatting?"',
   contextLabel: 'Who is this message for? (optional)',
   color: 'bg-orange-500/20 text-orange-400',
   description: 'Get your cold DM or follow-up message rated and rewritten by an elite coach.',
  },
  respond: {
   label: 'Help Me Respond',
   icon: <MessageSquare className="w-4 h-4" />,
   placeholder: 'Paste the conversation so far...\n\nExample:\nMe: Hey Sarah, I noticed your clinic\'s Instagram...\nThem: Thanks but we\'re not interested right now\n\n→ I\'ll tell you exactly what to say next.',
   contextLabel: 'What\'s your goal? (book call, handle objection, re-engage)',
   color: 'bg-blue-500/20 text-blue-400',
   description: 'Stuck in a conversation? Paste it here and get the perfect next response.',
  },
  analyze: {
   label: 'Analyse Conversation',
   icon: <TrendingUp className="w-4 h-4" />,
   placeholder: 'Paste an entire conversation thread...\n\nI\'ll break down what went right, what went wrong, and how to improve your close rate.',
   contextLabel: 'What was the outcome? (booked, lost, ghosted, pending)',
   color: 'bg-purple-500/20 text-purple-400',
   description: 'Full conversation breakdown — strengths, weaknesses, missed opportunities, and a score.',
  },
  roleplay: {
   label: 'Roleplay Practice',
   icon: <Zap className="w-4 h-4" />,
   placeholder: 'Describe the scenario...\n\nExample:\n"I\'m DMing a med spa owner in London who has 5K Instagram followers and hasn\'t replied to my first message. They run Botox and filler treatments."',
   contextLabel: 'What objection or situation do you want to practice?',
   color: 'bg-green-500/20 text-green-400',
   description: 'Practice handling objections and tough conversations with an AI prospect.',
  },
 };

 const handleSubmit = useCallback(async () => {
  if (!input.trim()) return;
  setLoading(true);
  setError('');

  const nicheMap: Record<string, string> = {
   'med-spa': 'med spa / aesthetic clinic',
   'dental': 'dental clinic',
   'beauty': 'beauty / hair salon',
   'local': 'local service business',
  };

  const prompts: Record<CoachMode, string> = {
   critique: `Critique the following outreach message. The target niche is ${nicheMap[niche]}. ${context ? `Context: ${context}` : ''}

Rate it 1-10 and explain:
1. SCORE: X/10 with one-line summary
2. WHAT'S GOOD: What works in this message (be specific)
3. WHAT'S WRONG: Issues that would hurt reply rate (be specific and direct)
4. PSYCHOLOGY: What sales psychology principles are being used or missed
5. REWRITE: Provide an elite rewritten version that would convert significantly better
6. PRO TIP: One advanced technique they should try

Message to critique:
"""
${input}
"""`,
   respond: `I'm in a conversation with a ${nicheMap[niche]} owner. Here's the conversation so far. ${context ? `My goal: ${context}` : 'I want to book a discovery call.'}

Tell me exactly what to respond with. Give me:
1. THE RESPONSE: The exact message to send (ready to copy-paste)
2. WHY THIS WORKS: The psychology behind it
3. WHAT TO EXPECT: How they'll likely reply and how to handle each scenario
4. ALTERNATIVE: A second option if the first feels too aggressive/passive

Conversation:
"""
${input}
"""`,
   analyze: `Analyse this complete conversation between me (a marketing agency) and a ${nicheMap[niche]} owner. ${context ? `Outcome: ${context}` : ''}

Provide:
1. OVERALL SCORE: X/10
2. TIMELINE BREAKDOWN: Go through each message and rate what was good/bad
3. TURNING POINTS: Where the conversation shifted (positively or negatively)
4. MISSED OPPORTUNITIES: What you would have said differently at specific points
5. KEY LESSONS: 3 actionable takeaways to improve future conversations
6. VERDICT: Whether this was handled well overall and what the #1 thing to change would be

Conversation:
"""
${input}
"""`,
   roleplay: `You are now roleplaying as a ${nicheMap[niche]} owner. ${context ? `Scenario detail: ${context}` : ''}

Based on this scenario, respond AS THE PROSPECT would. Be realistic — busy, slightly skeptical, but fair. After your in-character response, break character and provide:

1. [IN CHARACTER] Your response as the prospect
2. [COACH MODE] Analysis of what the user did well/poorly
3. [BEST RESPONSE] What an elite closer would say back to your in-character response
4. [TIP] One technique to practice for this type of situation

Scenario/Message:
"""
${input}
"""`,
  };

  try {
   const res = await fetch('/api/outreach-coach', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
     system: SYSTEM_PROMPT,
     max_tokens: 1500,
     messages: [{ role: 'user', content: prompts[mode] }],
    }),
   });

   if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `API error ${res.status}`);
   }

   const data = await res.json();
   const text = data.content?.map((c: { type: string; text?: string }) => c.type === 'text' ? c.text : '').join('\n') || 'No response received.';

   setResponses(prev => [{ mode, content: text, timestamp: new Date() }, ...prev]);
  } catch (err: unknown) {
   setError(err instanceof Error ? err.message : 'Failed to get coaching response');
  } finally {
   setLoading(false);
  }
 }, [input, context, mode, niche]);

 const copyResponse = useCallback((idx: number, text: string) => {
  navigator.clipboard.writeText(text);
  setCopiedIdx(idx);
  setTimeout(() => setCopiedIdx(null), 2000);
 }, []);

 const cfg = modeConfig[mode];

 return (
  <div className="min-h-screen p-6 max-w-5xl mx-auto">
   {/* Header */}
   <div className="mb-6">
    <h1 className="text-2xl font-bold text-white flex items-center gap-2">
     <Brain className="w-6 h-6 text-prospex-cyan" />
     AI Outreach Coach
    </h1>
    <p className="text-sm text-prospex-muted mt-1">
     Get your messages critiqued, conversations analysed, and responses crafted by an elite sales coach.
    </p>
   </div>

   {/* Mode selector */}
   <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
    {(Object.entries(modeConfig) as [CoachMode, typeof cfg][]).map(([key, config]) => (
     <button
      key={key}
      onClick={() => setMode(key)}
      className={`p-3 rounded-lg border text-left transition-all ${mode === key ? 'bg-prospex-cyan/10 border-prospex-cyan/40' : 'bg-prospex-surface border-prospex-border hover:border-prospex-cyan/20'}`}
     >
      <div className="flex items-center gap-2 mb-1">
       <span className={`p-1.5 rounded ${config.color}`}>{config.icon}</span>
       <span className="text-sm font-medium text-white">{config.label}</span>
      </div>
      <p className="text-[10px] text-prospex-muted leading-relaxed">{config.description}</p>
     </button>
    ))}
   </div>

   {/* Input area */}
   <div className="bg-prospex-surface border border-prospex-border rounded-lg p-4 mb-6">
    <div className="flex items-center gap-3 mb-3">
     <select value={niche} onChange={e => setNiche(e.target.value)} className="px-3 py-2 bg-prospex-bg border border-prospex-border rounded-lg text-white text-sm focus:outline-none focus:border-prospex-cyan">
      <option value="med-spa">🏥 Med Spa / Aesthetics</option>
      <option value="dental">🦷 Dental Clinic</option>
      <option value="beauty">💇 Beauty / Hair Salon</option>
      <option value="local">🏪 Local Service Business</option>
     </select>
     <div className="flex-1">
      <input
       type="text"
       value={context}
       onChange={e => setContext(e.target.value)}
       placeholder={cfg.contextLabel}
       className="w-full px-3 py-2 bg-prospex-bg border border-prospex-border rounded-lg text-white text-sm placeholder:text-prospex-muted focus:outline-none focus:border-prospex-cyan"
      />
     </div>
    </div>

    <textarea
     value={input}
     onChange={e => setInput(e.target.value)}
     placeholder={cfg.placeholder}
     rows={8}
     className="w-full p-3 bg-prospex-bg border border-prospex-border rounded-lg text-white text-sm placeholder:text-prospex-muted focus:outline-none focus:border-prospex-cyan resize-y font-mono leading-relaxed"
    />

    <div className="flex items-center justify-between mt-3">
     <p className="text-xs text-prospex-muted">{input.length} characters · {input.split(/\s+/).filter(Boolean).length} words</p>
     <div className="flex gap-2">
      <button onClick={() => { setInput(''); setContext(''); }} className="px-3 py-2 text-xs rounded-md bg-prospex-bg border border-prospex-border text-prospex-muted hover:text-white transition-colors flex items-center gap-1">
       <RotateCcw className="w-3 h-3" /> Clear
      </button>
      <button
       onClick={handleSubmit}
       disabled={loading || !input.trim()}
       className="px-6 py-2 text-sm font-semibold rounded-md bg-prospex-cyan text-white hover:bg-prospex-cyan/80 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5"
      >
       {loading ? (
        <><div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" /> Coaching...</>
       ) : (
        <><Send className="w-4 h-4" /> Get Coaching</>
       )}
      </button>
     </div>
    </div>
   </div>

   {/* Error */}
   {error && (
    <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 mb-6">
     <p className="text-sm text-red-400 flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> {error}</p>
    </div>
   )}

   {/* Responses */}
   {responses.length > 0 && (
    <div className="space-y-4 mb-8">
     {responses.map((r, i) => (
      <div key={i} className="bg-prospex-surface border border-prospex-border rounded-lg overflow-hidden">
       <div className="flex items-center justify-between p-3 border-b border-prospex-border">
        <div className="flex items-center gap-2">
         <Brain className="w-4 h-4 text-prospex-cyan" />
         <span className="text-sm font-medium text-white">{modeConfig[r.mode].label}</span>
         <span className={`px-1.5 py-0.5 rounded text-[10px] ${modeConfig[r.mode].color}`}>
          {modeConfig[r.mode].icon} {modeConfig[r.mode].label}
         </span>
        </div>
        <div className="flex items-center gap-2">
         <span className="text-[10px] text-prospex-muted">{r.timestamp.toLocaleTimeString()}</span>
         <button onClick={() => copyResponse(i, r.content)} className="p-1.5 rounded hover:bg-prospex-bg transition-colors">
          {copiedIdx === i ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5 text-prospex-muted" />}
         </button>
        </div>
       </div>
       <div className="p-4">
        <div className="prose prose-sm prose-invert max-w-none">
         <pre className="whitespace-pre-wrap font-sans text-sm text-prospex-text leading-relaxed">{r.content}</pre>
        </div>
       </div>
      </div>
     ))}
    </div>
   )}

   {/* Quick Reference Guide */}
   <div className="bg-prospex-surface border border-prospex-border rounded-lg overflow-hidden">
    <button onClick={() => setExpandedGuide(!expandedGuide)} className="w-full flex items-center justify-between p-4">
     <div className="flex items-center gap-2">
      <Lightbulb className="w-5 h-5 text-yellow-400" />
      <span className="text-sm font-medium text-white">Outreach Cheat Sheet — Quick Reference</span>
     </div>
     {expandedGuide ? <ChevronUp className="w-4 h-4 text-prospex-muted" /> : <ChevronDown className="w-4 h-4 text-prospex-muted" />}
    </button>

    {expandedGuide && (
     <div className="border-t border-prospex-border p-4 space-y-4">
      {/* Rules */}
      <div>
       <p className="text-xs font-semibold text-prospex-cyan uppercase tracking-wider mb-2">Golden Rules of Cold Outreach</p>
       <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {[
         'Lead with THEM, not you. Their business, their problem, their opportunity.',
         'Questions get 2x more replies than statements.',
         'Keep cold opens under 60 words. Follow-ups under 100.',
         'One CTA per message. Never give 2 things to do.',
         'Voice notes on WhatsApp get 3-4x higher reply rates.',
         'The breakup message (3rd follow-up) gets highest reply rate.',
         'Real personalisation > generic {{firstName}} tokens.',
         '"Not interested" means "not convinced of value yet".',
        ].map((rule, i) => (
         <div key={i} className="flex items-start gap-2 p-2 rounded bg-prospex-bg">
          <span className="text-prospex-cyan text-xs font-bold mt-0.5">{i + 1}.</span>
          <p className="text-xs text-prospex-muted leading-relaxed">{rule}</p>
         </div>
        ))}
       </div>
      </div>

      {/* Words to avoid */}
      <div>
       <p className="text-xs font-semibold text-red-400 uppercase tracking-wider mb-2">Never Say These</p>
       <div className="flex flex-wrap gap-1.5">
        {['I hope this finds you well', 'Just reaching out', 'I\'d love to', 'Touch base', 'Circle back', 'As per my last message', 'I wanted to introduce myself', 'We\'re the best', 'Guaranteed results', 'I can help you'].map(phrase => (
         <span key={phrase} className="px-2 py-0.5 rounded text-[10px] bg-red-500/10 text-red-400 line-through">{phrase}</span>
        ))}
       </div>
      </div>

      {/* Power words */}
      <div>
       <p className="text-xs font-semibold text-green-400 uppercase tracking-wider mb-2">Power Words That Convert</p>
       <div className="flex flex-wrap gap-1.5">
        {['Quick question', 'I noticed', 'Similar to yours', 'Specifically', 'No obligation', 'No strings attached', 'Worth a quick look', 'Thought of you', 'Spotted something', 'Would it be worth', 'If not, no worries', 'Genuinely curious'].map(phrase => (
         <span key={phrase} className="px-2 py-0.5 rounded text-[10px] bg-green-500/10 text-green-400">{phrase}</span>
        ))}
       </div>
      </div>

      {/* Sequence timing */}
      <div>
       <p className="text-xs font-semibold text-blue-400 uppercase tracking-wider mb-2">Optimal Sequence Timing</p>
       <div className="flex items-center gap-2 overflow-x-auto pb-2">
        {[
         { day: 'Day 1', action: 'Cold Open', tip: 'Short, personal, question-based' },
         { day: 'Day 3', action: 'Follow-Up #1', tip: 'Add value — audit, insight, tip' },
         { day: 'Day 7', action: 'Follow-Up #2', tip: 'Social proof — case study, result' },
         { day: 'Day 14', action: 'Breakup', tip: 'Self-aware, humour, final chance' },
         { day: 'Day 45+', action: 'Reactivation', tip: 'New angle, fresh value' },
        ].map((s, i) => (
         <div key={i} className="shrink-0 p-2.5 rounded-lg bg-prospex-bg border border-prospex-border min-w-[140px]">
          <p className="text-xs font-bold text-white">{s.day}</p>
          <p className="text-[10px] text-prospex-cyan">{s.action}</p>
          <p className="text-[10px] text-prospex-muted mt-1">{s.tip}</p>
         </div>
        ))}
       </div>
      </div>

      {/* Objection reframes */}
      <div>
       <p className="text-xs font-semibold text-amber-400 uppercase tracking-wider mb-2">Objection Reframes</p>
       <div className="space-y-1.5">
        {[
         { objection: '"I\'m too busy"', reframe: 'They\'re saying "convince me it\'s worth my time". Lower the commitment — offer a video/audit instead of a call.' },
         { objection: '"Too expensive"', reframe: 'They\'re saying "I don\'t see the ROI". Show specific numbers: £1 in → £5-8 back.' },
         { objection: '"I already have an agency"', reframe: 'They\'re saying "convince me yours is better". Ask: "Are you genuinely happy with the results?"' },
         { objection: '"Not interested"', reframe: 'They\'re saying "your pitch didn\'t land". Try a completely different angle — competitor data, case study, or question.' },
         { objection: '"Send me info"', reframe: 'Polite brush-off 80% of the time. Respond: "Happy to! What specifically would be most useful to see?"' },
        ].map((o, i) => (
         <div key={i} className="flex gap-3 p-2 rounded bg-prospex-bg">
          <span className="text-xs font-medium text-red-400 shrink-0 min-w-[160px]">{o.objection}</span>
          <span className="text-xs text-prospex-muted">{o.reframe}</span>
         </div>
        ))}
       </div>
      </div>
     </div>
    )}
   </div>
  </div>
 );
}
