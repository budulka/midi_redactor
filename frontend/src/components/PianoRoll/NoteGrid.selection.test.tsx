import { fireEvent, render, screen } from '@testing-library/react';
import EditorProvider from '../../state/EditorProvider.tsx';
import type { EditorState } from '../../state/editorState.ts';
import { useHistoryApi, useHistoryState } from '../../state/historyContext.ts';
import ProjectProvider from '../../state/ProjectProvider.tsx';
import { useProject } from '../../state/projectContext.ts';
import type { Note, Project } from '../../state/types.ts';
import * as idModule from '../../utils/id.ts';
import { useGlobalShortcuts } from '../useGlobalShortcuts.ts';
import NoteGrid from './NoteGrid.tsx';
import StateProbe from './StateProbe.tsx';
import { readEditor, readNotes } from './testUtils.tsx';

const a: Note = { id: 'a', pitch: 60, start: 0.5, duration: 0.5, velocity: 100 };
const b: Note = { id: 'b', pitch: 64, start: 1, duration: 0.5, velocity: 100 };
const e: Note = { id: 'e', pitch: 72, start: 3, duration: 0.5, velocity: 100 };
const C4_Y = 679;
const E4_Y = 623;

let projectRef: Project | null = null;

function HistoryProbe() {
  const project = useProject();
  projectRef = project;
  const { canUndo } = useHistoryState();
  const history = useHistoryApi();
  useGlobalShortcuts({ undo: history.undo });
  return (
    <>
      <span data-testid="can-undo">{String(canUndo)}</span>
      <button type="button" onClick={history.undo}>
        undo
      </button>
    </>
  );
}

function renderGrid(notes: Note[], editor?: Partial<EditorState>) {
  const project: Project = {
    bpm: 120,
    timeSignature: { numerator: 4, denominator: 4 },
    mediaOffset: 0,
    mediaCuts: [],
    notes,
    pedals: [],
  };
  render(
    <ProjectProvider initialProject={project}>
      <EditorProvider initialState={editor}>
        <NoteGrid />
        <StateProbe />
        <HistoryProbe />
      </EditorProvider>
    </ProjectProvider>,
  );
  return screen.getByRole('application', { name: 'Note grid' });
}

function noteElement(id: string): HTMLElement {
  const element = screen.getAllByTestId('note').find((el) => el.dataset.noteId === id);
  if (element === undefined) throw new Error(`note ${id} is not rendered`);
  return element;
}

function selectedOnScreen(): string[] {
  return screen
    .getAllByTestId('note')
    .filter((el) => el.dataset.selected === 'true')
    .map((el) => el.dataset.noteId ?? '');
}

type Modifiers = { shiftKey?: boolean; ctrlKey?: boolean; metaKey?: boolean };

function drag(
  grid: HTMLElement,
  from: [number, number],
  to: [number, number] | null,
  modifiers: Modifiers = {},
) {
  fireEvent.mouseDown(grid, { clientX: from[0], clientY: from[1], ...modifiers });
  if (to !== null) fireEvent.mouseMove(window, { clientX: to[0], clientY: to[1] });
  const end = to ?? from;
  fireEvent.mouseUp(window, { clientX: end[0], clientY: end[1] });
}

function byId(id: string): Note | undefined {
  return readNotes(screen).find((note) => note.id === id);
}

function undo() {
  fireEvent.click(screen.getByRole('button', { name: 'undo' }));
}

describe('NoteGrid selection', () => {
  beforeEach(() => {
    vi.spyOn(idModule, 'createId').mockReturnValue('new-1');
    projectRef = null;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('adds and removes notes with Shift, Ctrl and Meta clicks', () => {
    const grid = renderGrid([a, b], { selectedNoteIds: ['a'] });
    const before = projectRef;
    drag(grid, [106, E4_Y], null, { shiftKey: true });
    expect(noteElement('a')).toHaveAttribute('data-selected', 'true');
    expect(noteElement('b')).toHaveAttribute('data-selected', 'true');
    expect(projectRef).toBe(before);

    drag(grid, [60, C4_Y], null, { ctrlKey: true });
    expect(readEditor(screen).selectedNoteIds).toEqual(['b']);

    drag(grid, [106, E4_Y], null, { metaKey: true });
    expect(readEditor(screen).selectedNoteIds).toEqual([]);
    expect(projectRef).toBe(before);
  });

  it('moves all selected notes in one undo step', () => {
    const grid = renderGrid([a, b], { selectedNoteIds: ['a', 'b'] });
    drag(grid, [60, C4_Y], [82, 651]);
    expect(byId('a')).toMatchObject({ start: 0.75, pitch: 62 });
    expect(byId('b')).toMatchObject({ start: 1.25, pitch: 66 });
    undo();
    expect(readNotes(screen)).toEqual([a, b]);
  });

  it('previews the whole group while dragging', () => {
    const grid = renderGrid([a, b], { selectedNoteIds: ['a', 'b'] });
    const before = projectRef;
    fireEvent.mouseDown(grid, { clientX: 60, clientY: C4_Y });
    fireEvent.mouseMove(window, { clientX: 85, clientY: C4_Y });
    expect(noteElement('a')).toHaveStyle({ left: '75px' });
    expect(noteElement('b')).toHaveStyle({ left: '125px' });
    expect(projectRef).toBe(before);
    fireEvent.mouseUp(window, { clientX: 85, clientY: C4_Y });
  });

  it('stops the group at 0 s', () => {
    const c: Note = { ...b, id: 'c', start: 0.25 };
    const grid = renderGrid([a, c], { selectedNoteIds: ['a', 'c'] });
    drag(grid, [60, C4_Y], [-500, C4_Y]);
    expect(byId('a')?.start).toBe(0.25);
    expect(byId('c')?.start).toBe(0);
  });

  it('stops the group at the top of the keyboard', () => {
    const d: Note = { id: 'd', pitch: 100, start: 1, duration: 0.5, velocity: 100 };
    const grid = renderGrid([a, d], { selectedNoteIds: ['a', 'd'] });
    drag(grid, [60, C4_Y], [60, -100]);
    expect(byId('a')?.pitch).toBe(68);
    expect(byId('d')?.pitch).toBe(108);
  });

  it('resizes all selected notes', () => {
    const shortB: Note = { ...b, duration: 0.25 };
    const grid = renderGrid([a, shortB], { selectedNoteIds: ['a', 'b'] });
    drag(grid, [97, C4_Y], [130, C4_Y]);
    expect(byId('a')?.duration).toBe(0.875);
    expect(byId('b')?.duration).toBe(0.625);
  });

  it('keeps only the clicked note selected after a click without a move', () => {
    const grid = renderGrid([a, b], { selectedNoteIds: ['a', 'b'] });
    const before = projectRef;
    drag(grid, [60, C4_Y], null);
    expect(readEditor(screen).selectedNoteIds).toEqual(['a']);
    expect(projectRef).toBe(before);
  });

  it('selects notes with a rectangle', () => {
    const grid = renderGrid([a, b, e]);
    fireEvent.mouseDown(grid, { clientX: 40, clientY: 600, shiftKey: true });
    fireEvent.mouseMove(window, { clientX: 120, clientY: 690 });
    expect(screen.getByTestId('marquee')).toHaveStyle({
      left: '40px',
      top: '600px',
      width: '80px',
      height: '90px',
    });
    expect(selectedOnScreen()).toEqual(['a', 'b']);
    expect(readEditor(screen).selectedNoteIds).toEqual([]);
    fireEvent.mouseUp(window, { clientX: 120, clientY: 690 });
    expect(readEditor(screen).selectedNoteIds).toEqual(['a', 'b']);
    expect(screen.queryByTestId('marquee')).toBeNull();
    expect(readNotes(screen)).toHaveLength(3);
  });

  it('adds the notes in a rectangle to the selection', () => {
    const grid = renderGrid([a, b, e], { selectedNoteIds: ['e'] });
    drag(grid, [40, 670], [70, 690], { ctrlKey: true });
    expect(readEditor(screen).selectedNoteIds).toEqual(['e', 'a']);
  });

  it('does nothing on a Shift click in an empty place', () => {
    const grid = renderGrid([a, b], { selectedNoteIds: ['a'] });
    const before = projectRef;
    drag(grid, [300, C4_Y], null, { shiftKey: true });
    expect(projectRef).toBe(before);
    expect(readEditor(screen).selectedNoteIds).toEqual(['a']);
  });

  it('cancels the rectangle on Escape', () => {
    const grid = renderGrid([a, b, e], { selectedNoteIds: ['e'] });
    fireEvent.mouseDown(grid, { clientX: 40, clientY: 600, shiftKey: true });
    fireEvent.mouseMove(window, { clientX: 120, clientY: 690 });
    fireEvent.keyDown(grid, { key: 'Escape' });
    expect(screen.queryByTestId('marquee')).toBeNull();
    expect(readEditor(screen).selectedNoteIds).toEqual(['e']);
    fireEvent.mouseUp(window, { clientX: 120, clientY: 690 });
    expect(readEditor(screen).selectedNoteIds).toEqual(['e']);
  });

  it('selects all notes with Ctrl+A', () => {
    const grid = renderGrid([a, b, e]);
    expect(fireEvent.keyDown(grid, { key: 'a', code: 'KeyA', ctrlKey: true })).toBe(false);
    expect(readEditor(screen).selectedNoteIds).toEqual(['a', 'b', 'e']);
  });

  it('clears the selection on Escape, but not during a gesture', () => {
    const grid = renderGrid([a, b], { selectedNoteIds: ['a'] });
    fireEvent.keyDown(grid, { key: 'Escape' });
    expect(readEditor(screen).selectedNoteIds).toEqual([]);

    fireEvent.mouseDown(grid, { clientX: 60, clientY: C4_Y });
    fireEvent.mouseMove(window, { clientX: 120, clientY: C4_Y });
    fireEvent.keyDown(grid, { key: 'Escape' });
    fireEvent.mouseUp(window, { clientX: 120, clientY: C4_Y });
    expect(readNotes(screen)).toEqual([a, b]);
    expect(readEditor(screen).selectedNoteIds).toEqual(['a']);
  });

  it('moves the selected notes with the arrow keys, one undo step per key', () => {
    const grid = renderGrid([a, b], { selectedNoteIds: ['a', 'b'] });
    const pitches = () => readNotes(screen).map((note) => note.pitch);
    const starts = () => readNotes(screen).map((note) => note.start);

    fireEvent.keyDown(grid, { key: 'ArrowRight' });
    expect(starts()).toEqual([0.625, 1.125]);
    undo();
    expect(starts()).toEqual([0.5, 1]);
    fireEvent.keyDown(grid, { key: 'ArrowRight' });
    fireEvent.keyDown(grid, { key: 'ArrowLeft' });
    expect(starts()).toEqual([0.5, 1]);

    fireEvent.keyDown(grid, { key: 'ArrowUp' });
    expect(pitches()).toEqual([61, 65]);
    fireEvent.keyDown(grid, { key: 'ArrowUp', shiftKey: true });
    expect(pitches()).toEqual([73, 77]);
    fireEvent.keyDown(grid, { key: 'ArrowDown', shiftKey: true });
    expect(pitches()).toEqual([61, 65]);
    fireEvent.keyDown(grid, { key: 'ArrowDown' });
    expect(pitches()).toEqual([60, 64]);
  });

  it('creates no undo step when the notes cannot move', () => {
    const grid = renderGrid([{ ...a, start: 0 }], { selectedNoteIds: ['a'] });
    const before = projectRef;
    expect(fireEvent.keyDown(grid, { key: 'ArrowLeft' })).toBe(false);
    expect(projectRef).toBe(before);
    expect(screen.getByTestId('can-undo')).toHaveTextContent('false');
  });

  it('leaves the arrow keys to scrolling without a selection', () => {
    const grid = renderGrid([a, b]);
    const before = projectRef;
    expect(fireEvent.keyDown(grid, { key: 'ArrowRight' })).toBe(true);
    expect(projectRef).toBe(before);
  });

  it('blocks undo during a gesture', () => {
    const grid = renderGrid([a, b], { selectedNoteIds: ['a', 'b'] });
    fireEvent.keyDown(grid, { key: 'ArrowUp' });
    fireEvent.mouseDown(grid, { clientX: 60, clientY: 665 });
    fireEvent.mouseMove(window, { clientX: 85, clientY: 665 });
    expect(fireEvent.keyDown(grid, { key: 'z', code: 'KeyZ', ctrlKey: true })).toBe(false);
    fireEvent.mouseUp(window, { clientX: 85, clientY: 665 });
    expect(readNotes(screen).map((note) => note.pitch)).toEqual([61, 65]);
    expect(readNotes(screen).map((note) => note.start)).toEqual([0.75, 1.25]);
    undo();
    expect(readNotes(screen).map((note) => note.pitch)).toEqual([61, 65]);
    expect(readNotes(screen).map((note) => note.start)).toEqual([0.5, 1]);
  });
});
