/** Implemented by MediaTrackController. */
export interface ExclusiveMediaTrack {
  subscribeLoadStart(listener: () => void): () => void;
  clear(): void;
}

/**
 * Keeps at most one of the tracks loaded: when one starts loading a file, every other track is
 * cleared (its player is destroyed, its object URL revoked). Returns a function that stops it.
 */
export function keepSingleMediaSource(tracks: readonly ExclusiveMediaTrack[]): () => void {
  const unsubscribers = tracks.map((track) =>
    track.subscribeLoadStart(() => {
      for (const other of tracks) {
        if (other !== track) other.clear();
      }
    }),
  );
  return () => {
    for (const unsubscribe of unsubscribers) unsubscribe();
  };
}
