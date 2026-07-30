export interface Lens {
  deviceId: string;
  label: string;
}

export interface Caps {
  torch: boolean;
  zoom: { min: number; max: number; step: number; value: number } | null;
}

export class InsecureContextError extends Error {
  override name = 'InsecureContextError';
}

export async function openCamera(deviceId?: string): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) throw new InsecureContextError();

  const video: MediaTrackConstraints = {
    width: { ideal: 1920 },
    height: { ideal: 1080 },
  };
  // An explicit lens choice wins; otherwise ask for the rear camera.
  if (deviceId) video.deviceId = { exact: deviceId };
  else video.facingMode = { ideal: 'environment' };

  return navigator.mediaDevices.getUserMedia({ audio: false, video });
}

export function readCaps(track: MediaStreamTrack): Caps {
  const caps: MediaTrackCapabilities = track.getCapabilities?.() ?? {};
  const settings = track.getSettings();

  let zoom: Caps['zoom'] = null;
  if (caps.zoom) {
    const { min, max } = caps.zoom;
    zoom = {
      min,
      max,
      step: caps.zoom.step ?? ((max - min) / 50 || 0.1),
      value: settings.zoom ?? min,
    };
  }
  return { torch: 'torch' in caps, zoom };
}

export async function applyTorch(track: MediaStreamTrack, on: boolean): Promise<void> {
  await track.applyConstraints({ advanced: [{ torch: on }] });
}

export async function applyZoom(track: MediaStreamTrack, value: number): Promise<void> {
  await track.applyConstraints({ advanced: [{ zoom: value }] });
}

/**
 * `facingMode: environment` often selects the ultrawide, which cannot focus
 * close enough for a small mark — so let the user pick the lens explicitly.
 * Labels are only populated after a permission grant, hence the post-open call.
 */
export async function listLenses(): Promise<Lens[]> {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices
      .filter((d) => d.kind === 'videoinput')
      .map((d, i) => ({
        deviceId: d.deviceId,
        label: (d.label || `Camera ${i + 1}`).replace(/\s*\([0-9a-f]{4}:[0-9a-f]{4}\)\s*$/i, ''),
      }));
  } catch {
    return [];
  }
}

export function stopStream(stream: MediaStream | null): void {
  stream?.getTracks().forEach((t) => t.stop());
}

/** Keeps the screen alive while scanning; unsupported browsers no-op. */
export async function requestWakeLock(): Promise<WakeLockSentinel | null> {
  try {
    return (await navigator.wakeLock?.request('screen')) ?? null;
  } catch {
    return null;
  }
}
