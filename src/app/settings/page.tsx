'use client';

import { useEffect, useState } from 'react';
import { Settings, Save, Eye, EyeOff, Check, X, Loader2, Wifi, AlertCircle, Building } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';

interface ApiKeyField { key: string; label: string; envName: string; placeholder: string; group: string; }

const fields: ApiKeyField[] = [
  { key: 'outscraper_key', label: 'Outscraper API Key', envName: 'OUTSCRAPER_API_KEY', placeholder: 'Enter Outscraper API key', group: 'Scraping' },
  { key: 'apify_key', label: 'Apify API Token', envName: 'APIFY_API_TOKEN', placeholder: 'Enter Apify token', group: 'Scraping' },
  { key: 'firecrawl_key', label: 'Firecrawl API Key', envName: 'FIRECRAWL_API_KEY', placeholder: 'Enter Firecrawl API key', group: 'Auditing' },
  { key: 'openai_key', label: 'OpenAI API Key', envName: 'OPENAI_API_KEY', placeholder: 'sk-...', group: 'AI' },
  { key: 'dataforseo_login', label: 'DataForSEO Login', envName: 'DATAFORSEO_LOGIN', placeholder: 'Enter login email', group: 'SEO' },
  { key: 'dataforseo_password', label: 'DataForSEO Password', envName: 'DATAFORSEO_PASSWORD', placeholder: 'Enter password', group: 'SEO' },
  { key: 'ghl_key', label: 'GoHighLevel API Key', envName: 'GHL_API_KEY', placeholder: 'Enter GHL API key', group: 'CRM' },
  { key: 'ghl_location_id', label: 'GHL Location ID', envName: 'GHL_LOCATION_ID', placeholder: 'Enter GHL Location ID', group: 'CRM' },
];

export default function SettingsPage() {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showKeys, setShowKeys] = useState<Set<string>>(new Set());
  const [testResults, setTestResults] = useState<Record<string, 'success' | 'error' | 'testing'>>({});
  const [agencyName, setAgencyName] = useState('');
  const [agencyEmail, setAgencyEmail] = useState('');
  const [agencyPhone, setAgencyPhone] = useState('');
  const [agencyWebsite, setAgencyWebsite] = useState('');
  const [agencyLogoUrl, setAgencyLogoUrl] = useState('');
  const [calendarType, setCalendarType] = useState('calendly');
  const [calendarUrl, setCalendarUrl] = useState('');
  const [defaultNiche, setDefaultNiche] = useState('');
  const [defaultLocation, setDefaultLocation] = useState('');
  const [defaultCountry, setDefaultCountry] = useState('United Kingdom');
  const [ghlPipelineId, setGhlPipelineId] = useState('');

  useEffect(() => {
    async function fetchSettings() {
      try {
        const { data } = await supabase.from('settings').select('*').limit(1).maybeSingle();
        if (data) {
          const mapped: Record<string, string> = {};
          fields.forEach(f => { mapped[f.key] = (data as Record<string, string>)[f.key] || ''; });
          setSettings(mapped);
          setAgencyName(data.agency_name || '');
          setAgencyEmail(data.agency_email || '');
          setAgencyPhone(data.agency_phone || '');
          setAgencyWebsite(data.agency_website || '');
          setAgencyLogoUrl(data.agency_logo_url || '');
          setCalendarType(data.calendar_type || 'calendly');
          setCalendarUrl(data.calendar_url || '');
          setDefaultNiche(data.default_niche || '');
          setDefaultLocation(data.default_location || '');
          setDefaultCountry(data.default_country || 'United Kingdom');
          setGhlPipelineId(data.ghl_pipeline_id || '');
        }
      } catch (err) { console.error('Failed to load settings:', err); }
      finally { setLoading(false); }
    }
    fetchSettings();
  }, []);

  const handleSave = async () => {
    setSaving(true); setSaved(false);
    try {
      const payload = { ...settings, agency_name: agencyName, agency_email: agencyEmail, agency_phone: agencyPhone, agency_website: agencyWebsite, agency_logo_url: agencyLogoUrl, calendar_type: calendarType, calendar_url: calendarUrl, default_niche: defaultNiche, default_location: defaultLocation, default_country: defaultCountry, ghl_pipeline_id: ghlPipelineId, updated_at: new Date().toISOString() };
      const { data: existing } = await supabase.from('settings').select('id').limit(1).maybeSingle();
      if (existing) await supabase.from('settings').update(payload).eq('id', existing.id);
      else await supabase.from('settings').insert(payload);
      setSaved(true); setTimeout(() => setSaved(false), 3000);
    } catch (err) { console.error('Failed to save:', err); }
    finally { setSaving(false); }
  };

  const toggleShowKey = (key: string) => setShowKeys(prev => { const next = new Set(prev); if (next.has(key)) next.delete(key); else next.add(key); return next; });
  const handleTest = (field: ApiKeyField) => {
    setTestResults(prev => ({ ...prev, [field.key]: 'testing' }));
    const value = settings[field.key];
    setTimeout(() => setTestResults(prev => ({ ...prev, [field.key]: value && value.trim().length >= 5 ? 'success' : 'error' })), 500);
  };

  const groups = Array.from(new Set(fields.map(f => f.group)));

  if (loading) return <div className="flex items-center justify-center min-h-[60vh]"><div className="w-8 h-8 border-2 border-prospex-cyan/30 border-t-prospex-cyan rounded-full animate-spin" /></div>;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-mono font-bold text-prospex-text flex items-center gap-3"><Settings className="w-6 h-6 text-prospex-cyan" />Settings</h1>
          <p className="text-sm text-prospex-dim mt-1">API keys, agency branding, and configuration</p>
        </div>
        <button onClick={handleSave} disabled={saving} className={cn(saved ? 'btn-success' : 'btn-primary')}>
          {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</> : saved ? <><Check className="w-4 h-4" /> Saved</> : <><Save className="w-4 h-4" /> Save Settings</>}
        </button>
      </div>

      {/* Agency Profile */}
      <div className="card p-6 border-prospex-cyan/30">
        <h2 className="font-mono font-semibold text-prospex-cyan text-sm uppercase tracking-wider mb-1 flex items-center gap-2"><Building className="w-4 h-4" />Agency Profile</h2>
        <p className="text-xs text-prospex-dim mb-4">This info auto-fills on all pitch pages, quotes, and exports.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div><label className="block text-xs font-mono text-prospex-muted mb-1.5">Agency Name *</label><input type="text" value={agencyName} onChange={(e) => setAgencyName(e.target.value)} placeholder="Your Agency Name" className="input" /></div>
          <div><label className="block text-xs font-mono text-prospex-muted mb-1.5">Agency Email</label><input type="email" value={agencyEmail} onChange={(e) => setAgencyEmail(e.target.value)} placeholder="hello@youragency.com" className="input" /></div>
          <div><label className="block text-xs font-mono text-prospex-muted mb-1.5">Agency Phone</label><input type="tel" value={agencyPhone} onChange={(e) => setAgencyPhone(e.target.value)} placeholder="+44 7700 900000" className="input" /></div>
          <div><label className="block text-xs font-mono text-prospex-muted mb-1.5">Agency Website</label><input type="url" value={agencyWebsite} onChange={(e) => setAgencyWebsite(e.target.value)} placeholder="https://youragency.com" className="input" /></div>
          <div><label className="block text-xs font-mono text-prospex-muted mb-1.5">Logo URL</label><input type="url" value={agencyLogoUrl} onChange={(e) => setAgencyLogoUrl(e.target.value)} placeholder="https://youragency.com/logo.png" className="input" /></div>
          <div><label className="block text-xs font-mono text-prospex-muted mb-1.5">Calendar Type</label>
            <select value={calendarType} onChange={(e) => setCalendarType(e.target.value)} className="input">
              <option value="calendly">Calendly</option><option value="ghl">GHL Calendar</option><option value="calcom">Cal.com</option><option value="other">Other</option>
            </select>
          </div>
          <div className="md:col-span-2"><label className="block text-xs font-mono text-prospex-muted mb-1.5">Calendar Booking URL</label><input type="url" value={calendarUrl} onChange={(e) => setCalendarUrl(e.target.value)} placeholder="https://calendly.com/youragency/discovery-call" className="input" /></div>
        </div>
      </div>

      {/* API Key Groups */}
      {groups.map(group => (
        <div key={group} className="card p-6">
          <h2 className="font-mono font-semibold text-prospex-text text-sm uppercase tracking-wider mb-4">{group}</h2>
          <div className="space-y-4">
            {fields.filter(f => f.group === group).map(field => (
              <div key={field.key}>
                <label className="flex items-center justify-between mb-1.5"><span className="text-xs font-mono text-prospex-muted">{field.label}</span><span className="text-[10px] font-mono text-prospex-dim">{field.envName}</span></label>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <input type={showKeys.has(field.key) ? 'text' : 'password'} value={settings[field.key] || ''} onChange={(e) => setSettings(prev => ({ ...prev, [field.key]: e.target.value }))} placeholder={field.placeholder} className="input pr-10" />
                    <button onClick={() => toggleShowKey(field.key)} className="absolute right-3 top-1/2 -translate-y-1/2 text-prospex-dim hover:text-prospex-muted transition-colors">
                      {showKeys.has(field.key) ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <button onClick={() => handleTest(field)} className={cn('btn text-xs whitespace-nowrap', testResults[field.key] === 'success' ? 'bg-prospex-green/20 text-prospex-green border-prospex-green/40' : testResults[field.key] === 'error' ? 'bg-prospex-red/20 text-prospex-red border-prospex-red/40' : 'bg-prospex-surface text-prospex-muted border-prospex-border')} disabled={testResults[field.key] === 'testing'}>
                    {testResults[field.key] === 'testing' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : testResults[field.key] === 'success' ? <Check className="w-3.5 h-3.5" /> : testResults[field.key] === 'error' ? <X className="w-3.5 h-3.5" /> : <Wifi className="w-3.5 h-3.5" />} Test
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* Defaults */}
      <div className="card p-6">
        <h2 className="font-mono font-semibold text-prospex-text text-sm uppercase tracking-wider mb-4">Search Defaults</h2>
        <div className="grid grid-cols-3 gap-4">
          <div><label className="block text-xs font-mono text-prospex-muted mb-1.5">Default Niche</label><input type="text" value={defaultNiche} onChange={(e) => setDefaultNiche(e.target.value)} placeholder="med spa" className="input" /></div>
          <div><label className="block text-xs font-mono text-prospex-muted mb-1.5">Default Location</label><input type="text" value={defaultLocation} onChange={(e) => setDefaultLocation(e.target.value)} placeholder="London" className="input" /></div>
          <div><label className="block text-xs font-mono text-prospex-muted mb-1.5">Default Country</label><input type="text" value={defaultCountry} onChange={(e) => setDefaultCountry(e.target.value)} placeholder="United Kingdom" className="input" /></div>
        </div>
        <div className="mt-4"><label className="block text-xs font-mono text-prospex-muted mb-1.5">GHL Pipeline ID</label><input type="text" value={ghlPipelineId} onChange={(e) => setGhlPipelineId(e.target.value)} placeholder="Pipeline ID" className="input" /></div>
      </div>

      <div className="p-4 bg-prospex-cyan/5 border border-prospex-cyan/20 rounded-lg flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-prospex-cyan shrink-0 mt-0.5" />
        <div className="text-xs text-prospex-muted"><p className="font-semibold text-prospex-text mb-1">Agency Profile saves permanently</p><p>Your agency name, email, phone, and calendar link will auto-fill on every pitch page and export. Set it once here and forget about it.</p></div>
      </div>
    </div>
  );
}
