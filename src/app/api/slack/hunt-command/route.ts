import { NextRequest, NextResponse } from 'next/server';
import { postText } from '@/lib/hunt-slack';
import crypto from 'crypto';

// ═══════════════════════════════════════════════════════
// /api/slack/hunt-command
// Slack slash command receiver: `/hunt <keyword> [country=GB] [limit=25]`.
//
// Kicks off an async /api/hunt/run in the background and returns an immediate
// ack to Slack (must reply within 3s). Results post as lead cards to the
// configured channel as they qualify.
//
// Slack signs each request; we verify with SLACK_SIGNING_SECRET.
// ═══════════════════════════════════════════════════════

function verifySlackSignature(body: string, timestamp: string, signature: string, secret: string): boolean {
  const now = Math.floor(Date.now() / 1000);
  const ts = parseInt(timestamp, 10);
  if (Math.abs(now - ts) > 60 * 5) return false; // >5 min → replay
  const base = `v0:${timestamp}:${body}`;
  const digest = 'v0=' + crypto.createHmac('sha256', secret).update(base).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(signature));
  } catch {
    return false;
  }
}

function parseHuntArgs(text: string): { keyword: string; country: string; limit: number } {
  // "/hunt morpheus8 gb 25" or "/hunt morpheus8" or "/hunt \"co2 laser\" us 40"
  const trimmed = (text || '').trim();
  if (!trimmed) return { keyword: '', country: 'GB', limit: 25 };

  const parts: string[] = [];
  let buf = '';
  let inQuote = false;
  for (const c of trimmed) {
    if (c === '"') { inQuote = !inQuote; continue; }
    if (c === ' ' && !inQuote) {
      if (buf) { parts.push(buf); buf = ''; }
      continue;
    }
    buf += c;
  }
  if (buf) parts.push(buf);

  // Detect trailing "country limit" tokens
  let country = 'GB';
  let limit = 25;
  const tail: string[] = [];
  while (parts.length > 1) {
    const last = parts[parts.length - 1];
    if (/^\d+$/.test(last)) {
      limit = Math.max(1, Math.min(100, parseInt(last, 10)));
      parts.pop();
      continue;
    }
    if (/^(gb|uk|us|ca|au|ie|de|fr|es|it)$/i.test(last)) {
      country = last.toUpperCase() === 'UK' ? 'GB' : last.toUpperCase();
      parts.pop();
      continue;
    }
    tail.push(last);
    break;
  }
  const keyword = parts.join(' ').trim();
  return { keyword, country, limit };
}

export async function POST(request: NextRequest) {
  // Slack sends application/x-www-form-urlencoded
  const rawBody = await request.text();
  const timestamp = request.headers.get('x-slack-request-timestamp') || '';
  const signature = request.headers.get('x-slack-signature') || '';
  const secret = process.env.SLACK_SIGNING_SECRET;

  if (secret) {
    if (!verifySlackSignature(rawBody, timestamp, signature, secret)) {
      return NextResponse.json({ error: 'invalid slack signature' }, { status: 401 });
    }
  } else {
    console.warn('[hunt-command] SLACK_SIGNING_SECRET not set — signature verification skipped. Set it in Vercel env vars.');
  }

  const params = new URLSearchParams(rawBody);
  const text = params.get('text') || '';
  const responseUrl = params.get('response_url') || '';
  const userName = params.get('user_name') || 'someone';

  const { keyword, country, limit } = parseHuntArgs(text);
  if (!keyword) {
    return NextResponse.json({
      response_type: 'ephemeral',
      text: '*Usage:* `/hunt <keyword> [country=GB] [limit=25]`\n' +
        '*Examples:* `/hunt morpheus8` · `/hunt "co2 laser" us 40` · `/hunt endolift gb 50`',
    });
  }

  // Fire-and-forget: seed the ad-library queue asynchronously.
  const origin = new URL(request.url).origin;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (process.env.CRON_SECRET) headers.authorization = `Bearer ${process.env.CRON_SECRET}`;
  (async () => {
    try {
      const seedRes = await fetch(`${origin}/api/hunt/seed-adlibrary`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ mode: 'search', keyword, country, limit }),
      });
      const data = await seedRes.json().catch(() => ({}));
      const summary = data?.error
        ? `❌ *${keyword}* (${country}): ${data.error}`
        : `📡 *Seed complete* · keyword: *${keyword}* · country: *${country}*\n` +
          `Ingested: *${data.ingested || 0}* · Junk filtered: *${data.filtered_junk || 0}* · Dupes: *${data.skipped_duplicates || 0}*\n` +
          `Review at ${process.env.NEXT_PUBLIC_APP_URL || 'https://prospex-v2.vercel.app'}/hunt (Review Queue panel)`;

      if (responseUrl) {
        await fetch(responseUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ response_type: 'in_channel', text: summary }),
        }).catch(() => {});
      } else {
        await postText(summary);
      }
    } catch (e) {
      console.error('[hunt-command] seed failed', e);
    }
  })();

  // Immediate ack (must be <3s)
  return NextResponse.json({
    response_type: 'in_channel',
    text: `🎯 @${userName} kicked off a hunt for *${keyword}* in *${country}* (limit ${limit}). Results incoming…`,
  });
}
