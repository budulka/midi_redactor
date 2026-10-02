import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { FakePianoEngine } from '../../audio/testing/FakePianoEngine.ts';
import EditorProvider from '../../state/EditorProvider.tsx';
import type { EditorState } from '../../state/editorState.ts';
import ProjectProvider from '../../state/ProjectProvider.tsx';
import TransportProvider from '../../state/TransportProvider.tsx';
import StateProbe from './StateProbe.tsx';
import type { Note, PedalEvent, Project } from '../../state/types.ts';

export function renderWithProviders(
  ui: ReactNode,
  notes: readonly Note[] = [],
  editor?: Partial<EditorState>,
  pedals: readonly PedalEvent[] = [],
  options: { engine?: FakePianoEngine } = {},
) {
  const loadEngine = () => Promise.resolve(options.engine ?? new FakePianoEngine());
  const project: Project = {
    bpm: 120,
    timeSignature: { numerator: 4, denominator: 4 },
    mediaOffset: 0,
    mediaCuts: [],
    notes,
    pedals,
  };
  return render(
    <ProjectProvider initialProject={project}>
      <EditorProvider initialState={editor}>
        <TransportProvider loadEngine={loadEngine}>
          {ui}
          <StateProbe />
        </TransportProvider>
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

export function readPedals(container: { getByTestId: (id: string) => HTMLElement }): PedalEvent[] {
  return JSON.parse(container.getByTestId('pedals').textContent ?? '[]') as PedalEvent[];
}
