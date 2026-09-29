import { MAX_PITCH, MIN_PITCH } from '../state/constants.ts';
import type { Note } from '../state/types.ts';
import { applyDrag, minDragDuration, type DragOptions } from './noteEditing.ts';

export interface GroupDragState {
  readonly kind: 'move' | 'resize';
  /** The note under the mouse; the grid snaps this note. */
  readonly anchor: Note;
  /** All notes that change (the anchor included), as they were when the gesture started. */
  readonly originals: readonly Note[];
  readonly originTime: number;
  readonly originPitch: number;
}

/** Offset clamped so that no note starts before 0 s or leaves the 21–108 pitch range. */
export function clampGroupOffset(
  notes: readonly Note[],
  dt: number,
  dp: number,
): { dt: number; dp: number } {
  if (notes.length === 0) return { dt, dp };
  const minStart = Math.min(...notes.map((note) => note.start));
  const pitches = notes.map((note) => note.pitch);
  const minPitch = Math.min(...pitches);
  const maxPitch = Math.max(...pitches);
  return {
    dt: Math.max(dt, -minStart),
    dp: Math.min(Math.max(dp, MIN_PITCH - minPitch), MAX_PITCH - maxPitch),
  };
}

function shift(note: Note, dt: number, dp: number): Note {
  return dt === 0 && dp === 0 ? note : { ...note, start: note.start + dt, pitch: note.pitch + dp };
}

/** Notes shifted by a clamped offset (new objects, same ids). */
export function translateNotes(notes: readonly Note[], dt: number, dp: number): readonly Note[] {
  const offset = clampGroupOffset(notes, dt, dp);
  return notes.map((note) => ({
    ...note,
    start: note.start + offset.dt,
    pitch: note.pitch + offset.dp,
  }));
}

/**
 * Preview of all dragged notes for the current mouse time and pitch. The anchor is moved or
 * resized exactly as `applyDrag` does for one note; the other notes follow by the same offset.
 * When the group hits an edge, the whole group (the anchor included) stops there.
 */
export function applyGroupDrag(
  drag: GroupDragState,
  time: number,
  pitch: number,
  opts: DragOptions,
): readonly Note[] {
  const { anchor, originals } = drag;
  const single = applyDrag(
    {
      kind: drag.kind,
      original: anchor,
      originTime: drag.originTime,
      originPitch: drag.originPitch,
    },
    time,
    pitch,
    opts,
  );

  if (drag.kind === 'resize') {
    const delta = single.duration - anchor.duration;
    const minDuration = minDragDuration(opts);
    return originals.map((note) =>
      note.id === anchor.id
        ? single
        : { ...note, duration: Math.max(minDuration, note.duration + delta) },
    );
  }

  const dt = single.start - anchor.start;
  const dp = pitch - drag.originPitch;
  const clamped = clampGroupOffset(originals, dt, dp);
  const anchorMoved =
    clamped.dt === dt && anchor.pitch + clamped.dp === single.pitch
      ? single
      : shift(anchor, clamped.dt, clamped.dp);
  return originals.map((note) =>
    note.id === anchor.id ? anchorMoved : shift(note, clamped.dt, clamped.dp),
  );
}

/** Replaces items with the same id and appends new ones; returns `items` when `previews` is empty. */
export function withPreviews<T extends { readonly id: string }>(
  items: readonly T[],
  previews: readonly T[],
): readonly T[] {
  if (previews.length === 0) return items;
  const byId = new Map(previews.map((item) => [item.id, item]));
  const next = items.map((item) => {
    const preview = byId.get(item.id);
    if (preview === undefined) return item;
    byId.delete(item.id);
    return preview;
  });
  return [...next, ...byId.values()];
}
