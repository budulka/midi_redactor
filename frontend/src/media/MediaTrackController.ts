import type { MediaFormat, NamedFile } from '../utils/mediaFormats.ts';
import { clampPlaybackRate, DEFAULT_PLAYBACK_RATE } from '../utils/playbackRate.ts';
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

export const EMPTY_MEDIA_TRACK_SNAPSHOT: MediaTrackSnapshot = {
  status: 'empty',
  fileName: null,
  duration: 0,
  playing: false,
  position: 0,
  rate: DEFAULT_PLAYBACK_RATE,
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
  private readonly listeners = new Set<() => void>();

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
    this.snapshot = {
      status: 'loading',
      fileName: file.name,
      duration: 0,
      playing: false,
      position: 0,
      rate: this.snapshot.rate,
      error: null,
    };
    this.player = this.createPlayer({
      container,
      url,
      events: {
        onReady: (duration) => {
          if (!isCurrent()) return;
          this.player?.setPlaybackRate(this.snapshot.rate);
          this.update({ status: 'ready', duration, position: 0 });
        },
        onPlay: () => {
          if (!isCurrent()) return;
          this.update({ playing: true });
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
          this.update({ position: time });
        },
        onError: () => {
          if (!isCurrent()) return;
          this.releaseTrack();
          this.snapshot = {
            ...EMPTY_MEDIA_TRACK_SNAPSHOT,
            rate: this.snapshot.rate,
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
    this.snapshot = { ...EMPTY_MEDIA_TRACK_SNAPSHOT, rate: this.snapshot.rate };
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
    this.update({ position: target });
  }

  setRate(rate: number): void {
    const next = clampPlaybackRate(rate);
    if (next === this.snapshot.rate) return;
    if (this.snapshot.status === 'ready') this.player?.setPlaybackRate(next);
    this.update({ rate: next });
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

  private update(changes: Partial<MediaTrackSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...changes };
    this.notify();
  }

  private notify(): void {
    for (const listener of [...this.listeners]) listener();
  }
}
