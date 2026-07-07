import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { authOr401 } from '@/lib/api-auth';
import { fetchActiveAdsByPageId, fetchAllAdsByPageId, summariseAds } from '@/lib/meta-ads';
import { isoCountry } from '@/lib/hunt';

// ═══════════════════════════════════════════════════════
// /api/hunt/ad-check
// Mode 2: per-lead ad qualification via Meta Ad Library.
// Requires the lead to have a fb_page_id in hunt_enrichment (populated by
// /api/hunt/enrich). Writes hunt_ad_intel and snapshots ad_snapshots.
// If META_ADS_TOKEN is not set, records ads_active=false with a warning.
// ═══════════════════════════════════════════════════════

interface AdCheckRequest {
  lead_ids?: string[];
  limit?: number;
  refetch?: boolean;
}

interface LeadJoin {
  id: string;
  business_name: string;
  country: string | null;
  hunt_enrichment: { fb_page_id: string | null; fb_page_url: string | null } | null;
}

export async function POST(request: NextRequest) {
  const auth = await authOr401();
  if (auth instanceof NextResponse) return auth;

  const body = (await request.json().catch(() => ({}))) as AdCheckRequest;
  const limit = Math.min(100, body.limit || 20);
  const refetch = !!body.refetch;
  const hasToken = !!process.env.META_ADS_TOKEN;

  // Load leads that have an fb_page_id
  let leadQuery = supabaseAdmin
    .from('leads')
    .select('id, business_name, country, hunt_enrichment:hunt_enrichment(fb_page_id, fb_page_url)')
    .limit(500);
  if (body.lead_ids && body.lead_ids.length > 0) {
    leadQuery = leadQuery.in('id', body.lead_ids);
  }
  const { data: rawLeads } = await leadQuery;
  const leads = (rawLeads || []) as unknown as LeadJoin[];

  const candidates = leads.filter(l => l.hunt_enrichment?.fb_page_id).slice(0, limit);

  if (!refetch) {
    const ids = candidates.map(l => l.id);
    if (ids.length > 0) {
      const { data: existing } = await supabaseAdmin
        .from('hunt_ad_intel')
        .select('lead_id')
        .in('lead_id', ids);
      const skipSet = new Set((existing || []).map(r => (r as { lead_id: string }).lead_id));
      const filtered = candidates.filter(l => !skipSet.has(l.id));
      candidates.splice(0, candidates.length, ...filtered);
    }
  }

  if (candidates.length === 0) {
    return NextResponse.json({
      success: true,
      processed: 0,
      message: leads.length === 0
        ? 'No leads have an fb_page_id yet — run /api/hunt/enrich first.'
        : 'All matching leads already have hunt_ad_intel; use refetch=true to re-run.',
      token_configured: hasToken,
    });
  }

  const results: Array<{ lead_id: string; ads_active: boolean; ad_count: number; ad_days_running: number | null }> = [];
  const now = new Date().toISOString();

  for (const lead of candidates) {
    const pageId = lead.hunt_enrichment!.fb_page_id!;
    const country = isoCountry(lead.country) || 'GB';

    const active = await fetchActiveAdsByPageId(pageId, country, 25);
    const all = active.length > 0 ? await fetchAllAdsByPageId(pageId, country, 100) : [];
    const summary = summariseAds(active, all, pageId);

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

    // Snapshot for time-series (Section 11.1). Idempotent per fb_page_id + today.
    if (summary.ads_active) {
      await supabaseAdmin.from('ad_snapshots').upsert({
        fb_page_id: pageId,
        page_name: lead.business_name,
        snapshot_date: now.slice(0, 10),
        active_ad_count: summary.ad_count,
        ad_ids: active.map(a => a.id).filter((x): x is string => !!x),
        treatment_keywords: [],
        country,
      }, { onConflict: 'fb_page_id,snapshot_date' });
    }

    results.push({
      lead_id: lead.id,
      ads_active: summary.ads_active,
      ad_count: summary.ad_count,
      ad_days_running: summary.ad_days_running,
    });
  }

  return NextResponse.json({
    success: true,
    processed: results.length,
    token_configured: hasToken,
    ...(!hasToken && { warning: 'META_ADS_TOKEN not set — all leads recorded as ads_active=false. Add the token and refetch to see real data.' }),
    ads_active_count: results.filter(r => r.ads_active).length,
    results,
  });
}
