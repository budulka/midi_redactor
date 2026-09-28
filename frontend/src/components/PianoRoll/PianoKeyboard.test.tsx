import { fireEvent, render, screen } from '@testing-library/react';
import PianoKeyboard from './PianoKeyboard.tsx';

describe('PianoKeyboard', () => {
  it('renders 88 keys from C8 to A0', () => {
    render(<PianoKeyboard rowHeight={14} />);
    const keys = screen.getAllByRole('button');
    expect(keys).toHaveLength(88);
    expect(keys[0]).toHaveAccessibleName('C8');
    expect(keys[87]).toHaveAccessibleName('A0');
    expect(screen.getByRole('button', { name: 'C4' })).toHaveTextContent('C4');
    expect(screen.getByRole('button', { name: 'C#4' })).toHaveClass('piano-key--black');
    expect(screen.getByRole('button', { name: 'C4' })).toHaveClass('piano-key--white');
    expect(screen.getByRole('button', { name: 'C4' })).toHaveAttribute('data-pitch', '60');
  });

  it('reports note on and off', () => {
    const onNoteOn = vi.fn();
    const onNoteOff = vi.fn();
    render(<PianoKeyboard rowHeight={14} onNoteOn={onNoteOn} onNoteOff={onNoteOff} />);
    const key = screen.getByRole('button', { name: 'C4' });

    fireEvent.mouseDown(key);
    expect(onNoteOn).toHaveBeenCalledWith(60);
    expect(key).toHaveAttribute('aria-pressed', 'true');

    fireEvent.mouseUp(window);
    expect(onNoteOff).toHaveBeenCalledWith(60);
    expect(onNoteOff).toHaveBeenCalledTimes(1);
    expect(key).toHaveAttribute('aria-pressed', 'false');
  });

  it('releases the key when the mouse leaves it', () => {
    const onNoteOff = vi.fn();
    render(<PianoKeyboard rowHeight={14} onNoteOff={onNoteOff} />);
    const key = screen.getByRole('button', { name: 'D4' });
    fireEvent.mouseDown(key);
    fireEvent.mouseLeave(key);
    expect(onNoteOff).toHaveBeenCalledWith(62);
    expect(key).toHaveAttribute('aria-pressed', 'false');
  });

  it('works without callbacks', () => {
    render(<PianoKeyboard rowHeight={14} />);
    const key = screen.getByRole('button', { name: 'A0' });
    fireEvent.mouseDown(key);
    expect(key).toHaveAttribute('aria-pressed', 'true');
    fireEvent.mouseUp(window);
    expect(key).toHaveAttribute('aria-pressed', 'false');
  });
});
