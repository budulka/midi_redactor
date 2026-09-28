import { useLayoutEffect } from 'react';
import { useAnimationFrame } from './useAnimationFrame.ts';

/**
 * Shows the position after every render (the live one while playing, the cue one otherwise) and
 * on every animation frame while playing. show() writes to the DOM directly, so playback does not
 * re-render React.
 */
export function useLivePosition(
  playing: boolean,
  cuePosition: number,
  getCurrentTime: () => number,
  show: (seconds: number) => void,
): void {
  useLayoutEffect(() => {
    show(playing ? getCurrentTime() : cuePosition);
  });

  useAnimationFrame(playing, () => show(getCurrentTime()));
}
