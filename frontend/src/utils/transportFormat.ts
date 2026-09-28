import type { TimeSignature } from '../state/types.ts';
import { secondsToBarPosition } from './time.ts';

/** Keeps values like 2.4999999999 (clock arithmetic) from being floored a millisecond short. */
const MS_EPSILON = 1e-6;

/** Clock time `m:ss.mmm`; milliseconds are floored, so 59.9996 s is 0:59.999, never 0:60.000. */
export function formatClock(seconds: number): string {
  const totalMs = Math.floor(Math.max(0, seconds) * 1000 + MS_EPSILON);
  const minutes = Math.floor(totalMs / 60000);
  const secs = Math.floor((totalMs % 60000) / 1000);
  const ms = totalMs % 1000;
  return `${minutes}:${String(secs).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
}

/** Musical position `bar.beat`, both 1-based. */
export function formatBarBeat(seconds: number, bpm: number, ts: TimeSignature): string {
  const { bar, beat } = secondsToBarPosition(Math.max(0, seconds), bpm, ts);
  return `${bar}.${beat}`;
}

/** Media position `m:ss.mmm / m:ss.mmm` (current time and duration). */
export function formatMediaPosition(current: number, duration: number): string {
  return `${formatClock(current)} / ${formatClock(duration)}`;
}
