import type { Project } from '../state/types.ts';

/**
 * How media seconds map onto timeline seconds. Today only the offset; task 016 adds the cut
 * ranges here, and every conversion goes through the functions below.
 */
export interface MediaTimeMap {
  /** Media second at the start of bar 1 (timeline 0 s); negative: the media starts after bar 1. */
  readonly offset: number;
}

export const IDENTITY_MEDIA_TIME_MAP: MediaTimeMap = { offset: 0 };

export function mediaTimeMapOf(project: Pick<Project, 'mediaOffset'>): MediaTimeMap {
  return { offset: project.mediaOffset };
}

/** Timeline seconds of a media second: media − offset (may be negative: before bar 1). */
export function mediaToTimeline(mediaSeconds: number, map: MediaTimeMap): number {
  return mediaSeconds - map.offset;
}

/** Media seconds at a timeline second: timeline + offset (may be negative or past the end). */
export function timelineToMedia(timelineSeconds: number, map: MediaTimeMap): number {
  return timelineSeconds + map.offset;
}

/** Timeline second where a media of this duration ends; never below 0. */
export function mediaTimelineEnd(duration: number, map: MediaTimeMap): number {
  return Math.max(0, mediaToTimeline(duration, map));
}

/** True when both maps convert every time the same way. */
export function sameMediaTimeMap(a: MediaTimeMap, b: MediaTimeMap): boolean {
  return a.offset === b.offset;
}
