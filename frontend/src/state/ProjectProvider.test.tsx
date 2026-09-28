import { fireEvent, render, screen } from '@testing-library/react';
import * as idModule from '../utils/id.ts';
import { addNote } from './actions.ts';
import { createEmptyProject } from './constants.ts';
import ProjectProvider from './ProjectProvider.tsx';
import { useProject, useProjectDispatch } from './projectContext.ts';
import type { Project } from './types.ts';

function NoteCounter() {
  const project = useProject();
  const dispatch = useProjectDispatch();
  return (
    <div>
      <span data-testid="count">{project.notes.length}</span>
      <button
        type="button"
        onClick={() => dispatch(addNote({ pitch: 60, start: 0, duration: 1, velocity: 100 }))}
      >
        add
      </button>
    </div>
  );
}

describe('ProjectProvider', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('provides the project state and dispatch', () => {
    vi.spyOn(idModule, 'createId').mockReturnValue('clicked-note');
    const initialProject: Project = {
      ...createEmptyProject(),
      notes: [{ id: 'n1', pitch: 62, start: 0, duration: 1, velocity: 80 }],
    };
    render(
      <ProjectProvider initialProject={initialProject}>
        <NoteCounter />
      </ProjectProvider>,
    );

    expect(screen.getByTestId('count')).toHaveTextContent('1');
    fireEvent.click(screen.getByRole('button', { name: 'add' }));
    expect(screen.getByTestId('count')).toHaveTextContent('2');
  });

  it('starts with an empty project by default', () => {
    render(
      <ProjectProvider>
        <NoteCounter />
      </ProjectProvider>,
    );
    expect(screen.getByTestId('count')).toHaveTextContent('0');
  });

  it('throws when hooks are used outside the provider', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    function StateOnly() {
      useProject();
      return null;
    }
    function DispatchOnly() {
      useProjectDispatch();
      return null;
    }
    expect(() => render(<StateOnly />)).toThrow('useProject must be used within ProjectProvider');
    expect(() => render(<DispatchOnly />)).toThrow(
      'useProjectDispatch must be used within ProjectProvider',
    );
  });
});
