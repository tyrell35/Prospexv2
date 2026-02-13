'use client';

import { useEffect, useState } from 'react';
import type { ElementType } from 'react';
import Link from 'next/link';
import {
  Database,
  Search,
  Shield,
  Upload,
  Download,
  Microscope,
  TrendingUp,
  Users,
  Activity,
  ArrowRight,
  Crosshair,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { formatRelativeTime, getScoreColor } from '@/lib/utils';
import type { DashboardStats, ActivityLog } from '@/lib/types';

function StatCard({ icon: Icon, label, value, trend, color }: {
  icon: ElementType;
  label: string;
  value: string | number;
  trend?: string;
  color: string;
}) {
  return (
    <div className="card p-5 animate-fade-in">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-mono text-prospex-dim uppercase tracking-wider">{label}</p>
          <p className={`text-3xl font-mono font-bold mt-2 ${color} animate-count-up`}>
            {value}
          </p>
          {trend && (
            <p className="text-xs text-prospex-green flex items-center gap-1 mt-1">
              <TrendingUp className="w-3 h-3" />
              {trend}
            </p>
          )}
        </div>
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center bg-opacity-20 ${color.replace('text-', 'bg-')}/20`}>
          <Icon className={`w-5 h-5 ${color}`} />
        </div>
      </div>
    </div>
  );
}

function QuickAction({ icon: Icon, label, description, href, color }: {
  icon: ElementType;
  label: string;
  description: string;
  href: string;
  color: string;
}) {
  return (
    <Link
      href={href}
      className="card card-interactive p-5 flex items-center gap-4 group"
    >
      <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${color}/20 border border-current/20`}>
        <Icon className={`w-6 h-6 ${color}`} />
      </div>
      <div className="flex-1">
        <p className="font-mono text-sm font-semibold text-prospex-text">{label}</p>
        <p className="text-xs text-prospex-dim mt-0.5">{description}</p>
      </div>
      <ArrowRight className="w-4 h-4 text-prospex-dim group-hover:text-prospex-cyan transition-colors" />
    </Link>
  );
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats>({
    totalLeads: 0,
    leadsThisWeek: 0,
    avgLeadScore: 0,
    pushedToGHL: 0,
    auditsCompleted: 0,
    deepAuditsCompleted: 0,
  });
  const [activities, setActivities] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStats() {
      try {
        // Total leads
        const { count: totalLeads } = await supabase
          .from('leads')
          .select('*', { count: 'exact', head: true });

        // Leads this week
        const oneWeekAgo = new Date();
        oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
        const { count: leadsThisWeek } = await supabase
          .from('leads')
          .select('*', { count: 'exact', head: true })
          .gte('created_at', oneWeekAgo.toISOString());

        // Average lead score
        const { data: scoreData } = await supabase
          .from('leads')
          .select('lead_score')
          .not('lead_score', 'is', null);

        const avgScore = scoreData && scoreData.length > 0
          ? Math.round(scoreData.reduce((sum, l) => sum + (l.lead_score || 0), 0) / scoreData.length)
          : 0;

        // Pushed to GHL
        const { count: pushedToGHL } = await supabase
          .from('leads')
          .select('*', { count: 'exact', head: true })
          .not('ghl_contact_id', 'is', null);

        // Audits completed
        const { count: auditsCompleted } = await supabase
          .from('leads')
          .select('*', { count: 'exact', head: true })
          .eq('audit_status', 'complete');

        // Deep audits
        const { count: deepAuditsCompleted } = await supabase
          .from('deep_audits')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'complete');

        setStats({
          totalLeads: totalLeads || 0,
          leadsThisWeek: leadsThisWeek || 0,
          avgLeadScore: avgScore,
          pushedToGHL: pushedToGHL || 0,
          auditsCompleted: auditsCompleted || 0,
          deepAuditsCompleted: deepAuditsCompleted || 0,
        });

        // Recent activity
        const { data: activityData } = await supabase
          .from('activity_log')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(10);

        setActivities(activityData || []);
      } catch (error) {
        console.error('Failed to fetch dashboard stats:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchStats();
  }, []);

  const actionTypeColors: Record<string, string> = {
    scrape: 'bg-prospex-cyan',
    audit: 'bg-prospex-amber',
    deep_audit: 'bg-purple-400',
    ghl_push: 'bg-prospex-green',
    export: 'bg-blue-400',
    score: 'bg-pink-400',
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-mono font-bold text-prospex-text flex items-center gap-3">
            <Crosshair className="w-6 h-6 text-prospex-cyan" />
            Command Center
          </h1>
          <p className="text-sm text-prospex-dim mt-1">Your lead generation overview</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-prospex-green animate-pulse" />
          <span className="text-xs font-mono text-prospex-dim">All systems operational</span>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={Database}
          label="Total Leads"
          value={loading ? '—' : stats.totalLeads.toLocaleString()}
          trend={stats.leadsThisWeek > 0 ? `+${stats.leadsThisWeek} this week` : undefined}
          color="text-prospex-cyan"
        />
        <StatCard
          icon={TrendingUp}
          label="Avg Lead Score"
          value={loading ? '—' : stats.avgLeadScore}
          color={loading ? 'text-prospex-muted' : getScoreColor(stats.avgLeadScore)}
        />
        <StatCard
          icon={Shield}
          label="Audits Complete"
          value={loading ? '—' : stats.auditsCompleted}
          color="text-prospex-amber"
        />
        <StatCard
          icon={Upload}
          label="Pushed to GHL"
          value={loading ? '—' : stats.pushedToGHL}
          color="text-prospex-green"
        />
      </div>

      {/* Quick Actions + Activity Feed */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Quick Actions */}
        <div className="lg:col-span-2 space-y-3">
          <h2 className="text-sm font-mono font-semibold text-prospex-muted uppercase tracking-wider">
            Quick Actions
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <QuickAction
              icon={Search}
              label="New Search"
              description="Scrape leads from Google Maps, Yelp, or Fresha"
              href="/search"
              color="text-prospex-cyan"
            />
            <QuickAction
              icon={Shield}
              label="Run Audits"
              description="Analyze websites for issues and opportunities"
              href="/leads"
              color="text-prospex-amber"
            />
            <QuickAction
              icon={Microscope}
              label="Deep Audit"
              description="SEO, competitors, reviews & AI visibility"
              href="/leads"
              color="text-purple-400"
            />
            <QuickAction
              icon={Upload}
              label="Push to GHL"
              description="Send qualified leads to GoHighLevel"
              href="/leads"
              color="text-prospex-green"
            />
            <QuickAction
              icon={Download}
              label="Export CSV"
              description="Download your lead database"
              href="/leads"
              color="text-blue-400"
            />
            <QuickAction
              icon={Users}
              label="Settings"
              description="API keys, branding, and configuration"
              href="/settings"
              color="text-prospex-muted"
            />
          </div>
        </div>

        {/* Activity Feed */}
        <div>
          <h2 className="text-sm font-mono font-semibold text-prospex-muted uppercase tracking-wider mb-3">
            Recent Activity
          </h2>
          <div className="card p-4 space-y-3 max-h-[400px] overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <div className="w-6 h-6 border-2 border-prospex-cyan/30 border-t-prospex-cyan rounded-full animate-spin" />
              </div>
            ) : activities.length === 0 ? (
              <div className="text-center py-8">
                <Activity className="w-8 h-8 text-prospex-dim mx-auto mb-2" />
                <p className="text-xs text-prospex-dim font-mono">No activity yet</p>
                <p className="text-xs text-prospex-dim mt-1">Start searching to see activity here</p>
              </div>
            ) : (
              activities.map((activity) => (
                <div
                  key={activity.id}
                  className="flex items-start gap-3 text-sm animate-slide-in"
                >
                  <div className={`w-2 h-2 rounded-full mt-1.5 ${actionTypeColors[activity.action_type] || 'bg-prospex-dim'}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-prospex-text truncate">{activity.description}</p>
                    <p className="text-[10px] text-prospex-dim font-mono mt-0.5">
                      {formatRelativeTime(activity.created_at)}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
