import type { Quality } from "../brain/scene";

export interface PerfProfile {
  quality: Quality;
  reducedMotion: boolean;
}

/**
 * Cheap heuristic at boot — no benchmarking loop, just signals that correlate
 * well enough with GPU/CPU headroom to pick a particle/node budget.
 */
export function detectPerfProfile(): PerfProfile {
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const cores = navigator.hardwareConcurrency ?? 4;
  const dpr = window.devicePixelRatio ?? 1;
  const isCoarsePointer = window.matchMedia("(pointer: coarse)").matches;
  const smallViewport = window.innerWidth < 760;

  let quality: Quality = "high";
  if (isCoarsePointer || smallViewport || cores <= 4) {
    quality = "medium";
  }
  if ((isCoarsePointer && smallViewport) || cores <= 2 || dpr > 3) {
    quality = "low";
  }

  return { quality, reducedMotion };
}
