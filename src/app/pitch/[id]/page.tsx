'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { AlertCircle, Check, X, Minus, ArrowRight, Phone, Mail, Globe, Calendar, TrendingUp, BarChart3 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Pitch, PitchContent, PitchDataPoint } from '@/lib/types';

function DataPointBadge({ point }: { point: PitchDataPoint }) {
  const colors = { positive: 'bg-green-500/20 text-green-400 border-green-500/40', negative: 'bg-red-500/20 text-red-400 border-red-500/40', neutral: 'bg-gray-500/20 text-gray-400 border-gray-500/40' };
  const icons = { positive: Check, negative: X, neutral: Minus };
  const Icon = icons[point.type];
  return (
    <div className={cn('flex items-center justify-between p-3 rounded-lg border', colors[point.type])}>
      <span className="text-sm">{point.label}</span>
      <span className="flex items-center gap-1 font-mono font-bold text-sm"><Icon className="w-3.5 h-3.5" /> {point.value}</span>
    </div>
  );
}

export default function PitchPage() {
  const params = useParams();
  const pitchId = params.id as string;
  const [pitch, setPitch] = useState<Pitch | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/pitch?pitchId=${pitchId}`).then(r => r.json()).then(data => { setPitch(data); setLoading(false); }).catch(() => setLoading(false));
  }, [pitchId]);

  if (loading) return (
    <div className="min-h-screen bg-[#0A0A0F] flex items-center justify-center"><div className="w-8 h-8 border-2 border-cyan-400/30 border-t-cyan-400 rounded-full animate-spin" /></div>
  );

  if (!pitch) return (
    <div className="min-h-screen bg-[#0A0A0F] flex items-center justify-center text-center"><AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-3" /><p className="text-lg text-white font-mono">Pitch not found</p></div>
  );

  const content = pitch.content as PitchContent;

  return (
    <div className="min-h-screen bg-[#0A0A0F]">
      {/* Header Bar */}
      {pitch.agency_name && (
        <div className="bg-[#141418] border-b border-[#2A2A32] px-6 py-3">
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

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-6 py-12">
        {/* Title */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-xs font-mono mb-4">
            <BarChart3 className="w-3.5 h-3.5" /> Prepared exclusively for you
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-white leading-tight">{pitch.title}</h1>
        </div>

        {/* Hook */}
        <div className="bg-gradient-to-r from-cyan-500/10 to-blue-500/10 border border-cyan-500/20 rounded-2xl p-8 mb-8">
          <p className="text-lg text-[#E8E8EC] leading-relaxed">{content.hook}</p>
        </div>

        {/* The Problem */}
        <section className="mb-10">
          <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
            <span className="w-8 h-8 rounded-lg bg-red-500/20 flex items-center justify-center text-red-400 text-sm font-mono">1</span>
            The Problem
          </h2>
          <p className="text-[#9898A0] leading-relaxed">{content.problem}</p>
        </section>

        {/* Data Points */}
        {content.data_points && content.data_points.length > 0 && (
          <section className="mb-10">
            <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
              <span className="w-8 h-8 rounded-lg bg-amber-500/20 flex items-center justify-center text-amber-400 text-sm font-mono">2</span>
              What Our Audit Found
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {content.data_points.map((point, i) => <DataPointBadge key={i} point={point} />)}
            </div>
          </section>
        )}

        {/* Competitor Comparisons */}
        {content.competitor_comparisons && content.competitor_comparisons.length > 0 && (
          <section className="mb-10">
            <h2 className="text-xl font-bold text-white mb-4">Competitive Landscape</h2>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead><tr className="border-b border-[#2A2A32]">
                  <th className="text-left px-4 py-3 text-xs font-mono text-[#5A5A66] uppercase">Competitor</th>
                  <th className="text-left px-4 py-3 text-xs font-mono text-[#5A5A66] uppercase">Metric</th>
                  <th className="text-center px-4 py-3 text-xs font-mono text-[#5A5A66] uppercase">Them</th>
                  <th className="text-center px-4 py-3 text-xs font-mono text-[#5A5A66] uppercase">You</th>
                </tr></thead>
                <tbody>
                  {content.competitor_comparisons.map((comp, i) => (
                    <tr key={i} className="border-b border-[#2A2A32]/50">
                      <td className="px-4 py-3 text-sm text-white">{comp.competitor_name}</td>
                      <td className="px-4 py-3 text-sm text-[#9898A0]">{comp.metric}</td>
                      <td className={cn('px-4 py-3 text-sm text-center font-mono', comp.winner === 'them' ? 'text-green-400' : 'text-[#9898A0]')}>{comp.their_value}</td>
                      <td className={cn('px-4 py-3 text-sm text-center font-mono', comp.winner === 'you' ? 'text-green-400' : 'text-red-400')}>{comp.your_value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* The Proof */}
        <section className="mb-10">
          <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
            <span className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center text-blue-400 text-sm font-mono">3</span>
            The Evidence
          </h2>
          <p className="text-[#9898A0] leading-relaxed">{content.proof}</p>
        </section>

        {/* The Solution */}
        <section className="mb-10">
          <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
            <span className="w-8 h-8 rounded-lg bg-green-500/20 flex items-center justify-center text-green-400 text-sm font-mono">4</span>
            The Solution
          </h2>
          <p className="text-[#9898A0] leading-relaxed">{content.solution}</p>
        </section>

        {/* The Result */}
        <section className="mb-12">
          <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
            <span className="w-8 h-8 rounded-lg bg-cyan-500/20 flex items-center justify-center text-cyan-400 text-sm font-mono">5</span>
            Expected Results
          </h2>
          <div className="bg-[#141418] border border-[#2A2A32] rounded-xl p-6">
            <TrendingUp className="w-8 h-8 text-green-400 mb-3" />
            <p className="text-[#E8E8EC] leading-relaxed text-lg">{content.result}</p>
          </div>
        </section>

        {/* CTA */}
        <div className="text-center bg-gradient-to-r from-cyan-500/10 to-purple-500/10 border border-cyan-500/20 rounded-2xl p-10">
          <h2 className="text-2xl font-bold text-white mb-3">Ready to Get Started?</h2>
          <p className="text-[#9898A0] mb-6">{content.cta}</p>
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
