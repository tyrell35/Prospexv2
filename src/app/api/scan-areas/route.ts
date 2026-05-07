import { NextRequest, NextResponse } from 'next/server';

import { supabaseAdmin as supabase } from "@/lib/supabase-admin";

function getKey(envKey: string): string {
  return process.env[envKey] || '';
}

// ─── SAFE ARRAY — matches the working scraper's parser ─────
function safeArray(data: unknown): Record<string, unknown>[] {
  if (!data) return [];
  if (Array.isArray(data)) {
    if (data.length > 0 && Array.isArray(data[0])) {
      return (data[0] as unknown[]).filter(
        (item): item is Record<string, unknown> => item !== null && typeof item === 'object' && !Array.isArray(item)
      );
    }
    return data.filter(
      (item): item is Record<string, unknown> => item !== null && typeof item === 'object' && !Array.isArray(item)
    );
  }
  if (typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    if (Array.isArray(obj.data)) return safeArray(obj.data);
    if (Array.isArray(obj.results)) return safeArray(obj.results);
  }
  return [];
}

const FAILOVER_CODES = [402, 403, 429];

// ─── GOOGLE MAPS SEARCH (Outscraper → Apify failover) ──────
async function googleMapsSearch(query: string, lat?: number | null, lng?: number | null): Promise<{ items: Record<string, unknown>[]; provider: 'outscraper' | 'apify' }> {
  // Try Outscraper first
  const outscrapeKey = getKey('OUTSCRAPER_API_KEY');
  if (outscrapeKey) {
    try {
      const items = await outscrapeSearchDirect(query, outscrapeKey, lat, lng);
      return { items, provider: 'outscraper' };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const isFailover = FAILOVER_CODES.some(code => msg.includes(`${code}`));
      if (isFailover) {
        console.warn(`[scan-areas] Outscraper rate/billing error: ${msg} — failing over to Apify`);
      } else {
        console.error(`[scan-areas] Outscraper error (non-failover): ${msg}`);
        return { items: [], provider: 'outscraper' };
      }
    }
  }

  // Failover: Apify
  const apifyKey = getKey('APIFY_API_TOKEN');
  if (apifyKey) {
    console.log(`[scan-areas] Using Apify fallback for "${query}"`);
    const items = await apifySearchDirect(query, apifyKey, lat, lng);
    return { items, provider: 'apify' };
  }

  console.error('[scan-areas] No scraping API available');
  return { items: [], provider: 'outscraper' };
}

// ─── OUTSCRAPER DIRECT ──────────────────────────────────────
async function outscrapeSearchDirect(query: string, key: string, lat?: number | null, lng?: number | null): Promise<Record<string, unknown>[]> {
  const params = new URLSearchParams({
    query, limit: '50', language: 'en', async: 'false',
    dropDuplicates: 'true', extractContacts: 'true', enrichment: 'emails_and_contacts',
  });
  if (lat && lng) params.set('coordinates', `@${lat},${lng},14z`);

  console.log(`[scan-areas] Outscraper query: "${query}" coords: ${lat},${lng}`);

  const res = await fetch(`https://api.app.outscraper.com/maps/search-v3?${params}`, {
    headers: { 'X-API-KEY': key },
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Outscraper error (${res.status}): ${errText.slice(0, 300)}`);
  }

  const rawData = await res.json();
  const items = safeArray(rawData);
  console.log(`[scan-areas] Outscraper returned ${items.length} raw items for "${query}"`);
  return items;
}

// ─── APIFY DIRECT ───────────────────────────────────────────
async function apifySearchDirect(query: string, key: string, lat?: number | null, lng?: number | null): Promise<Record<string, unknown>[]> {
  const res = await fetch('https://api.apify.com/v2/acts/nwua9Gu5YrADL7ZDj/run-sync-get-dataset-items?token=' + key, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      searchStringsArray: [query],
      maxCrawledPlacesPerSearch: 30,
      language: 'en',
      ...(lat && lng ? { customGeolocation: { latitude: lat, longitude: lng, zoom: 14 } } : {}),
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    console.error(`[scan-areas] Apify error (${res.status}): ${errText.slice(0, 300)}`);
    return [];
  }

  const items = await res.json();
  if (!Array.isArray(items)) return [];
  console.log(`[scan-areas] Apify returned ${items.length} results for "${query}"`);

  // Normalise Apify fields to match Outscraper field names
  return items.map((item: Record<string, unknown>) => ({
    name: item.title,
    full_address: item.address,
    city: item.city,
    country: item.countryCode,
    phone: item.phone || item.phoneUnformatted,
    email: Array.isArray(item.emails) && item.emails.length > 0 ? item.emails[0] : null,
    site: item.website,
    rating: item.totalScore,
    reviews: item.reviewsCount,
    google_maps_url: item.url,
    social_links: [],
    _provider: 'apify',
  }));
}

// ─── PARSE RESULT — matches working scraper's field mapping ─
function parseResult(item: Record<string, unknown>, areaName: string, country: string, niche: string) {
  if (!item.name) return null;

  // Email extraction — same logic as working scraper
  const emailRaw = item.email || item.email_1 || item.contact_email
    || (Array.isArray(item.emails) && item.emails.length > 0 ? item.emails[0] : null)
    || (Array.isArray(item.emails_and_contacts) && item.emails_and_contacts.length > 0 ? item.emails_and_contacts[0] : null);

  // Phone extraction
  const phoneRaw = item.phone || item.phone_1
    || (Array.isArray(item.phones) && item.phones.length > 0 ? item.phones[0] : null);

  // Instagram extraction
  const socialLinks = Array.isArray(item.social_links) ? (item.social_links as string[]) : [];
  const igFromSocial = socialLinks.find(l => typeof l === 'string' && l.includes('instagram.com')) || null;
  const igFromField = typeof item.instagram === 'string' ? item.instagram : null;

  return {
    business_name: String(item.name || 'Unknown'),
    address: item.full_address ? String(item.full_address) : (item.address ? String(item.address) : null),
    city: item.city ? String(item.city) : null,
    country: item.country ? String(item.country) : country,
    phone: phoneRaw ? String(phoneRaw) : null,
    email: typeof emailRaw === 'string' ? emailRaw : null,
    website: item.site ? String(item.site) : (item.website ? String(item.website) : null),
    instagram_url: igFromSocial || igFromField,
    google_rating: typeof item.rating === 'number' ? item.rating : null,
    google_review_count: typeof item.reviews === 'number' ? item.reviews : (typeof item.reviews_count === 'number' ? item.reviews_count : null),
    google_maps_url: item.google_maps_url ? String(item.google_maps_url) : null,
    source: 'google_maps',
    niche,
    area_source: areaName,
  };
}

// ─── QUALIFICATION SCORE ───────────────────────────────────
function calculateQualificationScore(lead: Record<string, unknown>, tier: number): { score: number; breakdown: string } {
  let score = 0;
  const checks: string[] = [];
  const name = String(lead.business_name || '?');
  const rating = lead.google_rating as number | null;
  const reviews = lead.google_review_count as number | null;
  const hasWebsite = !!(lead.website && String(lead.website).length > 5);
  const hasEmail = !!(lead.email && String(lead.email).includes('@'));
  const hasPhone = !!(lead.phone && String(lead.phone).length >= 7);

  // Base: every lead in an affluent area gets 25 points
  score += 25;
  checks.push('base:+25');

  // Tier bonus
  if (tier === 1) { score += 10; checks.push('tier1:+10'); }
  else if (tier === 2) { score += 7; checks.push('tier2:+7'); }
  else { score += 5; checks.push('tier3:+5'); }

  // Rating
  if (rating && rating >= 4.5) { score += 10; checks.push(`rating(${rating}):+10`); }
  else if (rating && rating >= 4.0) { score += 7; checks.push(`rating(${rating}):+7`); }
  else if (rating && rating >= 3.0) { score += 3; checks.push(`rating(${rating}):+3`); }
  else { checks.push(`rating(${rating ?? 'none'}):+0`); }

  // Reviews
  if (reviews && reviews >= 100) { score += 10; checks.push(`reviews(${reviews}):+10`); }
  else if (reviews && reviews >= 30) { score += 7; checks.push(`reviews(${reviews}):+7`); }
  else if (reviews && reviews >= 10) { score += 5; checks.push(`reviews(${reviews}):+5`); }
  else if (reviews && reviews > 0) { score += 2; checks.push(`reviews(${reviews}):+2`); }
  else { checks.push('reviews(0):+0'); }

  // Contact info — require website OR phone, email is a bonus
  if (hasWebsite) { score += 8; checks.push('website:+8'); }
  else { checks.push('website:+0'); }

  if (hasPhone) { score += 8; checks.push('phone:+8'); }
  else { checks.push('phone:+0'); }

  if (hasEmail) { score += 7; checks.push('email:+7'); }
  else { checks.push('email(none):+0'); }

  // Has at least one way to reach them (website or phone)
  if (hasWebsite || hasPhone) { score += 5; checks.push('reachable:+5'); }
  else { checks.push('reachable:+0 (NO CONTACT METHOD)'); }

  const finalScore = Math.min(score, 100);
  const verdict = finalScore >= 40 ? 'QUALIFIED' : 'REJECTED';
  const breakdown = `[${verdict}] ${name}: ${finalScore}/100 — ${checks.join(', ')}`;

  return { score: finalScore, breakdown };
}

// ─── MAIN HANDLER ──────────────────────────────────────────
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const count = parseInt(searchParams.get('count') || '3', 10);
    const areaId = searchParams.get('area_id');
    const nicheParam = searchParams.get('niche');

    // Get areas to scan
    let areas: Record<string, unknown>[] | null;
    if (areaId) {
      const { data } = await supabase
        .from('affluent_areas')
        .select('*')
        .eq('id', areaId)
        .eq('active', true);
      areas = data;
    } else {
      const { data } = await supabase
        .from('affluent_areas')
        .select('*')
        .eq('active', true)
        .order('scan_priority', { ascending: true })
        .order('last_scanned', { ascending: true, nullsFirst: true })
        .limit(count);
      areas = data;
    }

    if (!areas || areas.length === 0) {
      return NextResponse.json({ message: 'No areas to scan', areas_scanned: 0 });
    }

    const results: { area_name: string; found: number; qualified: number; provider: string; errors: string[] }[] = [];
    let totalFound = 0;
    let totalQualified = 0;
    let totalDuplicates = 0;

    for (const area of areas) {
      const areaErrors: string[] = [];
      const nicheLabel = nicheParam || 'aesthetic clinic';

      // Build search terms — niche override or from DB
      const searchTerms = nicheParam
        ? [`${nicheParam} ${area.area_name}`]
        : [area.search_term_1, area.search_term_2, area.search_term_3].filter(Boolean) as string[];

      const allLeads: Record<string, unknown>[] = [];
      const seenNames = new Set<string>();
      let provider: 'outscraper' | 'apify' = 'outscraper';

      // Search with each term
      for (const term of searchTerms) {
        const { items: rawResults, provider: p } = await googleMapsSearch(
          term,
          area.latitude as number | null,
          area.longitude as number | null
        );
        provider = p;

        for (const item of rawResults) {
          const lead = parseResult(item, area.area_name as string, area.country as string, nicheLabel);
          if (!lead) continue;
          const nameKey = lead.business_name.toLowerCase().trim();
          if (seenNames.has(nameKey)) continue;
          seenNames.add(nameKey);
          allLeads.push(lead);
        }
      }

      console.log(`[scan-areas] ${area.area_name}: ${allLeads.length} unique leads from Outscraper`);

      // Deduplicate against existing leads in DB
      const newLeads: Record<string, unknown>[] = [];
      for (const lead of allLeads) {
        const bizName = lead.business_name as string;
        // Use exact match on business_name (case-insensitive via ilike) — same as working scraper
        const { data: existing } = await supabase
          .from('leads')
          .select('id')
          .ilike('business_name', bizName)
          .limit(1)
          .maybeSingle();

        if (existing) {
          totalDuplicates++;
          continue;
        }
        newLeads.push(lead);
      }

      console.log(`[scan-areas] ${area.area_name}: ${newLeads.length} new leads after dedup (${allLeads.length - newLeads.length} duplicates)`);

      // Score and save qualified leads
      let areaQualified = 0;
      for (const lead of newLeads) {
        const { score: qualScore, breakdown } = calculateQualificationScore(lead, area.affluent_tier as number);
        console.log(`[scan-areas] ${breakdown}`);

        if (qualScore >= 40) {
          const insertPayload = {
            business_name: lead.business_name,
            niche: lead.niche || nicheLabel,
            address: lead.address || null,
            city: lead.city || null,
            country: lead.country || null,
            phone: lead.phone || null,
            email: lead.email || null,
            website: lead.website || null,
            instagram_url: lead.instagram_url || null,
            google_rating: lead.google_rating || null,
            google_review_count: lead.google_review_count || null,
            google_maps_url: lead.google_maps_url || null,
            source: 'google_maps',
            area_source: lead.area_source || area.area_name,
            qualification_score: qualScore,
            pipeline_stage: 'new',
          };

          const { error } = await supabase.from('leads').insert(insertPayload);
          if (error) {
            console.error(`[scan-areas] Insert error for "${lead.business_name}":`, error.message);
            areaErrors.push(`Insert failed: ${lead.business_name} — ${error.message}`);
          } else {
            areaQualified++;
          }
        }
      }

      console.log(`[scan-areas] ${area.area_name}: ${areaQualified} qualified leads saved to DB`);

      // Update area record
      await supabase
        .from('affluent_areas')
        .update({
          last_scanned: new Date().toISOString(),
          times_scanned: ((area.times_scanned as number) || 0) + 1,
          total_prospects_found: ((area.total_prospects_found as number) || 0) + newLeads.length,
          qualified_prospects_found: ((area.qualified_prospects_found as number) || 0) + areaQualified,
        })
        .eq('id', area.id);

      totalFound += newLeads.length;
      totalQualified += areaQualified;
      results.push({
        area_name: area.area_name as string,
        found: newLeads.length,
        qualified: areaQualified,
        provider,
        errors: areaErrors,
      });
    }

    // Log scan
    await supabase.from('scan_schedule').insert({
      scan_date: new Date().toISOString().split('T')[0],
      area_ids: areas.map((a) => a.id as string),
      status: 'complete',
      leads_found: totalFound,
      qualified_leads: totalQualified,
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
    });

    return NextResponse.json({
      areas_scanned: areas.length,
      total_found: totalFound,
      qualified: totalQualified,
      duplicates_skipped: totalDuplicates,
      niche: nicheParam || 'default (from database)',
      areas: results,
    });
  } catch (err) {
    console.error('[scan-areas] Fatal error:', err);
    return NextResponse.json({ error: 'Scan failed', details: String(err) }, { status: 500 });
  }
}
