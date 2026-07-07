// Send Hunt Mode lead cards to Slack. Uses the existing SLACK_BOT_TOKEN and
// posts to a configurable channel (default #prospecting-hot-leads).

const DEFAULT_CHANNEL = 'prospecting-hot-leads';

export interface LeadCardInput {
  score: number;
  band: 'hot' | 'warm' | 'cold' | 'disqualified';
  business_name: string;
  city: string | null;
  country: string | null;
  devices: string[];
  booking_system: string | null;
  google_review_count: number | null;
  google_rating: number | null;
  ads_active: boolean;
  ad_count: number;
  ad_days_running: number | null;
  library_url: string | null;
  email: string | null;
  instagram_handle: string | null;
  phone: string | null;
  opener: string | null;
  angle: string | null;
  lead_id: string;
  seed_source: string | null;
  has_other_agency: boolean;
  establishment_index: number | null;
}

function bandEmoji(band: string): string {
  return { hot: '🔥', warm: '🌤️', cold: '❄️', disqualified: '🚫' }[band] || '•';
}

function formatCard(l: LeadCardInput): { text: string; blocks: unknown[] } {
  const emoji = bandEmoji(l.band);
  const location = [l.city, l.country].filter(Boolean).join(', ') || 'unknown';
  const devicesLine = l.devices.length > 0 ? l.devices.slice(0, 4).join(', ') : 'none detected';
  const reviewLine = l.google_rating && l.google_review_count
    ? `${l.google_review_count} reviews (${l.google_rating.toFixed(1)}★)`
    : l.google_review_count
      ? `${l.google_review_count} reviews`
      : 'no reviews';
  const adsLine = l.ads_active
    ? `✅ ${l.ad_count} active, ${l.ad_days_running ?? '?'}d running${l.library_url ? ` → <${l.library_url}|Ad Library>` : ''}`
    : '❌ no active ads';
  const contactBits: string[] = [];
  if (l.email) contactBits.push(l.email);
  if (l.phone) contactBits.push(l.phone);
  if (l.instagram_handle) contactBits.push(`@${l.instagram_handle.replace(/^@/, '')}`);
  const contactLine = contactBits.join(' · ') || 'no contact found';

  const flagBadges: string[] = [];
  if (l.has_other_agency) flagBadges.push('⚠️ other-agency');
  if (l.seed_source === 'ad_library') flagBadges.push('📡 ad_library');
  const flags = flagBadges.length > 0 ? ` · ${flagBadges.join(' ')}` : '';

  const header = `${emoji} *${l.score}* · ${l.band.toUpperCase()} · ${l.business_name} — ${location}${flags}`;

  const bodyLines = [
    `*Devices:* ${devicesLine}`,
    `*Booking:* ${l.booking_system || '—'}  ·  *Reviews:* ${reviewLine}  ·  *Est. Index:* ${l.establishment_index ?? '—'}`,
    `*Ads:* ${adsLine}`,
    `*Contact:* ${contactLine}`,
  ];
  if (l.opener) bodyLines.push(`*Opener:* ${l.opener}`);
  if (l.angle) bodyLines.push(`_${l.angle}_`);

  const text = `${header}\n${bodyLines.join('\n')}`;
  const blocks = [
    { type: 'section', text: { type: 'mrkdwn', text: header } },
    { type: 'section', text: { type: 'mrkdwn', text: bodyLines.join('\n') } },
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: 'View in Prospex' },
          url: `${process.env.NEXT_PUBLIC_APP_URL || 'https://prospex-v2.vercel.app'}/leads/${l.lead_id}`,
        },
        ...(l.library_url ? [{
          type: 'button',
          text: { type: 'plain_text', text: 'Ad Library' },
          url: l.library_url,
        }] : []),
      ],
    },
    { type: 'divider' },
  ];
  return { text, blocks };
}

export async function postLeadCard(lead: LeadCardInput, channelOverride?: string): Promise<boolean> {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) {
    console.warn('[hunt-slack] SLACK_BOT_TOKEN not set — skipping lead card');
    return false;
  }
  const channel = channelOverride || process.env.SLACK_HUNT_CHANNEL || DEFAULT_CHANNEL;
  const { text, blocks } = formatCard(lead);
  try {
    const res = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ channel, text, blocks, mrkdwn: true, unfurl_links: false }),
    });
    const data = await res.json().catch(() => ({}));
    if (!data.ok) {
      console.error('[hunt-slack] postMessage failed', data);
      return false;
    }
    return true;
  } catch (e) {
    console.error('[hunt-slack] fetch error', e);
    return false;
  }
}

export async function postText(text: string, channelOverride?: string): Promise<void> {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) return;
  const channel = channelOverride || process.env.SLACK_HUNT_CHANNEL || DEFAULT_CHANNEL;
  await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ channel, text, mrkdwn: true }),
  }).catch(() => {});
}
