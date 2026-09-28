import { MAX_PITCH, MIN_PITCH } from '../state/constants.ts';

export const KEY_COUNT = MAX_PITCH - MIN_PITCH + 1;

/** All piano pitches from the top key (C8) to the bottom key (A0). */
export const KEYBOARD_PITCHES: readonly number[] = Array.from(
  { length: KEY_COUNT },
  (_, index) => MAX_PITCH - index,
);

const BLACK_PITCH_CLASSES = new Set([1, 3, 6, 8, 10]);
const PITCH_CLASS_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export function isBlackKey(pitch: number): boolean {
  return BLACK_PITCH_CLASSES.has(pitch % 12);
}

/** Scientific pitch notation with sharps: 60 -> "C4", 61 -> "C#4". */
export function pitchName(pitch: number): string {
  const octave = Math.floor(pitch / 12) - 1;
  return `${PITCH_CLASS_NAMES[pitch % 12]}${octave}`;
}
