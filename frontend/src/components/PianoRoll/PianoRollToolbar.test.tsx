import { fireEvent, screen } from '@testing-library/react';
import PianoRollToolbar from './PianoRollToolbar.tsx';
import { readEditor, readNotes, renderWithProviders } from './testUtils.tsx';

describe('PianoRollToolbar', () => {
  it('changes the grid division and snapping', () => {
    renderWithProviders(<PianoRollToolbar />);
    const grid = screen.getByLabelText<HTMLSelectElement>('Grid');
    expect(screen.getByRole('option', { name: '1/8 triplet' })).toBeInTheDocument();
    fireEvent.change(grid, { target: { value: '1/8' } });
    expect(readEditor(screen).gridDivision).toBe('1/8');

    const snap = screen.getByRole('checkbox', { name: 'Snap' });
    expect(snap).toBeChecked();
    fireEvent.click(snap);
    expect(readEditor(screen).snapEnabled).toBe(false);
  });

  it('zooms within limits', () => {
    renderWithProviders(<PianoRollToolbar />);
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    expect(readEditor(screen).pixelsPerSecond).toBe(125);
  });

  it('disables zoom buttons at the limits', () => {
    renderWithProviders(<PianoRollToolbar />, [], { pixelsPerSecond: 20 });
    expect(screen.getByRole('button', { name: 'Zoom out' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Zoom in' })).toBeEnabled();
  });

  it('quantizes the selected notes', () => {
    renderWithProviders(
      <PianoRollToolbar />,
      [{ id: 'a', pitch: 60, start: 0.26, duration: 0.2, velocity: 100 }],
      {},
    );
    expect(screen.getByRole('button', { name: 'Quantize' })).toBeDisabled();
  });

  it('quantizes a selected note to the grid', () => {
    renderWithProviders(
      <PianoRollToolbar />,
      [{ id: 'a', pitch: 60, start: 0.26, duration: 0.2, velocity: 100 }],
      { selectedNoteIds: ['a'] },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Quantize' }));
    expect(readNotes(screen)[0]).toMatchObject({ start: 0.25, duration: 0.25 });
  });
});
