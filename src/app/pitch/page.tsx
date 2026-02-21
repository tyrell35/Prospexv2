'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { FileText, Search as SearchIcon, Star, Bot, Users, Layers, ExternalLink, Eye, Copy, Check } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { cn, formatRelativeTime } from '@/lib/utils';
import type { Pitch } from '@/lib/types';

const pitchTypeConfig: Record<string, { icon: typeof FileText; color: string; label: string }> = {
  seo: { icon: SearchIcon, color: 'text-blue-400', label: 'SEO Pitch' },
  reviews: { icon: Star, color: 'text-yellow-400', label: 'Reviews Pitch' },
  ai_visibility: { icon: Bot, color: 'text-purple-400', label: 'AI Visibility Pitch' },
  competitor: { icon: Users, color: 'text-orange-400', label: 'Competitor Pitch' },
  comprehensive: { icon: Layers, color: 'text-prospex-cyan', label: 'Comprehensive Pitch' },
};

export default function PitchListPage() {
  const [pitches, setPitches] = useState<Pitch[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    supabase.from('pitches').select('*').order('created_at', { ascending: false }).limit(50)
      .then(({ data }) => { setPitches(data || []); setLoading(false); });
  }, []);

  const copyLink = (id: string) => {
    const url = `${window.location.origin}/pitch/${id}`;
    navigator.clipboard.writeText(url);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-mono font-bold text-prospex-text flex items-center gap-3"><FileText className="w-6 h-6 text-prospex-cyan" />Pitches</h1>
        <p className="text-sm text-prospex-dim mt-1">Generated sales pitches from Deep Audit data</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-2 border-prospex-cyan/30 border-t-prospex-cyan rounded-full animate-spin" /></div>
      ) : pitches.length === 0 ? (
        <div className="card p-12 text-center">
          <FileText className="w-12 h-12 text-prospex-dim mx-auto mb-3" />
          <p className="text-sm text-prospex-dim font-mono">No pitches generated yet</p>
          <p className="text-xs text-prospex-dim mt-2">Run a Deep Audit on a lead, then generate pitches from the lead detail page.</p>
          <Link href="/leads" className="btn-primary mt-4 inline-flex">Go to Leads</Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {pitches.map(pitch => {
            const config = pitchTypeConfig[pitch.pitch_type] || pitchTypeConfig.comprehensive;
            const Icon = config.icon;
            return (
              <div key={pitch.id} className="card card-interactive p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Icon className={cn('w-5 h-5', config.color)} />
                    <span className={cn('badge', config.color, 'bg-opacity-20 border-current/30')}>{config.label}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    {pitch.view_count > 0 && <span className="badge bg-prospex-green/20 text-prospex-green border-prospex-green/40"><Eye className="w-3 h-3" /> {pitch.view_count}</span>}
                    <span className={cn('badge', pitch.status === 'viewed' ? 'bg-prospex-green/20 text-prospex-green border-prospex-green/40' : pitch.status === 'sent' ? 'bg-prospex-amber/20 text-prospex-amber border-prospex-amber/40' : 'bg-prospex-surface text-prospex-dim border-prospex-border')}>{pitch.status}</span>
                  </div>
                </div>
                <h3 className="text-sm font-semibold text-prospex-text mb-1 line-clamp-2">{pitch.title}</h3>
                <p className="text-xs text-prospex-dim font-mono">{formatRelativeTime(pitch.created_at)}</p>
                <div className="flex items-center gap-2 mt-4">
                  <Link href={`/pitch/${pitch.id}`} className="btn-primary text-xs flex-1"><ExternalLink className="w-3.5 h-3.5" /> Preview</Link>
                  <button onClick={() => copyLink(pitch.id)} className="btn-ghost text-xs">
                    {copiedId === pitch.id ? <><Check className="w-3.5 h-3.5" /> Copied</> : <><Copy className="w-3.5 h-3.5" /> Copy Link</>}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
