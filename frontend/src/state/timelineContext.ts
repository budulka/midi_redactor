import { createContext, useContext } from 'react';

/**
 * Timeline second where the longest loaded media ends (its duration shifted by the media
 * offset), seconds; 0 without media.
 */
export const MediaDurationContext = createContext<number>(0);

/** The timeline covers the loaded media up to its end; 0 outside a provider (no media). */
export function useMediaDuration(): number {
  return useContext(MediaDurationContext);
}
