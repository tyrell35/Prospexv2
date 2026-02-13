'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  AlertCircle, Check, X, Minus, ArrowRight, Phone, Mail, Globe, Calendar,
  TrendingUp, BarChart3, AlertTriangle, ShieldAlert, Info, Clock,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface ProblemItem {
  title: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  finding: string;
  impact: string;
  solution: string;
  timeline: string;
}

interface PitchContent {
  hook: string;
  summary: string;
  overall_score: number | null;
  problems: ProblemItem[];
  data_points: { label: string; value: string; type: 'positive' | 'negative' | 'neutral' }[];
  competitor_comparisons: { competitor_name: string; metric: string; their_value: string; your_value: string; winner: 'them' | 'you' | 'tie' }[];
  roadmap: { phase: string; timeframe: string; actions: string[] }[];
  result: string;
  cta: string;
}

interface Pitch {
  id: string;
  title: string;
  content: PitchContent;
  agency_name: string | null;
  agency_email: string | null;
  agency_phone: string | null;
  agency_website: string | null;
  agency_logo_url: string | null;
  calendar_url: string | null;
}

function SeverityBadge({ severity }: { severity: string }) {
  const config: Record<string, { label: string; color: string; icon: typeof AlertTriangle }> = {
    critical: { label: 'Critical', color: 'bg-red-500/20 text-red-400 border-red-500/40', icon: ShieldAlert },
    high: { label: 'High Priority', color: 'bg-orange-500/20 text-orange-400 border-orange-500/40', icon: AlertTriangle },
    medium: { label: 'Medium', color: 'bg-amber-500/20 text-amber-400 border-amber-500/40', icon: Info },
    low: { label: 'Low Priority', color: 'bg-blue-500/20 text-blue-400 border-blue-500/40', icon: Info },
  };
  const c = config[severity] || config.medium;
  const Icon = c.icon;
  return (
    <span className={cn('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-mono font-bold', c.color)}>
      <Icon className="w-3 h-3" /> {c.label}
    </span>
  );
}

function ScoreRing({ score }: { score: number }) {
  const color = score >= 70 ? 'text-green-400' : score >= 45 ? 'text-amber-400' : 'text-red-400';
  const bg = score >= 70 ? 'border-green-500/30' : score >= 45 ? 'border-amber-500/30' : 'border-red-500/30';
  return (
    <div className={cn('w-28 h-28 rounded-full border-4 flex flex-col items-center justify-center', bg)}>
      <span className={cn('text-4xl font-mono font-bold', color)}>{score}</span>
      <span className="text-[10px] text-[#5A5A66] font-mono">/100</span>
    </div>
  );
}

export default function PitchPage() {
  const params = useParams();
  const pitchId = params.id as string;
  const [pitch, setPitch] = useState<Pitch | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedProblem, setExpandedProblem] = useState<number | null>(null);

  useEffect(() => {
    fetch(`/api/pitch?pitchId=${pitchId}`)
      .then(r => r.json())
      .then(data => { setPitch(data); setLoading(false); setExpandedProblem(0); })
      .catch(() => setLoading(false));
  }, [pitchId]);

  if (loading) return (
    <div className="min-h-screen bg-[#0A0A0F] flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-cyan-400/30 border-t-cyan-400 rounded-full animate-spin" />
    </div>
  );

  if (!pitch) return (
    <div className="min-h-screen bg-[#0A0A0F] flex flex-col items-center justify-center text-center">
      <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-3" />
      <p className="text-lg text-white font-mono">Pitch not found</p>
    </div>
  );

  const content = pitch.content;
  const criticalCount = content.problems?.filter(p => p.severity === 'critical').length || 0;
  const highCount = content.problems?.filter(p => p.severity === 'high').length || 0;

  return (
    <div className="min-h-screen bg-[#0A0A0F]">
      {/* Agency Header */}
      {pitch.agency_name && (
        <div className="bg-[#141418] border-b border-[#2A2A32] px-6 py-3 sticky top-0 z-50">
          <div className="max-w-4xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-3">
              {pitch.agency_logo_url && <img src={pitch.agency_logo_url} alt="" className="w-8 h-8 rounded object-cover" />}
              <span className="font-mono font-bold text-white text-sm">{pitch.agency_name}</span>
            </div>
            <div className="flex items-center gap-4 text-xs text-[#9898A0]">
              {pitch.agency_phone && <a href={`tel:${pitch.agency_phone}`} className="flex items-center gap-1 hover:text-cyan-400 transition-colors"><Phone className="w-3 h-3" />{pitch.agency_phone}</a>}
              {pitch.agency_email && <a href={`mailto:${pitch.agency_email}`} className="flex items-center gap-1 hover:text-cyan-400 transition-colors"><Mail className="w-3 h-3" />{pitch.agency_email}</a>}
              {pitch.agency_website && <a href={pitch.agency_website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:text-cyan-400 transition-colors"><Globe className="w-3 h-3" />Website</a>}
            </div>
          </div>
        </div>
      )}

      <div className="max-w-4xl mx-auto px-6 py-12">
        {/* Title Section */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-xs font-mono mb-4">
            <BarChart3 className="w-3.5 h-3.5" /> Prepared exclusively for you
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-white leading-tight mb-4">{pitch.title}</h1>
          {content.summary && <p className="text-[#9898A0] text-lg leading-relaxed max-w-2xl mx-auto">{content.summary}</p>}
        </div>

        {/* Score + Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          {/* Overall Score */}
          {content.overall_score && (
            <div className="md:col-span-1 bg-[#141418] border border-[#2A2A32] rounded-2xl p-8 flex flex-col items-center justify-center text-center">
              <p className="text-xs font-mono text-[#5A5A66] uppercase mb-3">Overall Score</p>
              <ScoreRing score={content.overall_score} />
              <p className="text-xs text-[#9898A0] mt-3">
                {content.overall_score >= 70 ? 'Good foundation with room to grow' : content.overall_score >= 45 ? 'Below average — significant gaps' : 'Needs urgent attention'}
              </p>
            </div>
          )}

          {/* Issues Summary */}
          <div className={cn('bg-[#141418] border border-[#2A2A32] rounded-2xl p-8', content.overall_score ? 'md:col-span-2' : 'md:col-span-3')}>
            <p className="text-xs font-mono text-[#5A5A66] uppercase mb-4">Issues Found</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center">
                <p className="text-3xl font-mono font-bold text-red-400">{criticalCount}</p>
                <p className="text-xs text-[#5A5A66] font-mono">Critical</p>
              </div>
              <div className="text-center">
                <p className="text-3xl font-mono font-bold text-orange-400">{highCount}</p>
                <p className="text-xs text-[#5A5A66] font-mono">High</p>
              </div>
              <div className="text-center">
                <p className="text-3xl font-mono font-bold text-amber-400">{content.problems?.filter(p => p.severity === 'medium').length || 0}</p>
                <p className="text-xs text-[#5A5A66] font-mono">Medium</p>
              </div>
              <div className="text-center">
                <p className="text-3xl font-mono font-bold text-blue-400">{content.problems?.filter(p => p.severity === 'low').length || 0}</p>
                <p className="text-xs text-[#5A5A66] font-mono">Low</p>
              </div>
            </div>
            <p className="text-sm text-[#9898A0] mt-4 text-center">
              {content.problems?.length || 0} total issues identified — click each one below for full details
            </p>
          </div>
        </div>

        {/* Data Points Grid */}
        {content.data_points && content.data_points.length > 0 && (
          <section className="mb-12">
            <h2 className="text-xl font-bold text-white mb-4">Audit Scorecard</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {content.data_points.map((point, i) => {
                const colors = {
                  positive: 'bg-green-500/10 border-green-500/20 text-green-400',
                  negative: 'bg-red-500/10 border-red-500/20 text-red-400',
                  neutral: 'bg-gray-500/10 border-gray-500/20 text-gray-400',
                };
                const icons = { positive: Check, negative: X, neutral: Minus };
                const Icon = icons[point.type];
                return (
                  <div key={i} className={cn('p-4 rounded-xl border', colors[point.type])}>
                    <div className="flex items-center gap-1.5 mb-1">
                      <Icon className="w-3.5 h-3.5" />
                      <span className="font-mono font-bold text-sm">{point.value}</span>
                    </div>
                    <p className="text-[11px] text-[#9898A0]">{point.label}</p>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Problems — The Main Event */}
        {content.problems && content.problems.length > 0 && (
          <section className="mb-12">
            <h2 className="text-xl font-bold text-white mb-6">Detailed Findings & Solutions</h2>
            <div className="space-y-4">
              {content.problems.map((problem, i) => {
                const isExpanded = expandedProblem === i;
                return (
                  <div key={i} className={cn(
                    'bg-[#141418] border rounded-xl overflow-hidden transition-all cursor-pointer',
                    problem.severity === 'critical' ? 'border-red-500/30' : problem.severity === 'high' ? 'border-orange-500/20' : 'border-[#2A2A32]',
                    isExpanded && 'ring-1 ring-cyan-500/20'
                  )} onClick={() => setExpandedProblem(isExpanded ? null : i)}>
                    {/* Problem Header */}
                    <div className="p-5 flex items-center justify-between">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="text-lg font-mono font-bold text-[#5A5A66] shrink-0">#{i + 1}</span>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-white">{problem.title}</p>
                          <div className="flex items-center gap-2 mt-1.5">
                            <SeverityBadge severity={problem.severity} />
                            <span className="text-[10px] text-[#5A5A66] font-mono flex items-center gap-1">
                              <Clock className="w-3 h-3" /> {problem.timeline}
                            </span>
                          </div>
                        </div>
                      </div>
                      <span className="text-[#5A5A66] text-lg shrink-0 ml-4">{isExpanded ? '−' : '+'}</span>
                    </div>

                    {/* Expanded Detail */}
                    {isExpanded && (
                      <div className="px-5 pb-6 border-t border-[#2A2A32] pt-5 space-y-5">
                        {/* Finding */}
                        <div>
                          <div className="flex items-center gap-2 mb-2">
                            <span className="w-6 h-6 rounded-md bg-red-500/20 flex items-center justify-center">
                              <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
                            </span>
                            <h4 className="text-sm font-bold text-red-400 uppercase tracking-wide">What We Found</h4>
                          </div>
                          <p className="text-sm text-[#C8C8D0] leading-relaxed pl-8">{problem.finding}</p>
                        </div>

                        {/* Impact */}
                        <div>
                          <div className="flex items-center gap-2 mb-2">
                            <span className="w-6 h-6 rounded-md bg-amber-500/20 flex items-center justify-center">
                              <TrendingUp className="w-3.5 h-3.5 text-amber-400" />
                            </span>
                            <h4 className="text-sm font-bold text-amber-400 uppercase tracking-wide">Business Impact</h4>
                          </div>
                          <p className="text-sm text-[#C8C8D0] leading-relaxed pl-8">{problem.impact}</p>
                        </div>

                        {/* Solution */}
                        <div className="bg-green-500/5 border border-green-500/10 rounded-xl p-4">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="w-6 h-6 rounded-md bg-green-500/20 flex items-center justify-center">
                              <Check className="w-3.5 h-3.5 text-green-400" />
                            </span>
                            <h4 className="text-sm font-bold text-green-400 uppercase tracking-wide">Our Solution</h4>
                          </div>
                          <p className="text-sm text-[#C8C8D0] leading-relaxed pl-8">{problem.solution}</p>
                          <p className="text-xs text-[#5A5A66] font-mono pl-8 mt-2">Estimated timeline: {problem.timeline}</p>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Competitor Comparison Table */}
        {content.competitor_comparisons && content.competitor_comparisons.length > 0 && (
          <section className="mb-12">
            <h2 className="text-xl font-bold text-white mb-4">How You Compare to Competitors</h2>
            <div className="bg-[#141418] border border-[#2A2A32] rounded-xl overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[#2A2A32]">
                    <th className="text-left px-5 py-3.5 text-xs font-mono text-[#5A5A66] uppercase">Competitor</th>
                    <th className="text-left px-5 py-3.5 text-xs font-mono text-[#5A5A66] uppercase">Metric</th>
                    <th className="text-center px-5 py-3.5 text-xs font-mono text-[#5A5A66] uppercase">Them</th>
                    <th className="text-center px-5 py-3.5 text-xs font-mono text-[#5A5A66] uppercase">You</th>
                  </tr>
                </thead>
                <tbody>
                  {content.competitor_comparisons.map((comp, i) => (
                    <tr key={i} className="border-b border-[#2A2A32]/50">
                      <td className="px-5 py-3 text-sm text-white">{comp.competitor_name}</td>
                      <td className="px-5 py-3 text-sm text-[#9898A0]">{comp.metric}</td>
                      <td className={cn('px-5 py-3 text-sm text-center font-mono', comp.winner === 'them' ? 'text-green-400 font-bold' : 'text-[#9898A0]')}>{comp.their_value}</td>
                      <td className={cn('px-5 py-3 text-sm text-center font-mono', comp.winner === 'you' ? 'text-green-400 font-bold' : comp.winner === 'them' ? 'text-red-400' : 'text-[#9898A0]')}>{comp.your_value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Roadmap */}
        {content.roadmap && content.roadmap.length > 0 && (
          <section className="mb-12">
            <h2 className="text-xl font-bold text-white mb-6">Your Action Plan</h2>
            <div className="space-y-6">
              {content.roadmap.map((phase, i) => (
                <div key={i} className="relative pl-10">
                  <div className="absolute left-0 top-0 w-8 h-8 rounded-full bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center">
                    <span className="text-xs font-mono font-bold text-cyan-400">{i + 1}</span>
                  </div>
                  {i < content.roadmap.length - 1 && (
                    <div className="absolute left-[15px] top-8 bottom-0 w-[2px] bg-[#2A2A32]" style={{ height: 'calc(100% + 8px)' }} />
                  )}
                  <div className="bg-[#141418] border border-[#2A2A32] rounded-xl p-5">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="font-bold text-white">{phase.phase}</h3>
                      <span className="text-xs font-mono text-cyan-400 bg-cyan-500/10 border border-cyan-500/20 px-2.5 py-1 rounded-full">{phase.timeframe}</span>
                    </div>
                    <div className="space-y-2">
                      {phase.actions.map((action, j) => (
                        <div key={j} className="flex items-start gap-2">
                          <ArrowRight className="w-3.5 h-3.5 text-cyan-400 mt-0.5 shrink-0" />
                          <span className="text-sm text-[#C8C8D0]">{action}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Expected Results */}
        {content.result && (
          <section className="mb-12">
            <h2 className="text-xl font-bold text-white mb-4">Expected Results</h2>
            <div className="bg-gradient-to-r from-green-500/10 to-cyan-500/10 border border-green-500/20 rounded-2xl p-8">
              <TrendingUp className="w-8 h-8 text-green-400 mb-3" />
              <p className="text-lg text-[#E8E8EC] leading-relaxed">{content.result}</p>
            </div>
          </section>
        )}

        {/* CTA */}
        <div className="text-center bg-gradient-to-r from-cyan-500/10 to-purple-500/10 border border-cyan-500/20 rounded-2xl p-10">
          <h2 className="text-2xl font-bold text-white mb-3">Ready to Fix These Issues?</h2>
          <p className="text-[#9898A0] mb-6 max-w-lg mx-auto">{content.cta}</p>
          {pitch.calendar_url ? (
            <a href={pitch.calendar_url} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-8 py-4 bg-cyan-500 hover:bg-cyan-400 text-black font-bold rounded-xl transition-colors text-lg">
              <Calendar className="w-5 h-5" /> Book Your Free Strategy Call <ArrowRight className="w-5 h-5" />
            </a>
          ) : pitch.agency_email ? (
            <a href={`mailto:${pitch.agency_email}?subject=Re: ${pitch.title}`}
              className="inline-flex items-center gap-2 px-8 py-4 bg-cyan-500 hover:bg-cyan-400 text-black font-bold rounded-xl transition-colors text-lg">
              <Mail className="w-5 h-5" /> Get In Touch <ArrowRight className="w-5 h-5" />
            </a>
          ) : null}
        </div>

        {/* Footer */}
        {pitch.agency_name && (
          <div className="mt-12 pt-8 border-t border-[#2A2A32] text-center">
            <p className="text-xs text-[#5A5A66] font-mono">Prepared by {pitch.agency_name}</p>
          </div>
        )}
      </div>
    </div>
  );
}
