import { useEffect, useLayoutEffect, useRef } from 'react';

/**
 * Calls callback on every animation frame while active; the latest callback is always used.
 * The frame loop is cancelled when active becomes false and on unmount.
 */
export function useAnimationFrame(active: boolean, callback: () => void): void {
  const callbackRef = useRef(callback);

  useLayoutEffect(() => {
    callbackRef.current = callback;
  });

  useEffect(() => {
    if (!active) return;
    let frameId = requestAnimationFrame(function frame() {
      callbackRef.current();
      frameId = requestAnimationFrame(frame);
    });
    return () => cancelAnimationFrame(frameId);
  }, [active]);
}
