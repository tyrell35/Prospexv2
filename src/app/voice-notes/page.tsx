'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Mic, Upload, Trash2, Loader2, RefreshCw, Play, Download,
  AlertTriangle, CheckCircle2, Video, FileAudio, Pencil, X, Share2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import { shareStoredFile, canShareFiles } from '@/lib/share-file';

// ═══════════════════════════════════════════════════════════════
// VOICE NOTES
//
// Each note holds two renditions of the same recording because
// Instagram treats them completely differently:
//
//   MP4   — what you attach by hand for a cold DM. Instagram will
//           not accept a bare audio file from the camera roll, but
//           it will accept a video.
//   Audio — what the Messaging API sends once a lead has replied,
//           which is the only window where sending can be automated.
// ═══════════════════════════════════════════════════════════════

interface VoiceNote {
  id: string;
  name: string;
  purpose: string;
  description: string | null;
  audio_url: string | null;
  video_url: string | null;
  audio_path: string | null;
  video_path: string | null;
  duration_sec: number | null;
  transcript: string | null;
  opener_text: string | null;
  channels: string[] | null;
  ogg_url: string | null;
  ogg_path: string | null;
  video_bytes: number | null;
  audio_bytes: number | null;
  pairs_with_template: string | null;
  niche: string | null;
  is_active: boolean;
  times_sent: number;
  replies: number;
  reply_rate: number | null;
}

const CHANNELS = [
  { id: 'instagram', label: 'Instagram', emoji: '📸' },
  { id: 'whatsapp',  label: 'WhatsApp',  emoji: '💬' },
];

// WhatsApp template video headers cap at 16MB — below Instagram's 25MB, so
// a file that is fine on one can fail on the other.
const WA_VIDEO_LIMIT = 16 * 1024 * 1024;
const IG_LIMIT = 25 * 1024 * 1024;

const fmtMb = (b: number | null | undefined) => b ? `${(b / 1024 / 1024).toFixed(1)}MB` : null;

const PURPOSES = [
  { id: 'cold_open',  label: 'Cold open',      emoji: '👋', hint: 'First touch. Needs the MP4 — this one is sent by hand.' },
  { id: 'pitch',      label: 'Pitch',          emoji: '🎯', hint: 'After they reply. Can be sent by the API as real audio.' },
  { id: 'objection',  label: 'Objection',      emoji: '🛡️', hint: 'Price, timing, already-have-an-agency.' },
  { id: 'follow_up',  label: 'Follow-up',      emoji: '🔁', hint: 'Nudge after silence.' },
  { id: 'booking',    label: 'Booking',        emoji: '📅', hint: 'Getting the call in the diary.' },
];

export default function VoiceNotesPage() {
  const [notes, setNotes] = useState<VoiceNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState<string | null>(null);
  const [editing, setEditing] = useState<Partial<VoiceNote> | null>(null);
  const [saving, setSaving] = useState(false);
  const audioInput = useRef<HTMLInputElement>(null);
  const videoInput = useRef<HTMLInputElement>(null);
  const oggInput = useRef<HTMLInputElement>(null);
  const [canShare, setCanShare] = useState(false);
  const [sharingId, setSharingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/voice-notes', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'list' }),
      });
      const data = await res.json();
      setNotes(data.notes || []);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setCanShare(canShareFiles()); }, []);

  /** Hand a stored file straight to another app via the OS share sheet. */
  const share = async (n: VoiceNote, url: string) => {
    setSharingId(n.id);
    try {
      const outcome = await shareStoredFile(url, {
        suggestedName: n.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase(),
        text: n.opener_text || undefined,
        title: n.name,
      });
      if (outcome === 'unsupported') alert('This browser can\u2019t hand files to other apps. Use Download instead — sharing works on iOS Safari and Android Chrome.');
      if (outcome === 'failed') alert('Could not load that file to share.');
    } finally { setSharingId(null); }
  };

  /** Straight to Supabase Storage — the API route only holds metadata. */
  const upload = async (file: File, kind: 'audio' | 'video' | 'ogg') => {
    setUploading(kind);
    try {
      const ext = file.name.split('.').pop() || (kind === 'audio' ? 'mp3' : kind === 'ogg' ? 'ogg' : 'mp4');
      const path = `${kind}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error } = await supabase.storage.from('voice-notes')
        .upload(path, file, { cacheControl: '3600', upsert: false });
      if (error) throw new Error(error.message);

      const { data: pub } = supabase.storage.from('voice-notes').getPublicUrl(path);
      setEditing(prev => ({
        ...prev,
        [`${kind}_url`]: pub.publicUrl,
        [`${kind}_path`]: path,
        ...(kind === 'video' ? { video_bytes: file.size } : {}),
        ...(kind === 'audio' ? { audio_bytes: file.size } : {}),
        name: prev?.name || file.name.replace(/\.[^.]+$/, ''),
      }));
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Upload failed');
    } finally { setUploading(null); }
  };

  const save = async () => {
    if (!editing?.name?.trim()) { alert('Give it a name first.'); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/voice-notes', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save', note: editing }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Save failed');
      setEditing(null);
      load();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Save failed');
    } finally { setSaving(false); }
  };

  const remove = async (n: VoiceNote) => {
    if (!confirm(`Delete "${n.name}"? The audio and video files go too.`)) return;
    await fetch('/api/voice-notes', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete', id: n.id }),
    });
    load();
  };

  const refreshStats = async () => {
    await fetch('/api/voice-notes', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'refresh_stats' }),
    });
    load();
  };

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl md:text-2xl font-mono font-bold text-prospex-text flex items-center gap-3">
            <Mic className="w-5 h-5 md:w-6 md:h-6 text-prospex-cyan" />Voice Notes
          </h1>
          <p className="text-sm text-prospex-dim mt-1">Recorded pitches, paired to your scripts and scored on reply rate.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={refreshStats} className="btn-ghost text-sm border border-prospex-border">
            <RefreshCw className="w-4 h-4" />Refresh stats
          </button>
          <button onClick={() => setEditing({ purpose: 'cold_open', is_active: true })} className="btn-primary text-sm">
            <Upload className="w-4 h-4" />Add note
          </button>
        </div>
      </div>

      {/* The platform rules, stated once where they matter. They differ
          between the two channels in ways that decide what you upload. */}
      <div className="card p-3 border-amber-500/30 bg-amber-500/5">
        <p className="text-xs text-amber-300 font-mono mb-1.5 inline-flex items-center gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5" />What each platform will actually accept
        </p>
        <div className="text-[11px] text-prospex-muted space-y-1.5 leading-relaxed">
          <p>
            <strong className="text-prospex-text">📸 Instagram — MP4 only.</strong> It won&apos;t attach a bare audio file
            from your camera roll, so anything sent cold has to be the video. Its API can&apos;t start a
            conversation at all; audio only becomes sendable in the 24 hours after a lead replies.
          </p>
          <p>
            <strong className="text-prospex-text">💬 WhatsApp — MP3 works.</strong> It does accept an audio file from
            the file picker, so the MP3 sends by hand with no video workaround. For the waveform
            press-to-play kind, it has to be <strong>.ogg/OPUS</strong> — an MP3 arrives as a playable
            attachment instead. Both fine, they just look different.
          </p>
          <p className="text-prospex-dim">
            Size: Instagram 25MB. WhatsApp template video 16MB, H.264 + AAC — the tighter of the two, so
            keep the MP4 under 16MB and it passes everywhere.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center min-h-[30vh]">
          <div className="w-8 h-8 border-2 border-prospex-cyan/30 border-t-prospex-cyan rounded-full animate-spin" />
        </div>
      ) : notes.length === 0 ? (
        <div className="card p-10 text-center">
          <Mic className="w-8 h-8 text-prospex-dim mx-auto mb-3" />
          <p className="text-sm text-prospex-muted">No voice notes yet.</p>
          <p className="text-xs text-prospex-dim mt-1">
            When you get them made, ask for an <strong>.mp4</strong> and an <strong>.mp3</strong> of each — that covers Instagram and WhatsApp.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {notes.map(n => {
            const p = PURPOSES.find(x => x.id === n.purpose);
            return (
              <div key={n.id} className={cn('card p-3', !n.is_active && 'opacity-50')}>
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-prospex-text">{n.name}</span>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-prospex-border text-prospex-muted">
                        {p?.emoji} {p?.label || n.purpose}
                      </span>
                      {n.duration_sec != null && (
                        <span className="text-[10px] font-mono text-prospex-dim">{n.duration_sec}s</span>
                      )}
                      {!n.is_active && <span className="text-[10px] font-mono text-prospex-dim">paused</span>}
                    </div>
                    {n.opener_text && (
                      <p className="text-[11px] text-prospex-muted mt-0.5">
                        <span className="text-prospex-dim">opener:</span> {n.opener_text}
                      </p>
                    )}
                    {n.description && <p className="text-[11px] text-prospex-dim mt-0.5">{n.description}</p>}

                    <div className="flex items-center gap-3 mt-2 text-[10px] font-mono flex-wrap">
                      <span className={n.video_url ? 'text-prospex-green' : (n.channels || []).includes('instagram') ? 'text-amber-300' : 'text-prospex-dim'}>
                        {n.video_url ? <CheckCircle2 className="w-3 h-3 inline" /> : (n.channels || []).includes('instagram') ? <AlertTriangle className="w-3 h-3 inline" /> : '○'}
                        {' '}MP4 {n.video_url ? 'ready' : (n.channels || []).includes('instagram') ? 'missing — Instagram needs this' : 'not uploaded'}
                      </span>
                      <span className={n.audio_url ? 'text-prospex-green' : 'text-prospex-dim'}>
                        {n.audio_url ? <CheckCircle2 className="w-3 h-3 inline" /> : '○'} MP3 {n.audio_url ? 'ready' : 'not uploaded'}
                      </span>
                      {n.ogg_url && <span className="text-prospex-green"><CheckCircle2 className="w-3 h-3 inline" /> .ogg</span>}
                      {(n.channels || []).map(c => {
                        const ch = CHANNELS.find(x => x.id === c);
                        return ch ? <span key={c} className="text-prospex-dim">{ch.emoji}</span> : null;
                      })}
                      {n.video_bytes && n.video_bytes > WA_VIDEO_LIMIT && (n.channels || []).includes('whatsapp') && (
                        <span className="text-amber-300" title="Over WhatsApp's 16MB template video limit">
                          ⚠ {fmtMb(n.video_bytes)} — too big for WhatsApp
                        </span>
                      )}
                      <span className="text-prospex-muted">
                        sent {n.times_sent}
                        {n.reply_rate != null && <span className={cn('ml-1 font-bold', n.reply_rate >= 10 ? 'text-prospex-green' : 'text-prospex-muted')}>
                          · {n.reply_rate}% replied
                        </span>}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    {canShare && (n.video_url || n.audio_url) && (
                      <button onClick={() => share(n, n.video_url || n.audio_url || '')}
                        disabled={sharingId === n.id}
                        className="btn-ghost text-xs border border-prospex-cyan/40 text-prospex-cyan disabled:opacity-50"
                        title="Hand the file straight to Instagram or WhatsApp">
                        {sharingId === n.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Share2 className="w-3.5 h-3.5" />}
                        Send
                      </button>
                    )}
                    {n.video_url && (
                      <a href={n.video_url} download className="btn-ghost text-xs border border-prospex-border" title="Save the MP4 to this device">
                        <Download className="w-3.5 h-3.5" />MP4
                      </a>
                    )}
                    {n.audio_url && (
                      <a href={n.audio_url} download className="btn-ghost text-xs border border-prospex-border" title="Save the MP3 to this device">
                        <Download className="w-3.5 h-3.5" />MP3
                      </a>
                    )}
                    <button onClick={() => setEditing(n)} className="p-1.5 rounded hover:bg-prospex-bg" aria-label="Edit">
                      <Pencil className="w-3.5 h-3.5 text-prospex-dim" />
                    </button>
                    <button onClick={() => remove(n)} className="p-1.5 rounded hover:bg-prospex-bg" aria-label="Delete">
                      <Trash2 className="w-3.5 h-3.5 text-prospex-red/70" />
                    </button>
                  </div>
                </div>

                {(n.audio_url || n.video_url) && (
                  <audio controls preload="none" src={n.audio_url || n.video_url || undefined}
                    className="w-full mt-2 h-8" />
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Editor ── */}
      {editing && (
        <div className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-start md:items-center justify-center p-0 md:p-6 overflow-y-auto">
          <div className="w-full max-w-lg bg-prospex-surface border border-prospex-border md:rounded-xl min-h-screen md:min-h-0">
            <div className="flex items-center justify-between px-4 py-3 border-b border-prospex-border">
              <h2 className="text-sm font-mono font-semibold text-prospex-text">
                {editing.id ? 'Edit voice note' : 'New voice note'}
              </h2>
              <button onClick={() => setEditing(null)} className="p-1.5 rounded hover:bg-prospex-bg"><X className="w-4 h-4 text-prospex-dim" /></button>
            </div>

            <div className="p-4 space-y-3">
              <div>
                <label className="text-[10px] font-mono uppercase tracking-wider text-prospex-dim">Name</label>
                <input value={editing.name || ''} onChange={e => setEditing({ ...editing, name: e.target.value })}
                  placeholder="e.g. Cold open — UK aesthetics" className="input mt-1" />
              </div>

              <div>
                <label className="text-[10px] font-mono uppercase tracking-wider text-prospex-dim">Used for</label>
                <select value={editing.purpose || 'cold_open'} onChange={e => setEditing({ ...editing, purpose: e.target.value })} className="input mt-1">
                  {PURPOSES.map(p => <option key={p.id} value={p.id}>{p.emoji} {p.label}</option>)}
                </select>
                <p className="text-[10px] text-prospex-dim mt-1">
                  {PURPOSES.find(p => p.id === (editing.purpose || 'cold_open'))?.hint}
                </p>
              </div>

              <div>
                <label className="text-[10px] font-mono uppercase tracking-wider text-prospex-dim">Use on</label>
                <div className="flex gap-1.5 mt-1">
                  {CHANNELS.map(c => {
                    const on = (editing.channels || ['instagram', 'whatsapp']).includes(c.id);
                    return (
                      <button key={c.id}
                        onClick={() => {
                          const cur = editing.channels || ['instagram', 'whatsapp'];
                          setEditing({ ...editing, channels: on ? cur.filter(x => x !== c.id) : [...cur, c.id] });
                        }}
                        className={cn('text-xs font-mono px-3 py-1.5 rounded-lg border flex-1',
                          on ? 'bg-prospex-cyan/15 text-prospex-cyan border-prospex-cyan/40'
                             : 'bg-prospex-bg text-prospex-dim border-prospex-border')}>
                        {c.emoji} {c.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div>
                  <label className="text-[10px] font-mono uppercase tracking-wider text-prospex-dim">MP4</label>
                  <input ref={videoInput} type="file" accept="video/mp4,video/quicktime" className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) upload(f, 'video'); }} />
                  <button onClick={() => videoInput.current?.click()} disabled={!!uploading}
                    className={cn('btn-ghost text-xs w-full mt-1 border', editing.video_url ? 'border-prospex-green/40 text-prospex-green' : 'border-prospex-border')}>
                    {uploading === 'video' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Video className="w-3.5 h-3.5" />}
                    {editing.video_url ? 'Replace' : 'Upload'}
                  </button>
                  <p className="text-[9px] text-prospex-dim mt-1">Required for Instagram</p>
                </div>
                <div>
                  <label className="text-[10px] font-mono uppercase tracking-wider text-prospex-dim">MP3</label>
                  <input ref={audioInput} type="file" accept="audio/mpeg,audio/mp4,audio/aac,audio/wav,audio/x-m4a" className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) upload(f, 'audio'); }} />
                  <button onClick={() => audioInput.current?.click()} disabled={!!uploading}
                    className={cn('btn-ghost text-xs w-full mt-1 border', editing.audio_url ? 'border-prospex-green/40 text-prospex-green' : 'border-prospex-border')}>
                    {uploading === 'audio' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileAudio className="w-3.5 h-3.5" />}
                    {editing.audio_url ? 'Replace' : 'Upload'}
                  </button>
                  <p className="text-[9px] text-prospex-dim mt-1">WhatsApp sends this by hand</p>
                </div>
                <div>
                  <label className="text-[10px] font-mono uppercase tracking-wider text-prospex-dim">.ogg</label>
                  <input ref={oggInput} type="file" accept="audio/ogg,.ogg" className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) upload(f, 'ogg'); }} />
                  <button onClick={() => oggInput.current?.click()} disabled={!!uploading}
                    className={cn('btn-ghost text-xs w-full mt-1 border', editing.ogg_url ? 'border-prospex-green/40 text-prospex-green' : 'border-prospex-border')}>
                    {uploading === 'ogg' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Mic className="w-3.5 h-3.5" />}
                    {editing.ogg_url ? 'Replace' : 'Upload'}
                  </button>
                  <p className="text-[9px] text-prospex-dim mt-1">Optional — true WhatsApp voice note</p>
                </div>
              </div>

              {editing.video_bytes != null && (
                <p className={cn('text-[10px] font-mono',
                  editing.video_bytes > WA_VIDEO_LIMIT ? 'text-amber-300'
                  : editing.video_bytes > IG_LIMIT ? 'text-prospex-red' : 'text-prospex-dim')}>
                  MP4 is {fmtMb(editing.video_bytes)}
                  {editing.video_bytes > IG_LIMIT
                    ? ' — over Instagram\u2019s 25MB limit, it will not send'
                    : editing.video_bytes > WA_VIDEO_LIMIT
                      ? ' — over WhatsApp\u2019s 16MB template limit; fine for Instagram'
                      : ' — within both limits'}
                </p>
              )}

              <div>
                <label className="text-[10px] font-mono uppercase tracking-wider text-prospex-dim">Opener line</label>
                <input value={editing.opener_text || ''} onChange={e => setEditing({ ...editing, opener_text: e.target.value })}
                  placeholder="your practice is awesome ❤️" className="input mt-1" />
                <p className="text-[10px] text-prospex-dim mt-1">
                  Sent immediately before the video, as its own message. Kept with the recording because the two are written together.
                </p>
              </div>

              <div>
                <label className="text-[10px] font-mono uppercase tracking-wider text-prospex-dim">Length (seconds)</label>
                <input type="number" value={editing.duration_sec ?? ''} onChange={e => setEditing({ ...editing, duration_sec: e.target.value ? Number(e.target.value) : null })}
                  placeholder="30" className="input mt-1" />
              </div>

              <div>
                <label className="text-[10px] font-mono uppercase tracking-wider text-prospex-dim">Transcript</label>
                <textarea value={editing.transcript || ''} onChange={e => setEditing({ ...editing, transcript: e.target.value })}
                  rows={4} placeholder="What's actually said — so the written DM can match the angle, and so it's searchable later"
                  className="input mt-1 resize-none" />
              </div>

              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={editing.is_active ?? true}
                  onChange={e => setEditing({ ...editing, is_active: e.target.checked })} className="accent-[#00D4FF]" />
                <span className="text-xs text-prospex-muted">Active — offered when sending</span>
              </label>
            </div>

            <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-prospex-border">
              <button onClick={() => setEditing(null)} className="btn-ghost text-sm">Cancel</button>
              <button onClick={save} disabled={saving} className="btn-primary text-sm disabled:opacity-50">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
