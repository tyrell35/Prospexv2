import { NextRequest, NextResponse } from 'next/server';

function getKey(envKey: string): string { return process.env[envKey] || ''; }

// ─── GOOGLE MAPS (Outscraper) ──────────────────────────────────
async function scrapeGoogleMaps(niche: string, location: string, country: string): Promise<Record<string, unknown>[]> {
  const apiKey = getKey('OUTSCRAPER_API_KEY');
  if (!apiKey) throw new Error('Outscraper API key not configured');
  const regionMap: Record<string, string> = { 'United States': 'us', 'United Kingdom': 'gb', 'Canada': 'ca', 'Australia': 'au', 'Ireland': 'ie', 'Germany': 'de', 'France': 'fr', 'Spain': 'es', 'Italy': 'it', 'Netherlands': 'nl' };
  const query = `${niche} in ${location}, ${country}`;
  const url = `https://api.app.outscraper.com/maps/search-v3?query=${encodeURIComponent(query)}&limit=30&region=${regionMap[country] || 'gb'}&language=en&async=false&dropDuplicates=true`;
  const response = await fetch(url, { headers: { 'X-API-KEY': apiKey } });
  if (!response.ok) throw new Error(`Outscraper error: ${response.status}`);
  const data = await response.json();
  return (data?.data?.[0] || []).map((item: Record<string, unknown>) => {
    const socialLinks = (item.social_links || []) as string[];
    return {
      business_name: item.name || 'Unknown', address: item.full_address || item.address || null,
      city: location, country, phone: item.phone || null, email: item.email || null,
      website: item.site || item.website || null,
      instagram_url: socialLinks.find((l: string) => l.includes('instagram.com')) || null,
      google_rating: item.rating || null, google_review_count: item.reviews || null,
      google_maps_url: item.google_maps_url || null, source: 'google_maps',
    };
  });
}

// ─── YELP (Apify) ──────────────────────────────────────────────
async function scrapeYelp(niche: string, location: string, country: string): Promise<Record<string, unknown>[]> {
  const apiToken = getKey('APIFY_API_TOKEN');
  if (!apiToken) throw new Error('Apify API token not configured');
  const url = `https://api.apify.com/v2/acts/yin/yelp-scraper/run-sync-get-dataset-items?token=${apiToken}`;
  const response = await fetch(url, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ searchTerms: [niche], locations: [`${location}, ${country}`], maxItems: 30 }),
  });
  if (!response.ok) throw new Error(`Yelp scrape error: ${response.status}`);
  const data = await response.json();
  return (data || []).map((item: Record<string, unknown>) => ({
    business_name: item.name || item.bizName || 'Unknown', address: item.address || item.fullAddress || null,
    city: location, country, phone: item.phone || null, email: item.email || null,
    website: item.website || item.bizUrl || null, instagram_url: null,
    google_rating: item.rating || null, google_review_count: item.reviewCount || null,
    google_maps_url: null, source: 'yelp',
  }));
}

// ─── FRESHA (Apify) ────────────────────────────────────────────
async function scrapeFresha(niche: string, location: string, country: string): Promise<Record<string, unknown>[]> {
  const apiToken = getKey('APIFY_API_TOKEN');
  if (!apiToken) return [];
  const searchUrl = `https://www.fresha.com/search?query=${encodeURIComponent(niche)}&location=${encodeURIComponent(location + ', ' + country)}`;
  try {
    const url = `https://api.apify.com/v2/acts/apify/web-scraper/run-sync-get-dataset-items?token=${apiToken}`;
    const response = await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ startUrls: [{ url: searchUrl }], pageFunction: `async function pageFunction(context) { const { $ } = context; const results = []; $('[data-qa="search-result-card"]').each((i, el) => { results.push({ name: $(el).find('[data-qa="venue-card-name"]').text().trim(), address: $(el).find('[data-qa="venue-card-address"]').text().trim(), rating: parseFloat($(el).find('[data-qa="venue-card-rating"]').text()) || null, reviewCount: parseInt($(el).find('[data-qa="venue-card-reviews"]').text()) || null }); }); return results; }`, maxPagesPerCrawl: 1 }),
    });
    if (!response.ok) return [];
    const data = await response.json();
    return (data || []).flat().filter((item: Record<string, unknown>) => item.name).map((item: Record<string, unknown>) => ({
      business_name: item.name || 'Unknown', address: item.address || null, city: location, country,
      phone: null, email: null, website: null, instagram_url: null,
      google_rating: item.rating || null, google_review_count: item.reviewCount || null,
      google_maps_url: null, source: 'fresha',
    }));
  } catch { return []; }
}

// ─── YELL.COM (Firecrawl - FREE UK directory) ──────────────────
async function scrapeYell(niche: string, location: string): Promise<Record<string, unknown>[]> {
  const firecrawlKey = getKey('FIRECRAWL_API_KEY');
  if (!firecrawlKey) return [];
  const searchUrl = `https://www.yell.com/ucs/UcsSearchAction.do?keywords=${encodeURIComponent(niche)}&location=${encodeURIComponent(location)}`;
  try {
    const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${firecrawlKey}` },
      body: JSON.stringify({ url: searchUrl, formats: ['markdown'] }),
    });
    if (!response.ok) return [];
    const data = await response.json();
    const markdown = data.data?.markdown || '';
    const businesses: Record<string, unknown>[] = [];
    const lines = markdown.split('\n');
    let currentBiz: Record<string, string | null> = {};
    for (const line of lines) {
      if (line.startsWith('###') || line.startsWith('##')) {
        if (currentBiz.business_name) businesses.push({ ...currentBiz, source: 'yell' });
        currentBiz = { business_name: line.replace(/^#+\s*/, '').replace(/\[|\]/g, '').trim(), address: null, phone: null, email: null, website: null, instagram_url: null, google_rating: null, google_review_count: null, google_maps_url: null, city: location, country: 'United Kingdom' };
      }
      const phoneMatch = line.match(/(?:Tel|Phone|Call).*?(\+?[\d\s()-]{10,})/i);
      if (phoneMatch && currentBiz.business_name) currentBiz.phone = phoneMatch[1].trim();
      const emailMatch = line.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
      if (emailMatch && currentBiz.business_name) currentBiz.email = emailMatch[1];
      const urlMatch = line.match(/\((https?:\/\/[^)]+)\)/);
      if (urlMatch && currentBiz.business_name && !urlMatch[1].includes('yell.com')) currentBiz.website = urlMatch[1];
    }
    if (currentBiz.business_name) businesses.push({ ...currentBiz, source: 'yell' });
    return businesses.slice(0, 30);
  } catch { return []; }
}

// ─── YELLOW PAGES (Firecrawl - FREE US directory) ──────────────
async function scrapeYellowPages(niche: string, location: string): Promise<Record<string, unknown>[]> {
  const firecrawlKey = getKey('FIRECRAWL_API_KEY');
  if (!firecrawlKey) return [];
  const searchUrl = `https://www.yellowpages.com/search?search_terms=${encodeURIComponent(niche)}&geo_location_terms=${encodeURIComponent(location)}`;
  try {
    const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${firecrawlKey}` },
      body: JSON.stringify({ url: searchUrl, formats: ['markdown'] }),
    });
    if (!response.ok) return [];
    const data = await response.json();
    const markdown = data.data?.markdown || '';
    const businesses: Record<string, unknown>[] = [];
    const lines = markdown.split('\n');
    let currentBiz: Record<string, string | null> = {};
    for (const line of lines) {
      if (line.startsWith('###') || line.startsWith('##')) {
        if (currentBiz.business_name) businesses.push({ ...currentBiz, source: 'yellow_pages' });
        currentBiz = { business_name: line.replace(/^#+\s*/, '').replace(/\[|\]/g, '').replace(/\d+\.\s*/, '').trim(), address: null, phone: null, email: null, website: null, instagram_url: null, google_rating: null, google_review_count: null, google_maps_url: null, city: location, country: 'United States' };
      }
      const phoneMatch = line.match(/\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}/);
      if (phoneMatch && currentBiz.business_name) currentBiz.phone = phoneMatch[0];
      const urlMatch = line.match(/\((https?:\/\/(?!www\.yellowpages)[^)]+)\)/);
      if (urlMatch && currentBiz.business_name) currentBiz.website = urlMatch[1];
    }
    if (currentBiz.business_name) businesses.push({ ...currentBiz, source: 'yellow_pages' });
    return businesses.filter(b => b.business_name && (b.business_name as string).length > 2).slice(0, 30);
  } catch { return []; }
}

// ─── BARK.COM (Firecrawl - businesses seeking marketing) ───────
async function scrapeBark(niche: string, location: string, country: string): Promise<Record<string, unknown>[]> {
  const firecrawlKey = getKey('FIRECRAWL_API_KEY');
  if (!firecrawlKey) return [];
  const countryDomain = country === 'United States' ? 'bark.com' : 'bark.com';
  const searchUrl = `https://www.${countryDomain}/find/${encodeURIComponent(niche.replace(/\s+/g, '-'))}--${encodeURIComponent(location.replace(/\s+/g, '-'))}`;
  try {
    const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${firecrawlKey}` },
      body: JSON.stringify({ url: searchUrl, formats: ['markdown'] }),
    });
    if (!response.ok) return [];
    const data = await response.json();
    const markdown = data.data?.markdown || '';
    const businesses: Record<string, unknown>[] = [];
    const lines = markdown.split('\n');
    let currentBiz: Record<string, string | null> = {};
    for (const line of lines) {
      if ((line.startsWith('###') || line.startsWith('##')) && !line.includes('Results') && !line.includes('Search')) {
        if (currentBiz.business_name) businesses.push({ ...currentBiz, source: 'bark' });
        currentBiz = { business_name: line.replace(/^#+\s*/, '').replace(/\[|\]/g, '').trim(), address: null, phone: null, email: null, website: null, instagram_url: null, google_rating: null, google_review_count: null, google_maps_url: null, city: location, country };
      }
      const phoneMatch = line.match(/(?:Tel|Phone|Call).*?(\+?[\d\s()-]{10,})/i);
      if (phoneMatch && currentBiz.business_name) currentBiz.phone = phoneMatch[1].trim();
    }
    if (currentBiz.business_name) businesses.push({ ...currentBiz, source: 'bark' });
    return businesses.filter(b => b.business_name && (b.business_name as string).length > 2).slice(0, 20);
  } catch { return []; }
}

// ─── MAIN HANDLER ──────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const { niche, location, country = 'United Kingdom', source } = await request.json();
    if (!niche || !location) return NextResponse.json({ error: 'Niche and location are required' }, { status: 400 });

    let results: Record<string, unknown>[] = [];
    const errors: string[] = [];

    const trySource = async (name: string, fn: () => Promise<Record<string, unknown>[]>) => {
      try { const r = await fn(); results = [...results, ...r]; } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : `${name} failed`;
        errors.push(msg);
        if (source !== 'all') throw e;
      }
    };

    if (source === 'google_maps' || source === 'all') await trySource('Google Maps', () => scrapeGoogleMaps(niche, location, country));
    if (source === 'yelp' || source === 'all') await trySource('Yelp', () => scrapeYelp(niche, location, country));
    if (source === 'fresha' || source === 'all') await trySource('Fresha', () => scrapeFresha(niche, location, country));
    if (source === 'yell' || source === 'all') await trySource('Yell', () => scrapeYell(niche, location));
    if (source === 'yellow_pages' || source === 'all') await trySource('Yellow Pages', () => scrapeYellowPages(niche, location));
    if (source === 'bark' || source === 'all') await trySource('Bark', () => scrapeBark(niche, location, country));

    // De-duplicate by business name
    const seen = new Set<string>();
    const unique = results.filter(r => {
      const key = (r.business_name as string).toLowerCase().trim();
      if (seen.has(key)) return false;
      seen.add(key); return true;
    });

    return NextResponse.json({ results: unique, count: unique.length, errors: errors.length > 0 ? errors : undefined });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Scraping failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
