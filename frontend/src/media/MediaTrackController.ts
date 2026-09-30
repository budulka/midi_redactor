import type { MediaFormat, NamedFile } from '../utils/mediaFormats.ts';
import {
  clampPlaybackRate,
  DEFAULT_PLAYBACK_RATE,
  nudgedPlaybackRate,
} from '../utils/playbackRate.ts';
import { isAbortError } from './errors.ts';
import type { CreateMediaPlayer, MediaPlayer } from './mediaPlayer.ts';

export type MediaTrackStatus = 'empty' | 'loading' | 'ready';

export interface MediaTrackSnapshot {
  readonly status: MediaTrackStatus;
  /** The file being loaded or loaded. */
  readonly fileName: string | null;
  /** 0 until ready. */
  readonly duration: number;
  readonly playing: boolean;
  /** Cue position: updated on ready, pause, seek and finish, not while playing. */
  readonly position: number;
  readonly rate: number;
  /** Kept between files, like the rate. */
  readonly muted: boolean;
  /** The last error message. */
  readonly error: string | null;
}

/** Texts of the error messages; methods (not function properties) keep them bivariant. */
export interface MediaTrackMessages<F extends MediaFormat> {
  /** The file is not one of the supported formats. */
  unsupported(fileName: string): string;
  /** The browser reports it cannot play the format. */
  unplayable(format: F): string;
  /** The player failed to load the file. */
  loadFailed(fileName: string): string;
  readonly playFailed: string;
}

export interface MediaTrackControllerOptions<F extends MediaFormat> {
  readonly createPlayer: CreateMediaPlayer;
  readonly canPlayType: (mime: string) => boolean;
  readonly detectFormat: (file: NamedFile) => F | null;
  readonly messages: MediaTrackMessages<F>;
  readonly createObjectUrl?: (file: Blob) => string;
  readonly revokeObjectUrl?: (url: string) => void;
}

/** A ready file: its media element and the object URL it plays. */
export interface LoadedMedia {
  readonly element: HTMLMediaElement;
  readonly url: string;
}

export const EMPTY_MEDIA_TRACK_SNAPSHOT: MediaTrackSnapshot = {
  status: 'empty',
  fileName: null,
  duration: 0,
  playing: false,
  position: 0,
  rate: DEFAULT_PLAYBACK_RATE,
  muted: false,
  error: null,
};

/**
 * Owns the media file of a track (audio or video): validates the file, creates one player per
 * file and keeps a snapshot of its state. Events of a player that was replaced are ignored.
 */
export class MediaTrackController<F extends MediaFormat = MediaFormat> {
  private readonly createPlayer: CreateMediaPlayer;
  private readonly canPlayType: (mime: string) => boolean;
  private readonly detectFormat: (file: NamedFile) => F | null;
  private readonly messages: MediaTrackMessages<F>;
  private readonly createObjectUrl: (file: Blob) => string;
  private readonly revokeObjectUrl: (url: string) => void;
  private player: MediaPlayer | null = null;
  private url: string | null = null;
  private generation = 0;
  private snapshot: MediaTrackSnapshot = EMPTY_MEDIA_TRACK_SNAPSHOT;
  /** Factor of the rate for drift correction; not part of the snapshot. */
  private nudge = 1;
  private readonly listeners = new Set<() => void>();
  private readonly seekListeners = new Set<(seconds: number) => void>();
  private readonly loadStartListeners = new Set<() => void>();

  constructor(options: MediaTrackControllerOptions<F>) {
    this.createPlayer = options.createPlayer;
    this.canPlayType = options.canPlayType;
    this.detectFormat = options.detectFormat;
    this.messages = options.messages;
    this.createObjectUrl = options.createObjectUrl ?? ((file) => URL.createObjectURL(file));
    this.revokeObjectUrl = options.revokeObjectUrl ?? ((url) => URL.revokeObjectURL(url));
  }

  load(file: File, container: HTMLElement): void {
    const format = this.detectFormat(file);
    if (format === null) {
      this.update({ error: this.messages.unsupported(file.name) });
      return;
    }
    if (!this.canPlayType(format.probeType)) {
      this.update({ error: this.messages.unplayable(format) });
      return;
    }
    this.releaseTrack();
    const generation = this.generation;
    const isCurrent = () => generation === this.generation;
    const url = this.createObjectUrl(file);
    this.url = url;
    this.nudge = 1;
    // The snapshot is already 'loading' (without a notification) when load start listeners run,
    // so whoever reacts to them sees that a new file is on its way.
    this.snapshot = {
      status: 'loading',
      fileName: file.name,
      duration: 0,
      playing: false,
      position: 0,
      rate: this.snapshot.rate,
      muted: this.snapshot.muted,
      error: null,
    };
    for (const listener of [...this.loadStartListeners]) listener();
    this.player = this.createPlayer({
      container,
      url,
      events: {
        onReady: (duration) => {
          if (!isCurrent()) return;
          this.player?.setPlaybackRate(this.snapshot.rate);
          if (this.snapshot.muted) this.player?.setMuted(true);
          this.update({ status: 'ready', duration, position: 0 });
        },
        onPlay: () => {
          if (!isCurrent()) return;
          const error =
            this.snapshot.error === this.messages.playFailed ? null : this.snapshot.error;
          this.update({ playing: true, error });
        },
        onPause: () => {
          if (!isCurrent()) return;
          this.update({ playing: false, position: this.player?.getCurrentTime() ?? 0 });
        },
        onFinish: () => {
          if (!isCurrent()) return;
          this.update({ playing: false, position: this.snapshot.duration });
        },
        onSeek: (time) => {
          if (!isCurrent()) return;
          this.notifySeek(time);
          this.update({ position: time });
        },
        onError: () => {
          if (!isCurrent()) return;
          this.releaseTrack();
          this.snapshot = {
            ...EMPTY_MEDIA_TRACK_SNAPSHOT,
            rate: this.snapshot.rate,
            muted: this.snapshot.muted,
            error: this.messages.loadFailed(file.name),
          };
          this.notify();
        },
      },
    });
    this.notify();
  }

  clear(): void {
    if (this.snapshot.status === 'empty' && this.snapshot.error === null) return;
    this.releaseTrack();
    this.snapshot = {
      ...EMPTY_MEDIA_TRACK_SNAPSHOT,
      rate: this.snapshot.rate,
      muted: this.snapshot.muted,
    };
    this.notify();
  }

  togglePlay(): void {
    if (this.snapshot.status !== 'ready') return;
    if (this.snapshot.playing) {
      this.pause();
    } else {
      this.play();
    }
  }

  play(): void {
    const player = this.player;
    if (this.snapshot.status !== 'ready' || player === null) return;
    const generation = this.generation;
    player.play().catch((error: unknown) => {
      if (generation !== this.generation || isAbortError(error)) return;
      this.update({ playing: false, error: this.messages.playFailed });
    });
  }

  pause(): void {
    if (!this.snapshot.playing) return;
    this.player?.pause();
  }

  seek(seconds: number): void {
    const player = this.player;
    if (this.snapshot.status !== 'ready' || player === null) return;
    const target = Math.min(Math.max(seconds, 0), this.snapshot.duration);
    player.setTime(target);
    // Seek listeners run before the snapshot changes, so a clock that follows them has already
    // moved when snapshot listeners see the new position.
    this.notifySeek(target);
    this.update({ position: target });
  }

  /** Moves the media for synchronization: like seek(), but seek listeners are not called. */
  syncTo(seconds: number): void {
    const player = this.player;
    if (this.snapshot.status !== 'ready' || player === null) return;
    const target = Math.min(Math.max(seconds, 0), this.snapshot.duration);
    player.setTime(target);
    this.update({ position: target });
  }

  /** Calls the listener when the user moves the position: seek() and the player's own onSeek. */
  subscribeSeek(listener: (seconds: number) => void): () => void {
    this.seekListeners.add(listener);
    return () => {
      this.seekListeners.delete(listener);
    };
  }

  /**
   * Calls the listener when a file passed the format checks and is about to replace the current
   * one, before the new player is created. Rejected files do not call it. While the listener runs,
   * the previous file of this track is already released, getSnapshot() already reports 'loading'
   * with the new file name, and there is no player yet (getCurrentTime() returns 0).
   */
  subscribeLoadStart(listener: () => void): () => void {
    this.loadStartListeners.add(listener);
    return () => {
      this.loadStartListeners.delete(listener);
    };
  }

  /** The media element and URL of the ready file; null while empty, loading or without an element. */
  getLoadedMedia(): LoadedMedia | null {
    if (this.snapshot.status !== 'ready' || this.player === null || this.url === null) return null;
    const element = this.player.getMediaElement();
    return element === null ? null : { element, url: this.url };
  }

  setRate(rate: number): void {
    const next = clampPlaybackRate(rate);
    const nudged = this.nudge !== 1;
    this.nudge = 1;
    if (next === this.snapshot.rate && !nudged) return;
    if (this.snapshot.status === 'ready') this.player?.setPlaybackRate(next);
    if (next === this.snapshot.rate) return;
    this.update({ rate: next });
  }

  /** Multiplies the base rate for drift correction; not part of the snapshot. */
  setRateNudge(factor: number): void {
    if (this.snapshot.status !== 'ready' || factor === this.nudge) return;
    this.nudge = factor;
    this.player?.setPlaybackRate(nudgedPlaybackRate(this.snapshot.rate, factor));
  }

  setMuted(muted: boolean): void {
    if (muted === this.snapshot.muted) return;
    if (this.snapshot.status === 'ready') this.player?.setMuted(muted);
    this.update({ muted });
  }

  /** Live position while ready (read it in animation frames), the cue position otherwise. */
  getCurrentTime(): number {
    if (this.snapshot.status === 'ready' && this.player !== null) {
      return this.player.getCurrentTime();
    }
    return this.snapshot.position;
  }

  /** The same object until the state changes. */
  getSnapshot = (): MediaTrackSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /** Destroys the player and revokes its URL; events of that player are ignored from now on. */
  private releaseTrack(): void {
    this.generation += 1;
    const player = this.player;
    const url = this.url;
    this.player = null;
    this.url = null;
    player?.destroy();
    if (url !== null) this.revokeObjectUrl(url);
  }

  private notifySeek(seconds: number): void {
    for (const listener of [...this.seekListeners]) listener(seconds);
  }

  private update(changes: Partial<MediaTrackSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...changes };
    this.notify();
  }

  private notify(): void {
    for (const listener of [...this.listeners]) listener();
  }
}
