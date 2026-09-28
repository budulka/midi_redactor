import type { ReactNode } from 'react';
import { createHtmlVideoPlayer } from '../media/htmlVideoPlayer.ts';
import type { CreateMediaPlayer } from '../media/mediaPlayer.ts';
import { defaultVideoCanPlayType, VideoController } from '../media/VideoController.ts';
import { useMediaTrackController } from './useMediaTrackController.ts';
import { VideoApiContext, VideoStateContext } from './videoContext.ts';

interface VideoProviderProps {
  children: ReactNode;
  createPlayer?: CreateMediaPlayer;
  canPlayType?: (mime: string) => boolean;
}

/** Owns the video controller; the file stays in the browser as an object URL. */
export default function VideoProvider({
  children,
  createPlayer = createHtmlVideoPlayer,
  canPlayType = defaultVideoCanPlayType,
}: VideoProviderProps) {
  const { snapshot, api } = useMediaTrackController(
    () => new VideoController({ createPlayer, canPlayType }),
  );

  return (
    <VideoStateContext.Provider value={snapshot}>
      <VideoApiContext.Provider value={api}>{children}</VideoApiContext.Provider>
    </VideoStateContext.Provider>
  );
}
