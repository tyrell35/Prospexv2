import { NextRequest, NextResponse } from 'next/server';

import { supabaseAdmin as supabase } from "@/lib/supabase-admin";
import { authOr401 } from "@/lib/api-auth";

// ═══════════════════════════════════════════════════════
// INSTAGRAM SCRAPER — B2B Business Profile Discovery
// Two modes:
//   1. Google + Firecrawl (free, uses existing tools)
//   2. Apify Instagram Scraper (paid, more reliable)
// ═══════════════════════════════════════════════════════

interface InstagramLead {
  username: string;
  full_name: string;
  business_name: string;
  bio: string;
  website: string | null;
  email: string | null;
  phone: string | null;
  follower_count: number | null;
  following_count: number | null;
  post_count: number | null;
  is_business: boolean;
  business_category: string | null;
  profile_url: string;
  profile_pic: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
}

// ═══ EXTRACT CONTACT INFO FROM BIO ═══
function extractContactFromBio(bio: string): { email: string | null; phone: string | null; website: string | null } {
  const emailMatch = bio.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/);
  const phoneMatch = bio.match(/(?:\+?\d{1,3}[\s\-.]?)?\(?\d{2,4}\)?[\s\-.]?\d{3,4}[\s\-.]?\d{3,4}/);
  const urlMatch = bio.match(/(?:https?:\/\/)?(?:www\.)?[a-zA-Z0-9\-]+\.[a-zA-Z]{2,}(?:\/[^\s)]*)?/i);

  return {
    email: emailMatch ? emailMatch[0] : null,
    phone: phoneMatch ? phoneMatch[0].trim() : null,
    website: urlMatch ? (urlMatch[0].startsWith('http') ? urlMatch[0] : `https://${urlMatch[0]}`) : null,
  };
}

// ═══ EXTRACT LOCATION FROM BIO ═══
function extractLocationFromBio(bio: string, searchLocation: string): { city: string | null; address: string | null } {
  // Try to find common location patterns
  const locationPatterns = [
    /📍\s*([^,\n]+)/i,
    /(?:located|based)\s+(?:in|at)\s+([^,.\n]+)/i,
    /(?:serving|covering)\s+([^,.\n]+)/i,
  ];

  for (const pattern of locationPatterns) {
    const match = bio.match(pattern);
    if (match) return { city: match[1].trim(), address: null };
  }

  return { city: searchLocation || null, address: null };
}

// ═══ METHOD 1: GOOGLE + FIRECRAWL ═══
async function scrapeViaGoogle(niche: string, location: string, country: string, maxResults: number): Promise<InstagramLead[]> {
  const firecrawlKey = process.env.FIRECRAWL_API_KEY;
  if (!firecrawlKey) throw new Error('FIRECRAWL_API_KEY not configured');

  // Step 1: Use Google to find Instagram profiles
  const searchQuery = `site:instagram.com "${niche}" "${location}"`;
  const googleApiKey = process.env.GOOGLE_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;
  const searchEngineId = process.env.GOOGLE_CSE_ID;

  let profileUrls: string[] = [];

  if (googleApiKey && searchEngineId) {
    // Use Google Custom Search API
    for (let start = 1; start <= Math.min(maxResults, 30); start += 10) {
      try {
        const url = `https://www.googleapis.com/customsearch/v1?key=${googleApiKey}&cx=${searchEngineId}&q=${encodeURIComponent(searchQuery)}&start=${start}&num=10`;
        const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
        if (!res.ok) break;
        const data = await res.json();
        const urls = (data.items || [])
          .map((item: Record<string, unknown>) => item.link as string)
          .filter((url: string) => url.includes('instagram.com/') && !url.includes('/p/') && !url.includes('/reel/') && !url.includes('/explore/'));
        profileUrls.push(...urls);
      } catch {
        break;
      }
    }
  } else {
    // Fallback: Use SerpAPI if available
    const serpApiKey = process.env.SERPAPI_KEY;
    if (serpApiKey) {
      try {
        const url = `https://serpapi.com/search.json?engine=google&q=${encodeURIComponent(searchQuery)}&api_key=${serpApiKey}&num=${Math.min(maxResults, 30)}`;
        const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
        if (res.ok) {
          const data = await res.json();
          const urls = (data.organic_results || [])
            .map((r: Record<string, unknown>) => r.link as string)
            .filter((url: string) => url.includes('instagram.com/') && !url.includes('/p/') && !url.includes('/reel/'));
          profileUrls.push(...urls);
        }
      } catch {
        // Continue
      }
    }
  }

  if (profileUrls.length === 0) {
    throw new Error('No Instagram profiles found. Make sure GOOGLE_API_KEY + GOOGLE_CSE_ID or SERPAPI_KEY is configured.');
  }

  // Deduplicate
  profileUrls = [...new Set(profileUrls)].slice(0, maxResults);

  // Step 2: Scrape each profile with Firecrawl
  const leads: InstagramLead[] = [];
  const batchSize = 3;

  for (let i = 0; i < profileUrls.length; i += batchSize) {
    const batch = profileUrls.slice(i, i + batchSize);
    const results = await Promise.all(batch.map(async (url) => {
      try {
        const res = await fetch('https://api.firecrawl.dev/v1/scrape', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${firecrawlKey}`,
          },
          body: JSON.stringify({ url, formats: ['html'], onlyMainContent: false }),
          signal: AbortSignal.timeout(15000),
        });

        if (!res.ok) return null;
        const data = await res.json();
        const html = (data?.data?.html || '').toLowerCase();
        const fullHtml = data?.data?.html || '';

        // Extract username from URL
        const usernameMatch = url.match(/instagram\.com\/([^/?]+)/);
        const username = usernameMatch ? usernameMatch[1] : '';
        if (!username || username === 'explore' || username === 'accounts') return null;

        // Extract data from page HTML
        const bioMatch = fullHtml.match(/<meta\s+(?:property="og:description"|name="description")\s+content="([^"]+)"/i);
        const bio = bioMatch ? bioMatch[1].replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#x27;/g, "'") : '';

        const titleMatch = fullHtml.match(/<meta\s+(?:property="og:title"|name="title")\s+content="([^"]+)"/i);
        const title = titleMatch ? titleMatch[1] : username;

        // Parse follower/post counts from bio/description
        const followersMatch = bio.match(/([\d,.]+[KkMm]?)\s*Followers/i);
        const followingMatch = bio.match(/([\d,.]+[KkMm]?)\s*Following/i);
        const postsMatch = bio.match(/([\d,.]+[KkMm]?)\s*Posts/i);

        const parseCount = (str: string | undefined): number | null => {
          if (!str) return null;
          const cleaned = str.replace(/,/g, '');
          if (/k/i.test(cleaned)) return Math.round(parseFloat(cleaned) * 1000);
          if (/m/i.test(cleaned)) return Math.round(parseFloat(cleaned) * 1000000);
          return parseInt(cleaned) || null;
        };

        const contactInfo = extractContactFromBio(bio);
        const locationInfo = extractLocationFromBio(bio, location);

        // Check for business indicators
        const isBusiness = html.includes('business') || html.includes('book now') ||
          html.includes('appointments') || html.includes('clinic') || html.includes('salon') ||
          html.includes('spa') || html.includes('treatments') || html.includes('services');

        // Extract name from title (format: "Name (@username)")
        const nameMatch = title.match(/^(.+?)\s*\(@/);
        const fullName = nameMatch ? nameMatch[1].trim() : title.split('(')[0].trim();

        return {
          username,
          full_name: fullName,
          business_name: fullName,
          bio: bio.split(' - ')[bio.split(' - ').length - 1]?.trim() || bio.slice(0, 300),
          website: contactInfo.website,
          email: contactInfo.email,
          phone: contactInfo.phone,
          follower_count: parseCount(followersMatch?.[1]),
          following_count: parseCount(followingMatch?.[1]),
          post_count: parseCount(postsMatch?.[1]),
          is_business: isBusiness,
          business_category: null,
          profile_url: `https://instagram.com/${username}`,
          profile_pic: null,
          address: locationInfo.address,
          city: locationInfo.city || location,
          country: country,
        } as InstagramLead;
      } catch {
        return null;
      }
    }));

    leads.push(...results.filter((r): r is InstagramLead => r !== null));
  }

  return leads;
}

// ═══ METHOD 2: APIFY SCRAPER ═══
async function scrapeViaApify(niche: string, location: string, country: string, maxResults: number): Promise<InstagramLead[]> {
  const apifyKey = process.env.APIFY_API_KEY;
  if (!apifyKey) throw new Error('APIFY_API_KEY not configured. Add it to Vercel Environment Variables.');

  // Step 1: Search Google for Instagram profiles (via Apify Google Search)
  const searchQuery = `site:instagram.com "${niche}" "${location}" ${country}`;

  // Use Apify's Google Search Scraper to find profiles
  const searchRes = await fetch('https://api.apify.com/v2/acts/apify~google-search-scraper/runs?token=' + apifyKey, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      queries: searchQuery,
      maxPagesPerQuery: Math.ceil(maxResults / 10),
      resultsPerPage: 10,
      mobileResults: false,
    }),
    signal: AbortSignal.timeout(60000),
  });

  if (!searchRes.ok) {
    // Fallback: Use Apify's Instagram Profile Scraper directly with keyword search
    return scrapeViaApifyDirect(niche, location, country, maxResults, apifyKey);
  }

  const searchData = await searchRes.json();
  const runId = searchData.data?.id;

  if (!runId) {
    return scrapeViaApifyDirect(niche, location, country, maxResults, apifyKey);
  }

  // Wait for completion (poll)
  let attempts = 0;
  while (attempts < 30) {
    await new Promise(resolve => setTimeout(resolve, 3000));
    const statusRes = await fetch(`https://api.apify.com/v2/actor-runs/${runId}?token=${apifyKey}`);
    const statusData = await statusRes.json();
    if (statusData.data?.status === 'SUCCEEDED') break;
    if (statusData.data?.status === 'FAILED' || statusData.data?.status === 'ABORTED') {
      return scrapeViaApifyDirect(niche, location, country, maxResults, apifyKey);
    }
    attempts++;
  }

  // Get results
  const resultsRes = await fetch(`https://api.apify.com/v2/actor-runs/${runId}/dataset/items?token=${apifyKey}`);
  const results = await resultsRes.json();

  // Extract Instagram profile URLs from Google results
  const profileUrls: string[] = [];
  for (const result of results) {
    const url = result.url || result.link || '';
    if (url.includes('instagram.com/') && !url.includes('/p/') && !url.includes('/reel/') && !url.includes('/explore/')) {
      profileUrls.push(url);
    }
  }

  if (profileUrls.length === 0) {
    return scrapeViaApifyDirect(niche, location, country, maxResults, apifyKey);
  }

  // Step 2: Scrape profiles via Apify Instagram Scraper
  return scrapeApifyProfiles(profileUrls.slice(0, maxResults), location, country, apifyKey);
}

// ═══ APIFY DIRECT PROFILE SCRAPING ═══
async function scrapeViaApifyDirect(niche: string, location: string, country: string, maxResults: number, apifyKey: string): Promise<InstagramLead[]> {
  // Use Apify's Instagram Search to find profiles by keyword
  const runRes = await fetch('https://api.apify.com/v2/acts/apify~instagram-scraper/runs?token=' + apifyKey, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      search: `${niche} ${location}`,
      searchType: 'user',
      resultsLimit: maxResults,
    }),
    signal: AbortSignal.timeout(60000),
  });

  if (!runRes.ok) throw new Error('Apify Instagram scraper failed to start');
  const runData = await runRes.json();
  const runId = runData.data?.id;
  if (!runId) throw new Error('Apify run did not return an ID');

  // Poll for completion
  let attempts = 0;
  while (attempts < 40) {
    await new Promise(resolve => setTimeout(resolve, 3000));
    const statusRes = await fetch(`https://api.apify.com/v2/actor-runs/${runId}?token=${apifyKey}`);
    const statusData = await statusRes.json();
    if (statusData.data?.status === 'SUCCEEDED') break;
    if (statusData.data?.status === 'FAILED' || statusData.data?.status === 'ABORTED') {
      throw new Error('Apify scraper run failed');
    }
    attempts++;
  }

  // Get results
  const resultsRes = await fetch(`https://api.apify.com/v2/actor-runs/${runId}/dataset/items?token=${apifyKey}`);
  const results = await resultsRes.json();

  return results.slice(0, maxResults).map((profile: any): InstagramLead => {
    const bio = (profile.biography || profile.bio || '') as string;
    const contactInfo = extractContactFromBio(bio);
    const locationInfo = extractLocationFromBio(bio, location);

    return {
      username: (profile.username || '') as string,
      full_name: (profile.fullName || profile.full_name || profile.username || '') as string,
      business_name: (profile.fullName || profile.full_name || profile.username || '') as string,
      bio: bio.slice(0, 300),
      website: (profile.externalUrl || profile.external_url || contactInfo.website || null) as string | null,
      email: (profile.businessEmail || profile.public_email || contactInfo.email || null) as string | null,
      phone: (profile.businessPhone || profile.public_phone_number || contactInfo.phone || null) as string | null,
      follower_count: (profile.followersCount || profile.edge_followed_by?.count || null) as number | null,
      following_count: (profile.followsCount || profile.edge_follow?.count || null) as number | null,
      post_count: (profile.postsCount || profile.edge_owner_to_timeline_media?.count || null) as number | null,
      is_business: !!(profile.isBusinessAccount || profile.is_business_account),
      business_category: (profile.businessCategoryName || profile.business_category_name || null) as string | null,
      profile_url: `https://instagram.com/${profile.username || ''}`,
      profile_pic: (profile.profilePicUrl || profile.profile_pic_url || null) as string | null,
      address: locationInfo.address,
      city: locationInfo.city || location,
      country: country,
    };
  });
}

// ═══ APIFY PROFILE DETAIL SCRAPER ═══
async function scrapeApifyProfiles(urls: string[], location: string, country: string, apifyKey: string): Promise<InstagramLead[]> {
  const usernames = urls.map(url => {
    const match = url.match(/instagram\.com\/([^/?]+)/);
    return match ? match[1] : '';
  }).filter(u => u && u !== 'explore' && u !== 'accounts');

  if (usernames.length === 0) return [];

  const runRes = await fetch('https://api.apify.com/v2/acts/apify~instagram-scraper/runs?token=' + apifyKey, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      directUrls: urls.slice(0, 30),
      resultsType: 'details',
      resultsLimit: urls.length,
    }),
    signal: AbortSignal.timeout(60000),
  });

  if (!runRes.ok) throw new Error('Apify profile scraper failed');
  const runData = await runRes.json();
  const runId = runData.data?.id;
  if (!runId) throw new Error('No run ID returned');

  // Poll
  let attempts = 0;
  while (attempts < 40) {
    await new Promise(resolve => setTimeout(resolve, 3000));
    const statusRes = await fetch(`https://api.apify.com/v2/actor-runs/${runId}?token=${apifyKey}`);
    const statusData = await statusRes.json();
    if (statusData.data?.status === 'SUCCEEDED') break;
    if (statusData.data?.status === 'FAILED' || statusData.data?.status === 'ABORTED') break;
    attempts++;
  }

  const resultsRes = await fetch(`https://api.apify.com/v2/actor-runs/${runId}/dataset/items?token=${apifyKey}`);
  const results = await resultsRes.json();

  return results.map((profile: any): InstagramLead => {
    const bio = (profile.biography || profile.bio || '') as string;
    const contactInfo = extractContactFromBio(bio);
    const locationInfo = extractLocationFromBio(bio, location);

    return {
      username: (profile.username || '') as string,
      full_name: (profile.fullName || profile.full_name || '') as string,
      business_name: (profile.fullName || profile.full_name || '') as string,
      bio: bio.slice(0, 300),
      website: (profile.externalUrl || contactInfo.website || null) as string | null,
      email: (profile.businessEmail || contactInfo.email || null) as string | null,
      phone: (profile.businessPhone || contactInfo.phone || null) as string | null,
      follower_count: (profile.followersCount || null) as number | null,
      following_count: (profile.followsCount || null) as number | null,
      post_count: (profile.postsCount || null) as number | null,
      is_business: !!(profile.isBusinessAccount),
      business_category: (profile.businessCategoryName || null) as string | null,
      profile_url: `https://instagram.com/${profile.username || ''}`,
      profile_pic: (profile.profilePicUrl || null) as string | null,
      address: locationInfo.address,
      city: locationInfo.city || location,
      country: country,
    };
  });
}

// ═══ SAVE LEADS TO DATABASE ═══
async function saveLeadsToDatabase(leads: InstagramLead[], niche: string): Promise<number> {
  let saved = 0;

  for (const lead of leads) {
    // Check for duplicates by Instagram username
    const { data: existing } = await supabase
      .from('leads')
      .select('id')
      .or(`instagram_url.ilike.%${lead.username}%,business_name.eq.${lead.business_name}`)
      .limit(1)
      .maybeSingle();

    if (existing) continue;

    const { error } = await supabase.from('leads').insert({
      business_name: lead.business_name || lead.full_name || lead.username,
      niche: niche,
      phone: lead.phone,
      email: lead.email,
      website: lead.website,
      instagram_url: lead.profile_url,
      address: lead.address,
      city: lead.city,
      country: lead.country,
      google_rating: null,
      google_review_count: null,
      has_website: !!lead.website && String(lead.website).length > 0,
      has_social: !!lead.profile_url,
      whatsapp_eligible: !!(lead.phone && String(lead.phone).length > 0),
      source: 'instagram',
      lead_priority: 'new',
      data_completeness: calculateCompleteness(lead),
    });

    if (!error) saved++;
  }

  return saved;
}

function calculateCompleteness(lead: InstagramLead): number {
  let score = 0;
  if (lead.business_name) score += 15;
  if (lead.email) score += 25;
  if (lead.phone) score += 20;
  if (lead.website) score += 15;
  if (lead.bio) score += 5;
  if (lead.follower_count) score += 5;
  if (lead.city) score += 10;
  if (lead.is_business) score += 5;
  return Math.min(score, 100);
}

// ═══ MAIN HANDLER ═══
export async function POST(request: NextRequest) {
  const _auth = await authOr401(); if (_auth instanceof Response) return _auth;
  try {
    const { niche, location, country = 'United Kingdom', method = 'google', maxResults = 20, saveToDb = false } = await request.json();

    if (!niche || !location) {
      return NextResponse.json({ error: 'niche and location are required' }, { status: 400 });
    }

    let leads: InstagramLead[] = [];

    if (method === 'apify') {
      leads = await scrapeViaApify(niche, location, country, maxResults);
    } else {
      leads = await scrapeViaGoogle(niche, location, country, maxResults);
    }

    // Optionally save to database
    let savedCount = 0;
    if (saveToDb && leads.length > 0) {
      savedCount = await saveLeadsToDatabase(leads, niche);
    }

    // Log activity
    await supabase.from('activity_log').insert({
      action_type: 'scrape',
      description: `Instagram scrape (${method}): ${leads.length} profiles found for "${niche}" in ${location}. ${savedCount > 0 ? `${savedCount} saved to DB.` : ''}`,
    }).then(() => {});

    return NextResponse.json({
      success: true,
      method,
      total_found: leads.length,
      saved_to_db: savedCount,
      leads,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Instagram scrape failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
