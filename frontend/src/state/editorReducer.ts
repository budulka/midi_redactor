import { clampZoom } from '../utils/pianoRollGeometry.ts';
import type { EditorAction, EditorState } from './editorState.ts';

function sameIds(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

function retainIds(ids: readonly string[], allowed: readonly string[]): readonly string[] {
  if (ids.length === 0) return ids;
  const allowedIds = new Set(allowed);
  const kept = ids.filter((id) => allowedIds.has(id));
  return kept.length === ids.length ? ids : kept;
}

function assertNever(action: never): never {
  throw new Error(`Unknown editor action: ${JSON.stringify(action)}`);
}

/** Pure reducer for the editor UI state. An action that changes nothing returns the same state. */
export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case 'editor/setGridDivision':
      return action.gridDivision === state.gridDivision
        ? state
        : { ...state, gridDivision: action.gridDivision };
    case 'editor/setSnap':
      return action.snapEnabled === state.snapEnabled
        ? state
        : { ...state, snapEnabled: action.snapEnabled };
    case 'editor/setZoom': {
      if (!Number.isFinite(action.pixelsPerSecond)) return state;
      const pixelsPerSecond = clampZoom(action.pixelsPerSecond);
      return pixelsPerSecond === state.pixelsPerSecond ? state : { ...state, pixelsPerSecond };
    }
    case 'editor/selectNotes':
      return sameIds(action.ids, state.selectedNoteIds) && state.selectedPedalIds.length === 0
        ? state
        : { ...state, selectedNoteIds: [...action.ids], selectedPedalIds: [] };
    case 'editor/selectPedals':
      return sameIds(action.ids, state.selectedPedalIds) && state.selectedNoteIds.length === 0
        ? state
        : { ...state, selectedNoteIds: [], selectedPedalIds: [...action.ids] };
    case 'editor/clearSelection':
      return state.selectedNoteIds.length === 0 && state.selectedPedalIds.length === 0
        ? state
        : { ...state, selectedNoteIds: [], selectedPedalIds: [] };
    case 'editor/retainSelection': {
      const selectedNoteIds = retainIds(state.selectedNoteIds, action.noteIds);
      const selectedPedalIds = retainIds(state.selectedPedalIds, action.pedalIds);
      return selectedNoteIds === state.selectedNoteIds &&
        selectedPedalIds === state.selectedPedalIds
        ? state
        : { ...state, selectedNoteIds, selectedPedalIds };
    }
    case 'editor/setFollowPlayhead':
      return action.followPlayhead === state.followPlayhead
        ? state
        : { ...state, followPlayhead: action.followPlayhead };
    default:
      return assertNever(action);
  }
}
