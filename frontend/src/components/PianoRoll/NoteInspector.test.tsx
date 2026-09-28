import { fireEvent, screen } from '@testing-library/react';
import type { Note } from '../../state/types.ts';
import NoteInspector from './NoteInspector.tsx';
import { readEditor, readNotes, renderWithProviders } from './testUtils.tsx';

const note: Note = { id: 'a', pitch: 60, start: 2.75, duration: 0.5, velocity: 100 };

function commitVelocity(value: string) {
  const input = screen.getByLabelText<HTMLInputElement>('Velocity');
  fireEvent.change(input, { target: { value } });
  fireEvent.keyDown(input, { key: 'Enter' });
}

describe('NoteInspector', () => {
  it('shows a placeholder without selection', () => {
    renderWithProviders(<NoteInspector />, [note]);
    expect(screen.getByText('No note selected')).toBeInTheDocument();
  });

  it('shows and edits the selected note', () => {
    renderWithProviders(<NoteInspector />, [note], { selectedNoteIds: ['a'] });
    expect(screen.getByText('C4')).toBeInTheDocument();
    expect(screen.getByText('bar 2, beat 2')).toBeInTheDocument();
    expect(screen.getByText('0.500 s')).toBeInTheDocument();
    expect(screen.getByLabelText<HTMLInputElement>('Velocity').value).toBe('100');

    commitVelocity('64');
    expect(readNotes(screen)[0].velocity).toBe(64);
    commitVelocity('200');
    expect(readNotes(screen)[0].velocity).toBe(127);
    expect(screen.getByLabelText<HTMLInputElement>('Velocity').value).toBe('127');
  });

  it('deletes the selected note', () => {
    renderWithProviders(<NoteInspector />, [note], { selectedNoteIds: ['a'] });
    fireEvent.click(screen.getByRole('button', { name: 'Delete note' }));
    expect(readNotes(screen)).toEqual([]);
    expect(readEditor(screen).selectedNoteIds).toEqual([]);
    expect(screen.getByText('No note selected')).toBeInTheDocument();
  });

  it('applies velocity to several selected notes', () => {
    const b: Note = { ...note, id: 'b', pitch: 64 };
    renderWithProviders(<NoteInspector />, [note, b], { selectedNoteIds: ['a', 'b'] });
    expect(screen.getByText('2 notes selected')).toBeInTheDocument();
    commitVelocity('50');
    expect(readNotes(screen).map((n) => n.velocity)).toEqual([50, 50]);
  });
});
