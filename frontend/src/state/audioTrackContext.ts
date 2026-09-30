import { createContext, useContext } from 'react';
import type { AudioTrackSnapshot } from '../audio/AudioTrackController.ts';
import type { CreateWaveformView } from '../audio/waveformView.ts';
import type { MediaTrackApi } from './useMediaTrackController.ts';

/** Stable audio track commands; the same object for the whole lifetime of the provider. */
export type AudioTrackApi = MediaTrackApi;

export const AudioTrackStateContext = createContext<AudioTrackSnapshot | null>(null);
export const AudioTrackApiContext = createContext<AudioTrackApi | null>(null);
/** Draws waveforms for media elements of other tracks (the sound of a video). */
export const WaveformViewFactoryContext = createContext<CreateWaveformView | null>(null);

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

export function useCreateWaveformView(): CreateWaveformView {
  const create = useContext(WaveformViewFactoryContext);
  if (create === null) {
    throw new Error('useCreateWaveformView must be used within AudioTrackProvider');
  }
  return create;
}
