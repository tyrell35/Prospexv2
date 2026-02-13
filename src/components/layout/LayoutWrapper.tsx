'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

export default function LayoutWrapper({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isPitchPage = pathname.startsWith('/pitch/') && pathname !== '/pitch';

  if (isPitchPage) {
    return <main className="min-h-screen">{children}</main>;
  }

  return (
    <main className="ml-64 min-h-screen grid-pattern">
      <div className="p-6">{children}</div>
    </main>
  );
}
