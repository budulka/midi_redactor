import { fireEvent, render, screen } from '@testing-library/react';
import StateProbe from '../components/PianoRoll/StateProbe.tsx';
import { readEditor } from '../components/PianoRoll/testUtils.tsx';
import { removeNotes } from './actions.ts';
import EditorProvider from './EditorProvider.tsx';
import type { EditorState } from './editorState.ts';
import ProjectProvider from './ProjectProvider.tsx';
import { useProjectDispatch } from './projectContext.ts';
import SelectionSync from './SelectionSync.tsx';
import type { Project } from './types.ts';

const project: Project = {
  bpm: 120,
  timeSignature: { numerator: 4, denominator: 4 },
  notes: [
    { id: 'a', pitch: 60, start: 0, duration: 0.5, velocity: 100 },
    { id: 'b', pitch: 64, start: 1, duration: 0.5, velocity: 100 },
  ],
  pedals: [{ id: 'p', type: 'sustain', start: 0, end: 1 }],
};

function RemoveA() {
  const dispatch = useProjectDispatch();
  return (
    <button type="button" onClick={() => dispatch(removeNotes(['a']))}>
      remove a
    </button>
  );
}

function renderSync(editor: Partial<EditorState>) {
  return render(
    <ProjectProvider initialProject={project}>
      <EditorProvider initialState={editor}>
        <SelectionSync />
        <RemoveA />
        <StateProbe />
      </EditorProvider>
    </ProjectProvider>,
  );
}

describe('SelectionSync', () => {
  it('drops ids of missing notes from the selection', () => {
    renderSync({ selectedNoteIds: ['a', 'x'] });
    expect(readEditor(screen).selectedNoteIds).toEqual(['a']);
  });

  it('drops the id of a removed note', () => {
    renderSync({ selectedNoteIds: ['a', 'x'] });
    fireEvent.click(screen.getByRole('button', { name: 'remove a' }));
    expect(readEditor(screen).selectedNoteIds).toEqual([]);
  });

  it('drops ids of missing pedals from the selection', () => {
    renderSync({ selectedPedalIds: ['p', 'gone'] });
    expect(readEditor(screen).selectedPedalIds).toEqual(['p']);
  });
});
