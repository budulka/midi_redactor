import { createContext, useContext } from 'react';

/** Duration of the longest loaded media, seconds; 0 without media. */
export const MediaDurationContext = createContext<number>(0);

/** The timeline covers the loaded media; 0 outside a provider (no media). */
export function useMediaDuration(): number {
  return useContext(MediaDurationContext);
}
