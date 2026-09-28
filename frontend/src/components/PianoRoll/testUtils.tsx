import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import EditorProvider from '../../state/EditorProvider.tsx';
import type { EditorState } from '../../state/editorState.ts';
import ProjectProvider from '../../state/ProjectProvider.tsx';
import StateProbe from './StateProbe.tsx';
import type { Note, Project } from '../../state/types.ts';

export function renderWithProviders(
  ui: ReactNode,
  notes: readonly Note[] = [],
  editor?: Partial<EditorState>,
) {
  const project: Project = {
    bpm: 120,
    timeSignature: { numerator: 4, denominator: 4 },
    notes,
    pedals: [],
  };
  return render(
    <ProjectProvider initialProject={project}>
      <EditorProvider initialState={editor}>
        {ui}
        <StateProbe />
      </EditorProvider>
    </ProjectProvider>,
  );
}

export function readNotes(container: { getByTestId: (id: string) => HTMLElement }): Note[] {
  return JSON.parse(container.getByTestId('notes').textContent ?? '[]') as Note[];
}

export function readEditor(container: { getByTestId: (id: string) => HTMLElement }): EditorState {
  return JSON.parse(container.getByTestId('editor').textContent ?? '{}') as EditorState;
}
