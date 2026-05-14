import { NextRequest, NextResponse } from 'next/server';

import { supabaseAdmin as supabase } from "@/lib/supabase-admin";
import { authOr401 } from "@/lib/api-auth";

export async function GET() {
  const _auth = await authOr401(); if (_auth instanceof Response) return _auth;
  try {
    const { data, error } = await supabase
      .from('outreach_settings')
      .select('*')
      .limit(1)
      .single();

    if (error || !data) {
      // Create default settings if none exist
      const { data: created } = await supabase
        .from('outreach_settings')
        .insert({})
        .select()
        .single();
      return NextResponse.json({ settings: created });
    }

    return NextResponse.json({ settings: data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const _auth = await authOr401(); if (_auth instanceof Response) return _auth;
  try {
    const body = await req.json();

    const { data: existing } = await supabase
      .from('outreach_settings')
      .select('id')
      .limit(1)
      .single();

    if (!existing) return NextResponse.json({ error: 'Settings not found' }, { status: 404 });

    const { data, error } = await supabase
      .from('outreach_settings')
      .update({ ...body, updated_at: new Date().toISOString() })
      .eq('id', existing.id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ settings: data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
