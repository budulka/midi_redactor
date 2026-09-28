import { MIN_PEDAL_DURATION } from '../state/constants.ts';
import type { PedalEvent, PedalType, TimeSignature } from '../state/types.ts';
import { minDragDuration, type DragOptions } from './noteEditing.ts';
import type { TimeBounds } from './pedalIntervals.ts';
import { snapToGrid } from './quantize.ts';
import { beatDurationSeconds } from './time.ts';

export type PedalDragKind = 'create' | 'move' | 'resize-start' | 'resize-end';

export interface PedalDragState {
  readonly kind: PedalDragKind;
  /** The pedal as it was when the gesture started (for create: the new pedal). */
  readonly original: PedalEvent;
  /** Time under the mouse when the gesture started. */
  readonly originTime: number;
  /**
   * Free range the pedal must stay in: for create `{ min: original.start, max: gap.max }`,
   * otherwise the neighbour bounds of the pedal.
   */
  readonly bounds: TimeBounds;
}

/** Default length of a new pedal: one beat, but not shorter than the minimal drag length. */
export function defaultPedalLength(bpm: number, ts: TimeSignature, opts: DragOptions): number {
  return Math.max(beatDurationSeconds(bpm, ts), minDragDuration(opts));
}

/**
 * A new pedal at a time inside a free gap. The start snaps down to the grid and is clamped to the
 * gap start; the end is `start + length`, clamped to the gap end. Returns null when there is no
 * room for MIN_PEDAL_DURATION.
 */
export function createPedalAt(
  id: string,
  type: PedalType,
  time: number,
  length: number,
  opts: DragOptions,
  gap: TimeBounds,
): PedalEvent | null {
  const start = Math.max(gap.min, opts.snap ? snapToGrid(time, opts.step, 'floor') : time);
  const end = Math.min(gap.max, start + length);
  if (end - start < MIN_PEDAL_DURATION) return null;
  return { id, type, start, end };
}

/** Preview of the dragged pedal for the current mouse time; id and type never change. */
export function applyPedalDrag(drag: PedalDragState, time: number, opts: DragOptions): PedalEvent {
  const { original, bounds } = drag;
  const minLength = minDragDuration(opts);
  const dt = time - drag.originTime;
  const snapNearest = (value: number) =>
    opts.snap ? snapToGrid(value, opts.step, 'nearest') : value;
  switch (drag.kind) {
    case 'create': {
      const end = opts.snap ? snapToGrid(time, opts.step, 'ceil') : time;
      return {
        ...original,
        end: Math.min(bounds.max, Math.max(original.start + minLength, end)),
      };
    }
    case 'move': {
      const length = original.end - original.start;
      const start = Math.min(
        bounds.max - length,
        Math.max(bounds.min, snapNearest(original.start + dt)),
      );
      return { ...original, start, end: start + length };
    }
    case 'resize-start': {
      const start = Math.max(
        bounds.min,
        Math.min(snapNearest(original.start + dt), original.end - minLength),
      );
      return { ...original, start };
    }
    case 'resize-end': {
      const end = Math.min(
        bounds.max,
        Math.max(snapNearest(original.end + dt), original.start + minLength),
      );
      return { ...original, end };
    }
  }
}
