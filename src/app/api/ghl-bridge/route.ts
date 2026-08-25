import { NextRequest, NextResponse } from 'next/server';

import { supabaseAdmin as supabase } from '@/lib/supabase-admin';
import { authOr401 } from '@/lib/api-auth';
import { accountForCountry, publicAccounts, type GhlAccount } from '@/lib/ghl-accounts';

// ═══════════════════════════════════════════════════════════════
// PROSPEX ↔ GOHIGHLEVEL BRIDGE
//
// Prospex decides WHO to work and remembers what happened; GHL owns
// the phone line and the message thread. This route is the seam:
//
//   ensure    — make sure the lead exists in the correct sub-account
//   open      — ensure + return the deep link to dial inside GHL
//   message   — send an SMS or email to the lead through GHL
//   note      — write a note onto the GHL contact record
//   accounts  — which sub-accounts are configured (labels only)
//
// Every action routes by the lead's country: GB goes to the UK
// account, US/CA to the North America account. The wrong account
// physically cannot place the call, so this is enforced, not advised.
// ═══════════════════════════════════════════════════════════════

const CONTACTS_VERSION = '2021-07-28';
const CONVERSATIONS_VERSION = '2021-04-15';

interface LeadRow {
  id: string;
  business_name: string;
  phone: string | null;
  email: string | null;
  website: string | null;
  address: string | null;
  city: string | null;
  country_code: string | null;
  niche: string | null;
  lead_score: number | null;
  owner_name: string | null;
  owner_first_name: string | null;
  ghl_contact_id: string | null;
  ghl_location_id: string | null;
  call_stage: string | null;
}

const LEAD_COLS =
  'id, business_name, phone, email, website, address, city, country_code, niche, ' +
  'lead_score, owner_name, owner_first_name, ghl_contact_id, ghl_location_id, call_stage';

/** Deep link straight to the contact record, where GHL's dialer lives. */
function contactUrl(account: GhlAccount, contactId: string): string {
  return `https://app.gohighlevel.com/v2/location/${account.locationId}/contacts/detail/${contactId}`;
}

function ghlHeaders(account: GhlAccount, version: string) {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${account.apiKey}`,
    Version: version,
  };
}

/** Resolve the lead and the sub-account that must handle it. */
async function resolve(leadId: string): Promise<
  { ok: true; lead: LeadRow; account: GhlAccount } | { ok: false; response: NextResponse }
> {
  const { data } = await supabase.from('leads').select(LEAD_COLS).eq('id', leadId).single();
  const lead = data as LeadRow | null;
  if (!lead) {
    return { ok: false, response: NextResponse.json({ error: 'Lead not found' }, { status: 404 }) };
  }

  const account = accountForCountry(lead.country_code);
  if (!account) {
    return { ok: false, response: NextResponse.json({
      error: `No GoHighLevel sub-account covers ${lead.country_code || 'this lead\'s country'}. ` +
             `Add its country to an account in src/lib/ghl-accounts.ts.`,
    }, { status: 400 }) };
  }
  if (!account.configured) {
    return { ok: false, response: NextResponse.json({
      error: `${account.label} is not configured. Set GHL_${account.key.toUpperCase()}_LOCATION_ID ` +
             `and GHL_${account.key.toUpperCase()}_API_KEY in Vercel.`,
      account: account.label,
    }, { status: 400 }) };
  }
  return { ok: true, lead, account };
}

/**
 * Make sure the lead exists as a contact in the right sub-account.
 *
 * Deliberately upsert-style: GHL dedupes on phone/email within a
 * location, so a contact the team already created by hand is reused
 * rather than duplicated. A stored id from a DIFFERENT location is
 * ignored — ids are only unique within their own sub-account.
 */
async function ensureContact(lead: LeadRow, account: GhlAccount): Promise<
  { contactId: string; created: boolean } | { error: string; status: number }
> {
  if (lead.ghl_contact_id && lead.ghl_location_id === account.locationId) {
    return { contactId: lead.ghl_contact_id, created: false };
  }

  const [firstName, ...rest] = (lead.owner_name || '').trim().split(/\s+/);
  const payload: Record<string, unknown> = {
    locationId: account.locationId,
    name: lead.owner_name || lead.business_name,
    companyName: lead.business_name,
    source: 'Prospex cold call',
    tags: [
      'prospex',
      'cold-call',
      lead.niche ? `niche:${lead.niche}` : null,
      lead.city ? `city:${lead.city}` : null,
    ].filter(Boolean),
  };
  if (lead.owner_name) {
    payload.firstName = firstName;
    if (rest.length) payload.lastName = rest.join(' ');
  }
  if (lead.phone) payload.phone = lead.phone;
  if (lead.email) payload.email = lead.email;
  if (lead.website) payload.website = lead.website;
  if (lead.address) payload.address1 = lead.address;
  if (lead.city) payload.city = lead.city;
  if (lead.country_code) payload.country = lead.country_code;

  // upsert reuses an existing contact on a phone/email match instead of
  // creating a duplicate the team would then have to merge by hand.
  const res = await fetch('https://services.leadconnectorhq.com/contacts/upsert', {
    method: 'POST',
    headers: ghlHeaders(account, CONTACTS_VERSION),
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15000),
  });

  const text = await res.text();
  if (!res.ok) {
    return { error: `${account.label} rejected the contact (HTTP ${res.status}): ${text.slice(0, 300)}`, status: 502 };
  }

  let contactId: string | undefined;
  try {
    const json = JSON.parse(text);
    contactId = json?.contact?.id || json?.id;
  } catch { /* fall through to the missing-id error below */ }

  if (!contactId) {
    return { error: `GoHighLevel returned no contact id: ${text.slice(0, 300)}`, status: 502 };
  }

  await supabase.from('leads').update({
    ghl_contact_id: contactId,
    ghl_location_id: account.locationId,
    ghl_pushed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('id', lead.id);

  return { contactId, created: true };
}

export async function POST(request: NextRequest) {
  const auth = await authOr401();
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await request.json();

    if (body.action === 'accounts') {
      return NextResponse.json({ success: true, accounts: publicAccounts() });
    }

    const leadId: string = body.lead_id;
    if (!leadId) return NextResponse.json({ error: 'lead_id required' }, { status: 400 });

    const r = await resolve(leadId);
    if (!r.ok) return r.response;
    const { lead, account } = r;

    switch (body.action) {
      // ─── Ensure the contact exists, and hand back the dial link ───
      case 'open':
      case 'ensure': {
        const c = await ensureContact(lead, account);
        if ('error' in c) return NextResponse.json({ error: c.error }, { status: c.status });
        return NextResponse.json({
          success: true,
          contact_id: c.contactId,
          created: c.created,
          account: account.label,
          account_key: account.key,
          url: contactUrl(account, c.contactId),
        });
      }

      // ─── Send an SMS or email through GHL ───
      case 'message': {
        const type: 'SMS' | 'Email' = body.type === 'Email' ? 'Email' : 'SMS';
        const text: string = (body.message || '').trim();
        if (!text) return NextResponse.json({ error: 'message body required' }, { status: 400 });
        if (type === 'SMS' && !lead.phone) return NextResponse.json({ error: 'Lead has no phone number' }, { status: 400 });
        if (type === 'Email' && !lead.email) return NextResponse.json({ error: 'Lead has no email address' }, { status: 400 });

        const c = await ensureContact(lead, account);
        if ('error' in c) return NextResponse.json({ error: c.error }, { status: c.status });

        const msgPayload: Record<string, unknown> = { type, contactId: c.contactId, message: text };
        if (type === 'Email') {
          msgPayload.subject = body.subject || `Following up — ${lead.business_name}`;
          msgPayload.html = body.html || text.replace(/\n/g, '<br>');
        }

        const res = await fetch('https://services.leadconnectorhq.com/conversations/messages', {
          method: 'POST',
          headers: ghlHeaders(account, CONVERSATIONS_VERSION),
          body: JSON.stringify(msgPayload),
          signal: AbortSignal.timeout(20000),
        });
        const raw = await res.text();
        if (!res.ok) {
          return NextResponse.json({
            error: `${account.label} could not send the ${type} (HTTP ${res.status}): ${raw.slice(0, 300)}`,
          }, { status: 502 });
        }

        // Mirror the send into the call timeline so the next caller sees it.
        await supabase.from('call_logs').insert({
          lead_id: lead.id,
          outcome: type === 'SMS' ? 'sms_sent' : 'email_sent',
          stage_before: lead.call_stage,
          stage_after: lead.call_stage,
          called_by: auth.email || null,
          ghl_contact_id: c.contactId,
          ghl_location_id: account.locationId,
          notes: `${type} sent via ${account.label}: ${text.slice(0, 400)}`,
          source: 'ghl_bridge',
        });

        return NextResponse.json({
          success: true, type, contact_id: c.contactId,
          account: account.label, url: contactUrl(account, c.contactId),
        });
      }

      // ─── Push a note onto the GHL contact ───
      case 'note': {
        const noteBody: string = (body.note || '').trim();
        if (!noteBody) return NextResponse.json({ error: 'note required' }, { status: 400 });

        const c = await ensureContact(lead, account);
        if ('error' in c) return NextResponse.json({ error: c.error }, { status: c.status });

        const res = await fetch(`https://services.leadconnectorhq.com/contacts/${c.contactId}/notes`, {
          method: 'POST',
          headers: ghlHeaders(account, CONTACTS_VERSION),
          body: JSON.stringify({ body: noteBody }),
          signal: AbortSignal.timeout(15000),
        });
        if (!res.ok) {
          const raw = await res.text();
          return NextResponse.json({ error: `Note failed (HTTP ${res.status}): ${raw.slice(0, 300)}` }, { status: 502 });
        }
        return NextResponse.json({ success: true, contact_id: c.contactId, account: account.label });
      }

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'GHL bridge error';
    console.error('[ghl-bridge]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
