import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// ─── TECH STACK DETECTION ────────────────────────────────────────
interface TechItem { name: string; category: string; confidence: 'high' | 'medium' | 'low' }

function detectTechStack(html: string): TechItem[] {
  const h = html.toLowerCase();
  const tech: TechItem[] = [];
  const add = (name: string, category: string, confidence: 'high' | 'medium' | 'low' = 'high') => {
    if (!tech.find(t => t.name === name)) tech.push({ name, category, confidence });
  };

  // CMS / Platform
  if (h.includes('wp-content') || h.includes('wp-includes') || h.includes('wordpress')) add('WordPress', 'cms');
  if (h.includes('wix.com') || h.includes('wixsite') || h.includes('_wix_browser_sess')) add('Wix', 'cms');
  if (h.includes('squarespace') || h.includes('sqsp.')) add('Squarespace', 'cms');
  if (h.includes('shopify') || h.includes('cdn.shopify')) add('Shopify', 'cms');
  if (h.includes('webflow.com') || h.includes('wf-') || h.includes('webflow')) add('Webflow', 'cms');
  if (h.includes('godaddy.com') || h.includes('secureserver.net')) add('GoDaddy', 'cms');
  if (h.includes('weebly.com')) add('Weebly', 'cms');
  if (h.includes('ghost.io') || h.includes('ghost.org')) add('Ghost', 'cms');
  if (h.includes('duda.co')) add('Duda', 'cms');
  if (h.includes('elementor')) add('Elementor', 'page_builder');
  if (h.includes('divi') && h.includes('et_')) add('Divi', 'page_builder');

  // Analytics
  if (h.includes('google-analytics.com') || h.includes('ga.js') || h.includes('analytics.js') || h.includes('gtag(')) add('Google Analytics', 'analytics');
  if (h.includes('googletagmanager.com') || h.includes('gtm.js')) add('Google Tag Manager', 'analytics');
  if (h.includes('hotjar.com') || h.includes('_hjSettings')) add('Hotjar', 'analytics');
  if (h.includes('clarity.ms') || h.includes('microsoft clarity')) add('Microsoft Clarity', 'analytics');
  if (h.includes('plausible.io')) add('Plausible', 'analytics');
  if (h.includes('mixpanel.com')) add('Mixpanel', 'analytics');

  // Advertising Pixels
  if (h.includes('fbq(') || h.includes('facebook.com/tr') || h.includes('connect.facebook.net')) add('Facebook Pixel', 'pixel');
  if (h.includes('googleadservices.com') || h.includes('google_conversion') || h.includes('gads')) add('Google Ads', 'pixel');
  if (h.includes('ads.linkedin.com') || h.includes('snap.licdn.com') || h.includes('_linkedin_partner_id')) add('LinkedIn Ads', 'pixel');
  if (h.includes('analytics.tiktok.com') || h.includes('tiktok.com/i18n/pixel')) add('TikTok Pixel', 'pixel');
  if (h.includes('ads.pinterest.com') || h.includes('pintrk(')) add('Pinterest Ads', 'pixel');
  if (h.includes('snapchat.com/scevent') || h.includes('sc-static.net')) add('Snapchat Pixel', 'pixel');
  if (h.includes('ads.twitter.com') || h.includes('twq(')) add('X/Twitter Ads', 'pixel');
  if (h.includes('bing.com/bat') || h.includes('clarity.ms')) add('Microsoft Ads', 'pixel');

  // CRM & Marketing
  if (h.includes('highlevel') || h.includes('leadconnector') || h.includes('msgsndr.com')) add('GoHighLevel', 'crm');
  if (h.includes('hubspot.com') || h.includes('hs-scripts') || h.includes('hbspt')) add('HubSpot', 'crm');
  if (h.includes('salesforce.com') || h.includes('pardot')) add('Salesforce', 'crm');
  if (h.includes('activecampaign.com')) add('ActiveCampaign', 'crm');
  if (h.includes('mailchimp.com') || h.includes('chimpstatic')) add('Mailchimp', 'email_marketing');
  if (h.includes('klaviyo.com')) add('Klaviyo', 'email_marketing');
  if (h.includes('convertkit.com')) add('ConvertKit', 'email_marketing');
  if (h.includes('sendinblue') || h.includes('brevo.com')) add('Brevo', 'email_marketing');
  if (h.includes('constantcontact.com')) add('Constant Contact', 'email_marketing');
  if (h.includes('drip.com')) add('Drip', 'email_marketing');

  // Chat & Messaging
  if (h.includes('tawk.to')) add('Tawk.to', 'chat');
  if (h.includes('intercom.com') || h.includes('intercomcdn')) add('Intercom', 'chat');
  if (h.includes('tidio.co')) add('Tidio', 'chat');
  if (h.includes('crisp.chat')) add('Crisp', 'chat');
  if (h.includes('zendesk.com')) add('Zendesk', 'chat');
  if (h.includes('drift.com')) add('Drift', 'chat');
  if (h.includes('livechat') && h.includes('livechatinc')) add('LiveChat', 'chat');
  if (h.includes('api.whatsapp.com') || h.includes('wa.me/')) add('WhatsApp Business', 'chat');
  if (h.includes('m.me/') || h.includes('messenger.com')) add('Facebook Messenger', 'chat');

  // Booking
  if (h.includes('fresha.com')) add('Fresha', 'booking');
  if (h.includes('treatwell')) add('Treatwell', 'booking');
  if (h.includes('calendly.com')) add('Calendly', 'booking');
  if (h.includes('acuityscheduling')) add('Acuity', 'booking');
  if (h.includes('booksy.com')) add('Booksy', 'booking');
  if (h.includes('vagaro.com')) add('Vagaro', 'booking');
  if (h.includes('mindbody')) add('Mindbody', 'booking');
  if (h.includes('phorest.com')) add('Phorest', 'booking');
  if (h.includes('simplybook.me')) add('SimplyBook', 'booking');
  if (h.includes('jane.app') || h.includes('janeapp')) add('Jane App', 'booking');
  if (h.includes('setmore.com')) add('Setmore', 'booking');
  if (h.includes('square.site') || h.includes('squareup.com')) add('Square', 'booking');

  // Reviews
  if (h.includes('trustpilot.com')) add('Trustpilot', 'reviews');
  if (h.includes('birdeye.com')) add('Birdeye', 'reviews');
  if (h.includes('podium.com')) add('Podium', 'reviews');
  if (h.includes('yotpo.com')) add('Yotpo', 'reviews');

  // SEO
  if (h.includes('yoast')) add('Yoast SEO', 'seo');
  if (h.includes('rank-math') || h.includes('rankmath')) add('Rank Math', 'seo');
  if (h.includes('schema.org') || h.includes('application/ld+json')) add('Schema Markup', 'seo');
  if (h.includes('ahrefs.com')) add('Ahrefs', 'seo', 'medium');

  // Payment
  if (h.includes('stripe.com') || h.includes('js.stripe')) add('Stripe', 'payment');
  if (h.includes('paypal.com')) add('PayPal', 'payment');
  if (h.includes('klarna.com')) add('Klarna', 'payment');

  return tech;
}

// ─── SOCIAL PROFILE EXTRACTION ───────────────────────────────────
function extractSocialProfiles(html: string): Record<string, string | null> {
  const profiles: Record<string, string | null> = {};

  // Instagram — extract actual handle from href
  const igMatch = html.match(/href\s*=\s*["'](https?:\/\/(?:www\.)?instagram\.com\/([a-zA-Z0-9_.]{1,30}))\/?["']/i);
  if (igMatch && igMatch[2] && !['explore','accounts','p','reel','reels','stories','invites','direct'].includes(igMatch[2].toLowerCase())) {
    profiles.instagram = `https://www.instagram.com/${igMatch[2].toLowerCase()}`;
  }

  // Facebook — extract page URL (not tracking pixel)
  const fbMatch = html.match(/href\s*=\s*["'](https?:\/\/(?:www\.)?facebook\.com\/(?!tr|sharer|share)[a-zA-Z0-9_./-]{1,100})["']/i);
  if (fbMatch) profiles.facebook = fbMatch[1];

  // LinkedIn
  const liMatch = html.match(/href\s*=\s*["'](https?:\/\/(?:www\.)?linkedin\.com\/(?:company|in)\/[a-zA-Z0-9_-]{1,100})["']/i);
  if (liMatch) profiles.linkedin = liMatch[1];

  // TikTok
  const ttMatch = html.match(/href\s*=\s*["'](https?:\/\/(?:www\.)?tiktok\.com\/@[a-zA-Z0-9_.]{1,30})["']/i);
  if (ttMatch) profiles.tiktok = ttMatch[1];

  // YouTube
  const ytMatch = html.match(/href\s*=\s*["'](https?:\/\/(?:www\.)?youtube\.com\/(?:channel|c|@)[a-zA-Z0-9_/-]{1,100})["']/i);
  if (ytMatch) profiles.youtube = ytMatch[1];

  // Twitter/X
  const twMatch = html.match(/href\s*=\s*["'](https?:\/\/(?:www\.)?(?:twitter|x)\.com\/[a-zA-Z0-9_]{1,30})["']/i);
  if (twMatch) profiles.twitter = twMatch[1];

  return profiles;
}

// ─── EMAIL EXTRACTION ────────────────────────────────────────────
function extractEmails(html: string, businessDomain: string | null): string[] {
  const emails: string[] = [];

  // mailto: links first (most reliable)
  const mailtoMatches = html.match(/href\s*=\s*["']mailto:([^"'?]+)/gi) || [];
  for (const m of mailtoMatches) {
    const email = m.replace(/href\s*=\s*["']mailto:/i, '').trim().toLowerCase();
    if (isValidEmail(email)) emails.push(email);
  }

  // Regex for emails in text
  const textEmails = html.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];
  for (const email of textEmails) {
    const lower = email.toLowerCase();
    if (isValidEmail(lower) && !emails.includes(lower)) emails.push(lower);
  }

  // Prioritize: business domain emails first, then others
  if (businessDomain) {
    const domain = businessDomain.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
    emails.sort((a, b) => {
      const aMatch = a.endsWith(`@${domain}`) ? 0 : 1;
      const bMatch = b.endsWith(`@${domain}`) ? 0 : 1;
      return aMatch - bMatch;
    });
  }

  return emails.slice(0, 5); // Max 5 emails
}

function isValidEmail(email: string): boolean {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return false;
  const junk = ['example.com', 'sentry.io', 'wixpress.com', 'domain.com', 'email.com',
    'yoursite.com', 'website.com', 'test.com', 'noreply', 'no-reply', 'donotreply',
    'mailer-daemon', 'postmaster', '@sentry', '@wix.com', '@squarespace.com'];
  return !junk.some(j => email.includes(j));
}

// ─── PHONE EXTRACTION ────────────────────────────────────────────
function extractPhones(html: string): string[] {
  const phones: string[] = [];

  // tel: links (most reliable)
  const telMatches = html.match(/href\s*=\s*["']tel:([^"']+)/gi) || [];
  for (const m of telMatches) {
    const phone = m.replace(/href\s*=\s*["']tel:/i, '').replace(/\s/g, '');
    if (phone.length >= 7) phones.push(phone);
  }

  // UK phone patterns in text
  const ukPatterns = html.match(/(?:\+44|0)\s*[1-9]\d{2,4}\s*\d{3,4}\s*\d{3,4}/g) || [];
  for (const p of ukPatterns) {
    const clean = p.replace(/\s/g, '');
    if (!phones.includes(clean) && clean.length >= 10) phones.push(clean);
  }

  return phones.slice(0, 3);
}

// ─── PHONE VALIDATION (from existing enrich-validate) ────────────
function classifyPhone(phone: string, country: string | null): { type: string; whatsapp: boolean; formatted: string } {
  let digits = phone.replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) digits = '+' + digits.slice(1).replace(/\D/g, '');
  else digits = digits.replace(/\D/g, '');

  const countryLower = (country || '').toLowerCase();

  // UK
  if (digits.startsWith('+44') || digits.startsWith('44') || countryLower.includes('united kingdom') || countryLower === 'gb') {
    let nat = digits.replace(/^\+?44/, '').replace(/^0/, '');
    if (nat.startsWith('7') && nat.length === 10) return { type: 'mobile', whatsapp: true, formatted: `+44${nat}` };
    return { type: 'landline', whatsapp: false, formatted: `+44${nat}` };
  }
  // US/CA
  if (digits.startsWith('+1') || countryLower.includes('united states') || countryLower.includes('canada')) {
    let nat = digits.replace(/^\+?1/, '');
    if (nat.length === 10) return { type: 'mobile', whatsapp: true, formatted: `+1${nat}` };
    return { type: 'unknown', whatsapp: false, formatted: digits };
  }
  return { type: 'unknown', whatsapp: false, formatted: digits };
}

// ─── DATA COMPLETENESS SCORE ─────────────────────────────────────
function calcCompleteness(lead: any): number {
  let score = 0;
  if (lead.email) score += 20;
  if (lead.phone) score += 15;
  if (lead.website) score += 15;
  if (lead.instagram_url || lead.social_profiles?.instagram) score += 10;
  if (lead.social_profiles?.facebook) score += 5;
  if (lead.social_profiles?.linkedin) score += 5;
  if (lead.whatsapp_eligible) score += 10;
  if (lead.google_rating) score += 5;
  if ((lead.tech_stack || []).length > 0) score += 10;
  if (lead.has_pixel) score += 5;
  return Math.min(score, 100);
}

// ─── FIRECRAWL WEBSITE SCRAPE ────────────────────────────────────
async function scrapeWebsite(url: string): Promise<string | null> {
  const key = process.env.FIRECRAWL_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ url, formats: ['html'], onlyMainContent: false }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.data?.html || null;
  } catch { return null; }
}

// ─── MAIN: WATERFALL ENRICHMENT ──────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { lead_id, lead_ids, skip_crawl = false } = body;

    const ids = lead_ids || (lead_id ? [lead_id] : []);
    if (ids.length === 0) return NextResponse.json({ error: 'lead_id or lead_ids required' }, { status: 400 });

    const { data: leads } = await supabase
      .from('leads')
      .select('*')
      .in('id', ids.slice(0, 50));

    if (!leads?.length) return NextResponse.json({ error: 'No leads found' }, { status: 404 });

    const results: any[] = [];

    for (const lead of leads) {
      const sources: string[] = [];
      const updates: Record<string, any> = {
        enrichment_attempts: (lead.enrichment_attempts || 0) + 1,
        last_enriched_at: new Date().toISOString(),
      };

      let html: string | null = null;

      // ── STEP 1: CRAWL WEBSITE (if has one) ──
      if (lead.website && !skip_crawl) {
        html = await scrapeWebsite(lead.website);
        if (html) {
          sources.push('website_crawl');

          // Tech stack detection
          const techStack = detectTechStack(html);
          updates.tech_stack = techStack;
          updates.cms_platform = techStack.find(t => t.category === 'cms')?.name || null;

          // Pixel detection
          const pixels = techStack.filter(t => t.category === 'pixel');
          updates.has_pixel = pixels.length > 0;
          updates.pixel_types = pixels.map(p => p.name);

          // Booking detection
          updates.has_booking = techStack.some(t => t.category === 'booking');

          // Social profiles (proper href extraction)
          const socials = extractSocialProfiles(html);
          updates.social_profiles = socials;
          // Don't demote a lead from has_social:true — only upgrade, or set true if genuinely found
          if (Object.keys(socials).length > 0) {
            updates.has_social = true;
          } else if (!lead.has_social && !lead.instagram_url) {
            updates.has_social = false;
          }

          // Instagram — waterfall: use extracted href over existing
          if (socials.instagram) {
            const handle = socials.instagram.replace(/^https?:\/\/(?:www\.)?instagram\.com\//, '').replace(/\/$/, '');
            updates.instagram_url = socials.instagram;
            updates.instagram_handle = handle;
            updates.instagram_verified = true;
          } else if (lead.instagram_url) {
            // Validate existing
            const igPath = lead.instagram_url.replace(/^https?:\/\/(?:www\.)?instagram\.com\//, '').replace(/\/$/, '').toLowerCase();
            const invalid = ['invites', 'explore', 'accounts', 'p', 'reel', 'reels', 'stories', 'direct', ''];
            if (invalid.includes(igPath)) {
              updates.instagram_url = null;
              updates.instagram_handle = null;
              updates.instagram_verified = false;
            }
          }

          // Email — waterfall: website crawl emails
          if (!lead.email) {
            const emails = extractEmails(html, lead.website);
            if (emails.length > 0) {
              updates.email = emails[0];
              updates.has_email = true;
              sources.push('email_from_website');
            }
          }

          // Phone — waterfall: if missing or unclassified, check website
          if (!lead.phone) {
            const phones = extractPhones(html);
            if (phones.length > 0) {
              const classified = classifyPhone(phones[0], lead.country);
              updates.phone = phones[0];
              updates.phone_formatted = classified.formatted;
              updates.phone_type = classified.type;
              updates.whatsapp_eligible = classified.whatsapp;
              updates.has_phone = true;
              sources.push('phone_from_website');
            }
          } else {
            // Classify existing phone
            const classified = classifyPhone(lead.phone, lead.country);
            updates.phone_type = classified.type;
            updates.phone_formatted = classified.formatted;
            updates.whatsapp_eligible = classified.whatsapp;
          }
        }
      } else if (lead.phone) {
        // Even without crawl, classify existing phone
        const classified = classifyPhone(lead.phone, lead.country);
        updates.phone_type = classified.type;
        updates.phone_formatted = classified.formatted;
        updates.whatsapp_eligible = classified.whatsapp;
      }

      // ── STEP 2: SET BOOLEAN FLAGS ──
      updates.has_website = !!(lead.website || updates.website);
      updates.has_email = !!(lead.email || updates.email);
      updates.has_phone = !!(lead.phone || updates.phone);

      // ── STEP 3: CALCULATE COMPLETENESS ──
      const mergedLead = { ...lead, ...updates };
      updates.data_completeness = calcCompleteness(mergedLead);
      updates.enrichment_sources = [...(lead.enrichment_sources || []), ...sources.map(s => ({ source: s, at: new Date().toISOString() }))];

      // ── SAVE ──
      await supabase.from('leads').update(updates).eq('id', lead.id);

      results.push({
        id: lead.id,
        business_name: lead.business_name,
        enrichment_sources: sources,
        tech_stack: updates.tech_stack || [],
        cms: updates.cms_platform,
        pixels: updates.pixel_types || [],
        social_profiles: updates.social_profiles || {},
        email_found: sources.includes('email_from_website'),
        phone_found: sources.includes('phone_from_website'),
        phone_type: updates.phone_type,
        whatsapp_eligible: updates.whatsapp_eligible || false,
        data_completeness: updates.data_completeness,
      });
    }

    return NextResponse.json({ processed: results.length, results });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// ─── GET: Batch enrich un-enriched leads ─────────────────────────
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '25', 10), 100);

    const { data: leads } = await supabase
      .from('leads')
      .select('id')
      .or('last_enriched_at.is.null,tech_stack.is.null')
      .not('website', 'is', null)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (!leads?.length) return NextResponse.json({ message: 'All leads enriched', processed: 0 });

    // Trigger enrichment via internal POST
    const batchResults: any[] = [];
    const chunkSize = 5;

    for (let i = 0; i < leads.length; i += chunkSize) {
      const chunk = leads.slice(i, i + chunkSize).map(l => l.id);
      const { data: chunkLeads } = await supabase.from('leads').select('*').in('id', chunk);
      if (!chunkLeads) continue;

      for (const lead of chunkLeads) {
        try {
          const sources: string[] = [];
          const updates: Record<string, any> = {
            enrichment_attempts: (lead.enrichment_attempts || 0) + 1,
            last_enriched_at: new Date().toISOString(),
          };

          if (lead.website) {
            const html = await scrapeWebsite(lead.website);
            if (html) {
              sources.push('website_crawl');
              const techStack = detectTechStack(html);
              updates.tech_stack = techStack;
              updates.cms_platform = techStack.find((t: TechItem) => t.category === 'cms')?.name || null;
              const pixels = techStack.filter((t: TechItem) => t.category === 'pixel');
              updates.has_pixel = pixels.length > 0;
              updates.pixel_types = pixels.map((p: TechItem) => p.name);
              updates.has_booking = techStack.some((t: TechItem) => t.category === 'booking');
              const socials = extractSocialProfiles(html);
              updates.social_profiles = socials;
              if (Object.keys(socials).length > 0) {
                updates.has_social = true;
              } else if (!lead.has_social && !lead.instagram_url) {
                updates.has_social = false;
              }
              if (socials.instagram) {
                updates.instagram_url = socials.instagram;
                updates.instagram_handle = socials.instagram.replace(/^https?:\/\/(?:www\.)?instagram\.com\//, '').replace(/\/$/, '');
                updates.instagram_verified = true;
              }
              if (!lead.email) {
                const emails = extractEmails(html, lead.website);
                if (emails.length > 0) { updates.email = emails[0]; updates.has_email = true; }
              }
              if (!lead.phone) {
                const phones = extractPhones(html);
                if (phones.length > 0) {
                  const c = classifyPhone(phones[0], lead.country);
                  updates.phone = phones[0]; updates.phone_type = c.type; updates.whatsapp_eligible = c.whatsapp;
                  updates.has_phone = true;
                }
              }
            }
          }

          if (lead.phone && !updates.phone_type) {
            const c = classifyPhone(lead.phone, lead.country);
            updates.phone_type = c.type; updates.whatsapp_eligible = c.whatsapp;
          }

          updates.has_website = !!lead.website;
          updates.has_email = !!(lead.email || updates.email);
          updates.has_phone = !!(lead.phone || updates.phone);
          updates.data_completeness = calcCompleteness({ ...lead, ...updates });

          await supabase.from('leads').update(updates).eq('id', lead.id);
          batchResults.push({ id: lead.id, name: lead.business_name, sources });
        } catch { continue; }
      }
    }

    return NextResponse.json({ processed: batchResults.length, results: batchResults });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
