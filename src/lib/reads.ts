export interface Read {
  text: string;
  format: string;
  count: number;
  at: number;
}

/** Repeat sightings of the same payload collapse into one row with a counter. */
export function mergeRead(reads: Read[], text: string, format: string): Read[] {
  const at = Date.now();
  const existing = reads.find((r) => r.text === text);
  const rest = reads.filter((r) => r.text !== text);
  return [
    ...rest,
    existing
      ? { ...existing, count: existing.count + 1, at, format: format || existing.format }
      : { text, format, count: 1, at },
  ];
}

let audio: AudioContext | null = null;

export function beep(): void {
  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    audio ??= new Ctor();
    if (audio.state === 'suspended') void audio.resume();

    const t = audio.currentTime;
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = 'square';
    osc.frequency.value = 1180;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.09, t + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
    osc.connect(gain).connect(audio.destination);
    osc.start(t);
    osc.stop(t + 0.07);
  } catch {
    /* audio is a nicety, never a failure */
  }
}

export function buzz(): void {
  navigator.vibrate?.(38);
}

export async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // Clipboard API needs a secure context and can still be blocked; fall back.
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;opacity:0';
    document.body.append(ta);
    ta.select();
    try {
      document.execCommand('copy');
    } catch {
      /* nothing left to try */
    }
    ta.remove();
  }
}

export function downloadCsv(reads: Read[]): void {
  const q = (v: unknown) => `"${String(v).replace(/"/g, '""')}"`;
  const body = reads
    .map((r) => [q(r.text), q(r.format), r.count, q(new Date(r.at).toISOString())].join(','))
    .join('\n');
  const blob = new Blob([`payload,format,count,time\n${body}`], { type: 'text/csv' });

  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `scan-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '')}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
