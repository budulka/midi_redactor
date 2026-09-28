export const MIN_PLAYBACK_RATE = 0.25;
export const MAX_PLAYBACK_RATE = 2;
export const DEFAULT_PLAYBACK_RATE = 1;

/** Speeds offered in the speed selector, ascending. */
export const PLAYBACK_RATES: readonly number[] = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

/** Keeps a rate within [MIN_PLAYBACK_RATE, MAX_PLAYBACK_RATE]; NaN becomes the default rate. */
export function clampPlaybackRate(rate: number): number {
  if (Number.isNaN(rate)) return DEFAULT_PLAYBACK_RATE;
  return Math.min(Math.max(rate, MIN_PLAYBACK_RATE), MAX_PLAYBACK_RATE);
}

export function formatPlaybackRate(rate: number): string {
  return `${rate}×`;
}
