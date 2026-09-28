import { useLayoutEffect, useRef, type RefObject } from 'react';
import { useEditor } from '../../state/editorContext.ts';
import { useTransportApi, useTransportState } from '../../state/transportContext.ts';
import { followScrollLeft, timeToX } from '../../utils/pianoRollGeometry.ts';
import { useAnimationFrame } from '../useAnimationFrame.ts';

interface PlayheadProps {
  /** The piano roll scroll container, scrolled to follow the playhead during playback. */
  scrollRef: RefObject<HTMLDivElement | null>;
}

/**
 * Vertical playback cursor across the ruler, the grid and the pedal lane. While playing it is
 * moved in animation frames by writing the DOM directly, so the piano roll does not re-render.
 */
export default function Playhead({ scrollRef }: PlayheadProps) {
  const { status, position } = useTransportState();
  const api = useTransportApi();
  const { pixelsPerSecond, followPlayhead } = useEditor();
  const ref = useRef<HTMLDivElement>(null);
  const playing = status === 'playing';

  const placeAt = (seconds: number): number => {
    // Rounded so clock arithmetic noise (199.99999999999997) does not reach the style.
    const x = Math.round(timeToX(seconds, { pixelsPerSecond, rowHeight: 0 }) * 1000) / 1000;
    if (ref.current !== null) ref.current.style.transform = `translateX(${x}px)`;
    return x;
  };

  useLayoutEffect(() => {
    placeAt(playing ? api.getPosition() : position);
  });

  useAnimationFrame(playing, () => {
    const x = placeAt(api.getPosition());
    const scroller = scrollRef.current;
    if (!followPlayhead || scroller === null) return;
    const scrollLeft = followScrollLeft(x, scroller.scrollLeft, scroller.clientWidth);
    if (scrollLeft !== null) scroller.scrollLeft = scrollLeft;
  });

  return (
    <div ref={ref} className="piano-roll__playhead" data-testid="playhead" aria-hidden="true" />
  );
}
