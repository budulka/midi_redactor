import type { Note, PedalEvent } from '../state/types.ts';
import { buildPlaybackEvents, type PlaybackEvent } from './playbackEvents.ts';
import { advanceSchedule, resyncSchedule, startSchedule, type ScheduleState } from './scheduler.ts';

function attack(noteId: string, time: number, pitch: number, velocity = 100): PlaybackEvent {
  return { time, kind: 'attack', noteId, pitch, velocity };
}

function release(noteId: string, time: number, pitch: number): PlaybackEvent {
  return { time, kind: 'release', noteId, pitch, velocity: 0 };
}

function freezeEvents(events: PlaybackEvent[]): readonly PlaybackEvent[] {
  events.forEach((event) => Object.freeze(event));
  return Object.freeze(events);
}

function activeOf(state: ScheduleState): Record<string, number> {
  return Object.fromEntries(state.active);
}

function summary(events: readonly PlaybackEvent[]) {
  return events.map((event) => [event.kind, event.noteId, event.time, event.pitch]);
}

const E = freezeEvents([
  attack('a', 0, 60),
  attack('b', 0.5, 64),
  release('a', 1, 60),
  release('b', 2, 64),
]);

function stateAt15(): ScheduleState {
  const first = advanceSchedule(startSchedule(E, 0), E, 0.5).state;
  return advanceSchedule(first, E, 1.5).state;
}

describe('startSchedule', () => {
  it('starts at the first event at or after the position', () => {
    const start = startSchedule(E, 0);
    expect(start.cursor).toBe(0);
    expect(start.scheduledUntil).toBe(0);
    expect(start.active.size).toBe(0);
    expect(startSchedule(E, 0.5).cursor).toBe(1);
    expect(startSchedule(E, 0.6).cursor).toBe(2);
  });
});

describe('advanceSchedule', () => {
  it('takes the events before the window end', () => {
    const { state, due } = advanceSchedule(startSchedule(E, 0), E, 0.5);
    expect(summary(due)).toEqual([['attack', 'a', 0, 60]]);
    expect(activeOf(state)).toEqual({ a: 60 });
    expect(state.cursor).toBe(1);
    expect(state.scheduledUntil).toBe(0.5);

    const next = advanceSchedule(state, E, 1.5);
    expect(summary(next.due)).toEqual([
      ['attack', 'b', 0.5, 64],
      ['release', 'a', 1, 60],
    ]);
    expect(activeOf(next.state)).toEqual({ b: 64 });

    const again = advanceSchedule(next.state, E, 1.5);
    expect(again.state).toBe(next.state);
    expect(again.due).toEqual([]);
  });

  it('skips releases of notes that started before playback', () => {
    const { due } = advanceSchedule(startSchedule(E, 0.6), E, 3);
    expect(due).toEqual([]);
  });

  it('releases overlapping notes of one pitch once, with the last one', () => {
    const E2 = freezeEvents([
      attack('a', 0, 60),
      attack('b', 0.5, 60),
      release('a', 1, 60),
      release('b', 1.5, 60),
    ]);
    const all = advanceSchedule(startSchedule(E2, 0), E2, 3);
    expect(summary(all.due)).toEqual([
      ['attack', 'a', 0, 60],
      ['attack', 'b', 0.5, 60],
      ['release', 'b', 1.5, 60],
    ]);
    expect(activeOf(all.state)).toEqual({});

    const partial = advanceSchedule(startSchedule(E2, 0), E2, 1.2);
    expect(partial.due.some((event) => event.kind === 'release')).toBe(false);
    expect(activeOf(partial.state)).toEqual({ b: 60 });
  });

  it('releases overlapping notes under the sustain pedal once, at the pedal end', () => {
    const notes: Note[] = [
      { id: 'a', pitch: 60, start: 0, duration: 0.3, velocity: 100 },
      { id: 'b', pitch: 60, start: 0.2, duration: 0.3, velocity: 100 },
    ];
    const pedals: PedalEvent[] = [{ id: 's', type: 'sustain', start: 0, end: 3 }];
    const events = buildPlaybackEvents(notes, pedals);
    const releases = advanceSchedule(startSchedule(events, 0), events, 4).due.filter(
      (event) => event.kind === 'release',
    );
    expect(summary(releases)).toEqual([['release', 'b', 3, 60]]);
  });

  it('releases the pitch stored in active', () => {
    const state: ScheduleState = { cursor: 0, scheduledUntil: 0, active: new Map([['x', 64]]) };
    const events = freezeEvents([release('x', 1, 65)]);
    const { due } = advanceSchedule(state, events, 2);
    expect(summary(due)).toEqual([['release', 'x', 1, 64]]);
  });

  it('does not mutate its inputs', () => {
    const start = Object.freeze(startSchedule(E, 0));
    advanceSchedule(start, E, 3);
    expect(start.active.size).toBe(0);
    expect(start.cursor).toBe(0);
  });
});

describe('resyncSchedule', () => {
  it('releases a note that disappeared', () => {
    const events = freezeEvents([attack('a', 0, 60), release('a', 1, 60)]);
    const { state, forcedPitches } = resyncSchedule(stateAt15(), events);
    expect(forcedPitches).toEqual([64]);
    expect(activeOf(state)).toEqual({});
    expect(state.cursor).toBe(2);
    expect(state.scheduledUntil).toBe(1.5);
  });

  it('keeps a note whose release moved later', () => {
    const events = freezeEvents([
      attack('a', 0, 60),
      attack('b', 0.5, 64),
      release('a', 1, 60),
      release('b', 3, 64),
    ]);
    const { state, forcedPitches } = resyncSchedule(stateAt15(), events);
    expect(forcedPitches).toEqual([]);
    expect(activeOf(state)).toEqual({ b: 64 });
    expect(summary(advanceSchedule(state, events, 4).due)).toEqual([['release', 'b', 3, 64]]);
  });

  it('releases a note shortened into the scheduled range', () => {
    const events = freezeEvents([
      attack('a', 0, 60),
      attack('b', 0.5, 64),
      release('a', 1, 60),
      release('b', 1.2, 64),
    ]);
    expect(resyncSchedule(stateAt15(), events).forcedPitches).toEqual([64]);
  });

  it('releases a note moved later and attacks it again in time', () => {
    const events = freezeEvents([
      attack('a', 0, 60),
      release('a', 1, 60),
      attack('b', 2, 64),
      release('b', 3, 64),
    ]);
    const { state, forcedPitches } = resyncSchedule(stateAt15(), events);
    expect(forcedPitches).toEqual([64]);
    expect(summary(advanceSchedule(state, events, 4).due)).toEqual([
      ['attack', 'b', 2, 64],
      ['release', 'b', 3, 64],
    ]);
  });

  it('does not play a note inserted behind the window', () => {
    const events = freezeEvents([
      attack('a', 0, 60),
      attack('b', 0.5, 64),
      attack('c', 1, 62),
      release('a', 1, 60),
      release('c', 1.8, 62),
      release('b', 2, 64),
    ]);
    const { state, forcedPitches } = resyncSchedule(stateAt15(), events);
    expect(forcedPitches).toEqual([]);
    const { due } = advanceSchedule(state, events, 2);
    expect(due.some((event) => event.noteId === 'c')).toBe(false);
  });

  it('releases the old pitch of a note whose pitch changed', () => {
    const events = freezeEvents([
      attack('a', 0, 60),
      attack('b', 0.5, 65),
      release('a', 1, 60),
      release('b', 2, 65),
    ]);
    const { state, forcedPitches } = resyncSchedule(stateAt15(), events);
    expect(forcedPitches).toEqual([64]);
    expect(activeOf(state)).toEqual({});
    expect(advanceSchedule(state, events, 3).due).toEqual([]);
  });

  it('moves a note onto the pitch of another active note without cutting it', () => {
    const before = freezeEvents([
      attack('b', 0, 64),
      attack('x', 0.2, 65),
      release('b', 2, 64),
      release('x', 2.5, 65),
    ]);
    const running = advanceSchedule(startSchedule(before, 0), before, 1).state;
    expect(activeOf(running)).toEqual({ b: 64, x: 65 });

    const after = freezeEvents([
      attack('b', 0, 65),
      attack('x', 0.2, 65),
      release('b', 2, 65),
      release('x', 2.5, 65),
    ]);
    const { state, forcedPitches } = resyncSchedule(running, after);
    expect(forcedPitches).toEqual([64]);
    expect(activeOf(state)).toEqual({ x: 65 });
    expect(summary(advanceSchedule(state, after, 3).due)).toEqual([['release', 'x', 2.5, 65]]);
  });

  it('does not release a pitch while another note of it is still active', () => {
    const E2 = freezeEvents([
      attack('a', 0, 60),
      attack('b', 0.5, 60),
      release('a', 1, 60),
      release('b', 1.5, 60),
    ]);
    const running = advanceSchedule(startSchedule(E2, 0), E2, 0.8).state;
    expect(activeOf(running)).toEqual({ a: 60, b: 60 });

    const withoutA = freezeEvents([attack('b', 0.5, 60), release('b', 1.5, 60)]);
    const resynced = resyncSchedule(running, withoutA);
    expect(resynced.forcedPitches).toEqual([]);
    expect(activeOf(resynced.state)).toEqual({ b: 60 });
    expect(summary(advanceSchedule(resynced.state, withoutA, 3).due)).toEqual([
      ['release', 'b', 1.5, 60],
    ]);

    expect(resyncSchedule(running, freezeEvents([])).forcedPitches).toEqual([60]);
  });

  it('does not mutate its inputs', () => {
    const running = Object.freeze(stateAt15());
    resyncSchedule(running, freezeEvents([]));
    expect(activeOf(running)).toEqual({ b: 64 });
  });
});
