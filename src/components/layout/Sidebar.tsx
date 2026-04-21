'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Crosshair, Search, Camera, Database, History, GraduationCap, MessageCircle, Bot, Users, Mail, Inbox, BarChart3, Send, Shield, Settings, Menu, X } from 'lucide-react';
import { cn } from '@/lib/utils';

const navigation = [
  { name: 'Lead Scraping', href: '/city-scraper', icon: Search },
  { name: 'Instagram Scraper', href: '/instagram-scrape', icon: Camera },
  { name: 'Lead Database', href: '/leads', icon: Database },
  { name: 'Scrape History', href: '/scrape-history', icon: History },
  { name: 'Market Analysis', href: '/market-analysis', icon: BarChart3 },
  { name: 'Deep Audit / Pitch', href: '/pitch', icon: Shield },
  { name: 'Outreach Pipeline', href: '/outreach-pipeline', icon: Send },
  { name: 'Outreach Coach', href: '/outreach-coach', icon: GraduationCap },
  { name: 'Conversations', href: '/conversations', icon: MessageCircle },
  { name: 'AI Agent', href: '/ai-agent', icon: Bot },
  { name: 'Team', href: '/team', icon: Users },
  { name: 'Settings', href: '/settings', icon: Settings },
];

const comingSoon = [
  { label: 'Email Campaigns', icon: Mail },
  { label: 'Email Accounts', icon: Inbox },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileOpen(false);
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, []);

  if (pathname.startsWith('/pitch/') && pathname !== '/pitch') return null;

  const navContent = (
    <>
      <div className="p-4 md:p-5 border-b border-prospex-border">
        <Link href="/" className="flex items-center gap-3">
          <div className="w-8 h-8 md:w-9 md:h-9 rounded-lg bg-prospex-cyan/20 border border-prospex-cyan/40 flex items-center justify-center">
            <Crosshair className="w-4 h-4 md:w-5 md:h-5 text-prospex-cyan" />
          </div>
          <div>
            <h1 className="font-mono font-bold text-sm md:text-base text-prospex-text tracking-tight">PROSPEX</h1>
            <p className="text-[9px] md:text-[10px] text-prospex-dim font-mono tracking-widest uppercase">Find. Score. Close.</p>
          </div>
        </Link>
      </div>

      <nav className="flex-1 p-2 md:p-3 space-y-0.5 md:space-y-1 overflow-y-auto">
        {navigation.map((item) => {
          const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
          return (
            <Link key={item.name} href={item.href}
              className={cn('flex items-center gap-3 px-3 py-2 md:py-2.5 rounded-lg text-sm font-medium transition-all duration-200',
                isActive ? 'bg-prospex-cyan/10 text-prospex-cyan border border-prospex-cyan/20 shadow-glow-cyan' : 'text-prospex-muted hover:text-prospex-text hover:bg-prospex-bg border border-transparent')}>
              <item.icon className={cn('w-4 h-4', isActive ? 'text-prospex-cyan' : 'text-prospex-dim')} />
              <span className="font-mono text-xs tracking-wide">{item.name}</span>
            </Link>
          );
        })}

        <div className="px-4 pt-4 md:pt-6 pb-1">
          <p className="text-[9px] font-mono text-prospex-dim uppercase tracking-wider">Coming Soon</p>
        </div>
        {comingSoon.map((item) => (
          <div key={item.label} className="flex items-center gap-3 px-4 py-2 opacity-30 cursor-default select-none" title="Coming Soon">
            <item.icon className="w-4 h-4 text-prospex-dim" />
            <span className="text-sm text-prospex-dim">{item.label}</span>
            <span className="text-[8px] ml-auto bg-prospex-surface/50 px-1.5 py-0.5 rounded text-prospex-dim font-mono">Soon</span>
          </div>
        ))}
      </nav>

      <div className="p-3 md:p-4 border-t border-prospex-border">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-prospex-green animate-pulse-slow" />
          <span className="text-[10px] font-mono text-prospex-dim">SYSTEM ONLINE</span>
        </div>
        <p className="text-[10px] font-mono text-prospex-dim mt-1">Prospex v3.6 Elite</p>
      </div>
    </>
  );

  return (
    <>
      {/* Mobile header bar */}
      <div className="md:hidden fixed top-0 left-0 right-0 h-14 bg-prospex-surface border-b border-prospex-border z-40 flex items-center justify-between px-4">
        <button onClick={() => setMobileOpen(true)} className="p-1.5 rounded-lg hover:bg-prospex-bg" aria-label="Open menu">
          <Menu className="w-5 h-5 text-prospex-text" />
        </button>
        <Link href="/" className="flex items-center gap-2">
          <Crosshair className="w-4 h-4 text-prospex-cyan" />
          <span className="font-mono font-bold text-sm text-prospex-text">PROSPEX</span>
        </Link>
        <div className="w-8" />
      </div>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 bg-black/60 z-50" onClick={() => setMobileOpen(false)} />
      )}

      {/* Sidebar — desktop fixed, mobile slide-over */}
      <aside className={cn(
        'fixed top-0 bottom-0 w-64 bg-prospex-surface border-r border-prospex-border flex flex-col z-50 transition-transform duration-300',
        'md:left-0 md:translate-x-0',
        mobileOpen ? 'left-0 translate-x-0' : '-translate-x-full md:translate-x-0'
      )}>
        <div className="md:hidden absolute top-3 right-3">
          <button onClick={() => setMobileOpen(false)} className="p-1.5 rounded-lg hover:bg-prospex-bg" aria-label="Close menu">
            <X className="w-5 h-5 text-prospex-dim" />
          </button>
        </div>
        {navContent}
      </aside>
    </>
  );
}
