import {
  mediaTimelineEnd,
  mediaToTimeline,
  timelineToMedia,
  type MediaTimeMap,
} from './mediaTimeMap.ts';
import { MIN_MEDIA_CUT_SECONDS } from '../state/constants.ts';
import { stepOf, type SeekAction } from './keyActions.ts';
import { formatClock } from './transportFormat.ts';

/** Arrow keys on the media timeline move the position by this much, seconds. */
export const TIMELINE_KEY_STEP_SECONDS = 0.1;
/** Shift + arrow keys on the media timeline move the position by this much, seconds. */
export const TIMELINE_KEY_BIG_STEP_SECONDS = 1;

export interface TimelineExtent {
  readonly start: number;
  readonly end: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function roundToMs(seconds: number): number {
  const result = Math.round(seconds * 1000) / 1000;
  return result === 0 ? 0 : result;
}

/**
 * Where the media lies on the timeline: [max(0, mediaToTimeline(0)), mediaTimelineEnd(duration)];
 * null when duration <= 0 or the range is empty.
 */
export function mediaTimelineExtent(duration: number, map: MediaTimeMap): TimelineExtent | null {
  if (!(duration > 0)) return null;
  const start = Math.max(0, mediaToTimeline(0, map));
  const end = mediaTimelineEnd(duration, map);
  if (!(end > start)) return null;
  return { start, end };
}

/** Media seconds before bar 1 that the timeline does not show: max(0, −mediaToTimeline(0, map)). */
export function hiddenIntroSeconds(map: MediaTimeMap): number {
  return Math.max(0, -mediaToTimeline(0, map));
}

/**
 * New timeline position for a key action on the media timeline, clamped to [0, end] and rounded
 * to 1 ms; null when end <= 0.
 */
export function timelineSeekForAction(
  position: number,
  action: SeekAction,
  end: number,
): number | null {
  if (!(end > 0)) return null;
  let next: number;
  if (action === 'toStart') {
    next = 0;
  } else if (action === 'toEnd') {
    next = end;
  } else {
    const { sign, big } = stepOf(action);
    next = position + sign * (big ? TIMELINE_KEY_BIG_STEP_SECONDS : TIMELINE_KEY_STEP_SECONDS);
  }
  return roundToMs(clamp(next, 0, end));
}

/** "0:01.500 (media 0:04.700)"; the media part is omitted when the media time is negative. */
export function mediaPositionText(position: number, map: MediaTimeMap): string {
  const timeline = formatClock(position);
  const media = timelineToMedia(position, map);
  if (media < 0) return timeline;
  return `${timeline} (media ${formatClock(media)})`;
}

/**
 * Timeline selection dragged from `from` to `to`: ordered and clamped to the media extent; null
 * without an extent or when the clamped selection is shorter than MIN_MEDIA_CUT_SECONDS.
 */
export function clampSelection(
  from: number,
  to: number,
  extent: TimelineExtent | null,
): TimelineExtent | null {
  if (extent === null) return null;
  const start = Math.max(Math.min(from, to), extent.start);
  const end = Math.min(Math.max(from, to), extent.end);
  if (!(end - start >= MIN_MEDIA_CUT_SECONDS - 1e-9)) return null;
  return { start, end };
}

/** "Selected 0:05.000–0:08.000". */
export function selectionLabel(selection: TimelineExtent): string {
  return `Selected ${formatClock(selection.start)}–${formatClock(selection.end)}`;
}
