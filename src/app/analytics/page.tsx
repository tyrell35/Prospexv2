'use client';

import { useEffect, useState } from 'react';
import type { ElementType } from 'react';
import { BarChart3, TrendingUp, Database, Shield, FileText, Upload, Zap, Users, Target, Mail } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { cn, getSourceConfig, formatDate } from '@/lib/utils';

interface Stats {
  totalLeads: number;
  leadsThisWeek: number;
  leadsThisMonth: number;
  auditsCompleted: number;
  deepAuditsCompleted: number;
  pitchesGenerated: number;
  pushedToGHL: number;
  avgLeadScore: number;
  hotLeads: number;
  warmLeads: number;
  coldLeads: number;
  sourceBreakdown: Record<string, number>;
  weeklyTrend: { week: string; count: number }[];
  recentActivity: { action_type: string; description: string; created_at: string }[];
}

function StatCard({ icon: Icon, label, value, change, color }: { icon: ElementType; label: string; value: string | number; change?: string; color: string }) {
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-mono text-prospex-dim uppercase">{label}</span>
        <Icon className={cn('w-4 h-4', color)} />
      </div>
      <p className="text-2xl font-mono font-bold text-prospex-text">{value}</p>
      {change && <p className="text-xs text-prospex-green mt-1">{change}</p>}
    </div>
  );
}

function FunnelBar({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-xs font-mono text-prospex-muted">{label}</span>
        <span className="text-xs font-mono text-prospex-text">{count} <span className="text-prospex-dim">({pct.toFixed(0)}%)</span></span>
      </div>
      <div className="h-2 bg-prospex-bg rounded-full overflow-hidden">
        <div className={cn('h-full rounded-full transition-all duration-500', color)} style={{ width: `${Math.max(pct, 2)}%` }} />
      </div>
    </div>
  );
}

export default function AnalyticsPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStats() {
      try {
        const now = new Date();
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
        const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

        const [allLeads, weekLeads, monthLeads, audits, deepAudits, pitches, ghlPushed, hotLeads, warmLeads, coldLeads, activity] = await Promise.all([
          supabase.from('leads').select('id, source, lead_score', { count: 'exact' }),
          supabase.from('leads').select('id', { count: 'exact' }).gte('created_at', weekAgo),
          supabase.from('leads').select('id', { count: 'exact' }).gte('created_at', monthAgo),
          supabase.from('leads').select('id', { count: 'exact' }).eq('audit_status', 'complete'),
          supabase.from('leads').select('id', { count: 'exact' }).eq('deep_audit_status', 'complete'),
          supabase.from('pitches').select('id', { count: 'exact' }),
          supabase.from('leads').select('id', { count: 'exact' }).not('ghl_contact_id', 'is', null),
          supabase.from('leads').select('id', { count: 'exact' }).eq('lead_priority', 'hot'),
          supabase.from('leads').select('id', { count: 'exact' }).eq('lead_priority', 'warm'),
          supabase.from('leads').select('id', { count: 'exact' }).eq('lead_priority', 'cold'),
          supabase.from('activity_log').select('action_type, description, created_at').order('created_at', { ascending: false }).limit(15),
        ]);

        // Source breakdown
        const sourceBreakdown: Record<string, number> = {};
        (allLeads.data || []).forEach((l: Record<string, unknown>) => {
          const src = (l.source as string) || 'unknown';
          sourceBreakdown[src] = (sourceBreakdown[src] || 0) + 1;
        });

        // Average score
        const scores = (allLeads.data || []).map((l: Record<string, unknown>) => l.lead_score as number).filter(Boolean);
        const avgScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;

        setStats({
          totalLeads: allLeads.count || 0,
          leadsThisWeek: weekLeads.count || 0,
          leadsThisMonth: monthLeads.count || 0,
          auditsCompleted: audits.count || 0,
          deepAuditsCompleted: deepAudits.count || 0,
          pitchesGenerated: pitches.count || 0,
          pushedToGHL: ghlPushed.count || 0,
          avgLeadScore: avgScore,
          hotLeads: hotLeads.count || 0,
          warmLeads: warmLeads.count || 0,
          coldLeads: coldLeads.count || 0,
          sourceBreakdown,
          weeklyTrend: [],
          recentActivity: (activity.data || []) as Stats['recentActivity'],
        });
      } catch (err) { console.error('Failed to fetch analytics:', err); }
      finally { setLoading(false); }
    }
    fetchStats();
  }, []);

  if (loading) return <div className="flex items-center justify-center min-h-[60vh]"><div className="w-8 h-8 border-2 border-prospex-cyan/30 border-t-prospex-cyan rounded-full animate-spin" /></div>;
  if (!stats) return null;

  const actionIcons: Record<string, string> = { scrape: '🔍', audit: '🛡️', deep_audit: '📊', ghl_push: '📤', export: '💾', score: '⭐', pitch: '📝' };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-mono font-bold text-prospex-text flex items-center gap-3"><BarChart3 className="w-6 h-6 text-prospex-cyan" />Analytics</h1>
        <p className="text-sm text-prospex-dim mt-1">Performance metrics and conversion funnel</p>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon={Database} label="Total Leads" value={stats.totalLeads.toLocaleString()} change={`+${stats.leadsThisWeek} this week`} color="text-prospex-cyan" />
        <StatCard icon={Shield} label="Audits Done" value={stats.auditsCompleted} color="text-prospex-amber" />
        <StatCard icon={FileText} label="Pitches Made" value={stats.pitchesGenerated} color="text-purple-400" />
        <StatCard icon={Upload} label="Pushed to GHL" value={stats.pushedToGHL} color="text-prospex-green" />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon={Target} label="Avg Lead Score" value={`${stats.avgLeadScore}/100`} color="text-prospex-cyan" />
        <StatCard icon={Zap} label="Hot Leads" value={stats.hotLeads} color="text-red-400" />
        <StatCard icon={Users} label="Warm Leads" value={stats.warmLeads} color="text-amber-400" />
        <StatCard icon={Mail} label="Cold Leads" value={stats.coldLeads} color="text-blue-400" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Conversion Funnel */}
        <div className="card p-6">
          <h2 className="font-mono font-semibold text-prospex-text text-sm uppercase tracking-wider mb-4 flex items-center gap-2"><TrendingUp className="w-4 h-4 text-prospex-cyan" />Conversion Funnel</h2>
          <div className="space-y-4">
            <FunnelBar label="Leads Scraped" count={stats.totalLeads} total={stats.totalLeads} color="bg-prospex-cyan" />
            <FunnelBar label="Audited" count={stats.auditsCompleted} total={stats.totalLeads} color="bg-prospex-amber" />
            <FunnelBar label="Deep Audited" count={stats.deepAuditsCompleted} total={stats.totalLeads} color="bg-purple-400" />
            <FunnelBar label="Pitched" count={stats.pitchesGenerated} total={stats.totalLeads} color="bg-orange-400" />
            <FunnelBar label="Pushed to CRM" count={stats.pushedToGHL} total={stats.totalLeads} color="bg-prospex-green" />
          </div>
        </div>

        {/* Source Breakdown */}
        <div className="card p-6">
          <h2 className="font-mono font-semibold text-prospex-text text-sm uppercase tracking-wider mb-4 flex items-center gap-2"><Database className="w-4 h-4 text-prospex-cyan" />Lead Sources</h2>
          <div className="space-y-3">
            {Object.entries(stats.sourceBreakdown).sort((a, b) => b[1] - a[1]).map(([source, count]) => {
              const config = getSourceConfig(source);
              const pct = stats.totalLeads > 0 ? (count / stats.totalLeads) * 100 : 0;
              return (
                <div key={source} className="flex items-center gap-3">
                  <span className={cn('badge text-xs whitespace-nowrap', config.color)}>{config.label}</span>
                  <div className="flex-1 h-2 bg-prospex-bg rounded-full overflow-hidden">
                    <div className="h-full bg-prospex-cyan/50 rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-xs font-mono text-prospex-muted w-12 text-right">{count}</span>
                </div>
              );
            })}
            {Object.keys(stats.sourceBreakdown).length === 0 && <p className="text-xs text-prospex-dim font-mono text-center py-4">No data yet</p>}
          </div>
        </div>
      </div>

      {/* Activity Feed */}
      <div className="card p-6">
        <h2 className="font-mono font-semibold text-prospex-text text-sm uppercase tracking-wider mb-4">Recent Activity</h2>
        <div className="space-y-2">
          {stats.recentActivity.map((item, i) => (
            <div key={i} className="flex items-center gap-3 py-2 border-b border-prospex-border/50 last:border-0">
              <span className="text-base">{actionIcons[item.action_type] || '📌'}</span>
              <p className="text-sm text-prospex-muted flex-1">{item.description}</p>
              <span className="text-xs text-prospex-dim font-mono whitespace-nowrap">{formatDate(item.created_at)}</span>
            </div>
          ))}
          {stats.recentActivity.length === 0 && <p className="text-xs text-prospex-dim font-mono text-center py-4">No activity yet</p>}
        </div>
      </div>
    </div>
  );
}
