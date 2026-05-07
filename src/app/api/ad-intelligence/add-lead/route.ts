import { NextRequest, NextResponse } from 'next/server';

import { supabaseAdmin as supabase } from "@/lib/supabase-admin";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { prospect_id } = body;

    if (!prospect_id) {
      return NextResponse.json({ error: 'prospect_id is required' }, { status: 400 });
    }

    // Fetch prospect
    const { data: prospect, error: pErr } = await supabase
      .from('ad_prospects')
      .select('*')
      .eq('id', prospect_id)
      .single();

    if (pErr || !prospect) {
      return NextResponse.json({ error: 'Prospect not found' }, { status: 404 });
    }

    // Check if already linked to a lead
    if (prospect.lead_id) {
      const { data: existingLead } = await supabase
        .from('leads')
        .select('id, business_name, status, pipeline_stage')
        .eq('id', prospect.lead_id)
        .single();

      if (existingLead) {
        return NextResponse.json({
          message: 'Prospect already linked to a lead',
          lead: existingLead,
          already_exists: true,
        });
      }
    }

    // Check if business already exists in leads (by name match)
    const { data: existingByName } = await supabase
      .from('leads')
      .select('id, business_name, status, pipeline_stage')
      .ilike('business_name', prospect.page_name)
      .limit(1)
      .single();

    if (existingByName) {
      // Enrich existing lead with ad intelligence data
      await supabase
        .from('leads')
        .update({
          ad_prospect_id: prospect.id,
          ad_spend_estimate: prospect.estimated_monthly_spend,
          ad_count: prospect.active_ad_count,
          ad_quality_score: prospect.ai_creative_score,
          discovery_source: 'ad_intelligence',
        })
        .eq('id', existingByName.id);

      // Link prospect back to lead
      await supabase
        .from('ad_prospects')
        .update({ lead_id: existingByName.id, status: 'contacted' })
        .eq('id', prospect_id);

      return NextResponse.json({
        message: 'Enriched existing lead with ad intelligence data',
        lead: existingByName,
        enriched: true,
      });
    }

    // Create new lead from prospect
    const { data: newLead, error: lErr } = await supabase
      .from('leads')
      .insert({
        business_name: prospect.page_name,
        website: prospect.website || prospect.page_url,
        status: 'new',
        pipeline_stage: 'lead',
        niche: prospect.niche,
        country: prospect.country === 'GB' ? 'United Kingdom' : prospect.country,
        source: 'ad_intelligence',
        ad_prospect_id: prospect.id,
        ad_spend_estimate: prospect.estimated_monthly_spend,
        ad_count: prospect.active_ad_count,
        ad_quality_score: prospect.ai_creative_score,
        discovery_source: 'ad_intelligence',
        notes: `Discovered via Meta Ad Library. Running ${prospect.active_ad_count} active ads. Est. spend: ${prospect.estimated_monthly_spend}. Prospect score: ${prospect.prospect_score}/100 (${prospect.prospect_tier}).`,
      })
      .select()
      .single();

    if (lErr) {
      return NextResponse.json({ error: 'Failed to create lead: ' + lErr.message }, { status: 500 });
    }

    // Link prospect to lead
    await supabase
      .from('ad_prospects')
      .update({ lead_id: newLead.id, status: 'contacted' })
      .eq('id', prospect_id);

    return NextResponse.json({
      message: 'Lead created from ad intelligence',
      lead: newLead,
      created: true,
    });

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
