'use client';

import { useEffect, useState, useMemo } from 'react';
import { X, Download, Loader2, Check, FileText, Target, Users, AlertCircle, Building2, Mail } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

type Format = 'standard' | 'meta' | 'linkedin' | 'klaviyo' | 'mailchimp' | 'activecampaign' | 'skool';

interface Lead {
  id: string;
  business_name: string;
  niche: string | null;
  phone: string | null;
  phone_formatted: string | null;
  email: string | null;
  website: string | null;
  instagram_url: string | null;
  city: string | null;
  country: string | null;
  address: string | null;
  google_rating: number | null;
  google_review_count: number | null;
  source: string | null;
  lead_score: number | null;
  lead_priority: string | null;
  audit_score: number | null;
  created_at: string;
}

// ─── Meta country code map ──────────────────────────────
const COUNTRY_TO_ISO: Record<string, string> = {
  'united kingdom': 'GB',
  'uk': 'GB',
  'great britain': 'GB',
  'england': 'GB',
  'scotland': 'GB',
  'wales': 'GB',
  'northern ireland': 'GB',
  'united states': 'US',
  'usa': 'US',
  'us': 'US',
  'canada': 'CA',
  'australia': 'AU',
  'ireland': 'IE',
  'germany': 'DE',
  'france': 'FR',
  'spain': 'ES',
  'italy': 'IT',
  'netherlands': 'NL',
  'new zealand': 'NZ',
};
function isoCountry(country: string | null): string {
  if (!country) return '';
  return COUNTRY_TO_ISO[country.toLowerCase().trim()] || country;
}

// ─── CSV helpers ────────────────────────────────────────
function csvEscape(value: string | number | null | undefined): string {
  if (value == null) return '';
  const s = String(value);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function rowsToCsv(headers: string[], rows: Array<Array<string | number | null | undefined>>): string {
  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(row.map(csvEscape).join(','));
  }
  return lines.join('\n');
}

function downloadCsv(csv: string, filename: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function splitName(businessName: string): { fn: string; ln: string } {
  const trimmed = (businessName || '').trim();
  if (!trimmed) return { fn: '', ln: '' };
  const parts = trimmed.split(/\s+/);
  return { fn: parts[0] || '', ln: parts.slice(1).join(' ') };
}

// ─── Format builders ────────────────────────────────────

function buildStandardCsv(leads: Lead[]): string {
  const headers = [
    'business_name', 'niche', 'email', 'phone', 'website', 'instagram_url',
    'address', 'city', 'country', 'google_rating', 'google_review_count',
    'source', 'lead_score', 'lead_priority', 'audit_score', 'created_at',
  ];
  const rows = leads.map(l => [
    l.business_name,
    l.niche || '',
    l.email || '',
    l.phone_formatted || l.phone || '',
    l.website || '',
    l.instagram_url || '',
    l.address || '',
    l.city || '',
    l.country || '',
    l.google_rating ?? '',
    l.google_review_count ?? '',
    l.source || '',
    l.lead_score ?? '',
    l.lead_priority || '',
    l.audit_score ?? '',
    l.created_at,
  ]);
  return rowsToCsv(headers, rows);
}

// Meta Customer File (raw — Meta hashes server-side on upload).
// Headers per Meta's documented schema: email, phone, fn, ln, ct, country, extern_id
function buildMetaCsv(leads: Lead[]): string {
  const headers = ['email', 'phone', 'fn', 'ln', 'ct', 'country', 'extern_id'];
  const rows: Array<Array<string>> = [];
  for (const l of leads) {
    // Skip leads with neither email nor phone — Meta needs at least one match key
    if (!l.email && !l.phone && !l.phone_formatted) continue;
    const { fn, ln } = splitName(l.business_name);
    rows.push([
      (l.email || '').toLowerCase().trim(),
      (l.phone_formatted || l.phone || '').replace(/[^0-9+]/g, ''),
      fn,
      ln,
      (l.city || '').toLowerCase().trim(),
      isoCountry(l.country),
      l.id,
    ]);
  }
  return rowsToCsv(headers, rows);
}

// Skool invite list — single Email column. Skool also accepts Name,Email but
// since we have business names not person names, just email is safest.
function buildSkoolCsv(leads: Lead[]): string {
  const headers = ['Email'];
  const seen = new Set<string>();
  const rows: Array<Array<string>> = [];
  for (const l of leads) {
    const e = (l.email || '').toLowerCase().trim();
    if (!e || seen.has(e)) continue;
    seen.add(e);
    rows.push([e]);
  }
  return rowsToCsv(headers, rows);
}

// LinkedIn Matched Audience (contact-based). Campaign Manager hashes on upload.
// Headers per LinkedIn documented schema.
function buildLinkedInCsv(leads: Lead[]): string {
  const headers = ['email', 'firstname', 'lastname', 'companyname', 'country'];
  const rows: Array<Array<string>> = [];
  const seen = new Set<string>();
  for (const l of leads) {
    const e = (l.email || '').toLowerCase().trim();
    if (!e || seen.has(e)) continue;
    seen.add(e);
    const { fn, ln } = splitName(l.business_name);
    rows.push([e, fn, ln, l.business_name || '', isoCountry(l.country)]);
  }
  return rowsToCsv(headers, rows);
}

// Klaviyo list import. Phone in E.164 (we already store this as phone_formatted).
function buildKlaviyoCsv(leads: Lead[]): string {
  const headers = ['Email', 'First Name', 'Last Name', 'Phone Number', 'Organization', 'City', 'Country', 'Source'];
  const rows: Array<Array<string>> = [];
  const seen = new Set<string>();
  for (const l of leads) {
    const e = (l.email || '').toLowerCase().trim();
    if (!e || seen.has(e)) continue;
    seen.add(e);
    const { fn, ln } = splitName(l.business_name);
    rows.push([
      e,
      fn,
      ln,
      l.phone_formatted || l.phone || '',
      l.business_name || '',
      l.city || '',
      l.country || '',
      l.source || 'prospex',
    ]);
  }
  return rowsToCsv(headers, rows);
}

// Mailchimp Audience import. Tags column = comma-separated string Mailchimp parses.
function buildMailchimpCsv(leads: Lead[]): string {
  const headers = ['Email Address', 'First Name', 'Last Name', 'Phone', 'Company', 'City', 'Country', 'Tags'];
  const rows: Array<Array<string>> = [];
  const seen = new Set<string>();
  for (const l of leads) {
    const e = (l.email || '').toLowerCase().trim();
    if (!e || seen.has(e)) continue;
    seen.add(e);
    const { fn, ln } = splitName(l.business_name);
    const tags = ['prospex', l.source, l.lead_priority].filter(Boolean).join(',');
    rows.push([
      e,
      fn,
      ln,
      l.phone_formatted || l.phone || '',
      l.business_name || '',
      l.city || '',
      l.country || '',
      tags,
    ]);
  }
  return rowsToCsv(headers, rows);
}

// ActiveCampaign Contact import. Tags column space/comma separated.
function buildActiveCampaignCsv(leads: Lead[]): string {
  const headers = ['email', 'first_name', 'last_name', 'phone', 'company', 'city', 'country', 'tags'];
  const rows: Array<Array<string>> = [];
  const seen = new Set<string>();
  for (const l of leads) {
    const e = (l.email || '').toLowerCase().trim();
    if (!e || seen.has(e)) continue;
    seen.add(e);
    const { fn, ln } = splitName(l.business_name);
    const tags = ['prospex', l.source, l.lead_priority].filter(Boolean).join(',');
    rows.push([
      e,
      fn,
      ln,
      l.phone_formatted || l.phone || '',
      l.business_name || '',
      l.city || '',
      l.country || '',
      tags,
    ]);
  }
  return rowsToCsv(headers, rows);
}

// ═══════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════

export default function ExportLeadsModal({ isOpen, onClose }: Props) {
  const [countries, setCountries] = useState<string[]>([]);
  const [country, setCountry] = useState<string>(''); // '' = all
  const [format, setFormat] = useState<Format>('standard');
  const [matchCount, setMatchCount] = useState<number | null>(null);
  const [counting, setCounting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset on open
  useEffect(() => {
    if (!isOpen) return;
    setCountry('');
    setFormat('standard');
    setError(null);
  }, [isOpen]);

  // Load distinct countries
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('leads')
        .select('country')
        .not('country', 'is', null)
        .limit(10000);
      if (cancelled) return;
      const unique = Array.from(new Set((data || []).map(r => (r as { country: string }).country?.trim()).filter(Boolean))).sort();
      setCountries(unique);
    })();
    return () => { cancelled = true; };
  }, [isOpen]);

  // Per-format filter: 'none' | 'email_or_phone' | 'email'
  const formatFilter: Record<Format, 'none' | 'email_or_phone' | 'email'> = {
    standard: 'none',
    meta: 'email_or_phone',
    linkedin: 'email',
    klaviyo: 'email',
    mailchimp: 'email',
    activecampaign: 'email',
    skool: 'email',
  };

  // Live match count whenever country/format changes
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setCounting(true);
    (async () => {
      let q = supabase.from('leads').select('id', { count: 'exact', head: true });
      if (country) q = q.eq('country', country);
      const filter = formatFilter[format];
      if (filter === 'email') q = q.not('email', 'is', null);
      if (filter === 'email_or_phone') {
        q = q.or('email.not.is.null,phone.not.is.null,phone_formatted.not.is.null');
      }
      const { count, error: err } = await q;
      if (!cancelled) {
        if (err) setError(err.message);
        setMatchCount(count ?? 0);
        setCounting(false);
      }
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, country, format]);

  const formatMeta = useMemo(() => {
    const map: Record<Format, { name: string; help: string }> = {
      standard: { name: 'Standard CSV', help: 'All useful fields for spreadsheets, your CRM, or another tool. Includes business name, contact, scores, and metadata.' },
      meta: { name: 'Meta Custom Audience', help: 'Upload to Meta Ads Manager → Audiences → Create → Custom Audience → Customer List. Meta hashes data on upload.' },
      linkedin: { name: 'LinkedIn Matched Audience', help: 'Upload to LinkedIn Campaign Manager → Audiences → Create → Upload a list. Campaign Manager hashes data on upload.' },
      klaviyo: { name: 'Klaviyo List', help: 'Upload to Klaviyo → Lists & Segments → your list → Manage members → Import contacts. Includes Source for segmentation.' },
      mailchimp: { name: 'Mailchimp Audience', help: 'Upload to Mailchimp → Audience → All contacts → Add contacts → Import contacts. Tags column auto-populated for segmentation.' },
      activecampaign: { name: 'ActiveCampaign Contacts', help: 'Upload to ActiveCampaign → Contacts → Import. Tags column auto-populated for segmentation.' },
      skool: { name: 'Skool Invite List', help: 'Upload to your Skool community → Members → Invite → Bulk Upload. Single Email column, deduplicated, lowercased.' },
    };
    return map[format];
  }, [format]);

  const handleExport = async () => {
    setExporting(true);
    setError(null);
    try {
      // Paginate to handle large lead lists
      const PAGE = 1000;
      let from = 0;
      const all: Lead[] = [];
      const SELECT = 'id, business_name, niche, phone, phone_formatted, email, website, instagram_url, city, country, address, google_rating, google_review_count, source, lead_score, lead_priority, audit_score, created_at';
      // Pagination loop
      // eslint-disable-next-line no-constant-condition
      while (true) {
        let q = supabase.from('leads').select(SELECT).order('created_at', { ascending: false }).range(from, from + PAGE - 1);
        if (country) q = q.eq('country', country);
        const filter = formatFilter[format];
        if (filter === 'email') q = q.not('email', 'is', null);
        if (filter === 'email_or_phone') {
          q = q.or('email.not.is.null,phone.not.is.null,phone_formatted.not.is.null');
        }
        const { data, error: err } = await q;
        if (err) throw new Error(err.message);
        const batch = (data || []) as unknown as Lead[];
        all.push(...batch);
        if (batch.length < PAGE) break;
        from += PAGE;
        if (all.length > 50000) break; // safety cap
      }

      if (all.length === 0) {
        setError('No leads matched. Adjust the country filter or format and try again.');
        setExporting(false);
        return;
      }

      const builders: Record<Format, { build: (l: Lead[]) => string; suffix: string }> = {
        standard: { build: buildStandardCsv, suffix: 'leads' },
        meta: { build: buildMetaCsv, suffix: 'meta-custom-audience' },
        linkedin: { build: buildLinkedInCsv, suffix: 'linkedin-matched-audience' },
        klaviyo: { build: buildKlaviyoCsv, suffix: 'klaviyo' },
        mailchimp: { build: buildMailchimpCsv, suffix: 'mailchimp' },
        activecampaign: { build: buildActiveCampaignCsv, suffix: 'activecampaign' },
        skool: { build: buildSkoolCsv, suffix: 'skool-invites' },
      };
      const { build, suffix } = builders[format];
      const csv = build(all);

      const datestamp = new Date().toISOString().slice(0, 10);
      const countrySlug = country ? `-${country.toLowerCase().replace(/[^a-z0-9]+/g, '-')}` : '-all';
      downloadCsv(csv, `prospex${countrySlug}-${suffix}-${datestamp}.csv`);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  if (!isOpen) return null;

  const formatGroups: Array<{
    label: string;
    items: Array<{ key: Format; label: string; help: string; icon: typeof FileText }>;
  }> = [
    {
      label: 'General',
      items: [
        { key: 'standard', label: 'Standard CSV', help: 'All fields — for spreadsheets / CRM', icon: FileText },
      ],
    },
    {
      label: 'Ad Audiences',
      items: [
        { key: 'meta', label: 'Meta Custom Audience', help: 'Meta Ads Manager customer-list audiences', icon: Target },
        { key: 'linkedin', label: 'LinkedIn Matched Audience', help: 'LinkedIn Campaign Manager contact-list audiences', icon: Building2 },
      ],
    },
    {
      label: 'Email Marketing',
      items: [
        { key: 'klaviyo', label: 'Klaviyo List', help: 'Klaviyo list/segment import', icon: Mail },
        { key: 'mailchimp', label: 'Mailchimp Audience', help: 'Mailchimp audience import (with tags)', icon: Mail },
        { key: 'activecampaign', label: 'ActiveCampaign', help: 'ActiveCampaign contact import (with tags)', icon: Mail },
      ],
    },
    {
      label: 'Community',
      items: [
        { key: 'skool', label: 'Skool Invite List', help: 'Single Email column for Skool bulk invites', icon: Users },
      ],
    },
  ];

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-prospex-surface border border-prospex-border rounded-xl w-full max-w-xl mx-2 md:mx-auto max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="p-4 border-b border-prospex-border flex items-center justify-between">
          <h2 className="text-sm font-mono font-bold text-prospex-text flex items-center gap-2">
            <Download className="w-4 h-4 text-prospex-cyan" /> Export Leads
          </h2>
          <button onClick={onClose} className="text-prospex-dim hover:text-prospex-text" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-4 overflow-y-auto">
          {/* Country */}
          <div>
            <label className="text-[10px] font-mono text-prospex-dim uppercase block mb-1">Country</label>
            <select value={country} onChange={e => setCountry(e.target.value)} className="input w-full">
              <option value="">All countries</option>
              {countries.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          {/* Format */}
          <div>
            <label className="text-[10px] font-mono text-prospex-dim uppercase block mb-2">Export Format</label>
            <div className="space-y-3">
              {formatGroups.map(group => (
                <div key={group.label}>
                  <p className="text-[9px] font-mono text-prospex-dim uppercase tracking-wider mb-1.5">{group.label}</p>
                  <div className="space-y-1.5">
                    {group.items.map(f => {
                      const Icon = f.icon;
                      const active = format === f.key;
                      return (
                        <button key={f.key} onClick={() => setFormat(f.key)}
                          className={cn('w-full text-left p-3 rounded-lg border transition-colors flex items-start gap-3',
                            active
                              ? 'bg-prospex-cyan/10 border-prospex-cyan/40'
                              : 'bg-prospex-bg border-prospex-border hover:border-prospex-cyan/30')}>
                          <Icon className={cn('w-4 h-4 mt-0.5 shrink-0', active ? 'text-prospex-cyan' : 'text-prospex-dim')} />
                          <div className="min-w-0">
                            <p className={cn('text-xs font-medium', active ? 'text-prospex-cyan' : 'text-prospex-text')}>{f.label}</p>
                            <p className="text-[10px] text-prospex-dim mt-0.5">{f.help}</p>
                          </div>
                          {active && <Check className="w-3.5 h-3.5 text-prospex-cyan ml-auto mt-0.5 shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Live count + format-specific hint */}
          <div className="p-3 bg-prospex-bg border border-prospex-border rounded-lg space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono text-prospex-dim uppercase">Will export</span>
              {counting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-prospex-dim" />
              ) : (
                <span className="text-sm font-mono font-bold text-prospex-cyan">{matchCount ?? 0} leads</span>
              )}
            </div>
            <p className="text-[10px] text-prospex-muted leading-relaxed">{formatMeta.help}</p>
            {format === 'meta' && (
              <p className="text-[10px] text-amber-400 mt-1">
                ⚠️ Only leads with an email or phone are included. Country codes are mapped to ISO-2 (GB, US, CA, AU, IE) where possible.
              </p>
            )}
            {format === 'linkedin' && (
              <p className="text-[10px] text-amber-400 mt-1">
                ⚠️ Only leads with an email are included; duplicates removed. Country codes mapped to ISO-2.
              </p>
            )}
            {(format === 'klaviyo' || format === 'mailchimp' || format === 'activecampaign' || format === 'skool') && (
              <p className="text-[10px] text-amber-400 mt-1">
                ⚠️ Only leads with an email are included; duplicates are removed.
              </p>
            )}
          </div>

          {error && (
            <div className="p-3 bg-prospex-red/10 border border-prospex-red/30 rounded-lg flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-prospex-red shrink-0 mt-0.5" />
              <p className="text-xs text-prospex-red">{error}</p>
            </div>
          )}
        </div>

        <div className="p-4 border-t border-prospex-border flex items-center justify-end gap-2">
          <button onClick={onClose} className="btn-ghost text-xs">Cancel</button>
          <button onClick={handleExport} disabled={exporting || matchCount === 0 || counting} className="btn-primary text-xs disabled:opacity-50">
            {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
            Download {matchCount !== null && matchCount > 0 ? `(${matchCount})` : ''}
          </button>
        </div>
      </div>
    </div>
  );
}
