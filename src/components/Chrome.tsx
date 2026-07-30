import type { RefObject } from 'react';
import type { Caps, Lens } from '@lib/camera';
import type { Read } from '@lib/reads';

/* ── status strip ────────────────────────────────────────────── */

export function StatusStrip({
  live,
  engineLabel,
  passRef,
}: {
  live: boolean;
  engineLabel: string;
  passRef: RefObject<HTMLSpanElement | null>;
}) {
  return (
    <header className="strip">
      <span className="led" data-on={live ? '1' : '0'} />
      <span className="brand">Code Scanner</span>
      <span className="sep">/</span>
      <span>
        engine <span className="val">{engineLabel}</span>
      </span>
      <span className="right">
        <span className="pass">
          pass{' '}
          <span className="val" ref={passRef}>
            —
          </span>
        </span>
      </span>
    </header>
  );
}

/* ── control rail ────────────────────────────────────────────── */

export function ControlRail({
  caps,
  live,
  torchOn,
  zoom,
  wantQr,
  sound,
  lenses,
  deviceId,
  onTorch,
  onZoom,
  onQr,
  onSound,
  onLens,
}: {
  caps: Caps;
  live: boolean;
  torchOn: boolean;
  zoom: number;
  wantQr: boolean;
  sound: boolean;
  lenses: Lens[];
  deviceId?: string;
  onTorch: () => void;
  onZoom: (v: number) => void;
  onQr: () => void;
  onSound: () => void;
  onLens: (id: string) => void;
}) {
  return (
    <div className="rail">
      {caps.torch && (
        <button className="tog" aria-pressed={torchOn} onClick={onTorch}>
          Torch
        </button>
      )}
      <button className="tog" aria-pressed={wantQr} onClick={onQr}>
        + QR
      </button>
      <button className="tog" aria-pressed={sound} onClick={onSound}>
        Beep
      </button>

      {caps.zoom && (
        <div className="zoom">
          <label htmlFor="zoom">Zoom</label>
          <input
            id="zoom"
            type="range"
            min={caps.zoom.min}
            max={caps.zoom.max}
            step={caps.zoom.step}
            value={zoom}
            disabled={!live}
            onChange={(e) => onZoom(Number(e.target.value))}
          />
        </div>
      )}

      {lenses.length > 1 && (
        <select
          aria-label="Camera"
          value={deviceId ?? lenses[0]?.deviceId}
          onChange={(e) => onLens(e.target.value)}
        >
          {lenses.map((l) => (
            <option key={l.deviceId} value={l.deviceId}>
              {l.label}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

/* ── start / error gate ──────────────────────────────────────── */

export function Gate({
  busy,
  error,
  onStart,
}: {
  busy: boolean;
  error: { title: string; message: string } | null;
  onStart: () => void;
}) {
  return (
    <div className={`gate${error ? ' err' : ''}`}>
      <h1>{error ? error.title : 'Data Matrix reader'}</h1>
      <p>
        {error
          ? error.message
          : 'Point the rear camera at a Data Matrix. Reads happen continuously — no shutter.'}
      </p>
      <button onClick={onStart} disabled={busy}>
        {busy ? 'Starting…' : error ? 'Try again' : 'Start camera'}
      </button>
    </div>
  );
}

/* ── read log ────────────────────────────────────────────────── */

export function ReadLog({
  reads,
  onCopy,
  onCopyAll,
  onCsv,
  onClear,
}: {
  reads: Read[];
  onCopy: (text: string) => void;
  onCopyAll: () => void;
  onCsv: () => void;
  onClear: () => void;
}) {
  const rows = [...reads].reverse();
  const empty = rows.length === 0;

  return (
    <section className="log">
      <div className="head">
        <span>
          reads <span className="n">{rows.length}</span>
        </span>
        <span className="acts">
          <button onClick={onCopyAll} disabled={empty}>
            Copy all
          </button>
          <button onClick={onCsv} disabled={empty}>
            CSV
          </button>
          <button onClick={onClear} disabled={empty}>
            Clear
          </button>
        </span>
      </div>

      {empty ? (
        <div className="empty">No reads yet.</div>
      ) : (
        <ol>
          {rows.map((r) => (
            <li key={r.text} onClick={() => onCopy(r.text)}>
              <span className="txt">{r.text}</span>
              <span className="meta">
                {r.count > 1 && <span className="x">×{r.count}</span>}
                {r.count > 1 && ' · '}
                {r.format} · {new Date(r.at).toTimeString().slice(0, 8)}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
