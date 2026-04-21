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
    <main className="md:ml-64 min-h-screen grid-pattern">
      <div className="p-4 pt-[72px] md:p-6 md:pt-6">{children}</div>
    </main>
  );
}
