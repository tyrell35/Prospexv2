'use client';

import { useEffect, useState } from 'react';
import type { ElementType } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Microscope,
  Search as SearchIcon,
  Users,
  Star,
  Bot,
  AlertCircle,
  Check,
  X,
  TrendingUp,
  TrendingDown,
  Minus,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { cn, getScoreColor, getScoreBgColor } from '@/lib/utils';
import type { DeepAudit, Lead } from '@/lib/types';

function ModuleScoreCard({ label, score, icon: Icon, color }: {
  label: string;
  score: number | null;
  icon: ElementType;
  color: string;
}) {
  return (
    <div className="card p-5 text-center">
      <Icon className={cn('w-6 h-6 mx-auto mb-2', color)} />
      <p className="text-xs font-mono text-prospex-dim uppercase">{label}</p>
      <p className={cn('text-3xl font-mono font-bold mt-1', score !== null ? getScoreColor(score) : 'text-prospex-dim')}>
        {score ?? '—'}
      </p>
    </div>
  );
}

export default function DeepAuditReportPage() {
  const params = useParams();
  const auditId = params.id as string;
  const [audit, setAudit] = useState<DeepAudit | null>(null);
  const [lead, setLead] = useState<Lead | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const { data: auditData } = await supabase
          .from('deep_audits')
          .select('*')
          .eq('id', auditId)
          .single();

        if (auditData) {
          setAudit(auditData);

          const { data: leadData } = await supabase
            .from('leads')
            .select('*')
            .eq('id', auditData.lead_id)
            .single();

          setLead(leadData);
        }
      } catch (err) {
        console.error('Failed to fetch deep audit:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [auditId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-2 border-purple-400/30 border-t-purple-400 rounded-full animate-spin" />
      </div>
    );
  }

  if (!audit || !lead) {
    return (
      <div className="text-center py-20">
        <AlertCircle className="w-12 h-12 text-prospex-red mx-auto mb-3" />
        <p className="text-lg font-mono text-prospex-text">Deep Audit not found</p>
        <Link href="/leads" className="btn-primary mt-4 inline-flex">
          <ArrowLeft className="w-4 h-4" /> Back to Leads
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Link href={`/leads/${lead.id}`} className="btn-ghost text-xs">
          <ArrowLeft className="w-4 h-4" /> Back to {lead.business_name}
        </Link>
      </div>

      <div className="text-center">
        <Microscope className="w-10 h-10 text-purple-400 mx-auto mb-2" />
        <h1 className="text-2xl font-mono font-bold text-prospex-text">Deep Audit Report</h1>
        <p className="text-sm text-prospex-muted mt-1">{lead.business_name}</p>
        {audit.overall_score !== null && (
          <div className={cn('inline-flex items-center gap-2 mt-4 px-6 py-3 rounded-xl border', getScoreBgColor(audit.overall_score))}>
            <span className="text-xs font-mono text-prospex-dim uppercase">Overall Score</span>
            <span className={cn('text-4xl font-mono font-bold', getScoreColor(audit.overall_score))}>
              {audit.overall_score}
            </span>
          </div>
        )}
      </div>

      {/* Module Score Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <ModuleScoreCard label="SEO" score={audit.seo_score} icon={SearchIcon} color="text-blue-400" />
        <ModuleScoreCard label="Competitors" score={audit.competitor_score} icon={Users} color="text-orange-400" />
        <ModuleScoreCard label="Reviews" score={audit.reviews_score} icon={Star} color="text-yellow-400" />
        <ModuleScoreCard label="AI Visibility" score={audit.ai_visibility_score} icon={Bot} color="text-purple-400" />
      </div>

      {/* SEO Module */}
      {audit.seo_data && (
        <div className="card p-6">
          <h2 className="font-mono font-semibold text-prospex-text flex items-center gap-2 mb-4">
            <SearchIcon className="w-5 h-5 text-blue-400" />
            SEO Ranking Analysis
          </h2>
          {audit.seo_data.keywords && audit.seo_data.keywords.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="table-header">
                    <th className="text-left px-3 py-2 text-xs font-mono text-prospex-dim uppercase">Keyword</th>
                    <th className="text-left px-3 py-2 text-xs font-mono text-prospex-dim uppercase">Position</th>
                    <th className="text-left px-3 py-2 text-xs font-mono text-prospex-dim uppercase">Volume</th>
                    <th className="text-left px-3 py-2 text-xs font-mono text-prospex-dim uppercase">Difficulty</th>
                    <th className="text-left px-3 py-2 text-xs font-mono text-prospex-dim uppercase">SERP Features</th>
                  </tr>
                </thead>
                <tbody>
                  {audit.seo_data.keywords.map((kw, i) => (
                    <tr key={i} className="table-row">
                      <td className="px-3 py-2 text-sm text-prospex-text font-medium">{kw.keyword}</td>
                      <td className="px-3 py-2">
                        {kw.position ? (
                          <span className={cn('font-mono text-sm font-bold', kw.position <= 3 ? 'text-prospex-green' : kw.position <= 10 ? 'text-prospex-amber' : 'text-prospex-red')}>
                            #{kw.position}
                          </span>
                        ) : (
                          <span className="text-xs text-prospex-red font-mono">Not ranking</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs font-mono text-prospex-muted">
                        {kw.search_volume?.toLocaleString() || '—'}
                      </td>
                      <td className="px-3 py-2">
                        <span className={cn('badge',
                          kw.difficulty === 'easy' ? 'bg-prospex-green/20 text-prospex-green border-prospex-green/40' :
                          kw.difficulty === 'medium' ? 'bg-prospex-amber/20 text-prospex-amber border-prospex-amber/40' :
                          'bg-prospex-red/20 text-prospex-red border-prospex-red/40'
                        )}>
                          {kw.difficulty}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-1">
                          {kw.serp_features?.map((f, j) => (
                            <span key={j} className="badge bg-prospex-surface border-prospex-border text-prospex-dim">{f}</span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-prospex-dim">No SEO data available</p>
          )}
        </div>
      )}

      {/* Competitor Module */}
      {audit.competitor_data && audit.competitor_data.length > 0 && (
        <div className="card p-6">
          <h2 className="font-mono font-semibold text-prospex-text flex items-center gap-2 mb-4">
            <Users className="w-5 h-5 text-orange-400" />
            Local Competitor Analysis
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {audit.competitor_data.map((comp, i) => (
              <div key={i} className="bg-prospex-bg rounded-lg p-4 border border-prospex-border">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-mono text-prospex-dim">#{comp.rank}</span>
                  {comp.google_rating && (
                    <span className="flex items-center gap-1 text-xs font-mono">
                      <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" />
                      {comp.google_rating} ({comp.google_review_count})
                    </span>
                  )}
                </div>
                <p className="font-medium text-sm text-prospex-text">{comp.name}</p>
                {comp.website && (
                  <p className="text-xs text-prospex-cyan truncate mt-1">{comp.website}</p>
                )}
                {comp.strengths.length > 0 && (
                  <div className="mt-3 space-y-1">
                    {comp.strengths.map((s, j) => (
                      <p key={j} className="text-xs text-prospex-green flex items-center gap-1">
                        <TrendingUp className="w-3 h-3 shrink-0" /> {s}
                      </p>
                    ))}
                  </div>
                )}
                {comp.weaknesses.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {comp.weaknesses.map((w, j) => (
                      <p key={j} className="text-xs text-prospex-red flex items-center gap-1">
                        <TrendingDown className="w-3 h-3 shrink-0" /> {w}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Reviews Module */}
      {audit.reviews_data && (
        <div className="card p-6">
          <h2 className="font-mono font-semibold text-prospex-text flex items-center gap-2 mb-4">
            <Star className="w-5 h-5 text-yellow-400" />
            Google Reviews Audit
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="text-center">
              <p className="text-xs font-mono text-prospex-dim uppercase">Rating</p>
              <p className="text-2xl font-mono font-bold text-prospex-text mt-1">{audit.reviews_data.google_rating?.toFixed(1) || '—'}</p>
            </div>
            <div className="text-center">
              <p className="text-xs font-mono text-prospex-dim uppercase">Reviews</p>
              <p className="text-2xl font-mono font-bold text-prospex-text mt-1">{audit.reviews_data.google_review_count || '—'}</p>
            </div>
            <div className="text-center">
              <p className="text-xs font-mono text-prospex-dim uppercase">Velocity</p>
              <p className="text-2xl font-mono font-bold text-prospex-text mt-1">{audit.reviews_data.review_velocity || '—'}<span className="text-xs text-prospex-dim">/mo</span></p>
            </div>
            <div className="text-center">
              <p className="text-xs font-mono text-prospex-dim uppercase">Response Rate</p>
              <p className="text-2xl font-mono font-bold text-prospex-text mt-1">{audit.reviews_data.response_rate ? `${audit.reviews_data.response_rate}%` : '—'}</p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {audit.reviews_data.positive_themes.length > 0 && (
              <div>
                <p className="text-xs font-mono text-prospex-green uppercase mb-2">Positive Themes</p>
                <div className="space-y-1">
                  {audit.reviews_data.positive_themes.map((t, i) => (
                    <p key={i} className="text-sm text-prospex-muted flex items-center gap-2">
                      <Check className="w-3 h-3 text-prospex-green shrink-0" /> {t}
                    </p>
                  ))}
                </div>
              </div>
            )}
            {audit.reviews_data.negative_themes.length > 0 && (
              <div>
                <p className="text-xs font-mono text-prospex-red uppercase mb-2">Negative Themes</p>
                <div className="space-y-1">
                  {audit.reviews_data.negative_themes.map((t, i) => (
                    <p key={i} className="text-sm text-prospex-muted flex items-center gap-2">
                      <X className="w-3 h-3 text-prospex-red shrink-0" /> {t}
                    </p>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* AI Visibility Module */}
      {audit.ai_visibility_data && (
        <div className="card p-6">
          <h2 className="font-mono font-semibold text-prospex-text flex items-center gap-2 mb-4">
            <Bot className="w-5 h-5 text-purple-400" />
            AI Search Visibility
          </h2>
          {audit.ai_visibility_data.checks && audit.ai_visibility_data.checks.length > 0 ? (
            <div className="space-y-3">
              {audit.ai_visibility_data.checks.map((check, i) => (
                <div key={i} className="bg-prospex-bg rounded-lg p-4 border border-prospex-border">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm text-prospex-muted font-mono">"{check.query}"</p>
                    <span className={cn('badge',
                      check.is_mentioned
                        ? 'bg-prospex-green/20 text-prospex-green border-prospex-green/40'
                        : 'bg-prospex-red/20 text-prospex-red border-prospex-red/40'
                    )}>
                      {check.is_mentioned ? 'Mentioned' : 'Not Found'}
                    </span>
                  </div>
                  <p className="text-xs text-prospex-dim">Platform: {check.platform}</p>
                  {check.mention_context && (
                    <p className="text-xs text-prospex-muted mt-1 italic">"{check.mention_context}"</p>
                  )}
                  {check.competitors_mentioned.length > 0 && (
                    <p className="text-xs text-prospex-amber mt-1">
                      Competitors mentioned: {check.competitors_mentioned.join(', ')}
                    </p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-prospex-dim">No AI visibility data available</p>
          )}
          <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'Robots.txt allows AI', value: audit.ai_visibility_data.robots_txt_allows_ai },
              { label: 'Schema Markup', value: audit.ai_visibility_data.has_schema_markup },
              { label: 'Structured Content', value: audit.ai_visibility_data.has_structured_content },
              { label: 'FAQ Schema', value: audit.ai_visibility_data.has_faq_schema },
            ].map(item => (
              <div key={item.label} className="bg-prospex-bg rounded-lg p-3 border border-prospex-border text-center">
                <p className="text-[10px] font-mono text-prospex-dim uppercase">{item.label}</p>
                {item.value === null ? (
                  <Minus className="w-4 h-4 text-prospex-dim mx-auto mt-1" />
                ) : item.value ? (
                  <Check className="w-4 h-4 text-prospex-green mx-auto mt-1" />
                ) : (
                  <X className="w-4 h-4 text-prospex-red mx-auto mt-1" />
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
