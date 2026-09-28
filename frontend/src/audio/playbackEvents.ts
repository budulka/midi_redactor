import type { Note, PedalEvent } from '../state/types.ts';
import { noteSoundingEnds } from '../utils/pedalEffects.ts';
import { pedalsOfType, pressedPedalIn } from '../utils/pedalIntervals.ts';

export type PlaybackEventKind = 'attack' | 'release';

export interface PlaybackEvent {
  /** Timeline seconds. */
  readonly time: number;
  readonly kind: PlaybackEventKind;
  readonly noteId: string;
  readonly pitch: number;
  /** Effective playback velocity for an attack; 0 for a release. */
  readonly velocity: number;
}

/** The soft pedal (una corda) makes notes struck while it is down this much quieter (about -3 dB). */
export const SOFT_PEDAL_VELOCITY_FACTOR = 0.7;

/** Velocity a note is played with; the soft pedal scales it down but never below 1. */
export function playbackVelocity(velocity: number, softPressed: boolean): number {
  return softPressed ? Math.max(1, Math.round(velocity * SOFT_PEDAL_VELOCITY_FACTOR)) : velocity;
}

function compareEvents(a: PlaybackEvent, b: PlaybackEvent): number {
  if (a.time !== b.time) return a.time - b.time;
  if (a.kind !== b.kind) return a.kind === 'release' ? -1 : 1;
  if (a.pitch !== b.pitch) return a.pitch - b.pitch;
  return a.noteId < b.noteId ? -1 : a.noteId > b.noteId ? 1 : 0;
}

/**
 * Attack and release events of all notes, sorted by time. A note is released when it stops
 * sounding (see noteSoundingEnds), so sustain and sostenuto lengthen it; the soft pedal pressed at
 * the attack lowers its velocity. At equal times releases come before attacks (a repeated key must
 * not silence the new note), and events of one kind are ordered by pitch.
 */
export function buildPlaybackEvents(
  notes: readonly Note[],
  pedals: readonly PedalEvent[],
): readonly PlaybackEvent[] {
  const ends = noteSoundingEnds(notes, pedals);
  const soft = pedalsOfType(pedals, 'soft');
  const events: PlaybackEvent[] = [];
  for (const note of notes) {
    const softPressed = pressedPedalIn(soft, note.start) !== null;
    events.push({
      time: note.start,
      kind: 'attack',
      noteId: note.id,
      pitch: note.pitch,
      velocity: playbackVelocity(note.velocity, softPressed),
    });
    events.push({
      time: ends.get(note.id) ?? note.start + note.duration,
      kind: 'release',
      noteId: note.id,
      pitch: note.pitch,
      velocity: 0,
    });
  }
  return events.sort(compareEvents);
}

/** Index of the first event with time >= the given time, or events.length (binary search). */
export function firstEventAtOrAfter(events: readonly PlaybackEvent[], time: number): number {
  let low = 0;
  let high = events.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (events[middle].time < time) low = middle + 1;
    else high = middle;
  }
  return low;
}
