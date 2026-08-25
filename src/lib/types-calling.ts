// Shape returned by /api/call-pipeline get_pipeline. Kept separate from the
// full Lead type in types.ts because the call views select a narrow slice.

export interface CallLead {
  id: string;
  business_name: string;
  niche: string | null;
  city: string | null;
  county: string | null;
  country: string | null;
  country_code: string | null;
  state_code: string | null;
  timezone: string | null;
  address: string | null;

  phone: string | null;
  phone_formatted: string | null;
  email: string | null;
  website: string | null;
  instagram_url: string | null;
  instagram_handle: string | null;

  google_rating: number | null;
  google_review_count: number | null;
  lead_score: number | null;
  lead_priority: 'hot' | 'warm' | 'cold' | null;
  estimated_monthly_loss: number | null;

  owner_name: string | null;
  owner_first_name: string | null;
  owner_role: string | null;
  owner_source: string | null;
  owner_confidence: string | null;
  owner_enriched_at: string | null;

  call_stage: string | null;
  call_outcome: string | null;
  call_attempts: number | null;
  first_call_at: string | null;
  last_call_at: string | null;
  next_call_at: string | null;
  callback_at: string | null;
  call_notes: string | null;
  call_assigned_to: string | null;
  call_booked_at: string | null;
  do_not_call: boolean | null;
  dnc_reason: string | null;
  gatekeeper_name: string | null;

  // Instagram-channel state, shown read-only so a caller can see whether
  // this lead has already been DM'd before they open with a cold intro.
  outreach_status: string | null;
  responded_at: string | null;
  ghl_contact_id: string | null;
  ghl_location_id: string | null;
}

export interface CallStats {
  by_stage: Record<string, number>;
  total_dialled: number;
  calls_30d: number;
  calls_today: number;
  contact_rate: number;
  owner_reach_rate: number;
  booked_30d: number;
  book_rate: number;
}

export interface CallFilterOptions {
  countries: Array<{ code: string; label: string }>;
  cities: string[];
  cities_by_country: Record<string, string[]>;
  counties: string[];
  niches: string[];
  timezones: string[];
  assignees: string[];
  team: Array<{ email: string; full_name: string | null }>;
  ghl_accounts: Array<{
    key: string; label: string; short: string; emoji: string;
    countries: string[]; configured: boolean;
  }>;
}
