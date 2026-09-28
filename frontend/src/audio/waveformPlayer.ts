/** Callbacks a waveform player reports to its owner. */
export interface WaveformPlayerEvents {
  /** The file is decoded and can play. */
  onReady(duration: number): void;
  onPlay(): void;
  onPause(): void;
  onFinish(): void;
  /** The user clicked the waveform; the seek is already applied. */
  onSeek(time: number): void;
  /** Fetching or decoding failed, or the media element reported an error. */
  onError(error: Error): void;
}

/** A loaded audio file with its waveform; one instance per file. */
export interface WaveformPlayer {
  play(): Promise<void>;
  pause(): void;
  setTime(seconds: number): void;
  getCurrentTime(): number;
  /** Always preserves pitch. */
  setPlaybackRate(rate: number): void;
  destroy(): void;
}

export interface CreateWaveformPlayerOptions {
  readonly container: HTMLElement;
  readonly url: string;
  readonly events: WaveformPlayerEvents;
}

export type CreateWaveformPlayer = (options: CreateWaveformPlayerOptions) => WaveformPlayer;
