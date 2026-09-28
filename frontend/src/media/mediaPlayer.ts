/** Callbacks a media player reports to its owner. */
export interface MediaPlayerEvents {
  /** The file is loaded and can play. */
  onReady(duration: number): void;
  onPlay(): void;
  onPause(): void;
  onFinish(): void;
  /** The player's own UI moved the position (waveform click); the seek is already applied. */
  onSeek(time: number): void;
  /** Fetching or decoding failed, or the media element reported an error. */
  onError(error: Error): void;
}

/** A loaded media file; one instance per file. */
export interface MediaPlayer {
  play(): Promise<void>;
  pause(): void;
  setTime(seconds: number): void;
  getCurrentTime(): number;
  /** Always preserves pitch. */
  setPlaybackRate(rate: number): void;
  destroy(): void;
}

export interface CreateMediaPlayerOptions {
  readonly container: HTMLElement;
  readonly url: string;
  readonly events: MediaPlayerEvents;
}

export type CreateMediaPlayer = (options: CreateMediaPlayerOptions) => MediaPlayer;
