# Code Scanner

Continuous **Data Matrix** (and optional QR) reader for a phone's rear camera.
React + Vite + TS, deployed to GitHub Pages as an installable PWA.

**Live:** https://evanyip05.github.io/CodeScanner/

## How it decodes

Two engines, chosen at runtime:

| Engine | When | Notes |
| --- | --- | --- |
| `BarcodeDetector` | Chromium (incl. Android) | Hardware-accelerated, no wasm download |
| `zxing-wasm` | Safari, anything else | ~900 KB wasm, self-hosted and precached |

Only the region inside the reticle is decoded, downscaled to 720 px max. The
label under the reticle reads `roi 512px → 512px` so you can tell whether the
mark has enough pixels-per-module before blaming the decoder.

**Polarity.** Laser-etched and DPM marks are often light-on-dark, which most
decoders won't read as-is. ZXing tries both polarities internally, so on that
path the app leaves it alone (status strip shows `pass both`). The platform
detectors don't, so on those the app alternates a normal and an inverted frame
(`pass normal` / `pass inverted`). Alternating on both engines would halve the
scan rate for nothing.

**Lens choice matters.** `facingMode: environment` frequently picks the
ultrawide, which cannot focus close enough for a small mark. The rail exposes a
lens picker, plus torch and optical zoom when the camera reports them.

## Camera requires a secure origin

Browsers only expose `getUserMedia` on **https** or **localhost**. A `file://`
path is always refused — Chromium has no origin to attach the permission grant
to, so you get a denial rather than a prompt. GitHub Pages is https, so the
deployed build is fine.

For local dev on a phone, serve over `localhost` on the device itself:

```
adb reverse tcp:5173 tcp:5173     # then open http://localhost:5173
```

`npm run dev -- --host` over a LAN IP will *not* work — a bare `http://192.168.x.x`
is not a secure origin.

## Offline

`vite-plugin-pwa` precaches the bundle and the wasm, so after one visit over
https it runs with no network. Install it from the browser menu ("Add to Home
screen") to get it standalone and full-screen.

## Build

```
npm install
npm run dev            # local dev
npm run build          # typecheck + bundle
npm run lint
npm run deploy         # gh-pages
```

## Layout

```
src/
  lib/
    camera.ts      getUserMedia, torch, zoom, lens enumeration
    decoder.ts     engine selection, wasm self-hosting, polarity helper
    geometry.ts    object-fit:cover math mapping reticle <-> source pixels
    reads.ts       read model, beep/vibrate, clipboard, CSV
    useScanner.ts  camera lifecycle + decode loop
  components/
    Scanner.tsx    viewfinder and wiring
    Chrome.tsx     status strip, control rail, gate, read log
```

The decode loop runs ~22×/s and lives entirely in refs — it never sets React
state per frame, so the UI doesn't re-render while scanning.

Path aliases `@lib/*` and `@components/*` are declared in **both**
`vite.config.ts` (`resolve.alias`) and `tsconfig.app.json` (`compilerOptions.paths`).
They must match exactly, case included, or Vite and tsc disagree.
