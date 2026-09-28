import type { Note } from '../state/types.ts';
import { TIME_EPSILON, secondsPerQuarter } from './time.ts';

export type GridDivision =
  '1/1' | '1/2' | '1/4' | '1/8' | '1/16' | '1/32' | '1/4T' | '1/8T' | '1/16T';

export const GRID_DIVISIONS: readonly GridDivision[] = [
  '1/1',
  '1/2',
  '1/4',
  '1/8',
  '1/16',
  '1/32',
  '1/4T',
  '1/8T',
  '1/16T',
];

export type SnapMode = 'nearest' | 'floor' | 'ceil';

/** Grid step in seconds for a note division (fraction of a whole note, optionally triplet). */
export function gridStepSeconds(division: GridDivision, bpm: number): number {
  const triplet = division.endsWith('T');
  const denominator = Number(division.slice(2, triplet ? -1 : undefined));
  return (4 / denominator) * (triplet ? 2 / 3 : 1) * secondsPerQuarter(bpm);
}

/** Snaps a time to the grid anchored at 0 s. The result is never negative. */
export function snapToGrid(time: number, step: number, mode: SnapMode = 'nearest'): number {
  if (!(step > 0) || !Number.isFinite(step)) {
    throw new RangeError(`grid step must be a positive finite number, got ${step}`);
  }
  const ratio = time / step;
  let index: number;
  switch (mode) {
    case 'nearest':
      index = Math.round(ratio);
      break;
    case 'floor':
      index = Math.floor(ratio + TIME_EPSILON);
      break;
    case 'ceil':
      index = Math.ceil(ratio - TIME_EPSILON);
      break;
  }
  return Math.max(0, index * step);
}

/** Snaps note start and end to the nearest grid lines; the duration is at least one step. */
export function quantizeNote(note: Note, step: number): Note {
  const start = snapToGrid(note.start, step);
  const end = snapToGrid(note.start + note.duration, step);
  const duration = end - start < step - TIME_EPSILON ? step : end - start;
  return { ...note, start, duration };
}
