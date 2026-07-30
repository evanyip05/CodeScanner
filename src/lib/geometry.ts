/**
 * The video is painted with `object-fit: cover`, so the visible frame is a
 * cropped, scaled slice of the source. To decode only what's inside the
 * reticle we have to undo that transform and express the reticle box in
 * source-video pixels.
 */

export interface Geo {
  /** stage size in CSS px */
  cw: number;
  ch: number;
  /** cover-fit offset + scale from source px -> CSS px */
  ox: number;
  oy: number;
  scale: number;
  /** reticle box in SOURCE video px (square) */
  sx: number;
  sy: number;
  ss: number;
  /** decode buffer edge in px, and buffer-px per source-px */
  n: number;
  k: number;
  /** reticle box in CSS px, for positioning the overlay */
  box: { left: number; top: number; side: number };
}

export interface Point {
  x: number;
  y: number;
}

/** Reticle edge as a fraction of the shorter stage edge. */
export const ROI_FRACTION = 0.68;
/** Cap on the decode buffer. Larger costs time and rarely helps a Data Matrix. */
export const ROI_MAX_PX = 720;

export function computeGeo(
  stageW: number,
  stageH: number,
  videoW: number,
  videoH: number,
): Geo | null {
  if (!stageW || !stageH || !videoW || !videoH) return null;

  const scale = Math.max(stageW / videoW, stageH / videoH);
  const ox = (stageW - videoW * scale) / 2;
  const oy = (stageH - videoH * scale) / 2;

  const side = Math.round(Math.min(stageW, stageH) * ROI_FRACTION);
  const left = Math.round((stageW - side) / 2);
  const top = Math.round((stageH - side) / 2);

  // reticle box, back-projected into source-video pixels
  const sx = (left - ox) / scale;
  const sy = (top - oy) / scale;
  const ss = side / scale;

  const n = Math.max(1, Math.min(ROI_MAX_PX, Math.round(ss)));

  return {
    cw: stageW,
    ch: stageH,
    ox,
    oy,
    scale,
    sx,
    sy,
    ss,
    n,
    k: n / ss,
    box: { left, top, side },
  };
}

/** Decode-buffer coordinates -> CSS coordinates, for drawing the lock outline. */
export function bufferPointToCss(g: Geo, p: Point): Point {
  return {
    x: g.ox + (g.sx + p.x / g.k) * g.scale,
    y: g.oy + (g.sy + p.y / g.k) * g.scale,
  };
}
