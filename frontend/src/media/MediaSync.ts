import type { MediaTrackSnapshot } from './MediaTrackController.ts';
import {
  afterTransportCommand,
  INITIAL_TRACK_SYNC_STATE,
  planMediaSync,
  SEEK_EPSILON_SECONDS,
  SYNC_INTERVAL_MS,
  type TrackSyncState,
} from './mediaSyncRules.ts';

export interface SyncClockSnapshot {
  readonly status: 'stopped' | 'playing' | 'paused';
  readonly position: number;
  readonly rate: number;
}

/** The master clock of the timeline; implemented by Transport. */
export interface SyncClock {
  getSnapshot(): SyncClockSnapshot;
  subscribe(listener: () => void): () => void;
  getPosition(): number;
  seek(position: number): void;
  /** Timeline seconds the clock still stays at its position before it starts moving. */
  getStartDelay?(): number;
}

/** A media track that follows the clock; implemented by MediaTrackController. */
export interface SyncedMediaTrack {
  getSnapshot(): MediaTrackSnapshot;
  subscribe(listener: () => void): () => void;
  subscribeSeek(listener: (seconds: number) => void): () => void;
  getCurrentTime(): number;
  play(): void;
  pause(): void;
  syncTo(seconds: number): void;
  setRate(rate: number): void;
  setRateNudge(factor: number): void;
}

export interface MediaSyncOptions {
  /** Default: window.setInterval / clearInterval. */
  readonly startTimer?: (callback: () => void, intervalMs: number) => () => void;
  /** Seconds; default performance.now() / 1000. */
  readonly now?: () => number;
}

interface TrackEntry {
  readonly track: SyncedMediaTrack;
  sync: TrackSyncState;
  lastSnapshot: MediaTrackSnapshot;
  readonly unsubscribers: (() => void)[];
}

const defaultStartTimer = (callback: () => void, intervalMs: number): (() => void) => {
  const id = window.setInterval(callback, intervalMs);
  return () => window.clearInterval(id);
};

const defaultNow = (): number => performance.now() / 1000;

/**
 * Keeps media tracks at the position, the status and the rate of the clock. The clock is the
 * master: paused media shows the frame at the clock position, playing media is pulled towards it
 * (see planMediaSync), and a seek made by the user in a media track moves the clock.
 */
export class MediaSync {
  private readonly clock: SyncClock;
  private readonly startTimer: (callback: () => void, intervalMs: number) => () => void;
  private readonly now: () => number;
  private readonly entries = new Set<TrackEntry>();
  private readonly listeners = new Set<() => void>();
  private clockSnapshot: SyncClockSnapshot | null = null;
  private unsubscribeClock: (() => void) | null = null;
  private stopTimer: (() => void) | null = null;
  private mediaDuration = 0;
  private syncing = false;
  private resyncRequested = false;

  constructor(clock: SyncClock, options: MediaSyncOptions = {}) {
    this.clock = clock;
    this.startTimer = options.startTimer ?? defaultStartTimer;
    this.now = options.now ?? defaultNow;
  }

  /** Makes the track follow the clock; returns the function that detaches it. */
  attach(track: SyncedMediaTrack): () => void {
    if (this.entries.size === 0) this.connectClock();
    track.setRate(this.clock.getSnapshot().rate);
    const entry: TrackEntry = {
      track,
      sync: INITIAL_TRACK_SYNC_STATE,
      lastSnapshot: track.getSnapshot(),
      unsubscribers: [],
    };
    this.entries.add(entry);
    entry.unsubscribers.push(
      track.subscribe(() => this.onTrackChange(entry)),
      track.subscribeSeek((seconds) => this.onTrackSeek(entry, seconds)),
    );
    this.updateMediaDuration();
    this.runSync(() => this.syncTrack(entry));
    return () => this.detach(entry);
  }

  /** Detaches every track; the instance stays usable. */
  detachAll(): void {
    for (const entry of [...this.entries]) this.detach(entry);
  }

  /** Longest duration of the ready tracks, seconds; 0 without media. */
  getMediaDuration = (): number => this.mediaDuration;

  /** Notifies the listener when the media duration changes. */
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private detach(entry: TrackEntry): void {
    if (!this.entries.delete(entry)) return;
    for (const unsubscribe of entry.unsubscribers) unsubscribe();
    entry.track.pause();
    entry.track.setRateNudge(1);
    this.updateMediaDuration();
    if (this.entries.size === 0) this.disconnectClock();
  }

  private connectClock(): void {
    this.clockSnapshot = this.clock.getSnapshot();
    this.unsubscribeClock = this.clock.subscribe(this.onClockChange);
    this.updateTimer();
  }

  private disconnectClock(): void {
    this.unsubscribeClock?.();
    this.unsubscribeClock = null;
    this.clockSnapshot = null;
    this.updateTimer();
  }

  private readonly onClockChange = (): void => {
    const snapshot = this.clock.getSnapshot();
    const previous = this.clockSnapshot;
    if (snapshot === previous) return;
    this.clockSnapshot = snapshot;
    for (const entry of this.entries) {
      if (previous === null || snapshot.rate !== previous.rate) {
        entry.track.setRate(snapshot.rate);
        entry.sync = { ...entry.sync, nudge: 1 };
      }
      entry.sync = afterTransportCommand(entry.sync);
    }
    this.updateTimer();
    this.syncAll();
  };

  private onTrackChange(entry: TrackEntry): void {
    if (!this.entries.has(entry)) return;
    const snapshot = entry.track.getSnapshot();
    if (snapshot.status !== 'ready') entry.sync = INITIAL_TRACK_SYNC_STATE;
    if (snapshot.playing) entry.sync = { ...entry.sync, playRequested: false };
    const previous = entry.lastSnapshot;
    entry.lastSnapshot = snapshot;
    // A change of the position alone is a seek: user seeks arrive through onTrackSeek, and the
    // corrections made here do not need another check.
    const changed =
      snapshot.status !== previous.status ||
      snapshot.duration !== previous.duration ||
      snapshot.playing !== previous.playing;
    if (!changed) return;
    this.updateMediaDuration();
    this.runSync(() => this.syncTrack(entry));
  }

  private onTrackSeek(entry: TrackEntry, seconds: number): void {
    const { duration } = entry.track.getSnapshot();
    // A seek clamped to the end of a media that the timeline has already passed (e.g. "+5 s" on
    // a video shorter than the arrangement) would pull the whole timeline back; it is ignored.
    const atEnd = seconds >= duration - SEEK_EPSILON_SECONDS;
    if (atEnd && this.clock.getPosition() >= seconds) return;
    this.clock.seek(seconds);
  }

  private readonly syncAll = (): void => {
    this.runSync(() => {
      for (const entry of [...this.entries]) this.syncTrack(entry);
    });
  };

  /**
   * Runs a sync pass. Track calls notify listeners synchronously, so a pass started inside a pass
   * only requests one more pass over all tracks after the current one.
   */
  private runSync(pass: () => void): void {
    if (this.syncing) {
      this.resyncRequested = true;
      return;
    }
    this.syncing = true;
    try {
      pass();
      if (this.resyncRequested) {
        this.resyncRequested = false;
        for (const entry of [...this.entries]) this.syncTrack(entry);
      }
    } finally {
      this.syncing = false;
      this.resyncRequested = false;
    }
  }

  private syncTrack(entry: TrackEntry): void {
    if (!this.entries.has(entry)) return;
    const { track } = entry;
    const snapshot = track.getSnapshot();
    if (snapshot.status !== 'ready') return;
    const { action, state } = planMediaSync(
      {
        transportPlaying: this.clock.getSnapshot().status === 'playing',
        target: this.clock.getPosition(),
        mediaTime: track.getCurrentTime(),
        duration: snapshot.duration,
        mediaPlaying: snapshot.playing,
        now: this.now(),
        startDelay: this.clock.getStartDelay?.() ?? 0,
      },
      entry.sync,
    );
    const nudgeChanged = action.nudge !== entry.sync.nudge;
    entry.sync = state;
    if (nudgeChanged) track.setRateNudge(action.nudge);
    if (action.pause) track.pause();
    if (action.seekTo !== null) track.syncTo(action.seekTo);
    if (action.play) track.play();
  }

  private updateTimer(): void {
    const playing = this.clockSnapshot?.status === 'playing';
    if (playing && this.stopTimer === null) {
      this.stopTimer = this.startTimer(this.syncAll, SYNC_INTERVAL_MS);
    } else if (!playing && this.stopTimer !== null) {
      this.stopTimer();
      this.stopTimer = null;
    }
  }

  /**
   * Longest duration of the ready tracks. While a track is loading a file, the duration does not
   * shrink: a replaced file keeps the timeline (and the playing transport) where it was until the
   * new file is ready or fails.
   */
  private updateMediaDuration(): void {
    let ready = 0;
    let loading = false;
    for (const { track } of this.entries) {
      const snapshot = track.getSnapshot();
      if (snapshot.status === 'ready') ready = Math.max(ready, snapshot.duration);
      if (snapshot.status === 'loading') loading = true;
    }
    const duration = loading ? Math.max(ready, this.mediaDuration) : ready;
    if (duration === this.mediaDuration) return;
    this.mediaDuration = duration;
    for (const listener of [...this.listeners]) listener();
  }
}
