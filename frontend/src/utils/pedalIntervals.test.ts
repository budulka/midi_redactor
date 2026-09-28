import type { PedalEvent } from '../state/types.ts';
import {
  gapAt,
  neighborBounds,
  pedalAt,
  pedalsOfType,
  pedalsOverlap,
  pressedPedalIn,
} from './pedalIntervals.ts';

function pedal(id: string, type: PedalEvent['type'], start: number, end: number): PedalEvent {
  return { id, type, start, end };
}

const s2 = pedal('s2', 'sustain', 2, 3);
const so = pedal('so', 'sostenuto', 0.5, 2.5);
const s1 = pedal('s1', 'sustain', 0, 1);
const set: readonly PedalEvent[] = [s2, so, s1];

describe('pedalsOverlap', () => {
  it('detects intersections of the same type only', () => {
    expect(pedalsOverlap(pedal('a', 'sustain', 0, 1), pedal('b', 'sustain', 0.5, 1.5))).toBe(true);
    expect(pedalsOverlap(pedal('a', 'sustain', 0, 1), pedal('b', 'sustain', 1, 2))).toBe(false);
    expect(pedalsOverlap(pedal('a', 'sustain', 0, 1), pedal('b', 'soft', 0.5, 1.5))).toBe(false);
  });
});

describe('pedalsOfType', () => {
  it('filters by type and sorts by start without mutating the input', () => {
    const input = [...set];
    expect(pedalsOfType(input, 'sustain')).toEqual([s1, s2]);
    expect(input).toEqual([s2, so, s1]);
  });
});

describe('pedalAt', () => {
  it('finds the pressed pedal with an inclusive start and exclusive end', () => {
    expect(pedalAt(set, 'sustain', 0.99)).toBe(s1);
    expect(pedalAt(set, 'sustain', 1)).toBeNull();
    expect(pedalAt(set, 'sustain', 2)).toBe(s2);
    expect(pedalAt(set, 'soft', 1)).toBeNull();
    expect(pedalAt([], 'sustain', 0)).toBeNull();
  });
});

describe('pressedPedalIn', () => {
  it('looks up a pedal in a sorted list', () => {
    const sorted = pedalsOfType(set, 'sustain');
    expect(pressedPedalIn(sorted, 0)).toBe(s1);
    expect(pressedPedalIn(sorted, 1.5)).toBeNull();
    expect(pressedPedalIn(sorted, 2.5)).toBe(s2);
  });
});

describe('gapAt', () => {
  it('returns the free range between pedals of a type', () => {
    expect(gapAt(set, 'sustain', 1.5)).toEqual({ min: 1, max: 2 });
    expect(gapAt(set, 'sustain', 1)).toEqual({ min: 1, max: 2 });
    expect(gapAt(set, 'sustain', 0.5)).toBeNull();
    expect(gapAt(set, 'sustain', 3.5)).toEqual({ min: 3, max: Infinity });
    expect(gapAt([s2], 'sustain', 1)).toEqual({ min: 0, max: 2 });
    expect(gapAt(set, 'soft', 5)).toEqual({ min: 0, max: Infinity });
  });
});

describe('neighborBounds', () => {
  it('returns the limits for editing a pedal among its type', () => {
    expect(neighborBounds(set, s1)).toEqual({ min: 0, max: 2 });
    expect(neighborBounds(set, s2)).toEqual({ min: 1, max: Infinity });
    expect(neighborBounds(set, so)).toEqual({ min: 0, max: Infinity });
  });
});
