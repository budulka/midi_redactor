import { render, screen } from '@testing-library/react';
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
});
