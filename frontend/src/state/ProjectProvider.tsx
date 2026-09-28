import { useReducer, type ReactNode } from 'react';
import { createEmptyProject } from './constants.ts';
import { ProjectDispatchContext, ProjectStateContext } from './projectContext.ts';
import { projectReducer } from './projectReducer.ts';
import type { Project } from './types.ts';

interface ProjectProviderProps {
  children: ReactNode;
  initialProject?: Project;
}

export default function ProjectProvider({ children, initialProject }: ProjectProviderProps) {
  const [project, dispatch] = useReducer(
    projectReducer,
    initialProject,
    (initial) => initial ?? createEmptyProject(),
  );
  return (
    <ProjectStateContext.Provider value={project}>
      <ProjectDispatchContext.Provider value={dispatch}>{children}</ProjectDispatchContext.Provider>
    </ProjectStateContext.Provider>
  );
}
