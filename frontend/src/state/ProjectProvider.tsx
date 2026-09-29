import { useMemo, useReducer, type ReactNode } from 'react';
import { createEmptyProject } from './constants.ts';
import { createHistory, historyReducer, redo, undo } from './history.ts';
import {
  HistoryApiContext,
  HistoryStateContext,
  type HistoryApi,
  type HistoryState,
} from './historyContext.ts';
import { ProjectDispatchContext, ProjectStateContext } from './projectContext.ts';
import type { Project } from './types.ts';

interface ProjectProviderProps {
  children: ReactNode;
  initialProject?: Project;
}

export default function ProjectProvider({ children, initialProject }: ProjectProviderProps) {
  const [history, dispatch] = useReducer(historyReducer, initialProject, (initial) =>
    createHistory(initial ?? createEmptyProject()),
  );
  const canUndo = history.past.length > 0;
  const canRedo = history.future.length > 0;
  const historyState = useMemo<HistoryState>(() => ({ canUndo, canRedo }), [canUndo, canRedo]);
  const historyApi = useMemo<HistoryApi>(
    () => ({
      undo: () => dispatch(undo()),
      redo: () => dispatch(redo()),
    }),
    [dispatch],
  );
  return (
    <ProjectStateContext.Provider value={history.present}>
      <ProjectDispatchContext.Provider value={dispatch}>
        <HistoryStateContext.Provider value={historyState}>
          <HistoryApiContext.Provider value={historyApi}>{children}</HistoryApiContext.Provider>
        </HistoryStateContext.Provider>
      </ProjectDispatchContext.Provider>
    </ProjectStateContext.Provider>
  );
}
