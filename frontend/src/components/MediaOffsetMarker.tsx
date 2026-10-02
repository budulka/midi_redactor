import { useEffect, useLayoutEffect, useRef, type KeyboardEvent, type MouseEvent } from 'react';
import { setMediaOffset } from '../state/actions.ts';
import { useProject, useProjectDispatch } from '../state/projectContext.ts';
import { useTransportApi } from '../state/transportContext.ts';
import { focusFromPointer } from '../utils/focus.ts';
import type { SeekAction } from '../utils/keyActions.ts';
import { markerPercent, offsetForAction, offsetFromPointer } from '../utils/mediaOffset.ts';
import { handleShortcut } from '../utils/shortcutRegistry.ts';
import { formatClock } from '../utils/transportFormat.ts';
import { useDragGesture, type PointerLike } from './PianoRoll/useDragGesture.ts';
import { useShownMedia } from './useShownMedia.ts';

/**
 * The bar 1 marker over the waveform of the audio track: the intro before bar 1 is shaded, and
 * the marker is dragged (or moved with the arrow keys) to set the media offset. During a drag the
 * media previews the new offset; the project changes once, on mouseup.
 */
export default function MediaOffsetMarker() {
  const { mediaOffset } = useProject();
  const dispatch = useProjectDispatch();
  const transportApi = useTransportApi();
  const { state } = useShownMedia();
  const ready = state.status === 'ready' && state.duration > 0;
  const duration = ready ? state.duration : 0;
  const overlayRef = useRef<HTMLDivElement>(null);
  const durationRef = useRef(duration);
  const projectOffsetRef = useRef(mediaOffset);
  const committedRef = useRef(false);

  useLayoutEffect(() => {
    durationRef.current = duration;
    projectOffsetRef.current = mediaOffset;
  });

  const getLocalPoint = (event: PointerLike) => {
    const rect = overlayRef.current?.getBoundingClientRect();
    return { x: event.clientX - (rect?.left ?? 0), y: event.clientY - (rect?.top ?? 0) };
  };
  const drag = useDragGesture<number>(getLocalPoint);

  // Escape ends the gesture without a commit: the media goes back to the project offset.
  const previewing = drag.preview !== null;
  const wasPreviewingRef = useRef(false);
  useEffect(() => {
    if (wasPreviewingRef.current && !previewing && !committedRef.current) {
      transportApi.applyMediaOffset(projectOffsetRef.current);
    }
    wasPreviewingRef.current = previewing;
  }, [previewing, transportApi]);

  if (!ready) return null;

  const shownOffset = drag.preview ?? mediaOffset;
  const percent = markerPercent(shownOffset, duration);

  const handleMouseDown = (event: MouseEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    focusFromPointer(event.currentTarget);
    committedRef.current = false;
    drag.begin({
      startPoint: getLocalPoint(event),
      initialPreview: null,
      update: (point) => {
        const width = overlayRef.current?.getBoundingClientRect().width ?? 0;
        const value = offsetFromPointer(point.x, width, durationRef.current);
        transportApi.applyMediaOffset(value);
        return value;
      },
      commit: (result, moved) => {
        committedRef.current = true;
        if (moved && result !== null) {
          transportApi.applyMediaOffset(result);
          dispatch(setMediaOffset(result));
        } else {
          transportApi.applyMediaOffset(projectOffsetRef.current);
        }
      },
    });
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const move = (action: SeekAction) => {
      dispatch(setMediaOffset(offsetForAction(mediaOffset, action, duration)));
    };
    handleShortcut('barOneMarker', event, {
      stepBack: move,
      stepForward: move,
      bigStepBack: move,
      bigStepForward: move,
      toStart: move,
      toEnd: move,
    });
  };

  return (
    <div className="media-offset-overlay" ref={overlayRef}>
      {percent !== null && (
        <>
          <div className="media-offset-overlay__before" style={{ width: `${percent}%` }} />
          <div
            role="slider"
            tabIndex={0}
            className="media-offset-overlay__marker"
            style={{ left: `${percent}%` }}
            aria-label="Bar 1 position in the media"
            aria-valuemin={0}
            aria-valuemax={duration}
            aria-valuenow={shownOffset}
            aria-valuetext={`Bar 1 at ${formatClock(shownOffset)}`}
            title="Drag to move bar 1 in the media"
            onMouseDown={handleMouseDown}
            onKeyDown={handleKeyDown}
          >
            <span className="media-offset-overlay__label">1</span>
          </div>
        </>
      )}
    </div>
  );
}
