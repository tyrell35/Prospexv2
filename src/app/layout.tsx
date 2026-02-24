import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import AppShell from '@/components/AppShell';

export const metadata: Metadata = {
  title: 'Prospex — Precision Prospecting',
  description: 'B2B Lead Generation Platform for SMMA Agencies.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-prospex-bg">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
