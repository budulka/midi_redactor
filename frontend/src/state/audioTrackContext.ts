import { createContext, useContext } from 'react';
import type { AudioTrackSnapshot } from '../audio/AudioTrackController.ts';

/** Stable audio track commands; the same object for the whole lifetime of the provider. */
export interface AudioTrackApi {
  loadFile(file: File, container: HTMLElement): void;
  clear(): void;
  togglePlay(): void;
  seek(seconds: number): void;
  setRate(rate: number): void;
  /** Live position while playing (read it in animation frames, it does not trigger renders). */
  getCurrentTime(): number;
}

export const AudioTrackStateContext = createContext<AudioTrackSnapshot | null>(null);
export const AudioTrackApiContext = createContext<AudioTrackApi | null>(null);

export function useAudioTrackState(): AudioTrackSnapshot {
  const state = useContext(AudioTrackStateContext);
  if (state === null) {
    throw new Error('useAudioTrackState must be used within AudioTrackProvider');
  }
  return state;
}

export function useAudioTrackApi(): AudioTrackApi {
  const api = useContext(AudioTrackApiContext);
  if (api === null) {
    throw new Error('useAudioTrackApi must be used within AudioTrackProvider');
  }
  return api;
}
