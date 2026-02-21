import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

function getKey(envKey: string): string { return process.env[envKey] || ''; }

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

// ─── HELPERS ───────────────────────────────────────────────────
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

function cleanPhone(phone: string): string | null {
  const cleaned = phone.replace(/[^\d+()-\s]/g, '').trim();
  const digits = cleaned.replace(/\D/g, '');
  if (digits.length >= 10 && digits.length <= 15) return cleaned;
  return null;
}

function cleanEmail(email: string): string | null {
  const lower = email.toLowerCase().trim();
  const badSuffixes = ['.png', '.jpg', '.gif', '.svg', '.webp', '.css', '.js'];
  const badDomains = ['example.com', 'sentry.io', 'webpack', 'wixpress', 'schema.org', 'googleapis', 'cloudflare', 'w3.org'];
  if (badSuffixes.some(s => lower.endsWith(s))) return null;
  if (badDomains.some(d => lower.includes(d))) return null;
  if (lower.includes('@2x') || lower.includes('noreply') || lower.includes('no-reply')) return null;
  if (lower.length < 6 || lower.length > 60) return null;
  return lower;
}

// Firecrawl helper - scrape a URL and get HTML + markdown
async function firecrawlScrape(url: string, waitMs: number = 3000): Promise<{ html: string; md: string }> {
  const key = getKey('FIRECRAWL_API_KEY');
  if (!key) return { html: '', md: '' };
  try {
    const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        url,
        formats: ['html', 'markdown'],
        onlyMainContent: false,
        waitFor: waitMs,
        timeout: 30000,
      }),
    });
    if (!response.ok) return { html: '', md: '' };
    const data = await response.json();
    return {
      html: data?.data?.html || '',
      md: data?.data?.markdown || '',
    };
  } catch {
    return { html: '', md: '' };
  }
}

// ─── GOOGLE MAPS (Outscraper) ──────────────────────────────────
async function scrapeGoogleMaps(niche: string, location: string, country: string, lat?: number, lng?: number): Promise<LeadResult[]> {
  const apiKey = getKey('OUTSCRAPER_API_KEY');
  if (!apiKey) throw new Error('Outscraper API key not configured. Add it in Settings.');

  const regionMap: Record<string, string> = {
    'United States': 'us', 'United Kingdom': 'gb', 'Canada': 'ca', 'Australia': 'au',
    'Ireland': 'ie', 'Germany': 'de', 'France': 'fr', 'Spain': 'es', 'Italy': 'it', 'Netherlands': 'nl',
  };
  const region = regionMap[country] || 'gb';

  // Use coordinates for precise geo-targeting when available
  const query = lat && lng
    ? `${niche} near ${location}`
    : `${niche}, ${location}, ${country}`;

  const params = new URLSearchParams({
    query, limit: '50', region, language: 'en', async: 'false',
    dropDuplicates: 'true', extractContacts: 'true', enrichment: 'emails_and_contacts',
  });

  // Add coordinates for precise location targeting
  if (lat && lng) {
    params.set('coordinates', `@${lat},${lng},14z`);
  }

  const response = await fetch(`https://api.app.outscraper.com/maps/search-v3?${params}`, {
    headers: { 'X-API-KEY': apiKey },
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`Outscraper error (${response.status}): ${errText.slice(0, 200)}`);
  }

  const rawData = await response.json();
  const items = safeArray(rawData);

  const mapped: LeadResult[] = items.filter(item => item.name).map(item => {
    const emailRaw = item.email || item.email_1 || item.contact_email
      || (Array.isArray(item.emails) && item.emails.length > 0 ? item.emails[0] : null)
      || (Array.isArray(item.emails_and_contacts) && item.emails_and_contacts.length > 0 ? item.emails_and_contacts[0] : null);
    const phoneRaw = item.phone || item.phone_1
      || (Array.isArray(item.phones) && item.phones.length > 0 ? item.phones[0] : null);
    const socialLinks = Array.isArray(item.social_links) ? (item.social_links as string[]) : [];
    const igFromSocial = socialLinks.find(l => typeof l === 'string' && l.includes('instagram.com')) || null;
    const igFromField = typeof item.instagram === 'string' ? item.instagram : null;
    return {
      business_name: String(item.name || 'Unknown'),
      address: item.full_address ? String(item.full_address) : (item.address ? String(item.address) : null),
      city: item.city ? String(item.city) : location,
      country: item.country ? String(item.country) : country,
      phone: phoneRaw ? String(phoneRaw) : null,
      email: typeof emailRaw === 'string' ? emailRaw : null,
      website: item.site ? String(item.site) : (item.website ? String(item.website) : null),
      instagram_url: igFromSocial || igFromField,
      google_rating: typeof item.rating === 'number' ? item.rating : null,
      google_review_count: typeof item.reviews === 'number' ? item.reviews : (typeof item.reviews_count === 'number' ? item.reviews_count : null),
      google_maps_url: item.google_maps_url ? String(item.google_maps_url) : null,
      source: 'google_maps',
    };
  });

  // Location filter — only keep results actually in the searched location
  const loc = location.toLowerCase().trim();
  const filtered = mapped.filter(r => {
    const addr = (r.address || '').toLowerCase();
    const city = (r.city || '').toLowerCase();
    return addr.includes(loc) || city.includes(loc) || city === loc;
  });
  return (filtered.length > 0 ? filtered : mapped).slice(0, 30);
}

// ─── YELP (Firecrawl HTML Parsing) ─────────────────────────────
async function scrapeYelp(niche: string, location: string, country: string): Promise<LeadResult[]> {
  const countryDomain: Record<string, string> = { 'United Kingdom': 'yelp.co.uk', 'Canada': 'yelp.ca', 'Ireland': 'yelp.ie' };
  const domain = countryDomain[country] || 'yelp.com';
  const url = `https://www.${domain}/search?find_desc=${encodeURIComponent(niche)}&find_loc=${encodeURIComponent(location)}`;

  const { html } = await firecrawlScrape(url, 5000);
  if (html.length < 500) return [];

  const results: LeadResult[] = [];

  // Yelp search results have structured JSON-LD or consistent HTML patterns
  // Pattern 1: Extract from search result cards
  const namePattern = /class="[^"]*css-[^"]*"[^>]*><a[^>]*href="\/biz\/([^"]*)"[^>]*>([^<]+)<\/a>/gi;
  const phonePattern = /(\(\d{3}\)\s?\d{3}-\d{4}|\+\d{1,3}[\s-]?\d{3,4}[\s-]?\d{3,4}[\s-]?\d{3,4})/g;
  const ratingPattern = /aria-label="(\d\.?\d?)\s*star/gi;

  // Simpler approach: extract business names from Yelp's biz links
  const bizLinkPattern = /href="\/biz\/([\w-]+)"[^>]*>([^<]{3,60})<\/a>/gi;
  let match;
  const seenNames = new Set<string>();

  while ((match = bizLinkPattern.exec(html)) !== null) {
    const name = match[2].trim();
    if (seenNames.has(name.toLowerCase()) || name.length < 3) continue;
    if (['Yelp', 'Search', 'Filter', 'Sort', 'More', 'Map'].some(skip => name === skip)) continue;
    seenNames.add(name.toLowerCase());

    // Look for phone nearby in HTML
    const contextStart = Math.max(0, match.index - 200);
    const contextEnd = Math.min(html.length, match.index + 1000);
    const context = html.slice(contextStart, contextEnd);
    const phoneMatch = context.match(phonePattern);

    results.push({
      business_name: name,
      address: null, city: location, country,
      phone: phoneMatch ? phoneMatch[0] : null,
      email: null, website: null, instagram_url: null,
      google_rating: null, google_review_count: null, google_maps_url: null,
      source: 'yelp',
    });

    if (results.length >= 20) break;
  }

  // Fallback: parse from markdown if HTML parsing got nothing
  if (results.length === 0) {
    const { md } = await firecrawlScrape(url, 5000);
    const lines = md.split('\n').filter(l => l.trim().length > 0);
    for (let i = 0; i < lines.length && results.length < 20; i++) {
      const nameMatch = lines[i].match(/\*\*([^*]{3,60})\*\*/) || lines[i].match(/^#{1,3}\s+\d*\.?\s*(.{3,60})/);
      if (nameMatch) {
        const name = (nameMatch[1] || nameMatch[2]).replace(/\[|\]/g, '').trim();
        if (['Yelp', 'Results', 'Search', 'Filter', 'Sort', 'Map', 'Page'].some(s => name.startsWith(s))) continue;
        if (seenNames.has(name.toLowerCase())) continue;
        seenNames.add(name.toLowerCase());
        const ctx = lines.slice(i, i + 6).join(' ');
        const ph = ctx.match(phonePattern);
        results.push({
          business_name: name, address: null, city: location, country,
          phone: ph ? ph[0] : null, email: null, website: null, instagram_url: null,
          google_rating: null, google_review_count: null, google_maps_url: null, source: 'yelp',
        });
      }
    }
  }

  return results;
}

// ─── YELL.COM (Firecrawl HTML — UK) ────────────────────────────
async function scrapeYell(niche: string, location: string): Promise<LeadResult[]> {
  const url = `https://www.yell.com/ucs/UcsSearchAction.do?keywords=${encodeURIComponent(niche)}&location=${encodeURIComponent(location)}`;
  const { html, md } = await firecrawlScrape(url, 5000);

  const results: LeadResult[] = [];
  const seenNames = new Set<string>();

  if (html.length > 500) {
    // Yell HTML patterns: businessCapsule containers
    const namePattern = /class="businessCapsule--name[^"]*"[^>]*>(?:<a[^>]*>)?([^<]{3,80})/gi;
    const phonePattern = /class="businessCapsule--phone[^"]*"[^>]*>(?:<a[^>]*>)?([^<]+)/gi;
    const websitePattern = /class="businessCapsule--ctaBtn[^"]*"[^>]*href="(https?:\/\/[^"]+)"/gi;

    // Collect all business names
    let nameMatch;
    const names: { name: string; index: number }[] = [];
    while ((nameMatch = namePattern.exec(html)) !== null) {
      const name = nameMatch[1].replace(/<[^>]*>/g, '').trim();
      if (name.length >= 3 && name.length <= 80 && !seenNames.has(name.toLowerCase())) {
        seenNames.add(name.toLowerCase());
        names.push({ name, index: nameMatch.index });
      }
    }

    // For each name, look nearby for phone and website
    for (const { name, index } of names) {
      const ctx = html.slice(index, Math.min(html.length, index + 2000));
      const ph = ctx.match(/(\d{4,5}\s?\d{5,6}|0\d{2,4}\s?\d{3,4}\s?\d{3,4}|\+44[\d\s]{10,13})/);
      const web = ctx.match(/href="(https?:\/\/(?!www\.yell\.com)[^"]+)"/);

      results.push({
        business_name: name, address: null, city: location, country: 'United Kingdom',
        phone: ph ? cleanPhone(ph[1]) : null, email: null,
        website: web ? web[1] : null, instagram_url: null,
        google_rating: null, google_review_count: null, google_maps_url: null, source: 'yell',
      });
      if (results.length >= 25) break;
    }
  }

  // Fallback: parse markdown
  if (results.length === 0 && md.length > 200) {
    const lines = md.split('\n').filter(l => l.trim().length > 0);
    for (let i = 0; i < lines.length && results.length < 25; i++) {
      const nm = lines[i].match(/\*\*([^*]{3,80})\*\*/) || lines[i].match(/^#{1,3}\s+(.{3,80})/);
      if (nm) {
        const name = (nm[1] || '').replace(/\[|\]/g, '').trim();
        if (['Yell', 'Results', 'Search', 'Sponsored', 'Page', 'Next', 'Filter'].some(s => name.includes(s))) continue;
        if (seenNames.has(name.toLowerCase())) continue;
        seenNames.add(name.toLowerCase());
        const ctx = lines.slice(i, i + 8).join(' ');
        const ph = ctx.match(/(\d{4,5}\s?\d{5,6}|0\d{2,4}\s?\d{3,4}\s?\d{3,4})/);
        const web = ctx.match(/https?:\/\/(?!www\.yell\.com)[^\s),"]+/);
        results.push({
          business_name: name, address: null, city: location, country: 'United Kingdom',
          phone: ph ? cleanPhone(ph[0]) : null, email: null,
          website: web ? web[0] : null, instagram_url: null,
          google_rating: null, google_review_count: null, google_maps_url: null, source: 'yell',
        });
      }
    }
  }

  return results;
}

// ─── YELLOW PAGES (Firecrawl HTML — US) ────────────────────────
async function scrapeYellowPages(niche: string, location: string): Promise<LeadResult[]> {
  const url = `https://www.yellowpages.com/search?search_terms=${encodeURIComponent(niche)}&geo_location_terms=${encodeURIComponent(location)}`;
  const { html, md } = await firecrawlScrape(url, 5000);

  const results: LeadResult[] = [];
  const seenNames = new Set<string>();

  if (html.length > 500) {
    // Yellow Pages HTML: .result containers with .business-name, .phones, .track-visit-website
    const namePattern = /class="business-name[^"]*"[^>]*>(?:<a[^>]*>)?([^<]{3,80})/gi;
    const usPhonePattern = /\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}/g;

    let nm;
    const names: { name: string; index: number }[] = [];
    while ((nm = namePattern.exec(html)) !== null) {
      const name = nm[1].replace(/<[^>]*>/g, '').trim();
      if (name.length >= 3 && !seenNames.has(name.toLowerCase())) {
        seenNames.add(name.toLowerCase());
        names.push({ name, index: nm.index });
      }
    }

    for (const { name, index } of names) {
      const ctx = html.slice(index, Math.min(html.length, index + 2000));
      const ph = ctx.match(usPhonePattern);
      const web = ctx.match(/href="(https?:\/\/(?!www\.yellowpages\.com)[^"]+)"[^>]*class="[^"]*track-visit-website/);
      const webAlt = ctx.match(/href="(https?:\/\/(?!www\.yellowpages\.com)[^"]+)"/);
      const addr = ctx.match(/class="street-address[^"]*">([^<]+)/);
      const locality = ctx.match(/class="locality[^"]*">([^<]+)/);

      results.push({
        business_name: name,
        address: [addr?.[1]?.trim(), locality?.[1]?.trim()].filter(Boolean).join(', ') || null,
        city: location, country: 'United States',
        phone: ph ? ph[0] : null, email: null,
        website: web ? web[1] : (webAlt ? webAlt[1] : null), instagram_url: null,
        google_rating: null, google_review_count: null, google_maps_url: null, source: 'yellow_pages',
      });
      if (results.length >= 25) break;
    }
  }

  // Fallback: markdown
  if (results.length === 0 && md.length > 200) {
    const lines = md.split('\n').filter(l => l.trim().length > 0);
    for (let i = 0; i < lines.length && results.length < 25; i++) {
      const nmMatch = lines[i].match(/\*\*([^*]{3,80})\*\*/) || lines[i].match(/^#{1,3}\s+\d*\.?\s*(.{3,80})/);
      if (nmMatch) {
        const name = (nmMatch[1] || nmMatch[2]).replace(/\[|\]/g, '').trim();
        if (['Yellow Pages', 'Results', 'Search', 'Sponsored', 'Page', 'Sort', 'Map'].some(s => name.includes(s))) continue;
        if (name.length < 3 || seenNames.has(name.toLowerCase())) continue;
        seenNames.add(name.toLowerCase());
        const ctx = lines.slice(i, i + 8).join(' ');
        const ph = ctx.match(/\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}/);
        const web = ctx.match(/https?:\/\/(?!www\.yellowpages\.com)[^\s),"]+/);
        results.push({
          business_name: name, address: null, city: location, country: 'United States',
          phone: ph ? ph[0] : null, email: null, website: web ? web[0] : null, instagram_url: null,
          google_rating: null, google_review_count: null, google_maps_url: null, source: 'yellow_pages',
        });
      }
    }
  }

  return results;
}

// ─── BARK.COM (Firecrawl HTML) ─────────────────────────────────
async function scrapeBark(niche: string, location: string, country: string): Promise<LeadResult[]> {
  const nicheSlug = niche.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const locationSlug = location.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const prefix: Record<string, string> = { 'United Kingdom': 'gb', 'United States': 'us', 'Canada': 'ca', 'Australia': 'au', 'Ireland': 'ie' };
  const countryCode = prefix[country] || 'gb';
  const url = `https://www.bark.com/en/${countryCode}/find/${nicheSlug}/${locationSlug}/`;
  const { html, md } = await firecrawlScrape(url, 5000);

  const results: LeadResult[] = [];
  const seenNames = new Set<string>();

  if (html.length > 500) {
    // Bark uses profile card components with names in h2/h3 and locations
    const profilePattern = /(?:ProfileCard|profile-card|seller-card|CompanyCard)[^>]*>[\s\S]*?(?:<h[23][^>]*>([^<]{3,80})<\/h[23]>)/gi;
    const simpleNamePattern = /<h[23][^>]*class="[^"]*(?:name|title|heading)[^"]*"[^>]*>([^<]{3,80})<\/h[23]>/gi;

    // Try profile card pattern first
    let match;
    while ((match = profilePattern.exec(html)) !== null) {
      const name = match[1].replace(/<[^>]*>/g, '').trim();
      if (name.length >= 3 && !seenNames.has(name.toLowerCase())) {
        seenNames.add(name.toLowerCase());
        const ctx = html.slice(match.index, Math.min(html.length, match.index + 1500));
        const ph = ctx.match(/tel:([+\d\s()-]+)/);
        results.push({
          business_name: name, address: null, city: location, country,
          phone: ph ? cleanPhone(ph[1]) : null, email: null, website: null, instagram_url: null,
          google_rating: null, google_review_count: null, google_maps_url: null, source: 'bark',
        });
        if (results.length >= 20) break;
      }
    }

    // Fallback: simpler heading pattern
    if (results.length === 0) {
      while ((match = simpleNamePattern.exec(html)) !== null) {
        const name = match[1].replace(/<[^>]*>/g, '').trim();
        if (name.length >= 3 && name.length <= 60 && !seenNames.has(name.toLowerCase())) {
          if (['Bark', 'Find', 'Professionals', 'Compare', 'Get', 'How', 'Why', 'Top'].some(s => name.startsWith(s))) continue;
          seenNames.add(name.toLowerCase());
          results.push({
            business_name: name, address: null, city: location, country,
            phone: null, email: null, website: null, instagram_url: null,
            google_rating: null, google_review_count: null, google_maps_url: null, source: 'bark',
          });
          if (results.length >= 20) break;
        }
      }
    }
  }

  // Fallback: markdown
  if (results.length === 0 && md.length > 200) {
    const lines = md.split('\n').filter(l => l.trim().length > 0);
    for (let i = 0; i < lines.length && results.length < 20; i++) {
      const nm = lines[i].match(/\*\*([^*]{3,80})\*\*/) || lines[i].match(/^#{1,3}\s+(.{3,80})/);
      if (nm) {
        const name = (nm[1] || '').replace(/\[|\]/g, '').trim();
        if (name.length < 3 || ['Bark', 'Find', 'Professionals', 'Compare', 'Get', 'How', 'Why', 'Top'].some(s => name.startsWith(s))) continue;
        if (seenNames.has(name.toLowerCase())) continue;
        seenNames.add(name.toLowerCase());
        results.push({
          business_name: name, address: null, city: location, country,
          phone: null, email: null, website: null, instagram_url: null,
          google_rating: null, google_review_count: null, google_maps_url: null, source: 'bark',
        });
      }
    }
  }

  return results;
}

// ─── FRESHA (Firecrawl) ────────────────────────────────────────
async function scrapeFresha(niche: string, location: string, country: string): Promise<LeadResult[]> {
  const url = `https://www.fresha.com/search?query=${encodeURIComponent(niche)}&location=${encodeURIComponent(location + ', ' + country)}`;
  const { html, md } = await firecrawlScrape(url, 5000);

  const results: LeadResult[] = [];
  const seenNames = new Set<string>();

  if (html.length > 500) {
    // Fresha uses venue-card components
    const venuePattern = /venue-card[^>]*>[\s\S]*?<(?:h[23]|span|div)[^>]*class="[^"]*name[^"]*"[^>]*>([^<]{3,80})/gi;
    let match;
    while ((match = venuePattern.exec(html)) !== null) {
      const name = match[1].trim();
      if (name.length >= 3 && !seenNames.has(name.toLowerCase())) {
        seenNames.add(name.toLowerCase());
        const ctx = html.slice(match.index, Math.min(html.length, match.index + 1500));
        const addr = ctx.match(/class="[^"]*address[^"]*"[^>]*>([^<]+)/);
        const ratingMatch = ctx.match(/(\d\.?\d?)\s*(?:star|★)/i);
        results.push({
          business_name: name,
          address: addr ? addr[1].trim() : null, city: location, country,
          phone: null, email: null, website: null, instagram_url: null,
          google_rating: ratingMatch ? parseFloat(ratingMatch[1]) : null,
          google_review_count: null, google_maps_url: null, source: 'fresha',
        });
        if (results.length >= 20) break;
      }
    }
  }

  // Markdown fallback
  if (results.length === 0 && md.length > 200) {
    const lines = md.split('\n').filter(l => l.trim().length > 0);
    for (let i = 0; i < lines.length && results.length < 20; i++) {
      const nm = lines[i].match(/\*\*([^*]{3,60})\*\*/) || lines[i].match(/^#{1,3}\s+(.{3,60})/);
      if (nm) {
        const name = (nm[1] || '').replace(/\[|\]/g, '').trim();
        if (name.length < 3 || ['Fresha', 'Search', 'Results', 'Book', 'Find'].some(s => name.startsWith(s))) continue;
        if (seenNames.has(name.toLowerCase())) continue;
        seenNames.add(name.toLowerCase());
        results.push({
          business_name: name, address: null, city: location, country,
          phone: null, email: null, website: null, instagram_url: null,
          google_rating: null, google_review_count: null, google_maps_url: null, source: 'fresha',
        });
      }
    }
  }

  return results;
}

// ─── AUTO ENRICHMENT ───────────────────────────────────────────
async function enrichFromWebsite(lead: LeadResult): Promise<LeadResult> {
  if (!lead.website) return lead;
  if (lead.email && lead.instagram_url) return lead;

  const firecrawlKey = getKey('FIRECRAWL_API_KEY');
  if (!firecrawlKey) return lead;

  try {
    const domain = lead.website.replace(/https?:\/\//, '').replace(/\/$/, '');
    let allText = '';

    // Scrape main page
    const { md: mainMd } = await firecrawlScrape(lead.website, 2000);
    allText += mainMd + '\n';

    // Try contact page if still missing email
    if (!lead.email) {
      const contactPaths = ['/contact', '/contact-us', '/about', '/about-us'];
      for (const path of contactPaths) {
        const { md: contactMd } = await firecrawlScrape(`https://${domain}${path}`, 2000);
        if (contactMd.length > 100) {
          allText += contactMd + '\n';
          break;
        }
      }
    }

    if (allText.length === 0) return lead;

    // Extract email
    if (!lead.email) {
      const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
      const emails = (allText.match(emailRegex) || []).map(e => cleanEmail(e)).filter((e): e is string => e !== null);
      const domainClean = domain.replace('www.', '');
      const sorted = emails.sort((a, b) => {
        const aD = a.includes(domainClean) ? 0 : 1;
        const bD = b.includes(domainClean) ? 0 : 1;
        if (aD !== bD) return aD - bD;
        const pref = ['info@', 'hello@', 'contact@', 'enquiries@', 'bookings@', 'reception@'];
        const aI = pref.findIndex(p => a.startsWith(p));
        const bI = pref.findIndex(p => b.startsWith(p));
        return (aI === -1 ? 99 : aI) - (bI === -1 ? 99 : bI);
      });
      if (sorted.length > 0) lead.email = sorted[0];
    }

    // Extract Instagram
    if (!lead.instagram_url) {
      const igRegex = /(?:https?:\/\/)?(?:www\.)?instagram\.com\/([a-zA-Z0-9_.]{2,30})\/?/gi;
      let match;
      while ((match = igRegex.exec(allText)) !== null) {
        const handle = match[1].toLowerCase();
        if (!['p', 'reel', 'reels', 'stories', 'explore', 'accounts', 'about', 'developer', 'legal', 'privacy', 'terms', 'help'].includes(handle)) {
          lead.instagram_url = `https://instagram.com/${match[1]}`;
          break;
        }
      }
    }

    // Extract phone
    if (!lead.phone) {
      const phoneRegex = /(?:tel:|phone:|call\s*:?\s*)?(\+?[\d][\d\s()-]{9,18}\d)/gi;
      const phones = (allText.match(phoneRegex) || [])
        .map(p => p.replace(/^(tel:|phone:|call\s*:?\s*)/i, '').trim())
        .map(p => cleanPhone(p))
        .filter((p): p is string => p !== null);
      if (phones.length > 0) lead.phone = phones[0];
    }

    return lead;
  } catch {
    return lead;
  }
}

async function enrichLeadsBatch(leads: LeadResult[], maxConcurrent: number = 3): Promise<LeadResult[]> {
  const needsEnrich = leads.filter(l => l.website && (!l.email || !l.instagram_url));
  const complete = leads.filter(l => !l.website || (l.email && l.instagram_url));

  if (needsEnrich.length === 0) return leads;

  const enriched: LeadResult[] = [];
  for (let i = 0; i < needsEnrich.length; i += maxConcurrent) {
    const batch = needsEnrich.slice(i, i + maxConcurrent);
    const results = await Promise.all(batch.map(lead => enrichFromWebsite(lead)));
    enriched.push(...results);
  }
  return [...complete, ...enriched];
}

// ─── MAIN HANDLER ──────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const { niche, location, country = 'United Kingdom', source, lat, lng } = await request.json();
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

    if (source === 'google_maps' || source === 'all') await trySource('google_maps', () => scrapeGoogleMaps(niche, location, country, lat, lng));
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

    // ── LOCATION FILTERING ─────────────────────────────────
    // Remove results clearly from wrong locations
    const locationLower = location.toLowerCase().trim();
    const locationWords = locationLower.split(/[\s,]+/).filter(w => w.length > 2);

    const locationFiltered = unique.filter(r => {
      // Build searchable text from all address fields
      const addressText = [
        r.address || '',
        r.city || '',
        r.country || '',
      ].join(' ').toLowerCase();

      // If result has no address data at all, keep it (can't verify)
      if (!addressText.trim()) return true;

      // Check if any location word appears in the address
      const matchesLocation = locationWords.some(word => addressText.includes(word));
      if (matchesLocation) return true;

      // Check for common abbreviations/variants
      const variants: Record<string, string[]> = {
        'london': ['london', 'greater london'],
        'new york': ['new york', 'ny', 'nyc', 'manhattan', 'brooklyn', 'queens', 'bronx'],
        'los angeles': ['los angeles', 'la', 'hollywood', 'west hollywood'],
        'manchester': ['manchester', 'greater manchester'],
        'birmingham': ['birmingham', 'west midlands'],
        'chicago': ['chicago', 'il'],
        'san francisco': ['san francisco', 'sf'],
      };

      for (const [key, alts] of Object.entries(variants)) {
        if (locationLower.includes(key) || alts.some(a => locationLower.includes(a))) {
          if (alts.some(a => addressText.includes(a)) || addressText.includes(key)) return true;
        }
      }

      // If the result city or address doesn't mention the location at all
      // AND we have a very specific location (not just a country), filter it out
      if (locationWords.length >= 1 && !addressText.includes(locationLower)) {
        // But be lenient — if the location is a neighborhood, the address might show the parent city
        // So only filter if we're confident it's wrong
        const resultCity = (r.city || '').toLowerCase();
        const resultAddress = (r.address || '').toLowerCase();

        // If result is in a completely different city/region, remove it
        if (resultCity && !resultCity.includes(locationLower) && !locationLower.includes(resultCity)) {
          // Double check: maybe the neighborhood is in the address
          if (!resultAddress.includes(locationLower) && !locationWords.some(w => resultAddress.includes(w))) {
            return false;
          }
        }
      }

      return true;
    });

    // Use filtered results if filtering removed more than noise (keep at least 30%)
    // Otherwise fall back to unfiltered to avoid removing everything
    const filteredResults = locationFiltered.length >= unique.length * 0.2 ? locationFiltered : unique;

    // Auto-enrich: crawl websites to find emails + Instagram + phone
    const firecrawlKey = getKey('FIRECRAWL_API_KEY');
    let enrichedResults = filteredResults;
    if (firecrawlKey) {
      try {
        const toEnrich = filteredResults.slice(0, 15);
        const remaining = filteredResults.slice(15);
        const enriched = await enrichLeadsBatch(toEnrich, 3);
        enrichedResults = [...enriched, ...remaining];
      } catch {
        enrichedResults = filteredResults;
      }
    }

    const withEmail = enrichedResults.filter(r => r.email).length;
    const withPhone = enrichedResults.filter(r => r.phone).length;
    const withInstagram = enrichedResults.filter(r => r.instagram_url).length;

    return NextResponse.json({
      results: enrichedResults,
      count: enrichedResults.length,
      sourceStats,
      enrichmentStats: { withEmail, withPhone, withInstagram },
      locationFiltered: unique.length - filteredResults.length,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Scraping failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// PUT: Batch-save leads from city scraper
export async function PUT(request: NextRequest) {
  try {
    const { leads, niche, country } = await request.json();
    if (!leads || !Array.isArray(leads) || leads.length === 0) {
      return NextResponse.json({ error: 'leads array required' }, { status: 400 });
    }

    let saved = 0;
    let skipped = 0;

    for (const lead of leads) {
      if (!lead.business_name) continue;

      // Check for duplicates by name + city
      const { data: existing } = await supabase
        .from('leads')
        .select('id')
        .eq('business_name', lead.business_name)
        .eq('city', lead.city || '')
        .limit(1)
        .maybeSingle();

      if (existing) { skipped++; continue; }

      const { error } = await supabase.from('leads').insert({
        business_name: lead.business_name,
        niche: lead.niche || niche || null,
        address: lead.address || null,
        city: lead.city || null,
        country: lead.country || country || null,
        phone: lead.phone || null,
        email: lead.email || null,
        website: lead.website || null,
        google_rating: lead.google_rating || null,
        google_review_count: lead.google_review_count || null,
        instagram_url: lead.instagram_url || null,
        source: lead.source || 'google_maps',
        lead_priority: 'new',
      });

      if (!error) saved++;
    }

    return NextResponse.json({ success: true, saved, skipped, total: leads.length });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Save failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
