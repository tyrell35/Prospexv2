import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

function getSupabase() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return null;
  return supabaseAdmin;
}

// ─── TYPES ──────────────────────────────────────────────────

export interface OutreachLog {
  id?: string;
  created_at?: string;
  lead_name: string;
  lead_business: string;
  niche: string;
  channel: 'whatsapp' | 'instagram' | 'email' | 'linkedin' | 'other';
  stage: 'cold_open' | 'follow_up_1' | 'follow_up_2' | 'follow_up_3' | 'objection' | 'booking' | 'reactivation';
  outcome: 'sent' | 'replied' | 'positive_reply' | 'objection' | 'booked' | 'showed' | 'closed' | 'lost' | 'ghosted' | 'not_interested';
  revenue?: number;
  notes?: string;
  template_used?: string;
}

// ─── GET: Fetch metrics & logs ──────────────────────────────

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action') || 'metrics';
  const period = searchParams.get('period') || '30d';
  const supabase = getSupabase();

  // Calculate date range
  const now = new Date();
  const periodDays: Record<string, number> = { '7d': 7, '14d': 14, '30d': 30, '90d': 90, 'all': 9999 };
  const days = periodDays[period] || 30;
  const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();

  // If no Supabase, use localStorage fallback (handled client-side)
  if (!supabase) {
    return NextResponse.json({ fallback: true, message: 'No Supabase configured. Using local storage.' });
  }

  try {
    if (action === 'logs') {
      const { data, error } = await supabase
        .from('outreach_logs')
        .select('*')
        .gte('created_at', startDate)
        .order('created_at', { ascending: false })
        .limit(500);

      if (error) throw error;
      return NextResponse.json({ logs: data || [] });
    }

    // Metrics aggregation
    const { data: logs, error } = await supabase
      .from('outreach_logs')
      .select('*')
      .gte('created_at', startDate)
      .order('created_at', { ascending: false });

    if (error) throw error;
    const allLogs = logs || [];

    // Calculate metrics
    const metrics = calculateMetrics(allLogs);

    return NextResponse.json({ metrics, logs: allLogs });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to fetch metrics';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ─── POST: Log an outreach activity ─────────────────────────

export async function POST(request: NextRequest) {
  const supabase = getSupabase();
  const body: OutreachLog = await request.json();

  if (!body.lead_name || !body.channel || !body.stage || !body.outcome) {
    return NextResponse.json({ error: 'Missing required fields: lead_name, channel, stage, outcome' }, { status: 400 });
  }

  if (!supabase) {
    // Return success so client-side localStorage can handle it
    return NextResponse.json({ fallback: true, log: { ...body, id: crypto.randomUUID(), created_at: new Date().toISOString() } });
  }

  try {
    const { data, error } = await supabase
      .from('outreach_logs')
      .insert([{
        lead_name: body.lead_name,
        lead_business: body.lead_business || '',
        niche: body.niche || 'other',
        channel: body.channel,
        stage: body.stage,
        outcome: body.outcome,
        revenue: body.revenue || 0,
        notes: body.notes || '',
        template_used: body.template_used || '',
      }])
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ log: data });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to log activity';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ─── PATCH: Update outcome (e.g. sent → replied → booked) ──

export async function PATCH(request: NextRequest) {
  const supabase = getSupabase();
  const { id, outcome, revenue, notes } = await request.json();

  if (!id || !outcome) {
    return NextResponse.json({ error: 'Missing id and outcome' }, { status: 400 });
  }

  if (!supabase) {
    return NextResponse.json({ fallback: true, id, outcome });
  }

  try {
    const updateData: Record<string, unknown> = { outcome };
    if (revenue !== undefined) updateData.revenue = revenue;
    if (notes) updateData.notes = notes;

    const { data, error } = await supabase
      .from('outreach_logs')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ log: data });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to update';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ─── METRICS CALCULATOR ─────────────────────────────────────

function calculateMetrics(logs: OutreachLog[]) {
  const total = logs.length;
  const sent = logs.filter(l => l.outcome !== 'lost').length;
  const replied = logs.filter(l => ['replied', 'positive_reply', 'objection', 'booked', 'showed', 'closed'].includes(l.outcome)).length;
  const positiveReplies = logs.filter(l => ['positive_reply', 'booked', 'showed', 'closed'].includes(l.outcome)).length;
  const booked = logs.filter(l => ['booked', 'showed', 'closed'].includes(l.outcome)).length;
  const showed = logs.filter(l => ['showed', 'closed'].includes(l.outcome)).length;
  const closed = logs.filter(l => l.outcome === 'closed').length;
  const lost = logs.filter(l => l.outcome === 'lost').length;
  const ghosted = logs.filter(l => l.outcome === 'ghosted').length;
  const notInterested = logs.filter(l => l.outcome === 'not_interested').length;

  const totalRevenue = logs.reduce((sum, l) => sum + (l.revenue || 0), 0);

  // Rates
  const replyRate = sent > 0 ? (replied / sent) * 100 : 0;
  const positiveReplyRate = sent > 0 ? (positiveReplies / sent) * 100 : 0;
  const bookingRate = sent > 0 ? (booked / sent) * 100 : 0;
  const showRate = booked > 0 ? (showed / booked) * 100 : 0;
  const closeRate = showed > 0 ? (closed / showed) * 100 : 0;
  const overallConversion = sent > 0 ? (closed / sent) * 100 : 0;

  // By channel
  const byChannel: Record<string, { sent: number; replied: number; booked: number; closed: number }> = {};
  for (const log of logs) {
    if (!byChannel[log.channel]) byChannel[log.channel] = { sent: 0, replied: 0, booked: 0, closed: 0 };
    byChannel[log.channel].sent++;
    if (['replied', 'positive_reply', 'objection', 'booked', 'showed', 'closed'].includes(log.outcome)) byChannel[log.channel].replied++;
    if (['booked', 'showed', 'closed'].includes(log.outcome)) byChannel[log.channel].booked++;
    if (log.outcome === 'closed') byChannel[log.channel].closed++;
  }

  // By niche
  const byNiche: Record<string, { sent: number; replied: number; booked: number; closed: number }> = {};
  for (const log of logs) {
    const n = log.niche || 'other';
    if (!byNiche[n]) byNiche[n] = { sent: 0, replied: 0, booked: 0, closed: 0 };
    byNiche[n].sent++;
    if (['replied', 'positive_reply', 'objection', 'booked', 'showed', 'closed'].includes(log.outcome)) byNiche[n].replied++;
    if (['booked', 'showed', 'closed'].includes(log.outcome)) byNiche[n].booked++;
    if (log.outcome === 'closed') byNiche[n].closed++;
  }

  // By stage
  const byStage: Record<string, { sent: number; replied: number; booked: number }> = {};
  for (const log of logs) {
    if (!byStage[log.stage]) byStage[log.stage] = { sent: 0, replied: 0, booked: 0 };
    byStage[log.stage].sent++;
    if (['replied', 'positive_reply', 'objection', 'booked', 'showed', 'closed'].includes(log.outcome)) byStage[log.stage].replied++;
    if (['booked', 'showed', 'closed'].includes(log.outcome)) byStage[log.stage].booked++;
  }

  // Daily trend (last 30 days)
  const dailyTrend: Record<string, { sent: number; replied: number; booked: number; closed: number }> = {};
  for (let i = 29; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    const key = d.toISOString().split('T')[0];
    dailyTrend[key] = { sent: 0, replied: 0, booked: 0, closed: 0 };
  }
  for (const log of logs) {
    const day = (log.created_at || '').split('T')[0];
    if (dailyTrend[day]) {
      dailyTrend[day].sent++;
      if (['replied', 'positive_reply', 'objection', 'booked', 'showed', 'closed'].includes(log.outcome)) dailyTrend[day].replied++;
      if (['booked', 'showed', 'closed'].includes(log.outcome)) dailyTrend[day].booked++;
      if (log.outcome === 'closed') dailyTrend[day].closed++;
    }
  }

  // Template performance
  const byTemplate: Record<string, { sent: number; replied: number; booked: number }> = {};
  for (const log of logs) {
    const t = log.template_used || 'Custom';
    if (!byTemplate[t]) byTemplate[t] = { sent: 0, replied: 0, booked: 0 };
    byTemplate[t].sent++;
    if (['replied', 'positive_reply', 'objection', 'booked', 'showed', 'closed'].includes(log.outcome)) byTemplate[t].replied++;
    if (['booked', 'showed', 'closed'].includes(log.outcome)) byTemplate[t].booked++;
  }

  return {
    totals: { total, sent, replied, positiveReplies, booked, showed, closed, lost, ghosted, notInterested, totalRevenue },
    rates: { replyRate, positiveReplyRate, bookingRate, showRate, closeRate, overallConversion },
    byChannel,
    byNiche,
    byStage,
    byTemplate,
    dailyTrend: Object.entries(dailyTrend).map(([date, data]) => ({ date, ...data })),
  };
}
