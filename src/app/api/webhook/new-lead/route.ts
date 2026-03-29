import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Make.com webhook — fires when a new qualified lead is found
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { lead_id } = body;

    if (!lead_id) {
      return NextResponse.json({ error: 'lead_id required' }, { status: 400 });
    }

    const { data: lead } = await supabase.from('leads').select('*').eq('id', lead_id).single();
    if (!lead) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    }

    // Return the full lead payload for Make.com to consume
    return NextResponse.json({
      event: 'new_lead',
      timestamp: new Date().toISOString(),
      lead: {
        id: lead.id,
        business_name: lead.business_name,
        city: lead.city,
        country: lead.country,
        phone: lead.phone,
        email: lead.email,
        website: lead.website,
        instagram_url: lead.instagram_url,
        google_rating: lead.google_rating,
        google_review_count: lead.google_review_count,
        lead_score: lead.lead_score,
        qualification_score: lead.qualification_score,
        audit_score: lead.audit_score,
        area_source: lead.area_source,
        pipeline_stage: lead.pipeline_stage,
      },
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
