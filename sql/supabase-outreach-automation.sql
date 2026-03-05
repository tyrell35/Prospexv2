-- ═══════════════════════════════════════════════════════════════════
-- PROSPEX V3.1 — AI OUTREACH AUTOMATION ENGINE
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New Query)
-- Builds on top of existing email outreach tables from V2.9
-- ═══════════════════════════════════════════════════════════════════

-- 1. OUTREACH SEQUENCES (Multi-channel sequence definitions)
-- Extends email campaigns to support Instagram, LinkedIn, WhatsApp, SMS
CREATE TABLE IF NOT EXISTS outreach_sequences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  name TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'paused', 'completed', 'archived')),
  
  -- Channel: which platform this sequence targets
  channel TEXT NOT NULL DEFAULT 'email'
    CHECK (channel IN ('email', 'instagram', 'linkedin', 'whatsapp', 'sms', 'multi')),
  
  -- Targeting
  niche TEXT,
  target_description TEXT,
  
  -- Schedule
  send_window_start INTEGER DEFAULT 9,
  send_window_end INTEGER DEFAULT 17,
  send_timezone TEXT DEFAULT 'Europe/London',
  send_days TEXT[] DEFAULT ARRAY['mon','tue','wed','thu','fri'],
  
  -- Sequence steps (JSONB array of step definitions)
  -- Each step: { step_number, delay_days, channel, message_template, 
  --              subject (email only), is_ai_personalized, ai_prompt,
  --              condition (optional: "if_no_reply", "if_opened", "always") }
  steps JSONB DEFAULT '[]'::jsonb,
  
  -- AI Personalization settings
  ai_personalization_enabled BOOLEAN DEFAULT true,
  ai_tone TEXT DEFAULT 'professional_friendly'
    CHECK (ai_tone IN ('professional_friendly', 'casual', 'formal', 'bold', 'empathetic')),
  ai_context TEXT, -- Extra context for AI personalization (e.g. "focus on their ad weaknesses")
  
  -- Stats (denormalized for quick display)
  total_enrolled INTEGER DEFAULT 0,
  total_sent INTEGER DEFAULT 0,
  total_replied INTEGER DEFAULT 0,
  total_booked INTEGER DEFAULT 0,
  reply_rate NUMERIC(5,2) DEFAULT 0,
  booking_rate NUMERIC(5,2) DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_sequences_status ON outreach_sequences(status);
CREATE INDEX IF NOT EXISTS idx_sequences_channel ON outreach_sequences(channel);
ALTER TABLE outreach_sequences DISABLE ROW LEVEL SECURITY;


-- 2. SEQUENCE ENROLLMENTS (Which leads are in which sequences)
CREATE TABLE IF NOT EXISTS sequence_enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  -- Links
  sequence_id UUID NOT NULL REFERENCES outreach_sequences(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  
  -- Contact info (denormalized for sending)
  business_name TEXT,
  contact_name TEXT,
  contact_handle TEXT, -- IG handle, LinkedIn URL, WhatsApp number, or email
  channel TEXT NOT NULL DEFAULT 'email',
  
  -- Personalization context
  personalization_data JSONB DEFAULT '{}'::jsonb,
  -- ^ Includes: audit scores, ad data, weaknesses, website issues, etc.
  
  -- Progress tracking
  current_step INTEGER DEFAULT 0,
  status TEXT DEFAULT 'queued'
    CHECK (status IN ('queued', 'active', 'waiting_reply', 'replied', 'booked',
                      'not_interested', 'objection', 'ghosted', 'completed', 'paused', 'removed')),
  
  -- Timing
  enrolled_at TIMESTAMPTZ DEFAULT now(),
  last_sent_at TIMESTAMPTZ,
  next_send_at TIMESTAMPTZ,
  replied_at TIMESTAMPTZ,
  booked_at TIMESTAMPTZ,
  
  -- AI-generated messages for each step (stored after generation)
  generated_messages JSONB DEFAULT '[]'::jsonb,
  -- ^ Array of { step_number, message, subject, generated_at, sent: bool }
  
  -- Intent from reply detection
  reply_intent TEXT,
  reply_confidence NUMERIC(5,2),
  
  UNIQUE(sequence_id, lead_id)
);

CREATE INDEX IF NOT EXISTS idx_enrollments_sequence ON sequence_enrollments(sequence_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_lead ON sequence_enrollments(lead_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_status ON sequence_enrollments(status);
CREATE INDEX IF NOT EXISTS idx_enrollments_next_send ON sequence_enrollments(next_send_at);
ALTER TABLE sequence_enrollments DISABLE ROW LEVEL SECURITY;


-- 3. CONVERSATIONS (Unified message threads across all channels)
CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  -- Links
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  enrollment_id UUID REFERENCES sequence_enrollments(id) ON DELETE SET NULL,
  
  -- Participants
  business_name TEXT,
  contact_name TEXT,
  contact_handle TEXT,
  channel TEXT NOT NULL DEFAULT 'email'
    CHECK (channel IN ('email', 'instagram', 'linkedin', 'whatsapp', 'sms', 'ghl')),
  
  -- Thread status
  status TEXT DEFAULT 'active'
    CHECK (status IN ('active', 'waiting_reply', 'replied', 'ai_handling', 
                      'needs_human', 'booked', 'closed', 'archived')),
  
  -- Intent detection
  latest_intent TEXT DEFAULT 'unknown'
    CHECK (latest_intent IN ('positive_interest', 'pricing_inquiry', 'objection',
                              'not_interested', 'question', 'booking_ready',
                              'spam', 'unknown')),
  intent_confidence NUMERIC(5,2) DEFAULT 0,
  
  -- Messages (JSONB array for fast rendering)
  -- Each: { id, direction: "inbound"|"outbound", content, timestamp, 
  --         sender, channel, is_ai_generated, intent, read: bool }
  messages JSONB DEFAULT '[]'::jsonb,
  message_count INTEGER DEFAULT 0,
  
  -- Lead context (denormalized for the conversation view)
  lead_score INTEGER,
  lead_priority TEXT,
  pipeline_stage TEXT,
  
  -- AI handling
  ai_handling_active BOOLEAN DEFAULT false,
  ai_handler_context JSONB DEFAULT '{}'::jsonb,
  
  -- Timestamps
  last_inbound_at TIMESTAMPTZ,
  last_outbound_at TIMESTAMPTZ,
  last_activity_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_conversations_lead ON conversations(lead_id);
CREATE INDEX IF NOT EXISTS idx_conversations_status ON conversations(status);
CREATE INDEX IF NOT EXISTS idx_conversations_intent ON conversations(latest_intent);
CREATE INDEX IF NOT EXISTS idx_conversations_channel ON conversations(channel);
CREATE INDEX IF NOT EXISTS idx_conversations_activity ON conversations(last_activity_at DESC);
ALTER TABLE conversations DISABLE ROW LEVEL SECURITY;


-- 4. AI CONVERSATIONS (AI qualifier exchanges and outcomes)
CREATE TABLE IF NOT EXISTS ai_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  -- Links
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  enrollment_id UUID REFERENCES sequence_enrollments(id) ON DELETE SET NULL,
  
  -- AI config
  qualifier_type TEXT DEFAULT 'standard'
    CHECK (qualifier_type IN ('standard', 'aggressive', 'nurture', 'custom')),
  qualifying_questions JSONB DEFAULT '[]'::jsonb,
  -- ^ Array of { question, purpose, follow_up_if_positive, follow_up_if_negative }
  
  -- Exchange log
  exchanges JSONB DEFAULT '[]'::jsonb,
  -- ^ Array of { role: "ai"|"prospect", content, timestamp, intent_detected }
  exchange_count INTEGER DEFAULT 0,
  
  -- Outcome
  status TEXT DEFAULT 'active'
    CHECK (status IN ('active', 'qualifying', 'qualified', 'not_qualified', 
                      'booked', 'handed_to_human', 'abandoned', 'error')),
  
  -- Qualification results
  qualification_score INTEGER DEFAULT 0,
  qualification_data JSONB DEFAULT '{}'::jsonb,
  -- ^ { budget_confirmed, timeline, services_interested, objections, pain_points }
  
  -- Booking
  booking_offered BOOLEAN DEFAULT false,
  booking_link_sent BOOLEAN DEFAULT false,
  booking_confirmed BOOLEAN DEFAULT false,
  booking_datetime TIMESTAMPTZ,
  
  -- Handoff
  handed_to_human_at TIMESTAMPTZ,
  handoff_reason TEXT,
  human_notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_ai_convos_conversation ON ai_conversations(conversation_id);
CREATE INDEX IF NOT EXISTS idx_ai_convos_lead ON ai_conversations(lead_id);
CREATE INDEX IF NOT EXISTS idx_ai_convos_status ON ai_conversations(status);
ALTER TABLE ai_conversations DISABLE ROW LEVEL SECURITY;


-- 5. AUTOMATION RULES (Trigger → Action rules engine)
CREATE TABLE IF NOT EXISTS automation_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  priority INTEGER DEFAULT 50, -- Higher = runs first (0-100)
  
  -- Trigger definition
  trigger_type TEXT NOT NULL
    CHECK (trigger_type IN (
      'reply_received',        -- Any reply comes in
      'intent_detected',       -- Specific intent classified
      'lead_score_changed',    -- Lead score crosses threshold
      'enrollment_step_completed', -- Sequence step sent
      'booking_confirmed',     -- AI qualifier books call
      'no_reply_timeout',      -- No reply after X days
      'pipeline_stage_changed', -- Lead moved in pipeline
      'manual'                 -- Triggered manually
    )),
  trigger_conditions JSONB DEFAULT '{}'::jsonb,
  -- ^ { intent: "positive_interest", min_score: 70, channel: "instagram", 
  --     timeout_days: 3, pipeline_stage: "contacted", etc. }
  
  -- Action definition
  action_type TEXT NOT NULL
    CHECK (action_type IN (
      'activate_ai_qualifier',  -- Start AI conversation
      'send_sequence_message',  -- Send next step or custom message
      'move_pipeline',          -- Move lead to pipeline stage
      'update_lead_status',     -- Update lead priority/status
      'push_to_ghl',            -- Push to GHL with notes
      'send_slack_alert',       -- Alert team via Slack webhook
      'enroll_in_sequence',     -- Add to another sequence
      'pause_sequence',         -- Pause current enrollment
      'create_task',            -- Create follow-up task
      'tag_lead'                -- Add tags to lead
    )),
  action_config JSONB DEFAULT '{}'::jsonb,
  -- ^ { qualifier_type: "standard", pipeline_stage: "booked", 
  --     slack_webhook: "https://...", ghl_tags: ["hot-lead"], etc. }
  
  -- Stats
  times_fired INTEGER DEFAULT 0,
  last_fired_at TIMESTAMPTZ,
  
  -- Logs (last 50 executions)
  execution_log JSONB DEFAULT '[]'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_rules_active ON automation_rules(is_active);
CREATE INDEX IF NOT EXISTS idx_rules_trigger ON automation_rules(trigger_type);
ALTER TABLE automation_rules DISABLE ROW LEVEL SECURITY;


-- 6. WEBHOOK LOGS (Incoming webhooks from GHL, ManyChat, HeyReach)
CREATE TABLE IF NOT EXISTS webhook_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT now(),
  
  source TEXT NOT NULL
    CHECK (source IN ('ghl', 'manychat', 'heyreach', 'custom', 'internal')),
  event_type TEXT NOT NULL,
  
  -- Raw payload
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  
  -- Processing
  processed BOOLEAN DEFAULT false,
  processed_at TIMESTAMPTZ,
  processing_result JSONB DEFAULT '{}'::jsonb,
  error_message TEXT,
  
  -- Links (populated during processing)
  lead_id UUID,
  conversation_id UUID,
  enrollment_id UUID
);

CREATE INDEX IF NOT EXISTS idx_webhooks_source ON webhook_logs(source);
CREATE INDEX IF NOT EXISTS idx_webhooks_processed ON webhook_logs(processed);
CREATE INDEX IF NOT EXISTS idx_webhooks_created ON webhook_logs(created_at DESC);
ALTER TABLE webhook_logs DISABLE ROW LEVEL SECURITY;


-- Done! 6 new tables created:
-- outreach_sequences, sequence_enrollments, conversations, 
-- ai_conversations, automation_rules, webhook_logs