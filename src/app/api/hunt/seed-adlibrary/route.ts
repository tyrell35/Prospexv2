import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { authOr401 } from '@/lib/api-auth';
import { searchAdsByKeyword, classifySeedResult, type AdRow } from '@/lib/meta-ads';

// ═══════════════════════════════════════════════════════
// /api/hunt/seed-adlibrary  (Section 4 Mode 1)
// Two modes:
//
//   A. Live search (mode='search'):
//      Body: { keyword: 'morpheus8', country: 'GB', limit: 50 }
//      Hits Meta Ads Library with META_AD_LIBRARY_TOKEN and writes each unique page
//      to hunt_ad_library_queue. Classified as clinic/agency/junk/ambiguous.
//
//   B. Manual import (mode='import'):
//      Body: { country: 'GB', search_term: 'morpheus8', ads: [{ page_id, page_name, ad_snapshot_url, currency, ad_copy, ad_titles?[], ad_bodies?[] }, ...] }
//      Accepts a caller-supplied array of ad rows (e.g. from the Claude Facebook
//      Ads MCP, from Apify, or from CSV). Same dedupe + classification.
//
// Both modes:
//   - clinic → status='pending' (goes to review queue with prefilled classification)
//   - agency → status='competitor'
//   - junk   → skipped entirely (not stored)
//   - ambiguous → status='pending'
// ═══════════════════════════════════════════════════════

interface SearchBody {
  mode: 'search';
  keyword: string;
  country?: string;
  limit?: number;
}

interface ImportRow {
  page_id: string;
  page_name?: string;
  ad_snapshot_url?: string;
  currency?: string;
  ad_copy?: string;
  ad_titles?: string[];
  ad_bodies?: string[];
}

interface ImportBody {
  mode: 'import';
  country: string;
  search_term: string;
  ads: ImportRow[];
}

type RequestBody = SearchBody | ImportBody;

function currencyFor(country: string): string {
  const c = country.toUpperCase();
  if (c === 'GB' || c === 'UK') return 'GBP';
  if (c === 'US') return 'USD';
  if (c === 'CA') return 'CAD';
  if (c === 'AU') return 'AUD';
  if (c === 'IE') return 'EUR';
  return '';
}

export async function POST(request: NextRequest) {
  const auth = await authOr401();
  if (auth instanceof NextResponse) return auth;

  const body = (await request.json().catch(() => null)) as RequestBody | null;
  if (!body || !body.mode) {
    return NextResponse.json({ error: 'mode required (search | import)' }, { status: 400 });
  }

  if (body.mode === 'search') return handleSearch(body);
  if (body.mode === 'import') return handleImport(body);
  return NextResponse.json({ error: `Unknown mode` }, { status: 400 });
}

// ─── MODE A: live search via Meta Ads Library ───────────

async function handleSearch(body: SearchBody) {
  const { keyword, country = 'GB', limit = 50 } = body;
  if (!keyword) return NextResponse.json({ error: 'keyword required' }, { status: 400 });
  if (!(process.env.META_AD_LIBRARY_TOKEN || process.env.META_ACCESS_TOKEN || process.env.META_ADS_TOKEN)) {
    return NextResponse.json({
      error: 'META_AD_LIBRARY_TOKEN not set. Either configure the token in Vercel env vars, or use mode=import to push pre-fetched ads.',
    }, { status: 400 });
  }

  const rows = await searchAdsByKeyword(keyword, country, limit);
  const expected = currencyFor(country);
  return await ingestRows(rows.map(r => normalise(r)), { country, search_term: keyword, expected_currency: expected });
}

function normalise(r: AdRow) {
  return {
    page_id: r.page_id,
    page_name: r.page_name,
    ad_snapshot_url: r.ad_snapshot_url,
    currency: r.currency,
    ad_copy: (r.ad_creative_bodies || [])[0] || (r.ad_creative_link_titles || [])[0] || '',
    ad_titles: r.ad_creative_link_titles || [],
    ad_bodies: r.ad_creative_bodies || [],
  };
}

// ─── MODE B: manual import (from MCP / Apify / CSV) ─────

async function handleImport(body: ImportBody) {
  if (!Array.isArray(body.ads) || body.ads.length === 0) {
    return NextResponse.json({ error: 'ads array required and non-empty' }, { status: 400 });
  }
  return await ingestRows(body.ads, {
    country: body.country || 'GB',
    search_term: body.search_term,
    expected_currency: currencyFor(body.country || 'GB'),
  });
}

// ─── Shared ingest + classify + dedupe ──────────────────

interface IngestCtx {
  country: string;
  search_term: string;
  expected_currency: string;
}

async function ingestRows(ads: ImportRow[], ctx: IngestCtx) {
  // Dedupe by page_id within this batch
  const byPage = new Map<string, ImportRow>();
  for (const r of ads) if (r.page_id && !byPage.has(r.page_id)) byPage.set(r.page_id, r);

  const rows: Array<{
    fb_page_id: string;
    page_name: string | null;
    country: string;
    search_term: string;
    ad_snapshot_url: string | null;
    ad_copy: string | null;
    currency: string | null;
    status: 'pending' | 'competitor';
    currency_mismatch: boolean;
  }> = [];

  const stats = { total: byPage.size, clinic: 0, agency: 0, junk: 0, ambiguous: 0, currency_flagged: 0 };

  for (const [pageId, r] of byPage) {
    const { classification, currency_mismatch } = classifySeedResult({
      page_name: r.page_name,
      ad_titles: r.ad_titles || [r.ad_copy || ''].filter(Boolean),
      ad_bodies: r.ad_bodies || [r.ad_copy || ''].filter(Boolean),
      currency: r.currency,
      expected_currency: ctx.expected_currency,
    });
    stats[classification]++;
    if (currency_mismatch) stats.currency_flagged++;

    if (classification === 'junk') continue;

    rows.push({
      fb_page_id: pageId,
      page_name: r.page_name || null,
      country: ctx.country,
      search_term: ctx.search_term,
      ad_snapshot_url: r.ad_snapshot_url || null,
      ad_copy: r.ad_copy || null,
      currency: r.currency || null,
      status: classification === 'agency' ? 'competitor' : 'pending',
      currency_mismatch,
    });
  }

  if (rows.length === 0) {
    return NextResponse.json({ success: true, ingested: 0, stats, message: 'All results filtered as junk.' });
  }

  // Skip pages already in the queue for this search term
  const pageIds = rows.map(r => r.fb_page_id);
  const { data: existing } = await supabaseAdmin
    .from('hunt_ad_library_queue')
    .select('fb_page_id')
    .in('fb_page_id', pageIds)
    .eq('search_term', ctx.search_term);
  const skipSet = new Set((existing || []).map(x => (x as { fb_page_id: string }).fb_page_id));
  const fresh = rows.filter(r => !skipSet.has(r.fb_page_id));

  if (fresh.length > 0) {
    // hunt_ad_library_queue UNIQUE is (fb_page_id, search_term, found_at) — different
    // found_at each row means every insert lands. We rely on the skipSet above.
    const { error } = await supabaseAdmin.from('hunt_ad_library_queue').insert(fresh);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    ingested: fresh.length,
    skipped_duplicates: rows.length - fresh.length,
    filtered_junk: stats.junk,
    stats,
  });
}
