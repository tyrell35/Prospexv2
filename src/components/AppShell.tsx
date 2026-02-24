'use client';

import { AuthProvider, useAuth } from '@/lib/auth-context';
import ProtectedRoute from '@/components/ProtectedRoute';
import Sidebar from '@/components/layout/Sidebar';
import LayoutWrapper from '@/components/layout/LayoutWrapper';
import { usePathname } from 'next/navigation';

function AppContent({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const pathname = usePathname();
  const isLoginPage = pathname === '/login';
  const showSidebar = !loading && user && !isLoginPage;

  return (
    <ProtectedRoute>
      {showSidebar && <Sidebar />}
      {isLoginPage ? (
        <>{children}</>
      ) : (
        <LayoutWrapper>{children}</LayoutWrapper>
      )}
    </ProtectedRoute>
  );
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <AppContent>{children}</AppContent>
    </AuthProvider>
  );
}
