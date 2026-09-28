import type { Note, PedalEvent, PedalType } from '../state/types.ts';
import {
  buildPlaybackEvents,
  firstEventAtOrAfter,
  playbackVelocity,
  type PlaybackEvent,
} from './playbackEvents.ts';

function note(id: string, pitch: number, start: number, end: number, velocity = 100): Note {
  return { id, pitch, start, duration: end - start, velocity };
}

function pedal(type: PedalType, start: number, end: number): PedalEvent {
  return { id: `${type}-${start}`, type, start, end };
}

function summary(events: readonly PlaybackEvent[]) {
  return events.map((event) => [event.kind, event.noteId, event.time]);
}

const a = note('a', 60, 0, 0.5, 100);
const b = note('b', 60, 1, 1.5, 64);

describe('playbackVelocity', () => {
  it('scales the velocity down under the soft pedal', () => {
    expect(playbackVelocity(100, true)).toBe(70);
    expect(playbackVelocity(1, true)).toBe(1);
    expect(playbackVelocity(127, false)).toBe(127);
    expect(playbackVelocity(2, true)).toBe(1);
  });
});

describe('buildPlaybackEvents', () => {
  it('returns no events without notes', () => {
    expect(buildPlaybackEvents([], [])).toEqual([]);
  });

  it('attacks a note at its start and releases it at its end', () => {
    expect(buildPlaybackEvents([a], [])).toEqual([
      { time: 0, kind: 'attack', noteId: 'a', pitch: 60, velocity: 100 },
      { time: 0.5, kind: 'release', noteId: 'a', pitch: 60, velocity: 0 },
    ]);
  });

  it('releases a note at the end of the sustain pedal', () => {
    const events = buildPlaybackEvents([a], [pedal('sustain', 0.25, 2)]);
    expect(events[1]).toMatchObject({ kind: 'release', noteId: 'a', time: 2 });
  });

  it('puts a release before an attack at the same time', () => {
    const expected = [
      ['attack', 'a', 0],
      ['release', 'a', 1],
      ['attack', 'b', 1],
      ['release', 'b', 3],
    ];
    const sustain = [pedal('sustain', 0.25, 3)];
    expect(summary(buildPlaybackEvents([a, b], sustain))).toEqual(expected);
    expect(summary(buildPlaybackEvents([b, a], sustain))).toEqual(expected);
  });

  it('orders simultaneous events by pitch', () => {
    const e4 = note('e4', 64, 0, 1);
    const c4 = note('c4', 60, 0, 1);
    expect(summary(buildPlaybackEvents([e4, c4], []))).toEqual([
      ['attack', 'c4', 0],
      ['attack', 'e4', 0],
      ['release', 'c4', 1],
      ['release', 'e4', 1],
    ]);
  });

  it('lowers the velocity of notes struck under the soft pedal', () => {
    const events = buildPlaybackEvents([a, b], [pedal('soft', 0.9, 2)]);
    const attacks = events.filter((event) => event.kind === 'attack');
    expect(attacks.find((event) => event.noteId === 'b')?.velocity).toBe(45);
    expect(attacks.find((event) => event.noteId === 'a')?.velocity).toBe(100);
  });

  it('does not lower the velocity at the soft pedal end', () => {
    const events = buildPlaybackEvents([note('n', 60, 1, 2, 100)], [pedal('soft', 0, 1)]);
    expect(events[0].velocity).toBe(100);
  });

  it('holds a note with the sostenuto pedal', () => {
    const events = buildPlaybackEvents([note('n', 60, 0, 1)], [pedal('sostenuto', 0.5, 3)]);
    expect(events[1]).toMatchObject({ kind: 'release', time: 3 });
  });
});

describe('firstEventAtOrAfter', () => {
  it('finds the first event at or after a time', () => {
    const events = buildPlaybackEvents([a, b], [pedal('sustain', 0.25, 3)]);
    expect(firstEventAtOrAfter(events, 1)).toBe(1);
    expect(firstEventAtOrAfter(events, 0)).toBe(0);
    expect(firstEventAtOrAfter(events, 5)).toBe(4);
  });
});
