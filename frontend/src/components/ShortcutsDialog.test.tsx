import { fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { addNote } from '../state/actions.ts';
import { useProjectDispatch } from '../state/projectContext.ts';
import { HELP_NOTE, HELP_SECTION_SPECS, buildHelpSections } from '../utils/helpSections.ts';
import * as idModule from '../utils/id.ts';
import KeyboardShortcuts from './KeyboardShortcuts.tsx';
import { readNotes, renderWithProviders } from './PianoRoll/testUtils.tsx';
import ShortcutsDialog from './ShortcutsDialog.tsx';
import { stubAnimationFrames } from './testing/animationFrames.ts';
import TransportControls from './TransportControls.tsx';

const dialogName = 'Keyboard shortcuts and mouse actions';
const dialog = () => screen.getByRole('dialog', { name: dialogName });
const closeButton = () => screen.getByRole('button', { name: 'Close' });
const list = () => screen.getByRole('region', { name: 'Shortcut list' });

describe('ShortcutsDialog', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('is a modal dialog described by the note', () => {
    render(<ShortcutsDialog onClose={vi.fn()} />);
    expect(dialog()).toHaveAttribute('aria-modal', 'true');
    const noteId = dialog().getAttribute('aria-describedby');
    expect(noteId).not.toBeNull();
    expect(document.getElementById(noteId ?? '')).toHaveTextContent(HELP_NOTE);
  });

  it('focuses Close when it opens', () => {
    render(<ShortcutsDialog onClose={vi.fn()} />);
    expect(closeButton()).toHaveFocus();
  });

  it('shows every section and every row', () => {
    render(<ShortcutsDialog onClose={vi.fn()} />);
    const titles = within(dialog())
      .getAllByRole('heading', { level: 3 })
      .map((heading) => heading.textContent);
    expect(titles).toEqual(HELP_SECTION_SPECS.map((spec) => spec.title));
    const rows = buildHelpSections().reduce((sum, section) => sum + section.rows.length, 0);
    expect(dialog().querySelectorAll('tbody tr')).toHaveLength(rows);
  });

  it('shows keys as kbd and mouse actions as gestures', () => {
    render(<ShortcutsDialog onClose={vi.fn()} />);
    const redo = within(dialog()).getByText('Redo (not in text fields)').closest('tr');
    if (redo === null) throw new Error('no redo row');
    expect(Array.from(redo.querySelectorAll('kbd')).map((kbd) => kbd.textContent)).toEqual([
      'Ctrl+Shift+Z',
      'Ctrl+Y',
    ]);
    const deleteNote = within(dialog()).getByText('Right-click a note').closest('tr');
    if (deleteNote === null) throw new Error('no delete row');
    expect(deleteNote.querySelector('kbd')).toBeNull();
    expect(deleteNote.querySelector('.shortcuts-dialog__gesture')).not.toBeNull();
  });

  it('closes on Escape, on Close and on the backdrop', () => {
    const onClose = vi.fn();
    render(<ShortcutsDialog onClose={onClose} />);
    expect(fireEvent.keyDown(closeButton(), { key: 'Escape' })).toBe(false);
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(closeButton());
    expect(onClose).toHaveBeenCalledTimes(2);
    fireEvent.mouseDown(within(dialog()).getByRole('heading', { level: 2 }));
    expect(onClose).toHaveBeenCalledTimes(2);
    const backdrop = document.querySelector('.shortcuts-dialog__backdrop');
    if (backdrop === null) throw new Error('no backdrop');
    fireEvent.mouseDown(backdrop);
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it('keeps Tab inside the window', () => {
    render(<ShortcutsDialog onClose={vi.fn()} />);
    fireEvent.keyDown(closeButton(), { key: 'Tab' });
    expect(list()).toHaveFocus();
    fireEvent.keyDown(list(), { key: 'Tab' });
    expect(closeButton()).toHaveFocus();
    fireEvent.keyDown(closeButton(), { key: 'Tab', shiftKey: true });
    expect(list()).toHaveFocus();
  });

  it('has a focusable root that Tab leaves for the first and last control', () => {
    render(<ShortcutsDialog onClose={vi.fn()} />);
    expect(dialog()).toHaveAttribute('tabIndex', '-1');
    dialog().focus();
    expect(fireEvent.keyDown(dialog(), { key: 'Tab' })).toBe(false);
    expect(closeButton()).toHaveFocus();
    dialog().focus();
    fireEvent.keyDown(dialog(), { key: 'Tab', shiftKey: true });
    expect(list()).toHaveFocus();
  });

  it('pulls a focus outside back into the window while open', () => {
    function Harness() {
      const [open, setOpen] = useState(true);
      return (
        <>
          <button type="button">outside</button>
          <button type="button" onClick={() => setOpen(false)}>
            unmount
          </button>
          {open && <ShortcutsDialog onClose={vi.fn()} />}
        </>
      );
    }
    render(<Harness />);
    const outside = screen.getByRole('button', { name: 'outside' });
    outside.focus();
    expect(document.activeElement).toBe(dialog());
    fireEvent.click(screen.getByRole('button', { name: 'unmount' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    outside.focus();
    expect(outside).toHaveFocus();
  });

  describe('page keys', () => {
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

    function OpenDialog() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            open
          </button>
          {open && <ShortcutsDialog onClose={vi.fn()} />}
        </>
      );
    }

    beforeEach(() => {
      stubAnimationFrames();
      let next = 0;
      vi.spyOn(idModule, 'createId').mockImplementation(() => `n${(next += 1)}`);
      renderWithProviders(
        <>
          <KeyboardShortcuts />
          <TransportControls />
          <AddButton />
          <OpenDialog />
        </>,
      );
      fireEvent.click(screen.getByRole('button', { name: 'add' }));
      fireEvent.click(screen.getByRole('button', { name: 'open' }));
    });

    const ctrlZ = { key: 'z', code: 'KeyZ', ctrlKey: true };
    const space = { key: ' ', code: 'Space' };

    it('are off inside the window', () => {
      expect(fireEvent.keyDown(closeButton(), ctrlZ)).toBe(true);
      expect(readNotes(screen)).toHaveLength(1);
      fireEvent.keyDown(list(), space);
      expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument();
    });

    it('are off with the focus on the root of the window', () => {
      dialog().focus();
      fireEvent.keyDown(dialog(), ctrlZ);
      expect(readNotes(screen)).toHaveLength(1);
      fireEvent.keyDown(dialog(), space);
      expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument();
    });
  });
});
