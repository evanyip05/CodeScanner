import { useCallback, useEffect, useRef, useState } from 'react';
import {
  applyTorch,
  applyZoom,
  type Caps,
  type Lens,
  listLenses,
  openCamera,
  readCaps,
  requestWakeLock,
  stopStream,
} from './camera';
import { createEngine, type Engine, invertInPlace, type ScanFormat } from './decoder';
import { bufferPointToCss, computeGeo, type Geo } from './geometry';
import { beep, buzz, mergeRead, type Read } from './reads';

export type Status = 'idle' | 'starting' | 'running' | 'error';

/** Minimum gap between attempts. ~22/s is plenty and leaves the UI responsive. */
const FRAME_BUDGET_MS = 45;
/** How long a lock outline stays on screen after a read. */
const LOCK_MS = 550;
/** Identical payload inside this window is the same physical mark, not a new read. */
const REPEAT_MS = 1200;

export function useScanner() {
  // ── DOM handles ────────────────────────────────────────────────
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  const reticleRef = useRef<HTMLDivElement | null>(null);
  /** Written to directly — these change every frame and must not re-render. */
  const passRef = useRef<HTMLSpanElement | null>(null);
  const roiRef = useRef<HTMLDivElement | null>(null);

  // ── hot state (refs, never triggers render) ────────────────────
  const workRef = useRef<HTMLCanvasElement | null>(null);
  const geoRef = useRef<Geo | null>(null);
  const engineRef = useRef<Engine | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const wakeRef = useRef<WakeLockSentinel | null>(null);
  const runRef = useRef(0);
  const invertRef = useRef(false);
  const lastRef = useRef({ text: '', at: 0 });
  const seenRef = useRef<Set<string>>(new Set());
  const lockUntilRef = useRef(0);
  const formatsRef = useRef<ScanFormat[]>(['data_matrix']);

  // ── render state ───────────────────────────────────────────────
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<{ title: string; message: string } | null>(null);
  const [engineLabel, setEngineLabel] = useState('idle');
  const [caps, setCaps] = useState<Caps>({ torch: false, zoom: null });
  const [lenses, setLenses] = useState<Lens[]>([]);
  const [deviceId, setDeviceId] = useState<string | undefined>();
  const [torchOn, setTorchOn] = useState(false);
  const [zoom, setZoomState] = useState(1);
  const [wantQr, setWantQr] = useState(false);
  const [sound, setSound] = useState(true);
  const [reads, setReads] = useState<Read[]>([]);

  workRef.current ??= document.createElement('canvas');

  // ── geometry ───────────────────────────────────────────────────
  const measure = useCallback(() => {
    const stage = stageRef.current;
    const video = videoRef.current;
    const overlay = overlayRef.current;
    if (!stage || !video || !overlay) return;

    overlay.width = stage.clientWidth;
    overlay.height = stage.clientHeight;

    const geo = computeGeo(
      stage.clientWidth,
      stage.clientHeight,
      video.videoWidth,
      video.videoHeight,
    );
    geoRef.current = geo;
    if (!geo) return;

    const work = workRef.current!;
    work.width = geo.n;
    work.height = geo.n;

    const { left, top, side } = geo.box;
    if (reticleRef.current) {
      reticleRef.current.style.cssText = `left:${left}px;top:${top}px;width:${side}px;height:${side}px`;
    }
    if (roiRef.current) {
      roiRef.current.style.cssText = `left:${left}px;top:${top + side + 8}px`;
      roiRef.current.textContent = `roi ${Math.round(geo.ss)}px → ${geo.n}px`;
    }
  }, []);

  // ── lock outline ───────────────────────────────────────────────
  const drawLock = useCallback((points: { x: number; y: number }[]) => {
    lockUntilRef.current = performance.now() + LOCK_MS;
    reticleRef.current?.classList.add('lock');

    const overlay = overlayRef.current;
    const geo = geoRef.current;
    const ctx = overlay?.getContext('2d');
    if (!overlay || !ctx) return;
    ctx.clearRect(0, 0, overlay.width, overlay.height);
    if (!geo || points.length < 3) return;

    const pts = points.map((p) => bufferPointToCss(geo, p));
    ctx.strokeStyle =
      getComputedStyle(document.documentElement).getPropertyValue('--lock').trim() || '#21D4B4';
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.closePath();
    ctx.stroke();
  }, []);

  const clearLock = useCallback(() => {
    const reticle = reticleRef.current;
    if (!reticle?.classList.contains('lock')) return;
    reticle.classList.remove('lock');
    const overlay = overlayRef.current;
    overlay?.getContext('2d')?.clearRect(0, 0, overlay.width, overlay.height);
  }, []);

  // ── one decode attempt ─────────────────────────────────────────
  const tick = useCallback(async () => {
    const video = videoRef.current;
    const engine = engineRef.current;
    const work = workRef.current;
    if (!video || !engine || !work || video.readyState < 2) return;

    let geo = geoRef.current;
    if (!geo) {
      measure();
      geo = geoRef.current;
      if (!geo) return;
    }

    // Only alternate polarity for engines that don't already try both.
    const invert = engine.handlesInversion ? false : !invertRef.current;
    invertRef.current = invert;
    if (passRef.current) {
      passRef.current.textContent = engine.handlesInversion
        ? 'both'
        : invert
          ? 'inverted'
          : 'normal';
    }

    const ctx = work.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    ctx.drawImage(video, geo.sx, geo.sy, geo.ss, geo.ss, 0, 0, geo.n, geo.n);

    if (invert) {
      const frame = ctx.getImageData(0, 0, geo.n, geo.n);
      invertInPlace(frame.data);
      ctx.putImageData(frame, 0, 0);
    }

    const hit = await engine.detect(work);
    if (!hit?.text) {
      if (performance.now() > lockUntilRef.current) clearLock();
      return;
    }

    drawLock(hit.points);

    const now = Date.now();
    const repeat = hit.text === lastRef.current.text && now - lastRef.current.at < REPEAT_MS;
    lastRef.current = { text: hit.text, at: now };
    if (repeat) return;

    // Purity matters here: StrictMode double-invokes state updaters, so the
    // "is this new" decision lives in a ref rather than inside the updater.
    const isNew = !seenRef.current.has(hit.text);
    seenRef.current.add(hit.text);
    setReads((prev) => mergeRead(prev, hit.text, hit.format));
    if (isNew) {
      if (sound) beep();
      buzz();
    }
  }, [clearLock, drawLock, measure, sound]);

  // ── loop ───────────────────────────────────────────────────────
  const loop = useCallback(
    async (generation: number) => {
      while (runRef.current === generation) {
        const started = performance.now();
        try {
          await tick();
        } catch {
          /* a single bad frame is not fatal */
        }
        const spent = performance.now() - started;
        await new Promise((r) => setTimeout(r, Math.max(0, FRAME_BUDGET_MS - spent)));
      }
    },
    [tick],
  );

  const stop = useCallback(() => {
    runRef.current += 1;
    stopStream(streamRef.current);
    streamRef.current = null;
    trackRef.current = null;
    void wakeRef.current?.release().catch(() => {});
    wakeRef.current = null;
    setStatus('idle');
  }, []);

  const fail = useCallback((err: unknown) => {
    const name = (err as Error)?.name ?? 'Error';
    const table: Record<string, [string, string]> = {
      InsecureContextError: [
        'Needs a secure origin',
        'Browsers only expose the camera over https, or on localhost. Opening this build from a file:// path will always be refused.',
      ],
      NotAllowedError: [
        'Camera blocked',
        'Permission was denied for this origin. Allow the camera in site settings and reload.',
      ],
      NotFoundError: ['No camera found', 'This device reports no video input.'],
      NotReadableError: [
        'Camera busy',
        'Another app or tab is holding the camera. Close it and try again.',
      ],
      OverconstrainedError: [
        'Lens unavailable',
        'That camera rejected the requested settings. Pick a different one.',
      ],
    };
    const [title, message] = table[name] ?? ['Camera failed', (err as Error)?.message ?? name];
    setError({ title, message });
    setStatus('error');
  }, []);

  const start = useCallback(async () => {
    setError(null);
    setStatus('starting');
    try {
      runRef.current += 1;
      stopStream(streamRef.current);

      const stream = await openCamera(deviceId);
      streamRef.current = stream;
      const track = stream.getVideoTracks()[0];
      trackRef.current = track;

      const video = videoRef.current!;
      video.srcObject = stream;
      await video.play().catch(() => {});
      if (video.readyState < 2) {
        await new Promise<void>((r) =>
          video.addEventListener('loadedmetadata', () => r(), { once: true }),
        );
      }

      measure();
      const nextCaps = readCaps(track);
      setCaps(nextCaps);
      setTorchOn(false);
      if (nextCaps.zoom) setZoomState(nextCaps.zoom.value);
      setLenses(await listLenses());

      if (!engineRef.current) {
        setEngineLabel('loading');
        engineRef.current = await createEngine(formatsRef.current);
      }
      setEngineLabel(engineRef.current.label);

      wakeRef.current = await requestWakeLock();
      setStatus('running');

      const generation = runRef.current;
      void loop(generation);
    } catch (err) {
      stopStream(streamRef.current);
      streamRef.current = null;
      fail(err);
    }
  }, [deviceId, fail, loop, measure]);

  // ── controls ───────────────────────────────────────────────────
  const toggleTorch = useCallback(async () => {
    const track = trackRef.current;
    if (!track) return;
    const next = !torchOn;
    try {
      await applyTorch(track, next);
      setTorchOn(next);
    } catch {
      setCaps((c) => ({ ...c, torch: false }));
    }
  }, [torchOn]);

  const setZoom = useCallback((value: number) => {
    setZoomState(value);
    const track = trackRef.current;
    if (track) void applyZoom(track, value).catch(() => {});
  }, []);

  const toggleQr = useCallback(() => {
    const next = !wantQr;
    setWantQr(next);
    formatsRef.current = next ? ['data_matrix', 'qr_code'] : ['data_matrix'];
    // Rebuild lazily: the loop picks the new engine up on its next frame.
    void createEngine(formatsRef.current).then((e) => {
      engineRef.current = e;
      setEngineLabel(e.label);
    });
  }, [wantQr]);

  const selectLens = useCallback((id: string) => setDeviceId(id), []);

  const clearReads = useCallback(() => {
    setReads([]);
    seenRef.current.clear();
    lastRef.current = { text: '', at: 0 };
  }, []);

  // Restart when the lens selection changes while live.
  const liveRef = useRef(false);
  liveRef.current = status === 'running';
  useEffect(() => {
    if (deviceId && liveRef.current) void start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceId]);

  // Re-measure on layout changes; re-acquire the wake lock after backgrounding.
  useEffect(() => {
    const onResize = () => measure();
    const onOrientation = () => setTimeout(measure, 350);
    const onVisible = () => {
      if (document.visibilityState === 'visible' && liveRef.current && !wakeRef.current) {
        void requestWakeLock().then((w) => (wakeRef.current = w));
      }
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onOrientation);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onOrientation);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [measure]);

  // Release the camera if the component goes away.
  useEffect(
    () => () => {
      runRef.current += 1;
      stopStream(streamRef.current);
      void wakeRef.current?.release().catch(() => {});
    },
    [],
  );

  return {
    refs: { videoRef, stageRef, overlayRef, reticleRef, passRef, roiRef },
    status,
    error,
    engineLabel,
    caps,
    lenses,
    deviceId,
    torchOn,
    zoom,
    wantQr,
    sound,
    reads,
    start,
    stop,
    measure,
    toggleTorch,
    setZoom,
    toggleQr,
    toggleSound: () => setSound((s) => !s),
    selectLens,
    clearReads,
  };
}
