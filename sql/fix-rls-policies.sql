-- ═══════════════════════════════════════════════════════════════
-- SECURITY FIX: Replace "Allow all" RLS policies with proper
-- user-scoped policies tied to authenticated users.
--
-- Run this in the Supabase SQL Editor.
-- ═══════════════════════════════════════════════════════════════

-- ─── 1. Drop the insecure "Allow all" policies ──────────────

DROP POLICY IF EXISTS "Allow all on leads" ON public.leads;
DROP POLICY IF EXISTS "Allow all on audits" ON public.audits;
DROP POLICY IF EXISTS "Allow all on deep_audits" ON public.deep_audits;
DROP POLICY IF EXISTS "Allow all on settings" ON public.settings;
DROP POLICY IF EXISTS "Allow all on activity_log" ON public.activity_log;
DROP POLICY IF EXISTS "Allow all on search_history" ON public.search_history;
DROP POLICY IF EXISTS "Allow all on pitches" ON public.pitches;

-- ─── 2. Create proper authenticated-user policies ───────────
-- These allow any authenticated user (team member) to CRUD.
-- For tighter control, replace `auth.role() = 'authenticated'`
-- with a check against the team_members table.

-- LEADS
CREATE POLICY "Authenticated users can read leads"
  ON public.leads FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can insert leads"
  ON public.leads FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can update leads"
  ON public.leads FOR UPDATE
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can delete leads"
  ON public.leads FOR DELETE
  USING (auth.role() = 'authenticated');

-- AUDITS
CREATE POLICY "Authenticated users can read audits"
  ON public.audits FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can insert audits"
  ON public.audits FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can update audits"
  ON public.audits FOR UPDATE
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can delete audits"
  ON public.audits FOR DELETE
  USING (auth.role() = 'authenticated');

-- DEEP AUDITS
CREATE POLICY "Authenticated users can read deep_audits"
  ON public.deep_audits FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can insert deep_audits"
  ON public.deep_audits FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can update deep_audits"
  ON public.deep_audits FOR UPDATE
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can delete deep_audits"
  ON public.deep_audits FOR DELETE
  USING (auth.role() = 'authenticated');

-- SETTINGS
CREATE POLICY "Authenticated users can read settings"
  ON public.settings FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can insert settings"
  ON public.settings FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can update settings"
  ON public.settings FOR UPDATE
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can delete settings"
  ON public.settings FOR DELETE
  USING (auth.role() = 'authenticated');

-- ACTIVITY LOG
CREATE POLICY "Authenticated users can read activity_log"
  ON public.activity_log FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can insert activity_log"
  ON public.activity_log FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- SEARCH HISTORY
CREATE POLICY "Authenticated users can read search_history"
  ON public.search_history FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can insert search_history"
  ON public.search_history FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can delete search_history"
  ON public.search_history FOR DELETE
  USING (auth.role() = 'authenticated');

-- PITCHES
CREATE POLICY "Authenticated users can read pitches"
  ON public.pitches FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can insert pitches"
  ON public.pitches FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can update pitches"
  ON public.pitches FOR UPDATE
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can delete pitches"
  ON public.pitches FOR DELETE
  USING (auth.role() = 'authenticated');

-- ─── 3. Re-enable RLS on outreach tables ────────────────────

ALTER TABLE outreach_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE sequence_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_logs ENABLE ROW LEVEL SECURITY;

-- Outreach tables: authenticated access only
CREATE POLICY "Authenticated access" ON outreach_sequences
  FOR ALL USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated access" ON sequence_enrollments
  FOR ALL USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated access" ON conversations
  FOR ALL USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated access" ON ai_conversations
  FOR ALL USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated access" ON automation_rules
  FOR ALL USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated access" ON webhook_logs
  FOR ALL USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- ─── 4. Grant service_role bypass for API routes ────────────
-- The service_role key (used server-side only) bypasses RLS by default.
-- This ensures cron jobs and server-side API routes still work.

-- ═══════════════════════════════════════════════════════════════
-- DONE. All tables now require an authenticated Supabase session.
-- Anonymous/unauthenticated access is fully blocked.
-- Server-side routes using the service_role key still have full access.
-- ═══════════════════════════════════════════════════════════════
