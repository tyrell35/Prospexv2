import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Routes that Vercel crons call — authenticated via CRON_SECRET header
const CRON_ROUTES = [
  '/api/scan-areas',
  '/api/slack-daily-brief',
  '/api/dm-campaigns',
  '/api/follow-ups',
];

// Webhook routes — authenticated via their own signature verification
const WEBHOOK_ROUTES = [
  '/api/webhook/new-lead',
  '/api/webhook/playbook-ready',
  '/api/instagram-webhook',
  '/api/reply-detected',
];

// Public routes that don't need auth
const PUBLIC_ROUTES = [
  '/',
  '/login',
  '/signup',
  '/reset-password',
];

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const pathname = req.nextUrl.pathname;

  // Skip auth for public pages
  if (PUBLIC_ROUTES.some(route => pathname === route)) {
    return res;
  }

  // Skip auth for Next.js internals and static files
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname.includes('.')
  ) {
    return res;
  }

  // ─── CRON ROUTES: verify CRON_SECRET ───────────────────────
  if (pathname.startsWith('/api/') && CRON_ROUTES.some(r => pathname.startsWith(r))) {
    const authHeader = req.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    // Allow if valid session OR valid cron secret
    if (authHeader === `Bearer ${cronSecret}` && cronSecret) {
      return res;
    }
    // Also check Vercel's cron verification header
    const vercelCron = req.headers.get('x-vercel-cron');
    if (vercelCron) {
      return res;
    }
    // Fall through to session check below
  }

  // ─── WEBHOOK ROUTES: allow through (they verify their own signatures) ──
  if (WEBHOOK_ROUTES.some(r => pathname.startsWith(r))) {
    return res;
  }

  // ─── ALL OTHER API ROUTES: require Supabase session ────────
  if (pathname.startsWith('/api/')) {
    const supabase = createMiddlewareClient({ req, res });
    const { data: { session } } = await supabase.auth.getSession();

    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    return res;
  }

  // ─── ALL OTHER PAGES: require session, redirect to login ───
  const supabase = createMiddlewareClient({ req, res });
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    const redirectUrl = new URL('/login', req.url);
    redirectUrl.searchParams.set('redirectTo', pathname);
    return NextResponse.redirect(redirectUrl);
  }

  return res;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico (favicon)
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
