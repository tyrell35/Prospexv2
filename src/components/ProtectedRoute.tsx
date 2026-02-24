'use client';

import { useAuth } from '@/lib/auth-context';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { Loader2 } from 'lucide-react';

const PUBLIC_PATHS = ['/login'];

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !user && !PUBLIC_PATHS.includes(pathname)) {
      router.replace('/login');
    }
    if (!loading && user && pathname === '/login') {
      router.replace('/');
    }
  }, [user, loading, pathname, router]);

  if (loading) {
    return (
      <div className="min-h-screen bg-prospex-bg flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 text-prospex-cyan animate-spin mx-auto mb-3" />
          <p className="text-sm text-prospex-muted font-mono">Loading Prospex...</p>
        </div>
      </div>
    );
  }

  // Public paths don't need auth
  if (PUBLIC_PATHS.includes(pathname)) {
    return <>{children}</>;
  }

  // Not logged in — show nothing (redirect will happen)
  if (!user) {
    return null;
  }

  return <>{children}</>;
}
