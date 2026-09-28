/** `playback` is used by the transport, `live` by the on-screen keyboard; they never cut each other. */
export type EngineChannel = 'playback' | 'live';

/** Sound output used by the transport and the keyboard; implemented with Tone.js in toneEngine.ts. */
export interface PianoEngine {
  /** Current time of the audio clock (AudioContext.currentTime), seconds. */
  now(): number;
  /** Resumes the audio context; call synchronously inside a user gesture handler. */
  resume(): Promise<void>;
  /** velocity: MIDI 1–127; time: audio clock seconds. */
  attack(channel: EngineChannel, pitch: number, velocity: number, time: number): void;
  /** Stops every voice of this pitch on the channel at time. */
  release(channel: EngineChannel, pitch: number, time: number): void;
  releaseAll(channel: EngineChannel, time: number): void;
  /** Calls callback every intervalSeconds (not throttled in background tabs); returns a stop function. */
  startTicker(callback: () => void, intervalSeconds: number): () => void;
  dispose(): void;
}
