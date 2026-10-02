import type { Note } from '../state/types.ts';
import { noteRect, type Point, type Rect, type ViewGeometry } from './pianoRollGeometry.ts';

/** How the Info window names the modifiers of isAdditive. */
export const ADDITIVE_MODIFIERS_LABEL = 'Shift/Ctrl/⌘';

/** Shift, Ctrl or ⌘ held: the click adds to / removes from the selection. */
export function isAdditive(event: {
  shiftKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
}): boolean {
  return event.shiftKey || event.ctrlKey || event.metaKey;
}

/** Removes the id when present, appends it otherwise. */
export function toggleId(ids: readonly string[], id: string): readonly string[] {
  return ids.includes(id) ? ids.filter((other) => other !== id) : [...ids, id];
}

/** `base` followed by the ids of `added` that are not in `base`. */
export function unionIds(base: readonly string[], added: readonly string[]): readonly string[] {
  const present = new Set(base);
  return [...base, ...added.filter((id) => !present.has(id))];
}

/** Normalized rectangle between two points (any corner order). */
export function rectFromPoints(a: Point, b: Point): Rect {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(a.x - b.x),
    height: Math.abs(a.y - b.y),
  };
}

/**
 * Ids (in project order) of the notes whose rectangle intersects `rect` with non-zero area;
 * touching is not intersecting.
 */
export function notesInRect(
  notes: readonly Note[],
  rect: Rect,
  g: ViewGeometry,
): readonly string[] {
  if (rect.width <= 0 || rect.height <= 0) return [];
  return notes
    .filter((note) => {
      const n = noteRect(note, g);
      return (
        rect.x < n.x + n.width &&
        n.x < rect.x + rect.width &&
        rect.y < n.y + n.height &&
        n.y < rect.y + rect.height
      );
    })
    .map((note) => note.id);
}
