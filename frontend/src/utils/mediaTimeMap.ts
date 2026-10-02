import type { Project } from '../state/types.ts';

/** A range of seconds; `start < end`. */
export interface TimeRange {
  readonly start: number;
  readonly end: number;
}

/**
 * How media seconds map onto timeline seconds: the offset puts a media second at bar 1, and the
 * cut ranges of the media are skipped. Both are in seconds of the raw media file:
 *
 *   edited(m) = m − (total length cut before m)
 *   mediaToTimeline(m) = edited(m) − edited(offset)
 *   timelineToMedia(t) = raw(t + edited(offset)), raw being the inverse of edited
 *
 * Every conversion between media and timeline time goes through the functions below.
 */
export interface MediaTimeMap {
  /** Media second at the start of bar 1 (timeline 0 s); negative: the media starts after bar 1. */
  readonly offset: number;
  /** Cut media ranges, raw media seconds, sorted and not overlapping. */
  readonly cuts: readonly TimeRange[];
}

export const IDENTITY_MEDIA_TIME_MAP: MediaTimeMap = { offset: 0, cuts: [] };

/** The project's map; the cuts array is the project's own (no copy). */
export function mediaTimeMapOf(project: Pick<Project, 'mediaOffset' | 'mediaCuts'>): MediaTimeMap {
  return { offset: project.mediaOffset, cuts: project.mediaCuts };
}

/** Media time with the cuts removed: m − Σ clamp(m − c.start, 0, c.end − c.start). */
export function editedMediaTime(mediaSeconds: number, cuts: readonly TimeRange[]): number {
  let removed = 0;
  for (const cut of cuts) {
    if (mediaSeconds <= cut.start) break;
    removed += Math.min(mediaSeconds, cut.end) - cut.start;
  }
  return mediaSeconds - removed;
}

/** Inverse of editedMediaTime; at a cut point returns the end of the cut. */
export function rawMediaTime(editedSeconds: number, cuts: readonly TimeRange[]): number {
  let raw = editedSeconds;
  for (const cut of cuts) {
    if (raw >= cut.start) raw += cut.end - cut.start;
    else break;
  }
  return raw;
}

/** Timeline seconds of a media second (may be negative: before bar 1). A second inside a cut gives its cut point. */
export function mediaToTimeline(mediaSeconds: number, map: MediaTimeMap): number {
  return editedMediaTime(mediaSeconds, map.cuts) - editedMediaTime(map.offset, map.cuts);
}

/** Media seconds at a timeline second (may be negative or past the end); a cut point gives the end of the cut. */
export function timelineToMedia(timelineSeconds: number, map: MediaTimeMap): number {
  return rawMediaTime(timelineSeconds + editedMediaTime(map.offset, map.cuts), map.cuts);
}

/** Timeline second where a media of this duration ends; never below 0. */
export function mediaTimelineEnd(duration: number, map: MediaTimeMap): number {
  return Math.max(0, mediaToTimeline(duration, map));
}

/** True when both maps convert every time the same way: same offset and the same cut ranges. */
export function sameMediaTimeMap(a: MediaTimeMap, b: MediaTimeMap): boolean {
  if (a.offset !== b.offset) return false;
  if (a.cuts === b.cuts) return true;
  if (a.cuts.length !== b.cuts.length) return false;
  return a.cuts.every((cut, index) => {
    const other = b.cuts[index];
    return cut.start === other.start && cut.end === other.end;
  });
}

export interface MediaSegment {
  /** Media second where the segment starts (end of the previous cut), or −Infinity. */
  readonly start: number;
  /** Media second where the segment ends (start of the next cut), or Infinity. */
  readonly end: number;
  /** Media second where playback continues after that next cut (its end), or Infinity. */
  readonly nextStart: number;
}

/**
 * The segment of the media that plays around a media second (a target, never inside a cut):
 * from the end of the previous cut to the start of the next cut, and where playback continues
 * after that cut.
 */
export function mediaSegmentAt(mediaSeconds: number, cuts: readonly TimeRange[]): MediaSegment {
  let start = -Infinity;
  for (const cut of cuts) {
    if (cut.start > mediaSeconds) return { start, end: cut.start, nextStart: cut.end };
    if (cut.end <= mediaSeconds) start = cut.end;
  }
  return { start, end: Infinity, nextStart: Infinity };
}

/** Timeline seconds of every cut point (mediaToTimeline(cut.start)), in order. */
export function cutPoints(map: MediaTimeMap): number[] {
  return map.cuts.map((cut) => mediaToTimeline(cut.start, map));
}

/** The first cut point strictly after a timeline second, or null. */
export function nextCutPoint(timelineSeconds: number, map: MediaTimeMap): number | null {
  for (const point of cutPoints(map)) {
    if (point > timelineSeconds) return point;
  }
  return null;
}
