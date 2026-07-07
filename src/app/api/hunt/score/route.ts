import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { authOr401 } from '@/lib/api-auth';
import { scoreLeads } from '@/lib/hunt-scoring';

// ═══════════════════════════════════════════════════════
// /api/hunt/score
// Batch scoring: rebuilds hunt_scores for the requested leads (or every lead
// with a hunt_enrichment row). Returns per-lead sub-scores and band.
// ═══════════════════════════════════════════════════════

interface ScoreRequest {
  lead_ids?: string[];
  all?: boolean;
  limit?: number;
}

export async function POST(request: NextRequest) {
  const auth = await authOr401();
  if (auth instanceof NextResponse) return auth;

  const body = (await request.json().catch(() => ({}))) as ScoreRequest;
  const limit = Math.min(500, body.limit || 100);

  let ids: string[] = [];
  if (Array.isArray(body.lead_ids) && body.lead_ids.length > 0) {
    ids = body.lead_ids.slice(0, limit);
  } else if (body.all) {
    const { data } = await supabaseAdmin
      .from('hunt_enrichment')
      .select('lead_id')
      .order('updated_at', { ascending: false })
      .limit(limit);
    ids = (data || []).map(r => (r as { lead_id: string }).lead_id);
  } else {
    return NextResponse.json({ error: 'Pass lead_ids[] or all:true' }, { status: 400 });
  }

  if (ids.length === 0) {
    return NextResponse.json({ success: true, scored: 0, message: 'No leads matched.' });
  }

  const results = await scoreLeads(ids);
  const summary = results.reduce((acc, r) => {
    acc[r.band] = (acc[r.band] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return NextResponse.json({
    success: true,
    scored: results.length,
    bands: summary,
    results,
  });
}
