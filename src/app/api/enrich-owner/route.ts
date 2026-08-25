import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

import { supabaseAdmin as supabase } from '@/lib/supabase-admin';
import { authOr401 } from '@/lib/api-auth';

// Deliberately NOT reusing hunt's fetchWebsite: its "Prospex/1.0" User-Agent
// is rejected with a 403 by roughly a third of clinic sites (Cloudflare and
// similar WAFs). Owner names live on exactly those pages, so this route uses
// a browser User-Agent instead.

export const maxDuration = 300;

// ═══════════════════════════════════════════════════════════════
// OWNER ENRICHMENT — who do we actually ask for on the phone?
//
// Sources are tried cheapest-and-most-trustworthy first, and the
// first solid hit wins. Nothing here invents a name: if no source
// names a person, the lead comes back with owner_name = null and
// the caller opens with "who looks after the marketing there?"
// rather than a guess.
//
//   1. Companies House officers  — UK only, registry fact, high
//   2. Website about/team page   — self-published, high
//   3. AI read of the page text  — inference, medium/low
//
// Confidence is deliberately conservative: only 'high' is ever
// spoken as a name on a call (see isSpeakableName in lib/calling).
// ═══════════════════════════════════════════════════════════════

const MODEL = process.env.OWNER_ENRICH_MODEL || 'claude-opus-5';
const CONCURRENCY = 4;

const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

interface PageFetch { ok: boolean; html: string; final_url?: string; error?: string }

async function fetchPage(url: string, timeoutMs = 8000): Promise<PageFetch> {
  const target = url.startsWith('http') ? url : `https://${url}`;
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(target, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': BROWSER_UA,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-GB,en;q=0.9',
        'Upgrade-Insecure-Requests': '1',
      },
    });
    clearTimeout(t);
    if (!res.ok) return { ok: false, html: '', error: `HTTP ${res.status}` };
    const html = await res.text();
    return { ok: true, html, final_url: res.url };
  } catch (e) {
    return { ok: false, html: '', error: e instanceof Error ? e.message : 'fetch failed' };
  }
}

interface OwnerHit {
  owner_name: string;
  owner_role: string | null;
  owner_source: string;
  owner_confidence: 'high' | 'medium' | 'low';
}

// ─── 1. Companies House officers (UK) ────────────────────────
// hunt_enrichment may already hold the company number from a prior
// Hunt run; otherwise we search by name first.

async function companiesHouseOfficers(
  businessName: string,
  knownNumber: string | null,
): Promise<OwnerHit | null> {
  const key = process.env.COMPANIES_HOUSE_API_KEY;
  if (!key) return null;
  const auth = Buffer.from(`${key}:`).toString('base64');
  const headers = { Authorization: `Basic ${auth}` };

  try {
    let companyNumber = knownNumber;

    if (!companyNumber) {
      const q = encodeURIComponent(businessName);
      const res = await fetch(
        `https://api.company-information.service.gov.uk/search/companies?q=${q}&items_per_page=5`,
        { headers, signal: AbortSignal.timeout(6000) },
      );
      if (!res.ok) return null;
      const data = await res.json();
      const items = (data?.items || []) as Array<{ company_number: string; company_status: string; title: string }>;
      // Only trust a match whose registered name really looks like the lead.
      const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
      const target = norm(businessName);
      const match = items.find(i => {
        const t = norm(i.title).replace(/(limited|ltd|llp|plc)$/, '');
        return i.company_status === 'active' && (t.includes(target) || target.includes(t));
      });
      if (!match) return null;
      companyNumber = match.company_number;
    }

    const res = await fetch(
      `https://api.company-information.service.gov.uk/company/${companyNumber}/officers?items_per_page=20`,
      { headers, signal: AbortSignal.timeout(6000) },
    );
    if (!res.ok) return null;
    const data = await res.json();
    const officers = (data?.items || []) as Array<{
      name: string; officer_role: string; resigned_on?: string; appointed_on?: string;
    }>;

    // Serving directors only, longest-serving first — that's the person
    // most likely to actually run the clinic.
    const active = officers
      .filter(o => !o.resigned_on && /director|member|partner/i.test(o.officer_role || ''))
      .sort((a, b) => (a.appointed_on || '').localeCompare(b.appointed_on || ''));
    if (active.length === 0) return null;

    // Companies House returns "SMITH, John Peter" — flip to "John Peter Smith".
    const raw = active[0].name;
    const [surname, forenames] = raw.split(',').map(s => s.trim());
    const name = forenames ? `${forenames} ${surname}` : raw;

    return {
      owner_name: titleCase(name),
      owner_role: prettyRole(active[0].officer_role),
      owner_source: 'companies_house',
      // A sole serving director is the owner. With several, we have the
      // right company but not necessarily the right person to ask for.
      owner_confidence: active.length === 1 ? 'high' : 'medium',
    };
  } catch {
    return null;
  }
}

function titleCase(s: string): string {
  return s.toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase()).replace(/\bMc([a-z])/g, (_, c) => `Mc${c.toUpperCase()}`);
}

function prettyRole(role: string): string {
  return role.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// ─── 2. Website about/team page harvest ──────────────────────

const TEAM_PATH_HINTS = [
  'about', 'about-us', 'aboutus', 'our-team', 'team', 'meet-the-team',
  'meet-our-team', 'our-story', 'staff', 'practitioners', 'clinicians',
  'who-we-are', 'founder', 'doctors', 'contact', 'contact-us',
];

/** Pull same-origin links whose path looks like an about/team page. */
function teamPageLinks(html: string, baseUrl: string): string[] {
  const out = new Set<string>();
  let base: URL;
  try { base = new URL(baseUrl); } catch { return []; }

  const hrefRe = /href\s*=\s*["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = hrefRe.exec(html)) !== null) {
    const href = m[1];
    if (href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('#')) continue;
    let abs: URL;
    try { abs = new URL(href, base); } catch { continue; }
    if (abs.hostname.replace(/^www\./, '') !== base.hostname.replace(/^www\./, '')) continue;
    const path = abs.pathname.toLowerCase().replace(/\/$/, '');
    const seg = path.split('/').filter(Boolean).pop() || '';
    if (TEAM_PATH_HINTS.some(h => seg === h || seg.includes(h))) {
      abs.hash = '';
      out.add(abs.toString());
    }
  }
  return Array.from(out).slice(0, 3);
}

/** Strip markup to readable text and keep it small enough to be cheap. */
function htmlToText(html: string, cap = 6000): string {
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#?\w+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text.slice(0, cap);
}

/**
 * Words that are capitalised on a web page but are never part of a person's
 * name. Without this, "Meet Our Founder" matches the owner pattern and the
 * caller ends up asking the receptionist for someone called "Meet Our".
 */
const NOT_NAME_WORDS = new Set([
  'meet', 'our', 'the', 'about', 'welcome', 'contact', 'book', 'read', 'learn',
  'view', 'home', 'why', 'what', 'who', 'how', 'more', 'get', 'find', 'new',
  'all', 'your', 'my', 'we', 'us', 'team', 'clinic', 'studio', 'salon', 'centre',
  'center', 'aesthetics', 'aesthetic', 'beauty', 'skin', 'laser', 'medical',
  'treatment', 'treatments', 'service', 'services', 'price', 'prices',
  'follow', 'call', 'email', 'visit', 'see', 'click', 'here', 'now', 'today',
  'privacy', 'terms', 'cookie', 'cookies', 'policy', 'copyright', 'reserved',
  'limited', 'ltd', 'company', 'registered', 'england', 'wales', 'scotland',
]);

/** A plausible personal name: 2-3 words, none of them page furniture. */
function looksLikePersonName(raw: string): boolean {
  const cleaned = raw.trim().replace(/^(dr|doctor|mr|mrs|ms|miss|prof)\.?\s+/i, '');
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length < 2 || words.length > 3) return false;
  return words.every(w => {
    const bare = w.toLowerCase().replace(/[^a-z'-]/g, '');
    if (bare.length < 2) return false;
    if (NOT_NAME_WORDS.has(bare)) return false;
    return /^[A-Z]/.test(w);
  });
}

/**
 * Regex pass for the unambiguous case — "Founded by Dr Sarah Whitfield",
 * "Owner: James Hart". Cheap, and where it fires it beats the model.
 */
function regexOwner(text: string): OwnerHit | null {
  const NAME = '((?:Dr\\.?|Doctor|Mr\\.?|Mrs\\.?|Ms\\.?)?\\s*[A-Z][a-z]{1,20}(?:\\s+[A-Z][a-z\'\\-]{1,20}){1,2})';
  const patterns: Array<{ re: RegExp; role: string }> = [
    { re: new RegExp(`(?:founded|established|created|started)\\s+by\\s+${NAME}`, 'i'), role: 'Founder' },
    { re: new RegExp(`${NAME}\\s*,?\\s*(?:is\\s+the\\s+)?(?:founder|owner|managing director|clinic director)`, 'i'), role: 'Founder' },
    { re: new RegExp(`(?:owner|founder|managing director|clinic director|practice manager)\\s*[:\\-–]\\s*${NAME}`, 'i'), role: 'Owner' },
  ];
  for (const p of patterns) {
    const m = text.match(p.re);
    if (m && m[1]) {
      const name = m[1].trim().replace(/\s+/g, ' ');
      if (looksLikePersonName(name)) {
        return { owner_name: name, owner_role: p.role, owner_source: 'website', owner_confidence: 'high' };
      }
    }
  }
  return null;
}

// ─── 3. AI read of the harvested page text ───────────────────

interface AiOwnerResult {
  found: boolean;
  name: string | null;
  role: string | null;
  confidence: 'high' | 'medium' | 'low';
  evidence: string | null;
  alternatives: Array<{ name: string; role: string | null }>;
}

const OWNER_SCHEMA = {
  type: 'object' as const,
  properties: {
    found: { type: 'boolean' as const, description: 'True only if a specific named person is stated on the page.' },
    name: { type: ['string', 'null'] as const, description: 'Full name as written, without titles like Dr/Mr.' },
    role: { type: ['string', 'null'] as const, description: 'Their stated role, e.g. Founder, Clinic Director, Owner.' },
    confidence: {
      type: 'string' as const, enum: ['high', 'medium', 'low'],
      description: 'high = page explicitly calls them owner/founder/director. medium = clearly the lead practitioner but ownership not stated. low = a name appears but their standing is unclear.',
    },
    evidence: { type: ['string', 'null'] as const, description: 'The short phrase from the page that supports this, quoted verbatim.' },
    alternatives: {
      type: 'array' as const,
      description: 'Other named people at the business, most senior first.',
      items: {
        type: 'object' as const,
        properties: { name: { type: 'string' as const }, role: { type: ['string', 'null'] as const } },
        required: ['name', 'role'], additionalProperties: false,
      },
    },
  },
  required: ['found', 'name', 'role', 'confidence', 'evidence', 'alternatives'],
  additionalProperties: false,
};

async function aiExtractOwner(
  client: Anthropic,
  businessName: string,
  pageText: string,
): Promise<AiOwnerResult | null> {
  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 1000,
      system:
        'You identify the owner or principal decision-maker of a small business from text scraped off their own website, ' +
        'so a salesperson knows who to ask for when they ring.\n\n' +
        'Rules:\n' +
        '- Only report a person actually named in the text. Never infer a name from the business name, a domain, or an email address.\n' +
        '- "Smile Clinic by Sarah" does NOT establish that a person named Sarah exists on the page.\n' +
        '- Ignore names of clients, testimonial authors, review writers, brand ambassadors, and product or device names.\n' +
        '- Prefer whoever the page presents as owner, founder, managing director or clinic director over an employed practitioner.\n' +
        '- If nobody is clearly named, set found=false. Returning nothing is correct and useful; a wrong name is worse than none.',
      messages: [{
        role: 'user',
        content: `Business: ${businessName}\n\nWebsite text:\n"""\n${pageText}\n"""\n\nWho owns or runs this business?`,
      }],
      output_config: { format: { type: 'json_schema', schema: OWNER_SCHEMA } },
    });

    const block = response.content.find(b => b.type === 'text');
    if (!block || block.type !== 'text') return null;
    return JSON.parse(block.text) as AiOwnerResult;
  } catch (err) {
    console.error('[enrich-owner] AI extraction failed:', err instanceof Error ? err.message : err);
    return null;
  }
}

// ─── Per-lead pipeline ───────────────────────────────────────

interface LeadRow {
  id: string;
  business_name: string;
  website: string | null;
  country_code: string | null;
}

interface EnrichResult {
  lead_id: string;
  business_name: string;
  owner_name: string | null;
  owner_role: string | null;
  owner_source: string | null;
  owner_confidence: string | null;
  reason?: string;
}

async function enrichOne(client: Anthropic | null, lead: LeadRow, chNumber: string | null): Promise<EnrichResult> {
  const base: EnrichResult = {
    lead_id: lead.id,
    business_name: lead.business_name,
    owner_name: null, owner_role: null, owner_source: null, owner_confidence: null,
  };
  const candidates: Array<{ name: string; role: string | null; source: string }> = [];
  let hit: OwnerHit | null = null;

  // 1 — UK registry
  if (lead.country_code === 'GB') {
    hit = await companiesHouseOfficers(lead.business_name, chNumber);
  }

  // 2 + 3 — their own website
  if ((!hit || hit.owner_confidence !== 'high') && lead.website) {
    const home = await fetchPage(lead.website, 8000);
    if (home.ok) {
      let text = htmlToText(home.html, 4000);

      // Follow up to 3 about/team pages — that's where names live.
      const links = teamPageLinks(home.html, home.final_url || lead.website);
      const pages = await Promise.all(links.map(l => fetchPage(l, 7000)));
      for (const p of pages) {
        if (p.ok) text += '\n\n' + htmlToText(p.html, 4000);
      }
      text = text.slice(0, 14000);

      const rx = regexOwner(text);
      if (rx && !hit) hit = rx;

      if ((!hit || hit.owner_confidence !== 'high') && client && text.length > 200) {
        const ai = await aiExtractOwner(client, lead.business_name, text);
        // The model can surface page furniture too — hold it to the same bar.
        if (ai?.found && ai.name && looksLikePersonName(ai.name)) {
          for (const alt of ai.alternatives || []) {
            candidates.push({ name: alt.name, role: alt.role, source: 'website' });
          }
          const aiHit: OwnerHit = {
            owner_name: ai.name,
            owner_role: ai.role,
            // The model read it off their own page, so credit the page as the
            // source when it quoted supporting text; otherwise mark inference.
            owner_source: ai.evidence ? 'website' : 'ai_inference',
            owner_confidence: ai.confidence,
          };
          // Keep a registry name over an AI name at equal confidence.
          if (!hit || rank(aiHit.owner_confidence) > rank(hit.owner_confidence)) hit = aiHit;
        }
      }
    } else {
      base.reason = `site unreachable (${home.error || 'fetch failed'})`;
    }
  } else if (!lead.website && !hit) {
    base.reason = 'no website on file';
  }

  if (!hit) {
    await supabase.from('leads').update({ owner_enriched_at: new Date().toISOString() }).eq('id', lead.id);
    return { ...base, reason: base.reason || 'no name found on any source' };
  }

  const firstName = hit.owner_name.trim().replace(/^(dr|mr|mrs|ms|miss|prof)\.?\s+/i, '').split(/\s+/)[0];

  await supabase.from('leads').update({
    owner_name: hit.owner_name,
    owner_first_name: firstName || null,
    owner_role: hit.owner_role,
    owner_source: hit.owner_source,
    owner_confidence: hit.owner_confidence,
    owner_enriched_at: new Date().toISOString(),
    owner_candidates: candidates,
  }).eq('id', lead.id);

  return { ...base, ...hit };
}

function rank(c: string): number {
  return c === 'high' ? 3 : c === 'medium' ? 2 : 1;
}

/** Run `worker` over `items` with a fixed number of parallel slots. */
async function pool<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (cursor < items.length) {
        const i = cursor++;
        try {
          results[i] = await worker(items[i]);
        } catch (err) {
          console.error('[enrich-owner] lead failed:', err instanceof Error ? err.message : err);
        }
      }
    }),
  );
  return results.filter(Boolean);
}

// ─── Route ───────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const auth = await authOr401();
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await request.json();
    const leadIds: string[] = Array.isArray(body.lead_ids) ? body.lead_ids : [];
    // Guard the batch size — each lead costs 1-4 site fetches plus a model call.
    const limit = Math.min(Number(body.limit) || 50, 150);
    const force = body.force === true;

    let query = supabase
      .from('leads')
      .select('id, business_name, website, country_code')
      .limit(limit);

    if (leadIds.length > 0) {
      query = query.in('id', leadIds.slice(0, limit));
    } else {
      // No explicit list — take the best un-enriched leads that have a phone.
      query = query
        .not('phone', 'is', null)
        .eq('do_not_call', false)
        .is('owner_enriched_at', null)
        .order('lead_score', { ascending: false, nullsFirst: false });
    }
    if (!force && leadIds.length > 0) {
      query = query.is('owner_name', null);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    const leads = (data || []) as LeadRow[];
    if (leads.length === 0) {
      return NextResponse.json({ success: true, enriched: 0, results: [], message: 'Nothing to enrich — those leads already have an owner on file.' });
    }

    // Reuse any company number a previous Hunt run already resolved.
    const { data: he } = await supabase
      .from('hunt_enrichment')
      .select('lead_id, companies_house_number')
      .in('lead_id', leads.map(l => l.id));
    const chMap = new Map<string, string | null>(
      (he || []).map((r: { lead_id: string; companies_house_number: string | null }) => [r.lead_id, r.companies_house_number]),
    );

    const apiKey = process.env.ANTHROPIC_API_KEY;
    const client = apiKey ? new Anthropic({ apiKey }) : null;
    if (!client) {
      console.warn('[enrich-owner] ANTHROPIC_API_KEY not set — registry and regex sources only.');
    }

    const results = await pool(leads, CONCURRENCY, l => enrichOne(client, l, chMap.get(l.id) ?? null));
    const found = results.filter(r => r.owner_name);

    return NextResponse.json({
      success: true,
      processed: results.length,
      enriched: found.length,
      by_source: found.reduce<Record<string, number>>((acc, r) => {
        const k = r.owner_source || 'unknown';
        acc[k] = (acc[k] || 0) + 1;
        return acc;
      }, {}),
      ai_available: !!client,
      results,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Owner enrichment failed';
    console.error('[enrich-owner]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
