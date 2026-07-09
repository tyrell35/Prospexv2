import { createBrowserClient } from '@supabase/ssr';

// Browser-side Supabase client. Uses @supabase/ssr's createBrowserClient which
// stores the session in cookies (name: sb-<project-ref>-auth-token). This is
// what makes /api/* routes protected with authOr401() actually see the user's
// session — the server-side helper (src/lib/api-auth.ts) reads the same cookie
// via createServerClient.
//
// If you switch this back to plain createClient() from @supabase/supabase-js,
// every browser-initiated POST to a protected route will 401 because that
// version stores the session in localStorage, which the server cannot read.

export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);
