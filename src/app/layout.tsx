import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import Sidebar from '@/components/layout/Sidebar';
import LayoutWrapper from '@/components/layout/LayoutWrapper';

export const metadata: Metadata = {
  title: 'Prospex — Precision Prospecting',
  description: 'B2B Lead Generation Platform for SMMA Agencies.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-prospex-bg">
        <Sidebar />
        <LayoutWrapper>{children}</LayoutWrapper>
      </body>
    </html>
  );
}
