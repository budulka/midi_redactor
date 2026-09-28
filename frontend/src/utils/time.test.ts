import type { TimeSignature } from '../state/types.ts';
import {
  barDurationSeconds,
  barPositionToSeconds,
  beatDurationSeconds,
  quartersToSeconds,
  secondsPerQuarter,
  secondsToBarPosition,
  secondsToQuarters,
} from './time.ts';

const FOUR_FOUR: TimeSignature = { numerator: 4, denominator: 4 };
const THREE_FOUR: TimeSignature = { numerator: 3, denominator: 4 };
const SIX_EIGHT: TimeSignature = { numerator: 6, denominator: 8 };
const TWO_TWO: TimeSignature = { numerator: 2, denominator: 2 };

describe('quarter conversions', () => {
  it('converts between seconds and quarters', () => {
    expect(secondsPerQuarter(120)).toBe(0.5);
    expect(secondsToQuarters(1.5, 120)).toBe(3);
    expect(quartersToSeconds(3, 120)).toBe(1.5);
  });

  it('rejects non-positive or non-finite bpm', () => {
    expect(() => secondsPerQuarter(0)).toThrow(RangeError);
    expect(() => secondsPerQuarter(-60)).toThrow(RangeError);
    expect(() => secondsPerQuarter(Number.NaN)).toThrow(RangeError);
    expect(() => secondsPerQuarter(Infinity)).toThrow(RangeError);
  });
});

describe('beat and bar durations', () => {
  it('uses the denominator unit as the beat', () => {
    expect(beatDurationSeconds(120, FOUR_FOUR)).toBe(0.5);
    expect(beatDurationSeconds(120, SIX_EIGHT)).toBe(0.25);
    expect(beatDurationSeconds(120, TWO_TWO)).toBe(1);
  });

  it('multiplies the beat by the numerator for a bar', () => {
    expect(barDurationSeconds(120, FOUR_FOUR)).toBe(2);
    expect(barDurationSeconds(120, THREE_FOUR)).toBe(1.5);
    expect(barDurationSeconds(120, SIX_EIGHT)).toBe(1.5);
  });
});

describe('secondsToBarPosition', () => {
  it('returns 1-based bar and beat positions', () => {
    expect(secondsToBarPosition(0, 120, FOUR_FOUR)).toEqual({ bar: 1, beat: 1, fraction: 0 });
    expect(secondsToBarPosition(2.75, 120, FOUR_FOUR)).toEqual({ bar: 2, beat: 2, fraction: 0.5 });
    expect(secondsToBarPosition(1.5, 120, THREE_FOUR)).toEqual({ bar: 2, beat: 1, fraction: 0 });
  });

  it('absorbs floating point error just below a beat boundary', () => {
    // 0.7 / 0.1 === 6.999999999999999 in IEEE-754.
    expect(0.7 / beatDurationSeconds(600, FOUR_FOUR)).toBeLessThan(7);
    const pos = secondsToBarPosition(0.7, 600, FOUR_FOUR);
    expect(pos.bar).toBe(2);
    expect(pos.beat).toBe(4);
    expect(pos.fraction).toBe(0);

    expect(secondsToBarPosition(2.9999999999, 60, FOUR_FOUR)).toEqual({
      bar: 1,
      beat: 4,
      fraction: 0,
    });
  });

  it('keeps fraction in [0, 1)', () => {
    for (const seconds of [0, 0.1, 0.7, 1.3, 2.9999999999, 3, 7.77, 100.01]) {
      const { fraction } = secondsToBarPosition(seconds, 600, SIX_EIGHT);
      expect(fraction).toBeGreaterThanOrEqual(0);
      expect(fraction).toBeLessThan(1);
    }
  });

  it('rejects negative time', () => {
    expect(() => secondsToBarPosition(-0.01, 120, FOUR_FOUR)).toThrow(RangeError);
    expect(() => secondsToBarPosition(Number.NaN, 120, FOUR_FOUR)).toThrow(RangeError);
  });
});

describe('barPositionToSeconds', () => {
  it.each([
    [0, 120, FOUR_FOUR],
    [2.75, 120, FOUR_FOUR],
    [1.5, 120, THREE_FOUR],
    [3.3, 97, SIX_EIGHT],
    [12.345, 60, TWO_TWO],
    [0.7, 600, FOUR_FOUR],
  ])('inverts secondsToBarPosition for %s s at %s bpm', (seconds, bpm, ts) => {
    const pos = secondsToBarPosition(seconds, bpm, ts);
    expect(barPositionToSeconds(pos, bpm, ts)).toBeCloseTo(seconds, 9);
  });
});
