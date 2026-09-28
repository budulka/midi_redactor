import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import type { MediaTrackController, MediaTrackSnapshot } from '../media/MediaTrackController.ts';

/** Stable media track commands; the same object for the whole lifetime of the controller. */
export interface MediaTrackApi {
  /** The controller itself, for the transport synchronization. */
  readonly controller: MediaTrackController;
  loadFile(file: File, container: HTMLElement): void;
  clear(): void;
  togglePlay(): void;
  seek(seconds: number): void;
  setRate(rate: number): void;
  setMuted(muted: boolean): void;
  /** Live position while playing (read it in animation frames, it does not trigger renders). */
  getCurrentTime(): number;
}

/**
 * Creates a media track controller once, subscribes to its snapshot and releases the file on
 * unmount.
 */
export function useMediaTrackController(create: () => MediaTrackController): {
  readonly controller: MediaTrackController;
  readonly snapshot: MediaTrackSnapshot;
  readonly api: MediaTrackApi;
} {
  const [controller] = useState(create);
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot);

  useEffect(() => () => controller.clear(), [controller]);

  const api = useMemo<MediaTrackApi>(
    () => ({
      controller,
      loadFile: (file, container) => controller.load(file, container),
      clear: () => controller.clear(),
      togglePlay: () => controller.togglePlay(),
      seek: (seconds) => controller.seek(seconds),
      setRate: (rate) => controller.setRate(rate),
      setMuted: (muted) => controller.setMuted(muted),
      getCurrentTime: () => controller.getCurrentTime(),
    }),
    [controller],
  );

  return { controller, snapshot, api };
}
