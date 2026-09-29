import { DEFAULT_PIXELS_PER_SECOND } from '../utils/pianoRollGeometry.ts';
import type { GridDivision } from '../utils/quantize.ts';
import type { Note, PedalEvent } from './types.ts';

/** UI state of the editor; not part of the project document. */
export interface EditorState {
  readonly gridDivision: GridDivision;
  readonly snapEnabled: boolean;
  readonly pixelsPerSecond: number;
  readonly selectedNoteIds: readonly string[];
  /** Selected pedals; note and pedal selections exclude each other. */
  readonly selectedPedalIds: readonly string[];
  /** Scroll the piano roll so that the playhead stays in view during playback. */
  readonly followPlayhead: boolean;
}

export const DEFAULT_EDITOR_STATE: EditorState = {
  gridDivision: '1/16',
  snapEnabled: true,
  pixelsPerSecond: DEFAULT_PIXELS_PER_SECOND,
  selectedNoteIds: [],
  selectedPedalIds: [],
  followPlayhead: true,
};

export type EditorAction =
  | { readonly type: 'editor/setGridDivision'; readonly gridDivision: GridDivision }
  | { readonly type: 'editor/setSnap'; readonly snapEnabled: boolean }
  | { readonly type: 'editor/setZoom'; readonly pixelsPerSecond: number }
  | { readonly type: 'editor/selectNotes'; readonly ids: readonly string[] }
  | { readonly type: 'editor/selectPedals'; readonly ids: readonly string[] }
  | { readonly type: 'editor/clearSelection' }
  | {
      readonly type: 'editor/retainSelection';
      readonly noteIds: readonly string[];
      readonly pedalIds: readonly string[];
    }
  | { readonly type: 'editor/setFollowPlayhead'; readonly followPlayhead: boolean };

export function setGridDivision(gridDivision: GridDivision): EditorAction {
  return { type: 'editor/setGridDivision', gridDivision };
}

export function setSnap(snapEnabled: boolean): EditorAction {
  return { type: 'editor/setSnap', snapEnabled };
}

export function setZoom(pixelsPerSecond: number): EditorAction {
  return { type: 'editor/setZoom', pixelsPerSecond };
}

/** Replaces the note selection and clears the pedal selection. */
export function selectNotes(ids: readonly string[]): EditorAction {
  return { type: 'editor/selectNotes', ids };
}

/** Replaces the pedal selection and clears the note selection. */
export function selectPedals(ids: readonly string[]): EditorAction {
  return { type: 'editor/selectPedals', ids };
}

/** Clears both the note and the pedal selection. */
export function clearSelection(): EditorAction {
  return { type: 'editor/clearSelection' };
}

/** Keeps in the selection only the ids that are present in the given lists (existing items). */
export function retainSelection(
  noteIds: readonly string[],
  pedalIds: readonly string[],
): EditorAction {
  return { type: 'editor/retainSelection', noteIds, pedalIds };
}

export function setFollowPlayhead(followPlayhead: boolean): EditorAction {
  return { type: 'editor/setFollowPlayhead', followPlayhead };
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

/** Selected pedals in project order; unknown ids are ignored. */
export function selectedPedals(
  pedals: readonly PedalEvent[],
  selectedIds: readonly string[],
): readonly PedalEvent[] {
  if (selectedIds.length === 0) return [];
  const ids = new Set(selectedIds);
  return pedals.filter((pedal) => ids.has(pedal.id));
}
