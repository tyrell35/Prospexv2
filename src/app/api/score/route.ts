import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { calculateLeadScore } from '@/lib/scoring';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

export async function POST(request: NextRequest) {
  try {
    const { leadIds } = await request.json();
    if (!leadIds || !Array.isArray(leadIds) || leadIds.length === 0) {
      return NextResponse.json({ error: 'leadIds array required' }, { status: 400 });
    }

    const results: { id: string; score: number; grade: string; priority: string }[] = [];

    for (const leadId of leadIds) {
      const { data: lead } = await supabase.from('leads').select('*').eq('id', leadId).single();
      if (!lead) continue;

      const scoreResult = calculateLeadScore(lead);

      await supabase.from('leads').update({
        lead_score: scoreResult.total,
        lead_grade: scoreResult.grade,
        lead_priority: scoreResult.priority,
        updated_at: new Date().toISOString(),
      }).eq('id', leadId);

      await supabase.from('activity_log').insert({
        action_type: 'score',
        description: `Scored ${lead.business_name}: ${scoreResult.total}/100 (${scoreResult.grade}) — ${scoreResult.priority}`,
        lead_id: leadId,
        metadata: { factors: scoreResult.factors, recommendation: scoreResult.recommendation },
      });

      results.push({ id: leadId, score: scoreResult.total, grade: scoreResult.grade, priority: scoreResult.priority });
    }

    return NextResponse.json({ success: true, scored: results.length, results });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Scoring failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
