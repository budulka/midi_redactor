import type { Note, PedalEvent } from '../state/types.ts';
import { pedalsOfType, pressedPedalIn } from './pedalIntervals.ts';

function firstStartingAtOrAfter(sorted: readonly PedalEvent[], time: number): number {
  let low = 0;
  let high = sorted.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (sorted[middle].start < time) low = middle + 1;
    else high = middle;
  }
  return low;
}

function firstGreaterThan(sorted: readonly number[], value: number): number {
  let low = 0;
  let high = sorted.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (sorted[middle] <= value) low = middle + 1;
    else high = middle;
  }
  return low;
}

/**
 * When each note stops sounding, by note id, taking the sustain and sostenuto pedals into account:
 * 1. The key is released at `start + duration`.
 * 2. Sostenuto holds a note whose key is down when the pedal is pressed
 *    (`note.start <= pedal.start < keyUp`) until that pedal is released.
 *    Simplification: a real piano's sostenuto also catches dampers that are raised only by the
 *    sustain pedal at that moment (keys already released); this model ignores that case.
 * 3. Sustain pressed at the release moment (start inclusive, end exclusive) holds the note until
 *    the pedal is released. A touching next sustain pedal does not extend it further
 *    (re-pedalling damps the strings).
 * 4. Striking the same key again stops the previous sound, but a note never ends before its key
 *    is released.
 * The soft pedal does not change the length. Runs in O((n + m) log(n + m)) for typical input.
 */
export function noteSoundingEnds(
  notes: readonly Note[],
  pedals: readonly PedalEvent[],
): ReadonlyMap<string, number> {
  const sustain = pedalsOfType(pedals, 'sustain');
  const sostenuto = pedalsOfType(pedals, 'sostenuto');
  const startsByPitch = new Map<number, number[]>();
  for (const note of notes) {
    const starts = startsByPitch.get(note.pitch);
    if (starts === undefined) startsByPitch.set(note.pitch, [note.start]);
    else starts.push(note.start);
  }
  for (const starts of startsByPitch.values()) starts.sort((a, b) => a - b);

  const ends = new Map<string, number>();
  for (const note of notes) {
    const keyUp = note.start + note.duration;
    let release = keyUp;

    for (
      let index = firstStartingAtOrAfter(sostenuto, note.start);
      index < sostenuto.length && sostenuto[index].start < keyUp;
      index += 1
    ) {
      release = Math.max(release, sostenuto[index].end);
    }

    const held = pressedPedalIn(sustain, release);
    if (held !== null) release = held.end;

    const starts = startsByPitch.get(note.pitch) ?? [];
    const next = starts[firstGreaterThan(starts, note.start)];
    if (next !== undefined) release = Math.max(keyUp, Math.min(release, next));

    ends.set(note.id, release);
  }
  return ends;
}
