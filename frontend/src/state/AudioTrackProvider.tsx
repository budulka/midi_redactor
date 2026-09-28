import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { AudioTrackController, defaultCanPlayType } from '../audio/AudioTrackController.ts';
import type { CreateWaveformPlayer } from '../audio/waveformPlayer.ts';
import { createWaveSurferPlayer } from '../audio/waveSurferPlayer.ts';
import {
  AudioTrackApiContext,
  AudioTrackStateContext,
  type AudioTrackApi,
} from './audioTrackContext.ts';

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
  const [controller] = useState(() => new AudioTrackController({ createPlayer, canPlayType }));
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot);

  useEffect(() => () => controller.clear(), [controller]);

  const api = useMemo<AudioTrackApi>(
    () => ({
      loadFile: (file, container) => controller.load(file, container),
      clear: () => controller.clear(),
      togglePlay: () => controller.togglePlay(),
      seek: (seconds) => controller.seek(seconds),
      setRate: (rate) => controller.setRate(rate),
      getCurrentTime: () => controller.getCurrentTime(),
    }),
    [controller],
  );

  return (
    <AudioTrackStateContext.Provider value={snapshot}>
      <AudioTrackApiContext.Provider value={api}>{children}</AudioTrackApiContext.Provider>
    </AudioTrackStateContext.Provider>
  );
}
