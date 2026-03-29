'use client';

import { useEffect, useState } from 'react';
import { ScrollText, Loader2, Copy, Check, Send, Eye, ChevronDown, ChevronUp, Sparkles } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';

interface PlaybookRow {
  id: string;
  lead_id: string;
  content: string;
  email_subject: string | null;
  email_body: string | null;
  follow_up_email: string | null;
  dm_text: string | null;
  short_dm_text: string | null;
  revenue_leak: string | null;
  growth_score: number | null;
  recommended_tier: string | null;
  status: string;
  created_at: string;
  lead?: { business_name: string; city: string; country: string; qualification_score: number | null };
}

export default function PlaybooksPage() {
  const [playbooks, setPlaybooks] = useState<PlaybookRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [genProgress, setGenProgress] = useState('');

  useEffect(() => {
    async function fetch() {
      const { data } = await supabase
        .from('playbooks')
        .select('*, lead:leads(business_name, city, country, qualification_score)')
        .order('created_at', { ascending: false });
      if (data) setPlaybooks(data as PlaybookRow[]);
      setLoading(false);
    }
    fetch();
  }, []);

  const copyText = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  };

  const handleBulkGenerate = async () => {
    setGenerating(true);
    setGenProgress('Finding eligible leads...');
    try {
      const { data: leads } = await supabase
        .from('leads')
        .select('id')
        .gte('qualification_score', 50)
        .eq('playbook_status', 'none')
        .limit(5);

      if (!leads || leads.length === 0) {
        setGenProgress('No eligible leads found (need qualification_score >= 50 and no playbook)');
        setTimeout(() => { setGenerating(false); setGenProgress(''); }, 3000);
        return;
      }

      setGenProgress(`Generating playbooks for ${leads.length} leads...`);
      const res = await window.fetch('/api/generate-playbook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bulk: true, lead_ids: leads.map(l => l.id) }),
      });
      const data = await res.json();
      const ready = (data.results || []).filter((r: { status: string }) => r.status === 'ready').length;
      setGenProgress(`Done! ${ready}/${leads.length} playbooks generated.`);

      // Refresh list
      const { data: refreshed } = await supabase
        .from('playbooks')
        .select('*, lead:leads(business_name, city, country, qualification_score)')
        .order('created_at', { ascending: false });
      if (refreshed) setPlaybooks(refreshed as PlaybookRow[]);
    } catch (err) {
      setGenProgress(`Error: ${String(err)}`);
    }
    setTimeout(() => { setGenerating(false); setGenProgress(''); }, 5000);
  };

  const postToSlack = async (pb: PlaybookRow) => {
    await window.fetch('/api/slack-post', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lead_id: pb.lead_id, playbook_id: pb.id }),
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 text-prospex-cyan animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-mono text-prospex-text flex items-center gap-3">
            <ScrollText className="w-6 h-6 text-prospex-cyan" />
            Growth Playbooks
          </h1>
          <p className="text-sm text-prospex-muted mt-1 font-mono">{playbooks.length} playbooks generated</p>
        </div>
        <button onClick={handleBulkGenerate} disabled={generating}
          className="flex items-center gap-2 px-4 py-2 bg-prospex-cyan/20 border border-prospex-cyan/40 text-prospex-cyan rounded-lg text-sm font-mono hover:bg-prospex-cyan/30 transition-all disabled:opacity-50">
          {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          Generate Bulk (Next 5)
        </button>
      </div>

      {genProgress && (
        <div className="p-3 rounded-lg bg-prospex-cyan/10 border border-prospex-cyan/30 text-prospex-cyan text-sm font-mono">
          {genProgress}
        </div>
      )}

      {playbooks.length === 0 ? (
        <div className="p-12 text-center bg-prospex-card border border-prospex-border rounded-lg">
          <ScrollText className="w-12 h-12 text-prospex-dim mx-auto mb-4" />
          <p className="text-prospex-muted font-mono">No playbooks yet. Generate them from qualified leads.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {playbooks.map(pb => {
            const lead = pb.lead as PlaybookRow['lead'];
            const isExpanded = expanded === pb.id;
            return (
              <div key={pb.id} className="bg-prospex-card border border-prospex-border rounded-lg overflow-hidden">
                {/* Header row */}
                <button onClick={() => setExpanded(isExpanded ? null : pb.id)}
                  className="w-full flex items-center justify-between p-4 text-left hover:bg-prospex-bg/50 transition-colors">
                  <div className="flex items-center gap-4">
                    <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center text-sm font-mono font-bold',
                      (pb.growth_score || 0) < 40 ? 'bg-prospex-red/20 text-prospex-red' :
                      (pb.growth_score || 0) < 60 ? 'bg-prospex-amber/20 text-prospex-amber' :
                      'bg-prospex-green/20 text-prospex-green'
                    )}>
                      {pb.growth_score || '?'}
                    </div>
                    <div>
                      <p className="text-sm font-mono text-prospex-text font-medium">{lead?.business_name || 'Unknown'}</p>
                      <p className="text-xs font-mono text-prospex-dim">{lead?.city}, {lead?.country} • {pb.recommended_tier} tier • Leak: {pb.revenue_leak || 'N/A'}/mo</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={cn('text-xs font-mono px-2 py-1 rounded-full',
                      pb.status === 'ready' ? 'bg-prospex-green/20 text-prospex-green' :
                      pb.status === 'sent' ? 'bg-prospex-cyan/20 text-prospex-cyan' :
                      'bg-prospex-dim/20 text-prospex-dim'
                    )}>{pb.status}</span>
                    {isExpanded ? <ChevronUp className="w-4 h-4 text-prospex-dim" /> : <ChevronDown className="w-4 h-4 text-prospex-dim" />}
                  </div>
                </button>

                {/* Expanded content */}
                {isExpanded && (
                  <div className="border-t border-prospex-border">
                    {/* Action buttons */}
                    <div className="p-4 flex items-center gap-2 border-b border-prospex-border/50">
                      {pb.email_subject && (
                        <button onClick={() => copyText(`Subject: ${pb.email_subject}\n\n${pb.email_body}`, 'email')}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-prospex-bg border border-prospex-border rounded text-xs font-mono text-prospex-muted hover:text-prospex-text transition-colors">
                          {copied === 'email' ? <Check className="w-3 h-3 text-prospex-green" /> : <Copy className="w-3 h-3" />}
                          Copy Email
                        </button>
                      )}
                      {pb.dm_text && (
                        <button onClick={() => copyText(pb.dm_text!, 'dm')}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-prospex-bg border border-prospex-border rounded text-xs font-mono text-prospex-muted hover:text-prospex-text transition-colors">
                          {copied === 'dm' ? <Check className="w-3 h-3 text-prospex-green" /> : <Copy className="w-3 h-3" />}
                          Copy DM
                        </button>
                      )}
                      {pb.short_dm_text && (
                        <button onClick={() => copyText(pb.short_dm_text!, 'shortdm')}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-prospex-bg border border-prospex-border rounded text-xs font-mono text-prospex-muted hover:text-prospex-text transition-colors">
                          {copied === 'shortdm' ? <Check className="w-3 h-3 text-prospex-green" /> : <Copy className="w-3 h-3" />}
                          Copy Short DM
                        </button>
                      )}
                      <button onClick={() => postToSlack(pb)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-prospex-bg border border-prospex-border rounded text-xs font-mono text-prospex-muted hover:text-prospex-text transition-colors">
                        <Send className="w-3 h-3" /> Post to Slack
                      </button>
                    </div>

                    {/* Outreach copy */}
                    {pb.email_subject && (
                      <div className="p-4 border-b border-prospex-border/50">
                        <p className="text-xs font-mono text-prospex-dim uppercase mb-2">Cold Email</p>
                        <p className="text-sm font-mono text-prospex-amber mb-1">Subject: {pb.email_subject}</p>
                        <p className="text-sm font-mono text-prospex-muted whitespace-pre-wrap">{pb.email_body}</p>
                      </div>
                    )}
                    {pb.dm_text && (
                      <div className="p-4 border-b border-prospex-border/50">
                        <p className="text-xs font-mono text-prospex-dim uppercase mb-2">Instagram DM</p>
                        <p className="text-sm font-mono text-prospex-muted whitespace-pre-wrap">{pb.dm_text}</p>
                      </div>
                    )}

                    {/* Full playbook */}
                    <div className="p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <Eye className="w-4 h-4 text-prospex-cyan" />
                        <p className="text-xs font-mono text-prospex-dim uppercase">Full Growth Playbook</p>
                      </div>
                      <div className="max-h-96 overflow-y-auto pr-2">
                        <pre className="text-xs font-mono text-prospex-muted whitespace-pre-wrap leading-relaxed">{pb.content}</pre>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
