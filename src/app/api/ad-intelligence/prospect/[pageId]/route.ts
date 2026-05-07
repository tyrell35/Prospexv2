import { NextRequest, NextResponse } from 'next/server';

import { supabaseAdmin as supabase } from "@/lib/supabase-admin";

export async function GET(
  req: NextRequest,
  { params }: { params: { pageId: string } }
) {
  try {
    const pageId = params.pageId;
    if (!pageId) {
      return NextResponse.json({ error: 'pageId is required' }, { status: 400 });
    }

    // Fetch prospect by page_id or UUID
    let query = supabase.from('ad_prospects').select('*');
    
    // Check if it's a UUID or a Meta page_id
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(pageId);
    if (isUUID) {
      query = query.eq('id', pageId);
    } else {
      query = query.eq('page_id', pageId);
    }

    const { data: prospect, error: pErr } = await query.single();

    if (pErr || !prospect) {
      return NextResponse.json({ error: 'Prospect not found' }, { status: 404 });
    }

    // Fetch all ad creatives for this prospect
    const { data: creatives, error: cErr } = await supabase
      .from('ad_creatives')
      .select('*')
      .eq('prospect_id', prospect.id)
      .order('days_running', { ascending: false });

    // Fetch swipe file entries for these creatives
    const creativeIds = (creatives || []).map(c => c.id);
    let swipeEntries: any[] = [];
    if (creativeIds.length > 0) {
      const { data: swipes } = await supabase
        .from('ad_swipe_file')
        .select('*')
        .in('creative_id', creativeIds);
      swipeEntries = swipes || [];
    }

    // Check if prospect is linked to a lead
    let linkedLead: any = null;
    if (prospect.lead_id) {
      const { data: lead } = await supabase
        .from('leads')
        .select('id, business_name, status, pipeline_stage, email, phone')
        .eq('id', prospect.lead_id)
        .single();
      linkedLead = lead;
    }

    return NextResponse.json({
      prospect,
      creatives: creatives || [],
      swipe_entries: swipeEntries,
      linked_lead: linkedLead,
      stats: {
        total_ads: creatives?.length || 0,
        active_ads: creatives?.filter(c => c.is_active).length || 0,
        avg_quality_score: creatives?.length
          ? Math.round(creatives.reduce((sum, c) => sum + (c.ai_quality_score || 0), 0) / creatives.length)
          : 0,
        best_ad_days: creatives?.[0]?.days_running || 0,
        platforms_used: [...new Set((creatives || []).flatMap(c => c.platforms || []))],
        format_breakdown: (creatives || []).reduce((acc: Record<string, number>, c) => {
          const fmt = c.media_type || 'IMAGE';
          acc[fmt] = (acc[fmt] || 0) + 1;
          return acc;
        }, {}),
      },
    });

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
