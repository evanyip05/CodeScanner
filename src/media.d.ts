/**
 * Chromium ships torch and zoom on video tracks (MediaStream Image Capture),
 * but TypeScript's lib.dom does not declare them yet. These global interface
 * merges let us use them without casting at every call site.
 */

interface MediaTrackConstraintSet {
  torch?: ConstrainBoolean;
  zoom?: ConstrainDouble;
}

interface MediaTrackCapabilities {
  torch?: boolean;
  zoom?: { min: number; max: number; step?: number };
}

interface MediaTrackSettings {
  torch?: boolean;
  zoom?: number;
}
