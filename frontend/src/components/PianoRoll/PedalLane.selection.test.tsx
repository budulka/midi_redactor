import { fireEvent, screen } from '@testing-library/react';
import { useHistoryApi } from '../../state/historyContext.ts';
import { useProject } from '../../state/projectContext.ts';
import type { PedalEvent, Project } from '../../state/types.ts';
import * as idModule from '../../utils/id.ts';
import PedalLane from './PedalLane.tsx';
import { readEditor, readPedals, renderWithProviders } from './testUtils.tsx';

const SUSTAIN_Y = 10;
const SOFT_Y = 50;
const p1: PedalEvent = { id: 'p1', type: 'sustain', start: 0.5, end: 1 };
const p2: PedalEvent = { id: 'p2', type: 'sustain', start: 2, end: 2.5 };
const p3: PedalEvent = { id: 'p3', type: 'soft', start: 0.5, end: 1 };

let projectRef: Project | null = null;

function HistoryProbe() {
  projectRef = useProject();
  const history = useHistoryApi();
  return (
    <button type="button" onClick={history.undo}>
      undo
    </button>
  );
}

function renderLane(editor?: Parameters<typeof renderWithProviders>[2]) {
  const view = renderWithProviders(
    <>
      <PedalLane />
      <HistoryProbe />
    </>,
    [{ id: 'n', pitch: 60, start: 0, duration: 0.5, velocity: 100 }],
    editor,
    [p1, p2, p3],
  );
  return { view, lane: screen.getByRole('application', { name: 'Pedal lane' }) };
}

function click(lane: HTMLElement, x: number, y: number, modifiers = {}) {
  fireEvent.mouseDown(lane, { clientX: x, clientY: y, ...modifiers });
  fireEvent.mouseUp(window, { clientX: x, clientY: y });
}

function selectedOnScreen(): string[] {
  return screen
    .getAllByTestId('pedal')
    .filter((el) => el.dataset.selected === 'true')
    .map((el) => el.dataset.pedalId ?? '');
}

describe('PedalLane selection', () => {
  beforeEach(() => {
    vi.spyOn(idModule, 'createId').mockReturnValue('new-1');
    projectRef = null;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('adds and removes pedals with Shift and Ctrl clicks', () => {
    const { view, lane } = renderLane();
    const before = projectRef;
    click(lane, 75, SUSTAIN_Y);
    click(lane, 225, SUSTAIN_Y, { shiftKey: true });
    expect(selectedOnScreen()).toEqual(['p1', 'p2']);
    expect(projectRef).toBe(before);
    click(lane, 75, SUSTAIN_Y, { ctrlKey: true });
    expect(readEditor(view).selectedPedalIds).toEqual(['p2']);
    expect(projectRef).toBe(before);
  });

  it('creates no pedal on a Shift click in an empty place', () => {
    const { view, lane } = renderLane();
    click(lane, 400, SUSTAIN_Y, { shiftKey: true });
    expect(readPedals(view)).toHaveLength(3);
  });

  it('deletes all selected pedals in one undo step', () => {
    const { view, lane } = renderLane({ selectedPedalIds: ['p1', 'p2'] });
    fireEvent.keyDown(lane, { key: 'Delete' });
    expect(readPedals(view)).toEqual([p3]);
    fireEvent.click(screen.getByRole('button', { name: 'undo' }));
    expect(readPedals(view)).toHaveLength(3);
  });

  it('selects all pedals with Ctrl+A', () => {
    const { view, lane } = renderLane({ selectedNoteIds: ['n'] });
    expect(fireEvent.keyDown(lane, { key: 'a', code: 'KeyA', ctrlKey: true })).toBe(false);
    expect(readEditor(view).selectedPedalIds).toEqual(['p1', 'p2', 'p3']);
    expect(readEditor(view).selectedNoteIds).toEqual([]);
  });

  it('clears the selection on Escape', () => {
    const { view, lane } = renderLane({ selectedPedalIds: ['p1', 'p3'] });
    fireEvent.keyDown(lane, { key: 'Escape' });
    expect(readEditor(view).selectedPedalIds).toEqual([]);
  });

  it('ignores the arrow keys', () => {
    const { view, lane } = renderLane({ selectedPedalIds: ['p1'] });
    expect(fireEvent.keyDown(lane, { key: 'ArrowRight' })).toBe(true);
    expect(readPedals(view)[0]).toEqual(p1);
  });

  it('adds a pedal of another type with a Meta click', () => {
    const { view, lane } = renderLane({ selectedPedalIds: ['p1'] });
    click(lane, 75, SOFT_Y, { metaKey: true });
    expect(readEditor(view).selectedPedalIds).toEqual(['p1', 'p3']);
  });
});
