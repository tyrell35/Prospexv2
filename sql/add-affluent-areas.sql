-- ============================================================
-- PROSPEX V3 — AFFLUENT AREAS + PLAYBOOKS + SLACK
-- Run this in Supabase → SQL Editor
-- ============================================================

-- ─── AFFLUENT AREAS TABLE ──────────────────────────────────
create table if not exists public.affluent_areas (
  id uuid default uuid_generate_v4() primary key,
  area_name text not null,
  city text not null,
  country text not null check (country in ('UK', 'US', 'CA')),
  region text,
  affluent_tier integer check (affluent_tier in (1, 2, 3)),
  search_term_1 text not null,
  search_term_2 text,
  search_term_3 text,
  latitude numeric(10, 6),
  longitude numeric(10, 6),
  scan_priority integer default 3,
  last_scanned timestamptz,
  times_scanned integer default 0,
  total_prospects_found integer default 0,
  qualified_prospects_found integer default 0,
  active boolean default true,
  created_at timestamptz default now()
);

create index if not exists idx_affluent_areas_country on public.affluent_areas(country);
create index if not exists idx_affluent_areas_active on public.affluent_areas(active);
create index if not exists idx_affluent_areas_last_scanned on public.affluent_areas(last_scanned);
create index if not exists idx_affluent_areas_scan_priority on public.affluent_areas(scan_priority);

alter table public.affluent_areas enable row level security;
create policy "Allow all on affluent_areas" on public.affluent_areas for all using (true) with check (true);

-- ─── ADD PLAYBOOK FIELDS TO LEADS TABLE ────────────────────
alter table public.leads add column if not exists playbook_status text default 'none' check (playbook_status in ('none', 'generating', 'ready', 'sent'));
alter table public.leads add column if not exists playbook_pdf_url text;
alter table public.leads add column if not exists playbook_text text;
alter table public.leads add column if not exists outreach_email_subject text;
alter table public.leads add column if not exists outreach_email_body text;
alter table public.leads add column if not exists outreach_dm_text text;
alter table public.leads add column if not exists qualification_score integer;
alter table public.leads add column if not exists revenue_leak_estimate text;
alter table public.leads add column if not exists area_source text;
alter table public.leads add column if not exists slack_posted boolean default false;
alter table public.leads add column if not exists auto_email_sent boolean default false;
alter table public.leads add column if not exists niche text;
alter table public.leads add column if not exists instagram_handle text;
alter table public.leads add column if not exists instagram_verified boolean default false;
alter table public.leads add column if not exists whatsapp_eligible boolean default false;
alter table public.leads add column if not exists phone_type text;
alter table public.leads add column if not exists phone_formatted text;
alter table public.leads add column if not exists contact_quality_score integer default 0;
alter table public.leads add column if not exists ad_detection_data jsonb;
alter table public.leads add column if not exists ad_score integer;

-- ─── PLAYBOOKS TABLE ───────────────────────────────────────
create table if not exists public.playbooks (
  id uuid default uuid_generate_v4() primary key,
  lead_id uuid references public.leads(id) on delete cascade not null,
  content text not null,
  pdf_url text,
  email_subject text,
  email_body text,
  follow_up_email text,
  dm_text text,
  short_dm_text text,
  revenue_leak text,
  growth_score integer,
  recommended_tier text,
  status text default 'draft' check (status in ('draft', 'ready', 'sent', 'delivered', 'call_booked', 'closed')),
  sent_at timestamptz,
  opened_at timestamptz,
  call_booked_at timestamptz,
  created_at timestamptz default now()
);

create index if not exists idx_playbooks_lead_id on public.playbooks(lead_id);
create index if not exists idx_playbooks_status on public.playbooks(status);
alter table public.playbooks enable row level security;
create policy "Allow all on playbooks" on public.playbooks for all using (true) with check (true);

-- ─── SCAN SCHEDULE TABLE ───────────────────────────────────
create table if not exists public.scan_schedule (
  id uuid default uuid_generate_v4() primary key,
  scan_date date not null,
  area_ids uuid[] not null,
  status text default 'pending' check (status in ('pending', 'running', 'complete', 'error')),
  leads_found integer default 0,
  qualified_leads integer default 0,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz default now()
);

alter table public.scan_schedule enable row level security;
create policy "Allow all on scan_schedule" on public.scan_schedule for all using (true) with check (true);

-- ─── ADD SLACK FIELDS TO SETTINGS TABLE ────────────────────
alter table public.settings add column if not exists slack_webhook_url text;
alter table public.settings add column if not exists slack_channel_name text;
alter table public.settings add column if not exists slack_auto_post_leads boolean default false;
alter table public.settings add column if not exists slack_auto_post_playbooks boolean default false;
alter table public.settings add column if not exists anthropic_key text;
