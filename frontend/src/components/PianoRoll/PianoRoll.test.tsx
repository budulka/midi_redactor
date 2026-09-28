import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { FakePianoEngine } from '../../audio/testing/FakePianoEngine.ts';
import EditorProvider from '../../state/EditorProvider.tsx';
import ProjectProvider from '../../state/ProjectProvider.tsx';
import TransportProvider from '../../state/TransportProvider.tsx';
import * as idModule from '../../utils/id.ts';
import ProjectInfo from '../ProjectInfo.tsx';
import PianoRoll from './PianoRoll.tsx';

let engine: FakePianoEngine;

function renderPianoRoll() {
  render(
    <ProjectProvider>
      <EditorProvider>
        <TransportProvider loadEngine={() => Promise.resolve(engine)}>
          <ProjectInfo />
          <PianoRoll />
        </TransportProvider>
      </EditorProvider>
    </ProjectProvider>,
  );
  return screen.getByRole('application', { name: 'Note grid' });
}

describe('PianoRoll', () => {
  beforeEach(() => {
    engine = new FakePianoEngine();
    vi.spyOn(idModule, 'createId').mockReturnValue('new-1');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the toolbar, keyboard, ruler and grid', () => {
    renderPianoRoll();
    const region = screen.getByRole('region', { name: 'Piano roll' });
    expect(within(region).getByRole('toolbar', { name: 'Piano roll tools' })).toBeInTheDocument();
    expect(
      within(within(region).getByRole('group', { name: 'Piano keyboard' })).getAllByRole('button'),
    ).toHaveLength(88);
    expect(within(region).getByLabelText('Time ruler')).toBeInTheDocument();
    expect(within(region).getByRole('application', { name: 'Note grid' })).toBeInTheDocument();
  });

  it('renders the pedal lane with row labels', () => {
    renderPianoRoll();
    const region = screen.getByRole('region', { name: 'Piano roll' });
    expect(within(region).getByRole('application', { name: 'Pedal lane' })).toBeInTheDocument();
    for (const label of ['Sustain', 'Sostenuto', 'Soft']) {
      expect(within(region).getByText(label)).toBeInTheDocument();
    }
  });

  it('adds a pedal with a click and deletes it with Delete without touching notes', () => {
    const grid = renderPianoRoll();
    fireEvent.mouseDown(grid, { clientX: 30, clientY: 679 });
    fireEvent.mouseUp(window, { clientX: 30, clientY: 679 });
    expect(screen.getByText('1 note')).toBeInTheDocument();

    vi.spyOn(idModule, 'createId').mockReturnValue('pedal-1');
    const lane = screen.getByRole('application', { name: 'Pedal lane' });
    fireEvent.mouseDown(lane, { clientX: 30, clientY: 10 });
    fireEvent.mouseUp(window, { clientX: 30, clientY: 10 });
    expect(screen.getByLabelText('Sustain from 0.25 s to 0.75 s')).toBeInTheDocument();
    expect(lane).toHaveFocus();

    fireEvent.keyDown(document.activeElement ?? lane, { key: 'Delete' });
    expect(screen.queryByLabelText('Sustain from 0.25 s to 0.75 s')).not.toBeInTheDocument();
    expect(screen.getByText('1 note')).toBeInTheDocument();
  });

  it('adds a note with a click and deletes it with the Delete key', () => {
    const grid = renderPianoRoll();
    fireEvent.mouseDown(grid, { clientX: 30, clientY: 679 });
    fireEvent.mouseUp(window, { clientX: 30, clientY: 679 });
    expect(screen.getByText('1 note')).toBeInTheDocument();
    expect(
      within(screen.getByRole('group', { name: 'Note inspector' })).getByText('C4'),
    ).toBeInTheDocument();
    expect(grid).toHaveFocus();

    fireEvent.keyDown(document.activeElement ?? grid, { key: 'Delete' });
    expect(screen.getByText('0 notes')).toBeInTheDocument();
    expect(screen.getByText('No note selected')).toBeInTheDocument();
  });

  it('renders the playhead', () => {
    renderPianoRoll();
    expect(screen.getByTestId('playhead')).toHaveStyle({ transform: 'translateX(0px)' });
  });

  it('plays a keyboard key while it is held', async () => {
    renderPianoRoll();
    const keyboard = screen.getByRole('group', { name: 'Piano keyboard' });
    fireEvent.mouseDown(within(keyboard).getByRole('button', { name: 'C4' }), { button: 0 });
    await waitFor(() =>
      expect(engine.calls).toContainEqual({
        op: 'attack',
        channel: 'live',
        pitch: 60,
        velocity: 96,
        time: 0,
      }),
    );
    fireEvent.mouseUp(window);
    expect(engine.calls).toContainEqual({ op: 'release', channel: 'live', pitch: 60, time: 0 });
  });

  it('moves the playhead when the ruler is clicked', () => {
    renderPianoRoll();
    fireEvent.mouseDown(screen.getByLabelText('Time ruler'), { clientX: 250, button: 0 });
    expect(screen.getByTestId('playhead')).toHaveStyle({ transform: 'translateX(250px)' });
  });
});
