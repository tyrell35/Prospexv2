import { NextRequest, NextResponse } from 'next/server';

import { supabaseAdmin as supabase } from "@/lib/supabase-admin";

// ─── COUNTRY CODES FOR OUTSCRAPER ────────────────────────────────
const COUNTRY_REGIONS: Record<string, string> = {
  'United Kingdom': 'GB', 'United States': 'US', 'Canada': 'CA',
  'Australia': 'AU', 'Ireland': 'IE',
};

// ─── OUTSCRAPER SEARCH ───────────────────────────────────────────
async function searchOutscraper(query: string, location: string, country: string, limit: number = 20): Promise<any[]> {
  const apiKey = process.env.OUTSCRAPER_API_KEY;
  if (!apiKey) return [];

  try {
    const searchQuery = `${query} in ${location}, ${country}`;
    const region = COUNTRY_REGIONS[country] || 'GB';
    const url = `https://api.app.outscraper.com/maps/search-v3?query=${encodeURIComponent(searchQuery)}&limit=${limit}&region=${region}&language=en&async=false`;

    const res = await fetch(url, {
      headers: { 'X-API-KEY': apiKey },
      signal: AbortSignal.timeout(60000),
    });

    if (!res.ok) return [];
    const data = await res.json();

    if (!data?.data?.[0]) return [];
    return data.data[0].map((item: any) => ({
      business_name: item.name || '',
      website: item.site || null,
      phone: item.phone || null,
      email: null,
      address: item.full_address || null,
      city: item.city || location,
      county: item.state || null,
      region: null,
      country,
      google_rating: item.rating || null,
      google_review_count: item.reviews || null,
      instagram_url: null,
      source: 'outscraper',
      niche: query,
    }));
  } catch {
    return [];
  }
}

// ─── DEDUPLICATE AGAINST EXISTING LEADS ──────────────────────────
async function deduplicateAndSave(leads: any[], niche: string): Promise<{ saved: number; skipped: number }> {
  let saved = 0;
  let skipped = 0;

  for (const lead of leads) {
    if (!lead.business_name) { skipped++; continue; }

    // Check for duplicate by name + city
    const { data: existing } = await supabase
      .from('leads')
      .select('id')
      .ilike('business_name', lead.business_name)
      .ilike('city', lead.city || '%')
      .limit(1)
      .maybeSingle();

    if (existing) { skipped++; continue; }

    const { error } = await supabase.from('leads').insert({
      business_name: lead.business_name,
      website: lead.website,
      phone: lead.phone,
      email: lead.email,
      address: lead.address,
      city: lead.city,
      county: lead.county,
      region: lead.region,
      country: lead.country,
      google_rating: lead.google_rating,
      google_review_count: lead.google_review_count,
      instagram_url: lead.instagram_url,
      source: 'google_maps',
      niche: niche,
      has_website: !!lead.website && String(lead.website).length > 0,
      has_email: !!lead.email,
      has_phone: !!lead.phone,
      has_social: !!lead.instagram_url,
      has_pixel: false,
      has_booking: false,
      whatsapp_eligible: !!(lead.phone && String(lead.phone).length > 0),
      discovery_source: 'country_scrape',
    });

    if (!error) saved++;
    else skipped++;
  }

  return { saved, skipped };
}

// ─── MAIN: COUNTRY / REGION SCALE SCRAPE ─────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      niche,
      country = 'United Kingdom',
      region,              // optional: "London", "South East", etc.
      cities,              // optional: ["London", "Manchester", ...]
      leads_per_city = 20, // how many leads per city query
      max_cities = 10,     // max cities to scrape in one request
    } = body;

    if (!niche) return NextResponse.json({ error: 'niche is required' }, { status: 400 });

    let citiesToScrape: string[] = [];

    if (cities && cities.length > 0) {
      // User provided specific cities
      citiesToScrape = cities.slice(0, max_cities);
    } else if (region) {
      // Lookup cities in region
      const { data: regionData } = await supabase
        .from('region_lookup')
        .select('cities')
        .eq('country', country)
        .eq('region', region)
        .single();

      if (regionData?.cities) {
        citiesToScrape = (regionData.cities as string[]).slice(0, max_cities);
      } else {
        return NextResponse.json({ error: `Region "${region}" not found for ${country}` }, { status: 404 });
      }
    } else {
      // Country-wide: grab top cities from all regions
      const { data: regions } = await supabase
        .from('region_lookup')
        .select('cities, population')
        .eq('country', country)
        .order('population', { ascending: false });

      if (regions) {
        for (const r of regions) {
          const rCities = r.cities as string[];
          // Take top 2-3 cities from each region, largest regions first
          citiesToScrape.push(...rCities.slice(0, 2));
          if (citiesToScrape.length >= max_cities) break;
        }
        citiesToScrape = citiesToScrape.slice(0, max_cities);
      }
    }

    if (citiesToScrape.length === 0) {
      return NextResponse.json({ error: 'No cities found to scrape' }, { status: 400 });
    }

    // Scrape each city
    const allResults: { city: string; found: number; saved: number; skipped: number }[] = [];
    let totalFound = 0;
    let totalSaved = 0;

    for (const city of citiesToScrape) {
      const leads = await searchOutscraper(niche, city, country, leads_per_city);
      totalFound += leads.length;

      // Tag with region
      for (const lead of leads) {
        lead.region = region || null;
      }

      const { saved, skipped } = await deduplicateAndSave(leads, niche);
      totalSaved += saved;

      allResults.push({ city, found: leads.length, saved, skipped });

      // Rate limit: 1.5s between cities
      if (citiesToScrape.indexOf(city) < citiesToScrape.length - 1) {
        await new Promise(r => setTimeout(r, 1500));
      }
    }

    return NextResponse.json({
      niche,
      country,
      region: region || 'all',
      cities_scraped: citiesToScrape.length,
      total_found: totalFound,
      total_saved: totalSaved,
      total_duplicates: totalFound - totalSaved,
      results_by_city: allResults,
      message: `Scraped ${citiesToScrape.length} cities, found ${totalFound} businesses, saved ${totalSaved} new leads.`,
    });

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// ─── GET: List available regions ─────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const country = searchParams.get('country') || 'United Kingdom';

    const { data: regions } = await supabase
      .from('region_lookup')
      .select('region, cities, population')
      .eq('country', country)
      .order('population', { ascending: false });

    return NextResponse.json({
      country,
      regions: (regions || []).map(r => ({
        name: r.region,
        city_count: (r.cities as string[]).length,
        population: r.population,
        top_cities: (r.cities as string[]).slice(0, 5),
      })),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
