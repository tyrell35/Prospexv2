-- ============================================================
-- PROSPEX V2 DATABASE SCHEMA
-- Paste this into Supabase → SQL Editor → Run
-- If upgrading from V1, only run the new tables at the bottom
-- ============================================================

create extension if not exists "uuid-ossp";

-- ─── LEADS TABLE ─────────────────────────────────────────────
create table if not exists public.leads (
  id uuid default uuid_generate_v4() primary key,
  business_name text not null,
  address text,
  city text,
  country text,
  phone text,
  email text,
  website text,
  instagram_url text,
  google_rating numeric(2,1),
  google_review_count integer,
  google_maps_url text,
  source text not null default 'google_maps' check (source in ('google_maps', 'yelp', 'fresha')),
  lead_score integer,
  lead_grade text,
  lead_priority text check (lead_priority in ('hot', 'warm', 'cold')),
  audit_score integer,
  audit_status text check (audit_status in ('pending', 'running', 'complete', 'error')),
  audit_data jsonb,
  deep_audit_score integer,
  deep_audit_status text check (deep_audit_status in ('pending', 'running', 'complete', 'error')),
  ghl_contact_id text,
  ghl_pushed_at timestamptz,
  search_id uuid,
  pipeline_stage text default 'new' check (pipeline_stage in ('new', 'contacted', 'pitched', 'booked', 'closed', 'lost')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ─── AUDITS TABLE ────────────────────────────────────────────
create table if not exists public.audits (
  id uuid default uuid_generate_v4() primary key,
  lead_id uuid references public.leads(id) on delete cascade not null,
  ssl_check boolean,
  mobile_score integer,
  speed_score integer,
  has_social_media boolean,
  has_click_to_call boolean,
  has_video boolean,
  has_chatbot boolean,
  has_booking boolean,
  has_meta_description boolean,
  has_h1 boolean,
  has_analytics boolean,
  has_schema boolean,
  overall_score integer,
  raw_data jsonb,
  created_at timestamptz default now()
);

-- ─── DEEP AUDITS TABLE ──────────────────────────────────────
create table if not exists public.deep_audits (
  id uuid default uuid_generate_v4() primary key,
  lead_id uuid references public.leads(id) on delete cascade not null,
  overall_score integer,
  seo_score integer,
  competitor_score integer,
  reviews_score integer,
  ai_visibility_score integer,
  seo_data jsonb,
  competitor_data jsonb,
  reviews_data jsonb,
  ai_visibility_data jsonb,
  status text default 'pending' check (status in ('pending', 'running', 'complete', 'error')),
  created_at timestamptz default now()
);

-- ─── SETTINGS TABLE ──────────────────────────────────────────
create table if not exists public.settings (
  id uuid default uuid_generate_v4() primary key,
  outscraper_key text,
  apify_key text,
  firecrawl_key text,
  openai_key text,
  ghl_key text,
  ghl_location_id text,
  dataforseo_login text,
  dataforseo_password text,
  agency_name text,
  agency_email text,
  agency_phone text,
  agency_website text,
  agency_logo_url text,
  calendar_type text default 'calendly' check (calendar_type in ('calendly', 'ghl', 'calcom', 'other')),
  calendar_url text,
  default_niche text,
  default_location text,
  default_country text default 'United Kingdom',
  ghl_pipeline_id text,
  updated_at timestamptz default now()
);

-- ─── ACTIVITY LOG TABLE ──────────────────────────────────────
create table if not exists public.activity_log (
  id uuid default uuid_generate_v4() primary key,
  action_type text not null check (action_type in ('scrape', 'audit', 'deep_audit', 'ghl_push', 'export', 'score', 'pitch')),
  description text not null,
  lead_id uuid references public.leads(id) on delete set null,
  metadata jsonb,
  created_at timestamptz default now()
);

-- ─── SEARCH HISTORY TABLE (NEW V2) ──────────────────────────
create table if not exists public.search_history (
  id uuid default uuid_generate_v4() primary key,
  niche text not null,
  location text not null,
  country text,
  source text not null,
  results_count integer default 0,
  saved_count integer default 0,
  created_at timestamptz default now()
);

-- ─── PITCHES TABLE (NEW V2) ─────────────────────────────────
create table if not exists public.pitches (
  id uuid default uuid_generate_v4() primary key,
  lead_id uuid references public.leads(id) on delete cascade not null,
  deep_audit_id uuid references public.deep_audits(id) on delete set null,
  pitch_type text not null check (pitch_type in ('seo', 'reviews', 'ai_visibility', 'competitor', 'comprehensive')),
  title text not null,
  content jsonb not null,
  agency_name text,
  agency_email text,
  agency_phone text,
  agency_website text,
  agency_logo_url text,
  calendar_type text,
  calendar_url text,
  status text default 'draft' check (status in ('draft', 'sent', 'viewed')),
  view_count integer default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ─── INDEXES ─────────────────────────────────────────────────
create index if not exists idx_leads_source on public.leads(source);
create index if not exists idx_leads_lead_score on public.leads(lead_score);
create index if not exists idx_leads_lead_priority on public.leads(lead_priority);
create index if not exists idx_leads_created_at on public.leads(created_at);
create index if not exists idx_leads_business_name on public.leads(business_name);
create index if not exists idx_leads_search_id on public.leads(search_id);
create index if not exists idx_audits_lead_id on public.audits(lead_id);
create index if not exists idx_deep_audits_lead_id on public.deep_audits(lead_id);
create index if not exists idx_activity_log_lead_id on public.activity_log(lead_id);
create index if not exists idx_activity_log_created_at on public.activity_log(created_at);
create index if not exists idx_search_history_created_at on public.search_history(created_at);
create index if not exists idx_pitches_lead_id on public.pitches(lead_id);

-- ─── ROW LEVEL SECURITY ─────────────────────────────────────
alter table public.leads enable row level security;
alter table public.audits enable row level security;
alter table public.deep_audits enable row level security;
alter table public.settings enable row level security;
alter table public.activity_log enable row level security;
alter table public.search_history enable row level security;
alter table public.pitches enable row level security;

create policy "Allow all on leads" on public.leads for all using (true) with check (true);
create policy "Allow all on audits" on public.audits for all using (true) with check (true);
create policy "Allow all on deep_audits" on public.deep_audits for all using (true) with check (true);
create policy "Allow all on settings" on public.settings for all using (true) with check (true);
create policy "Allow all on activity_log" on public.activity_log for all using (true) with check (true);
create policy "Allow all on search_history" on public.search_history for all using (true) with check (true);
create policy "Allow all on pitches" on public.pitches for all using (true) with check (true);
