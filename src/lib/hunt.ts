// Shared server-side helpers for Hunt Mode (Prospex v2).
// Server-only — never import from a client component.

import { supabaseAdmin } from '@/lib/supabase-admin';

// ─── Types ──────────────────────────────────────────────

export interface DeviceKeyword {
  id: number;
  device_name: string;
  aliases: string[];
  tier: 'A' | 'B' | 'C';
  weight: number;
  active: boolean;
}

export interface BookingFingerprint {
  id: number;
  system_name: string;
  match_strings: string[];
  weight: number;
  is_agency_flag: boolean;
}

// ─── Dictionary loaders (cached per request) ────────────

let _devicesCache: { at: number; data: DeviceKeyword[] } | null = null;
let _bookingCache: { at: number; data: BookingFingerprint[] } | null = null;
const CACHE_MS = 5 * 60 * 1000; // 5 min in-process cache

export async function loadDeviceKeywords(): Promise<DeviceKeyword[]> {
  if (_devicesCache && Date.now() - _devicesCache.at < CACHE_MS) return _devicesCache.data;
  const { data } = await supabaseAdmin
    .from('device_keywords')
    .select('*')
    .eq('active', true)
    .order('tier', { ascending: true });
  const rows = (data || []) as DeviceKeyword[];
  _devicesCache = { at: Date.now(), data: rows };
  return rows;
}

export async function loadBookingFingerprints(): Promise<BookingFingerprint[]> {
  if (_bookingCache && Date.now() - _bookingCache.at < CACHE_MS) return _bookingCache.data;
  const { data } = await supabaseAdmin
    .from('booking_fingerprints')
    .select('*');
  const rows = (data || []) as BookingFingerprint[];
  _bookingCache = { at: Date.now(), data: rows };
  return rows;
}

// ─── Device detection ───────────────────────────────────

export interface DeviceMatchResult {
  devices_found: string[]; // device_name values that matched
  tier_a_count: number;
  tier_b_count: number;
  generic_kit_only: boolean; // only Tier C matches, no branded device
}

function normalise(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function detectDevices(text: string, devices: DeviceKeyword[]): DeviceMatchResult {
  const hay = ' ' + normalise(text) + ' ';
  const foundNames = new Set<string>();
  let tierA = 0, tierB = 0, tierC = 0;

  for (const d of devices) {
    let matched = false;
    for (const alias of d.aliases) {
      const needle = ' ' + normalise(alias) + ' ';
      if (hay.includes(needle)) { matched = true; break; }
    }
    if (matched) {
      foundNames.add(d.device_name);
      if (d.tier === 'A') tierA++;
      else if (d.tier === 'B') tierB++;
      else tierC++;
    }
  }

  const generic = tierA === 0 && tierB === 0 && tierC > 0;
  return {
    devices_found: Array.from(foundNames),
    tier_a_count: tierA,
    tier_b_count: tierB,
    generic_kit_only: generic,
  };
}

// ─── Booking system detection ───────────────────────────

export interface BookingMatchResult {
  booking_system: string | null;
  has_other_agency: boolean; // GHL/leadconnector present
}

export function detectBookingSystem(rawHtml: string, fingerprints: BookingFingerprint[]): BookingMatchResult {
  const hay = rawHtml.toLowerCase();
  let matched: BookingFingerprint | null = null;
  let agency = false;

  for (const fp of fingerprints) {
    for (const s of fp.match_strings) {
      if (hay.includes(s.toLowerCase())) {
        if (fp.is_agency_flag) agency = true;
        else if (!matched || (fp.weight ?? 0) > (matched.weight ?? 0)) matched = fp;
        break;
      }
    }
  }
  return {
    booking_system: matched?.system_name || null,
    has_other_agency: agency,
  };
}

// ─── Contact extraction from HTML ───────────────────────

export interface ContactExtractionResult {
  email: string | null;
  phone: string | null;
  instagram_handle: string | null;
  fb_page_url: string | null;
  fb_page_id: string | null;
}

const EMAIL_RE = /[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}/i;
const PHONE_RE = /(\+?\d[\d\s().\-]{7,})/;
const INSTA_RE = /(?:https?:\/\/)?(?:www\.)?instagram\.com\/([a-zA-Z0-9_.]{1,30})(?!\/(?:p|reel|explore))/i;
const FB_URL_RE = /(?:https?:\/\/)?(?:www\.|m\.)?facebook\.com\/(?:pg\/|pages\/[^/]+\/)?([A-Za-z0-9.\-]{3,})/i;
const FB_PAGE_ID_RE = /(?:page_id|pageID)["'\s:=]+(\d{6,})/i;

const BAD_EMAIL_HOSTS = ['sentry.io','wixpress','schema.org','googleapis','cloudflare','w3.org','example.com'];

export function extractContacts(html: string): ContactExtractionResult {
  const lower = html.toLowerCase();

  // Email
  let email: string | null = null;
  const em = lower.match(EMAIL_RE);
  if (em && !BAD_EMAIL_HOSTS.some(h => em[0].includes(h)) && !em[0].endsWith('.png') && !em[0].endsWith('.jpg')) {
    email = em[0];
  }

  // Phone
  let phone: string | null = null;
  const ph = html.match(PHONE_RE);
  if (ph) {
    const digits = ph[1].replace(/\D/g, '');
    if (digits.length >= 9 && digits.length <= 15) phone = ph[1].trim();
  }

  // Instagram handle
  let instagram_handle: string | null = null;
  const ig = html.match(INSTA_RE);
  if (ig && !['p','reel','reels','explore','stories','accounts'].includes(ig[1].toLowerCase())) {
    instagram_handle = ig[1];
  }

  // Facebook page — grab the first plausible page URL and try to extract a numeric ID separately
  let fb_page_url: string | null = null;
  const fb = html.match(FB_URL_RE);
  if (fb) {
    const slug = fb[1];
    if (!['sharer','tr','pixel','plugins','dialog','photo','video'].includes(slug.toLowerCase())) {
      fb_page_url = `https://facebook.com/${slug}`;
    }
  }
  let fb_page_id: string | null = null;
  const fbId = html.match(FB_PAGE_ID_RE);
  if (fbId) fb_page_id = fbId[1];

  return { email, phone, instagram_handle, fb_page_url, fb_page_id };
}

// ─── Website fetch (raw HTML, timeout, safe headers) ────

export async function fetchWebsite(url: string, timeoutMs = 8000): Promise<{ ok: boolean; html: string; final_url?: string; error?: string }> {
  try {
    const target = url.startsWith('http') ? url : `https://${url}`;
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(target, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Prospex/1.0; +https://infinityclients.com)',
        Accept: 'text/html,application/xhtml+xml',
      },
    });
    clearTimeout(t);
    if (!res.ok) return { ok: false, html: '', error: `HTTP ${res.status}` };
    const html = await res.text();
    return { ok: true, html, final_url: res.url };
  } catch (e) {
    return { ok: false, html: '', error: e instanceof Error ? e.message : 'fetch failed' };
  }
}

// ─── Domain extraction ──────────────────────────────────

export function domainFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url.startsWith('http') ? url : `https://${url}`);
    return u.hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

// ─── Companies House lookup (UK only) ───────────────────

export interface CompaniesHouseResult {
  company_number: string | null;
  date_of_creation: string | null; // ISO date
  company_status: string | null;    // active | dissolved | liquidation | ...
}

export async function lookupCompaniesHouse(businessName: string): Promise<CompaniesHouseResult | null> {
  const key = process.env.COMPANIES_HOUSE_API_KEY;
  if (!key) return null; // graceful stub

  try {
    const q = encodeURIComponent(businessName);
    const auth = Buffer.from(`${key}:`).toString('base64');
    const res = await fetch(`https://api.company-information.service.gov.uk/search/companies?q=${q}&items_per_page=5`, {
      headers: { Authorization: `Basic ${auth}` },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const items = (data?.items || []) as Array<{ company_number: string; date_of_creation: string; company_status: string; title: string }>;
    if (items.length === 0) return null;

    // Prefer active companies with a title similarity match
    const bnNorm = normalise(businessName);
    const scored = items
      .map(i => ({ i, sim: normalise(i.title).includes(bnNorm) || bnNorm.includes(normalise(i.title)) ? 2 : 0 }))
      .sort((a, b) => (b.i.company_status === 'active' ? 1 : 0) - (a.i.company_status === 'active' ? 1 : 0) || b.sim - a.sim);
    const pick = scored[0].i;
    return {
      company_number: pick.company_number || null,
      date_of_creation: pick.date_of_creation || null,
      company_status: pick.company_status || null,
    };
  } catch {
    return null;
  }
}

// ─── Domain age via RDAP (best-effort) ──────────────────

export async function lookupDomainCreated(domain: string): Promise<string | null> {
  try {
    const res = await fetch(`https://rdap.org/domain/${domain}`, {
      signal: AbortSignal.timeout(5000),
      headers: { Accept: 'application/rdap+json' },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const events = (data?.events || []) as Array<{ eventAction: string; eventDate: string }>;
    const reg = events.find(e => e.eventAction === 'registration');
    return reg?.eventDate?.slice(0, 10) || null;
  } catch {
    return null;
  }
}

// ─── Country-to-ISO helper (Meta / LinkedIn friendly) ───

const COUNTRY_TO_ISO: Record<string, string> = {
  'united kingdom': 'GB', uk: 'GB', 'great britain': 'GB', england: 'GB',
  scotland: 'GB', wales: 'GB', 'northern ireland': 'GB',
  'united states': 'US', usa: 'US', us: 'US',
  canada: 'CA', australia: 'AU', ireland: 'IE',
  germany: 'DE', france: 'FR', spain: 'ES', italy: 'IT',
  netherlands: 'NL', 'new zealand': 'NZ',
};
export function isoCountry(country: string | null | undefined): string | null {
  if (!country) return null;
  return COUNTRY_TO_ISO[country.toLowerCase().trim()] || country;
}
