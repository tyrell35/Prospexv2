import { NextRequest, NextResponse } from 'next/server';

import { supabaseAdmin as supabase } from '@/lib/supabase-admin';
import { authOr401 } from '@/lib/api-auth';

export const maxDuration = 300;

// ═══════════════════════════════════════════════════════════════
// CLIENT SUPPRESSION — never cold-message someone we already serve
//
// The lead database and the GoHighLevel sub-account list cover the
// same niches in the same cities, so an existing client sitting in
// the cold queue is a live risk rather than a theoretical one.
//
// Matching is on phone and website domain ONLY. Name matching was
// tried and is useless on this data — "Aesthetic Empire Academy"
// matches any lead with "aesthetic" in the name, which is most of
// the database. A false positive here silently removes a real
// prospect, so the bar is exact identifiers.
// ═══════════════════════════════════════════════════════════════

interface GhlLocation {
  id?: string;
  name?: string;
  phone?: string;
  website?: string;
  city?: string;
  country?: string;
}

function phoneKey(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const d = phone.replace(/\D/g, '');
  return d.length >= 10 ? d.slice(-10) : null;
}

function domainOf(url: string | null | undefined): string | null {
  if (!url) return null;
  const d = url.toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .split(/[/?#:]/)[0]
    .trim();
  return d && d.includes('.') ? d : null;
}

/** Page through the agency's sub-accounts. Requires a company-level token. */
async function fetchLocations(apiKey: string, companyId: string | null): Promise<GhlLocation[]> {
  const out: GhlLocation[] = [];
  const limit = 100;

  for (let skip = 0; skip < 2000; skip += limit) {
    const url = new URL('https://services.leadconnectorhq.com/locations/search');
    url.searchParams.set('limit', String(limit));
    url.searchParams.set('skip', String(skip));
    if (companyId) url.searchParams.set('companyId', companyId);

    const res = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Version: '2021-07-28',
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(20000),
    });

    if (!res.ok) {
      const body = (await res.text()).slice(0, 300);
      if (skip === 0) throw new Error(`GoHighLevel rejected the location list (HTTP ${res.status}): ${body}`);
      break; // partial page set is still usable
    }

    const data = await res.json();
    const page = (data?.locations || data?.data || []) as GhlLocation[];
    out.push(...page);
    if (page.length < limit) break;
  }
  return out;
}

export async function POST(request: NextRequest) {
  const auth = await authOr401();
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await request.json().catch(() => ({}));
    const action: string = body.action || 'sync';

    // ─── Match whatever is already in client_accounts against leads ───
    if (action === 'match') return matchLeads(body.dry_run !== false);

    // ─── Pull sub-accounts from GHL, then match ───
    const apiKey = (process.env.GHL_API_KEY || '').trim();
    if (!apiKey) {
      return NextResponse.json({ error: 'GHL_API_KEY is not set — needed to list sub-accounts.' }, { status: 400 });
    }

    const locations = await fetchLocations(apiKey, process.env.GHL_COMPANY_ID || null);
    if (locations.length === 0) {
      return NextResponse.json({
        error: 'GoHighLevel returned no sub-accounts. GHL_API_KEY is probably a location key rather than an agency key — listing locations needs agency scope.',
      }, { status: 400 });
    }

    const rows = locations
      .filter(l => l.id && l.name)
      .map(l => ({
        ghl_location_id: l.id!,
        name: l.name!,
        phone: l.phone || null,
        phone_key: phoneKey(l.phone),
        website: l.website || null,
        domain: domainOf(l.website),
        city: l.city || null,
        country: l.country || null,
        synced_at: new Date().toISOString(),
      }));

    // Chunked so a large agency doesn't blow the request size.
    for (let i = 0; i < rows.length; i += 200) {
      const { error } = await supabase
        .from('client_accounts')
        .upsert(rows.slice(i, i + 200), { onConflict: 'ghl_location_id' });
      if (error) throw new Error(error.message);
    }

    const matched = await matchLeads(body.dry_run !== false);
    const matchBody = await matched.json();

    return NextResponse.json({
      success: true,
      synced: rows.length,
      with_phone: rows.filter(r => r.phone_key).length,
      with_domain: rows.filter(r => r.domain).length,
      ...matchBody,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Client sync failed';
    console.error('[client-sync]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * Flag leads that are actually existing clients.
 *
 * Defaults to a dry run: suppressing a lead is destructive to the
 * pipeline, so the matches are reported for review before anything is
 * written. Pass dry_run: false to apply.
 */
async function matchLeads(dryRun: boolean) {
  const { data: clients } = await supabase
    .from('client_accounts')
    .select('id, name, phone_key, domain')
    .eq('status', 'active');

  const rows = (clients || []) as Array<{ id: string; name: string; phone_key: string | null; domain: string | null }>;
  const byPhone = new Map(rows.filter(r => r.phone_key).map(r => [r.phone_key!, r]));
  const byDomain = new Map(rows.filter(r => r.domain).map(r => [r.domain!, r]));

  if (byPhone.size === 0 && byDomain.size === 0) {
    return NextResponse.json({ matched: 0, note: 'No client phone numbers or domains to match on.' });
  }

  const phones = Array.from(byPhone.keys());
  const domains = Array.from(byDomain.keys());
  const hits = new Map<string, { lead: Record<string, unknown>; client: string; via: string }>();

  const collect = (
    leads: Array<Record<string, unknown>>,
    key: 'phone_key' | 'website_domain',
    lookup: Map<string, { name: string }>,
    via: string,
  ) => {
    for (const l of leads) {
      const k = l[key] as string | null;
      const client = k ? lookup.get(k) : null;
      if (client) hits.set(l.id as string, { lead: l, client: client.name, via });
    }
  };

  // Chunked IN() lists — an agency can carry hundreds of sub-accounts.
  for (let i = 0; i < phones.length; i += 200) {
    const { data } = await supabase
      .from('leads')
      .select('id, business_name, phone_key, website_domain, relationship, outreach_status, call_stage')
      .in('phone_key', phones.slice(i, i + 200));
    collect((data || []) as Array<Record<string, unknown>>, 'phone_key', byPhone, 'phone');
  }
  for (let i = 0; i < domains.length; i += 200) {
    const { data } = await supabase
      .from('leads')
      .select('id, business_name, phone_key, website_domain, relationship, outreach_status, call_stage')
      .in('website_domain', domains.slice(i, i + 200));
    collect((data || []) as Array<Record<string, unknown>>, 'website_domain', byDomain, 'domain');
  }

  const matches = Array.from(hits.entries()).map(([id, v]) => ({
    lead_id: id,
    business_name: v.lead.business_name,
    client_account: v.client,
    matched_on: v.via,
    // Surfaced because it says whether we already embarrassed ourselves.
    already_contacted: v.lead.outreach_status !== 'not_started' || v.lead.call_stage !== 'not_called',
  }));

  if (!dryRun && matches.length > 0) {
    const ids = matches.map(m => m.lead_id);
    for (let i = 0; i < ids.length; i += 200) {
      await supabase.from('leads').update({
        relationship: 'client',
        relationship_source: 'ghl_sync',
        relationship_set_at: new Date().toISOString(),
        relationship_note: 'Matched a live GoHighLevel sub-account',
      }).in('id', ids.slice(i, i + 200));
    }
  }

  return NextResponse.json({
    matched: matches.length,
    already_contacted: matches.filter(m => m.already_contacted).length,
    applied: !dryRun,
    dry_run: dryRun,
    matches: matches.slice(0, 100),
  });
}
