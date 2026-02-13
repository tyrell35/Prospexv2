import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

function extractEmails(text: string): string[] {
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  const matches = text.match(emailRegex) || [];
  const filtered = matches.filter(e => {
    const lower = e.toLowerCase();
    return !lower.endsWith('.png') && !lower.endsWith('.jpg') && !lower.endsWith('.gif') &&
      !lower.endsWith('.svg') && !lower.includes('example.com') && !lower.includes('sentry') &&
      !lower.includes('webpack') && !lower.includes('wixpress') && !lower.includes('schema.org') &&
      !lower.includes('@2x') && lower.length < 60;
  });
  return Array.from(new Set(filtered));
}

function extractInstagram(text: string): string | null {
  const igRegex = /(?:https?:\/\/)?(?:www\.)?instagram\.com\/([a-zA-Z0-9_.]+)/gi;
  const match = igRegex.exec(text);
  if (match && match[1] && !['p', 'reel', 'stories', 'explore', 'accounts'].includes(match[1])) {
    return `https://instagram.com/${match[1]}`;
  }
  return null;
}

function extractPhones(text: string): string | null {
  const phoneRegex = /(?:\+?[\d\s\-().]{10,20})/g;
  const matches = text.match(phoneRegex) || [];
  const cleaned = matches.map(p => p.replace(/[^0-9+]/g, '')).filter(p => p.length >= 10 && p.length <= 15);
  return cleaned[0] || null;
}

async function crawlWithFirecrawl(url: string): Promise<{ markdown: string } | null> {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) return null;

  try {
    const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ url, formats: ['markdown'], onlyMainContent: false }),
    });
    if (!response.ok) return null;
    const data = await response.json();
    return { markdown: data.data?.markdown || '' };
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    const { leadIds } = await request.json();
    if (!leadIds || !Array.isArray(leadIds)) {
      return NextResponse.json({ error: 'leadIds array required' }, { status: 400 });
    }

    const enriched: { id: string; email?: string; phone?: string; instagram_url?: string }[] = [];

    for (const leadId of leadIds) {
      const { data: lead } = await supabase.from('leads').select('*').eq('id', leadId).single();
      if (!lead || !lead.website) continue;
      if (lead.email && lead.phone && lead.instagram_url) continue; // Already enriched

      // Crawl website
      const crawlResult = await crawlWithFirecrawl(lead.website);
      if (!crawlResult) continue;

      const text = crawlResult.markdown;
      const updates: Record<string, string | null> = {};

      if (!lead.email) {
        const emails = extractEmails(text);
        if (emails.length > 0) updates.email = emails[0];
      }

      if (!lead.phone) {
        const phone = extractPhones(text);
        if (phone) updates.phone = phone;
      }

      if (!lead.instagram_url) {
        const ig = extractInstagram(text);
        if (ig) updates.instagram_url = ig;
      }

      if (Object.keys(updates).length > 0) {
        updates.updated_at = new Date().toISOString();
        await supabase.from('leads').update(updates).eq('id', leadId);
        enriched.push({ id: leadId, ...updates });

        await supabase.from('activity_log').insert({
          action_type: 'score',
          description: `Enriched ${lead.business_name}: found ${Object.keys(updates).filter(k => k !== 'updated_at').join(', ')}`,
          lead_id: leadId,
        });
      }
    }

    return NextResponse.json({ success: true, enriched: enriched.length, results: enriched });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Enrichment failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
