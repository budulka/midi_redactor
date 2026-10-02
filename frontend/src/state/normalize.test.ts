import { MIN_PEDAL_DURATION } from './constants.ts';
import {
  clampBpm,
  clampPitch,
  clampVelocity,
  normalizeMediaOffset,
  normalizeNote,
  normalizePedal,
} from './normalize.ts';
import type { Note, PedalEvent } from './types.ts';

describe('clamp helpers', () => {
  it('clamps and rounds pitch', () => {
    expect(clampPitch(10)).toBe(21);
    expect(clampPitch(200)).toBe(108);
    expect(clampPitch(60.6)).toBe(61);
  });

  it('clamps and rounds velocity', () => {
    expect(clampVelocity(0)).toBe(1);
    expect(clampVelocity(300)).toBe(127);
    expect(clampVelocity(99.4)).toBe(99);
  });

  it('clamps bpm', () => {
    expect(clampBpm(5)).toBe(20);
    expect(clampBpm(1000)).toBe(300);
    expect(clampBpm(97.5)).toBe(97.5);
  });
});

describe('normalizeNote', () => {
  it('brings every field into range', () => {
    const note: Note = { id: 'n1', pitch: 120, start: -1, duration: 0, velocity: 0 };
    expect(normalizeNote(note)).toEqual({
      id: 'n1',
      pitch: 108,
      start: 0,
      duration: 0.001,
      velocity: 1,
    });
  });

  it('returns a valid note unchanged', () => {
    const note: Note = Object.freeze({
      id: 'n1',
      pitch: 60,
      start: 0.5,
      duration: 0.25,
      velocity: 100,
    });
    expect(normalizeNote(note)).toBe(note);
  });
});

describe('normalizePedal', () => {
  it('moves the end after the start', () => {
    const pedal: PedalEvent = { id: 'p1', type: 'sustain', start: 2, end: 1 };
    const result = normalizePedal(pedal);
    expect(result.start).toBe(2);
    expect(result.end).toBe(2 + MIN_PEDAL_DURATION);
    expect(result.end).toBeCloseTo(2.001, 12);
  });

  it('clamps a negative start', () => {
    const pedal: PedalEvent = { id: 'p1', type: 'soft', start: -1, end: 1 };
    expect(normalizePedal(pedal)).toEqual({ id: 'p1', type: 'soft', start: 0, end: 1 });
  });

  it('returns a valid pedal unchanged', () => {
    const pedal: PedalEvent = Object.freeze({ id: 'p1', type: 'sustain', start: 0, end: 1.5 });
    expect(normalizePedal(pedal)).toBe(pedal);
  });
});

describe('normalizeMediaOffset', () => {
  it('rounds to the millisecond', () => {
    expect(normalizeMediaOffset(3.2004)).toBe(3.2);
    expect(normalizeMediaOffset(3.2006)).toBe(3.201);
    expect(normalizeMediaOffset(-1.5)).toBe(-1.5);
  });

  it('turns a tiny negative value into a plain zero', () => {
    const result = normalizeMediaOffset(-0.0004);
    expect(result).toBe(0);
    expect(Object.is(result, 0)).toBe(true);
  });

  it('clamps to one hour either way', () => {
    expect(normalizeMediaOffset(5000)).toBe(3600);
    expect(normalizeMediaOffset(-5000)).toBe(-3600);
  });
});
