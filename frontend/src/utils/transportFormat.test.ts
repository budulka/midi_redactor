import { formatBarBeat, formatClock } from './transportFormat.ts';

const fourFour = { numerator: 4, denominator: 4 };

describe('formatClock', () => {
  it('formats minutes, seconds and milliseconds', () => {
    expect(formatClock(0)).toBe('0:00.000');
    expect(formatClock(61.25)).toBe('1:01.250');
    expect(formatClock(600)).toBe('10:00.000');
  });

  it('floors milliseconds', () => {
    expect(formatClock(59.9996)).toBe('0:59.999');
    expect(formatClock(2.55 - 0.05)).toBe('0:02.500');
  });
});

describe('formatBarBeat', () => {
  it('shows the 1-based bar and beat', () => {
    expect(formatBarBeat(0, 120, fourFour)).toBe('1.1');
    expect(formatBarBeat(2.5, 120, fourFour)).toBe('2.2');
    expect(formatBarBeat(1.6, 120, { numerator: 3, denominator: 4 })).toBe('2.1');
  });
});
