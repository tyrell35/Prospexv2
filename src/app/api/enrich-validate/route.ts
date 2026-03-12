import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// ─── INSTAGRAM VALIDATION ────────────────────────────────────────

// Generic/broken Instagram paths that are NOT business profiles
const INVALID_IG_PATHS = new Set([
  'invites', 'explore', 'accounts', 'p', 'reel', 'reels', 'stories',
  'direct', 'about', 'legal', 'privacy', 'terms', 'developer',
  'accounts/login', 'accounts/signup', 'accounts/password',
  'nametag', 'directory', 'lite', 'emails', 'press', 'api',
  'static', 'web', 'challenge', 'session', '', 'favicon.ico',
]);

function extractInstagramHandle(url: string | null): { handle: string | null; url: string | null; valid: boolean } {
  if (!url) return { handle: null, url: null, valid: false };

  // Normalise URL
  let cleaned = url.trim().replace(/\/$/, '');

  // Extract handle from various URL formats
  // https://www.instagram.com/username
  // https://instagram.com/username
  // http://instagram.com/username
  // instagram.com/username
  const patterns = [
    /(?:https?:\/\/)?(?:www\.)?instagram\.com\/([a-zA-Z0-9_.]{1,30})\/?(?:\?.*)?$/i,
  ];

  for (const pattern of patterns) {
    const match = cleaned.match(pattern);
    if (match && match[1]) {
      const handle = match[1].toLowerCase();

      // Check against invalid paths
      if (INVALID_IG_PATHS.has(handle)) {
        return { handle: null, url: null, valid: false };
      }

      // Instagram handles: 1-30 chars, letters, numbers, periods, underscores
      if (/^[a-zA-Z0-9_.]{1,30}$/.test(handle)) {
        return {
          handle,
          url: `https://www.instagram.com/${handle}`,
          valid: true,
        };
      }
    }
  }

  return { handle: null, url: null, valid: false };
}

// Extract Instagram URL from website HTML using proper href parsing
function extractInstagramFromHTML(html: string): string | null {
  if (!html) return null;

  // Match href attributes containing instagram.com
  // This is much more precise than just checking if "instagram.com" appears anywhere
  const hrefPattern = /href\s*=\s*["']([^"']*instagram\.com\/[a-zA-Z0-9_.]{1,30})\/?["']/gi;
  const matches: string[] = [];

  let match;
  while ((match = hrefPattern.exec(html)) !== null) {
    matches.push(match[1]);
  }

  // Also check for og:see or meta tags with instagram
  const metaPattern = /content\s*=\s*["']([^"']*instagram\.com\/[a-zA-Z0-9_.]{1,30})\/?["']/gi;
  while ((match = metaPattern.exec(html)) !== null) {
    matches.push(match[1]);
  }

  if (matches.length === 0) return null;

  // Score each match — prefer links in footer/header social sections over random mentions
  // Filter out invalid paths first
  const validMatches = matches
    .map(url => extractInstagramHandle(url))
    .filter(r => r.valid);

  if (validMatches.length === 0) return null;

  // If multiple valid handles found, pick the most common one
  // (most likely to be the business's own account)
  const handleCounts = new Map<string, number>();
  for (const v of validMatches) {
    if (v.handle) {
      handleCounts.set(v.handle, (handleCounts.get(v.handle) || 0) + 1);
    }
  }

  let bestHandle = '';
  let bestCount = 0;
  for (const [handle, count] of handleCounts) {
    if (count > bestCount) {
      bestHandle = handle;
      bestCount = count;
    }
  }

  return bestHandle ? `https://www.instagram.com/${bestHandle}` : null;
}

// ─── PHONE VALIDATION ────────────────────────────────────────────

// UK phone number classification
// 07xxx = mobile, 01xxx/02xxx = landline, 03xxx = non-geographic
// International mobile prefixes vary by country
const UK_MOBILE_PREFIXES = ['7']; // After removing leading 0 or +44
const UK_LANDLINE_PREFIXES = ['1', '2']; // 01xxx, 02xxx
const US_MOBILE_LENGTH = 10; // US/CA numbers are always 10 digits

interface PhoneResult {
  formatted: string | null;  // E.164 format: +447792817635
  display: string | null;     // Human format: +44 7792 817635
  type: 'mobile' | 'landline' | 'unknown';
  whatsapp_eligible: boolean;
  country_code: string | null;
}

function validatePhone(phone: string | null, country: string | null): PhoneResult {
  const empty: PhoneResult = { formatted: null, display: null, type: 'unknown', whatsapp_eligible: false, country_code: null };
  if (!phone) return empty;

  // Strip all non-digit characters except leading +
  let digits = phone.replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) {
    digits = '+' + digits.slice(1).replace(/\D/g, '');
  } else {
    digits = digits.replace(/\D/g, '');
  }

  if (digits.length < 7) return empty;

  // Determine country and classify
  const countryLower = (country || '').toLowerCase();
  let countryCode = '';
  let nationalNumber = '';
  let type: 'mobile' | 'landline' | 'unknown' = 'unknown';

  // ── UK NUMBERS ──
  if (digits.startsWith('+44') || digits.startsWith('44') || countryLower.includes('united kingdom') || countryLower === 'gb') {
    countryCode = '+44';
    if (digits.startsWith('+44')) nationalNumber = digits.slice(3);
    else if (digits.startsWith('44') && digits.length > 10) nationalNumber = digits.slice(2);
    else if (digits.startsWith('0')) nationalNumber = digits.slice(1);
    else nationalNumber = digits;

    // Remove any remaining leading zeros
    nationalNumber = nationalNumber.replace(/^0+/, '');

    if (nationalNumber.length < 9 || nationalNumber.length > 11) return { ...empty, formatted: `+44${nationalNumber}`, display: phone };

    // UK mobile: starts with 7 (after country code)
    if (nationalNumber.startsWith('7') && nationalNumber.length === 10) {
      type = 'mobile';
    }
    // UK landline: starts with 1 or 2
    else if (nationalNumber.startsWith('1') || nationalNumber.startsWith('2')) {
      type = 'landline';
    }
    // UK non-geographic: starts with 3
    else if (nationalNumber.startsWith('3')) {
      type = 'landline'; // Treat as landline for WhatsApp purposes
    }

    const formatted = `+44${nationalNumber}`;
    const display = `+44 ${nationalNumber.slice(0, 4)} ${nationalNumber.slice(4, 7)} ${nationalNumber.slice(7)}`.trim();
    return {
      formatted,
      display,
      type,
      whatsapp_eligible: type === 'mobile',
      country_code: '+44',
    };
  }

  // ── US/CA NUMBERS ──
  if (digits.startsWith('+1') || digits.startsWith('1') && digits.length === 11 ||
      countryLower.includes('united states') || countryLower.includes('canada') || countryLower === 'us' || countryLower === 'ca') {
    countryCode = '+1';
    if (digits.startsWith('+1')) nationalNumber = digits.slice(2);
    else if (digits.startsWith('1') && digits.length === 11) nationalNumber = digits.slice(1);
    else nationalNumber = digits;

    if (nationalNumber.length !== 10) return { ...empty, formatted: `+1${nationalNumber}`, display: phone };

    // US/CA: all 10-digit numbers can be mobile (no reliable prefix-based detection)
    // Default to mobile since most businesses list mobile numbers
    type = 'mobile';
    const formatted = `+1${nationalNumber}`;
    const display = `+1 (${nationalNumber.slice(0, 3)}) ${nationalNumber.slice(3, 6)}-${nationalNumber.slice(6)}`;
    return {
      formatted,
      display,
      type,
      whatsapp_eligible: true,
      country_code: '+1',
    };
  }

  // ── AU NUMBERS ──
  if (digits.startsWith('+61') || countryLower.includes('australia') || countryLower === 'au') {
    countryCode = '+61';
    if (digits.startsWith('+61')) nationalNumber = digits.slice(3);
    else if (digits.startsWith('0')) nationalNumber = digits.slice(1);
    else nationalNumber = digits;

    // AU mobile: starts with 4 (after country code)
    type = nationalNumber.startsWith('4') ? 'mobile' : 'landline';
    const formatted = `+61${nationalNumber}`;
    return {
      formatted,
      display: `+61 ${nationalNumber}`,
      type,
      whatsapp_eligible: type === 'mobile',
      country_code: '+61',
    };
  }

  // ── GENERIC (already has country code) ──
  if (digits.startsWith('+')) {
    return {
      formatted: digits,
      display: phone.trim(),
      type: 'unknown',
      whatsapp_eligible: false, // Can't reliably determine for unknown countries
      country_code: null,
    };
  }

  // ── NO COUNTRY CODE — try to add based on lead country ──
  if (countryLower.includes('united kingdom') || countryLower === 'gb') {
    return validatePhone(`+44${digits.startsWith('0') ? digits.slice(1) : digits}`, country);
  }
  if (countryLower.includes('united states') || countryLower.includes('canada')) {
    return validatePhone(`+1${digits}`, country);
  }

  return { ...empty, formatted: digits, display: phone.trim() };
}

// ─── CONTACT QUALITY SCORE ───────────────────────────────────────
function calculateContactQuality(lead: {
  email: string | null;
  phone: string | null;
  phone_type: string;
  whatsapp_eligible: boolean;
  instagram_verified: boolean;
  website: string | null;
}): number {
  let score = 0;

  if (lead.email) score += 25;
  if (lead.phone) {
    score += 15;
    if (lead.phone_type === 'mobile') score += 10;
    if (lead.whatsapp_eligible) score += 10;
  }
  if (lead.instagram_verified) score += 20;
  if (lead.website) score += 20;

  return Math.min(score, 100);
}

// ─── ENRICH FROM WEBSITE HTML ────────────────────────────────────
async function enrichFromWebsite(website: string): Promise<{
  instagram_url: string | null;
  instagram_handle: string | null;
  phone_from_site: string | null;
  email_from_site: string | null;
}> {
  const firecrawlKey = process.env.FIRECRAWL_API_KEY;
  const result = { instagram_url: null as string | null, instagram_handle: null as string | null, phone_from_site: null as string | null, email_from_site: null as string | null };

  if (!firecrawlKey || !website) return result;

  try {
    const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${firecrawlKey}` },
      body: JSON.stringify({ url: website, formats: ['html'], onlyMainContent: false }),
    });

    if (!response.ok) return result;
    const data = await response.json();
    const html = data?.data?.html || '';

    // Extract Instagram (proper href-based extraction)
    const igUrl = extractInstagramFromHTML(html);
    if (igUrl) {
      const parsed = extractInstagramHandle(igUrl);
      result.instagram_url = parsed.url;
      result.instagram_handle = parsed.handle;
    }

    // Extract phone numbers from HTML
    // Look for tel: links first (most reliable)
    const telMatch = html.match(/href\s*=\s*["']tel:([^"']+)["']/i);
    if (telMatch) {
      result.phone_from_site = telMatch[1].replace(/\s/g, '');
    }

    // Extract emails from mailto: links
    const mailMatch = html.match(/href\s*=\s*["']mailto:([^"'?]+)["'?]/i);
    if (mailMatch) {
      const email = mailMatch[1].trim().toLowerCase();
      // Basic email validation
      if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && !email.includes('example.com') && !email.includes('sentry')) {
        result.email_from_site = email;
      }
    }

    return result;
  } catch {
    return result;
  }
}

// ─── MAIN: POST — Validate + enrich single lead or batch ─────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { lead_id, lead_ids, crawl_website = true } = body;

    // Single lead or batch
    const idsToProcess = lead_ids || (lead_id ? [lead_id] : []);
    if (idsToProcess.length === 0) {
      return NextResponse.json({ error: 'lead_id or lead_ids required' }, { status: 400 });
    }

    // Fetch leads
    const { data: leads, error } = await supabase
      .from('leads')
      .select('id, business_name, phone, email, instagram_url, website, country')
      .in('id', idsToProcess.slice(0, 50)); // Max 50 at once

    if (error || !leads?.length) {
      return NextResponse.json({ error: 'No leads found' }, { status: 404 });
    }

    const results = [];

    for (const lead of leads) {
      // 1. Validate existing Instagram
      let igResult = extractInstagramHandle(lead.instagram_url);
      let igFromSite: string | null = null;
      let emailFromSite: string | null = null;
      let phoneFromSite: string | null = null;

      // 2. Validate phone
      let phoneResult = validatePhone(lead.phone, lead.country);

      // 3. Crawl website for better data (if enabled and has website)
      if (crawl_website && lead.website) {
        const siteData = await enrichFromWebsite(lead.website);

        // If existing IG is invalid but website has a valid one, use that
        if (!igResult.valid && siteData.instagram_url) {
          igResult = extractInstagramHandle(siteData.instagram_url);
        }
        igFromSite = siteData.instagram_url;

        // If we found a phone on the site and existing phone is missing or invalid
        if (siteData.phone_from_site && (!lead.phone || phoneResult.type === 'unknown')) {
          const sitePhoneResult = validatePhone(siteData.phone_from_site, lead.country);
          if (sitePhoneResult.type === 'mobile') {
            phoneResult = sitePhoneResult;
            phoneFromSite = siteData.phone_from_site;
          }
        }

        // If email missing, use from site
        if (!lead.email && siteData.email_from_site) {
          emailFromSite = siteData.email_from_site;
        }
      }

      // 4. Calculate contact quality score
      const qualityScore = calculateContactQuality({
        email: lead.email || emailFromSite,
        phone: phoneResult.formatted,
        phone_type: phoneResult.type,
        whatsapp_eligible: phoneResult.whatsapp_eligible,
        instagram_verified: igResult.valid,
        website: lead.website,
      });

      // 5. Update lead in database
      const updates: Record<string, any> = {
        phone_type: phoneResult.type,
        phone_formatted: phoneResult.formatted,
        whatsapp_eligible: phoneResult.whatsapp_eligible,
        instagram_handle: igResult.handle,
        instagram_verified: igResult.valid,
        contact_quality_score: qualityScore,
        last_enriched_at: new Date().toISOString(),
      };

      // Update instagram_url if we found a better one
      if (igResult.valid && igResult.url !== lead.instagram_url) {
        updates.instagram_url = igResult.url;
      }
      // Clear invalid Instagram
      if (!igResult.valid && lead.instagram_url) {
        updates.instagram_url = null;
      }

      // Update phone if we formatted it
      if (phoneResult.display && phoneResult.display !== lead.phone) {
        updates.phone = phoneResult.display;
      }

      // Add email from website if missing
      if (emailFromSite && !lead.email) {
        updates.email = emailFromSite;
      }

      await supabase.from('leads').update(updates).eq('id', lead.id);

      results.push({
        id: lead.id,
        business_name: lead.business_name,
        phone: {
          original: lead.phone,
          formatted: phoneResult.formatted,
          display: phoneResult.display,
          type: phoneResult.type,
          whatsapp_eligible: phoneResult.whatsapp_eligible,
        },
        instagram: {
          original: lead.instagram_url,
          validated_url: igResult.url,
          handle: igResult.handle,
          valid: igResult.valid,
          from_website: igFromSite,
        },
        email: {
          existing: lead.email,
          from_website: emailFromSite,
        },
        contact_quality_score: qualityScore,
      });
    }

    return NextResponse.json({
      processed: results.length,
      results,
    });

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// ─── GET: Validate all un-enriched leads in batch ────────────────
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 200);
    const crawl = searchParams.get('crawl') !== 'false';

    // Find leads that haven't been enriched yet
    const { data: leads } = await supabase
      .from('leads')
      .select('id')
      .is('last_enriched_at', null)
      .not('phone', 'is', null)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (!leads?.length) {
      return NextResponse.json({ message: 'All leads are already enriched', processed: 0 });
    }

    // Process via POST handler
    const ids = leads.map(l => l.id);

    // Process in chunks of 10 to avoid timeout
    const chunkSize = 10;
    let totalProcessed = 0;

    for (let i = 0; i < ids.length; i += chunkSize) {
      const chunk = ids.slice(i, i + chunkSize);

      const { data: chunkLeads } = await supabase
        .from('leads')
        .select('id, business_name, phone, email, instagram_url, website, country')
        .in('id', chunk);

      if (!chunkLeads) continue;

      for (const lead of chunkLeads) {
        let igResult = extractInstagramHandle(lead.instagram_url);
        const phoneResult = validatePhone(lead.phone, lead.country);

        // Only crawl website if explicitly enabled (to save Firecrawl credits)
        if (crawl && lead.website && (!igResult.valid || phoneResult.type === 'unknown')) {
          const siteData = await enrichFromWebsite(lead.website);
          if (!igResult.valid && siteData.instagram_url) {
            igResult = extractInstagramHandle(siteData.instagram_url);
          }
        }

        const qualityScore = calculateContactQuality({
          email: lead.email,
          phone: phoneResult.formatted,
          phone_type: phoneResult.type,
          whatsapp_eligible: phoneResult.whatsapp_eligible,
          instagram_verified: igResult.valid,
          website: lead.website,
        });

        const updates: Record<string, any> = {
          phone_type: phoneResult.type,
          phone_formatted: phoneResult.formatted,
          whatsapp_eligible: phoneResult.whatsapp_eligible,
          instagram_handle: igResult.handle,
          instagram_verified: igResult.valid,
          contact_quality_score: qualityScore,
          last_enriched_at: new Date().toISOString(),
        };

        if (igResult.valid && igResult.url !== lead.instagram_url) updates.instagram_url = igResult.url;
        if (!igResult.valid && lead.instagram_url) updates.instagram_url = null;
        if (phoneResult.display) updates.phone = phoneResult.display;

        await supabase.from('leads').update(updates).eq('id', lead.id);
        totalProcessed++;
      }
    }

    return NextResponse.json({
      message: `Enriched ${totalProcessed} leads`,
      processed: totalProcessed,
      remaining: ids.length - totalProcessed,
    });

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
