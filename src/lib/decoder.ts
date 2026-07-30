import {
  BarcodeDetector as ZXingDetector,
  setZXingModuleOverrides,
} from 'barcode-detector/ponyfill';
// Self-hosted so the app keeps working with no network (and so the service
// worker can precache it). Without this, zxing-wasm reaches for a CDN.
import wasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url';

setZXingModuleOverrides({ locateFile: () => wasmUrl });

export type ScanFormat = 'data_matrix' | 'qr_code';

export interface Hit {
  text: string;
  format: string;
  points: { x: number; y: number }[];
}

export interface Engine {
  /** 'native' or 'zxing-wasm' — surfaced in the status strip. */
  readonly kind: 'native' | 'zxing-wasm';
  readonly label: string;
  /**
   * True when the engine already tries both polarities internally, so the
   * caller must NOT waste alternate frames on an inverted pass. ZXing's C++
   * core does this; the platform detectors generally do not.
   */
  readonly handlesInversion: boolean;
  detect(source: HTMLCanvasElement): Promise<Hit | null>;
}

interface DetectorLike {
  detect(source: CanvasImageSource): Promise<
    { rawValue: string; format: string; cornerPoints: { x: number; y: number }[] }[]
  >;
}

/**
 * Prefer the browser's own detector: it is hardware-accelerated and skips the
 * ~900 KB wasm download entirely. Chromium on Android supports data_matrix;
 * Safari does not, so it lands on zxing-wasm.
 */
async function nativeSupports(): Promise<string[] | null> {
  const Ctor = (
    window as unknown as {
      BarcodeDetector?: { getSupportedFormats(): Promise<string[]> };
    }
  ).BarcodeDetector;
  if (!Ctor) return null;
  try {
    const supported = await Ctor.getSupportedFormats();
    return supported.includes('data_matrix') ? supported : null;
  } catch {
    return null;
  }
}

const prettyFormat = (f: string) => f.replace(/_/g, ' ').toUpperCase();

function wrap(
  detector: DetectorLike,
  kind: Engine['kind'],
  label: string,
  handlesInversion: boolean,
): Engine {
  return {
    kind,
    label,
    handlesInversion,
    async detect(source) {
      const found = await detector.detect(source);
      if (!found?.length) return null;
      const b = found[0];
      return {
        text: b.rawValue,
        format: prettyFormat(b.format ?? ''),
        points: (b.cornerPoints ?? []).map((p) => ({ x: p.x, y: p.y })),
      };
    },
  };
}

export async function createEngine(formats: ScanFormat[]): Promise<Engine> {
  const supported = await nativeSupports();

  if (supported) {
    const want = formats.filter((f) => supported.includes(f));
    const Ctor = (
      window as unknown as { BarcodeDetector: new (o: { formats: string[] }) => DetectorLike }
    ).BarcodeDetector;
    // Platform detectors are not reliable on light-on-dark marks, so the
    // caller alternates an inverted pass for us.
    return wrap(
      new Ctor({ formats: want.length ? want : ['data_matrix'] }),
      'native',
      'native',
      false,
    );
  }

  // ZXing tries inverted internally, so alternating would only halve our rate.
  return wrap(
    new ZXingDetector({ formats }) as unknown as DetectorLike,
    'zxing-wasm',
    'zxing · wasm',
    true,
  );
}

/**
 * Invert a decode buffer in place.
 *
 * Laser-etched and DPM marks are frequently light-on-dark. Engines that do not
 * try both polarities themselves need alternate frames fed to them inverted;
 * see Engine.handlesInversion.
 */
export function invertInPlace(data: Uint8ClampedArray): void {
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 255 - data[i];
    data[i + 1] = 255 - data[i + 1];
    data[i + 2] = 255 - data[i + 2];
  }
}
