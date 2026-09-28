import type { PedalEvent, PedalType } from '../state/types.ts';

/** A free time range; `max` may be `Infinity`. */
export interface TimeBounds {
  readonly min: number;
  readonly max: number;
}

/** Pedals of the same type overlap when their intervals intersect; touching is not overlapping. */
export function pedalsOverlap(a: PedalEvent, b: PedalEvent): boolean {
  return a.type === b.type && a.start < b.end && b.start < a.end;
}

/** Pedals of one type sorted by start. The input is not mutated. */
export function pedalsOfType(
  pedals: readonly PedalEvent[],
  type: PedalType,
): readonly PedalEvent[] {
  return pedals.filter((pedal) => pedal.type === type).sort((a, b) => a.start - b.start);
}

/** Index of the last pedal with start <= time in a list sorted by start, or -1. */
function lastStartingAtOrBefore(sorted: readonly PedalEvent[], time: number): number {
  let low = 0;
  let high = sorted.length - 1;
  let found = -1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    if (sorted[middle].start <= time) {
      found = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return found;
}

/** The pedal of a type that is pressed at a time (start inclusive, end exclusive), or null. */
export function pedalAt(
  pedals: readonly PedalEvent[],
  type: PedalType,
  time: number,
): PedalEvent | null {
  const sorted = pedalsOfType(pedals, type);
  const index = lastStartingAtOrBefore(sorted, time);
  if (index < 0) return null;
  const pedal = sorted[index];
  return time < pedal.end ? pedal : null;
}

/**
 * The free range around a time between pedals of one type: `min` is the latest end at or
 * before the time (or 0), `max` is the earliest start after it (or Infinity).
 * Returns null when the time is inside a pedal of that type, including exactly at its start.
 */
export function gapAt(
  pedals: readonly PedalEvent[],
  type: PedalType,
  time: number,
): TimeBounds | null {
  let min = 0;
  let max = Infinity;
  for (const pedal of pedals) {
    if (pedal.type !== type) continue;
    if (pedal.start <= time && time < pedal.end) return null;
    if (pedal.end <= time) min = Math.max(min, pedal.end);
    if (pedal.start > time) max = Math.min(max, pedal.start);
  }
  return { min, max };
}

/**
 * Where an existing pedal may be moved or resized among the other pedals of its type:
 * `min` is the latest end of those starting before it (or 0), `max` is the earliest start of
 * those starting at or after it (or Infinity). The pedal itself is ignored by id.
 */
export function neighborBounds(pedals: readonly PedalEvent[], pedal: PedalEvent): TimeBounds {
  let min = 0;
  let max = Infinity;
  for (const other of pedals) {
    if (other.id === pedal.id || other.type !== pedal.type) continue;
    if (other.start < pedal.start) {
      min = Math.max(min, other.end);
    } else {
      max = Math.min(max, other.start);
    }
  }
  return { min, max };
}
