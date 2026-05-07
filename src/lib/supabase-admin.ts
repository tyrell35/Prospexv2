import { createClient } from '@supabase/supabase-js';

// Server-side Supabase client. Uses the service-role key, which bypasses RLS.
// NEVER import this from anywhere under /app that renders on the client.
// Only safe to use from /app/api/*/route.ts and other server-only modules.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!url || !serviceKey) {
  // Don't crash at import time — Next.js evaluates these during build, and we
  // want graceful failure with a clear error from the route instead.
  console.warn(
    '[supabase-admin] SUPABASE_SERVICE_ROLE_KEY is not configured. ' +
    'Server-side Supabase queries will fail under RLS. Set the env var in Vercel.'
  );
}

export const supabaseAdmin = createClient(url, serviceKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});
