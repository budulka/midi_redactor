import type { Note } from '../state/types.ts';
import { GRID_DIVISIONS, gridStepSeconds, quantizeNote, snapToGrid } from './quantize.ts';

describe('gridStepSeconds', () => {
  it('computes straight and triplet steps', () => {
    expect(gridStepSeconds('1/4', 120)).toBe(0.5);
    expect(gridStepSeconds('1/16', 120)).toBe(0.125);
    expect(gridStepSeconds('1/1', 60)).toBe(4);
    expect(gridStepSeconds('1/8T', 120)).toBeCloseTo(1 / 6, 12);
    expect(gridStepSeconds('1/16T', 120)).toBeCloseTo(1 / 12, 12);
  });

  it('gives a positive step for every division', () => {
    expect(GRID_DIVISIONS).toHaveLength(9);
    expect(new Set(GRID_DIVISIONS)).toEqual(
      new Set(['1/1', '1/2', '1/4', '1/8', '1/16', '1/32', '1/4T', '1/8T', '1/16T']),
    );
    for (const division of GRID_DIVISIONS) {
      const step = gridStepSeconds(division, 120);
      expect(step).toBeGreaterThan(0);
      expect(Number.isFinite(step)).toBe(true);
    }
  });
});

describe('snapToGrid', () => {
  it('snaps to the nearest line by default', () => {
    expect(snapToGrid(0.26, 0.125)).toBeCloseTo(0.25, 12);
    expect(snapToGrid(0.19, 0.125)).toBeCloseTo(0.25, 12);
    expect(snapToGrid(0.05, 0.125)).toBe(0);
  });

  it('supports floor and ceil modes', () => {
    expect(snapToGrid(0.26, 0.125, 'floor')).toBeCloseTo(0.25, 12);
    expect(snapToGrid(0.26, 0.125, 'ceil')).toBeCloseTo(0.375, 12);
  });

  it('tolerates floating point error at grid lines', () => {
    // 0.3 / 0.1 === 2.9999999999999996 in IEEE-754.
    expect(0.3 / 0.1).toBeLessThan(3);
    expect(snapToGrid(0.3, 0.1, 'floor')).toBeCloseTo(0.3, 12);
    expect(snapToGrid(0.3, 0.1, 'ceil')).toBeCloseTo(0.3, 12);
  });

  it('never returns a negative time', () => {
    for (const mode of ['nearest', 'floor', 'ceil'] as const) {
      expect(snapToGrid(-0.3, 0.125, mode)).toBeGreaterThanOrEqual(0);
    }
  });

  it('rejects a non-positive step', () => {
    expect(() => snapToGrid(1, 0)).toThrow(RangeError);
    expect(() => snapToGrid(1, -0.5)).toThrow(RangeError);
    expect(() => snapToGrid(1, Number.NaN)).toThrow(RangeError);
  });
});

describe('quantizeNote', () => {
  const base: Note = { id: 'n1', pitch: 64, start: 0.26, duration: 0.2, velocity: 90 };

  it('snaps start and end to the nearest grid lines', () => {
    const result = quantizeNote(base, 0.125);
    expect(result.start).toBeCloseTo(0.25, 12);
    expect(result.duration).toBeCloseTo(0.25, 12);
  });

  it('keeps at least one grid step of duration', () => {
    const result = quantizeNote({ ...base, duration: 0.01 }, 0.125);
    expect(result.duration).toBe(0.125);
  });

  it('keeps other fields and does not mutate the input', () => {
    const input = Object.freeze({ ...base });
    const result = quantizeNote(input, 0.125);
    expect(result).not.toBe(input);
    expect(result.id).toBe('n1');
    expect(result.pitch).toBe(64);
    expect(result.velocity).toBe(90);
    expect(input).toEqual(base);
  });
});
