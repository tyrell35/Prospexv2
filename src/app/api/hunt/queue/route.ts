import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { authOr401 } from '@/lib/api-auth';

// ═══════════════════════════════════════════════════════
// /api/hunt/queue
// Reviewer workflow for hunt_ad_library_queue rows.
//
// GET  ?status=pending&limit=100  — list rows for review
// POST { action: 'approve' | 'reject' | 'mark_competitor', queue_ids: [...] }
// POST { action: 'promote_to_leads', queue_ids: [...] }
//        → Creates leads with seed_source='ad_library' from approved rows and
//          links queue_row.lead_id to the new lead.
// ═══════════════════════════════════════════════════════

interface QueueRow {
  id: number;
  fb_page_id: string;
  page_name: string | null;
  country: string | null;
  search_term: string | null;
  ad_snapshot_url: string | null;
  ad_copy: string | null;
  currency: string | null;
  status: string;
  found_at: string;
  lead_id: string | null;
}

export async function GET(request: NextRequest) {
  const auth = await authOr401();
  if (auth instanceof NextResponse) return auth;

  const url = new URL(request.url);
  const status = url.searchParams.get('status') || 'pending';
  const limit = Math.min(500, parseInt(url.searchParams.get('limit') || '100', 10));

  const { data, error } = await supabaseAdmin
    .from('hunt_ad_library_queue')
    .select('*')
    .eq('status', status)
    .order('found_at', { ascending: false })
    .limit(limit);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, rows: data || [] });
}

interface ActionBody {
  action: 'approve' | 'reject' | 'mark_competitor' | 'promote_to_leads';
  queue_ids: number[];
}

export async function POST(request: NextRequest) {
  const auth = await authOr401();
  if (auth instanceof NextResponse) return auth;

  const body = (await request.json().catch(() => ({}))) as ActionBody;
  const { action, queue_ids } = body;
  if (!action) return NextResponse.json({ error: 'action required' }, { status: 400 });
  if (!Array.isArray(queue_ids) || queue_ids.length === 0) {
    return NextResponse.json({ error: 'queue_ids array required' }, { status: 400 });
  }

  const now = new Date().toISOString();
  const reviewer = auth.email || auth.id;

  if (action === 'approve' || action === 'reject' || action === 'mark_competitor') {
    const statusMap = { approve: 'approved', reject: 'rejected', mark_competitor: 'competitor' } as const;
    const { error } = await supabaseAdmin
      .from('hunt_ad_library_queue')
      .update({ status: statusMap[action], reviewed_by: reviewer, reviewed_at: now })
      .in('id', queue_ids);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, updated: queue_ids.length, new_status: statusMap[action] });
  }

  if (action === 'promote_to_leads') {
    // Pull approved rows only
    const { data: rowsData } = await supabaseAdmin
      .from('hunt_ad_library_queue')
      .select('*')
      .in('id', queue_ids)
      .eq('status', 'approved');
    const rows = (rowsData || []) as QueueRow[];

    if (rows.length === 0) {
      return NextResponse.json({ success: true, promoted: 0, message: 'No approved rows in the selection.' });
    }

    // Insert leads
    let promoted = 0;
    for (const row of rows) {
      // Skip if this queue row already promoted
      if (row.lead_id) continue;

      const { data: lead, error: leadErr } = await supabaseAdmin
        .from('leads')
        .insert({
          business_name: row.page_name || `Unnamed page ${row.fb_page_id}`,
          country: row.country,
          seed_source: 'ad_library',
          source: 'ad_library',
          competitor_watch: false,
        })
        .select('id')
        .single();
      if (leadErr) continue;

      const leadId = (lead as { id: string }).id;
      await supabaseAdmin.from('hunt_ad_library_queue').update({ lead_id: leadId }).eq('id', row.id);

      // Pre-populate hunt_enrichment.fb_page_id so /api/hunt/ad-check can qualify it
      await supabaseAdmin.from('hunt_enrichment').upsert({
        lead_id: leadId,
        fb_page_id: row.fb_page_id,
        updated_at: now,
      }, { onConflict: 'lead_id' });

      promoted++;
    }
    return NextResponse.json({ success: true, promoted, of_selection: rows.length });
  }

  return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
}
