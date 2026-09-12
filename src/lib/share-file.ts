// ═══════════════════════════════════════════════════════════════
// SHARE A STORED FILE STRAIGHT INTO INSTAGRAM / WHATSAPP
//
// Prospex holds the voice notes, but no webpage can push a file into
// another app's compose box. The Web Share API is the exception: on
// mobile it hands a real File to the OS share sheet, and both
// Instagram and WhatsApp register as share targets. One tap replaces
// "download it, open the app, find it in the camera roll".
//
// Desktop browsers largely don't support file sharing, so callers
// fall back to a plain download there.
// ═══════════════════════════════════════════════════════════════

export type ShareOutcome = 'shared' | 'cancelled' | 'unsupported' | 'failed';

/** Can this browser hand a file of this type to another app? */
export function canShareFiles(): boolean {
  if (typeof navigator === 'undefined' || !navigator.canShare || !navigator.share) return false;
  try {
    // A representative probe — the API rejects the whole call if the type
    // isn't shareable, so test before fetching several MB.
    const probe = new File([new Blob([''], { type: 'video/mp4' })], 'probe.mp4', { type: 'video/mp4' });
    return navigator.canShare({ files: [probe] });
  } catch {
    return false;
  }
}

function nameFor(url: string, fallback: string): string {
  const base = url.split('?')[0].split('/').pop() || '';
  return base.includes('.') ? base : fallback;
}

function mimeFor(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase();
  if (ext === 'mp4' || ext === 'm4v') return 'video/mp4';
  if (ext === 'mov') return 'video/quicktime';
  if (ext === 'mp3') return 'audio/mpeg';
  if (ext === 'm4a') return 'audio/mp4';
  if (ext === 'ogg') return 'audio/ogg';
  if (ext === 'wav') return 'audio/wav';
  return 'application/octet-stream';
}

/**
 * Pull the stored file and hand it to the OS share sheet.
 *
 * `text` is passed alongside where the platform accepts it — some share
 * targets take only the file and drop the text, which is why the caller
 * still copies the message separately rather than relying on this.
 */
export async function shareStoredFile(
  url: string,
  opts: { suggestedName?: string; text?: string; title?: string } = {},
): Promise<ShareOutcome> {
  if (!canShareFiles()) return 'unsupported';

  try {
    const res = await fetch(url, { mode: 'cors' });
    if (!res.ok) return 'failed';
    const blob = await res.blob();

    const name = opts.suggestedName || nameFor(url, 'voice-note.mp4');
    const type = blob.type && blob.type !== 'application/octet-stream' ? blob.type : mimeFor(name);
    const file = new File([blob], name, { type });

    if (!navigator.canShare({ files: [file] })) return 'unsupported';

    // Text is included only when the platform will take it with a file;
    // otherwise the share sheet can reject the whole payload.
    const payload: ShareData = navigator.canShare({ files: [file], text: opts.text })
      ? { files: [file], text: opts.text, title: opts.title }
      : { files: [file] };

    await navigator.share(payload);
    return 'shared';
  } catch (err) {
    // The user dismissing the sheet throws AbortError — not a failure.
    if (err instanceof DOMException && err.name === 'AbortError') return 'cancelled';
    console.error('[share-file]', err);
    return 'failed';
  }
}
