import { NextRequest, NextResponse } from 'next/server';

function getKey(envKey: string): string { return process.env[envKey] || ''; }

// ─── LOCATION FILTER ───────────────────────────────────────────
// Post-filter results to only include businesses in the searched location
function matchesLocation(result: Record<string, unknown>, searchLocation: string): boolean {
  const loc = searchLocation.toLowerCase().trim();
  // Check address, city, and full_address fields
  const fieldsToCheck = [
    result.address,
    result.full_address,
    result.city,
    result.area,
    result.state,
    result.suburb,
  ];
  for (const field of fieldsToCheck) {
    if (typeof field === 'string' && field.toLowerCase().includes(loc)) {
      return true;
    }
  }
  return false;
}

// Safely extract array from various API response shapes
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

interface LeadResult {
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
  source: string;
}

// ─── GOOGLE MAPS (Outscraper) ──────────────────────────────────
async function scrapeGoogleMaps(niche: string, location: string, country: string): Promise<LeadResult[]> {
  const apiKey = getKey('OUTSCRAPER_API_KEY');
  if (!apiKey) throw new Error('Outscraper API key not configured. Add it in Settings.');

  const regionMap: Record<string, string> = {
    'United States': 'us', 'United Kingdom': 'gb', 'Canada': 'ca', 'Australia': 'au',
    'Ireland': 'ie', 'Germany': 'de', 'France': 'fr', 'Spain': 'es', 'Italy': 'it', 'Netherlands': 'nl',
  };
  const region = regionMap[country] || 'gb';

  // Precise comma-separated format works best for Outscraper location accuracy
  const query = `${niche}, ${location}, ${country}`;

  const params = new URLSearchParams({
    query,
    limit: '50', // Fetch extra so we still have ~30 after location filtering
    region,
    language: 'en',
    async: 'false',
    dropDuplicates: 'true',
    extractContacts: 'true', // Extract emails/phones from websites
    enrichment: 'emails_and_contacts', // Enable email enrichment
  });

  const url = `https://api.app.outscraper.com/maps/search-v3?${params.toString()}`;
  const response = await fetch(url, { headers: { 'X-API-KEY': apiKey } });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`Outscraper error (${response.status}): ${errText.slice(0, 200)}`);
  }

  const rawData = await response.json();
  const items = safeArray(rawData);

  const mapped: LeadResult[] = items
    .filter(item => item.name)
    .map(item => {
      // Emails: Outscraper returns in multiple fields depending on plan
      const emailRaw = item.email || item.email_1 || item.contact_email 
        || (Array.isArray(item.emails) && item.emails.length > 0 ? item.emails[0] : null)
        || (Array.isArray(item.emails_and_contacts) && item.emails_and_contacts.length > 0 ? item.emails_and_contacts[0] : null);
      // Phones: multiple possible fields
      const phoneRaw = item.phone || item.phone_1 
        || (Array.isArray(item.phones) && item.phones.length > 0 ? item.phones[0] : null);
      // Instagram: check social_links array + direct field
      const socialLinks = Array.isArray(item.social_links) ? (item.social_links as string[]) : [];
      const igFromSocial = socialLinks.find(l => typeof l === 'string' && l.includes('instagram.com')) || null;
      const igFromField = typeof item.instagram === 'string' ? item.instagram : null;
      const ig = igFromSocial || igFromField;
      return {
        business_name: String(item.name || 'Unknown'),
        address: item.full_address ? String(item.full_address) : (item.address ? String(item.address) : null),
        city: item.city ? String(item.city) : location,
        country: item.country ? String(item.country) : country,
        phone: phoneRaw ? String(phoneRaw) : null,
        email: typeof emailRaw === 'string' ? emailRaw : null,
        website: item.site ? String(item.site) : (item.website ? String(item.website) : null),
        instagram_url: ig ? String(ig) : null,
        google_rating: typeof item.rating === 'number' ? item.rating : null,
        google_review_count: typeof item.reviews === 'number' ? item.reviews : (typeof item.reviews_count === 'number' ? item.reviews_count : null),
        google_maps_url: item.google_maps_url ? String(item.google_maps_url) : null,
        source: 'google_maps',
      };
    });

  // ★ KEY FIX: Filter to only results actually in the searched location
  const filtered = mapped.filter(r => {
    const address = (r.address || '').toLowerCase();
    const city = (r.city || '').toLowerCase();
    const loc = location.toLowerCase().trim();
    return address.includes(loc) || city.includes(loc) || city === loc;
  });

  // If filtering removed everything (location name might be formatted differently), return unfiltered
  return filtered.length > 0 ? filtered.slice(0, 30) : mapped.slice(0, 30);
}

// ─── YELP (Apify) ──────────────────────────────────────────────
async function scrapeYelp(niche: string, location: string, country: string): Promise<LeadResult[]> {
  const apiToken = getKey('APIFY_API_TOKEN');
  if (!apiToken) throw new Error('Apify API token not configured. Add it in Settings.');

  const url = `https://api.apify.com/v2/acts/yin/yelp-scraper/run-sync-get-dataset-items?token=${apiToken}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      searchTerms: [niche],
      locations: [`${location}, ${country}`],
      maxItems: 30,
    }),
  });

  if (!response.ok) throw new Error(`Yelp error (${response.status})`);
  const rawData = await response.json();
  const items = Array.isArray(rawData) ? rawData : [];

  return items.map((item: Record<string, unknown>) => ({
    business_name: String(item.name || item.bizName || 'Unknown'),
    address: item.address ? String(item.address) : (item.fullAddress ? String(item.fullAddress) : null),
    city: location,
    country,
    phone: item.phone ? String(item.phone) : null,
    email: item.email ? String(item.email) : null,
    website: item.website ? String(item.website) : (item.bizUrl ? String(item.bizUrl) : null),
    instagram_url: null,
    google_rating: typeof item.rating === 'number' ? item.rating : null,
    google_review_count: typeof item.reviewCount === 'number' ? item.reviewCount : null,
    google_maps_url: null,
    source: 'yelp',
  }));
}

// ─── FRESHA (Apify) ────────────────────────────────────────────
async function scrapeFresha(niche: string, location: string, country: string): Promise<LeadResult[]> {
  const apiToken = getKey('APIFY_API_TOKEN');
  if (!apiToken) return [];
  try {
    const searchUrl = `https://www.fresha.com/search?query=${encodeURIComponent(niche)}&location=${encodeURIComponent(location + ', ' + country)}`;
    const url = `https://api.apify.com/v2/acts/apify/web-scraper/run-sync-get-dataset-items?token=${apiToken}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        startUrls: [{ url: searchUrl }],
        pageFunction: `async function pageFunction(context) { const { $ } = context; const results = []; $('[data-qa="search-result-card"]').each((i, el) => { results.push({ name: $(el).find('[data-qa="venue-card-name"]').text().trim(), address: $(el).find('[data-qa="venue-card-address"]').text().trim(), rating: parseFloat($(el).find('[data-qa="venue-card-rating"]').text()) || null, reviewCount: parseInt($(el).find('[data-qa="venue-card-reviews"]').text()) || null }); }); return results; }`,
        maxPagesPerCrawl: 1,
      }),
    });
    if (!response.ok) return [];
    const rawData = await response.json();
    const items = Array.isArray(rawData) ? rawData.flat().filter((i: unknown) => i && typeof i === 'object') : [];
    return items.filter((item: Record<string, unknown>) => item.name).map((item: Record<string, unknown>) => ({
      business_name: String(item.name),
      address: item.address ? String(item.address) : null,
      city: location, country,
      phone: null, email: null, website: null, instagram_url: null,
      google_rating: typeof item.rating === 'number' ? item.rating : null,
      google_review_count: typeof item.reviewCount === 'number' ? item.reviewCount : null,
      google_maps_url: null, source: 'fresha',
    }));
  } catch { return []; }
}

// ─── YELL.COM (Apify Web Scraper - UK) ─────────────────────────
async function scrapeYell(niche: string, location: string): Promise<LeadResult[]> {
  const apiToken = getKey('APIFY_API_TOKEN');
  if (!apiToken) {
    // Fallback: try Firecrawl
    return scrapeYellFirecrawl(niche, location);
  }
  try {
    const searchUrl = `https://www.yell.com/ucs/UcsSearchAction.do?keywords=${encodeURIComponent(niche)}&location=${encodeURIComponent(location)}`;
    const url = `https://api.apify.com/v2/acts/apify/web-scraper/run-sync-get-dataset-items?token=${apiToken}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        startUrls: [{ url: searchUrl }],
        pageFunction: `async function pageFunction(context) {
          const { $, request } = context;
          const results = [];
          $('.businessCapsule--mainRow').each((i, el) => {
            const name = $(el).find('.businessCapsule--name a').text().trim();
            const phone = $(el).find('.businessCapsule--phone a').text().trim();
            const website = $(el).find('.businessCapsule--ctaBtn a[href*="http"]').attr('href') || null;
            const address = $(el).find('.businessCapsule--address').text().trim();
            const rating = parseFloat($(el).find('.stars--rating').text()) || null;
            const reviewCount = parseInt($(el).find('.stars--count').text().replace(/[^0-9]/g, '')) || null;
            if (name) results.push({ name, phone: phone || null, website, address: address || null, rating, reviewCount });
          });
          return results;
        }`,
        maxPagesPerCrawl: 1,
      }),
    });
    if (!response.ok) return scrapeYellFirecrawl(niche, location);
    const rawData = await response.json();
    const items = Array.isArray(rawData) ? rawData.flat().filter((i: unknown) => i && typeof i === 'object' && (i as Record<string, unknown>).name) : [];
    if (items.length === 0) return scrapeYellFirecrawl(niche, location);
    return items.map((item: Record<string, unknown>) => ({
      business_name: String(item.name), address: item.address ? String(item.address) : null,
      city: location, country: 'United Kingdom',
      phone: item.phone ? String(item.phone) : null, email: null,
      website: item.website ? String(item.website) : null, instagram_url: null,
      google_rating: typeof item.rating === 'number' ? item.rating : null,
      google_review_count: typeof item.reviewCount === 'number' ? item.reviewCount : null,
      google_maps_url: null, source: 'yell',
    }));
  } catch { return scrapeYellFirecrawl(niche, location); }
}

// Yell.com Firecrawl fallback
async function scrapeYellFirecrawl(niche: string, location: string): Promise<LeadResult[]> {
  const firecrawlKey = getKey('FIRECRAWL_API_KEY');
  if (!firecrawlKey) return [];
  try {
    const searchUrl = `https://www.yell.com/ucs/UcsSearchAction.do?keywords=${encodeURIComponent(niche)}&location=${encodeURIComponent(location)}`;
    const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${firecrawlKey}` },
      body: JSON.stringify({ url: searchUrl, formats: ['links', 'markdown'] }),
    });
    if (!response.ok) return [];
    const data = await response.json();
    const md: string = data?.data?.markdown || '';
    const results: LeadResult[] = [];

    // Look for phone patterns and business names in proximity
    const phoneRegex = /(\d{4,5}\s?\d{5,6}|\+44\s?\d{4}\s?\d{6}|0\d{2,4}\s?\d{3,4}\s?\d{3,4})/g;
    const lines = md.split('\n').filter(l => l.trim().length > 0);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Business names are typically in bold or heading format
      const nameMatch = line.match(/\*\*([^*]+)\*\*/) || line.match(/^#{1,3}\s+(.+)/);
      if (nameMatch && nameMatch[1].length > 3 && nameMatch[1].length < 80) {
        const name = nameMatch[1].replace(/\[|\]/g, '').trim();
        if (['Yell', 'Results', 'Search', 'Sponsored', 'Page', 'Next', 'Previous', 'Filter'].some(skip => name.includes(skip))) continue;
        // Look ahead for phone/website in next few lines
        const context = lines.slice(i, i + 8).join(' ');
        const phoneMatch = context.match(phoneRegex);
        const urlMatch = context.match(/https?:\/\/(?!www\.yell\.com)[^\s)]+/);
        const emailMatch = context.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
        results.push({
          business_name: name, address: null, city: location, country: 'United Kingdom',
          phone: phoneMatch ? phoneMatch[0] : null, email: emailMatch ? emailMatch[1] : null,
          website: urlMatch ? urlMatch[0] : null, instagram_url: null,
          google_rating: null, google_review_count: null, google_maps_url: null, source: 'yell',
        });
      }
    }
    return results.slice(0, 25);
  } catch { return []; }
}

// ─── YELLOW PAGES (Apify Web Scraper - US) ─────────────────────
async function scrapeYellowPages(niche: string, location: string): Promise<LeadResult[]> {
  const apiToken = getKey('APIFY_API_TOKEN');
  if (!apiToken) {
    return scrapeYellowPagesFirecrawl(niche, location);
  }
  try {
    const searchUrl = `https://www.yellowpages.com/search?search_terms=${encodeURIComponent(niche)}&geo_location_terms=${encodeURIComponent(location)}`;
    const url = `https://api.apify.com/v2/acts/apify/web-scraper/run-sync-get-dataset-items?token=${apiToken}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        startUrls: [{ url: searchUrl }],
        pageFunction: `async function pageFunction(context) {
          const { $, request } = context;
          const results = [];
          $('.result').each((i, el) => {
            const name = $(el).find('.business-name a').text().trim() || $(el).find('a.business-name').text().trim();
            const phone = $(el).find('.phones').text().trim();
            const website = $(el).find('a.track-visit-website').attr('href') || null;
            const address = $(el).find('.street-address').text().trim();
            const locality = $(el).find('.locality').text().trim();
            if (name) results.push({ name, phone: phone || null, website, address: [address, locality].filter(Boolean).join(', ') || null });
          });
          return results;
        }`,
        maxPagesPerCrawl: 1,
      }),
    });
    if (!response.ok) return scrapeYellowPagesFirecrawl(niche, location);
    const rawData = await response.json();
    const items = Array.isArray(rawData) ? rawData.flat().filter((i: unknown) => i && typeof i === 'object' && (i as Record<string, unknown>).name) : [];
    if (items.length === 0) return scrapeYellowPagesFirecrawl(niche, location);
    return items.map((item: Record<string, unknown>) => ({
      business_name: String(item.name), address: item.address ? String(item.address) : null,
      city: location, country: 'United States',
      phone: item.phone ? String(item.phone) : null, email: null,
      website: item.website ? String(item.website) : null, instagram_url: null,
      google_rating: null, google_review_count: null, google_maps_url: null, source: 'yellow_pages',
    }));
  } catch { return scrapeYellowPagesFirecrawl(niche, location); }
}

// Yellow Pages Firecrawl fallback
async function scrapeYellowPagesFirecrawl(niche: string, location: string): Promise<LeadResult[]> {
  const firecrawlKey = getKey('FIRECRAWL_API_KEY');
  if (!firecrawlKey) return [];
  try {
    const searchUrl = `https://www.yellowpages.com/search?search_terms=${encodeURIComponent(niche)}&geo_location_terms=${encodeURIComponent(location)}`;
    const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${firecrawlKey}` },
      body: JSON.stringify({ url: searchUrl, formats: ['links', 'markdown'] }),
    });
    if (!response.ok) return [];
    const data = await response.json();
    const md: string = data?.data?.markdown || '';
    const results: LeadResult[] = [];
    const lines = md.split('\n').filter(l => l.trim().length > 0);
    const usPhoneRegex = /\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}/;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const nameMatch = line.match(/\*\*([^*]+)\*\*/) || line.match(/^#{1,3}\s+\d*\.?\s*(.+)/);
      if (nameMatch) {
        const name = (nameMatch[1] || nameMatch[2] || '').replace(/\[|\]/g, '').trim();
        if (name.length < 3 || name.length > 80) continue;
        if (['Yellow Pages', 'Results', 'Search', 'Sponsored', 'Page', 'Next', 'Filter', 'Sort', 'Map'].some(skip => name.includes(skip))) continue;
        const context = lines.slice(i, i + 8).join(' ');
        const phoneMatch = context.match(usPhoneRegex);
        const urlMatch = context.match(/https?:\/\/(?!www\.yellowpages\.com)[^\s),"]+/);
        results.push({
          business_name: name, address: null, city: location, country: 'United States',
          phone: phoneMatch ? phoneMatch[0] : null, email: null,
          website: urlMatch ? urlMatch[0] : null, instagram_url: null,
          google_rating: null, google_review_count: null, google_maps_url: null, source: 'yellow_pages',
        });
      }
    }
    return results.slice(0, 25);
  } catch { return []; }
}

// ─── BARK.COM (Apify Web Scraper) ──────────────────────────────
async function scrapeBark(niche: string, location: string, country: string): Promise<LeadResult[]> {
  const apiToken = getKey('APIFY_API_TOKEN');
  if (!apiToken) {
    return scrapeBarkFirecrawl(niche, location, country);
  }
  try {
    // Bark uses slug-based URLs
    const nicheSlug = niche.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const locationSlug = location.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const countryPrefix = country === 'United Kingdom' ? 'gb' : country === 'United States' ? 'us' : country === 'Canada' ? 'ca' : 'gb';
    const searchUrl = `https://www.bark.com/en/${countryPrefix}/find/${nicheSlug}/${locationSlug}/`;

    const url = `https://api.apify.com/v2/acts/apify/web-scraper/run-sync-get-dataset-items?token=${apiToken}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        startUrls: [{ url: searchUrl }],
        pageFunction: `async function pageFunction(context) {
          const { $, request } = context;
          const results = [];
          $('[class*="ProfileCard"], [class*="profile-card"], .seller-card').each((i, el) => {
            const name = $(el).find('h2, h3, [class*="name"]').first().text().trim();
            const phone = $(el).find('[href^="tel:"]').attr('href')?.replace('tel:', '') || null;
            const location = $(el).find('[class*="location"], [class*="address"]').text().trim();
            if (name && name.length > 2) results.push({ name, phone, address: location || null });
          });
          return results;
        }`,
        maxPagesPerCrawl: 1,
      }),
    });
    if (!response.ok) return scrapeBarkFirecrawl(niche, location, country);
    const rawData = await response.json();
    const items = Array.isArray(rawData) ? rawData.flat().filter((i: unknown) => i && typeof i === 'object' && (i as Record<string, unknown>).name) : [];
    if (items.length === 0) return scrapeBarkFirecrawl(niche, location, country);
    return items.map((item: Record<string, unknown>) => ({
      business_name: String(item.name), address: item.address ? String(item.address) : null,
      city: location, country,
      phone: item.phone ? String(item.phone) : null, email: null,
      website: null, instagram_url: null,
      google_rating: null, google_review_count: null, google_maps_url: null, source: 'bark',
    }));
  } catch { return scrapeBarkFirecrawl(niche, location, country); }
}

// Bark Firecrawl fallback
async function scrapeBarkFirecrawl(niche: string, location: string, country: string): Promise<LeadResult[]> {
  const firecrawlKey = getKey('FIRECRAWL_API_KEY');
  if (!firecrawlKey) return [];
  try {
    const nicheSlug = niche.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const locationSlug = location.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const countryPrefix = country === 'United Kingdom' ? 'gb' : country === 'United States' ? 'us' : 'gb';
    const searchUrl = `https://www.bark.com/en/${countryPrefix}/find/${nicheSlug}/${locationSlug}/`;

    const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${firecrawlKey}` },
      body: JSON.stringify({ url: searchUrl, formats: ['links', 'markdown'] }),
    });
    if (!response.ok) return [];
    const data = await response.json();
    const md: string = data?.data?.markdown || '';
    const results: LeadResult[] = [];
    const lines = md.split('\n').filter(l => l.trim().length > 0);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const nameMatch = line.match(/\*\*([^*]+)\*\*/) || line.match(/^#{1,3}\s+(.+)/);
      if (nameMatch) {
        const name = (nameMatch[1] || '').replace(/\[|\]/g, '').trim();
        if (name.length < 3 || name.length > 80) continue;
        if (['Bark', 'Results', 'Search', 'Find', 'Professionals', 'Compare', 'Get', 'Top', 'How', 'Why'].some(skip => name.startsWith(skip))) continue;
        const context = lines.slice(i, i + 6).join(' ');
        const phoneRegex = /(\+?\d[\d\s()-]{9,})/;
        const phoneMatch = context.match(phoneRegex);
        results.push({
          business_name: name, address: null, city: location, country,
          phone: phoneMatch ? phoneMatch[1].trim() : null, email: null,
          website: null, instagram_url: null,
          google_rating: null, google_review_count: null, google_maps_url: null, source: 'bark',
        });
      }
    }
    return results.slice(0, 20);
  } catch { return []; }
}

// ─── AUTO ENRICHMENT ───────────────────────────────────────────
// Crawl business websites to extract emails, phones, and Instagram
async function enrichFromWebsite(lead: LeadResult): Promise<LeadResult> {
  if (!lead.website) return lead;
  // Skip if already has both email and instagram
  if (lead.email && lead.instagram_url) return lead;

  const firecrawlKey = getKey('FIRECRAWL_API_KEY');
  if (!firecrawlKey) return lead;

  try {
    // Crawl the website + contact page
    const urls = [lead.website];
    const domain = lead.website.replace(/https?:\/\//, '').replace(/\/$/, '');
    // Also try common contact pages
    const contactPaths = ['/contact', '/contact-us', '/about', '/about-us'];
    
    let allText = '';

    for (const targetUrl of urls) {
      try {
        const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${firecrawlKey}` },
          body: JSON.stringify({ 
            url: targetUrl, 
            formats: ['markdown'],
            onlyMainContent: false, // Get full page including footer (where contact info often lives)
          }),
        });
        if (response.ok) {
          const data = await response.json();
          allText += (data?.data?.markdown || '') + '\n';
        }
      } catch {
        // Skip failed pages
      }
    }

    // Try contact page too (often has email/phone)
    if (!lead.email) {
      for (const path of contactPaths) {
        try {
          const contactUrl = `https://${domain}${path}`;
          const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${firecrawlKey}` },
            body: JSON.stringify({ url: contactUrl, formats: ['markdown'], onlyMainContent: false }),
          });
          if (response.ok) {
            const data = await response.json();
            const md = data?.data?.markdown || '';
            if (md.length > 100) { // Got real content
              allText += md + '\n';
              break; // Found a working contact page, stop trying others
            }
          }
        } catch {
          // Skip
        }
      }
    }

    if (allText.length === 0) return lead;

    // Extract emails
    if (!lead.email) {
      const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
      const emails = (allText.match(emailRegex) || []).filter(e => {
        const lower = e.toLowerCase();
        return !lower.endsWith('.png') && !lower.endsWith('.jpg') && !lower.endsWith('.gif') &&
          !lower.endsWith('.svg') && !lower.endsWith('.webp') && !lower.endsWith('.css') &&
          !lower.endsWith('.js') && !lower.includes('example.com') && !lower.includes('sentry') &&
          !lower.includes('webpack') && !lower.includes('wixpress') && !lower.includes('schema.org') &&
          !lower.includes('googleapis') && !lower.includes('cloudflare') &&
          !lower.includes('@2x') && !lower.includes('noreply') && !lower.includes('no-reply') &&
          lower.length < 60 && lower.length > 5;
      });
      // Prefer emails with the business domain, then info@, hello@, contact@
      const domainClean = domain.replace('www.', '');
      const sorted = emails.sort((a, b) => {
        const aIsDomain = a.includes(domainClean) ? 0 : 1;
        const bIsDomain = b.includes(domainClean) ? 0 : 1;
        if (aIsDomain !== bIsDomain) return aIsDomain - bIsDomain;
        const prefOrder = ['info@', 'hello@', 'contact@', 'enquiries@', 'bookings@', 'reception@'];
        const aIdx = prefOrder.findIndex(p => a.toLowerCase().startsWith(p));
        const bIdx = prefOrder.findIndex(p => b.toLowerCase().startsWith(p));
        return (aIdx === -1 ? 99 : aIdx) - (bIdx === -1 ? 99 : bIdx);
      });
      if (sorted.length > 0) {
        lead.email = sorted[0];
      }
    }

    // Extract Instagram
    if (!lead.instagram_url) {
      const igRegex = /(?:https?:\/\/)?(?:www\.)?instagram\.com\/([a-zA-Z0-9_.]{2,30})\/?/gi;
      const igMatches: string[] = [];
      let match;
      while ((match = igRegex.exec(allText)) !== null) {
        const handle = match[1].toLowerCase();
        // Filter out generic Instagram paths
        if (!['p', 'reel', 'reels', 'stories', 'explore', 'accounts', 'about', 'developer', 'legal', 'privacy', 'terms', 'help'].includes(handle)) {
          igMatches.push(`https://instagram.com/${match[1]}`);
        }
      }
      if (igMatches.length > 0) {
        lead.instagram_url = igMatches[0];
      }
    }

    // Extract phone if missing
    if (!lead.phone) {
      const phoneRegex = /(?:tel:|phone:|call\s*:?\s*)?(\+?[\d][\d\s()-]{9,18}\d)/gi;
      const phones = (allText.match(phoneRegex) || [])
        .map(p => p.replace(/^(tel:|phone:|call\s*:?\s*)/i, '').trim())
        .filter(p => {
          const digits = p.replace(/\D/g, '');
          return digits.length >= 10 && digits.length <= 15;
        });
      if (phones.length > 0) {
        lead.phone = phones[0];
      }
    }

    return lead;
  } catch {
    return lead;
  }
}

// Enrich multiple leads in parallel with concurrency limit
async function enrichLeadsBatch(leads: LeadResult[], maxConcurrent: number = 5): Promise<LeadResult[]> {
  const needsEnrichment = leads.filter(l => l.website && (!l.email || !l.instagram_url));
  const alreadyComplete = leads.filter(l => !l.website || (l.email && l.instagram_url));
  
  if (needsEnrichment.length === 0) return leads;

  // Process in batches to avoid overwhelming the API
  const enriched: LeadResult[] = [];
  for (let i = 0; i < needsEnrichment.length; i += maxConcurrent) {
    const batch = needsEnrichment.slice(i, i + maxConcurrent);
    const results = await Promise.all(batch.map(lead => enrichFromWebsite(lead)));
    enriched.push(...results);
  }

  return [...alreadyComplete, ...enriched];
}

// ─── MAIN HANDLER ──────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const { niche, location, country = 'United Kingdom', source } = await request.json();
    if (!niche || !location) {
      return NextResponse.json({ error: 'Niche and location are required' }, { status: 400 });
    }

    let results: LeadResult[] = [];
    const errors: string[] = [];
    const sourceStats: Record<string, number> = {};

    const trySource = async (name: string, fn: () => Promise<LeadResult[]>) => {
      try {
        const r = await fn();
        if (Array.isArray(r) && r.length > 0) {
          results = [...results, ...r];
          sourceStats[name] = r.length;
        } else {
          sourceStats[name] = 0;
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : `${name} failed`;
        errors.push(msg);
        sourceStats[name] = 0;
        if (source !== 'all') throw e;
      }
    };

    if (source === 'google_maps' || source === 'all') await trySource('google_maps', () => scrapeGoogleMaps(niche, location, country));
    if (source === 'yelp' || source === 'all') await trySource('yelp', () => scrapeYelp(niche, location, country));
    if (source === 'fresha' || source === 'all') await trySource('fresha', () => scrapeFresha(niche, location, country));
    if (source === 'yell' || source === 'all') await trySource('yell', () => scrapeYell(niche, location));
    if (source === 'yellow_pages' || source === 'all') await trySource('yellow_pages', () => scrapeYellowPages(niche, location));
    if (source === 'bark' || source === 'all') await trySource('bark', () => scrapeBark(niche, location, country));

    // De-duplicate by business name
    const seen = new Set<string>();
    const unique = results.filter(r => {
      if (!r.business_name || typeof r.business_name !== 'string') return false;
      const key = r.business_name.toLowerCase().trim();
      if (!key || key.length < 2 || seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // ★ AUTO-ENRICH: Crawl websites to find emails + Instagram + phone
    // Only enriches leads that have a website but are missing email or Instagram
    const firecrawlKey = getKey('FIRECRAWL_API_KEY');
    let enrichedResults = unique;
    if (firecrawlKey) {
      try {
        // Limit to first 15 results to keep response time reasonable
        const toEnrich = unique.slice(0, 15);
        const remaining = unique.slice(15);
        const enriched = await enrichLeadsBatch(toEnrich, 3);
        enrichedResults = [...enriched, ...remaining];
      } catch {
        // If enrichment fails, return un-enriched results
        enrichedResults = unique;
      }
    }

    // Count enrichment stats
    const withEmail = enrichedResults.filter(r => r.email).length;
    const withPhone = enrichedResults.filter(r => r.phone).length;
    const withInstagram = enrichedResults.filter(r => r.instagram_url).length;

    return NextResponse.json({
      results: enrichedResults,
      count: enrichedResults.length,
      sourceStats,
      enrichmentStats: { withEmail, withPhone, withInstagram },
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Scraping failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
