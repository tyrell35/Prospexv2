import { NextRequest, NextResponse } from 'next/server';

import { supabaseAdmin as supabase } from "@/lib/supabase-admin";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { leadId, pitchId, services, discount, notes, validDays = 14 } = body;

    if (!leadId || !services || !Array.isArray(services) || services.length === 0) {
      return NextResponse.json({ error: 'leadId and at least one service required' }, { status: 400 });
    }

    const { data: lead } = await supabase.from('leads').select('*').eq('id', leadId).single();
    if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });

    const { data: settings } = await supabase.from('settings')
      .select('agency_name, agency_email, agency_phone, agency_website, agency_logo_url, calendar_type, calendar_url')
      .limit(1).maybeSingle();

    // Calculate totals
    const subtotal = services.reduce((sum: number, s: { price: number }) => sum + (s.price || 0), 0);
    const discountAmount = discount ? (subtotal * (discount / 100)) : 0;
    const total = subtotal - discountAmount;
    const validUntil = new Date();
    validUntil.setDate(validUntil.getDate() + validDays);

    const quoteContent = {
      services: services.map((s: { name: string; description: string; price: number; frequency: string }) => ({
        name: s.name,
        description: s.description || '',
        price: s.price,
        frequency: s.frequency || 'monthly', // monthly, one-time, quarterly
      })),
      subtotal,
      discount: discount || 0,
      discount_amount: discountAmount,
      total,
      currency: '£',
      valid_until: validUntil.toISOString(),
      notes: notes || '',
      payment_terms: 'Payment due within 7 days of acceptance. Monthly services billed on the 1st of each month.',
    };

    const { data: quote, error: quoteError } = await supabase.from('quotes').insert({
      lead_id: leadId,
      pitch_id: pitchId || null,
      title: `Quote for ${lead.business_name}`,
      content: quoteContent,
      total_amount: total,
      currency: '£',
      valid_until: validUntil.toISOString(),
      status: 'draft',
      agency_name: settings?.agency_name,
      agency_email: settings?.agency_email,
      agency_phone: settings?.agency_phone,
      agency_website: settings?.agency_website,
      agency_logo_url: settings?.agency_logo_url,
      calendar_url: settings?.calendar_url,
    }).select().single();

    if (quoteError) throw quoteError;

    await supabase.from('activity_log').insert({
      action_type: 'quote',
      description: `Created £${total.toFixed(0)}/mo quote for ${lead.business_name}`,
      lead_id: leadId,
    });

    return NextResponse.json({ success: true, quote });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Quote creation failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const quoteId = searchParams.get('quoteId');
  const leadId = searchParams.get('leadId');

  if (quoteId) {
    const { data } = await supabase.from('quotes').select('*').eq('id', quoteId).single();
    if (data) {
      await supabase.from('quotes').update({ view_count: (data.view_count || 0) + 1, status: data.status === 'draft' ? 'sent' : data.status }).eq('id', quoteId);
    }
    return NextResponse.json(data);
  }

  if (leadId) {
    const { data } = await supabase.from('quotes').select('*').eq('lead_id', leadId).order('created_at', { ascending: false });
    return NextResponse.json(data || []);
  }

  const { data } = await supabase.from('quotes').select('*').order('created_at', { ascending: false }).limit(50);
  return NextResponse.json(data || []);
}
