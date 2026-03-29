import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { lead_id, playbook_id } = body;

    // Get Slack webhook URL from settings
    const { data: settings } = await supabase
      .from('settings')
      .select('slack_webhook_url, slack_channel_name')
      .limit(1)
      .maybeSingle();

    if (!settings?.slack_webhook_url) {
      return NextResponse.json({ error: 'Slack webhook URL not configured' }, { status: 400 });
    }

    // Get lead data
    const { data: lead } = await supabase.from('leads').select('*').eq('id', lead_id).single();
    if (!lead) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    }

    // Get playbook if provided
    let playbook: Record<string, unknown> | null = null;
    if (playbook_id) {
      const { data } = await supabase.from('playbooks').select('*').eq('id', playbook_id).single();
      playbook = data as Record<string, unknown> | null;
    }

    // Build Slack Block Kit message
    const rating = lead.google_rating ? `${lead.google_rating}★` : 'N/A';
    const reviews = lead.google_review_count || 0;
    const qualScore = lead.qualification_score || lead.lead_score || 0;
    const auditData = lead.audit_data as Record<string, unknown> | null;
    const hasAds = lead.ad_detection_data ? 'Yes' : 'No';

    const blocks: Record<string, unknown>[] = [
      {
        type: 'header',
        text: { type: 'plain_text', text: `🏥 ${lead.business_name}`, emoji: true },
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `📍 *Location:* ${lead.city || 'N/A'}, ${lead.country || 'N/A'}` },
          { type: 'mrkdwn', text: `⭐ *Reviews:* ${rating} — ${reviews} Google reviews` },
          { type: 'mrkdwn', text: `🌐 *Website:* ${lead.website ? `<${lead.website}|Visit>` : 'None'}` },
          { type: 'mrkdwn', text: `📱 *Instagram:* ${lead.instagram_url || lead.instagram_handle || 'N/A'}` },
          { type: 'mrkdwn', text: `📞 *Phone:* ${lead.phone || 'N/A'}` },
          { type: 'mrkdwn', text: `📧 *Email:* ${lead.email || 'N/A'}` },
        ],
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `💰 *Area:* ${lead.area_source || 'Manual'} ${lead.area_source ? `(Tier ${qualScore >= 60 ? '1' : qualScore >= 40 ? '2' : '3'})` : ''}` },
          { type: 'mrkdwn', text: `📊 *Lead Score:* ${lead.lead_score || 'N/A'}/100 | *Qualification:* ${qualScore}/100` },
          { type: 'mrkdwn', text: `🔴 *Running Ads:* ${hasAds}` },
          { type: 'mrkdwn', text: `🔧 *Audit Score:* ${auditData?.overall_score || 'N/A'}/100` },
        ],
      },
    ];

    // Add playbook info if available
    if (playbook) {
      blocks.push({ type: 'divider' });
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `📄 *Growth Playbook Generated*\n💸 Est. revenue leak: ${playbook.revenue_leak || 'N/A'}/month\n📈 Growth Score: ${playbook.growth_score || 'N/A'}/100\n🎯 Recommended: ${playbook.recommended_tier || 'N/A'} tier`,
        },
      });
      if (playbook.email_subject) {
        blocks.push({
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Outreach Copy:*\n_Email subject:_ ${playbook.email_subject}\n_DM:_ ${String(playbook.short_dm_text || playbook.dm_text || '').substring(0, 200)}`,
          },
        });
      }
    }

    blocks.push({
      type: 'context',
      elements: [
        { type: 'mrkdwn', text: `Prospex • ${new Date().toLocaleDateString('en-GB')} • ${lead.source || 'scan'}` },
      ],
    });

    // Post to Slack
    const slackRes = await fetch(settings.slack_webhook_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ blocks }),
    });

    if (!slackRes.ok) {
      const errText = await slackRes.text();
      return NextResponse.json({ error: 'Slack post failed', details: errText }, { status: 500 });
    }

    // Mark lead as posted
    await supabase.from('leads').update({ slack_posted: true }).eq('id', lead_id);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Slack post error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
