import { normalizeNote, normalizePedal } from '../state/normalize.ts';
import type { Note, PedalEvent, PedalType, Project } from '../state/types.ts';
import { assertPositiveBpm } from './time.ts';

/**
 * Timeline seconds of the start of the first bar. Until the media offset (task 015) exists,
 * bar 1 starts at 0 s.
 */
export const FIRST_BAR_START_SECONDS = 0;

/**
 * How many seconds at `toBpm` correspond to one second at `fromBpm` for the same position in
 * beats: fromBpm / toBpm. Throws RangeError for a non-positive or non-finite bpm.
 */
export function tempoScaleFactor(fromBpm: number, toBpm: number): number {
  assertPositiveBpm(fromBpm);
  assertPositiveBpm(toBpm);
  return fromBpm / toBpm;
}

/** origin + (time - origin) * factor. */
export function rescaleTime(
  time: number,
  factor: number,
  origin: number = FIRST_BAR_START_SECONDS,
): number {
  return origin + (time - origin) * factor;
}

/**
 * Notes moved and stretched by the factor around the origin, normalized (normalizeNote).
 * Order and ids are kept. Returns the same array when it is empty or factor === 1.
 */
export function rescaleNotes(
  notes: readonly Note[],
  factor: number,
  origin: number = FIRST_BAR_START_SECONDS,
): readonly Note[] {
  if (notes.length === 0 || factor === 1) return notes;
  return notes.map((note) =>
    normalizeNote({
      ...note,
      start: rescaleTime(note.start, factor, origin),
      duration: note.duration * factor,
    }),
  );
}

/**
 * Pedals with both ends rescaled around the origin and normalized (normalizePedal). A pedal that
 * then overlaps an earlier pedal of its type is merged into it (the earlier one keeps its id and
 * gets the later end). Order of the kept pedals is the input order. Returns the same array when it
 * is empty or factor === 1.
 *
 * Both ends go through the same formula, so touching pedals keep touching and the order is kept;
 * an overlap can only appear when normalization lengthens a pedal shorter than the minimum.
 */
export function rescalePedals(
  pedals: readonly PedalEvent[],
  factor: number,
  origin: number = FIRST_BAR_START_SECONDS,
): readonly PedalEvent[] {
  if (pedals.length === 0 || factor === 1) return pedals;
  const scaled = pedals.map((pedal) =>
    normalizePedal({
      ...pedal,
      start: rescaleTime(pedal.start, factor, origin),
      end: rescaleTime(pedal.end, factor, origin),
    }),
  );

  const byType = new Map<PedalType, PedalEvent[]>();
  for (const pedal of scaled) {
    const list = byType.get(pedal.type);
    if (list) list.push(pedal);
    else byType.set(pedal.type, [pedal]);
  }

  const removed = new Set<string>();
  const merged = new Map<string, PedalEvent>();
  for (const list of byType.values()) {
    // Array.prototype.sort is stable, so pedals with the same start keep the input order.
    const sorted = [...list].sort((a, b) => a.start - b.start);
    let last: PedalEvent | undefined;
    for (const current of sorted) {
      if (last && current.start < last.end) {
        if (current.end > last.end) {
          last = { ...last, end: current.end };
          merged.set(last.id, last);
        }
        removed.add(current.id);
      } else {
        last = current;
      }
    }
  }

  if (removed.size === 0) return scaled;
  return scaled
    .filter((pedal) => !removed.has(pedal.id))
    .map((pedal) => merged.get(pedal.id) ?? pedal);
}

/**
 * The project at another tempo: bpm is replaced, notes and pedals keep their position in bars and
 * beats (their seconds are rescaled around `origin`). Expects a finite bpm already clamped to the
 * allowed range. Returns the same project when bpm equals project.bpm.
 *
 * Only a tempo change of an existing project rescales. Loading or replacing a project (e.g. a
 * `.mid` import) must not call this: such a project already has seconds that match its own bpm.
 */
export function rescaleProjectTempo(
  project: Project,
  bpm: number,
  origin: number = FIRST_BAR_START_SECONDS,
): Project {
  if (bpm === project.bpm) return project;
  const factor = tempoScaleFactor(project.bpm, bpm);
  return {
    ...project,
    bpm,
    notes: rescaleNotes(project.notes, factor, origin),
    pedals: rescalePedals(project.pedals, factor, origin),
  };
}
