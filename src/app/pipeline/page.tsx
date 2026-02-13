'use client';

import { useEffect, useState } from 'react';
import type { DragEvent } from 'react';
import Link from 'next/link';
import { Columns3, Phone, Mail, Globe, GripVertical, Flame, Sun, Snowflake } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { cn, PIPELINE_STAGES, getScoreColor } from '@/lib/utils';

interface PipelineLead {
  id: string;
  business_name: string;
  email: string | null;
  phone: string | null;
  website: string | null;
  lead_score: number | null;
  lead_priority: string | null;
  pipeline_stage: string;
  city: string | null;
}

export default function PipelinePage() {
  const [leads, setLeads] = useState<PipelineLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [draggedLead, setDraggedLead] = useState<string | null>(null);

  useEffect(() => {
    supabase.from('leads').select('id, business_name, email, phone, website, lead_score, lead_priority, pipeline_stage, city')
      .order('lead_score', { ascending: false })
      .then(({ data }) => {
        setLeads((data || []).map(l => ({ ...l, pipeline_stage: l.pipeline_stage || 'new' })));
        setLoading(false);
      });
  }, []);

  const moveToStage = async (leadId: string, stage: string) => {
    setLeads(prev => prev.map(l => l.id === leadId ? { ...l, pipeline_stage: stage } : l));
    await supabase.from('leads').update({ pipeline_stage: stage, updated_at: new Date().toISOString() }).eq('id', leadId);
  };

  const handleDragStart = (e: DragEvent, leadId: string) => {
    setDraggedLead(leadId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; };

  const handleDrop = (e: DragEvent, stageId: string) => {
    e.preventDefault();
    if (draggedLead) { moveToStage(draggedLead, stageId); setDraggedLead(null); }
  };

  const getStageLeads = (stageId: string) => leads.filter(l => l.pipeline_stage === stageId);
  const priorityIcon = (p: string | null) => p === 'hot' ? <Flame className="w-3 h-3 text-red-400" /> : p === 'warm' ? <Sun className="w-3 h-3 text-amber-400" /> : <Snowflake className="w-3 h-3 text-blue-400" />;

  if (loading) return <div className="flex items-center justify-center min-h-[60vh]"><div className="w-8 h-8 border-2 border-prospex-cyan/30 border-t-prospex-cyan rounded-full animate-spin" /></div>;

  return (
    <div className="max-w-full mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-mono font-bold text-prospex-text flex items-center gap-3"><Columns3 className="w-6 h-6 text-prospex-cyan" />Sales Pipeline</h1>
        <p className="text-sm text-prospex-dim mt-1">Drag leads between stages to track your sales process</p>
      </div>

      <div className="flex gap-4 overflow-x-auto pb-4">
        {PIPELINE_STAGES.map(stage => {
          const stageLeads = getStageLeads(stage.id);
          return (
            <div key={stage.id} className="flex-shrink-0 w-72"
              onDragOver={handleDragOver} onDrop={(e) => handleDrop(e, stage.id)}>
              {/* Column Header */}
              <div className={cn('p-3 rounded-t-lg border border-b-0', stage.color)}>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono font-semibold uppercase tracking-wider">{stage.label}</span>
                  <span className="badge bg-black/20 text-current border-current/30 text-xs">{stageLeads.length}</span>
                </div>
              </div>

              {/* Column Body */}
              <div className="bg-prospex-surface/50 border border-prospex-border rounded-b-lg min-h-[60vh] p-2 space-y-2">
                {stageLeads.length === 0 && (
                  <div className="py-8 text-center"><p className="text-xs text-prospex-dim font-mono">Drop leads here</p></div>
                )}
                {stageLeads.map(lead => (
                  <div key={lead.id} draggable onDragStart={(e) => handleDragStart(e, lead.id)}
                    className={cn('card p-3 cursor-grab active:cursor-grabbing hover:border-prospex-cyan/30 transition-all', draggedLead === lead.id && 'opacity-50')}>
                    <div className="flex items-start gap-2">
                      <GripVertical className="w-3.5 h-3.5 text-prospex-dim mt-0.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <Link href={`/leads/${lead.id}`} className="text-sm font-medium text-prospex-text hover:text-prospex-cyan transition-colors line-clamp-1">{lead.business_name}</Link>
                        {lead.city && <p className="text-[10px] text-prospex-dim mt-0.5">{lead.city}</p>}
                        <div className="flex items-center gap-2 mt-2">
                          {lead.lead_score !== null && <span className={cn('text-xs font-mono font-bold', getScoreColor(lead.lead_score))}>{lead.lead_score}</span>}
                          {lead.lead_priority && priorityIcon(lead.lead_priority)}
                          {lead.email && <Mail className="w-3 h-3 text-prospex-dim" />}
                          {lead.phone && <Phone className="w-3 h-3 text-prospex-dim" />}
                          {lead.website && <Globe className="w-3 h-3 text-prospex-dim" />}
                        </div>
                      </div>
                    </div>
                    {/* Quick move buttons */}
                    <div className="flex items-center gap-1 mt-2 pt-2 border-t border-prospex-border/50">
                      {PIPELINE_STAGES.filter(s => s.id !== stage.id).slice(0, 3).map(s => (
                        <button key={s.id} onClick={() => moveToStage(lead.id, s.id)}
                          className={cn('text-[9px] font-mono px-1.5 py-0.5 rounded border transition-colors', s.color, 'hover:opacity-80')}>
                          {s.label.split(' ')[0]}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
