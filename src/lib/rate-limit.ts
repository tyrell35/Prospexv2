/**
 * Simple in-memory rate limiter for API routes.
 * Tracks requests per IP with a sliding window.
 *
 * Usage in an API route:
 *   import { rateLimit } from '@/lib/rate-limit';
 *   const limiter = rateLimit({ interval: 60_000, uniqueTokenPerInterval: 500 });
 *
 *   export async function POST(req: NextRequest) {
 *     const ip = req.headers.get('x-forwarded-for') || 'unknown';
 *     const { success } = await limiter.check(10, ip); // 10 requests per interval
 *     if (!success) return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
 *     // ... handle request
 *   }
 */

interface RateLimitOptions {
  interval: number; // Time window in ms
  uniqueTokenPerInterval: number; // Max unique tokens (IPs) to track
}

interface TokenBucket {
  count: number;
  expiresAt: number;
}

export function rateLimit(options: RateLimitOptions) {
  const tokenCache = new Map<string, TokenBucket>();

  // Periodically clean expired entries
  const cleanup = () => {
    const now = Date.now();
    for (const [key, bucket] of tokenCache) {
      if (bucket.expiresAt < now) {
        tokenCache.delete(key);
      }
    }
  };

  return {
    check: async (limit: number, token: string): Promise<{ success: boolean; remaining: number }> => {
      const now = Date.now();

      // Cleanup if cache is too large
      if (tokenCache.size > options.uniqueTokenPerInterval) {
        cleanup();
      }

      const bucket = tokenCache.get(token);

      if (!bucket || bucket.expiresAt < now) {
        // New window
        tokenCache.set(token, { count: 1, expiresAt: now + options.interval });
        return { success: true, remaining: limit - 1 };
      }

      if (bucket.count >= limit) {
        return { success: false, remaining: 0 };
      }

      bucket.count += 1;
      return { success: true, remaining: limit - bucket.count };
    },
  };
}
