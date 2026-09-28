import { createContext, useContext } from 'react';
import type { MediaTrackSnapshot } from '../media/MediaTrackController.ts';
import type { MediaTrackApi } from './useMediaTrackController.ts';

export const VideoStateContext = createContext<MediaTrackSnapshot | null>(null);
export const VideoApiContext = createContext<MediaTrackApi | null>(null);

export function useVideoState(): MediaTrackSnapshot {
  const state = useContext(VideoStateContext);
  if (state === null) {
    throw new Error('useVideoState must be used within VideoProvider');
  }
  return state;
}

export function useVideoApi(): MediaTrackApi {
  const api = useContext(VideoApiContext);
  if (api === null) {
    throw new Error('useVideoApi must be used within VideoProvider');
  }
  return api;
}
