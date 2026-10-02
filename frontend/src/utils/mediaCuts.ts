import { MAX_MEDIA_CUTS, MAX_MEDIA_CUT_END, MIN_MEDIA_CUT_SECONDS } from '../state/constants.ts';
import type { MediaCut } from '../state/types.ts';
import { timelineToMedia, type MediaTimeMap, type TimeRange } from './mediaTimeMap.ts';
import { stepOf, type StepAction } from './keyActions.ts';
import { formatClock } from './transportFormat.ts';

export type { TimeRange } from './mediaTimeMap.ts';
export type CutEdge = 'start' | 'end';

/** Arrow keys on a cut edge move it by this much, seconds. */
export const CUT_KEY_STEP_SECONDS = 0.01;
/** Shift + arrow keys on a cut edge move it by this much, seconds. */
export const CUT_KEY_BIG_STEP_SECONDS = 0.1;
/** Gap a dragged edge keeps from a neighbour cut, seconds (touching cuts would merge). */
export const CUT_EDGE_GAP_SECONDS = 0.001;

/** Tolerance for comparing rounded seconds. */
const EPSILON = 1e-9;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function roundToMs(seconds: number): number {
  const result = Math.round(seconds * 1000) / 1000;
  return result === 0 ? 0 : result;
}

function isLongEnough(range: TimeRange): boolean {
  return range.end - range.start >= MIN_MEDIA_CUT_SECONDS - EPSILON;
}

/**
 * Rounds both ends to 1 ms, clamps to [0, MAX_MEDIA_CUT_END]; null when shorter than
 * MIN_MEDIA_CUT_SECONDS or not finite.
 */
export function normalizeCutRange(range: TimeRange): TimeRange | null {
  if (!Number.isFinite(range.start) || !Number.isFinite(range.end)) return null;
  const start = roundToMs(clamp(range.start, 0, MAX_MEDIA_CUT_END));
  const end = roundToMs(clamp(range.end, 0, MAX_MEDIA_CUT_END));
  const normalized = { start, end };
  return isLongEnough(normalized) ? normalized : null;
}

function byStart(a: MediaCut, b: MediaCut): number {
  return a.start - b.start;
}

/**
 * Adds a cut and merges it with every cut it overlaps or touches; the merged cut keeps the id of
 * the added one. Returns the same array when an existing cut already covers the range, or when
 * the list would grow past MAX_MEDIA_CUTS. Expects a normalized range.
 */
export function addCut(cuts: readonly MediaCut[], cut: MediaCut): readonly MediaCut[] {
  if (cuts.some((other) => other.start <= cut.start && other.end >= cut.end)) return cuts;
  let start = cut.start;
  let end = cut.end;
  const kept: MediaCut[] = [];
  for (const other of cuts) {
    if (other.start <= cut.end && other.end >= cut.start) {
      start = Math.min(start, other.start);
      end = Math.max(end, other.end);
    } else {
      kept.push(other);
    }
  }
  if (kept.length + 1 > MAX_MEDIA_CUTS) return cuts;
  return [...kept, { id: cut.id, start, end }].sort(byStart);
}

/**
 * Moves the edges of one cut; null when the id is unknown, the range is invalid or it would
 * overlap or touch another cut; the same array when nothing changes.
 */
export function updateCut(
  cuts: readonly MediaCut[],
  id: string,
  range: TimeRange,
): readonly MediaCut[] | null {
  const index = cuts.findIndex((cut) => cut.id === id);
  if (index < 0) return null;
  if (
    !Number.isFinite(range.start) ||
    !Number.isFinite(range.end) ||
    range.start < 0 ||
    range.end > MAX_MEDIA_CUT_END ||
    !isLongEnough(range)
  ) {
    return null;
  }
  const current = cuts[index];
  if (current.start === range.start && current.end === range.end) return cuts;
  const touches = cuts.some(
    (other, otherIndex) =>
      otherIndex !== index && other.start <= range.end && other.end >= range.start,
  );
  if (touches) return null;
  const next = cuts.slice();
  next[index] = { id, start: range.start, end: range.end };
  return next.sort(byStart);
}

/** The list without the cut; the same array for an unknown id. */
export function removeCut(cuts: readonly MediaCut[], id: string): readonly MediaCut[] {
  if (!cuts.some((cut) => cut.id === id)) return cuts;
  return cuts.filter((cut) => cut.id !== id);
}

/**
 * Allowed values of one edge, so that dragging never moves bar 1 across the cut:
 * - a cut at or after bar 1 (start >= offset): start in [max(previous end + gap, 0, offset), end − MIN],
 *   end in [start + MIN, min(next start − gap, mediaDuration)];
 * - a cut that contains bar 1 (start < offset <= end): start in [max(previous end + gap, 0), min(end − MIN, offset)],
 *   end in [max(start + MIN, offset), min(next start − gap, mediaDuration)];
 * - a cut wholly before bar 1 (end < offset): the first rule without the offset bound.
 * mediaDuration <= 0 means unknown (MAX_MEDIA_CUT_END).
 */
export function cutEdgeLimits(
  cuts: readonly MediaCut[],
  id: string,
  edge: CutEdge,
  mediaDuration: number,
  offset: number,
): TimeRange {
  const index = cuts.findIndex((cut) => cut.id === id);
  if (index < 0) return { start: 0, end: 0 };
  const cut = cuts[index];
  const previousEnd = index > 0 ? cuts[index - 1].end + CUT_EDGE_GAP_SECONDS : 0;
  const nextStart =
    index < cuts.length - 1 ? cuts[index + 1].start - CUT_EDGE_GAP_SECONDS : Infinity;
  const duration = mediaDuration > 0 ? mediaDuration : MAX_MEDIA_CUT_END;
  const containsBarOne = cut.start < offset && offset <= cut.end;
  const afterBarOne = cut.start >= offset;
  if (edge === 'start') {
    const min = Math.max(previousEnd, 0, afterBarOne ? offset : -Infinity);
    const max = cut.end - MIN_MEDIA_CUT_SECONDS;
    return {
      start: roundToMs(min),
      end: roundToMs(containsBarOne ? Math.min(max, offset) : max),
    };
  }
  const min = cut.start + MIN_MEDIA_CUT_SECONDS;
  return {
    start: roundToMs(containsBarOne ? Math.max(min, offset) : min),
    end: roundToMs(Math.min(nextStart, duration)),
  };
}

/**
 * New value of an edge dragged by delta timeline seconds (= media seconds inside one segment),
 * clamped to the limits, rounded to 1 ms.
 */
export function draggedCutEdge(value: number, delta: number, limits: TimeRange): number {
  return roundToMs(clamp(value + delta, limits.start, limits.end));
}

/** New value of an edge for a key action (the big steps are the Shift variants), clamped and rounded. */
export function cutEdgeForAction(value: number, action: StepAction, limits: TimeRange): number {
  const { sign, big } = stepOf(action);
  const step = big ? CUT_KEY_BIG_STEP_SECONDS : CUT_KEY_STEP_SECONDS;
  return draggedCutEdge(value, sign * step, limits);
}

/**
 * Media range cut by a timeline selection: [timelineToMedia(start), timelineToMedia(end)] clamped
 * to [0, mediaDuration] and normalized; null when empty.
 */
export function cutRangeForSelection(
  selection: TimeRange,
  map: MediaTimeMap,
  mediaDuration: number,
): TimeRange | null {
  if (!(mediaDuration > 0)) return null;
  return normalizeCutRange({
    start: clamp(timelineToMedia(selection.start, map), 0, mediaDuration),
    end: clamp(timelineToMedia(selection.end, map), 0, mediaDuration),
  });
}

/** "Cut 0:05.000–0:08.000 (3.000 s)". */
export function cutDescription(range: TimeRange): string {
  const length = (range.end - range.start).toFixed(3);
  return `Cut ${formatClock(range.start)}–${formatClock(range.end)} (${length} s)`;
}

/** Where a cut lies on a waveform of the whole media, in percent; null when it is past the end. */
export function cutShadePercent(
  cut: TimeRange,
  duration: number,
): { left: number; width: number } | null {
  if (!(duration > 0) || cut.start >= duration) return null;
  return {
    left: (cut.start / duration) * 100,
    width: ((Math.min(cut.end, duration) - cut.start) / duration) * 100,
  };
}
