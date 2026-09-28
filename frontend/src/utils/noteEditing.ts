import { clampPitch } from '../state/normalize.ts';
import type { Note } from '../state/types.ts';
import { snapToGrid } from './quantize.ts';

export const DRAG_THRESHOLD_PX = 3;
export const DEFAULT_NOTE_VELOCITY = 100;
/** Minimum duration while snapping is off, so the note stays visible. */
export const MIN_FREE_DURATION = 0.01;

export interface DragOptions {
  /** Grid step in seconds. */
  readonly step: number;
  readonly snap: boolean;
}

export type DragKind = 'create' | 'move' | 'resize';

export interface DragState {
  readonly kind: DragKind;
  /** The note as it was when the gesture started (for create: the new note). */
  readonly original: Note;
  /** Time under the mouse when the gesture started. */
  readonly originTime: number;
  /** Pitch under the mouse when the gesture started. */
  readonly originPitch: number;
}

export function minDragDuration(opts: DragOptions): number {
  return opts.snap ? opts.step : MIN_FREE_DURATION;
}

/** A new note at the given time; its length is one grid step. */
export function createNoteAt(
  id: string,
  time: number,
  pitch: number,
  velocity: number,
  opts: DragOptions,
): Note {
  const start = opts.snap ? snapToGrid(time, opts.step, 'floor') : time;
  return { id, pitch, start, duration: opts.step, velocity };
}

/** Preview of the dragged note for the current mouse time and pitch. */
export function applyDrag(drag: DragState, time: number, pitch: number, opts: DragOptions): Note {
  const { original } = drag;
  const minDuration = minDragDuration(opts);
  const dt = time - drag.originTime;
  switch (drag.kind) {
    case 'create': {
      const end = opts.snap ? snapToGrid(time, opts.step, 'ceil') : time;
      return { ...original, duration: Math.max(minDuration, end - original.start) };
    }
    case 'move': {
      const rawStart = original.start + dt;
      const start = opts.snap ? snapToGrid(rawStart, opts.step, 'nearest') : Math.max(0, rawStart);
      return {
        ...original,
        start,
        pitch: clampPitch(original.pitch + (pitch - drag.originPitch)),
      };
    }
    case 'resize': {
      const rawEnd = original.start + original.duration + dt;
      const end = opts.snap ? snapToGrid(rawEnd, opts.step, 'nearest') : rawEnd;
      return { ...original, duration: Math.max(minDuration, end - original.start) };
    }
  }
}

export function exceedsDragThreshold(dx: number, dy: number): boolean {
  return Math.hypot(dx, dy) >= DRAG_THRESHOLD_PX;
}

/**
 * Items (notes or pedals) with the preview applied: replaces the item with the same id or
 * appends it.
 */
export function withPreview<T extends { readonly id: string }>(
  items: readonly T[],
  preview: T | null,
): readonly T[] {
  if (preview === null) return items;
  let replaced = false;
  const next = items.map((item) => {
    if (item.id !== preview.id) return item;
    replaced = true;
    return preview;
  });
  return replaced ? next : [...items, preview];
}
