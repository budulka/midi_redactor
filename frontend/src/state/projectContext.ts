import { createContext, useContext, type Dispatch } from 'react';
import type { ProjectAction } from './actions.ts';
import type { Project } from './types.ts';

export const ProjectStateContext = createContext<Project | null>(null);
export const ProjectDispatchContext = createContext<Dispatch<ProjectAction> | null>(null);

export function useProject(): Project {
  const project = useContext(ProjectStateContext);
  if (project === null) {
    throw new Error('useProject must be used within ProjectProvider');
  }
  return project;
}

export function useProjectDispatch(): Dispatch<ProjectAction> {
  const dispatch = useContext(ProjectDispatchContext);
  if (dispatch === null) {
    throw new Error('useProjectDispatch must be used within ProjectProvider');
  }
  return dispatch;
}
