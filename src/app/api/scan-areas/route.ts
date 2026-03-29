import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

function getKey(envKey: string): string {
  return process.env[envKey] || '';
}

// ─── OUTSCRAPER SEARCH ─────────────────────────────────────
async function outscrapeSearch(query: string, lat?: number, lng?: number): Promise<Record<string, unknown>[]> {
  const key = getKey('OUTSCRAPER_API_KEY');
  if (!key) return [];
  try {
    const params = new URLSearchParams({
      query,
      limit: '20',
      async: 'false',
    });
    if (lat && lng) {
      params.set('coordinates', `@${lat},${lng},14z`);
    }
    const res = await fetch(`https://api.app.outscraper.com/maps/search-v3?${params}`, {
      headers: { 'X-API-KEY': key },
    });
    if (!res.ok) return [];
    const data = await res.json();
    const results = data?.data;
    if (Array.isArray(results) && results.length > 0 && Array.isArray(results[0])) {
      return results[0].filter((r: unknown) => r && typeof r === 'object');
    }
    if (Array.isArray(results)) {
      return results.filter((r: unknown) => r && typeof r === 'object');
    }
    return [];
  } catch (err) {
    console.error('Outscraper error:', err);
    return [];
  }
}

// ─── PARSE OUTSCRAPER RESULT INTO LEAD ─────────────────────
function parseResult(r: Record<string, unknown>, areaName: string, country: string, niche: string): Record<string, unknown> | null {
  const name = (r.name || r.business_name || '') as string;
  if (!name || name.length < 2) return null;
  return {
    business_name: name,
    address: (r.full_address || r.address || '') as string || null,
    city: (r.city || '') as string || null,
    country,
    phone: (r.phone || '') as string || null,
    email: (r.email || '') as string || null,
    website: (r.site || r.website || '') as string || null,
    instagram_url: null,
    google_rating: r.rating ? Number(r.rating) : null,
    google_review_count: r.reviews ? Number(r.reviews) : null,
    google_maps_url: (r.google_maps_url || r.url || '') as string || null,
    source: 'google_maps',
    niche,
    area_source: areaName,
    pipeline_stage: 'new',
  };
}

// ─── CALCULATE QUALIFICATION SCORE ─────────────────────────
function calculateQualificationScore(lead: Record<string, unknown>, tier: number): number {
  let score = 0;
  const rating = lead.google_rating as number | null;
  const reviews = lead.google_review_count as number | null;
  const website = lead.website as string | null;

  if (rating && rating >= 4.5) score += 10;
  else if (rating && rating >= 4.0) score += 5;

  if (reviews && reviews >= 100) score += 10;
  else if (reviews && reviews >= 50) score += 5;

  if (website) score += 5;

  // Tier bonus
  if (tier === 1) score += 10;
  else if (tier === 2) score += 7;
  else score += 5;

  // Has contact info
  if (lead.email) score += 10;
  if (lead.phone) score += 5;

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
    const nicheParam = searchParams.get('niche'); // Optional — overrides DB search terms

    // Get areas to scan — either specific ID or next in queue
    let areas;
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

    const results: { area_name: string; found: number; qualified: number }[] = [];
    let totalFound = 0;
    let totalQualified = 0;
    let totalDuplicates = 0;

    for (const area of areas) {
      // If niche override provided, use "[niche] [area_name]" instead of DB search terms
      const nicheLabel = nicheParam || 'aesthetic clinic';
      const searchTerms = nicheParam
        ? [`${nicheParam} ${area.area_name}`]
        : [area.search_term_1, area.search_term_2, area.search_term_3].filter(Boolean);
      const allLeads: Record<string, unknown>[] = [];
      const seenNames = new Set<string>();

      // Search with each term
      for (const term of searchTerms) {
        const rawResults = await outscrapeSearch(term!, area.latitude, area.longitude);
        for (const r of rawResults) {
          const lead = parseResult(r, area.area_name, area.country, nicheLabel);
          if (!lead) continue;
          const nameKey = (lead.business_name as string).toLowerCase().trim();
          if (seenNames.has(nameKey)) continue;
          seenNames.add(nameKey);
          allLeads.push(lead);
        }
      }

      // Deduplicate against existing leads in DB
      const newLeads: Record<string, unknown>[] = [];
      for (const lead of allLeads) {
        const { data: existing } = await supabase
          .from('leads')
          .select('id')
          .ilike('business_name', lead.business_name as string)
          .eq('city', lead.city || '')
          .limit(1)
          .maybeSingle();

        if (existing) {
          totalDuplicates++;
          continue;
        }
        newLeads.push(lead);
      }

      // Score and save qualified leads
      let areaQualified = 0;
      for (const lead of newLeads) {
        const qualScore = calculateQualificationScore(lead, area.affluent_tier);
        lead.qualification_score = qualScore;

        if (qualScore >= 50) {
          const { error } = await supabase.from('leads').insert(lead);
          if (!error) areaQualified++;
        }
      }

      // Update area record
      await supabase
        .from('affluent_areas')
        .update({
          last_scanned: new Date().toISOString(),
          times_scanned: (area.times_scanned || 0) + 1,
          total_prospects_found: (area.total_prospects_found || 0) + newLeads.length,
          qualified_prospects_found: (area.qualified_prospects_found || 0) + areaQualified,
        })
        .eq('id', area.id);

      totalFound += newLeads.length;
      totalQualified += areaQualified;
      results.push({ area_name: area.area_name, found: newLeads.length, qualified: areaQualified });
    }

    // Log scan to scan_schedule
    await supabase.from('scan_schedule').insert({
      scan_date: new Date().toISOString().split('T')[0],
      area_ids: areas.map((a: { id: string }) => a.id),
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
    console.error('Scan error:', err);
    return NextResponse.json({ error: 'Scan failed', details: String(err) }, { status: 500 });
  }
}
