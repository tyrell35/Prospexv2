import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

// ═══════════════════════════════════════════════════════
// DM CAMPAIGN MANAGER
// Campaigns + Queue + IG Account rotation + A/B testing
// ═══════════════════════════════════════════════════════

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;

    switch (action) {
      case 'get_campaigns': return getCampaigns();
      case 'create_campaign': return createCampaign(body);
      case 'update_campaign': return updateCampaign(body);
      case 'delete_campaign': return deleteCampaign(body);
      case 'pause_campaign': return setStatus(body, 'paused');
      case 'resume_campaign': return setStatus(body, 'active');
      case 'build_queue': return buildQueue(body);
      case 'get_queue': return getQueue(body);
      case 'get_todays_queue': return getTodaysQueue();
      case 'update_status': return updateQueueStatus(body);
      case 'export_csv': return exportCsv(body);
      case 'get_stats': return getCampaignStats(body);
      case 'get_accounts': return getAccounts();
      case 'manage_accounts': return manageAccounts(body);
      case 'schedule_follow_ups': return scheduleFollowUps(body);
      case 'webhook_reply': return webhookReply(body);
      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ─── GET handler for Vercel Crons ───────────────────────
// vercel.json hits /api/dm-campaigns?cron=<name> on schedule.

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const cron = url.searchParams.get('cron');
  if (!cron) return NextResponse.json({ error: 'cron param required' }, { status: 400 });

  // If CRON_SECRET is set, require Bearer auth (Vercel sends this automatically)
  const expected = process.env.CRON_SECRET;
  if (expected) {
    const auth = request.headers.get('authorization') || '';
    if (auth !== `Bearer ${expected}`) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
  }

  if (cron === 'reset_daily') return manageAccounts({ sub_action: 'reset_daily' });
  if (cron === 'schedule_follow_ups') return scheduleFollowUps({});
  return NextResponse.json({ error: `Unknown cron: ${cron}` }, { status: 400 });
}

// ─── CAMPAIGNS ──────────────────────────────────────────

async function getCampaigns() {
  const { data, error } = await supabase
    .from('dm_campaigns')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, campaigns: data || [] });
}

interface CreateCampaignBody {
  name?: string;
  channel?: string;
  campaign_type?: string;
  script_template?: string;
  variant_b?: string;
  follow_up_scripts?: string[];
  target_niche?: string;
  target_cities?: string;
  target_country?: string;
  daily_limit?: number;
  min_reviews?: number | null;
  max_reviews?: number | null;
  require_website?: boolean;
  require_instagram?: boolean;
  exclude_with_ads?: boolean;
  follow_up_delay_hours?: number;
  max_follow_ups?: number;
  send_window_start?: string;
  send_window_end?: string;
}

async function createCampaign(body: CreateCampaignBody) {
  if (!body.name || !body.script_template) {
    return NextResponse.json({ error: 'name and script_template are required' }, { status: 400 });
  }
  const cities = (body.target_cities || '').split(',').map(s => s.trim()).filter(Boolean);
  const variants = body.variant_b ? [{ id: 'b', message: body.variant_b }] : [];
  const followUps = (body.follow_up_scripts || [])
    .map(s => (s || '').trim())
    .filter(Boolean)
    .map(message => ({ message }));

  const { data, error } = await supabase
    .from('dm_campaigns')
    .insert({
      name: body.name,
      channel: body.channel || 'instagram',
      campaign_type: body.campaign_type || 'cold_open',
      script_template: body.script_template,
      script_variants: variants,
      follow_up_scripts: followUps,
      target_niche: body.target_niche || null,
      target_cities: cities.length > 0 ? cities : null,
      target_country: body.target_country || 'United Kingdom',
      daily_limit: body.daily_limit || 30,
      min_reviews: body.min_reviews ?? null,
      max_reviews: body.max_reviews ?? null,
      require_website: !!body.require_website,
      require_instagram: body.require_instagram ?? true,
      exclude_with_ads: !!body.exclude_with_ads,
      follow_up_delay_hours: body.follow_up_delay_hours ?? 48,
      max_follow_ups: body.max_follow_ups ?? Math.max(followUps.length, 0),
      send_window_start: body.send_window_start || '09:00',
      send_window_end: body.send_window_end || '17:00',
      status: 'draft',
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, campaign: data });
}

async function updateCampaign(body: { campaign_id: string; updates: Record<string, unknown> }) {
  const { campaign_id, updates } = body;
  if (!campaign_id) return NextResponse.json({ error: 'campaign_id required' }, { status: 400 });
  const { data, error } = await supabase
    .from('dm_campaigns')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', campaign_id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, campaign: data });
}

async function deleteCampaign(body: { campaign_id: string }) {
  if (!body.campaign_id) return NextResponse.json({ error: 'campaign_id required' }, { status: 400 });
  await supabase.from('dm_queue').delete().eq('campaign_id', body.campaign_id);
  const { error } = await supabase.from('dm_campaigns').delete().eq('id', body.campaign_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

async function setStatus(body: { campaign_id: string }, status: string) {
  if (!body.campaign_id) return NextResponse.json({ error: 'campaign_id required' }, { status: 400 });
  const { error } = await supabase
    .from('dm_campaigns')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', body.campaign_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

// ─── QUEUE BUILDING ─────────────────────────────────────

interface Lead {
  id: string;
  business_name: string;
  niche?: string | null;
  city?: string | null;
  country?: string | null;
  phone?: string | null;
  phone_formatted?: string | null;
  instagram_url?: string | null;
  instagram_handle?: string | null;
  google_rating?: number | null;
  google_review_count?: number | null;
  website?: string | null;
  has_pixel?: boolean | null;
}

interface Campaign {
  id: string;
  channel: string;
  script_template: string;
  script_variants: Array<{ id: string; message: string }>;
  follow_up_scripts: Array<{ message: string }>;
  target_niche: string | null;
  target_cities: string[] | null;
  target_country: string | null;
  min_reviews: number | null;
  max_reviews: number | null;
  require_website: boolean;
  require_instagram: boolean;
  exclude_with_ads: boolean;
  daily_limit: number;
  send_window_start: string;
  send_window_end: string;
  follow_up_delay_hours: number;
  max_follow_ups: number;
}

// Spread N items across days/hours respecting capacity per day and send window.
// Returns ISO timestamps in order, one per item.
function buildSchedule(itemCount: number, capacityPerDay: number, windowStart: string, windowEnd: string, startDate: Date = new Date()): string[] {
  if (itemCount <= 0) return [];
  const cap = Math.max(1, capacityPerDay);
  const [startH, startM] = (windowStart || '09:00').split(':').map(Number);
  const [endH, endM] = (windowEnd || '17:00').split(':').map(Number);
  const startMinutes = (startH || 0) * 60 + (startM || 0);
  const endMinutes = (endH || 17) * 60 + (endM || 0);
  const windowMinutes = Math.max(60, endMinutes - startMinutes);

  const out: string[] = [];
  let dayOffset = 0;
  let inDay = 0;

  for (let i = 0; i < itemCount; i++) {
    if (inDay >= cap) { dayOffset++; inDay = 0; }
    const day = new Date(startDate);
    day.setDate(day.getDate() + dayOffset);
    // Even spacing within window
    const minuteOffset = Math.floor((inDay / cap) * windowMinutes);
    day.setHours(0, startMinutes + minuteOffset, 0, 0);
    // If first day's slot is in the past, push to now
    if (dayOffset === 0 && day.getTime() < Date.now()) {
      day.setTime(Date.now() + i * 30000); // 30s apart
    }
    out.push(day.toISOString());
    inDay++;
  }
  return out;
}

function fillTemplate(message: string, lead: Lead): string {
  const firstName = lead.business_name?.split(/[\s\-&]/)[0] || 'there';
  return message
    .replace(/\{\{firstName\}\}/g, firstName)
    .replace(/\{\{first_name\}\}/g, firstName)
    .replace(/\{\{clinicName\}\}/g, lead.business_name || 'your clinic')
    .replace(/\{\{business_name\}\}/g, lead.business_name || 'your business')
    .replace(/\{\{city\}\}/g, lead.city || 'your area')
    .replace(/\{\{niche\}\}/g, lead.niche || 'clinic')
    .replace(/\{\{reviewCount\}\}/g, String(lead.google_review_count || 'great'))
    .replace(/\{\{review_count\}\}/g, String(lead.google_review_count || ''))
    .replace(/\{\{rating\}\}/g, String(lead.google_rating ?? ''))
    .replace(/\{\{handle\}\}/g, lead.instagram_handle || '')
    .replace(/\{\{instagram_handle\}\}/g, lead.instagram_handle || '')
    .replace(/\{\{treatmentType\}\}/g, 'treatment')
    .replace(/\{\{website\}\}/g, lead.website || '');
}

async function buildQueue(body: { campaign_id: string }) {
  const { campaign_id } = body;
  if (!campaign_id) return NextResponse.json({ error: 'campaign_id required' }, { status: 400 });

  const { data: campaignData, error: campErr } = await supabase
    .from('dm_campaigns')
    .select('*')
    .eq('id', campaign_id)
    .single();
  if (campErr || !campaignData) return NextResponse.json({ error: campErr?.message || 'Campaign not found' }, { status: 404 });
  const campaign = campaignData as Campaign;

  // Build leads query
  let q = supabase.from('leads').select('*');
  if (campaign.target_niche) q = q.ilike('niche', `%${campaign.target_niche}%`);
  if (campaign.target_country) q = q.ilike('country', `%${campaign.target_country}%`);
  if (campaign.target_cities && campaign.target_cities.length > 0) {
    const cityFilter = campaign.target_cities.map((c: string) => `city.ilike.%${c}%`).join(',');
    q = q.or(cityFilter);
  }
  if (campaign.min_reviews !== null) q = q.gte('google_review_count', campaign.min_reviews);
  if (campaign.max_reviews !== null) q = q.lte('google_review_count', campaign.max_reviews);
  if (campaign.require_website) q = q.not('website', 'is', null);
  if (campaign.require_instagram) q = q.not('instagram_url', 'is', null);
  if (campaign.exclude_with_ads) q = q.eq('has_pixel', false);

  const { data: leads, error: leadsErr } = await q.limit(2000);
  if (leadsErr) return NextResponse.json({ error: leadsErr.message }, { status: 500 });
  if (!leads || leads.length === 0) {
    return NextResponse.json({ success: true, queued: 0, message: 'No matching leads' });
  }

  // Skip leads that already have an active queue row for this campaign
  const leadIds = leads.map((l: Lead) => l.id);
  const { data: existing } = await supabase
    .from('dm_queue')
    .select('lead_id')
    .eq('campaign_id', campaign_id)
    .in('lead_id', leadIds);
  const skipSet = new Set((existing || []).map((r: { lead_id: string }) => r.lead_id));
  const newLeads = leads.filter((l: Lead) => !skipSet.has(l.id));

  // Get active IG accounts (for round-robin + capacity calc)
  const { data: igAccounts } = await supabase
    .from('ig_accounts')
    .select('username, daily_limit')
    .eq('status', 'active')
    .order('username', { ascending: true });
  const activeAccounts: Array<{ username: string; daily_limit: number }> = (igAccounts || []).map(a => ({
    username: (a as { username: string }).username,
    daily_limit: (a as { daily_limit: number | null }).daily_limit || 30,
  }));
  const accountUsernames = activeAccounts.map(a => a.username);

  // Capacity per day: sum of all active accounts' daily_limits, capped by campaign.daily_limit
  const accountCapacity = activeAccounts.reduce((sum, a) => sum + a.daily_limit, 0);
  const capacityPerDay = Math.max(1, Math.min(campaign.daily_limit || 30, accountCapacity || campaign.daily_limit || 30));

  // Pre-compute scheduled times respecting send window + daily capacity
  const schedule = buildSchedule(newLeads.length, capacityPerDay, campaign.send_window_start, campaign.send_window_end);

  // Build queue rows
  const variants = campaign.script_variants || [];
  const hasVariantB = variants.length > 0;
  const variantBMessage = hasVariantB ? variants[0].message : null;

  const rows = newLeads.map((lead: Lead, i: number) => {
    // 50/50 A/B assignment
    const useVariantB = hasVariantB && Math.random() < 0.5;
    const baseMessage = useVariantB && variantBMessage ? variantBMessage : campaign.script_template;
    const variant_id = useVariantB ? 'b' : 'a';
    const message_text = fillTemplate(baseMessage, lead);
    const ig_account = accountUsernames.length > 0 ? accountUsernames[i % accountUsernames.length] : null;
    return {
      campaign_id,
      lead_id: lead.id,
      message_text,
      variant_id,
      step: 0,
      ig_account,
      status: 'queued',
      scheduled_for: schedule[i] || new Date().toISOString(),
      lead_data: {
        business_name: lead.business_name,
        city: lead.city,
        niche: lead.niche,
        instagram_handle: lead.instagram_handle,
        instagram_url: lead.instagram_url,
        phone: lead.phone_formatted || lead.phone,
        website: lead.website,
      },
    };
  });

  if (rows.length === 0) {
    return NextResponse.json({ success: true, queued: 0, message: 'All matching leads already queued' });
  }

  // Insert in chunks
  const chunkSize = 200;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const { error } = await supabase.from('dm_queue').insert(chunk);
    if (!error) inserted += chunk.length;
  }

  // Update campaign counter
  await supabase
    .from('dm_campaigns')
    .update({
      total_queued: ((campaignData as { total_queued?: number }).total_queued || 0) + inserted,
      status: 'active',
      updated_at: new Date().toISOString(),
    })
    .eq('id', campaign_id);

  return NextResponse.json({ success: true, queued: inserted, skipped: rows.length - inserted });
}

// ─── QUEUE READS ────────────────────────────────────────

async function getQueue(body: { campaign_id?: string; status?: string; limit?: number }) {
  let q = supabase
    .from('dm_queue')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(body.limit || 500);
  if (body.campaign_id) q = q.eq('campaign_id', body.campaign_id);
  if (body.status) q = q.eq('status', body.status);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, queue: data || [] });
}

async function getTodaysQueue() {
  const { data, error } = await supabase
    .from('dm_queue')
    .select('*')
    .eq('status', 'queued')
    .lte('scheduled_for', new Date().toISOString())
    .order('ig_account', { ascending: true })
    .order('scheduled_for', { ascending: true })
    .limit(1000);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, queue: data || [] });
}

async function updateQueueStatus(body: { queue_ids: string[]; status: string }) {
  const { queue_ids, status } = body;
  if (!Array.isArray(queue_ids) || queue_ids.length === 0) {
    return NextResponse.json({ error: 'queue_ids array required' }, { status: 400 });
  }

  const updates: Record<string, unknown> = { status };
  const now = new Date().toISOString();
  if (status === 'sent') updates.sent_at = now;
  if (status === 'replied') updates.replied_at = now;

  const { data, error } = await supabase
    .from('dm_queue')
    .update(updates)
    .in('id', queue_ids)
    .select('id, campaign_id, ig_account');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Bump campaign counters
  const updated = data || [];
  const byCampaign: Record<string, number> = {};
  for (const row of updated) {
    const cid = (row as { campaign_id: string }).campaign_id;
    if (cid) byCampaign[cid] = (byCampaign[cid] || 0) + 1;
  }
  for (const [cid, count] of Object.entries(byCampaign)) {
    const field = status === 'sent' ? 'total_sent' : status === 'replied' ? 'total_replied' : null;
    if (!field) continue;
    const { data: c } = await supabase.from('dm_campaigns').select(field).eq('id', cid).single();
    const current = (c as Record<string, number> | null)?.[field] || 0;
    const patch: Record<string, unknown> = { [field]: current + count, updated_at: now };
    // Recompute reply_rate on any change
    if (field === 'total_sent' || field === 'total_replied') {
      const { data: c2 } = await supabase.from('dm_campaigns').select('total_sent, total_replied').eq('id', cid).single();
      const sent = (c2 as { total_sent?: number } | null)?.total_sent || 0;
      const replied = (c2 as { total_replied?: number } | null)?.total_replied || 0;
      const newSent = field === 'total_sent' ? sent + count : sent;
      const newReplied = field === 'total_replied' ? replied + count : replied;
      patch.reply_rate = newSent > 0 ? Math.round((newReplied / newSent) * 1000) / 10 : 0;
    }
    await supabase.from('dm_campaigns').update(patch).eq('id', cid);
  }

  // Bump ig_account daily_sent_today when status=sent
  if (status === 'sent') {
    const byAccount: Record<string, number> = {};
    for (const row of updated) {
      const u = (row as { ig_account: string | null }).ig_account;
      if (u) byAccount[u] = (byAccount[u] || 0) + 1;
    }
    for (const [username, count] of Object.entries(byAccount)) {
      const { data: acc } = await supabase
        .from('ig_accounts')
        .select('daily_sent_today, total_sent')
        .eq('username', username)
        .single();
      await supabase
        .from('ig_accounts')
        .update({
          daily_sent_today: ((acc as { daily_sent_today?: number } | null)?.daily_sent_today || 0) + count,
          total_sent: ((acc as { total_sent?: number } | null)?.total_sent || 0) + count,
          last_sent_at: now,
          updated_at: now,
        })
        .eq('username', username);
    }
  }

  return NextResponse.json({ success: true, updated: updated.length });
}

// ─── EXPORT CSV (for ColdDMs / similar tools) ───────────

async function exportCsv(body: { campaign_id: string; status?: string }) {
  if (!body.campaign_id) return NextResponse.json({ error: 'campaign_id required' }, { status: 400 });
  const status = body.status || 'queued';
  const { data, error } = await supabase
    .from('dm_queue')
    .select('id, lead_id, message_text, variant_id, ig_account, status, lead_data, scheduled_for')
    .eq('campaign_id', body.campaign_id)
    .eq('status', status)
    .limit(10000);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const headers = ['queue_id', 'lead_id', 'business_name', 'instagram_handle', 'instagram_url', 'phone', 'message', 'variant', 'ig_account', 'scheduled_for'];
  const csvRows = [headers.join(',')];
  for (const row of data || []) {
    const r = row as { id: string; lead_id: string; message_text: string; variant_id: string | null; ig_account: string | null; scheduled_for: string | null; lead_data: { business_name?: string; instagram_handle?: string; instagram_url?: string; phone?: string } };
    const ld = r.lead_data || {};
    const cells = [
      r.id,
      r.lead_id,
      escapeCsv(ld.business_name || ''),
      escapeCsv(ld.instagram_handle || ''),
      escapeCsv(ld.instagram_url || ''),
      escapeCsv(ld.phone || ''),
      escapeCsv(r.message_text),
      r.variant_id || 'a',
      escapeCsv(r.ig_account || ''),
      r.scheduled_for || '',
    ];
    csvRows.push(cells.join(','));
  }

  return NextResponse.json({ success: true, csv: csvRows.join('\n'), rows: csvRows.length - 1 });
}

function escapeCsv(value: string): string {
  if (value == null) return '';
  const s = String(value);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

// ─── STATS / A/B BREAKDOWN ──────────────────────────────

async function getCampaignStats(body: { campaign_id: string }) {
  if (!body.campaign_id) return NextResponse.json({ error: 'campaign_id required' }, { status: 400 });
  const { data, error } = await supabase
    .from('dm_queue')
    .select('variant_id, status, reply_sentiment')
    .eq('campaign_id', body.campaign_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const breakdown: Record<string, { total: number; queued: number; sent: number; replied: number; positive: number }> = {};
  for (const row of data || []) {
    const r = row as { variant_id: string | null; status: string | null; reply_sentiment: string | null };
    const v = r.variant_id || 'a';
    if (!breakdown[v]) breakdown[v] = { total: 0, queued: 0, sent: 0, replied: 0, positive: 0 };
    breakdown[v].total++;
    if (r.status === 'queued') breakdown[v].queued++;
    if (r.status === 'sent') breakdown[v].sent++;
    if (r.status === 'replied') breakdown[v].replied++;
    if (r.reply_sentiment === 'positive') breakdown[v].positive++;
  }

  const variants = Object.entries(breakdown).map(([id, s]) => ({
    variant_id: id,
    ...s,
    reply_rate: s.sent > 0 ? Math.round((s.replied / s.sent) * 1000) / 10 : 0,
    positive_rate: s.replied > 0 ? Math.round((s.positive / s.replied) * 1000) / 10 : 0,
  }));

  return NextResponse.json({ success: true, variants });
}

// ─── IG ACCOUNTS ────────────────────────────────────────

async function getAccounts() {
  const { data, error } = await supabase
    .from('ig_accounts')
    .select('*')
    .order('username', { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, accounts: data || [] });
}

interface ManageAccountsBody {
  sub_action?: string;
  username?: string;
  display_name?: string;
  daily_limit?: number;
  status?: string;
  notes?: string;
  account_id?: string;
}

async function manageAccounts(body: ManageAccountsBody) {
  const { sub_action } = body;

  if (sub_action === 'add') {
    if (!body.username) return NextResponse.json({ error: 'username required' }, { status: 400 });
    const { data, error } = await supabase
      .from('ig_accounts')
      .insert({
        username: body.username,
        display_name: body.display_name || null,
        daily_limit: body.daily_limit || 30,
        status: body.status || 'active',
        notes: body.notes || null,
      })
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, account: data });
  }

  if (sub_action === 'update') {
    if (!body.account_id) return NextResponse.json({ error: 'account_id required' }, { status: 400 });
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.display_name !== undefined) updates.display_name = body.display_name;
    if (body.daily_limit !== undefined) updates.daily_limit = body.daily_limit;
    if (body.status !== undefined) updates.status = body.status;
    if (body.notes !== undefined) updates.notes = body.notes;
    const { data, error } = await supabase
      .from('ig_accounts')
      .update(updates)
      .eq('id', body.account_id)
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, account: data });
  }

  if (sub_action === 'remove') {
    if (!body.account_id) return NextResponse.json({ error: 'account_id required' }, { status: 400 });
    const { error } = await supabase.from('ig_accounts').delete().eq('id', body.account_id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  if (sub_action === 'reset_daily') {
    // Reset daily_sent_today for all accounts (cron-style — call once per day)
    const { error } = await supabase
      .from('ig_accounts')
      .update({ daily_sent_today: 0, last_reset_at: new Date().toISOString() })
      .neq('id', '00000000-0000-0000-0000-000000000000');
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: `Unknown sub_action: ${sub_action}` }, { status: 400 });
}

// ─── AUTO FOLLOW-UP SCHEDULER ───────────────────────────
// Finds sent items where the follow-up window has elapsed and replied_at is null,
// and creates new dm_queue rows at step+1 with the next follow-up message.

async function scheduleFollowUps(_body: { campaign_id?: string }) {
  // Pull all active campaigns (or just the one specified)
  let campaignsQ = supabase.from('dm_campaigns').select('*').eq('status', 'active');
  if (_body.campaign_id) campaignsQ = campaignsQ.eq('id', _body.campaign_id);
  const { data: campaigns, error: campErr } = await campaignsQ;
  if (campErr) return NextResponse.json({ error: campErr.message }, { status: 500 });

  let totalScheduled = 0;
  const perCampaign: Array<{ campaign_id: string; scheduled: number }> = [];

  for (const cRaw of campaigns || []) {
    const c = cRaw as Campaign;
    const maxFollowUps = c.max_follow_ups ?? 3;
    const delayHours = c.follow_up_delay_hours ?? 48;
    const followUpScripts = Array.isArray(c.follow_up_scripts) ? c.follow_up_scripts : [];
    if (maxFollowUps === 0 || followUpScripts.length === 0) {
      perCampaign.push({ campaign_id: c.id, scheduled: 0 });
      continue;
    }

    // Pull sent items eligible for the next follow-up
    const cutoff = new Date(Date.now() - delayHours * 60 * 60 * 1000).toISOString();
    const { data: eligible } = await supabase
      .from('dm_queue')
      .select('id, lead_id, step, ig_account, variant_id, lead_data, sent_at')
      .eq('campaign_id', c.id)
      .eq('status', 'sent')
      .is('replied_at', null)
      .lte('sent_at', cutoff)
      .lt('step', maxFollowUps)
      .limit(2000);

    if (!eligible || eligible.length === 0) {
      perCampaign.push({ campaign_id: c.id, scheduled: 0 });
      continue;
    }

    // Skip leads that already have a queued follow-up at step+1
    const leadIds = eligible.map(r => (r as { lead_id: string }).lead_id);
    const { data: existingFu } = await supabase
      .from('dm_queue')
      .select('lead_id, step')
      .eq('campaign_id', c.id)
      .in('lead_id', leadIds)
      .eq('status', 'queued')
      .gt('step', 0);
    const skipKey = new Set((existingFu || []).map(r => {
      const x = r as { lead_id: string; step: number };
      return `${x.lead_id}|${x.step}`;
    }));

    const toCreate = eligible.filter(r => {
      const x = r as { lead_id: string; step: number };
      return !skipKey.has(`${x.lead_id}|${x.step + 1}`);
    });
    if (toCreate.length === 0) {
      perCampaign.push({ campaign_id: c.id, scheduled: 0 });
      continue;
    }

    // Capacity for follow-ups: same logic as build_queue
    const { data: igAccounts } = await supabase
      .from('ig_accounts')
      .select('username, daily_limit')
      .eq('status', 'active');
    const accountCapacity = (igAccounts || []).reduce((sum, a) => sum + ((a as { daily_limit: number | null }).daily_limit || 30), 0);
    const capacityPerDay = Math.max(1, Math.min(c.daily_limit || 30, accountCapacity || c.daily_limit || 30));
    const schedule = buildSchedule(toCreate.length, capacityPerDay, c.send_window_start, c.send_window_end);

    const newRows = toCreate.map((r, i) => {
      const row = r as { lead_id: string; step: number; ig_account: string | null; variant_id: string | null; lead_data: Record<string, unknown> };
      const nextStep = row.step + 1;
      // followUpScripts is 0-indexed: index 0 = first follow-up (step 1), etc.
      const scriptIndex = Math.min(nextStep - 1, followUpScripts.length - 1);
      const baseMessage = followUpScripts[scriptIndex]?.message || c.script_template;
      const ld = row.lead_data || {};
      // Re-personalize using snapshotted lead_data
      const message_text = fillTemplate(baseMessage, {
        id: row.lead_id,
        business_name: String(ld.business_name || ''),
        city: String(ld.city || ''),
        niche: String(ld.niche || ''),
        instagram_handle: String(ld.instagram_handle || ''),
        instagram_url: String(ld.instagram_url || ''),
        phone: String(ld.phone || ''),
        website: String(ld.website || ''),
        google_review_count: null,
        google_rating: null,
      });
      return {
        campaign_id: c.id,
        lead_id: row.lead_id,
        message_text,
        variant_id: row.variant_id || 'a',
        step: nextStep,
        ig_account: row.ig_account,
        status: 'queued',
        scheduled_for: schedule[i] || new Date().toISOString(),
        lead_data: row.lead_data,
      };
    });

    if (newRows.length > 0) {
      const { error: insErr } = await supabase.from('dm_queue').insert(newRows);
      if (!insErr) {
        totalScheduled += newRows.length;
        perCampaign.push({ campaign_id: c.id, scheduled: newRows.length });
        // Bump total_queued
        const { data: cc } = await supabase.from('dm_campaigns').select('total_queued').eq('id', c.id).single();
        const cur = (cc as { total_queued?: number } | null)?.total_queued || 0;
        await supabase.from('dm_campaigns').update({ total_queued: cur + newRows.length, updated_at: new Date().toISOString() }).eq('id', c.id);
      }
    }
  }

  return NextResponse.json({ success: true, scheduled: totalScheduled, per_campaign: perCampaign });
}

// ─── REPLY WEBHOOK ──────────────────────────────────────
// Receives inbound replies from external sender tools (ColdDMs, n8n, etc.)
// Body: { lead_identifier: handle|phone|queue_id, reply_text, account_username? }

function classifySentiment(text: string): 'positive' | 'negative' | 'neutral' {
  const t = text.toLowerCase();
  const positive = /\b(yes|yeah|yep|sure|interested|sounds good|book|schedule|call me|send (it|over|info)|tell me more|let'?s do|when can|how much)\b/;
  const negative = /\b(no|not interested|stop|unsubscribe|remove me|don'?t|fuck off|spam|leave me|never)\b/;
  if (positive.test(t)) return 'positive';
  if (negative.test(t)) return 'negative';
  return 'neutral';
}

interface WebhookReplyBody {
  lead_identifier?: string;
  reply_text?: string;
  account_username?: string;
  queue_id?: string;
  channel?: string;
}

async function webhookReply(body: WebhookReplyBody) {
  const { lead_identifier, reply_text, account_username, queue_id } = body;
  if (!reply_text) return NextResponse.json({ error: 'reply_text required' }, { status: 400 });

  // Find the matching dm_queue row
  type Row = { id: string; campaign_id: string; ig_account: string | null };
  let row: Row | null = null;

  if (queue_id) {
    const { data } = await supabase.from('dm_queue').select('id, campaign_id, ig_account').eq('id', queue_id).single();
    row = (data as Row | null) || null;
  } else if (lead_identifier) {
    // Try to match by IG handle, phone, or business_name in lead_data jsonb (most recent sent)
    const id = lead_identifier.replace(/^@/, '').trim();
    let q = supabase
      .from('dm_queue')
      .select('id, campaign_id, ig_account')
      .eq('status', 'sent')
      .or(`lead_data->>instagram_handle.eq.${id},lead_data->>phone.eq.${id},lead_data->>business_name.eq.${lead_identifier}`)
      .order('sent_at', { ascending: false })
      .limit(1);
    if (account_username) q = q.eq('ig_account', account_username);
    const { data } = await q;
    row = (data && data.length > 0 ? (data[0] as Row) : null);
  }

  if (!row) return NextResponse.json({ error: 'No matching sent dm_queue row found' }, { status: 404 });

  const sentiment = classifySentiment(reply_text);
  const now = new Date().toISOString();
  await supabase
    .from('dm_queue')
    .update({ status: 'replied', replied_at: now, reply_text, reply_sentiment: sentiment })
    .eq('id', row.id);

  // Bump campaign counters
  const { data: c } = await supabase
    .from('dm_campaigns')
    .select('total_replied, total_positive, total_sent')
    .eq('id', row.campaign_id)
    .single();
  const c2 = c as { total_replied?: number; total_positive?: number; total_sent?: number } | null;
  const totalReplied = (c2?.total_replied || 0) + 1;
  const totalPositive = (c2?.total_positive || 0) + (sentiment === 'positive' ? 1 : 0);
  const sent = c2?.total_sent || 0;
  const replyRate = sent > 0 ? Math.round((totalReplied / sent) * 1000) / 10 : 0;
  await supabase
    .from('dm_campaigns')
    .update({ total_replied: totalReplied, total_positive: totalPositive, reply_rate: replyRate, updated_at: now })
    .eq('id', row.campaign_id);

  // Bump ig_account total_replies
  if (row.ig_account) {
    const { data: acc } = await supabase.from('ig_accounts').select('total_replies').eq('username', row.ig_account).single();
    await supabase
      .from('ig_accounts')
      .update({ total_replies: ((acc as { total_replies?: number } | null)?.total_replies || 0) + 1, updated_at: now })
      .eq('username', row.ig_account);
  }

  return NextResponse.json({ success: true, queue_id: row.id, sentiment });
}
