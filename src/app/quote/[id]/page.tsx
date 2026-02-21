'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  AlertCircle, Check, Phone, Mail, Globe, Calendar, ArrowRight,
  Clock, FileText, CheckCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface QuoteService {
  name: string;
  description: string;
  price: number;
  frequency: string;
}

interface QuoteContent {
  services: QuoteService[];
  subtotal: number;
  discount: number;
  discount_amount: number;
  total: number;
  currency: string;
  valid_until: string;
  notes: string;
  payment_terms: string;
}

interface Quote {
  id: string;
  title: string;
  content: QuoteContent;
  total_amount: number;
  currency: string;
  valid_until: string;
  status: string;
  agency_name: string | null;
  agency_email: string | null;
  agency_phone: string | null;
  agency_website: string | null;
  agency_logo_url: string | null;
  calendar_url: string | null;
}

function ensureUrl(url: string | null): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
  return `https://${trimmed}`;
}

function formatFreq(freq: string): string {
  const map: Record<string, string> = { monthly: '/mo', 'one-time': ' (one-time)', quarterly: '/quarter', yearly: '/year' };
  return map[freq] || `/${freq}`;
}

export default function QuotePage() {
  const params = useParams();
  const quoteId = params.id as string;
  const [quote, setQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/quote?quoteId=${quoteId}`)
      .then(r => r.json())
      .then(data => { setQuote(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [quoteId]);

  if (loading) return (
    <div className="min-h-screen bg-[#0A0A0F] flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-cyan-400/30 border-t-cyan-400 rounded-full animate-spin" />
    </div>
  );

  if (!quote) return (
    <div className="min-h-screen bg-[#0A0A0F] flex flex-col items-center justify-center text-center">
      <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-3" />
      <p className="text-lg text-white font-mono">Quote not found</p>
    </div>
  );

  const content = quote.content;
  const isExpired = new Date(quote.valid_until) < new Date();
  const validDate = new Date(quote.valid_until).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <div className="min-h-screen bg-[#0A0A0F]">
      {/* Agency Header */}
      {quote.agency_name && (
        <div className="bg-[#141418] border-b border-[#2A2A32] px-6 py-3 sticky top-0 z-50">
          <div className="max-w-3xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-3">
              {quote.agency_logo_url && <img src={quote.agency_logo_url} alt="" className="w-8 h-8 rounded object-cover" />}
              <span className="font-mono font-bold text-white text-sm">{quote.agency_name}</span>
            </div>
            <div className="flex items-center gap-4 text-xs text-[#9898A0]">
              {quote.agency_phone && <a href={`tel:${quote.agency_phone}`} className="flex items-center gap-1 hover:text-cyan-400"><Phone className="w-3 h-3" />{quote.agency_phone}</a>}
              {quote.agency_email && <a href={`mailto:${quote.agency_email}`} className="flex items-center gap-1 hover:text-cyan-400"><Mail className="w-3 h-3" />{quote.agency_email}</a>}
              {quote.agency_website && <a href={ensureUrl(quote.agency_website)!} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:text-cyan-400"><Globe className="w-3 h-3" />Website</a>}
            </div>
          </div>
        </div>
      )}

      <div className="max-w-3xl mx-auto px-6 py-12">
        {/* Title */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-xs font-mono mb-4">
            <FileText className="w-3.5 h-3.5" /> Service Proposal
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">{quote.title}</h1>
          <div className="flex items-center justify-center gap-4 text-xs text-[#9898A0]">
            <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> Valid until {validDate}</span>
            {isExpired && <span className="text-red-400 font-bold">EXPIRED</span>}
            {quote.status === 'accepted' && <span className="flex items-center gap-1 text-green-400"><CheckCircle className="w-3 h-3" /> Accepted</span>}
          </div>
        </div>

        {/* Services Table */}
        <div className="bg-[#141418] border border-[#2A2A32] rounded-2xl overflow-hidden mb-8">
          <div className="px-6 py-4 border-b border-[#2A2A32]">
            <h2 className="font-bold text-white">Services Included</h2>
          </div>
          <div className="divide-y divide-[#2A2A32]/50">
            {content.services.map((service, i) => (
              <div key={i} className="px-6 py-5 flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-cyan-400 shrink-0" />
                    <h3 className="text-sm font-semibold text-white">{service.name}</h3>
                  </div>
                  {service.description && (
                    <p className="text-xs text-[#9898A0] mt-1.5 pl-6 leading-relaxed">{service.description}</p>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <p className="text-lg font-mono font-bold text-white">{content.currency}{service.price.toLocaleString()}</p>
                  <p className="text-[10px] text-[#5A5A66] font-mono">{formatFreq(service.frequency)}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Totals */}
          <div className="px-6 py-5 bg-[#0D0D12] border-t border-[#2A2A32]">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-[#9898A0]">Subtotal</span>
              <span className="text-sm font-mono text-[#9898A0]">{content.currency}{content.subtotal.toLocaleString()}</span>
            </div>
            {content.discount > 0 && (
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-green-400">Discount ({content.discount}%)</span>
                <span className="text-sm font-mono text-green-400">-{content.currency}{content.discount_amount.toLocaleString()}</span>
              </div>
            )}
            <div className="flex items-center justify-between pt-3 border-t border-[#2A2A32]">
              <span className="text-lg font-bold text-white">Total</span>
              <span className="text-2xl font-mono font-bold text-cyan-400">{content.currency}{content.total.toLocaleString()}<span className="text-sm text-[#5A5A66]">/mo</span></span>
            </div>
          </div>
        </div>

        {/* Notes */}
        {content.notes && (
          <div className="bg-[#141418] border border-[#2A2A32] rounded-xl p-6 mb-8">
            <h3 className="text-sm font-bold text-white mb-2">Notes</h3>
            <p className="text-sm text-[#9898A0] leading-relaxed whitespace-pre-wrap">{content.notes}</p>
          </div>
        )}

        {/* Payment Terms */}
        <div className="bg-[#141418] border border-[#2A2A32] rounded-xl p-6 mb-10">
          <h3 className="text-sm font-bold text-white mb-2">Terms & Conditions</h3>
          <p className="text-xs text-[#9898A0] leading-relaxed">{content.payment_terms}</p>
        </div>

        {/* CTA */}
        {!isExpired && quote.status !== 'accepted' && (
          <div className="text-center bg-gradient-to-r from-cyan-500/10 to-purple-500/10 border border-cyan-500/20 rounded-2xl p-10">
            <h2 className="text-2xl font-bold text-white mb-3">Ready to Get Started?</h2>
            <p className="text-[#9898A0] mb-6">Accept this quote and let&apos;s begin transforming your digital presence.</p>
            {quote.calendar_url ? (
              <a href={ensureUrl(quote.calendar_url)!} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-8 py-4 bg-cyan-500 hover:bg-cyan-400 text-black font-bold rounded-xl transition-colors text-lg">
                <Calendar className="w-5 h-5" /> Book Your Onboarding Call <ArrowRight className="w-5 h-5" />
              </a>
            ) : quote.agency_email ? (
              <a href={`mailto:${quote.agency_email}?subject=I'd like to accept: ${quote.title}`}
                className="inline-flex items-center gap-2 px-8 py-4 bg-cyan-500 hover:bg-cyan-400 text-black font-bold rounded-xl transition-colors text-lg">
                <Mail className="w-5 h-5" /> Accept & Get Started <ArrowRight className="w-5 h-5" />
              </a>
            ) : null}
          </div>
        )}

        {/* Footer */}
        {quote.agency_name && (
          <div className="mt-12 pt-8 border-t border-[#2A2A32] text-center">
            <p className="text-xs text-[#5A5A66] font-mono">Prepared by {quote.agency_name}</p>
          </div>
        )}
      </div>
    </div>
  );
}
