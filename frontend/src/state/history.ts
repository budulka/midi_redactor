import type { ProjectAction } from './actions.ts';
import { projectReducer } from './projectReducer.ts';
import type { Project } from './types.ts';

/** Maximum number of undo steps kept in the history. */
export const HISTORY_LIMIT = 200;

export interface History {
  /** Earlier project states, oldest first. */
  readonly past: readonly Project[];
  readonly present: Project;
  /** Undone project states, the next redo first. */
  readonly future: readonly Project[];
}

export type HistoryAction = { readonly type: 'history/undo' } | { readonly type: 'history/redo' };

export function createHistory(project: Project): History {
  return { past: [], present: project, future: [] };
}

export function undo(): HistoryAction {
  return { type: 'history/undo' };
}

export function redo(): HistoryAction {
  return { type: 'history/redo' };
}

/**
 * Undo/redo wrapper over `projectReducer`. An action that changes nothing (including undo or
 * redo with an empty stack) returns the same history object, so no empty step is recorded.
 */
export function historyReducer(state: History, action: ProjectAction | HistoryAction): History {
  switch (action.type) {
    case 'history/undo': {
      const previous = state.past.at(-1);
      if (previous === undefined) return state;
      return {
        past: state.past.slice(0, -1),
        present: previous,
        future: [state.present, ...state.future],
      };
    }
    case 'history/redo': {
      const [next, ...rest] = state.future;
      if (next === undefined) return state;
      return { past: [...state.past, state.present], present: next, future: rest };
    }
    case 'project/load':
      return createHistory(projectReducer(state.present, action));
    default: {
      const next = projectReducer(state.present, action);
      if (next === state.present) return state;
      return {
        past: [...state.past, state.present].slice(-HISTORY_LIMIT),
        present: next,
        future: [],
      };
    }
  }
}
