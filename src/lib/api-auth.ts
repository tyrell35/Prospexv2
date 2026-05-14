import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import type { User } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/lib/supabase-admin';

// ─── Authenticated user gate (for browser-driven API routes) ────────
// Reads the Supabase auth cookie set by @supabase/ssr on sign-in and
// returns the user, or null if no valid session. The cookie is HTTP-only,
// signed by Supabase Auth, and tied to the project — can't be forged.

export async function requireAuth(): Promise<User | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  if (!url || !anon) return null;

  const cookieStore = await cookies();
  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll: () => cookieStore.getAll().map(c => ({ name: c.name, value: c.value })),
      setAll: () => {}, // no-op — API routes don't set cookies
    },
  });

  try {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data?.user) return null;
    return data.user;
  } catch {
    return null;
  }
}

// Convenience: returns either the user, or a 401 NextResponse to short-circuit
// with. Use at the top of any user-only POST/GET handler:
//
//   const auth = await authOr401();
//   if (auth instanceof NextResponse) return auth;
//   const user = auth;

export async function authOr401(): Promise<User | NextResponse> {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  return user;
}

// ─── Admin gate ──────────────────────────────────────────────────────
// Resolves the user's team_members row and verifies they are an owner
// or admin. Returns the row, or a 403 NextResponse to short-circuit.

interface TeamMemberRow {
  id: string;
  user_id: string;
  email: string;
  role: 'owner' | 'admin' | 'member';
}

export async function adminOr403(user: User): Promise<TeamMemberRow | NextResponse> {
  const { data, error } = await supabaseAdmin
    .from('team_members')
    .select('id, user_id, email, role')
    .eq('user_id', user.id)
    .maybeSingle();
  if (error || !data) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const row = data as TeamMemberRow;
  if (row.role !== 'owner' && row.role !== 'admin') {
    return NextResponse.json({ error: 'forbidden — admin required' }, { status: 403 });
  }
  return row;
}

// ─── Webhook secret gate (for external POSTs from third-party tools) ─
// Checks an `x-webhook-secret` header against the env var named by
// `envVarName`. If the env var is unset, the webhook is left OPEN with a
// loud warning so initial integrations can be plumbed without a chicken-
// and-egg problem — but production deploys MUST set the secret.

export function verifyWebhookSecret(request: NextRequest, envVarName: string): NextResponse | null {
  const expected = process.env[envVarName];
  if (!expected) {
    console.warn(
      `[security] ${envVarName} is not set — webhook is unauthenticated. ` +
      `Add it to Vercel env vars and configure the same value on the sender side.`
    );
    return null; // open
  }
  const provided = request.headers.get('x-webhook-secret') || '';
  if (provided !== expected) {
    return NextResponse.json({ error: 'invalid webhook secret' }, { status: 401 });
  }
  return null; // valid
}
