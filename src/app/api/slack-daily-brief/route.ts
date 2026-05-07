import { NextResponse } from 'next/server';

import { supabaseAdmin as supabase } from "@/lib/supabase-admin";

export async function GET() {
  try {
    const { data: settings } = await supabase
      .from('settings')
      .select('slack_webhook_url')
      .limit(1)
      .maybeSingle();

    if (!settings?.slack_webhook_url) {
      return NextResponse.json({ error: 'Slack webhook not configured' }, { status: 400 });
    }

    // Get today's qualified leads that haven't been posted yet (null or false)
    const today = new Date().toISOString().split('T')[0];
    const { data: todayLeads } = await supabase
      .from('leads')
      .select('*')
      .gte('created_at', `${today}T00:00:00`)
      .gte('qualification_score', 40)
      .or('slack_posted.is.null,slack_posted.eq.false')
      .order('qualification_score', { ascending: false });

    // Get today's total leads (any score, from area scans)
    const { count: todayTotalCount } = await supabase
      .from('leads')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', `${today}T00:00:00`)
      .not('area_source', 'is', null);

    // Get this week's scan stats
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: weekScans } = await supabase
      .from('scan_schedule')
      .select('leads_found, qualified_leads')
      .gte('created_at', weekAgo);

    const weekQualified = (weekScans || []).reduce((sum, s) => sum + (s.qualified_leads || 0), 0);
    const weekFound = (weekScans || []).reduce((sum, s) => sum + (s.leads_found || 0), 0);

    // Build message
    const leads = todayLeads || [];
    const totalToday = todayTotalCount || 0;
    const dateStr = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

    const blocks: Record<string, unknown>[] = [
      {
        type: 'header',
        text: { type: 'plain_text', text: `🔍 DAILY PROSPECT BRIEF — ${dateStr}`, emoji: true },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*${leads.length} qualified prospects* from ${totalToday} total found today\n📊 Weekly: *${weekQualified} qualified* from ${weekFound} found | Target: 30/week`,
        },
      },
      { type: 'divider' },
    ];

    if (leads.length === 0) {
      blocks.push({
        type: 'section',
        text: { type: 'mrkdwn', text: 'No new qualified prospects today. Scans will continue tomorrow at 6am.' },
      });
    } else {
      for (const lead of leads.slice(0, 10)) {
        const rating = lead.google_rating ? `${lead.google_rating}★` : 'N/A';
        const reviews = lead.google_review_count || 0;
        blocks.push({
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `🏥 *${lead.business_name}*\n📍 ${lead.city || 'N/A'}, ${lead.country || 'N/A'} | ⭐ ${rating} (${reviews} reviews) | 📊 Score: ${lead.qualification_score || 'N/A'}/100\n🌐 ${lead.website ? `<${lead.website}|Website>` : 'No website'} | 📧 ${lead.email || 'No email'} | 💰 Area: ${lead.area_source || 'N/A'}`,
          },
        });
      }
      if (leads.length > 10) {
        blocks.push({
          type: 'context',
          elements: [{ type: 'mrkdwn', text: `_+ ${leads.length - 10} more prospects in the Lead Database_` }],
        });
      }
    }

    blocks.push({ type: 'divider' });
    blocks.push({
      type: 'context',
      elements: [{ type: 'mrkdwn', text: `Prospex Daily Brief • Auto-generated at ${new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}` }],
    });

    const slackRes = await fetch(settings.slack_webhook_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ blocks }),
    });

    // Mark leads as posted so they don't get re-sent on subsequent runs
    if (slackRes.ok && leads.length > 0) {
      const leadIds = leads.map(l => l.id);
      await supabase
        .from('leads')
        .update({ slack_posted: true })
        .in('id', leadIds);
    }

    return NextResponse.json({ success: true, leads_posted: leads.length });
  } catch (err) {
    console.error('Daily brief error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
