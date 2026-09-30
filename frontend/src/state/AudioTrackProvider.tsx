import type { ReactNode } from 'react';
import { AudioTrackController, defaultCanPlayType } from '../audio/AudioTrackController.ts';
import type { CreateWaveformPlayer } from '../audio/waveformPlayer.ts';
import type { CreateWaveformView } from '../audio/waveformView.ts';
import { createWaveSurferPlayer, createWaveSurferView } from '../audio/waveSurferPlayer.ts';
import {
  AudioTrackApiContext,
  AudioTrackStateContext,
  WaveformViewFactoryContext,
} from './audioTrackContext.ts';
import { useMediaTrackController } from './useMediaTrackController.ts';

interface AudioTrackProviderProps {
  children: ReactNode;
  createPlayer?: CreateWaveformPlayer;
  canPlayType?: (mime: string) => boolean;
  /** Draws the waveform of a video's sound; replaced by a fake in tests. */
  createWaveformView?: CreateWaveformView;
}

/** Owns the audio track controller; the file stays in the browser as an object URL. */
export default function AudioTrackProvider({
  children,
  createPlayer = createWaveSurferPlayer,
  canPlayType = defaultCanPlayType,
  createWaveformView = createWaveSurferView,
}: AudioTrackProviderProps) {
  const { snapshot, api } = useMediaTrackController(
    () => new AudioTrackController({ createPlayer, canPlayType }),
  );

  return (
    <AudioTrackStateContext.Provider value={snapshot}>
      <AudioTrackApiContext.Provider value={api}>
        <WaveformViewFactoryContext.Provider value={createWaveformView}>
          {children}
        </WaveformViewFactoryContext.Provider>
      </AudioTrackApiContext.Provider>
    </AudioTrackStateContext.Provider>
  );
}
