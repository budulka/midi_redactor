export interface WaveformViewEvents {
  /** The sound is decoded and drawn. */
  onReady(): void;
  /** The user clicked the waveform; the media element is already moved there. */
  onSeek(time: number): void;
  /** The sound could not be fetched or decoded (for example, the video has no sound track). */
  onError(error: Error): void;
}

/** A waveform drawn for a media element owned by someone else; destroy() leaves the element alone. */
export interface WaveformView {
  destroy(): void;
}

export interface CreateWaveformViewOptions {
  readonly container: HTMLElement;
  readonly media: HTMLMediaElement;
  readonly url: string;
  readonly events: WaveformViewEvents;
}

export type CreateWaveformView = (options: CreateWaveformViewOptions) => WaveformView;
