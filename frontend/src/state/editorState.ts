import { DEFAULT_PIXELS_PER_SECOND } from '../utils/pianoRollGeometry.ts';
import type { GridDivision } from '../utils/quantize.ts';
import type { Note } from './types.ts';

/** UI state of the editor; not part of the project document. */
export interface EditorState {
  readonly gridDivision: GridDivision;
  readonly snapEnabled: boolean;
  readonly pixelsPerSecond: number;
  readonly selectedNoteIds: readonly string[];
}

export const DEFAULT_EDITOR_STATE: EditorState = {
  gridDivision: '1/16',
  snapEnabled: true,
  pixelsPerSecond: DEFAULT_PIXELS_PER_SECOND,
  selectedNoteIds: [],
};

export type EditorAction =
  | { readonly type: 'editor/setGridDivision'; readonly gridDivision: GridDivision }
  | { readonly type: 'editor/setSnap'; readonly snapEnabled: boolean }
  | { readonly type: 'editor/setZoom'; readonly pixelsPerSecond: number }
  | { readonly type: 'editor/selectNotes'; readonly ids: readonly string[] }
  | { readonly type: 'editor/clearSelection' };

export function setGridDivision(gridDivision: GridDivision): EditorAction {
  return { type: 'editor/setGridDivision', gridDivision };
}

export function setSnap(snapEnabled: boolean): EditorAction {
  return { type: 'editor/setSnap', snapEnabled };
}

export function setZoom(pixelsPerSecond: number): EditorAction {
  return { type: 'editor/setZoom', pixelsPerSecond };
}

/** Replaces the selection. */
export function selectNotes(ids: readonly string[]): EditorAction {
  return { type: 'editor/selectNotes', ids };
}

export function clearSelection(): EditorAction {
  return { type: 'editor/clearSelection' };
}

/** Selected notes in project order; unknown ids are ignored. */
export function selectedNotes(
  notes: readonly Note[],
  selectedIds: readonly string[],
): readonly Note[] {
  if (selectedIds.length === 0) return [];
  const ids = new Set(selectedIds);
  return notes.filter((note) => ids.has(note.id));
}
