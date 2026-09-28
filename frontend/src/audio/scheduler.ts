import { firstEventAtOrAfter, type PlaybackEvent } from './playbackEvents.ts';

/**
 * Progress of a lookahead scheduler over a sorted list of playback events.
 * Events with time < scheduledUntil have been handed to the audio engine (or skipped).
 */
export interface ScheduleState {
  /** Index of the next event to consider. */
  readonly cursor: number;
  /** Timeline seconds; events before this time are done. */
  readonly scheduledUntil: number;
  /** Notes that were attacked and not yet released: noteId -> pitch they were attacked with. */
  readonly active: ReadonlyMap<string, number>;
}

export interface AdvanceResult {
  readonly state: ScheduleState;
  /** Events to send to the engine now, in order. */
  readonly due: PlaybackEvent[];
}

export interface ResyncResult {
  readonly state: ScheduleState;
  /** Pitches that must be released right away (unique, ascending). */
  readonly forcedPitches: number[];
}

/** Schedule that starts playback at `from`; notes that started earlier are not played. */
export function startSchedule(events: readonly PlaybackEvent[], from: number): ScheduleState {
  return { cursor: firstEventAtOrAfter(events, from), scheduledUntil: from, active: new Map() };
}

function hasActivePitch(active: ReadonlyMap<string, number>, pitch: number): boolean {
  for (const activePitch of active.values()) {
    if (activePitch === pitch) return true;
  }
  return false;
}

/**
 * Takes every event with time < until, starting at the cursor.
 * - An attack marks its note active and is due.
 * - A release of a note that is not active (it started before playback began) is skipped.
 * - A release of an active note removes it from `active`. It is due only when no other active note
 *   has the same pitch, because the engine stops every voice of a pitch at once: the last
 *   overlapping note of a pitch releases them all.
 * - The pitch of a due release is taken from `active`, not from the event: the due event is
 *   `{ ...event, pitch: activePitch }`, so a voice is always released at the pitch it was attacked
 *   with, even if the events were rebuilt with another pitch.
 * When until <= scheduledUntil the same state and no events are returned. Inputs are not mutated.
 */
export function advanceSchedule(
  state: ScheduleState,
  events: readonly PlaybackEvent[],
  until: number,
): AdvanceResult {
  if (until <= state.scheduledUntil) return { state, due: [] };
  const active = new Map(state.active);
  const due: PlaybackEvent[] = [];
  let cursor = state.cursor;
  while (cursor < events.length && events[cursor].time < until) {
    const event = events[cursor];
    cursor += 1;
    if (event.kind === 'attack') {
      active.set(event.noteId, event.pitch);
      due.push(event);
      continue;
    }
    const activePitch = active.get(event.noteId);
    if (activePitch === undefined) continue;
    active.delete(event.noteId);
    if (!hasActivePitch(active, activePitch)) due.push({ ...event, pitch: activePitch });
  }
  return { state: { cursor, scheduledUntil: until, active }, due };
}

/**
 * Adjusts the schedule after the events were rebuilt during playback (the project changed).
 * The cursor moves to the first new event at or after scheduledUntil. An active note is dropped
 * when it disappeared, its release moved before scheduledUntil, its attack moved to or after
 * scheduledUntil (it will be attacked again), or its pitch changed. Dropped notes are released at
 * the pitch stored in `active`, following the same last-voice-of-a-pitch rule as advanceSchedule.
 * Notes inserted before scheduledUntil are not played. Inputs are not mutated.
 */
export function resyncSchedule(
  state: ScheduleState,
  events: readonly PlaybackEvent[],
): ResyncResult {
  const attacks = new Map<string, PlaybackEvent>();
  const releases = new Map<string, PlaybackEvent>();
  for (const event of events) {
    (event.kind === 'attack' ? attacks : releases).set(event.noteId, event);
  }
  const active = new Map(state.active);
  const dropped = new Set<number>();
  for (const [noteId, pitch] of state.active) {
    const attack = attacks.get(noteId);
    const release = releases.get(noteId);
    const keep =
      attack !== undefined &&
      release !== undefined &&
      release.time >= state.scheduledUntil &&
      attack.time < state.scheduledUntil &&
      attack.pitch === pitch;
    if (keep) continue;
    active.delete(noteId);
    dropped.add(pitch);
  }
  const forcedPitches = [...dropped]
    .filter((pitch) => !hasActivePitch(active, pitch))
    .sort((a, b) => a - b);
  return {
    state: {
      cursor: firstEventAtOrAfter(events, state.scheduledUntil),
      scheduledUntil: state.scheduledUntil,
      active,
    },
    forcedPitches,
  };
}
