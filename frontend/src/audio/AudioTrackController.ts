import {
  decodeFailedMessage,
  detectAudioFormat,
  unplayableFormatMessage,
  unsupportedFileMessage,
} from '../utils/audioFormats.ts';
import { clampPlaybackRate, DEFAULT_PLAYBACK_RATE } from '../utils/playbackRate.ts';
import type { CreateWaveformPlayer, WaveformPlayer } from './waveformPlayer.ts';

export type AudioTrackStatus = 'empty' | 'loading' | 'ready';

export interface AudioTrackSnapshot {
  readonly status: AudioTrackStatus;
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

export interface AudioTrackControllerOptions {
  readonly createPlayer: CreateWaveformPlayer;
  readonly canPlayType: (mime: string) => boolean;
  readonly createObjectUrl?: (file: Blob) => string;
  readonly revokeObjectUrl?: (url: string) => void;
}

export const PLAY_FAILED_MESSAGE = 'Could not start audio playback.';

const EMPTY_SNAPSHOT: AudioTrackSnapshot = {
  status: 'empty',
  fileName: null,
  duration: 0,
  playing: false,
  position: 0,
  rate: DEFAULT_PLAYBACK_RATE,
  error: null,
};

/** True when the browser reports it may play the MIME type. */
export function defaultCanPlayType(mime: string): boolean {
  return document.createElement('audio').canPlayType(mime) !== '';
}

function isAbortError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { readonly name?: unknown }).name === 'AbortError'
  );
}

/**
 * Owns the audio file of the audio track: validates the file, creates one waveform player per
 * file and keeps a snapshot of its state. Events of a player that was replaced are ignored.
 */
export class AudioTrackController {
  private readonly createPlayer: CreateWaveformPlayer;
  private readonly canPlayType: (mime: string) => boolean;
  private readonly createObjectUrl: (file: Blob) => string;
  private readonly revokeObjectUrl: (url: string) => void;
  private player: WaveformPlayer | null = null;
  private url: string | null = null;
  private generation = 0;
  private snapshot: AudioTrackSnapshot = EMPTY_SNAPSHOT;
  private readonly listeners = new Set<() => void>();

  constructor(options: AudioTrackControllerOptions) {
    this.createPlayer = options.createPlayer;
    this.canPlayType = options.canPlayType;
    this.createObjectUrl = options.createObjectUrl ?? ((file) => URL.createObjectURL(file));
    this.revokeObjectUrl = options.revokeObjectUrl ?? ((url) => URL.revokeObjectURL(url));
  }

  load(file: File, container: HTMLElement): void {
    const format = detectAudioFormat(file);
    if (format === null) {
      this.update({ error: unsupportedFileMessage(file.name) });
      return;
    }
    if (!this.canPlayType(format.probeType)) {
      this.update({ error: unplayableFormatMessage(format) });
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
            ...EMPTY_SNAPSHOT,
            rate: this.snapshot.rate,
            error: decodeFailedMessage(file.name),
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
    this.snapshot = { ...EMPTY_SNAPSHOT, rate: this.snapshot.rate };
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
      this.update({ playing: false, error: PLAY_FAILED_MESSAGE });
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
  getSnapshot = (): AudioTrackSnapshot => this.snapshot;

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

  private update(changes: Partial<AudioTrackSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...changes };
    this.notify();
  }

  private notify(): void {
    for (const listener of [...this.listeners]) listener();
  }
}
