import { fireEvent, render, screen } from '@testing-library/react';
import { useRef } from 'react';
import * as idModule from '../utils/id.ts';
import { addNote } from './actions.ts';
import { useHistoryApi, useHistoryState, type HistoryApi } from './historyContext.ts';
import ProjectProvider from './ProjectProvider.tsx';
import { useProject, useProjectDispatch } from './projectContext.ts';

const apis: HistoryApi[] = [];

function HistoryConsumer() {
  const project = useProject();
  const dispatch = useProjectDispatch();
  const { canUndo, canRedo } = useHistoryState();
  const api = useHistoryApi();
  const first = useRef(api);
  apis.push(api);
  return (
    <div>
      <span data-testid="count">{project.notes.length}</span>
      <span data-testid="can-undo">{String(canUndo)}</span>
      <span data-testid="can-redo">{String(canRedo)}</span>
      <span data-testid="same-api">{String(first.current === api)}</span>
      <button
        type="button"
        onClick={() => dispatch(addNote({ pitch: 60, start: 0, duration: 1, velocity: 100 }))}
      >
        add
      </button>
      <button type="button" onClick={api.undo}>
        undo
      </button>
      <button type="button" onClick={api.redo}>
        redo
      </button>
    </div>
  );
}

function text(testId: string): string | null {
  return screen.getByTestId(testId).textContent;
}

describe('history context', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    apis.length = 0;
  });

  it('undoes and redoes project changes', () => {
    vi.spyOn(idModule, 'createId').mockReturnValue('n1');
    render(
      <ProjectProvider>
        <HistoryConsumer />
      </ProjectProvider>,
    );
    expect(text('count')).toBe('0');
    expect(text('can-undo')).toBe('false');
    expect(text('can-redo')).toBe('false');

    fireEvent.click(screen.getByRole('button', { name: 'add' }));
    expect(text('count')).toBe('1');
    expect(text('can-undo')).toBe('true');

    fireEvent.click(screen.getByRole('button', { name: 'undo' }));
    expect(text('count')).toBe('0');
    expect(text('can-redo')).toBe('true');

    fireEvent.click(screen.getByRole('button', { name: 'redo' }));
    expect(text('count')).toBe('1');
    expect(text('can-redo')).toBe('false');
  });

  it('keeps the history api object stable between renders', () => {
    vi.spyOn(idModule, 'createId').mockReturnValue('n1');
    render(
      <ProjectProvider>
        <HistoryConsumer />
      </ProjectProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'add' }));
    fireEvent.click(screen.getByRole('button', { name: 'undo' }));
    expect(text('same-api')).toBe('true');
    expect(apis.length).toBeGreaterThan(1);
    expect(apis.every((api) => api === apis[0])).toBe(true);
  });

  it('throws outside ProjectProvider', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    function StateOnly() {
      useHistoryState();
      return null;
    }
    function ApiOnly() {
      useHistoryApi();
      return null;
    }
    expect(() => render(<StateOnly />)).toThrow(
      'useHistoryState must be used within ProjectProvider',
    );
    expect(() => render(<ApiOnly />)).toThrow('useHistoryApi must be used within ProjectProvider');
  });
});
