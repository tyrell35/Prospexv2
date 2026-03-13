'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Rocket, Search, Users, Loader2, AlertTriangle, CheckCircle,
  MessageCircle, Mail, Instagram, Plus, Play, Sparkles, Target,
  Clock, Send, Copy, ExternalLink, Check, RefreshCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';

interface Lead {
  id: string; business_name: string; email: string | null; phone: string | null;
  whatsapp_eligible: boolean; instagram_handle: string | null; instagram_verified: boolean;
  website: string | null; city: string | null; niche: string | null;
  google_rating: number | null; lead_score: number | null; data_completeness: number;
  has_email: boolean; has_pixel: boolean;
}
interface Sequence { id: string; name: string; channel: string; status: string; steps: any[]; ai_tone: string; total_enrolled: number; total_sent: number; total_replied: number; }
interface ManualItem { id: string; lead_id: string; business_name: string; handle: string; channel: string; message: string; dm_link: string | null; step: number; }

const CHANNELS = [
  { id: 'instagram', label: 'Instagram DM', icon: Instagram, color: '#ec4899' },
  { id: 'whatsapp', label: 'WhatsApp', icon: MessageCircle, color: '#10b981' },
  { id: 'email', label: 'Email', icon: Mail, color: '#3b82f6' },
];

function PhonePreview({ message, channel, name }: { message: string; channel: string; name: string }) {
  const preview = message.replace(/\{\{business_name\}\}/gi, name || 'Business').replace(/\{\{city\}\}/gi, 'London').replace(/\{\{niche\}\}/gi, 'aesthetic clinic').replace(/\{\{rating\}\}/gi, '4.8').replace(/\{\{review_count\}\}/gi, '156');
  const isEmail = channel === 'email';
  const subMatch = isEmail ? preview.match(/^Subject:\s*(.+)/i) : null;
  const body = isEmail && subMatch ? preview.replace(/^Subject:\s*.+\n?/, '').trim() : preview;
  const ch = CHANNELS.find(c => c.id === channel);
  return (
    <div className="mx-auto" style={{ width: 240 }}>
      <div style={{ background: '#111118', borderRadius: 24, padding: 6, boxShadow: '0 16px 48px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.06)' }}>
        <div style={{ background: '#08080e', borderRadius: 20, overflow: 'hidden', minHeight: 300 }}>
          <div className="flex justify-between px-3 py-1.5" style={{ background: 'rgba(255,255,255,0.02)' }}>
            <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', fontWeight: 600 }}>9:41</span>
            <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)' }}>●●●●</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-2" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
            <div className="w-6 h-6 rounded-full flex items-center justify-center" style={{ background: ch?.color || '#888' }}>
              {ch && <ch.icon style={{ width: 12, height: 12, color: '#fff' }} />}
            </div>
            <div>
              <p style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.85)' }}>{name || 'Recipient'}</p>
              <p style={{ fontSize: 8, color: 'rgba(255,255,255,0.3)' }}>{ch?.label}</p>
            </div>
          </div>
          {isEmail && subMatch && (
            <div className="px-3 py-1.5" style={{ background: 'rgba(255,255,255,0.015)', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
              <p style={{ fontSize: 8, color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase', letterSpacing: 0.8 }}>Subject</p>
              <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.7)', fontWeight: 600, marginTop: 1 }}>{subMatch[1]}</p>
            </div>
          )}
          <div className="px-3 py-3">
            {body ? (
              <div style={{ background: channel === 'instagram' ? 'linear-gradient(135deg, rgba(131,58,180,0.2), rgba(253,29,29,0.1))' : channel === 'whatsapp' ? 'rgba(0,92,75,0.3)' : 'rgba(255,255,255,0.03)', borderRadius: channel === 'email' ? 6 : 14, borderTopLeftRadius: channel === 'email' ? 6 : 3, padding: '7px 10px' }}>
                <p style={{ fontSize: 10.5, lineHeight: 1.5, color: 'rgba(255,255,255,0.82)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{body}</p>
                <p style={{ fontSize: 8, color: 'rgba(255,255,255,0.2)', textAlign: 'right', marginTop: 3 }}>{new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</p>
              </div>
            ) : (
              <div className="flex flex-col items-center py-8 opacity-20">
                <Send style={{ width: 16, height: 16, color: '#fff' }} />
                <p style={{ fontSize: 9, color: '#fff', marginTop: 4 }}>Type a message...</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function SendAssist({ items, onMarkSent, onRefresh }: { items: ManualItem[]; onMarkSent: (id: string) => void; onRefresh: () => void }) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const handleCopy = async (item: ManualItem) => { await navigator.clipboard.writeText(item.message); setCopiedId(item.id); setTimeout(() => setCopiedId(null), 2000); };
  if (items.length === 0) return null;
  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(236,72,153,0.15)' }}>
      <div className="px-5 py-3 flex items-center justify-between" style={{ background: 'rgba(236,72,153,0.06)', borderBottom: '1px solid rgba(236,72,153,0.1)' }}>
        <div className="flex items-center gap-2">
          <Instagram style={{ width: 16, height: 16, color: '#ec4899' }} />
          <span style={{ fontSize: 13, fontWeight: 700, color: '#ec4899' }}>Send Assist</span>
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>— {items.length} ready</span>
        </div>
        <button onClick={onRefresh} className="flex items-center gap-1" style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}><RefreshCw style={{ width: 12, height: 12 }} /> Refresh</button>
      </div>
      <div className="max-h-[400px] overflow-y-auto">
        {items.map(item => (
          <div key={item.id} className="px-5 py-3 flex items-start gap-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span style={{ fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.9)' }}>{item.business_name}</span>
                <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', fontFamily: 'monospace' }}>@{item.handle}</span>
              </div>
              <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', lineHeight: 1.4 }} className="line-clamp-2">{item.message}</p>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <button onClick={() => handleCopy(item)} className="px-2.5 py-1.5 rounded-lg flex items-center gap-1" style={{ fontSize: 10, fontWeight: 600, background: copiedId === item.id ? 'rgba(16,185,129,0.15)' : 'rgba(255,255,255,0.04)', border: `1px solid ${copiedId === item.id ? 'rgba(16,185,129,0.3)' : 'rgba(255,255,255,0.06)'}`, color: copiedId === item.id ? '#10b981' : 'rgba(255,255,255,0.6)' }}>
                {copiedId === item.id ? <><Check style={{ width: 10, height: 10 }} /> Copied</> : <><Copy style={{ width: 10, height: 10 }} /> Copy</>}
              </button>
              <a href={item.dm_link || '#'} target="_blank" rel="noopener noreferrer" className="px-2.5 py-1.5 rounded-lg flex items-center gap-1" style={{ fontSize: 10, fontWeight: 600, background: 'rgba(236,72,153,0.1)', border: '1px solid rgba(236,72,153,0.2)', color: '#ec4899' }}>
                <ExternalLink style={{ width: 10, height: 10 }} /> Open DM
              </a>
              <button onClick={() => onMarkSent(item.id)} className="px-2.5 py-1.5 rounded-lg flex items-center gap-1" style={{ fontSize: 10, fontWeight: 600, background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)', color: '#10b981' }}>
                <CheckCircle style={{ width: 10, height: 10 }} /> Sent
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function OutreachLaunchPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [totalLeads, setTotalLeads] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCity, setFilterCity] = useState('');
  const [filterMinScore, setFilterMinScore] = useState(0);
  const [page, setPage] = useState(0);
  const pageSize = 50;
  const [channel, setChannel] = useState('instagram');
  const [sequences, setSequences] = useState<Sequence[]>([]);
  const [selectedSequence, setSelectedSequence] = useState('');
  const [showBuilder, setShowBuilder] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [manualItems, setManualItems] = useState<ManualItem[]>([]);
  const [queueStatus, setQueueStatus] = useState<any>(null);
  const [seqName, setSeqName] = useState('');
  const [step1, setStep1] = useState('');
  const [step2, setStep2] = useState('');
  const [step3, setStep3] = useState('');
  const [aiOn, setAiOn] = useState(true);

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    let q = supabase.from('leads').select('id, business_name, email, phone, whatsapp_eligible, instagram_handle, instagram_verified, website, city, niche, google_rating, lead_score, data_completeness, has_email, has_pixel', { count: 'exact' }).order('lead_score', { ascending: false, nullsFirst: false }).range(page * pageSize, (page + 1) * pageSize - 1);
    if (searchQuery) q = q.ilike('business_name', `%${searchQuery}%`);
    if (filterCity) q = q.ilike('city', `%${filterCity}%`);
    if (filterMinScore > 0) q = q.gte('lead_score', filterMinScore);
    if (channel === 'email') q = q.not('email', 'is', null);
    if (channel === 'instagram') q = q.eq('instagram_verified', true);
    if (channel === 'whatsapp') q = q.eq('whatsapp_eligible', true);
    const { data, count } = await q;
    setLeads(data || []); setTotalLeads(count || 0); setLoading(false);
  }, [page, searchQuery, filterCity, filterMinScore, channel]);

  useEffect(() => { fetchLeads(); }, [fetchLeads]);
  useEffect(() => { (async () => { const { data } = await supabase.from('outreach_sequences').select('*').order('created_at', { ascending: false }); setSequences(data || []); })(); }, []);

  const fetchStatus = useCallback(async () => {
    try {
      const [sR, mR] = await Promise.all([fetch('/api/auto-send?view=status'), fetch('/api/auto-send?view=manual_queue')]);
      if (sR.ok) setQueueStatus(await sR.json());
      if (mR.ok) { const d = await mR.json(); setManualItems(d.items || []); }
    } catch {}
  }, []);
  useEffect(() => { fetchStatus(); }, [fetchStatus, success]);

  const canReach = (l: Lead) => channel === 'email' ? !!l.email : channel === 'instagram' ? l.instagram_verified : channel === 'whatsapp' ? l.whatsapp_eligible : !!l.email;
  const getContact = (l: Lead) => channel === 'email' ? l.email : channel === 'instagram' ? (l.instagram_handle ? `@${l.instagram_handle}` : null) : channel === 'whatsapp' ? l.phone : l.email;
  const reachableCount = leads.filter(canReach).length;
  const ch = CHANNELS.find(c => c.id === channel)!;
  const channelSeqs = sequences.filter(s => s.channel === channel);
  const sampleName = selectedIds.size > 0 ? (leads.find(l => selectedIds.has(l.id))?.business_name || 'Glow Aesthetics') : (leads[0]?.business_name || 'Glow Aesthetics');
  const toggleLead = (id: string) => setSelectedIds(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const selectAll = () => setSelectedIds(new Set(leads.filter(canReach).map(l => l.id)));

  const createSeq = async () => {
    if (!seqName || !step1) return;
    const steps: any[] = [{ step_number: 1, delay_days: 0, message_template: step1, condition: 'always', is_ai_personalized: aiOn }];
    if (step2) steps.push({ step_number: 2, delay_days: 3, message_template: step2, condition: 'if_no_reply', is_ai_personalized: aiOn });
    if (step3) steps.push({ step_number: 3, delay_days: 7, message_template: step3, condition: 'if_no_reply', is_ai_personalized: aiOn });
    const res = await fetch('/api/sequences', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'create', name: seqName, channel, steps, ai_personalization_enabled: aiOn }) });
    const data = await res.json();
    if (data.sequence) { setSequences([data.sequence, ...sequences]); setSelectedSequence(data.sequence.id); setShowBuilder(false); setSeqName(''); setStep1(''); setStep2(''); setStep3(''); }
  };

  const handleLaunch = async () => {
    if (selectedIds.size === 0 || !selectedSequence) return;
    setLaunching(true); setError(null); setSuccess(null);
    try {
      const res = await fetch('/api/auto-send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'queue_sequence', sequence_id: selectedSequence, lead_ids: Array.from(selectedIds) }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSuccess(`${data.queued} leads queued for ${ch.label}`);
      setSelectedIds(new Set());
    } catch (e: any) { setError(e.message); }
    setLaunching(false);
  };

  const handleProcess = async () => {
    setProcessing(true); setError(null);
    try {
      const res = await fetch('/api/auto-send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'process_queue', batch_size: 10 }) });
      const data = await res.json();
      const manual = (data.results || []).filter((r: any) => r.status === 'manual_ready').length;
      const auto = (data.sent || 0) - manual;
      setSuccess(data.sent > 0 ? `${auto > 0 ? auto + ' auto-sent' : ''}${auto > 0 && manual > 0 ? ' + ' : ''}${manual > 0 ? manual + ' in Send Assist' : ''}` : (data.message || 'Queue empty'));
      fetchStatus();
    } catch (e: any) { setError(e.message); }
    setProcessing(false);
  };

  const handleMarkSent = async (queueId: string) => {
    await fetch('/api/auto-send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'mark_sent', queue_id: queueId }) });
    setManualItems(prev => prev.filter(i => i.id !== queueId));
  };

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `@keyframes fadeSlideIn { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }` }} />
      <div className="min-h-screen p-5 sm:p-7 max-w-7xl mx-auto" style={{ background: '#080810', color: '#e5e5e5' }}>
        <div className="flex items-center gap-4 mb-6" style={{ animation: 'fadeSlideIn 0.5s both' }}>
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(0,212,170,0.1)', border: '1px solid rgba(0,212,170,0.2)' }}><Rocket style={{ width: 24, height: 24, color: '#00d4aa' }} /></div>
          <div><h1 style={{ fontSize: 24, fontWeight: 800, color: '#fff' }}>Launch Outreach</h1><p style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)' }}>Select leads · Craft message · Launch · Track</p></div>
        </div>

        <div className="rounded-xl px-4 py-3 mb-4 flex items-center justify-between" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
          <div className="flex items-center gap-4" style={{ fontSize: 12 }}>
            {queueStatus && (<><span className="flex items-center gap-1.5" style={{ color: queueStatus.within_send_window ? '#34d399' : '#fbbf24' }}><span className="w-2 h-2 rounded-full" style={{ background: queueStatus.within_send_window ? '#34d399' : '#fbbf24' }} />{queueStatus.within_send_window ? 'Window Open' : 'Outside Window'}</span><span style={{ color: 'rgba(255,255,255,0.3)' }}>Queue: <b style={{ color: '#fff' }}>{queueStatus.queue_size}</b></span><span style={{ color: 'rgba(255,255,255,0.3)' }}>Sent: <b style={{ color: '#fff' }}>{queueStatus.sent_today}</b>/{queueStatus.daily_limit}</span></>)}
          </div>
          <button onClick={handleProcess} disabled={processing} className="px-4 py-2 rounded-lg flex items-center gap-2" style={{ fontSize: 12, fontWeight: 700, background: 'rgba(0,212,170,0.1)', border: '1px solid rgba(0,212,170,0.2)', color: '#00d4aa' }}>
            {processing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />} Process Queue
          </button>
        </div>

        {manualItems.length > 0 && <div className="mb-5"><SendAssist items={manualItems} onMarkSent={handleMarkSent} onRefresh={fetchStatus} /></div>}
        {success && <div className="mb-4 px-4 py-2.5 rounded-xl flex items-center gap-2" style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)' }}><CheckCircle style={{ width: 14, height: 14, color: '#10b981' }} /><span style={{ fontSize: 13, color: '#10b981', fontWeight: 600 }}>{success}</span></div>}
        {error && <div className="mb-4 px-4 py-2.5 rounded-xl flex items-center gap-2" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}><AlertTriangle style={{ width: 14, height: 14, color: '#ef4444' }} /><span style={{ fontSize: 13, color: '#ef4444' }}>{error}</span></div>}

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
          <div className="lg:col-span-3 space-y-3">
            <div className="flex gap-2">{CHANNELS.map(c => (<button key={c.id} onClick={() => { setChannel(c.id); setSelectedIds(new Set()); setPage(0); setSelectedSequence(''); }} className="flex items-center gap-2 px-4 py-2.5 rounded-xl" style={{ fontSize: 12, fontWeight: channel === c.id ? 700 : 500, color: channel === c.id ? '#fff' : 'rgba(255,255,255,0.3)', background: channel === c.id ? `${c.color}18` : 'transparent', border: `1px solid ${channel === c.id ? `${c.color}40` : 'rgba(255,255,255,0.05)'}` }}><c.icon style={{ width: 14, height: 14 }} /> {c.label}</button>))}</div>

            <div className="rounded-xl px-3 py-2.5 flex items-center gap-2" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
              <Search style={{ width: 14, height: 14, color: 'rgba(255,255,255,0.2)' }} />
              <input value={searchQuery} onChange={e => { setSearchQuery(e.target.value); setPage(0); }} placeholder="Search businesses..." style={{ flex: 1, background: 'none', border: 'none', outline: 'none', fontSize: 13, color: '#e5e5e5' }} />
              <input value={filterCity} onChange={e => { setFilterCity(e.target.value); setPage(0); }} placeholder="City" style={{ width: 80, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 6, padding: '3px 8px', fontSize: 11, color: '#ccc', outline: 'none' }} />
              <select value={filterMinScore.toString()} onChange={e => { setFilterMinScore(parseInt(e.target.value)); setPage(0); }} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 6, padding: '3px 6px', fontSize: 10, color: '#aaa', outline: 'none' }}><option value="0">Any score</option><option value="50">50+</option><option value="70">70+</option><option value="85">85+</option></select>
            </div>

            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-3"><button onClick={selectAll} style={{ fontSize: 11, color: '#00d4aa', fontWeight: 600 }}>Select all</button><button onClick={() => setSelectedIds(new Set())} style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)' }}>Clear</button></div>
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}><span style={{ fontSize: 14, fontWeight: 800, color: '#00d4aa' }}>{selectedIds.size}</span> of {reachableCount} · <button onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0} style={{ color: 'rgba(255,255,255,0.25)' }}>‹</button> pg {page + 1} <button onClick={() => setPage(page + 1)} disabled={leads.length < pageSize} style={{ color: 'rgba(255,255,255,0.25)' }}>›</button></span>
            </div>

            <div className="rounded-xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.015)', border: '1px solid rgba(255,255,255,0.04)' }}>
              <table className="w-full"><thead><tr style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>{['', 'Business', 'Contact', 'Score', 'Data'].map(h => (<th key={h} className="px-3 py-2.5 text-left" style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.25)', letterSpacing: 1.2, textTransform: 'uppercase' }}>{h}</th>))}</tr></thead>
              <tbody>{loading ? (<tr><td colSpan={5} className="py-12 text-center"><Loader2 className="animate-spin mx-auto" style={{ width: 20, height: 20, color: '#00d4aa' }} /></td></tr>) : leads.length === 0 ? (<tr><td colSpan={5} className="py-12 text-center" style={{ fontSize: 12, color: 'rgba(255,255,255,0.2)' }}>No reachable leads</td></tr>) : leads.map(lead => { const ok = canReach(lead); return (
                <tr key={lead.id} onClick={() => ok && toggleLead(lead.id)} style={{ borderBottom: '1px solid rgba(255,255,255,0.025)', cursor: ok ? 'pointer' : 'default', opacity: ok ? 1 : 0.2, background: selectedIds.has(lead.id) ? 'rgba(0,212,170,0.04)' : 'transparent' }} className="transition-colors hover:bg-white/[0.01]">
                  <td className="px-3 py-2.5"><div style={{ width: 16, height: 16, borderRadius: 4, border: `2px solid ${selectedIds.has(lead.id) ? '#00d4aa' : 'rgba(255,255,255,0.1)'}`, background: selectedIds.has(lead.id) ? '#00d4aa' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{selectedIds.has(lead.id) && <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#080810" strokeWidth="3.5"><path strokeLinecap="round" d="M5 13l4 4L19 7" /></svg>}</div></td>
                  <td className="px-3 py-2.5"><p style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.85)' }} className="truncate max-w-[180px]">{lead.business_name}</p><p style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)' }}>{lead.city || '—'}</p></td>
                  <td className="px-3 py-2.5"><span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', fontFamily: 'monospace' }}>{getContact(lead) || '—'}</span></td>
                  <td className="px-3 py-2.5 text-center"><span style={{ fontSize: 13, fontWeight: 800, fontFamily: 'monospace', color: (lead.lead_score || 0) >= 70 ? '#34d399' : (lead.lead_score || 0) >= 40 ? '#fbbf24' : '#f87171' }}>{lead.lead_score ?? '—'}</span></td>
                  <td className="px-3 py-2.5"><div style={{ width: 40, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.05)', overflow: 'hidden' }}><div style={{ width: `${lead.data_completeness || 0}%`, height: '100%', borderRadius: 2, background: (lead.data_completeness || 0) >= 70 ? '#34d399' : '#fbbf24' }} /></div></td>
                </tr>); })}</tbody></table>
            </div>
          </div>

          <div className="lg:col-span-2 space-y-4">
            <div className="rounded-xl p-5 text-center" style={{ background: 'rgba(0,212,170,0.04)', border: '1px solid rgba(0,212,170,0.1)' }}><Target style={{ width: 24, height: 24, color: '#00d4aa', margin: '0 auto 8px' }} /><p style={{ fontSize: 36, fontWeight: 800, color: '#fff' }}>{selectedIds.size}</p><p style={{ fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: 1.5 }}>Leads Selected</p></div>

            {!showBuilder ? (
              <div className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                <p style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 8 }}>Sequence</p>
                {channelSeqs.map(seq => (<button key={seq.id} onClick={() => setSelectedSequence(seq.id)} className="w-full text-left p-3 rounded-lg mb-2" style={{ background: selectedSequence === seq.id ? 'rgba(0,212,170,0.06)' : 'rgba(255,255,255,0.01)', border: `1px solid ${selectedSequence === seq.id ? 'rgba(0,212,170,0.2)' : 'rgba(255,255,255,0.03)'}` }}><p style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.85)' }}>{seq.name}</p><p style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 2 }}>{seq.steps?.length || 0} steps · {seq.total_enrolled || 0} enrolled</p></button>))}
                <button onClick={() => setShowBuilder(true)} className="w-full py-2 rounded-lg flex items-center justify-center gap-1" style={{ fontSize: 11, fontWeight: 600, color: '#00d4aa', border: '1px dashed rgba(0,212,170,0.25)' }}><Plus style={{ width: 12, height: 12 }} /> New Sequence</button>
              </div>
            ) : (
              <div className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                <div className="flex items-center justify-between mb-3"><p style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase', letterSpacing: 1.2 }}>New {ch.label} Sequence</p><button onClick={() => setShowBuilder(false)} style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)' }}>Cancel</button></div>
                <input value={seqName} onChange={e => setSeqName(e.target.value)} placeholder="Sequence name" style={{ width: '100%', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, padding: '7px 10px', fontSize: 12, color: '#e5e5e5', outline: 'none', marginBottom: 8 }} />
                {[{ label: 'Step 1 — First Touch', val: step1, set: setStep1, rows: 4 }, { label: 'Step 2 — Follow Up (Day 3)', val: step2, set: setStep2, rows: 2 }, { label: 'Step 3 — Breakup (Day 7)', val: step3, set: setStep3, rows: 2 }].map((s, i) => (<div key={i} className="mb-2"><p style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.25)', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 3 }}>{s.label}</p><textarea value={s.val} onChange={e => s.set(e.target.value)} rows={s.rows} placeholder={i === 0 ? 'Hey {{business_name}}, I came across your page...' : ''} style={{ width: '100%', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, padding: '7px 10px', fontSize: 11, color: '#e5e5e5', outline: 'none', resize: 'none', lineHeight: 1.5 }} /></div>))}
                <label className="flex items-center gap-2 mb-3 cursor-pointer"><div onClick={() => setAiOn(!aiOn)} style={{ width: 32, height: 18, borderRadius: 9, background: aiOn ? 'rgba(168,85,247,0.5)' : 'rgba(255,255,255,0.1)', position: 'relative', cursor: 'pointer' }}><div style={{ width: 14, height: 14, borderRadius: 7, background: '#fff', position: 'absolute', top: 2, left: aiOn ? 16 : 2, transition: 'left 0.2s' }} /></div><Sparkles style={{ width: 11, height: 11, color: '#a855f7' }} /><span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>AI personalize</span></label>
                <button onClick={createSeq} disabled={!seqName || !step1} style={{ width: '100%', padding: '8px 0', borderRadius: 8, fontSize: 12, fontWeight: 700, color: '#00d4aa', background: 'rgba(0,212,170,0.06)', border: '1px solid rgba(0,212,170,0.15)', cursor: 'pointer', opacity: !seqName || !step1 ? 0.3 : 1 }} className="flex items-center justify-center gap-1"><Plus style={{ width: 12, height: 12 }} /> Create</button>
              </div>
            )}

            <div className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.015)', border: '1px solid rgba(255,255,255,0.04)' }}>
              <p style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 10, textAlign: 'center' }}>Live Preview</p>
              <PhonePreview message={showBuilder ? step1 : (channelSeqs.find(s => s.id === selectedSequence)?.steps?.[0]?.message_template || '')} channel={channel} name={sampleName} />
            </div>

            <button onClick={handleLaunch} disabled={selectedIds.size === 0 || !selectedSequence || launching} className="w-full py-4 rounded-xl flex items-center justify-center gap-2" style={{ fontSize: 15, fontWeight: 800, color: selectedIds.size > 0 && selectedSequence ? '#00d4aa' : 'rgba(255,255,255,0.1)', background: selectedIds.size > 0 && selectedSequence ? 'rgba(0,212,170,0.08)' : 'rgba(255,255,255,0.015)', border: `2px solid ${selectedIds.size > 0 && selectedSequence ? 'rgba(0,212,170,0.25)' : 'rgba(255,255,255,0.03)'}`, cursor: selectedIds.size > 0 && selectedSequence ? 'pointer' : 'not-allowed' }}>
              {launching ? <><Loader2 className="animate-spin" style={{ width: 18, height: 18 }} /> Queueing...</> : <><Rocket style={{ width: 18, height: 18 }} /> Launch Outreach</>}
            </button>
            {channel === 'instagram' && <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)', textAlign: 'center', lineHeight: 1.4 }}>Instagram DMs → Send Assist after processing. Copy → Open DM → Paste → Send → Mark Sent</p>}
          </div>
        </div>
      </div>
    </>
  );
}
