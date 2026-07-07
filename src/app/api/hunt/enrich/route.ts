import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { authOr401 } from '@/lib/api-auth';
import {
  fetchWebsite, extractContacts, detectDevices, detectBookingSystem,
  loadDeviceKeywords, loadBookingFingerprints,
  domainFromUrl, lookupCompaniesHouse, lookupDomainCreated,
} from '@/lib/hunt';

// ═══════════════════════════════════════════════════════
// /api/hunt/enrich
// Batch enrich leads with device / booking / contact / establishment signals.
// Writes to public.hunt_enrichment; one row per lead_id.
// ═══════════════════════════════════════════════════════

interface EnrichRequest {
  lead_ids?: string[];   // explicit set
  limit?: number;        // if lead_ids not provided, batch this many un-enriched
  refetch?: boolean;     // re-run even if a row already exists
}

interface Lead {
  id: string;
  business_name: string;
  website: string | null;
  country: string | null;
  google_rating: number | null;
  google_review_count: number | null;
}

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export async function POST(request: NextRequest) {
  const auth = await authOr401();
  if (auth instanceof NextResponse) return auth;

  const body = (await request.json().catch(() => ({}))) as EnrichRequest;
  const explicit = Array.isArray(body.lead_ids) ? body.lead_ids : null;
  const limit = Math.min(MAX_LIMIT, body.limit || DEFAULT_LIMIT);
  const refetch = !!body.refetch;

  // Load target leads
  let targets: Lead[] = [];
  if (explicit && explicit.length > 0) {
    const { data } = await supabaseAdmin
      .from('leads')
      .select('id, business_name, website, country, google_rating, google_review_count')
      .in('id', explicit)
      .limit(explicit.length);
    targets = (data || []) as Lead[];
  } else {
    // Un-enriched leads with a website, prioritise recent
    let q = supabaseAdmin
      .from('leads')
      .select('id, business_name, website, country, google_rating, google_review_count')
      .not('website', 'is', null)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (!refetch) {
      // Skip leads that already have a hunt_enrichment row
      const { data: enriched } = await supabaseAdmin
        .from('hunt_enrichment')
        .select('lead_id')
        .limit(2000);
      const skipSet = new Set((enriched || []).map(r => (r as { lead_id: string }).lead_id));
      const { data } = await q;
      targets = ((data || []) as Lead[]).filter(l => !skipSet.has(l.id)).slice(0, limit);
    } else {
      const { data } = await q;
      targets = (data || []) as Lead[];
    }
  }

  if (targets.length === 0) {
    return NextResponse.json({ success: true, processed: 0, message: 'No leads to enrich' });
  }

  const devices = await loadDeviceKeywords();
  const bookingFps = await loadBookingFingerprints();

  const results: Array<{ lead_id: string; ok: boolean; devices?: number; booking?: string | null; agency?: boolean; error?: string }> = [];

  // Process serially — each website fetch is 8s max, we don't want to hammer
  for (const lead of targets) {
    const website = lead.website || '';
    const fetched = await fetchWebsite(website, 8000);
    const combined = fetched.html || '';

    const deviceHit = detectDevices(combined, devices);
    const booking = detectBookingSystem(combined, bookingFps);
    const contacts = extractContacts(combined);

    // Establishment lookups — best-effort, tolerate failures
    const isUK = (lead.country || '').toLowerCase().includes('kingdom') || (lead.country || '').toLowerCase() === 'gb' || (lead.country || '').toLowerCase() === 'uk';
    const ch = isUK ? await lookupCompaniesHouse(lead.business_name) : null;

    const domain = domainFromUrl(fetched.final_url || website);
    const domain_created = domain ? await lookupDomainCreated(domain) : null;

    const row = {
      lead_id: lead.id,
      website_url: fetched.final_url || website,
      html_fetched_at: new Date().toISOString(),
      fetch_ok: fetched.ok,
      devices_found: deviceHit.devices_found,
      tier_a_count: deviceHit.tier_a_count,
      tier_b_count: deviceHit.tier_b_count,
      generic_kit_only: deviceHit.generic_kit_only,
      booking_system: booking.booking_system,
      has_other_agency: booking.has_other_agency,
      google_rating: lead.google_rating,
      google_review_count: lead.google_review_count,
      instagram_handle: contacts.instagram_handle,
      email_found: contacts.email,
      phone_found: contacts.phone,
      fb_page_url: contacts.fb_page_url,
      fb_page_id: contacts.fb_page_id,
      companies_house_number: ch?.company_number ?? null,
      incorporation_date: ch?.date_of_creation ?? null,
      company_status: ch?.company_status ?? null,
      domain_created,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabaseAdmin
      .from('hunt_enrichment')
      .upsert(row, { onConflict: 'lead_id' });

    if (error) {
      results.push({ lead_id: lead.id, ok: false, error: error.message });
    } else {
      results.push({
        lead_id: lead.id,
        ok: true,
        devices: deviceHit.tier_a_count + deviceHit.tier_b_count,
        booking: booking.booking_system,
        agency: booking.has_other_agency,
      });
    }
  }

  return NextResponse.json({
    success: true,
    processed: results.length,
    fetched_ok: results.filter(r => r.ok).length,
    with_devices: results.filter(r => (r.devices || 0) > 0).length,
    with_agency_flag: results.filter(r => r.agency).length,
    results,
  });
}
