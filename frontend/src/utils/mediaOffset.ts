import { normalizeMediaOffset } from '../state/normalize.ts';
import { formatClock } from './transportFormat.ts';

/** Arrow keys on the bar 1 marker move the offset by this much, seconds. */
export const OFFSET_KEY_STEP_SECONDS = 0.01;
/** Shift + arrow keys move the offset by this much, seconds. */
export const OFFSET_KEY_BIG_STEP_SECONDS = 0.1;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Left edge of the bar 1 marker in % of the waveform width; null when the offset lies outside
 * [0, duration] or duration <= 0.
 */
export function markerPercent(offset: number, duration: number): number | null {
  if (!(duration > 0) || offset < 0 || offset > duration) return null;
  return (offset / duration) * 100;
}

/**
 * Offset for a pointer x inside a waveform of this width: clamp(x / width, 0, 1) * duration,
 * rounded to 1 ms; 0 when width <= 0.
 */
export function offsetFromPointer(x: number, width: number, duration: number): number {
  if (!(width > 0)) return 0;
  return normalizeMediaOffset(clamp(x / width, 0, 1) * duration);
}

/** New offset for a key on the marker, clamped to [0, duration] and rounded to 1 ms; null for other keys. */
export function offsetForKey(
  offset: number,
  key: string,
  shiftKey: boolean,
  duration: number,
): number | null {
  const step = shiftKey ? OFFSET_KEY_BIG_STEP_SECONDS : OFFSET_KEY_STEP_SECONDS;
  let next: number;
  switch (key) {
    case 'ArrowLeft':
      next = offset - step;
      break;
    case 'ArrowRight':
      next = offset + step;
      break;
    case 'Home':
      next = 0;
      break;
    case 'End':
      next = duration;
      break;
    default:
      return null;
  }
  return normalizeMediaOffset(clamp(next, 0, Math.max(0, duration)));
}

/** A sentence that says where bar 1 is in the media. */
export function mediaOffsetDescription(offset: number): string {
  if (offset === 0) return 'Bar 1 is at the start of the media.';
  if (offset > 0) return `Bar 1 is at ${formatClock(offset)} of the media.`;
  return `The media starts ${formatClock(-offset)} after bar 1.`;
}
