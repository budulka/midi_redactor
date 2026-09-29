import { fireEvent, screen } from '@testing-library/react';
import { addNote } from '../state/actions.ts';
import { useProjectDispatch } from '../state/projectContext.ts';
import * as idModule from '../utils/id.ts';
import KeyboardShortcuts from './KeyboardShortcuts.tsx';
import { readNotes, renderWithProviders } from './PianoRoll/testUtils.tsx';
import { stubAnimationFrames } from './testing/animationFrames.ts';
import TransportControls from './TransportControls.tsx';

function AddButton() {
  const dispatch = useProjectDispatch();
  return (
    <button
      type="button"
      onClick={() => dispatch(addNote({ pitch: 60, start: 0, duration: 0.5, velocity: 100 }))}
    >
      add
    </button>
  );
}

function renderShortcuts() {
  return renderWithProviders(
    <>
      <KeyboardShortcuts />
      <TransportControls />
      <AddButton />
      <input aria-label="text" />
      <div onKeyDown={(event) => event.preventDefault()}>
        <button type="button">handled</button>
      </div>
    </>,
  );
}

const ctrlZ = { key: 'z', code: 'KeyZ', ctrlKey: true };
const space = { key: ' ', code: 'Space' };

describe('KeyboardShortcuts', () => {
  beforeEach(() => {
    stubAnimationFrames();
    let next = 0;
    vi.spyOn(idModule, 'createId').mockImplementation(() => `n${(next += 1)}`);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('undoes and redoes from the keyboard', () => {
    renderShortcuts();
    fireEvent.click(screen.getByRole('button', { name: 'add' }));
    expect(readNotes(screen)).toHaveLength(1);
    expect(fireEvent.keyDown(document.body, ctrlZ)).toBe(false);
    expect(readNotes(screen)).toHaveLength(0);
    fireEvent.keyDown(document.body, { ...ctrlZ, key: 'Z', shiftKey: true });
    expect(readNotes(screen)).toHaveLength(1);
    fireEvent.keyDown(document.body, ctrlZ);
    expect(readNotes(screen)).toHaveLength(0);
    fireEvent.keyDown(document.body, { key: 'y', code: 'KeyY', ctrlKey: true });
    expect(readNotes(screen)).toHaveLength(1);
  });

  it('leaves Ctrl+Z to a text field', () => {
    renderShortcuts();
    fireEvent.click(screen.getByRole('button', { name: 'add' }));
    expect(fireEvent.keyDown(screen.getByLabelText('text'), ctrlZ)).toBe(true);
    expect(readNotes(screen)).toHaveLength(1);
  });

  it('toggles playback with Space', async () => {
    renderShortcuts();
    fireEvent.keyDown(document.body, space);
    expect(await screen.findByRole('button', { name: 'Pause' })).toBeInTheDocument();
    fireEvent.keyDown(document.body, space);
    expect(await screen.findByRole('button', { name: 'Play' })).toBeInTheDocument();
  });

  it('ignores a repeated Space and Space on a button', () => {
    renderShortcuts();
    expect(fireEvent.keyDown(document.body, { ...space, repeat: true })).toBe(true);
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument();
    expect(fireEvent.keyDown(screen.getByRole('button', { name: 'Stop' }), space)).toBe(true);
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument();
  });

  it('ignores events already handled by a child', () => {
    renderShortcuts();
    fireEvent.click(screen.getByRole('button', { name: 'add' }));
    fireEvent.keyDown(screen.getByRole('button', { name: 'handled' }), ctrlZ);
    expect(readNotes(screen)).toHaveLength(1);
  });

  it('removes its listener on unmount', () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener');
    const view = renderShortcuts();
    fireEvent.click(screen.getByRole('button', { name: 'add' }));
    view.unmount();
    expect(removeSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
    expect(fireEvent.keyDown(document.body, ctrlZ)).toBe(true);
  });
});
