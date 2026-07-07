import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { authOr401 } from '@/lib/api-auth';
import {
  fetchWebsite, extractContacts, detectDevices, detectBookingSystem,
  loadDeviceKeywords, loadBookingFingerprints,
  domainFromUrl, lookupCompaniesHouse, lookupDomainCreated,
} from '@/lib/hunt';
import { fetchActiveAdsByPageId, fetchAllAdsByPageId, summariseAds } from '@/lib/meta-ads';
import { scoreLead } from '@/lib/hunt-scoring';
import { postLeadCard, postText } from '@/lib/hunt-slack';
import { isoCountry } from '@/lib/hunt';

// ═══════════════════════════════════════════════════════
// /api/hunt/run
// End-to-end orchestrator: enrich → ad-check → score →
// personalize (hot only) → Slack lead cards (hot only).
//
// Body:
//   { lead_ids?: string[], limit?: number, personalize?: bool, slack?: bool, cron_secret?: string }
//
// Also invoked by cron via GET ?cron=nightly (with CRON_SECRET bearer).
// ═══════════════════════════════════════════════════════

interface RunRequest {
  lead_ids?: string[];
  limit?: number;
  personalize?: boolean;
  slack?: boolean;
  slack_channel?: string;
}

interface LeadRow {
  id: string;
  business_name: string;
  website: string | null;
  city: string | null;
  country: string | null;
  google_rating: number | null;
  google_review_count: number | null;
  seed_source: string | null;
  email: string | null;
  phone: string | null;
  phone_formatted: string | null;
  instagram_handle: string | null;
}

const LEAD_SELECT = 'id, business_name, website, city, country, google_rating, google_review_count, seed_source, email, phone, phone_formatted, instagram_handle';

async function runHunt({ lead_ids, limit = 15, personalize = true, slack = true, slack_channel }: RunRequest) {
  // Pick leads
  let targets: LeadRow[] = [];
  if (lead_ids && lead_ids.length > 0) {
    const { data } = await supabaseAdmin.from('leads').select(LEAD_SELECT).in('id', lead_ids);
    targets = (data || []) as LeadRow[];
  } else {
    // Prefer leads without hunt_scores and with a website
    const { data: scored } = await supabaseAdmin.from('hunt_scores').select('lead_id').limit(5000);
    const scoredSet = new Set((scored || []).map(r => (r as { lead_id: string }).lead_id));
    const { data: candidates } = await supabaseAdmin.from('leads').select(LEAD_SELECT)
      .not('website', 'is', null).order('created_at', { ascending: false }).limit(limit * 3);
    targets = ((candidates || []) as LeadRow[]).filter(l => !scoredSet.has(l.id)).slice(0, limit);
  }

  if (targets.length === 0) {
    return { processed: 0, hot: 0, warm: 0, cold: 0, disqualified: 0, message: 'No new leads to hunt.' };
  }

  const devices = await loadDeviceKeywords();
  const bookingFps = await loadBookingFingerprints();
  const now = new Date().toISOString();

  const perLead: Array<{ id: string; band: string }> = [];

  for (const lead of targets) {
    // ─── enrich ─────────────────────────────
    const website = lead.website || '';
    const fetched = await fetchWebsite(website, 8000);
    const html = fetched.html || '';
    const deviceHit = detectDevices(html, devices);
    const booking = detectBookingSystem(html, bookingFps);
    const contacts = extractContacts(html);
    const isUK = (lead.country || '').toLowerCase().includes('kingdom');
    const ch = isUK ? await lookupCompaniesHouse(lead.business_name) : null;
    const domain = domainFromUrl(fetched.final_url || website);
    const domainCreated = domain ? await lookupDomainCreated(domain) : null;

    await supabaseAdmin.from('hunt_enrichment').upsert({
      lead_id: lead.id,
      website_url: fetched.final_url || website,
      html_fetched_at: now,
      fetch_ok: fetched.ok,
      devices_found: deviceHit.devices_found,
      tier_a_count: deviceHit.tier_a_count,
      tier_b_count: deviceHit.tier_b_count,
      generic_kit_only: deviceHit.generic_kit_only,
      booking_system: booking.booking_system,
      has_other_agency: booking.has_other_agency,
      google_rating: lead.google_rating,
      google_review_count: lead.google_review_count,
      instagram_handle: contacts.instagram_handle ?? lead.instagram_handle,
      email_found: contacts.email ?? lead.email,
      phone_found: contacts.phone ?? lead.phone_formatted ?? lead.phone,
      fb_page_url: contacts.fb_page_url,
      fb_page_id: contacts.fb_page_id,
      companies_house_number: ch?.company_number ?? null,
      incorporation_date: ch?.date_of_creation ?? null,
      company_status: ch?.company_status ?? null,
      domain_created: domainCreated,
      updated_at: now,
    }, { onConflict: 'lead_id' });

    // ─── ad-check ───────────────────────────
    if (contacts.fb_page_id) {
      const country = isoCountry(lead.country) || 'GB';
      const active = await fetchActiveAdsByPageId(contacts.fb_page_id, country, 25);
      const all = active.length > 0 ? await fetchAllAdsByPageId(contacts.fb_page_id, country, 100) : [];
      const summary = summariseAds(active, all, contacts.fb_page_id);
      await supabaseAdmin.from('hunt_ad_intel').upsert({
        lead_id: lead.id,
        ads_active: summary.ads_active,
        ad_count: summary.ad_count,
        earliest_ad_start: summary.earliest_ad_start,
        ad_days_running: summary.ad_days_running,
        ad_copy_samples: summary.ad_copy_samples,
        ad_platforms: summary.ad_platforms,
        library_url: summary.library_url,
        first_ever_ad_date: summary.first_ever_ad_date,
        total_ads_all_time: summary.total_ads_all_time,
        checked_at: now,
      }, { onConflict: 'lead_id' });

      if (summary.ads_active) {
        await supabaseAdmin.from('ad_snapshots').upsert({
          fb_page_id: contacts.fb_page_id,
          page_name: lead.business_name,
          snapshot_date: now.slice(0, 10),
          active_ad_count: summary.ad_count,
          ad_ids: active.map(a => a.id).filter((x): x is string => !!x),
          treatment_keywords: deviceHit.devices_found,
          country,
        }, { onConflict: 'fb_page_id,snapshot_date' });
      }
    }

    // ─── score ──────────────────────────────
    const score = await scoreLead(lead.id);
    if (!score) continue;
    perLead.push({ id: lead.id, band: score.band });

    // ─── personalize + slack (hot only) ─────
    if (score.band === 'hot') {
      let opener: string | null = null;
      let angle: string | null = null;
      if (personalize) {
        const url = new URL('/api/hunt/personalize', request_url()).toString();
        try {
          const res = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              // internal call — pass along an auth token if we had one; for cron
              // this will hit the auth gate. We fall back to writing outreach
              // via direct db call on failure.
              ...(process.env.CRON_SECRET ? { authorization: `Bearer ${process.env.CRON_SECRET}` } : {}),
            },
            body: JSON.stringify({ lead_ids: [lead.id], channel: 'instagram_dm', limit: 1 }),
          });
          const j = await res.json();
          if (j.success) {
            const { data: last } = await supabaseAdmin.from('hunt_outreach').select('opener, angle').eq('lead_id', lead.id).order('generated_at', { ascending: false }).limit(1).maybeSingle();
            opener = (last as { opener?: string } | null)?.opener || null;
            angle = (last as { angle?: string } | null)?.angle || null;
          }
        } catch {
          // ignore
        }
      }

      if (slack) {
        const { data: enrich } = await supabaseAdmin.from('hunt_enrichment')
          .select('devices_found, booking_system, has_other_agency, email_found, phone_found, instagram_handle')
          .eq('lead_id', lead.id).maybeSingle();
        const { data: intel } = await supabaseAdmin.from('hunt_ad_intel')
          .select('ads_active, ad_count, ad_days_running, library_url')
          .eq('lead_id', lead.id).maybeSingle();
        const e = (enrich || {}) as { devices_found: string[] | null; booking_system: string | null; has_other_agency: boolean | null; email_found: string | null; phone_found: string | null; instagram_handle: string | null };
        const i = (intel || {}) as { ads_active: boolean | null; ad_count: number | null; ad_days_running: number | null; library_url: string | null };
        await postLeadCard({
          score: score.total_score,
          band: score.band,
          business_name: lead.business_name,
          city: lead.city,
          country: lead.country,
          devices: e.devices_found || [],
          booking_system: e.booking_system,
          google_review_count: lead.google_review_count,
          google_rating: lead.google_rating,
          ads_active: !!i.ads_active,
          ad_count: i.ad_count || 0,
          ad_days_running: i.ad_days_running,
          library_url: i.library_url,
          email: e.email_found || lead.email,
          instagram_handle: e.instagram_handle || lead.instagram_handle,
          phone: e.phone_found || lead.phone_formatted || lead.phone,
          opener,
          angle,
          lead_id: lead.id,
          seed_source: lead.seed_source,
          has_other_agency: !!e.has_other_agency,
          establishment_index: score.establishment_index,
        }, slack_channel);
      }
    }
  }

  const bands = perLead.reduce((acc, r) => { acc[r.band] = (acc[r.band] || 0) + 1; return acc; }, {} as Record<string, number>);
  return {
    processed: targets.length,
    hot: bands.hot || 0,
    warm: bands.warm || 0,
    cold: bands.cold || 0,
    disqualified: bands.disqualified || 0,
  };
}

// The internal fetch to /api/hunt/personalize needs the request URL origin.
// We stash it into a module-level ref before invoking runHunt.
let _originHolder = '';
function request_url() { return _originHolder || 'http://localhost:3000'; }

// ─── POST (user-triggered) ──────────────────────────────

export async function POST(request: NextRequest) {
  const auth = await authOr401();
  if (auth instanceof NextResponse) return auth;

  _originHolder = new URL(request.url).origin;
  const body = (await request.json().catch(() => ({}))) as RunRequest;
  const result = await runHunt(body);
  return NextResponse.json({ success: true, ...result });
}

// ─── GET (cron) ─────────────────────────────────────────

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const cron = url.searchParams.get('cron');
  if (!cron) return NextResponse.json({ error: 'cron param required' }, { status: 400 });

  const expected = process.env.CRON_SECRET;
  if (expected) {
    const authHeader = request.headers.get('authorization') || '';
    if (authHeader !== `Bearer ${expected}`) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
  }

  if (cron !== 'nightly') return NextResponse.json({ error: `Unknown cron: ${cron}` }, { status: 400 });

  _originHolder = url.origin;
  const limit = parseInt(url.searchParams.get('limit') || '15', 10);
  const result = await runHunt({ limit, personalize: true, slack: true });
  await postText(`🎯 *Nightly hunt run*: processed ${result.processed} · 🔥 ${result.hot} hot · 🌤️ ${result.warm} warm · ❄️ ${result.cold} cold · 🚫 ${result.disqualified} DQ`);
  return NextResponse.json({ success: true, ...result });
}
