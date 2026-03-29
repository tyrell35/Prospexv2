import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

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

// ─── OUTSCRAPER SEARCH — matches working scraper params ────
async function outscrapeSearch(query: string, lat?: number | null, lng?: number | null): Promise<Record<string, unknown>[]> {
  const key = getKey('OUTSCRAPER_API_KEY');
  if (!key) {
    console.error('[scan-areas] OUTSCRAPER_API_KEY not set');
    return [];
  }
  try {
    const params = new URLSearchParams({
      query,
      limit: '50',
      language: 'en',
      async: 'false',
      dropDuplicates: 'true',
      extractContacts: 'true',
      enrichment: 'emails_and_contacts',
    });
    if (lat && lng) {
      params.set('coordinates', `@${lat},${lng},14z`);
    }

    console.log(`[scan-areas] Outscraper query: "${query}" coords: ${lat},${lng}`);

    const res = await fetch(`https://api.app.outscraper.com/maps/search-v3?${params}`, {
      headers: { 'X-API-KEY': key },
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.error(`[scan-areas] Outscraper error ${res.status}: ${errText.slice(0, 300)}`);
      return [];
    }

    const rawData = await res.json();
    const items = safeArray(rawData);
    console.log(`[scan-areas] Outscraper returned ${items.length} raw items for "${query}"`);
    return items;
  } catch (err) {
    console.error('[scan-areas] Outscraper fetch error:', err);
    return [];
  }
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
function calculateQualificationScore(lead: Record<string, unknown>, tier: number): number {
  let score = 0;
  const rating = lead.google_rating as number | null;
  const reviews = lead.google_review_count as number | null;

  if (rating && rating >= 4.5) score += 10;
  else if (rating && rating >= 4.0) score += 5;

  if (reviews && reviews >= 100) score += 10;
  else if (reviews && reviews >= 50) score += 5;

  if (lead.website) score += 5;
  if (lead.email) score += 10;
  if (lead.phone) score += 5;

  // Tier bonus
  if (tier === 1) score += 10;
  else if (tier === 2) score += 7;
  else score += 5;

  // Base score for being in an affluent area
  score += 20;

  return Math.min(score, 100);
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

    const results: { area_name: string; found: number; qualified: number; errors: string[] }[] = [];
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

      // Search with each term
      for (const term of searchTerms) {
        const rawResults = await outscrapeSearch(
          term,
          area.latitude as number | null,
          area.longitude as number | null
        );

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

      // Score and save qualified leads — using SAME insert format as working scraper PUT handler
      let areaQualified = 0;
      for (const lead of newLeads) {
        const qualScore = calculateQualificationScore(lead, area.affluent_tier as number);

        if (qualScore >= 50) {
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
