import {
  MAX_BPM,
  MAX_MEDIA_OFFSET,
  MAX_PITCH,
  MAX_VELOCITY,
  MIN_BPM,
  MIN_MEDIA_OFFSET,
  MIN_NOTE_DURATION,
  MIN_PEDAL_DURATION,
  MIN_PITCH,
  MIN_VELOCITY,
} from './constants.ts';
import type { Note, PedalEvent } from './types.ts';

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function clampPitch(pitch: number): number {
  return clamp(Math.round(pitch), MIN_PITCH, MAX_PITCH);
}

export function clampVelocity(velocity: number): number {
  return clamp(Math.round(velocity), MIN_VELOCITY, MAX_VELOCITY);
}

export function clampBpm(bpm: number): number {
  return clamp(bpm, MIN_BPM, MAX_BPM);
}

/** Rounds to 1 ms and clamps to MIN/MAX_MEDIA_OFFSET; -0 becomes 0. Expects a finite number. */
export function normalizeMediaOffset(offset: number): number {
  const result = clamp(Math.round(offset * 1000) / 1000, MIN_MEDIA_OFFSET, MAX_MEDIA_OFFSET);
  return result === 0 ? 0 : result;
}

/**
 * Brings note values into the allowed ranges. Expects finite numbers.
 * Returns the same object when nothing has to change.
 */
export function normalizeNote(note: Note): Note {
  const start = Math.max(0, note.start);
  const duration = Math.max(MIN_NOTE_DURATION, note.duration);
  const pitch = clampPitch(note.pitch);
  const velocity = clampVelocity(note.velocity);
  if (
    start === note.start &&
    duration === note.duration &&
    pitch === note.pitch &&
    velocity === note.velocity
  ) {
    return note;
  }
  return { ...note, start, duration, pitch, velocity };
}

/**
 * Brings pedal values into the allowed ranges: start >= 0, end >= start + MIN_PEDAL_DURATION.
 * Expects finite numbers. Returns the same object when nothing has to change.
 */
export function normalizePedal(pedal: PedalEvent): PedalEvent {
  const start = Math.max(0, pedal.start);
  const end = Math.max(start + MIN_PEDAL_DURATION, pedal.end);
  if (start === pedal.start && end === pedal.end) return pedal;
  return { ...pedal, start, end };
}
