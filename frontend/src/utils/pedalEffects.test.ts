import type { Note, PedalEvent } from '../state/types.ts';
import { noteSoundingEnds } from './pedalEffects.ts';

function note(id: string, pitch: number, start: number, end: number): Note {
  return { id, pitch, start, duration: end - start, velocity: 100 };
}

function pedal(type: PedalEvent['type'], start: number, end: number, id = `${type}-${start}`) {
  return { id, type, start, end } satisfies PedalEvent;
}

const n = note('n', 60, 0, 0.5);

function endOf(target: Note, pedals: PedalEvent[]): number | undefined {
  return noteSoundingEnds([target], pedals).get(target.id);
}

describe('noteSoundingEnds', () => {
  it('uses the note end without pedals', () => {
    const notes = [n, note('m', 64, 1, 1.25)];
    expect(noteSoundingEnds(notes, [])).toEqual(
      new Map([
        ['n', 0.5],
        ['m', 1.25],
      ]),
    );
    expect(noteSoundingEnds([], [pedal('sustain', 0, 1)]).size).toBe(0);
  });

  it('extends a note released while sustain is pressed', () => {
    expect(endOf(n, [pedal('sustain', 0.25, 2)])).toBe(2);
    expect(endOf(n, [pedal('sustain', 0.5, 2)])).toBe(2);
    expect(endOf(n, [pedal('sustain', 0, 0.5)])).toBe(0.5);
    expect(endOf(n, [pedal('sustain', 1, 2)])).toBe(0.5);
  });

  it('does not chain through a touching sustain pedal', () => {
    expect(endOf(n, [pedal('sustain', 0.25, 1), pedal('sustain', 1, 3)])).toBe(1);
  });

  it('stops the sound when the same key is struck again', () => {
    const a = note('a', 60, 0, 0.5);
    const b = note('b', 60, 1, 1.5);
    const d = note('d', 62, 0.8, 1);
    const ends = noteSoundingEnds([a, b, d], [pedal('sustain', 0, 3)]);
    expect(ends.get('a')).toBe(1);
    expect(ends.get('b')).toBe(3);
    expect(ends.get('d')).toBe(3);
  });

  it('never ends a note before its key is released', () => {
    const first = note('first', 60, 0, 1);
    const second = note('second', 60, 0.5, 1);
    expect(noteSoundingEnds([first, second], []).get('first')).toBe(1);
  });

  it('holds notes whose keys are down when sostenuto is pressed', () => {
    const sostenuto = pedal('sostenuto', 0.5, 3);
    expect(endOf(note('x', 60, 0, 1), [sostenuto])).toBe(3);
    expect(endOf(note('x', 60, 0.6, 0.8), [sostenuto])).toBe(0.8);
    expect(endOf(note('x', 60, 0, 0.4), [sostenuto])).toBe(0.4);
    expect(endOf(note('x', 60, 0.5, 1), [sostenuto])).toBe(3);
  });

  it('applies sustain after sostenuto', () => {
    expect(endOf(note('x', 60, 0, 1), [pedal('sostenuto', 0.5, 2), pedal('sustain', 1.5, 4)])).toBe(
      4,
    );
  });

  it('ignores the soft pedal', () => {
    expect(endOf(n, [pedal('soft', 0, 5)])).toBe(0.5);
  });
});
