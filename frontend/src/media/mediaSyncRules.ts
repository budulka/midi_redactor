/** How often drift is checked while playing. */
export const SYNC_INTERVAL_MS = 100;
/** Nudging starts above this drift, seconds. */
export const NUDGE_START_SECONDS = 0.03;
/** Nudging stops at or below this drift, seconds. */
export const NUDGE_STOP_SECONDS = 0.01;
/** Above this drift the media is seeked instead of nudged, seconds. */
export const HARD_SEEK_DRIFT_SECONDS = 0.25;
/** Rate change per second of drift. */
export const NUDGE_GAIN = 0.5;
/** The nudge changes the base rate by at most ±5 %. */
export const MAX_NUDGE = 0.05;
/** Drift is not acted on right after a seek: the media is still decoding from a key frame. */
export const SEEK_COOLDOWN_SECONDS = 1;
/** Upper bound of the seek latency compensation, media seconds. */
export const MAX_SEEK_LEAD_SECONDS = 1;
/** Correction seeks in a row that may fail to bring the drift under the hard threshold. */
export const MAX_CORRECTION_SEEKS = 3;
/** The media plays its last moments on its own, seconds. */
export const END_GUARD_SECONDS = 0.1;
/** A paused media closer than this to its target is not seeked again, seconds. */
export const SEEK_EPSILON_SECONDS = 0.005;

/** Per-track correction state, kept by MediaSync between checks. */
export interface TrackSyncState {
  /** Current factor of the base rate; 1 = no nudge. */
  readonly nudge: number;
  /** play() was called and the play event has not arrived yet. */
  readonly playRequested: boolean;
  /** now() of the last seek while playing; -Infinity if none. */
  readonly lastSeekAt: number;
  /** The drift after the last correction seek is not measured yet. */
  readonly checkAfterSeek: boolean;
  /** Media seconds a correction seek jumps ahead of the target (the measured seek latency). */
  readonly seekLead: number;
  /** Correction seeks in a row that did not bring the drift under the hard threshold. */
  readonly seekStreak: number;
}

export const INITIAL_TRACK_SYNC_STATE: TrackSyncState = {
  nudge: 1,
  playRequested: false,
  lastSeekAt: -Infinity,
  checkAfterSeek: false,
  seekLead: 0,
  seekStreak: 0,
};

export interface MediaSyncInput {
  readonly transportPlaying: boolean;
  /**
   * Where the media should be: media seconds of the timeline position (may be negative: the media
   * has not started yet; it starts on the first check after target reaches 0, up to
   * SYNC_INTERVAL_MS late, and the drift correction catches up).
   */
  readonly target: number;
  /** Media currentTime, seconds. */
  readonly mediaTime: number;
  /** Media duration (> 0, the media is ready). */
  readonly duration: number;
  readonly mediaPlaying: boolean;
  /** Seconds, monotonic. */
  readonly now: number;
  /**
   * Timeline seconds the transport still stays at `target` before it starts moving (its start
   * delay after Play or a seek); 0 once it moves. A correction seek made during this delay jumps
   * that much less ahead, so the drift measured after it keeps estimating the seek latency alone.
   */
  readonly startDelay?: number;
  /** Media second where the playing segment that contains target starts (end of the previous cut); default -Infinity. */
  readonly segmentStart?: number;
  /** Media second where that segment ends (start of the next cut); default Infinity. */
  readonly segmentEnd?: number;
  /** Media second where playback continues after that cut (its end); default Infinity. */
  readonly nextSegmentStart?: number;
}

export interface MediaSyncAction {
  readonly seekTo: number | null;
  readonly play: boolean;
  readonly pause: boolean;
  readonly nudge: number;
}

export interface MediaSyncPlan {
  readonly action: MediaSyncAction;
  readonly state: TrackSyncState;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Factor of the base rate that pulls the media towards the target. A dead zone with hysteresis:
 * nudging starts above NUDGE_START_SECONDS and stops only at or below NUDGE_STOP_SECONDS, so clock
 * jitter does not flip the rate on every check. A positive drift (media ahead) slows the media.
 */
export function nudgeFactor(drift: number, currentNudge: number): number {
  const threshold = currentNudge === 1 ? NUDGE_START_SECONDS : NUDGE_STOP_SECONDS;
  if (Math.abs(drift) <= threshold) return 1;
  return round2(1 - clamp(drift * NUDGE_GAIN, -MAX_NUDGE, MAX_NUDGE));
}

const NO_ACTION: MediaSyncAction = { seekTo: null, play: false, pause: false, nudge: 1 };

/**
 * Media second `lead` timeline seconds after target, crossing at most the next cut; clamped to
 * [max(0, segmentStart), duration − END_GUARD_SECONDS]. A negative lead never goes back across
 * the previous cut.
 */
export function mediaAhead(target: number, lead: number, input: MediaSyncInput): number {
  const segmentStart = input.segmentStart ?? -Infinity;
  const segmentEnd = input.segmentEnd ?? Infinity;
  const nextSegmentStart = input.nextSegmentStart ?? Infinity;
  const ahead = target + lead;
  const media = ahead < segmentEnd ? ahead : nextSegmentStart + (ahead - segmentEnd);
  return clamp(media, Math.max(0, segmentStart), input.duration - END_GUARD_SECONDS);
}

/** Decides how to bring one media track to the transport position. */
export function planMediaSync(input: MediaSyncInput, state: TrackSyncState): MediaSyncPlan {
  const { transportPlaying, target, mediaTime, duration, mediaPlaying, now } = input;
  const withNudge = (action: MediaSyncAction, next: TrackSyncState = state): MediaSyncPlan => ({
    action,
    state: { ...next, nudge: action.nudge },
  });

  if (!transportPlaying) {
    const clampedTarget = clamp(target, 0, duration);
    const seekTo =
      Math.abs(mediaTime - clampedTarget) > SEEK_EPSILON_SECONDS ? clampedTarget : null;
    return withNudge({ seekTo, play: false, pause: mediaPlaying, nudge: 1 });
  }

  if (target < 0) {
    // The media starts after bar 1 (a negative offset): it waits on its first frame.
    const seekTo = mediaTime > SEEK_EPSILON_SECONDS ? 0 : null;
    return withNudge(
      { seekTo, play: false, pause: mediaPlaying, nudge: 1 },
      { ...state, playRequested: false },
    );
  }

  if (target >= duration) {
    return withNudge({ ...NO_ACTION, pause: mediaPlaying });
  }

  const segmentStart = input.segmentStart ?? -Infinity;
  const segmentEnd = input.segmentEnd ?? Infinity;
  const nextSegmentStart = input.nextSegmentStart ?? Infinity;

  // The next cut runs to the end of the file: the media stops at the cut and plays none of it.
  const tailCut =
    nextSegmentStart >= duration - END_GUARD_SECONDS &&
    (target >= segmentEnd - END_GUARD_SECONDS ||
      (mediaTime >= segmentEnd - SEEK_EPSILON_SECONDS &&
        target >= segmentEnd - HARD_SEEK_DRIFT_SECONDS));
  if (tailCut) {
    // A seek into the last moments before the cut moves the paused media there.
    const seekTo =
      Math.abs(mediaTime - target) > HARD_SEEK_DRIFT_SECONDS ? Math.min(target, segmentEnd) : null;
    return withNudge(
      { seekTo, play: false, pause: mediaPlaying, nudge: 1 },
      { ...state, playRequested: false },
    );
  }

  const ended = !mediaPlaying && mediaTime >= duration - SEEK_EPSILON_SECONDS;
  const inTail =
    target >= duration - END_GUARD_SECONDS ||
    (ended && target >= duration - HARD_SEEK_DRIFT_SECONDS);
  if (inTail) return withNudge(NO_ACTION);

  if (!mediaPlaying) {
    const drift = mediaTime - target;
    if (state.playRequested) return withNudge(NO_ACTION);
    const seekTo = Math.abs(drift) > NUDGE_START_SECONDS ? target : null;
    return withNudge(
      { seekTo, play: true, pause: false, nudge: 1 },
      { ...state, playRequested: true, lastSeekAt: seekTo === null ? state.lastSeekAt : now },
    );
  }

  // Jumps over a cut are not drift corrections: they ignore the cooldown and the seek streak.
  const jump = (seekTo: number): MediaSyncPlan =>
    withNudge({ ...NO_ACTION, seekTo }, { ...state, lastSeekAt: now, checkAfterSeek: false });
  if (mediaTime < segmentStart - SEEK_EPSILON_SECONDS) {
    // The timeline has passed a cut point and the media is still before the cut.
    return jump(mediaAhead(target, state.seekLead, input));
  }
  if (
    mediaTime >= segmentEnd - SEEK_EPSILON_SECONDS &&
    mediaTime < nextSegmentStart &&
    target >= segmentEnd - HARD_SEEK_DRIFT_SECONDS
  ) {
    // The media is a little ahead of the timeline and has entered the next cut: it jumps over it
    // keeping its lead.
    return jump(
      Math.min(
        nextSegmentStart + Math.max(0, mediaTime - segmentEnd),
        duration - END_GUARD_SECONDS,
      ),
    );
  }
  // The media is already past the next cut (right after a jump) while target is still before it:
  // the drift is measured on the timeline, without the cut range.
  const pastNextCut = mediaTime >= nextSegmentStart;
  const drift = pastNextCut
    ? mediaTime - nextSegmentStart + (segmentEnd - target)
    : mediaTime - target;
  if (pastNextCut && drift <= HARD_SEEK_DRIFT_SECONDS) return withNudge(NO_ACTION);

  const cooldown = now - state.lastSeekAt < SEEK_COOLDOWN_SECONDS;
  let next = state;
  if (next.checkAfterSeek && !cooldown) {
    next = {
      ...next,
      seekLead: clamp(next.seekLead - drift, 0, MAX_SEEK_LEAD_SECONDS),
      checkAfterSeek: false,
      seekStreak: Math.abs(drift) <= HARD_SEEK_DRIFT_SECONDS ? 0 : next.seekStreak,
    };
  }

  if (cooldown) return withNudge(NO_ACTION, next);

  if (Math.abs(drift) > HARD_SEEK_DRIFT_SECONDS && next.seekStreak < MAX_CORRECTION_SEEKS) {
    const lead = next.seekLead - (input.startDelay ?? 0);
    const seekTo = mediaAhead(target, lead, input);
    return withNudge(
      { ...NO_ACTION, seekTo },
      { ...next, lastSeekAt: now, checkAfterSeek: true, seekStreak: next.seekStreak + 1 },
    );
  }

  return withNudge({ ...NO_ACTION, nudge: nudgeFactor(drift, next.nudge) }, next);
}

/** A new transport command (play, pause, seek, rate): act at once, forget the seek history. */
export function afterTransportCommand(state: TrackSyncState): TrackSyncState {
  return {
    ...state,
    playRequested: false,
    lastSeekAt: -Infinity,
    checkAfterSeek: false,
    seekStreak: 0,
  };
}
