// ─── V3 TYPES — Affluent Areas, Playbooks, Slack ─────────────

export interface AffluentArea {
  id: string;
  area_name: string;
  city: string;
  country: 'UK' | 'US' | 'CA';
  region: string | null;
  affluent_tier: 1 | 2 | 3;
  search_term_1: string;
  search_term_2: string | null;
  search_term_3: string | null;
  latitude: number | null;
  longitude: number | null;
  scan_priority: number;
  last_scanned: string | null;
  times_scanned: number;
  total_prospects_found: number;
  qualified_prospects_found: number;
  active: boolean;
  created_at: string;
}

export interface Playbook {
  id: string;
  lead_id: string;
  content: string;
  pdf_url: string | null;
  email_subject: string | null;
  email_body: string | null;
  follow_up_email: string | null;
  dm_text: string | null;
  short_dm_text: string | null;
  revenue_leak: string | null;
  growth_score: number | null;
  recommended_tier: string | null;
  status: 'draft' | 'ready' | 'sent' | 'delivered' | 'call_booked' | 'closed';
  sent_at: string | null;
  opened_at: string | null;
  call_booked_at: string | null;
  created_at: string;
}

export interface ScanSchedule {
  id: string;
  scan_date: string;
  area_ids: string[];
  status: 'pending' | 'running' | 'complete' | 'error';
  leads_found: number;
  qualified_leads: number;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface ScanResult {
  areas_scanned: number;
  total_found: number;
  qualified: number;
  duplicates_skipped: number;
  areas: { area_name: string; found: number; qualified: number }[];
}
