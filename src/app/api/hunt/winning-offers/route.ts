import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { authOr401 } from '@/lib/api-auth';
import { backfillSignatures, computeWinningOffers } from '@/lib/winning-offers';

// ═══════════════════════════════════════════════════════
// /api/hunt/winning-offers
// Compute-then-list endpoint for the Winning Offer Detector (Section 11.2).
//
// POST { action: 'recompute' } → runs backfillSignatures + computeWinningOffers
// GET  ?country=GB&treatment=Morpheus8&limit=25 → lists ranked winners
// ═══════════════════════════════════════════════════════

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  // Allow cron: same GET pattern as other hunt routes
  const cron = url.searchParams.get('cron');
  if (cron === 'recompute') {
    const expected = process.env.CRON_SECRET;
    if (expected) {
      const authHeader = request.headers.get('authorization') || '';
      if (authHeader !== `Bearer ${expected}`) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
    const back = await backfillSignatures(1000);
    const comp = await computeWinningOffers();
    return NextResponse.json({ success: true, ...back, ...comp });
  }

  const auth = await authOr401();
  if (auth instanceof NextResponse) return auth;

  const country = url.searchParams.get('country');
  const treatment = url.searchParams.get('treatment');
  const limit = Math.min(200, parseInt(url.searchParams.get('limit') || '50', 10));

  let q = supabaseAdmin
    .from('winning_offers')
    .select('*')
    .order('wos', { ascending: false })
    .limit(limit);
  if (country) q = q.eq('country', country);
  if (treatment) q = q.eq('treatment', treatment);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, offers: data || [] });
}

export async function POST(request: NextRequest) {
  const auth = await authOr401();
  if (auth instanceof NextResponse) return auth;

  const body = await request.json().catch(() => ({}));
  if (body.action === 'recompute') {
    const back = await backfillSignatures(1000);
    const comp = await computeWinningOffers();
    return NextResponse.json({ success: true, ...back, ...comp });
  }
  return NextResponse.json({ error: 'action required (recompute)' }, { status: 400 });
}
