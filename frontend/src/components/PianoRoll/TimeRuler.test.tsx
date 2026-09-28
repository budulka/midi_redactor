import { fireEvent, render, screen } from '@testing-library/react';
import TimeRuler from './TimeRuler.tsx';

function labels(): string[] {
  return Array.from(screen.getByLabelText('Time ruler').children).map(
    (child) => child.textContent ?? '',
  );
}

const range = (from: number, to: number, step = 1) =>
  Array.from({ length: Math.floor((to - from) / step) + 1 }, (_, i) => String(from + i * step));

describe('TimeRuler', () => {
  it('labels every bar when bars are wide', () => {
    render(
      <TimeRuler
        durationSeconds={60}
        bpm={120}
        timeSignature={{ numerator: 4, denominator: 4 }}
        pixelsPerSecond={100}
      />,
    );
    expect(labels()).toEqual(range(1, 30));
    expect(screen.getByText('2')).toHaveStyle({ left: '200px' });
  });

  it('labels every bar at the minimum spacing', () => {
    render(
      <TimeRuler
        durationSeconds={60}
        bpm={120}
        timeSignature={{ numerator: 4, denominator: 4 }}
        pixelsPerSecond={20}
      />,
    );
    expect(labels()).toEqual(range(1, 30));
  });

  it('skips labels when bars are narrow', () => {
    render(
      <TimeRuler
        durationSeconds={60}
        bpm={120}
        timeSignature={{ numerator: 3, denominator: 4 }}
        pixelsPerSecond={20}
      />,
    );
    expect(labels()).toEqual(range(1, 39, 2));
  });

  describe('seeking', () => {
    const renderRuler = (onSeek?: (time: number) => void) =>
      render(
        <TimeRuler
          durationSeconds={60}
          bpm={120}
          timeSignature={{ numerator: 4, denominator: 4 }}
          pixelsPerSecond={100}
          onSeek={onSeek}
        />,
      );

    it('seeks to the time under the pointer', () => {
      const onSeek = vi.fn();
      renderRuler(onSeek);
      fireEvent.mouseDown(screen.getByLabelText('Time ruler'), { clientX: 150, button: 0 });
      expect(onSeek).toHaveBeenCalledWith(1.5);
    });

    it('ignores the right mouse button', () => {
      const onSeek = vi.fn();
      renderRuler(onSeek);
      fireEvent.mouseDown(screen.getByLabelText('Time ruler'), { clientX: 150, button: 2 });
      expect(onSeek).not.toHaveBeenCalled();
    });

    it('does nothing without onSeek', () => {
      renderRuler();
      const ruler = screen.getByLabelText('Time ruler');
      expect(() => fireEvent.mouseDown(ruler, { clientX: 150, button: 0 })).not.toThrow();
      expect(ruler).not.toHaveClass('time-ruler--seekable');
    });
  });
});
