import { fireEvent, render, screen, within } from '@testing-library/react';
import EditorProvider from '../../state/EditorProvider.tsx';
import ProjectProvider from '../../state/ProjectProvider.tsx';
import * as idModule from '../../utils/id.ts';
import ProjectInfo from '../ProjectInfo.tsx';
import PianoRoll from './PianoRoll.tsx';

function renderPianoRoll() {
  render(
    <ProjectProvider>
      <EditorProvider>
        <ProjectInfo />
        <PianoRoll />
      </EditorProvider>
    </ProjectProvider>,
  );
  return screen.getByRole('application', { name: 'Note grid' });
}

describe('PianoRoll', () => {
  beforeEach(() => {
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
});
