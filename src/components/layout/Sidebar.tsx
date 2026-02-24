'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Database, Search, Settings, Crosshair, FileText, BarChart3, Columns3, Upload, TrendingUp, MapPin, Eye, BookOpen, Brain, Activity, Lightbulb, History, Users, LogOut } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth-context';

const navigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Lead Database', href: '/leads', icon: Database },
  { name: 'Search Leads', href: '/search', icon: Search },
  { name: 'Scrape History', href: '/scrape-history', icon: History },
  { name: 'Market Analysis', href: '/market-analysis', icon: TrendingUp },
  { name: 'City Scraper', href: '/city-scraper', icon: MapPin },
  { name: 'Ad Intelligence', href: '/ad-intelligence', icon: Eye },
  { name: 'Templates', href: '/templates', icon: BookOpen },
  { name: 'Outreach Coach', href: '/outreach-coach', icon: Brain },
  { name: 'Outreach Analytics', href: '/outreach-analytics', icon: Activity },
  { name: 'Knowledge Base', href: '/knowledge-base', icon: Lightbulb },
  { name: 'Import CSV', href: '/import', icon: Upload },
  { name: 'Pipeline', href: '/pipeline', icon: Columns3 },
  { name: 'Pitches', href: '/pitch', icon: FileText },
  { name: 'Analytics', href: '/analytics', icon: BarChart3 },
  { name: 'Team', href: '/team', icon: Users },
  { name: 'Settings', href: '/settings', icon: Settings },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { user, teamMember, signOut } = useAuth();

  // Hide sidebar on pitch public pages
  if (pathname.startsWith('/pitch/') && pathname !== '/pitch') return null;

  return (
    <aside className="fixed left-0 top-0 bottom-0 w-64 bg-prospex-surface border-r border-prospex-border flex flex-col z-50">
      <div className="p-5 border-b border-prospex-border">
        <Link href="/" className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-prospex-cyan/20 border border-prospex-cyan/40 flex items-center justify-center">
            <Crosshair className="w-5 h-5 text-prospex-cyan" />
          </div>
          <div>
            <h1 className="font-mono font-bold text-base text-prospex-text tracking-tight">PROSPEX</h1>
            <p className="text-[10px] text-prospex-dim font-mono tracking-widest uppercase">Find. Score. Close.</p>
          </div>
        </Link>
      </div>

      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {navigation.map((item) => {
          const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
          return (
            <Link key={item.name} href={item.href}
              className={cn('flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200',
                isActive ? 'bg-prospex-cyan/10 text-prospex-cyan border border-prospex-cyan/20 shadow-glow-cyan' : 'text-prospex-muted hover:text-prospex-text hover:bg-prospex-bg border border-transparent')}>
              <item.icon className={cn('w-4 h-4', isActive ? 'text-prospex-cyan' : 'text-prospex-dim')} />
              <span className="font-mono text-xs tracking-wide">{item.name}</span>
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-prospex-border">
        {user && (
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-7 h-7 rounded-full bg-prospex-cyan/20 border border-prospex-cyan/30 flex items-center justify-center shrink-0">
                <span className="text-[10px] font-bold text-prospex-cyan">
                  {(teamMember?.full_name || user.email || 'U').charAt(0).toUpperCase()}
                </span>
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-mono text-white truncate">{teamMember?.full_name || user.email?.split('@')[0]}</p>
                <p className="text-[8px] font-mono text-prospex-dim capitalize">{teamMember?.role || 'member'}</p>
              </div>
            </div>
            <button onClick={signOut} title="Sign out" className="p-1.5 text-prospex-dim hover:text-red-400 transition-colors rounded hover:bg-red-500/10">
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-prospex-green animate-pulse-slow" />
          <span className="text-[10px] font-mono text-prospex-dim">SYSTEM ONLINE</span>
        </div>
        <p className="text-[10px] font-mono text-prospex-dim mt-1">Prospex v2.8</p>
      </div>
    </aside>
  );
}
