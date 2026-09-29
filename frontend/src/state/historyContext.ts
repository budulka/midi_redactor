import { createContext, useContext } from 'react';

export interface HistoryState {
  readonly canUndo: boolean;
  readonly canRedo: boolean;
}

/** Undo/redo commands; the object is stable for the lifetime of the provider. */
export interface HistoryApi {
  undo(): void;
  redo(): void;
}

export const HistoryStateContext = createContext<HistoryState | null>(null);
export const HistoryApiContext = createContext<HistoryApi | null>(null);

export function useHistoryState(): HistoryState {
  const state = useContext(HistoryStateContext);
  if (state === null) {
    throw new Error('useHistoryState must be used within ProjectProvider');
  }
  return state;
}

export function useHistoryApi(): HistoryApi {
  const api = useContext(HistoryApiContext);
  if (api === null) {
    throw new Error('useHistoryApi must be used within ProjectProvider');
  }
  return api;
}
