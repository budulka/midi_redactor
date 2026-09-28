import { fireEvent, render, screen } from '@testing-library/react';
import EditorProvider from '../../state/EditorProvider.tsx';
import type { EditorState } from '../../state/editorState.ts';
import ProjectProvider from '../../state/ProjectProvider.tsx';
import { useProject } from '../../state/projectContext.ts';
import type { Note, Project } from '../../state/types.ts';
import * as idModule from '../../utils/id.ts';
import NoteGrid from './NoteGrid.tsx';

const noteA: Note = { id: 'a', pitch: 60, start: 0.5, duration: 0.5, velocity: 100 };
const C4_Y = 679;

let projectRef: Project | null = null;

function ProjectProbe() {
  const project = useProject();
  projectRef = project;
  return <pre data-testid="notes">{JSON.stringify(project.notes)}</pre>;
}

function renderGrid(notes: Note[] = [], editor?: Partial<EditorState>) {
  const project: Project = {
    bpm: 120,
    timeSignature: { numerator: 4, denominator: 4 },
    notes,
    pedals: [],
  };
  render(
    <ProjectProvider initialProject={project}>
      <EditorProvider initialState={editor}>
        <NoteGrid />
        <ProjectProbe />
      </EditorProvider>
    </ProjectProvider>,
  );
  return screen.getByRole('application', { name: 'Note grid' });
}

function storedNotes(): Note[] {
  return JSON.parse(screen.getByTestId('notes').textContent ?? '[]') as Note[];
}

function noteElement(id: string): HTMLElement {
  const element = screen.getAllByTestId('note').find((el) => el.dataset.noteId === id);
  if (element === undefined) throw new Error(`note ${id} is not rendered`);
  return element;
}

function drag(grid: HTMLElement, from: [number, number], ...moves: [number, number][]) {
  fireEvent.mouseDown(grid, { clientX: from[0], clientY: from[1] });
  for (const [x, y] of moves) fireEvent.mouseMove(window, { clientX: x, clientY: y });
  const [endX, endY] = moves.length > 0 ? moves[moves.length - 1] : from;
  fireEvent.mouseUp(window, { clientX: endX, clientY: endY });
}

describe('NoteGrid', () => {
  beforeEach(() => {
    vi.spyOn(idModule, 'createId').mockReturnValue('new-1');
    projectRef = null;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('creates a note of one grid step on click', () => {
    const grid = renderGrid();
    drag(grid, [30, C4_Y]);
    expect(storedNotes()).toEqual([
      { id: 'new-1', pitch: 60, start: 0.25, duration: 0.125, velocity: 100 },
    ]);
    expect(noteElement('new-1')).toHaveAttribute('data-selected', 'true');
    expect(noteElement('new-1')).toHaveAccessibleName('C4, velocity 100');
  });

  it('creates a longer note by dragging, with one action per gesture', () => {
    const grid = renderGrid();
    fireEvent.mouseDown(grid, { clientX: 30, clientY: C4_Y });
    fireEvent.mouseMove(window, { clientX: 80, clientY: C4_Y });
    expect(noteElement('new-1')).toHaveStyle({ width: '62.5px' });
    expect(storedNotes()).toHaveLength(0);
    fireEvent.mouseUp(window, { clientX: 80, clientY: C4_Y });
    expect(storedNotes()).toHaveLength(1);
    expect(storedNotes()[0].duration).toBe(0.625);
  });

  it('places the note under the cursor when snapping is off', () => {
    const grid = renderGrid([], { snapEnabled: false });
    drag(grid, [30, C4_Y]);
    expect(storedNotes()[0]).toMatchObject({ start: 0.3, duration: 0.125 });
  });

  it('keeps the default length for a click with a tiny move', () => {
    const grid = renderGrid();
    drag(grid, [30, C4_Y], [31, C4_Y]);
    expect(storedNotes()[0]).toMatchObject({ start: 0.25, duration: 0.125 });
  });

  it('moves a note in time and pitch', () => {
    const grid = renderGrid([noteA]);
    drag(grid, [60, C4_Y], [82, 651]);
    expect(storedNotes()).toEqual([{ ...noteA, start: 0.75, pitch: 62 }]);
  });

  it('clamps moves at the edges', () => {
    const grid = renderGrid([noteA]);
    drag(grid, [60, C4_Y], [60, -100]);
    expect(storedNotes()[0].pitch).toBe(108);
    drag(grid, [60, 7], [-500, 7]);
    expect(storedNotes()[0]).toMatchObject({ start: 0, pitch: 108 });
  });

  it('clamps a move before zero', () => {
    const grid = renderGrid([noteA]);
    drag(grid, [60, C4_Y], [-500, C4_Y]);
    expect(storedNotes()[0]).toMatchObject({ start: 0, pitch: 60, duration: 0.5 });
  });

  it('resizes a note by its right edge', () => {
    const grid = renderGrid([noteA]);
    drag(grid, [97, C4_Y], [130, C4_Y]);
    expect(storedNotes()).toEqual([{ ...noteA, duration: 0.875 }]);
  });

  it('selects a note on click without changing the project', () => {
    const grid = renderGrid([noteA]);
    const before = projectRef;
    drag(grid, [60, C4_Y]);
    expect(noteElement('a')).toHaveAttribute('data-selected', 'true');
    expect(projectRef).toBe(before);
  });

  it('ignores moves below the drag threshold', () => {
    const grid = renderGrid([noteA]);
    const before = projectRef;
    drag(grid, [60, C4_Y], [62, C4_Y]);
    expect(storedNotes()).toEqual([noteA]);
    expect(projectRef).toBe(before);
  });

  it('cancels a gesture on Escape', () => {
    const grid = renderGrid();
    fireEvent.mouseDown(grid, { clientX: 30, clientY: C4_Y });
    fireEvent.mouseMove(window, { clientX: 80, clientY: C4_Y });
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryAllByTestId('note')).toHaveLength(0);
    fireEvent.mouseUp(window, { clientX: 80, clientY: C4_Y });
    expect(storedNotes()).toHaveLength(0);
  });

  it('cancels a move on Escape', () => {
    const grid = renderGrid([noteA]);
    fireEvent.mouseDown(grid, { clientX: 60, clientY: C4_Y });
    fireEvent.mouseMove(window, { clientX: 120, clientY: C4_Y });
    fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.mouseUp(window, { clientX: 120, clientY: C4_Y });
    expect(storedNotes()).toEqual([noteA]);
  });

  it('deletes a note on right click only over a note', () => {
    const grid = renderGrid([noteA]);
    fireEvent.contextMenu(grid, { clientX: 300, clientY: C4_Y });
    expect(storedNotes()).toHaveLength(1);
    fireEvent.contextMenu(grid, { clientX: 60, clientY: C4_Y });
    expect(storedNotes()).toHaveLength(0);
  });

  it('deletes the selected note with Delete and Backspace', () => {
    const b: Note = { ...noteA, id: 'b', pitch: 62 };
    const grid = renderGrid([noteA, b]);
    const before = projectRef;
    fireEvent.keyDown(grid, { key: 'Delete' });
    expect(projectRef).toBe(before);

    drag(grid, [60, C4_Y]);
    fireEvent.keyDown(grid, { key: 'Delete' });
    expect(storedNotes().map((n) => n.id)).toEqual(['b']);
    expect(screen.getAllByTestId('note').filter((el) => el.dataset.selected === 'true')).toEqual(
      [],
    );

    drag(grid, [60, 651]);
    fireEvent.keyDown(grid, { key: 'Backspace' });
    expect(storedNotes()).toHaveLength(0);
  });

  it('is focusable and takes focus on mouse down', () => {
    const grid = renderGrid();
    expect(grid).toHaveAttribute('tabindex', '0');
    drag(grid, [30, C4_Y]);
    expect(grid).toHaveFocus();
  });

  it('marks focus from the mouse so the focus ring stays hidden', () => {
    const grid = renderGrid();
    fireEvent.mouseDown(grid, { clientX: 30, clientY: C4_Y });
    fireEvent.mouseUp(window, { clientX: 30, clientY: C4_Y });
    expect(grid).toHaveAttribute('data-pointer-focus', 'true');
    grid.blur();
    expect(grid).not.toHaveAttribute('data-pointer-focus');
  });

  it('does not start a gesture with other mouse buttons', () => {
    const grid = renderGrid();
    fireEvent.mouseDown(grid, { clientX: 30, clientY: C4_Y, button: 2 });
    fireEvent.mouseUp(window, { clientX: 30, clientY: C4_Y, button: 2 });
    expect(storedNotes()).toHaveLength(0);
  });

  it('shows louder notes brighter', () => {
    renderGrid([
      { ...noteA, id: 'soft', velocity: 1 },
      { ...noteA, id: 'loud', pitch: 64, velocity: 127 },
    ]);
    const soft = Number(noteElement('soft').style.opacity);
    const loud = Number(noteElement('loud').style.opacity);
    expect(loud).toBeGreaterThan(soft);
  });

  it('widens the grid while a note is dragged past the end', () => {
    const grid = renderGrid();
    expect(grid).toHaveStyle({ width: '6000px' });
    fireEvent.mouseDown(grid, { clientX: 5900, clientY: C4_Y });
    fireEvent.mouseMove(window, { clientX: 6500, clientY: C4_Y });
    expect(grid).toHaveStyle({ width: '7000px' });
    fireEvent.mouseUp(window, { clientX: 6500, clientY: C4_Y });
  });

  it('removes window listeners on unmount during a gesture', () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener');
    const project: Project = {
      bpm: 120,
      timeSignature: { numerator: 4, denominator: 4 },
      notes: [],
      pedals: [],
    };
    const view = render(
      <ProjectProvider initialProject={project}>
        <EditorProvider>
          <NoteGrid />
        </EditorProvider>
      </ProjectProvider>,
    );
    fireEvent.mouseDown(screen.getByRole('application', { name: 'Note grid' }), {
      clientX: 30,
      clientY: C4_Y,
    });
    view.unmount();
    expect(removeSpy).toHaveBeenCalledWith('mousemove', expect.any(Function));
    expect(removeSpy).toHaveBeenCalledWith('mouseup', expect.any(Function));
    expect(removeSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
  });
});
