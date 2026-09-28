import type { ReactNode } from 'react';
import { AudioTrackController, defaultCanPlayType } from '../audio/AudioTrackController.ts';
import type { CreateWaveformPlayer } from '../audio/waveformPlayer.ts';
import { createWaveSurferPlayer } from '../audio/waveSurferPlayer.ts';
import { AudioTrackApiContext, AudioTrackStateContext } from './audioTrackContext.ts';
import { useMediaTrackController } from './useMediaTrackController.ts';

interface AudioTrackProviderProps {
  children: ReactNode;
  createPlayer?: CreateWaveformPlayer;
  canPlayType?: (mime: string) => boolean;
}

/** Owns the audio track controller; the file stays in the browser as an object URL. */
export default function AudioTrackProvider({
  children,
  createPlayer = createWaveSurferPlayer,
  canPlayType = defaultCanPlayType,
}: AudioTrackProviderProps) {
  const { snapshot, api } = useMediaTrackController(
    () => new AudioTrackController({ createPlayer, canPlayType }),
  );

  return (
    <AudioTrackStateContext.Provider value={snapshot}>
      <AudioTrackApiContext.Provider value={api}>{children}</AudioTrackApiContext.Provider>
    </AudioTrackStateContext.Provider>
  );
}
