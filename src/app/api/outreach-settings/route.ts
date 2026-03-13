import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function GET() {
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
