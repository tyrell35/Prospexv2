import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

function getKey(envKey: string): string {
  return process.env[envKey] || '';
}

export async function POST(request: NextRequest) {
  try {
    const { leadId } = await request.json();
    if (!leadId) {
      return NextResponse.json({ error: 'leadId is required' }, { status: 400 });
    }

    const apiKey = getKey('GHL_API_KEY');
    const locationId = getKey('GHL_LOCATION_ID');

    if (!apiKey) {
      return NextResponse.json({ error: 'GoHighLevel API key not configured. Add it in Settings.' }, { status: 400 });
    }
    if (!locationId) {
      return NextResponse.json({ error: 'GoHighLevel Location ID not configured. Add it in Settings.' }, { status: 400 });
    }

    // Get lead
    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .select('*')
      .eq('id', leadId)
      .single();

    if (leadError || !lead) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    }

    // Build tags
    const tags: string[] = [
      `Source: ${lead.source.replace('_', ' ')}`,
      `Prospex Import`,
    ];
    if (lead.lead_score) tags.push(`Score: ${lead.lead_score}`);
    if (lead.lead_priority) tags.push(`Priority: ${lead.lead_priority.toUpperCase()}`);

    // Create contact in GHL
    const contactPayload: Record<string, any> = {
      locationId,
      name: lead.business_name,
      companyName: lead.business_name,
      tags,
    };

    if (lead.email) contactPayload.email = lead.email;
    if (lead.phone) contactPayload.phone = lead.phone;
    if (lead.website) contactPayload.website = lead.website;
    if (lead.address) contactPayload.address1 = lead.address;

    // Custom fields for audit data
    const customFields: Record<string, string>[] = [];
    if (lead.lead_score) {
      customFields.push({ id: 'lead_score', value: lead.lead_score.toString() });
    }
    if (lead.audit_score) {
      customFields.push({ id: 'audit_score', value: lead.audit_score.toString() });
    }
    if (lead.google_rating) {
      customFields.push({ id: 'google_rating', value: lead.google_rating.toString() });
    }

    if (customFields.length > 0) {
      contactPayload.customFields = customFields;
    }

    const contactResponse = await fetch('https://services.leadconnectorhq.com/contacts/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'Version': '2021-07-28',
      },
      body: JSON.stringify(contactPayload),
    });

    if (!contactResponse.ok) {
      const error = await contactResponse.text();
      throw new Error(`GHL Contact creation failed: ${error}`);
    }

    const contactData = await contactResponse.json();
    const contactId = contactData?.contact?.id;

    if (!contactId) {
      throw new Error('GHL returned no contact ID');
    }

    // Add a note with audit summary
    let noteBody = `📊 Prospex Lead Import\n\n`;
    noteBody += `Business: ${lead.business_name}\n`;
    if (lead.lead_score) noteBody += `Lead Score: ${lead.lead_score}/100 (${lead.lead_grade || ''})\n`;
    if (lead.audit_score) noteBody += `Website Audit Score: ${lead.audit_score}/100\n`;
    if (lead.deep_audit_score) noteBody += `Deep Audit Score: ${lead.deep_audit_score}/100\n`;
    if (lead.google_rating) noteBody += `Google Rating: ${lead.google_rating} (${lead.google_review_count} reviews)\n`;
    noteBody += `Source: ${lead.source.replace('_', ' ')}\n`;
    noteBody += `\nImported from Prospex on ${new Date().toLocaleDateString()}`;

    // Add audit details if available
    if (lead.audit_data) {
      noteBody += `\n\n--- Website Audit Results ---\n`;
      const checks = lead.audit_data as any;
      noteBody += `SSL: ${checks.ssl_check ? '✅' : '❌'}\n`;
      noteBody += `Mobile Score: ${checks.mobile_score || 'N/A'}\n`;
      noteBody += `Speed Score: ${checks.speed_score || 'N/A'}\n`;
      noteBody += `Social Media: ${checks.has_social_media ? '✅' : '❌'}\n`;
      noteBody += `Click-to-Call: ${checks.has_click_to_call ? '✅' : '❌'}\n`;
      noteBody += `Online Booking: ${checks.has_booking ? '✅' : '❌'}\n`;
      noteBody += `Chatbot: ${checks.has_chatbot ? '✅' : '❌'}\n`;
      noteBody += `Analytics: ${checks.has_analytics ? '✅' : '❌'}\n`;
    }

    try {
      await fetch(`https://services.leadconnectorhq.com/contacts/${contactId}/notes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'Version': '2021-07-28',
        },
        body: JSON.stringify({ body: noteBody }),
      });
    } catch (noteErr) {
      console.error('Note creation failed (non-critical):', noteErr);
    }

    // Update lead in Supabase
    await supabase.from('leads').update({
      ghl_contact_id: contactId,
      ghl_pushed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', leadId);

    // Log activity
    await supabase.from('activity_log').insert({
      action_type: 'ghl_push',
      description: `Pushed ${lead.business_name} to GoHighLevel (Contact: ${contactId})`,
      lead_id: leadId,
    });

    return NextResponse.json({ success: true, contactId });
  } catch (err: any) {
    console.error('GHL push error:', err);
    return NextResponse.json({ error: err.message || 'GHL push failed' }, { status: 500 });
  }
}
