import type { TimeSignature } from '../state/types.ts';

/** Tolerance used before flooring, so that 2.9999999 is treated as 3. */
export const TIME_EPSILON = 1e-9;

export interface BarPosition {
  /** 1-based bar number. */
  readonly bar: number;
  /** 1-based beat within the bar (beat = one denominator unit). */
  readonly beat: number;
  /** Position inside the beat, in [0, 1). */
  readonly fraction: number;
}

function assertPositiveBpm(bpm: number): void {
  if (!(bpm > 0) || !Number.isFinite(bpm)) {
    throw new RangeError(`bpm must be a positive finite number, got ${bpm}`);
  }
}

/** Duration of a quarter note in seconds (bpm is quarter notes per minute). */
export function secondsPerQuarter(bpm: number): number {
  assertPositiveBpm(bpm);
  return 60 / bpm;
}

export function secondsToQuarters(seconds: number, bpm: number): number {
  return seconds / secondsPerQuarter(bpm);
}

export function quartersToSeconds(quarters: number, bpm: number): number {
  return quarters * secondsPerQuarter(bpm);
}

/** Duration of one beat, where a beat is one unit of the time signature denominator. */
export function beatDurationSeconds(bpm: number, ts: TimeSignature): number {
  return (secondsPerQuarter(bpm) * 4) / ts.denominator;
}

export function barDurationSeconds(bpm: number, ts: TimeSignature): number {
  return beatDurationSeconds(bpm, ts) * ts.numerator;
}

export function secondsToBarPosition(seconds: number, bpm: number, ts: TimeSignature): BarPosition {
  if (!(seconds >= 0)) {
    throw new RangeError(`time must be non-negative, got ${seconds}`);
  }
  const totalBeats = seconds / beatDurationSeconds(bpm, ts);
  const beatIndex = Math.floor(totalBeats + TIME_EPSILON);
  const fraction = Math.max(0, totalBeats - beatIndex);
  return {
    bar: Math.floor(beatIndex / ts.numerator) + 1,
    beat: (beatIndex % ts.numerator) + 1,
    fraction,
  };
}

export function barPositionToSeconds(pos: BarPosition, bpm: number, ts: TimeSignature): number {
  const totalBeats = (pos.bar - 1) * ts.numerator + (pos.beat - 1) + pos.fraction;
  return totalBeats * beatDurationSeconds(bpm, ts);
}
