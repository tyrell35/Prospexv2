export interface Lead {
  id: string;
  business_name: string;
  address: string | null;
  city: string | null;
  country: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  instagram_url: string | null;
  google_rating: number | null;
  google_review_count: number | null;
  google_maps_url: string | null;
  source: 'google_maps' | 'yelp' | 'fresha';
  lead_score: number | null;
  lead_grade: string | null;
  lead_priority: 'hot' | 'warm' | 'cold' | null;
  audit_score: number | null;
  audit_status: 'pending' | 'running' | 'complete' | 'error' | null;
  audit_data: AuditData | null;
  deep_audit_score: number | null;
  deep_audit_status: 'pending' | 'running' | 'complete' | 'error' | null;
  ghl_contact_id: string | null;
  ghl_pushed_at: string | null;
  search_id: string | null;
  pipeline_stage: 'new' | 'contacted' | 'pitched' | 'booked' | 'closed' | 'lost';
  created_at: string;
  updated_at: string;
}

export interface AuditData {
  ssl_check: boolean | null;
  mobile_score: number | null;
  speed_score: number | null;
  has_social_media: boolean | null;
  has_click_to_call: boolean | null;
  has_video: boolean | null;
  has_chatbot: boolean | null;
  has_booking: boolean | null;
  has_meta_description: boolean | null;
  has_h1: boolean | null;
  has_analytics: boolean | null;
  has_schema: boolean | null;
  overall_score: number | null;
}

export interface Audit {
  id: string;
  lead_id: string;
  ssl_check: boolean | null;
  mobile_score: number | null;
  speed_score: number | null;
  has_social_media: boolean | null;
  has_click_to_call: boolean | null;
  has_video: boolean | null;
  has_chatbot: boolean | null;
  has_booking: boolean | null;
  has_meta_description: boolean | null;
  has_h1: boolean | null;
  has_analytics: boolean | null;
  has_schema: boolean | null;
  overall_score: number | null;
  raw_data: Record<string, unknown> | null;
  created_at: string;
}

export interface DeepAudit {
  id: string;
  lead_id: string;
  overall_score: number | null;
  seo_score: number | null;
  competitor_score: number | null;
  reviews_score: number | null;
  ai_visibility_score: number | null;
  seo_data: SEOData | null;
  competitor_data: CompetitorData[] | null;
  reviews_data: ReviewsData | null;
  ai_visibility_data: AIVisibilityData | null;
  status: 'pending' | 'running' | 'complete' | 'error';
  created_at: string;
}

export interface SEOData {
  keywords: SEOKeyword[];
  domain_authority: number | null;
  total_organic_keywords: number | null;
}

export interface SEOKeyword {
  keyword: string;
  position: number | null;
  search_volume: number | null;
  difficulty: 'easy' | 'medium' | 'hard';
  url_ranking: string | null;
  serp_features: string[];
}

export interface CompetitorData {
  name: string;
  website: string | null;
  address: string | null;
  google_rating: number | null;
  google_review_count: number | null;
  strengths: string[];
  weaknesses: string[];
  rank: number;
}

export interface ReviewsData {
  google_rating: number | null;
  google_review_count: number | null;
  review_velocity: number | null;
  response_rate: number | null;
  avg_response_time: string | null;
  positive_themes: string[];
  negative_themes: string[];
  rating_distribution: Record<string, number>;
  competitor_avg_rating: number | null;
  competitor_avg_review_count: number | null;
}

export interface AIVisibilityData {
  checks: AIVisibilityCheck[];
  robots_txt_allows_ai: boolean | null;
  has_schema_markup: boolean | null;
  has_structured_content: boolean | null;
  has_faq_schema: boolean | null;
  third_party_presence: Record<string, boolean>;
}

export interface AIVisibilityCheck {
  query: string;
  platform: 'chatgpt' | 'perplexity' | 'google_ai' | 'gemini';
  is_mentioned: boolean;
  mention_context: string | null;
  competitors_mentioned: string[];
}

export interface Settings {
  id: string;
  outscraper_key: string | null;
  apify_key: string | null;
  firecrawl_key: string | null;
  openai_key: string | null;
  ghl_key: string | null;
  ghl_location_id: string | null;
  dataforseo_login: string | null;
  dataforseo_password: string | null;
  agency_name: string | null;
  agency_email: string | null;
  agency_phone: string | null;
  agency_website: string | null;
  agency_logo_url: string | null;
  calendar_type: 'calendly' | 'ghl' | 'calcom' | 'other' | null;
  calendar_url: string | null;
  default_niche: string | null;
  default_location: string | null;
  default_country: string | null;
  ghl_pipeline_id: string | null;
  updated_at: string;
}

export interface ActivityLog {
  id: string;
  action_type: 'scrape' | 'audit' | 'deep_audit' | 'ghl_push' | 'export' | 'score' | 'pitch';
  description: string;
  lead_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface SearchHistory {
  id: string;
  niche: string;
  location: string;
  country: string | null;
  source: string;
  results_count: number;
  saved_count: number;
  created_at: string;
}

export interface Pitch {
  id: string;
  lead_id: string;
  deep_audit_id: string | null;
  pitch_type: 'seo' | 'reviews' | 'ai_visibility' | 'competitor' | 'comprehensive';
  title: string;
  content: PitchContent;
  agency_name: string | null;
  agency_email: string | null;
  agency_phone: string | null;
  agency_website: string | null;
  agency_logo_url: string | null;
  calendar_type: string | null;
  calendar_url: string | null;
  status: 'draft' | 'sent' | 'viewed';
  view_count: number;
  created_at: string;
  updated_at: string;
}

export interface PitchContent {
  hook: string;
  problem: string;
  proof: string;
  solution: string;
  result: string;
  cta: string;
  data_points: PitchDataPoint[];
  competitor_comparisons: PitchComparison[];
}

export interface PitchDataPoint {
  label: string;
  value: string;
  type: 'positive' | 'negative' | 'neutral';
}

export interface PitchComparison {
  competitor_name: string;
  metric: string;
  their_value: string;
  your_value: string;
  winner: 'them' | 'you' | 'tie';
}

export interface ScrapeRequest {
  niche: string;
  location: string;
  country: string;
  source: 'google_maps' | 'yelp' | 'fresha' | 'all';
}

export interface ScrapeResult {
  business_name: string;
  address: string | null;
  city: string | null;
  country: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  instagram_url: string | null;
  google_rating: number | null;
  google_review_count: number | null;
  google_maps_url: string | null;
  source: 'google_maps' | 'yelp' | 'fresha';
}

export type SortDirection = 'asc' | 'desc';

export interface TableSort {
  column: string;
  direction: SortDirection;
}

export interface TableFilter {
  search: string;
  source: string | null;
  priority: string | null;
  scoreRange: [number, number] | null;
  auditStatus: string | null;
}

export interface DashboardStats {
  totalLeads: number;
  leadsThisWeek: number;
  avgLeadScore: number;
  pushedToGHL: number;
  auditsCompleted: number;
  deepAuditsCompleted: number;
}
