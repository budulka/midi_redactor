import { describe, expect, it } from 'vitest';
import { MIN_NOTE_DURATION, MIN_PEDAL_DURATION } from '../state/constants.ts';
import type { Note, PedalEvent, PedalType, Project } from '../state/types.ts';
import { pedalsOverlap } from './pedalIntervals.ts';
import {
  FIRST_BAR_START_SECONDS,
  rescaleNotes,
  rescalePedals,
  rescaleProjectTempo,
  rescaleTime,
  tempoScaleFactor,
} from './tempoRescale.ts';
import { secondsToBarPosition } from './time.ts';

function note(id: string, start: number, duration: number): Note {
  return { id, pitch: 60, start, duration, velocity: 90 };
}

function pedal(id: string, start: number, end: number, type: PedalType = 'sustain'): PedalEvent {
  return { id, type, start, end };
}

function project(overrides: Partial<Project> = {}): Project {
  return {
    bpm: 120,
    timeSignature: { numerator: 4, denominator: 4 },
    mediaOffset: 0,
    mediaCuts: [],
    notes: [],
    pedals: [],
    ...overrides,
  };
}

/** Deterministic pseudo-random numbers in [0, 1) (mulberry32). */
function randomGenerator(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Pedals of every type that do not overlap within a type. The set contains touching pairs
 * (zero gap) and very short pedals (under 15 ms), so compressing it by 1/15 exercises merging.
 */
function randomPedals(count: number, seed: number): PedalEvent[] {
  const random = randomGenerator(seed);
  const types: PedalType[] = ['sustain', 'sostenuto', 'soft'];
  const cursors = new Map<PedalType, number>(types.map((type) => [type, 0]));
  const pedals: PedalEvent[] = [];
  for (let i = 0; i < count; i += 1) {
    const type = types[i % types.length];
    const gapKind = random();
    const gap = gapKind < 0.4 ? 0 : gapKind < 0.6 ? 0.0001 : random();
    const duration = random() < 0.5 ? 0.001 + random() * 0.013 : 0.015 + random() * 2;
    const start = (cursors.get(type) ?? 0) + gap;
    const end = start + duration;
    cursors.set(type, end);
    pedals.push(pedal(`p${i}`, start, end, type));
  }
  return pedals;
}

function expectNoOverlaps(pedals: readonly PedalEvent[]): void {
  for (let i = 0; i < pedals.length; i += 1) {
    for (let j = i + 1; j < pedals.length; j += 1) {
      expect(pedalsOverlap(pedals[i], pedals[j])).toBe(false);
    }
  }
}

describe('tempoScaleFactor', () => {
  it('is the old bpm divided by the new one', () => {
    expect(tempoScaleFactor(120, 60)).toBe(2);
    expect(tempoScaleFactor(120, 240)).toBe(0.5);
    expect(tempoScaleFactor(90, 120)).toBeCloseTo(0.75, 9);
  });

  it('rejects a non-positive or non-finite bpm', () => {
    expect(() => tempoScaleFactor(120, 0)).toThrow(RangeError);
    expect(() => tempoScaleFactor(0, 120)).toThrow(RangeError);
    expect(() => tempoScaleFactor(120, NaN)).toThrow(RangeError);
    expect(() => tempoScaleFactor(120, Infinity)).toThrow(RangeError);
    expect(() => tempoScaleFactor(-5, 120)).toThrow(RangeError);
  });
});

describe('rescaleTime', () => {
  it('scales the distance from the origin', () => {
    expect(FIRST_BAR_START_SECONDS).toBe(0);
    expect(rescaleTime(1.5, 2)).toBe(3);
    expect(rescaleTime(0, 3)).toBe(0);
    expect(rescaleTime(5, 2, 1)).toBe(9);
  });

  it('keeps the origin in place', () => {
    expect(rescaleTime(1, 2, 1)).toBe(1);
  });
});

describe('rescaleNotes', () => {
  it('moves and stretches notes', () => {
    expect(rescaleNotes([note('a', 1, 0.5)], 2)).toEqual([
      { id: 'a', pitch: 60, start: 2, duration: 1, velocity: 90 },
    ]);
  });

  it('moves and compresses notes', () => {
    const [scaled] = rescaleNotes([note('a', 1, 0.5)], 0.5);
    expect(scaled.start).toBe(0.5);
    expect(scaled.duration).toBe(0.25);
  });

  it('keeps the order and the ids', () => {
    const scaled = rescaleNotes([note('x', 2, 1), note('y', 0, 1), note('z', 1, 1)], 2);
    expect(scaled.map((n) => n.id)).toEqual(['x', 'y', 'z']);
    expect(scaled.map((n) => n.start)).toEqual([4, 0, 2]);
  });

  it('returns the same array when there is nothing to do', () => {
    const empty: Note[] = [];
    expect(rescaleNotes(empty, 2)).toBe(empty);
    const notes = [note('a', 1, 0.5)];
    expect(rescaleNotes(notes, 1)).toBe(notes);
  });

  it('keeps the minimum note duration', () => {
    const [scaled] = rescaleNotes([note('a', 1, 0.01)], 1 / 15);
    expect(scaled.duration).toBe(MIN_NOTE_DURATION);
  });

  it('does not mutate the input', () => {
    const notes = [Object.freeze(note('a', 1, 0.5)), Object.freeze(note('b', 2, 1))];
    Object.freeze(notes);
    const copy = structuredClone(notes);
    expect(() => rescaleNotes(notes, 3)).not.toThrow();
    expect(notes).toEqual(copy);
  });
});

describe('rescalePedals', () => {
  it('scales both ends', () => {
    expect(rescalePedals([pedal('a', 1, 2)], 2)).toEqual([pedal('a', 2, 4)]);
    expect(rescalePedals([pedal('a', 1, 2)], 0.5)).toEqual([pedal('a', 0.5, 1)]);
  });

  it('keeps touching pedals touching', () => {
    const [a, b] = rescalePedals([pedal('a', 0, 1), pedal('b', 1, 2)], 120 / 90);
    expect(a.end === b.start).toBe(true);
  });

  it('scales pedals of different types independently', () => {
    const scaled = rescalePedals(
      [
        pedal('s', 0, 0.01, 'sustain'),
        pedal('o', 0, 0.01, 'sostenuto'),
        pedal('f', 0, 0.01, 'soft'),
      ],
      1 / 15,
    );
    expect(scaled.map((p) => p.id)).toEqual(['s', 'o', 'f']);
    for (const p of scaled) {
      expect(p.start).toBe(0);
      expect(p.end).toBe(MIN_PEDAL_DURATION);
    }
  });

  it('merges a pedal that overlaps an earlier one after normalization', () => {
    const scaled = rescalePedals(
      [pedal('a', 0, 0.01), pedal('b', 0.0101, 1), pedal('c', 0.0101, 1, 'soft')],
      1 / 15,
    );
    expect(scaled.map((p) => p.id)).toEqual(['a', 'c']);
    const [a, c] = scaled;
    expect(a.type).toBe('sustain');
    expect(a.start).toBe(0);
    expect(a.end).toBeCloseTo(1 / 15, 9);
    expect(c.type).toBe('soft');
    expect(c.start).toBeCloseTo(0.0101 / 15, 9);
    expect(c.end).toBeCloseTo(1 / 15, 9);
  });

  it('merges a chain of short pedals into the first one', () => {
    const scaled = rescalePedals(
      [pedal('a', 0, 0.01), pedal('b', 0.0101, 0.0201), pedal('c', 0.0202, 1)],
      1 / 15,
    );
    expect(scaled).toHaveLength(1);
    expect(scaled[0].id).toBe('a');
    expect(scaled[0].start).toBe(0);
    expect(scaled[0].end).toBeCloseTo(1 / 15, 9);
  });

  it('does not merge pedals without edge cases', () => {
    const scaled = rescalePedals([pedal('a', 0, 1), pedal('b', 1, 2), pedal('c', 3, 4)], 1 / 15);
    expect(scaled).toHaveLength(3);
  });

  it('keeps the input order', () => {
    const scaled = rescalePedals([pedal('late', 2, 3), pedal('early', 0, 1)], 2);
    expect(scaled.map((p) => p.id)).toEqual(['late', 'early']);
  });

  it('returns the same array when there is nothing to do', () => {
    const empty: PedalEvent[] = [];
    expect(rescalePedals(empty, 2)).toBe(empty);
    const pedals = [pedal('a', 1, 2)];
    expect(rescalePedals(pedals, 1)).toBe(pedals);
  });

  it('never leaves overlapping pedals of one type', () => {
    const pedals = randomPedals(50, 13);
    expectNoOverlaps(pedals);
    expect(pedals.some((p) => p.end - p.start < 0.015)).toBe(true);
    expect(pedals.some((p, i) => pedals.some((q, j) => i !== j && p.end === q.start))).toBe(true);

    const compressed = rescalePedals(pedals, 20 / 300);
    expectNoOverlaps(compressed);
    // The generator makes the merge branch run, not only the trivial case.
    expect(compressed.length).toBeLessThan(pedals.length);
    for (const p of compressed) {
      expect(p.end - p.start).toBeGreaterThanOrEqual(MIN_PEDAL_DURATION - 1e-12);
    }

    const stretched = rescalePedals(pedals, 300 / 20);
    expectNoOverlaps(stretched);
    expect(stretched).toHaveLength(pedals.length);
  });
});

describe('rescaleProjectTempo', () => {
  const fourFour = { numerator: 4, denominator: 4 };

  it('keeps notes and pedals on their bars and beats', () => {
    const before = project({
      notes: [note('a', 2, 0.5), note('b', 2.75, 0.25)],
      pedals: [pedal('p', 2, 3)],
    });
    const after = rescaleProjectTempo(before, 60);
    expect(after.bpm).toBe(60);
    expect(after.notes.map((n) => n.start)).toEqual([4, 5.5]);
    expect(after.pedals).toEqual([pedal('p', 4, 6)]);
    before.notes.forEach((n, i) => {
      const was = secondsToBarPosition(n.start, 120, fourFour);
      const is = secondsToBarPosition(after.notes[i].start, 60, fourFour);
      expect(is.bar).toBe(was.bar);
      expect(is.beat).toBe(was.beat);
      expect(is.fraction).toBeCloseTo(was.fraction, 9);
    });
  });

  it('keeps bars and beats at 90 bpm in 6/8', () => {
    const sixEight = { numerator: 6, denominator: 8 };
    const before = project({
      timeSignature: sixEight,
      notes: [note('a', 2, 0.5), note('b', 2.75, 0.25), note('c', 3.1, 1)],
    });
    const after = rescaleProjectTempo(before, 90);
    before.notes.forEach((n, i) => {
      const was = secondsToBarPosition(n.start, 120, sixEight);
      const is = secondsToBarPosition(after.notes[i].start, 90, sixEight);
      expect(is.bar).toBe(was.bar);
      expect(is.beat).toBe(was.beat);
      expect(is.fraction).toBeCloseTo(was.fraction, 9);
    });
  });

  it('makes 20 and 300 bpm sound different', () => {
    const before = project({ notes: [note('a', 2, 0.5)] });
    expect(rescaleProjectTempo(before, 20).notes[0].start).toBeCloseTo(12, 9);
    expect(rescaleProjectTempo(before, 300).notes[0].start).toBeCloseTo(0.8, 9);
  });

  it('returns the same project for the same bpm', () => {
    const before = project({ notes: [note('a', 2, 0.5)] });
    expect(rescaleProjectTempo(before, 120)).toBe(before);
  });

  it('keeps the time signature and empty lists', () => {
    const before = project();
    const after = rescaleProjectTempo(before, 60);
    expect(after.bpm).toBe(60);
    expect(after.timeSignature).toBe(before.timeSignature);
    expect(after.notes).toBe(before.notes);
    expect(after.pedals).toBe(before.pedals);
  });

  it('comes back to the same seconds after a round trip', () => {
    const before = project({
      notes: [note('a', 1.3, 0.7), note('b', 2.75, 0.25)],
      pedals: [pedal('p', 0.4, 3.3)],
    });
    const back = rescaleProjectTempo(rescaleProjectTempo(before, 97.5), 120);
    back.notes.forEach((n, i) => {
      expect(n.start).toBeCloseTo(before.notes[i].start, 9);
      expect(n.duration).toBeCloseTo(before.notes[i].duration, 9);
    });
    expect(back.pedals[0].start).toBeCloseTo(0.4, 9);
    expect(back.pedals[0].end).toBeCloseTo(3.3, 9);
  });
});

describe('rescaleProjectTempo and the media offset', () => {
  it('keeps the media offset', () => {
    expect(rescaleProjectTempo(project({ mediaOffset: 3.2 }), 60).mediaOffset).toBe(3.2);
  });
});
