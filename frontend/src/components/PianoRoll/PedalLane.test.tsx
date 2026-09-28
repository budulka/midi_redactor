import { fireEvent, render, screen } from '@testing-library/react';
import EditorProvider from '../../state/EditorProvider.tsx';
import type { EditorState } from '../../state/editorState.ts';
import ProjectProvider from '../../state/ProjectProvider.tsx';
import type { Note, PedalEvent, Project } from '../../state/types.ts';
import * as idModule from '../../utils/id.ts';
import PedalLane from './PedalLane.tsx';
import { readEditor, readPedals, renderWithProviders } from './testUtils.tsx';
import { MediaDurationContext } from '../../state/timelineContext.ts';

const SUSTAIN_Y = 10;
const SOSTENUTO_Y = 30;
const SOFT_Y = 50;

function pedal(id: string, type: PedalEvent['type'], start: number, end: number): PedalEvent {
  return { id, type, start, end };
}

const a = pedal('a', 'sustain', 0.5, 1.5);

function renderLane(pedals: PedalEvent[] = [], editor?: Partial<EditorState>, notes: Note[] = []) {
  const view = renderWithProviders(<PedalLane />, notes, editor, pedals);
  return { view, lane: screen.getByRole('application', { name: 'Pedal lane' }) };
}

function pedalElement(id: string): HTMLElement {
  const element = screen.getAllByTestId('pedal').find((el) => el.dataset.pedalId === id);
  if (element === undefined) throw new Error(`pedal ${id} is not rendered`);
  return element;
}

function drag(lane: HTMLElement, from: [number, number], ...moves: [number, number][]) {
  fireEvent.mouseDown(lane, { clientX: from[0], clientY: from[1] });
  for (const [x, y] of moves) fireEvent.mouseMove(window, { clientX: x, clientY: y });
  const [endX, endY] = moves.length > 0 ? moves[moves.length - 1] : from;
  fireEvent.mouseUp(window, { clientX: endX, clientY: endY });
}

describe('PedalLane', () => {
  beforeEach(() => {
    vi.spyOn(idModule, 'createId').mockReturnValue('new-1');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders pedals in their rows', () => {
    const { lane } = renderLane([a, pedal('s', 'soft', 0, 1)]);
    expect(pedalElement('a')).toHaveStyle({ left: '50px', width: '100px', top: '0px' });
    expect(pedalElement('a')).toHaveAttribute('aria-label', 'Sustain from 0.50 s to 1.50 s');
    expect(pedalElement('a')).toHaveAttribute('title', 'Sustain from 0.50 s to 1.50 s');
    expect(pedalElement('s')).toHaveStyle({ top: '40px' });
    expect(lane).toHaveStyle({ width: '6000px', height: '60px' });
  });

  it('creates a sustain pedal of one beat on click and selects it', () => {
    const { view, lane } = renderLane();
    drag(lane, [30, SUSTAIN_Y]);
    expect(readPedals(view)).toEqual([pedal('new-1', 'sustain', 0.25, 0.75)]);
    expect(readEditor(view).selectedPedalIds).toEqual(['new-1']);
    expect(pedalElement('new-1')).toHaveAttribute('data-selected', 'true');
  });

  it('takes the pedal type from the row', () => {
    vi.spyOn(idModule, 'createId').mockReturnValueOnce('new-1').mockReturnValueOnce('new-2');
    const { view, lane } = renderLane();
    drag(lane, [30, SOSTENUTO_Y]);
    drag(lane, [30, SOFT_Y]);
    expect(readPedals(view)).toEqual([
      pedal('new-1', 'sostenuto', 0.25, 0.75),
      pedal('new-2', 'soft', 0.25, 0.75),
    ]);
  });

  it('creates a longer pedal by dragging, with one action per gesture', () => {
    const { view, lane } = renderLane();
    fireEvent.mouseDown(lane, { clientX: 30, clientY: SUSTAIN_Y });
    fireEvent.mouseMove(window, { clientX: 130, clientY: SUSTAIN_Y });
    expect(pedalElement('new-1')).toHaveStyle({ width: '112.5px' });
    expect(readPedals(view)).toHaveLength(0);
    fireEvent.mouseUp(window, { clientX: 130, clientY: SUSTAIN_Y });
    expect(readPedals(view)).toEqual([pedal('new-1', 'sustain', 0.25, 1.375)]);
  });

  it('stops a new pedal at the next one of the same type', () => {
    const b = pedal('b', 'sustain', 1, 2);
    const first = renderLane([b]);
    drag(first.lane, [80, SUSTAIN_Y]);
    expect(readPedals(first.view)[1]).toEqual(pedal('new-1', 'sustain', 0.75, 1));
    first.view.unmount();

    const second = renderLane([b]);
    drag(second.lane, [80, SUSTAIN_Y], [300, SUSTAIN_Y]);
    expect(readPedals(second.view)[1]).toEqual(pedal('new-1', 'sustain', 0.75, 1));
  });

  it('starts a new pedal right after the previous one', () => {
    const { view, lane } = renderLane([pedal('p', 'sustain', 0, 0.3)]);
    drag(lane, [35, SUSTAIN_Y]);
    expect(readPedals(view)[1]).toEqual(pedal('new-1', 'sustain', 0.3, 0.8));
  });

  it('keeps rows of different types independent', () => {
    const { view, lane } = renderLane([pedal('p', 'sustain', 0, 1)]);
    drag(lane, [50, SOSTENUTO_Y]);
    expect(readPedals(view)[1]).toEqual(pedal('new-1', 'sostenuto', 0.5, 1));
  });

  it('moves a pedal in time and keeps its type', () => {
    const first = renderLane([a]);
    drag(first.lane, [60, SUSTAIN_Y], [82, SUSTAIN_Y]);
    expect(readPedals(first.view)).toEqual([{ ...a, start: 0.75, end: 1.75 }]);
    first.view.unmount();

    const second = renderLane([a]);
    drag(second.lane, [60, SUSTAIN_Y], [82, SOFT_Y]);
    expect(readPedals(second.view)).toEqual([{ ...a, start: 0.75, end: 1.75 }]);
  });

  it('stops a moved pedal at its neighbour', () => {
    const b = pedal('b', 'sustain', 2, 3);
    const { view, lane } = renderLane([a, b]);
    drag(lane, [60, SUSTAIN_Y], [200, SUSTAIN_Y]);
    expect(readPedals(view)).toEqual([{ ...a, start: 1, end: 2 }, b]);
  });

  it('changes the start by the left edge', () => {
    const { view, lane } = renderLane([a]);
    drag(lane, [52, SUSTAIN_Y], [27, SUSTAIN_Y]);
    expect(readPedals(view)).toEqual([{ ...a, start: 0.25 }]);
  });

  it('changes the end by the right edge', () => {
    const { view, lane } = renderLane([a]);
    drag(lane, [147, SUSTAIN_Y], [190, SUSTAIN_Y]);
    expect(readPedals(view)).toEqual([{ ...a, end: 1.875 }]);
  });

  it('selects a pedal on click without changing the project', () => {
    const { view, lane } = renderLane([a], { selectedNoteIds: ['n1'] });
    drag(lane, [100, SUSTAIN_Y]);
    expect(readPedals(view)).toEqual([a]);
    expect(pedalElement('a')).toHaveAttribute('data-selected', 'true');
    expect(readEditor(view).selectedNoteIds).toEqual([]);
    expect(readEditor(view).selectedPedalIds).toEqual(['a']);
  });

  it('ignores moves below the drag threshold', () => {
    const { view, lane } = renderLane([a]);
    drag(lane, [60, SUSTAIN_Y], [62, SUSTAIN_Y]);
    expect(readPedals(view)).toEqual([a]);
  });

  it('cancels creating on Escape', () => {
    const { view, lane } = renderLane();
    fireEvent.mouseDown(lane, { clientX: 30, clientY: SUSTAIN_Y });
    fireEvent.mouseMove(window, { clientX: 130, clientY: SUSTAIN_Y });
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryAllByTestId('pedal')).toHaveLength(0);
    fireEvent.mouseUp(window, { clientX: 130, clientY: SUSTAIN_Y });
    expect(readPedals(view)).toHaveLength(0);
  });

  it('deletes a pedal on right click only over a pedal', () => {
    const { view, lane } = renderLane([a]);
    fireEvent.contextMenu(lane, { clientX: 300, clientY: SUSTAIN_Y });
    expect(readPedals(view)).toHaveLength(1);
    fireEvent.contextMenu(lane, { clientX: 100, clientY: SUSTAIN_Y });
    expect(readPedals(view)).toHaveLength(0);
  });

  it('deletes the selected pedal with Delete and Backspace', () => {
    const b = pedal('b', 'soft', 0.5, 1.5);
    const { view, lane } = renderLane([a, b]);
    fireEvent.keyDown(lane, { key: 'Delete' });
    expect(readPedals(view)).toHaveLength(2);

    drag(lane, [100, SUSTAIN_Y]);
    fireEvent.keyDown(lane, { key: 'Delete' });
    expect(readPedals(view)).toEqual([b]);
    expect(readEditor(view).selectedPedalIds).toEqual([]);

    drag(lane, [100, SOFT_Y]);
    fireEvent.keyDown(lane, { key: 'Backspace' });
    expect(readPedals(view)).toHaveLength(0);
  });

  it('does not start a gesture with other mouse buttons', () => {
    const { view, lane } = renderLane();
    fireEvent.mouseDown(lane, { clientX: 30, clientY: SUSTAIN_Y, button: 2 });
    fireEvent.mouseUp(window, { clientX: 30, clientY: SUSTAIN_Y, button: 2 });
    expect(readPedals(view)).toHaveLength(0);
  });

  it('takes focus from the mouse without the focus ring', () => {
    const { lane } = renderLane();
    expect(lane).toHaveAttribute('tabindex', '0');
    fireEvent.mouseDown(lane, { clientX: 30, clientY: SUSTAIN_Y });
    expect(lane).toHaveFocus();
    expect(lane).toHaveAttribute('data-pointer-focus', 'true');
    fireEvent.mouseUp(window, { clientX: 30, clientY: SUSTAIN_Y });
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
          <PedalLane />
        </EditorProvider>
      </ProjectProvider>,
    );
    fireEvent.mouseDown(screen.getByRole('application', { name: 'Pedal lane' }), {
      clientX: 30,
      clientY: SUSTAIN_Y,
    });
    view.unmount();
    expect(removeSpy).toHaveBeenCalledWith('mousemove', expect.any(Function));
    expect(removeSpy).toHaveBeenCalledWith('mouseup', expect.any(Function));
    expect(removeSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
  });
  it('extends the lane to the end of the loaded media', () => {
    renderWithProviders(
      <MediaDurationContext.Provider value={90}>
        <PedalLane />
      </MediaDurationContext.Provider>,
    );
    expect(screen.getByRole('application', { name: 'Pedal lane' })).toHaveStyle({
      width: '9400px',
    });
  });
});
