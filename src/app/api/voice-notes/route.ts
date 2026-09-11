import { NextRequest, NextResponse } from 'next/server';

import { supabaseAdmin as supabase } from '@/lib/supabase-admin';
import { authOr401 } from '@/lib/api-auth';

// ═══════════════════════════════════════════════════════════════
// VOICE NOTE LIBRARY
//
// Files are uploaded straight to Supabase Storage from the browser;
// this route owns the metadata, the pairing to scripts, and the
// per-note performance so one recording can be judged against
// another on reply rate rather than on how it felt.
// ═══════════════════════════════════════════════════════════════

export async function POST(request: NextRequest) {
  const auth = await authOr401();
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await request.json();

    switch (body.action) {
      case 'list': {
        const { data, error } = await supabase
          .from('voice_notes')
          .select('*')
          .order('is_active', { ascending: false })
          .order('created_at', { ascending: false });
        if (error) throw new Error(error.message);

        // Reply rate is the only honest way to rank these.
        const notes = (data || []).map((n: Record<string, unknown>) => ({
          ...n,
          reply_rate: (n.times_sent as number) > 0
            ? Math.round(((n.replies as number) / (n.times_sent as number)) * 100)
            : null,
        }));
        return NextResponse.json({ success: true, notes });
      }

      case 'save': {
        const { id, ...fields } = body.note || {};
        if (!fields.name) return NextResponse.json({ error: 'name required' }, { status: 400 });

        const row = {
          name: fields.name,
          purpose: fields.purpose || 'cold_open',
          description: fields.description || null,
          audio_url: fields.audio_url || null,
          video_url: fields.video_url || null,
          audio_path: fields.audio_path || null,
          video_path: fields.video_path || null,
          duration_sec: fields.duration_sec ?? null,
          transcript: fields.transcript || null,
          pairs_with_template: fields.pairs_with_template || null,
          niche: fields.niche || null,
          country_code: fields.country_code || null,
          is_active: fields.is_active ?? true,
          updated_at: new Date().toISOString(),
        };

        if (id) {
          const { error } = await supabase.from('voice_notes').update(row).eq('id', id);
          if (error) throw new Error(error.message);
          return NextResponse.json({ success: true, id });
        }
        const { data, error } = await supabase
          .from('voice_notes')
          .insert({ ...row, created_by: auth.email || null })
          .select('id').single();
        if (error) throw new Error(error.message);
        return NextResponse.json({ success: true, id: (data as { id: string }).id });
      }

      case 'delete': {
        if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 });
        const { data: note } = await supabase
          .from('voice_notes').select('audio_path, video_path').eq('id', body.id).maybeSingle();
        const paths = [
          (note as { audio_path?: string } | null)?.audio_path,
          (note as { video_path?: string } | null)?.video_path,
        ].filter((p): p is string => !!p);
        if (paths.length > 0) await supabase.storage.from('voice-notes').remove(paths);

        const { error } = await supabase.from('voice_notes').delete().eq('id', body.id);
        if (error) throw new Error(error.message);
        return NextResponse.json({ success: true });
      }

      // ─── Record that a note went out with a send ───
      // Called once per lead so reply rate has a real denominator.
      case 'log_sent': {
        const { voice_note_id, lead_ids } = body as { voice_note_id: string; lead_ids: string[] };
        if (!voice_note_id || !Array.isArray(lead_ids) || lead_ids.length === 0) {
          return NextResponse.json({ error: 'voice_note_id and lead_ids required' }, { status: 400 });
        }
        const now = new Date().toISOString();
        for (let i = 0; i < lead_ids.length; i += 200) {
          await supabase.from('leads')
            .update({ voice_note_id, voice_note_sent_at: now })
            .in('id', lead_ids.slice(i, i + 200));
        }

        const { data: cur } = await supabase
          .from('voice_notes').select('times_sent').eq('id', voice_note_id).maybeSingle();
        await supabase.from('voice_notes').update({
          times_sent: ((cur as { times_sent: number } | null)?.times_sent || 0) + lead_ids.length,
          updated_at: now,
        }).eq('id', voice_note_id);

        return NextResponse.json({ success: true, logged: lead_ids.length });
      }

      // ─── Recompute replies from lead state ───
      // Derived rather than incremented, so it stays right even if a
      // disposition is corrected later.
      case 'refresh_stats': {
        const { data: notes } = await supabase.from('voice_notes').select('id');
        for (const n of (notes || []) as Array<{ id: string }>) {
          const { count } = await supabase
            .from('leads').select('id', { count: 'exact', head: true })
            .eq('voice_note_id', n.id).not('responded_at', 'is', null);
          await supabase.from('voice_notes').update({ replies: count || 0 }).eq('id', n.id);
        }
        return NextResponse.json({ success: true, refreshed: (notes || []).length });
      }

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Voice note error';
    console.error('[voice-notes]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
