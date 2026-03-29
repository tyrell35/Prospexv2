import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Make.com webhook — fires when a playbook is generated
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { lead_id, playbook_id } = body;

    if (!lead_id) {
      return NextResponse.json({ error: 'lead_id required' }, { status: 400 });
    }

    const { data: lead } = await supabase.from('leads').select('*').eq('id', lead_id).single();
    if (!lead) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    }

    let playbook: Record<string, unknown> | null = null;
    if (playbook_id) {
      const { data } = await supabase.from('playbooks').select('*').eq('id', playbook_id).single();
      playbook = data as Record<string, unknown> | null;
    } else {
      const { data } = await supabase
        .from('playbooks')
        .select('*')
        .eq('lead_id', lead_id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      playbook = data as Record<string, unknown> | null;
    }

    return NextResponse.json({
      event: 'playbook_ready',
      timestamp: new Date().toISOString(),
      lead: {
        id: lead.id,
        business_name: lead.business_name,
        city: lead.city,
        country: lead.country,
        phone: lead.phone,
        email: lead.email,
        website: lead.website,
        google_rating: lead.google_rating,
        google_review_count: lead.google_review_count,
        area_source: lead.area_source,
      },
      playbook: playbook ? {
        id: playbook.id,
        growth_score: playbook.growth_score,
        revenue_leak: playbook.revenue_leak,
        recommended_tier: playbook.recommended_tier,
        email_subject: playbook.email_subject,
        email_body: playbook.email_body,
        dm_text: playbook.dm_text,
        short_dm_text: playbook.short_dm_text,
        content_preview: String(playbook.content || '').substring(0, 1000),
      } : null,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
