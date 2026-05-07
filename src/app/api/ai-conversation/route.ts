import { NextRequest, NextResponse } from 'next/server';

import { supabaseAdmin as supabase } from "@/lib/supabase-admin";

// ═══════════════════════════════════════════════════════
// AI CONVERSATION ENGINE — The Brain
// Handles: message processing, qualifying, objections, booking
// ═══════════════════════════════════════════════════════

interface AgentConfig {
  agent_name: string;
  agent_role: string;
  company_name: string;
  company_description: string;
  services: Array<{ name: string; price: string; description: string }>;
  main_offer: string;
  qualifying_questions: Array<{ question: string; required: boolean }>;
  min_qualifying_score: number;
  booking_link: string;
  booking_type: string;
  tone: string;
  response_style: string;
  common_objections: Array<{ objection: string; response: string }>;
  max_messages_per_conversation: number;
  handoff_trigger: string;
}

interface ConversationMessage {
  role: string;
  content: string;
  ai_intent_detected?: string;
}

// Build the system prompt for the AI agent
function buildSystemPrompt(config: AgentConfig, leadData: Record<string, unknown> | null, qualifyingData: Record<string, unknown>): string {
  const toneMap: Record<string, string> = {
    professional_friendly: 'Professional but warm and approachable. Use occasional emojis (1-2 per message max). Sound like a helpful consultant, not a pushy salesperson.',
    casual: 'Casual and conversational. Use emojis freely. Sound like a friendly expert chatting with a potential client.',
    formal: 'Professional and polished. Minimal emojis. Sound like a senior business consultant.',
    enthusiastic: 'Energetic and positive. Use emojis. Show genuine excitement about helping them grow.',
    consultative: 'Thoughtful and analytical. Ask insightful questions. Position yourself as a strategic advisor.',
  };

  const styleMap: Record<string, string> = {
    concise: 'Keep messages short — 2-4 sentences max. One idea per message. Never write long paragraphs.',
    detailed: 'Be thorough but not overwhelming. 3-5 sentences. Include specifics when helpful.',
    conversational: 'Write like a natural DM conversation. Short, punchy. Sometimes just one line.',
  };

  const servicesText = config.services.length > 0
    ? config.services.map(s => `- ${s.name}${s.price ? ` (${s.price})` : ''}${s.description ? `: ${s.description}` : ''}`).join('\n')
    : 'Digital marketing services for local businesses';

  const qualifyingQuestionsText = config.qualifying_questions.length > 0
    ? config.qualifying_questions.map((q, i) => `${i + 1}. ${q.question}${q.required ? ' (REQUIRED)' : ' (optional)'}`).join('\n')
    : '1. What treatments/services do you offer? (REQUIRED)\n2. What is your monthly marketing budget? (REQUIRED)\n3. Are you currently running any paid ads? (REQUIRED)\n4. What is your biggest challenge in getting new clients?\n5. When are you looking to get started?';

  const objectionsText = config.common_objections.length > 0
    ? config.common_objections.map(o => `If they say: "${o.objection}" → Respond with approach: ${o.response}`).join('\n')
    : `If they say "too expensive" → Reframe as ROI, share case study results
If they say "already have an agency" → Ask about current results, offer second opinion
If they say "not interested" → Acknowledge, leave door open, don't push
If they say "need to think about it" → Validate, offer to send more info, set follow-up
If they say "how did you find me" → Be honest: "I was researching [niche] businesses in your area"`;

  const leadContext = leadData
    ? `\n\nLEAD CONTEXT (use this to personalize):
- Business: ${leadData.business_name || 'Unknown'}
- Location: ${leadData.city || ''}, ${leadData.country || ''}
- Niche: ${leadData.niche || 'aesthetic clinic'}
- Website: ${leadData.website || 'none found'}
- Google Rating: ${leadData.google_rating || 'unknown'} (${leadData.google_review_count || 0} reviews)
- Has booking system: ${leadData.has_booking ? 'Yes' : 'No'}
- Running ads: ${leadData.ad_activity || 'unknown'}
- Instagram: ${leadData.instagram_url || 'unknown'}`
    : '';

  const qualifyingDataText = Object.keys(qualifyingData).length > 0
    ? `\n\nINFO ALREADY COLLECTED:\n${Object.entries(qualifyingData).map(([k, v]) => `- ${k}: ${v}`).join('\n')}`
    : '';

  return `You are ${config.agent_name}, ${config.agent_role} at ${config.company_name || 'a digital marketing agency'}.

COMPANY: ${config.company_description || 'We help aesthetic clinics and med spas get more clients through targeted digital advertising.'}

SERVICES:
${servicesText}

MAIN OFFER: ${config.main_offer || 'Free 30-minute strategy session'}
BOOKING LINK: ${config.booking_link || '[not configured]'}

TONE: ${toneMap[config.tone] || toneMap.professional_friendly}
STYLE: ${styleMap[config.response_style] || styleMap.concise}
${leadContext}
${qualifyingDataText}

═══ YOUR MISSION ═══
Your goal is to have a natural conversation that:
1. Builds rapport and trust
2. Qualifies the lead by gathering key information
3. Handles any objections naturally
4. Gets them to book a call/meeting

═══ QUALIFYING QUESTIONS (gather these naturally, don't ask all at once) ═══
${qualifyingQuestionsText}

You need at least ${config.min_qualifying_score} qualifying answers before suggesting a booking.

═══ OBJECTION HANDLING ═══
${objectionsText}

═══ CRITICAL RULES ═══
1. NEVER be pushy or salesy. Be genuinely helpful.
2. Ask ONE question at a time. Don't stack multiple questions.
3. Acknowledge what they say before asking the next question.
4. Use their business name and details naturally.
5. If they share a pain point, empathize FIRST, then offer your solution.
6. Don't share pricing unless they ask. Instead, offer a call to discuss custom solutions.
7. When they're qualified, transition naturally to booking: "I'd love to put together a custom strategy for you. Here's my calendar: [link]"
8. If they seem uninterested, gracefully exit: "No worries at all! If anything changes, feel free to reach out anytime."
9. If they ask something you can't answer, offer to have the team follow up.
10. NEVER reveal you are an AI. You are ${config.agent_name}, a real person on the team.
11. Keep messages SHORT — this is a DM conversation, not an email.
12. Match their energy and communication style.

═══ RESPONSE FORMAT ═══
Respond with ONLY the message text. No explanations, no metadata, no markdown formatting.
Write exactly what should be sent as a DM. Nothing else.`;
}

// Detect intent from the lead's message
function detectIntent(message: string): string {
  const lower = message.toLowerCase().trim();

  // Positive signals
  if (/\b(yes|yeah|yep|sure|absolutely|definitely|sounds good|interested|tell me more|love to|let'?s do it|sign me up|book|schedule|when can we|count me in)\b/.test(lower)) {
    return 'positive_interest';
  }
  // Booking intent
  if (/\b(book|schedule|calendar|appointment|call|meeting|free time|available|slot|when can)\b/.test(lower)) {
    return 'booking_request';
  }
  // Objection signals
  if (/\b(expensive|cost|price|afford|budget|too much|can'?t afford|not sure|think about|maybe later|already have|agency|not right now)\b/.test(lower)) {
    return 'objection';
  }
  // Not interested
  if (/\b(no thanks|not interested|stop|unsubscribe|don'?t contact|leave me alone|spam|scam|remove)\b/.test(lower)) {
    return 'not_interested';
  }
  // Question
  if (/\?$|\b(what|how|why|when|where|who|which|can you|do you|tell me|explain)\b/.test(lower)) {
    return 'question';
  }
  // Greeting
  if (/^(hi|hey|hello|yo|sup|good morning|good afternoon|good evening|thanks for reaching out)/i.test(lower)) {
    return 'greeting';
  }

  return 'general';
}

// Determine conversation status based on intent and current state
function determineNextStatus(currentStatus: string, intent: string, qualifyingScore: number, minScore: number): string {
  if (intent === 'not_interested') return 'closed_lost';
  if (intent === 'booking_request' && qualifyingScore >= minScore) return 'booking';
  if (intent === 'objection') return 'objection';
  if (intent === 'positive_interest' && qualifyingScore >= minScore) return 'booking';

  // Normal flow
  if (currentStatus === 'new' || currentStatus === 'greeting') return 'qualifying';
  if (currentStatus === 'qualifying' && qualifyingScore >= minScore) return 'booking';
  if (currentStatus === 'booking') return 'booking';
  if (currentStatus === 'objection' && intent === 'positive_interest') return 'qualifying';

  return currentStatus === 'new' ? 'greeting' : currentStatus;
}

// Extract qualifying info from the conversation using simple heuristics
function extractQualifyingInfo(message: string, existingData: Record<string, unknown>): Record<string, unknown> {
  const data = { ...existingData };
  const lower = message.toLowerCase();

  // Budget detection
  if (/\b(£|€|\$)\s*\d+/.test(message) || /\b\d+\s*(k|K|per month|monthly|a month|pm)\b/.test(message)) {
    const budgetMatch = message.match(/(£|€|\$)\s*[\d,]+(?:\s*[-–]\s*(£|€|\$)?\s*[\d,]+)?/);
    if (budgetMatch) data.budget = budgetMatch[0];
    const kMatch = message.match(/(\d+)\s*k/i);
    if (kMatch) data.budget = `£${kMatch[1]}k`;
  }

  // Treatment/service detection
  if (/\b(botox|filler|laser|skin|facial|body|hair removal|lip|anti-?aging|hydra|micro|peel|sculpt|tighten|fat freeze|cryo|ipl|prp|thread|mesotherapy|tattoo removal)\b/i.test(lower)) {
    const treatments = lower.match(/\b(botox|fillers?|laser|skin care|facials?|body contouring|hair removal|lip fillers?|anti-?aging|hydrafacials?|microneedling|chemical peels?|body sculpting|skin tightening|fat freeze|cryotherapy|ipl|prp|thread lifts?|mesotherapy|tattoo removal)\b/gi);
    if (treatments) data.treatments = [...new Set(treatments.map(t => t.trim()))].join(', ');
  }

  // Timeline detection
  if (/\b(asap|immediately|this week|this month|next month|soon|ready now|start now|right away|urgently)\b/i.test(lower)) {
    data.timeline = lower.match(/\b(asap|immediately|this week|this month|next month|soon|ready now|start now|right away|urgently)\b/i)?.[0] || 'soon';
  }

  // Current ads
  if (/\b(running ads|have ads|doing ads|facebook ads|instagram ads|google ads|currently advertising)\b/i.test(lower)) {
    data.current_ads = true;
  }
  if (/\b(no ads|not running|don'?t advertise|never tried|no marketing|not doing any)\b/i.test(lower)) {
    data.current_ads = false;
  }

  // Employee/team size
  if (/\b(\d+)\s*(staff|employees?|people|team members?|practitioners?|therapists?)\b/i.test(lower)) {
    const teamMatch = lower.match(/\b(\d+)\s*(staff|employees?|people|team members?|practitioners?|therapists?)\b/i);
    if (teamMatch) data.team_size = teamMatch[1];
  }

  return data;
}

// ═══ MAIN API HANDLER ═══
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;

    switch (action) {
      case 'process_message':
        return processMessage(body, request);
      case 'get_conversations':
        return getConversations(body);
      case 'get_conversation':
        return getConversation(body);
      case 'send_human_message':
        return sendHumanMessage(body);
      case 'update_status':
        return updateConversationStatus(body);
      case 'get_config':
        return getAgentConfig();
      case 'save_config':
        return saveAgentConfig(body);
      case 'get_templates':
        return getTemplates(body);
      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'AI conversation engine error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ═══ PROCESS INCOMING MESSAGE ═══
// This is the core brain — receives a message, generates AI reply
async function processMessage(body: Record<string, unknown>, request: NextRequest) {
  const {
    conversation_id,
    channel = 'instagram',
    channel_user_id,
    message_text,
    lead_id,
    lead_name,
    lead_business,
    sender_name,
  } = body;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 });
  }

  // 1. Get or create conversation
  let conversationId = conversation_id as string | undefined;
  let conversation: Record<string, unknown> | null = null;

  if (conversationId) {
    const { data } = await supabase.from('conversations').select('*').eq('id', conversationId).single();
    conversation = data;
  } else if (channel_user_id) {
    // Find existing conversation by channel user ID
    const { data } = await supabase
      .from('conversations')
      .select('*')
      .eq('channel_user_id', channel_user_id as string)
      .eq('channel', channel as string)
      .not('status', 'in', '("closed_won","closed_lost")')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    conversation = data;
    conversationId = data?.id as string | undefined;
  }

  if (!conversation) {
    // Create new conversation
    const { data: newConv, error: convErr } = await supabase.from('conversations').insert({
      lead_id: lead_id || null,
      lead_name: lead_name || sender_name || 'Unknown',
      lead_business: lead_business || '',
      channel: channel,
      channel_user_id: channel_user_id || null,
      status: 'new',
      total_messages: 0,
    }).select('*').single();

    if (convErr) throw new Error(`Failed to create conversation: ${convErr.message}`);
    conversation = newConv;
    conversationId = newConv?.id as string;
  }

  // 2. Save the incoming message
  const intent = detectIntent(message_text as string);

  await supabase.from('conversation_messages').insert({
    conversation_id: conversationId,
    role: 'lead',
    sender_name: sender_name || (conversation?.lead_name as string) || 'Lead',
    content: message_text,
    ai_intent_detected: intent,
  });

  // 3. Get agent config
  const { data: configData } = await supabase.from('ai_agent_config').select('*').limit(1).maybeSingle();
  const config: AgentConfig = {
    agent_name: (configData?.agent_name as string) || 'Sarah',
    agent_role: (configData?.agent_role as string) || 'Client Success Manager',
    company_name: (configData?.company_name as string) || '',
    company_description: (configData?.company_description as string) || '',
    services: (configData?.services as AgentConfig['services']) || [],
    main_offer: (configData?.main_offer as string) || 'Free 30-minute strategy session',
    qualifying_questions: (configData?.qualifying_questions as AgentConfig['qualifying_questions']) || [],
    min_qualifying_score: (configData?.min_qualifying_score as number) || 3,
    booking_link: (configData?.booking_link as string) || '',
    booking_type: (configData?.booking_type as string) || 'calendly',
    tone: (configData?.tone as string) || 'professional_friendly',
    response_style: (configData?.response_style as string) || 'concise',
    common_objections: (configData?.common_objections as AgentConfig['common_objections']) || [],
    max_messages_per_conversation: (configData?.max_messages_per_conversation as number) || 20,
    handoff_trigger: (configData?.handoff_trigger as string) || '',
  };

  // 4. Get lead data for context
  let leadData: Record<string, unknown> | null = null;
  const leadIdToUse = (conversation?.lead_id || lead_id) as string | undefined;
  if (leadIdToUse) {
    const { data } = await supabase.from('leads').select('*').eq('id', leadIdToUse).single();
    leadData = data;
  }

  // 5. Extract qualifying info from this message
  const existingQualData = (conversation?.qualifying_data as Record<string, unknown>) || {};
  const updatedQualData = extractQualifyingInfo(message_text as string, existingQualData);
  const qualifyingScore = Object.keys(updatedQualData).filter(k => updatedQualData[k] !== undefined && updatedQualData[k] !== null).length;
  const isQualified = qualifyingScore >= config.min_qualifying_score;

  // 6. Get conversation history for context
  const { data: historyData } = await supabase
    .from('conversation_messages')
    .select('role, content, ai_intent_detected')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
    .limit(30);

  const history: ConversationMessage[] = historyData || [];

  // 7. Determine next status
  const currentStatus = conversation?.status as string || 'new';
  const nextStatus = determineNextStatus(currentStatus, intent, qualifyingScore, config.min_qualifying_score);

  // 8. Check if we should auto-reply
  const totalMessages = (conversation?.total_messages as number || 0) + 1;

  if (intent === 'not_interested') {
    // Save status update, don't auto-reply aggressively
    await supabase.from('conversations').update({
      status: 'closed_lost',
      qualifying_data: updatedQualData,
      qualifying_score: qualifyingScore,
      total_messages: totalMessages,
      last_message_at: new Date().toISOString(),
      last_message_preview: (message_text as string).slice(0, 100),
      updated_at: new Date().toISOString(),
    }).eq('id', conversationId);

    // Still generate a graceful exit message
    const exitReply = `No worries at all! If anything changes in the future, feel free to reach out. Wishing you and ${(conversation?.lead_business as string) || 'your business'} all the best! 😊`;

    await supabase.from('conversation_messages').insert({
      conversation_id: conversationId,
      role: 'ai_agent',
      sender_name: config.agent_name,
      content: exitReply,
      ai_intent_detected: 'closing',
      ai_model: 'rule_based',
    });

    return NextResponse.json({
      success: true,
      conversation_id: conversationId,
      reply: exitReply,
      intent,
      status: 'closed_lost',
      should_send: true,
    });
  }

  // 9. Generate AI reply
  const claudeMessages = history.map(m => ({
    role: m.role === 'lead' ? 'user' as const : 'assistant' as const,
    content: m.content,
  }));

  // Add context hint for the AI about current state
  let contextHint = '';
  if (nextStatus === 'booking' && config.booking_link) {
    contextHint = `\n\n[INTERNAL NOTE: The lead appears qualified. Naturally transition to offering a call and share the booking link: ${config.booking_link}]`;
  } else if (nextStatus === 'objection') {
    contextHint = `\n\n[INTERNAL NOTE: The lead has raised an objection. Address it empathetically using the objection handling guidelines.]`;
  } else if (nextStatus === 'qualifying' || nextStatus === 'greeting') {
    const unanswered = config.qualifying_questions
      .filter(q => q.required)
      .filter(q => {
        const key = q.question.toLowerCase().replace(/[^a-z]/g, '_').slice(0, 30);
        return !updatedQualData[key];
      });
    if (unanswered.length > 0) {
      contextHint = `\n\n[INTERNAL NOTE: Still need to gather: ${unanswered.map(q => q.question).join(', ')}. Ask ONE naturally.]`;
    }
  }

  const systemPrompt = buildSystemPrompt(config, leadData, updatedQualData) + contextHint;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      system: systemPrompt,
      messages: claudeMessages,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Claude API error: ${res.status} — ${errText}`);
  }

  const claudeData = await res.json();
  const aiReply = claudeData.content?.[0]?.text || 'Sorry, I had trouble processing that. Let me get back to you!';

  // 10. Save AI reply
  await supabase.from('conversation_messages').insert({
    conversation_id: conversationId,
    role: 'ai_agent',
    sender_name: config.agent_name,
    content: aiReply,
    ai_model: 'claude-sonnet-4-20250514',
    ai_intent_detected: nextStatus === 'booking' ? 'booking_offer' : 'response',
  });

  // 11. Update conversation
  const bookingSentAt = nextStatus === 'booking' && config.booking_link ? new Date().toISOString() : (conversation?.booking_sent_at || null);
  const sentiment = intent === 'positive_interest' || intent === 'booking_request' ? 'positive'
    : intent === 'objection' ? 'neutral'
    : intent === 'not_interested' ? 'negative'
    : (conversation?.sentiment as string) || 'neutral';

  const priority = intent === 'booking_request' ? 'urgent'
    : intent === 'positive_interest' ? 'high'
    : isQualified ? 'high'
    : (conversation?.priority as string) || 'normal';

  await supabase.from('conversations').update({
    status: nextStatus,
    qualifying_data: updatedQualData,
    qualifying_score: qualifyingScore,
    is_qualified: isQualified,
    sentiment,
    priority,
    total_messages: totalMessages + 1,
    ai_messages_sent: ((conversation?.ai_messages_sent as number) || 0) + 1,
    last_message_at: new Date().toISOString(),
    last_message_preview: aiReply.slice(0, 100),
    booking_sent_at: bookingSentAt,
    updated_at: new Date().toISOString(),
  }).eq('id', conversationId);

  // 12. Update lead if linked
  if (leadIdToUse) {
    await supabase.from('leads').update({
      conversation_status: nextStatus,
      last_conversation_at: new Date().toISOString(),
      is_qualified: isQualified,
    }).eq('id', leadIdToUse);
  }

  return NextResponse.json({
    success: true,
    conversation_id: conversationId,
    reply: aiReply,
    intent,
    status: nextStatus,
    qualifying_score: qualifyingScore,
    is_qualified: isQualified,
    sentiment,
    priority,
    should_send: true,
  });
}

// ═══ GET CONVERSATIONS (Inbox) ═══
async function getConversations(body: Record<string, unknown>) {
  const { channel, status, search, limit = 50, offset = 0 } = body;

  let query = supabase
    .from('conversations')
    .select('*')
    .order('updated_at', { ascending: false })
    .range(offset as number, (offset as number) + (limit as number) - 1);

  if (channel && channel !== 'all') query = query.eq('channel', channel as string);
  if (status && status !== 'all') query = query.eq('status', status as string);
  if (search) {
    query = query.or(`lead_name.ilike.%${search}%,lead_business.ilike.%${search}%`);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  // Get counts by status
  const { data: statusCounts } = await supabase
    .from('conversations')
    .select('status')
    .not('status', 'in', '("closed_won","closed_lost")');

  const counts: Record<string, number> = {};
  (statusCounts || []).forEach((c: Record<string, unknown>) => {
    const s = c.status as string;
    counts[s] = (counts[s] || 0) + 1;
  });

  return NextResponse.json({
    success: true,
    conversations: data || [],
    counts,
  });
}

// ═══ GET SINGLE CONVERSATION WITH MESSAGES ═══
async function getConversation(body: Record<string, unknown>) {
  const { conversation_id } = body;
  if (!conversation_id) return NextResponse.json({ error: 'conversation_id required' }, { status: 400 });

  const { data: conversation } = await supabase
    .from('conversations')
    .select('*')
    .eq('id', conversation_id as string)
    .single();

  const { data: messages } = await supabase
    .from('conversation_messages')
    .select('*')
    .eq('conversation_id', conversation_id as string)
    .order('created_at', { ascending: true });

  return NextResponse.json({
    success: true,
    conversation,
    messages: messages || [],
  });
}

// ═══ SEND HUMAN MESSAGE (Override AI) ═══
async function sendHumanMessage(body: Record<string, unknown>) {
  const { conversation_id, content, sender_name = 'You' } = body;
  if (!conversation_id || !content) {
    return NextResponse.json({ error: 'conversation_id and content required' }, { status: 400 });
  }

  await supabase.from('conversation_messages').insert({
    conversation_id: conversation_id as string,
    role: 'human_agent',
    sender_name: sender_name as string,
    content: content as string,
  });

  // Read current counts, then increment + update in one call
  const { data: conv } = await supabase.from('conversations').select('human_messages_sent, total_messages').eq('id', conversation_id as string).single();
  await supabase.from('conversations').update({
    human_messages_sent: ((conv?.human_messages_sent as number) || 0) + 1,
    total_messages: ((conv?.total_messages as number) || 0) + 1,
    last_message_at: new Date().toISOString(),
    last_message_preview: (content as string).slice(0, 100),
    updated_at: new Date().toISOString(),
  }).eq('id', conversation_id as string);

  return NextResponse.json({ success: true });
}

// ═══ UPDATE CONVERSATION STATUS ═══
async function updateConversationStatus(body: Record<string, unknown>) {
  const { conversation_id, status, notes, booked_at } = body;
  if (!conversation_id || !status) {
    return NextResponse.json({ error: 'conversation_id and status required' }, { status: 400 });
  }

  const updateData: Record<string, unknown> = {
    status,
    updated_at: new Date().toISOString(),
  };
  if (notes !== undefined) updateData.notes = notes;
  if (booked_at) updateData.booked_at = booked_at;
  if (status === 'booked') updateData.booked_at = updateData.booked_at || new Date().toISOString();

  await supabase.from('conversations').update(updateData).eq('id', conversation_id as string);

  return NextResponse.json({ success: true });
}

// ═══ GET AGENT CONFIG ═══
async function getAgentConfig() {
  const { data } = await supabase.from('ai_agent_config').select('*').limit(1).maybeSingle();
  return NextResponse.json({ success: true, config: data || null });
}

// ═══ SAVE AGENT CONFIG ═══
async function saveAgentConfig(body: Record<string, unknown>) {
  const { config } = body;
  if (!config) return NextResponse.json({ error: 'config object required' }, { status: 400 });

  // Check if config exists
  const { data: existing } = await supabase.from('ai_agent_config').select('id').limit(1).maybeSingle();

  const configPayload = {
    ...(config as Record<string, unknown>),
    updated_at: new Date().toISOString(),
  };

  if (existing) {
    await supabase.from('ai_agent_config').update(configPayload).eq('id', existing.id);
  } else {
    await supabase.from('ai_agent_config').insert(configPayload);
  }

  return NextResponse.json({ success: true });
}

// ═══ GET TEMPLATES ═══
async function getTemplates(body: Record<string, unknown>) {
  const { category, channel } = body;
  let query = supabase.from('conversation_templates').select('*').eq('is_active', true).order('usage_count', { ascending: false });
  if (category && category !== 'all') query = query.eq('category', category as string);
  if (channel && channel !== 'all') query = query.or(`channel.eq.all,channel.eq.${channel}`);

  const { data } = await query;
  return NextResponse.json({ success: true, templates: data || [] });
}
