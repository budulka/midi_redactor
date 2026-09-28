/**
 * Links the audio clock (AudioContext.currentTime) to the timeline: at `contextTime` the timeline
 * is at `position` and moves `rate` timeline seconds per audio second.
 */
export interface TransportAnchor {
  /** Audio clock time at which the timeline is at `position`, seconds. */
  readonly contextTime: number;
  /** Timeline position, seconds. */
  readonly position: number;
  /** Timeline seconds per audio second. */
  readonly rate: number;
}

/** Timeline position at an audio clock time; never before the anchor position. */
export function positionAt(anchor: TransportAnchor, now: number): number {
  return anchor.position + Math.max(0, now - anchor.contextTime) * anchor.rate;
}

/** Audio clock time at which the timeline reaches a position. */
export function contextTimeAt(anchor: TransportAnchor, position: number): number {
  return anchor.contextTime + (position - anchor.position) / anchor.rate;
}
