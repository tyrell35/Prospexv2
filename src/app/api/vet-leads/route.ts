import { NextRequest, NextResponse } from 'next/server';

import { supabaseAdmin as supabase } from '@/lib/supabase-admin';
import { authOr401 } from '@/lib/api-auth';
import { scoreReachability, type ReachInput } from '@/lib/reachability';

export const maxDuration = 300;

// ═══════════════════════════════════════════════════════════════
// LEAD VETTING — score reachability, and check Instagram is alive
//
// Two modes:
//
//   score   free and instant. Recomputes reachability from data we
//           already hold (reviews, website, channels). Run it across
//           the whole database first — it costs nothing and separates
//           "no way to reach them" from "worth checking properly".
//
//   ig      paid. Puts handles through the Apify Instagram actor to
//           get followers, post count and — the signal that actually
//           matters — the date of the most recent post.
//
// Instagram serves a login wall to unauthenticated fetches, so
// reading og:description off the profile page no longer returns
// anything. Apify is the only path that still works here.
// ═══════════════════════════════════════════════════════════════

const VET_COLS =
  'id, business_name, instagram_handle, instagram_url, phone, email, website, ' +
  'google_rating, google_review_count, ig_exists, ig_followers, ig_posts, ' +
  'ig_last_post_at, ig_is_private, ig_checked_at';

interface VetLead {
  id: string;
  business_name: string;
  instagram_handle: string | null;
  instagram_url: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  google_rating: number | null;
  google_review_count: number | null;
  ig_exists: boolean | null;
  ig_followers: number | null;
  ig_posts: number | null;
  ig_last_post_at: string | null;
  ig_is_private: boolean | null;
  ig_checked_at: string | null;
}

/** instagram_url is set on 8,285 leads but only 5,623 have a parsed handle. */
function handleOf(lead: VetLead): string | null {
  if (lead.instagram_handle) return lead.instagram_handle.replace(/^@/, '').toLowerCase();
  if (!lead.instagram_url) return null;
  const m = lead.instagram_url.match(/instagram\.com\/([A-Za-z0-9_.]{1,30})/i);
  const h = m?.[1]?.toLowerCase();
  if (!h) return null;
  const RESERVED = new Set(['explore', 'accounts', 'p', 'reel', 'reels', 'stories', 'direct', 'invites']);
  return RESERVED.has(h) ? null : h;
}

interface ApifyProfile {
  username?: string;
  followersCount?: number;
  followsCount?: number;
  postsCount?: number;
  biography?: string;
  private?: boolean;
  isBusinessAccount?: boolean;
  latestPosts?: Array<{ timestamp?: string; takenAt?: string }>;
  error?: string;
  errorDescription?: string;
}

/** Newest timestamp across the returned posts. */
function latestPostAt(p: ApifyProfile): string | null {
  const stamps = (p.latestPosts || [])
    .map(x => x.timestamp || x.takenAt)
    .filter((s): s is string => !!s)
    .map(s => new Date(s).getTime())
    .filter(n => !Number.isNaN(n));
  if (stamps.length === 0) return null;
  return new Date(Math.max(...stamps)).toISOString();
}

async function runApify(urls: string[], apifyKey: string): Promise<ApifyProfile[]> {
  const runRes = await fetch(`https://api.apify.com/v2/acts/apify~instagram-scraper/runs?token=${apifyKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      directUrls: urls,
      resultsType: 'details',
      resultsLimit: urls.length,
      addParentData: false,
    }),
    signal: AbortSignal.timeout(60000),
  });
  if (!runRes.ok) throw new Error(`Apify run failed (HTTP ${runRes.status}): ${(await runRes.text()).slice(0, 200)}`);

  const runId = (await runRes.json())?.data?.id;
  if (!runId) throw new Error('Apify returned no run id');

  // Poll to completion — a details run on ~50 profiles is usually well
  // under two minutes.
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 3000));
    const st = await fetch(`https://api.apify.com/v2/actor-runs/${runId}?token=${apifyKey}`);
    const status = (await st.json())?.data?.status;
    if (status === 'SUCCEEDED') break;
    if (status === 'FAILED' || status === 'ABORTED' || status === 'TIMED-OUT') {
      throw new Error(`Apify run ${status}`);
    }
  }

  const res = await fetch(`https://api.apify.com/v2/actor-runs/${runId}/dataset/items?token=${apifyKey}`);
  const items = await res.json();
  return Array.isArray(items) ? items as ApifyProfile[] : [];
}

export async function POST(request: NextRequest) {
  const auth = await authOr401();
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await request.json();
    const mode: 'score' | 'ig' = body.mode === 'ig' ? 'ig' : 'score';
    const leadIds: string[] = Array.isArray(body.lead_ids) ? body.lead_ids : [];
    // Apify is billed per profile, so the paid mode is capped far lower.
    const limit = Math.min(Number(body.limit) || (mode === 'ig' ? 50 : 2000), mode === 'ig' ? 50 : 5000);

    let q = supabase.from('leads').select(VET_COLS).limit(limit);
    if (leadIds.length > 0) {
      q = q.in('id', leadIds.slice(0, limit));
    } else if (mode === 'ig') {
      // Never checked, and there is something to check.
      q = q.is('ig_checked_at', null).not('instagram_url', 'is', null)
           .order('lead_score', { ascending: false, nullsFirst: false });
    } else {
      q = q.is('vetted_at', null).order('lead_score', { ascending: false, nullsFirst: false });
    }

    const { data, error } = await q;
    if (error) throw new Error(error.message);
    // Cast through unknown: the column list is a const, so PostgREST's
    // generic inference cannot narrow it to VetLead on its own.
    const leads = (data || []) as unknown as VetLead[];
    if (leads.length === 0) {
      return NextResponse.json({ success: true, processed: 0, message: 'Nothing left to vet with those filters.' });
    }

    // ─── Website reachability we already know, for the fallback score ───
    const { data: he } = await supabase
      .from('hunt_enrichment').select('lead_id, fetch_ok')
      .in('lead_id', leads.map(l => l.id));
    const siteOk = new Map<string, boolean | null>(
      (he || []).map((r: { lead_id: string; fetch_ok: boolean | null }) => [r.lead_id, r.fetch_ok]),
    );

    // ─── Paid pass: ask Apify what is actually on those profiles ───
    const igData = new Map<string, Partial<VetLead>>();
    let apifyRan = false;
    let apifySample: ApifyProfile | null = null;

    if (mode === 'ig') {
      const apifyKey = process.env.APIFY_API_KEY || process.env.APIFY_API_TOKEN;
      if (!apifyKey) {
        return NextResponse.json({
          error: 'No Apify key configured. Set APIFY_API_KEY in Vercel. ' +
                 'Note the codebase reads APIFY_API_KEY in one place and APIFY_API_TOKEN in another — set both to be safe.',
        }, { status: 400 });
      }

      const withHandles = leads
        .map(l => ({ lead: l, handle: handleOf(l) }))
        .filter((x): x is { lead: VetLead; handle: string } => !!x.handle);

      if (withHandles.length === 0) {
        return NextResponse.json({ success: true, processed: 0, message: 'None of those leads have a usable Instagram handle.' });
      }

      const profiles = await runApify(
        withHandles.map(x => `https://www.instagram.com/${x.handle}/`),
        apifyKey,
      );
      apifyRan = true;
      apifySample = profiles[0] || null;

      const byUser = new Map(
        profiles.filter(p => p.username).map(p => [p.username!.toLowerCase(), p]),
      );

      const now = new Date().toISOString();
      for (const { lead, handle } of withHandles) {
        const p = byUser.get(handle);
        if (!p || p.error) {
          // Absent from the results means the handle did not resolve.
          igData.set(lead.id, {
            ig_exists: false, ig_checked_at: now,
            ig_check_error: p?.errorDescription || p?.error || 'Profile not returned by Apify',
          } as Partial<VetLead>);
          continue;
        }
        igData.set(lead.id, {
          ig_exists: true,
          ig_followers: p.followersCount ?? null,
          ig_following: p.followsCount ?? null,
          ig_posts: p.postsCount ?? null,
          ig_last_post_at: latestPostAt(p),
          ig_is_private: p.private ?? null,
          ig_is_business: p.isBusinessAccount ?? null,
          ig_bio: (p.biography || '').slice(0, 500) || null,
          ig_checked_at: now,
          ig_check_error: null,
        } as Partial<VetLead>);
      }
    }

    // ─── Score and persist ───
    const bands: Record<string, number> = {};
    const nowIso = new Date().toISOString();

    for (const lead of leads) {
      const ig = igData.get(lead.id) || {};
      const merged = { ...lead, ...ig } as VetLead & Partial<VetLead>;

      const input: ReachInput = {
        ig_exists: merged.ig_exists,
        ig_followers: merged.ig_followers,
        ig_posts: merged.ig_posts,
        ig_last_post_at: merged.ig_last_post_at,
        ig_is_private: merged.ig_is_private,
        ig_checked_at: merged.ig_checked_at,
        google_review_count: lead.google_review_count,
        google_rating: lead.google_rating,
        phone: lead.phone,
        email: lead.email,
        website: lead.website,
        site_ok: siteOk.get(lead.id) ?? null,
      };
      const { score, band } = scoreReachability(input);
      bands[band] = (bands[band] || 0) + 1;

      await supabase.from('leads').update({
        ...ig,
        reachability_score: score,
        reachability_band: band,
        vetted_at: nowIso,
        // Backfill the parsed handle — 2,662 leads have an IG url but no handle.
        ...(handleOf(lead) && !lead.instagram_handle ? { instagram_handle: handleOf(lead) } : {}),
      }).eq('id', lead.id);
    }

    return NextResponse.json({
      success: true,
      mode,
      processed: leads.length,
      apify_ran: apifyRan,
      bands,
      // First run returns one raw profile so the Apify field names can be
      // confirmed against what this route expects.
      apify_sample: apifySample ? Object.keys(apifySample) : null,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Vetting failed';
    console.error('[vet-leads]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
