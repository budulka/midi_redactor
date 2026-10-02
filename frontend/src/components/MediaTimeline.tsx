import { useRef, type KeyboardEvent, type MouseEvent } from 'react';
import { useMediaTimeMap } from '../state/useMediaTimeMap.ts';
import { useTransportApi, useTransportState } from '../state/transportContext.ts';
import { focusFromPointer } from '../utils/focus.ts';
import {
  hiddenIntroSeconds,
  mediaPositionText,
  mediaTimelineExtent,
  timelineSeekForKey,
} from '../utils/mediaTimeline.ts';
import { timeToX, xToTime } from '../utils/pianoRollGeometry.ts';
import { formatClock } from '../utils/transportFormat.ts';
import type { MediaTimelineGeometry } from './PianoRoll/PianoRoll.tsx';
import { useShownMedia } from './useShownMedia.ts';
import './MediaTimeline.css';

/**
 * The media timeline row above the piano roll ruler: shows where the loaded audio or video lies on
 * the timeline (same scale and scroll as the piano roll) and seeks the whole timeline on a click
 * or with the arrow keys, Home and End.
 */
export default function MediaTimeline({ durationSeconds, pixelsPerSecond }: MediaTimelineGeometry) {
  const { state } = useShownMedia();
  const map = useMediaTimeMap();
  const { position } = useTransportState();
  const api = useTransportApi();
  const trackRef = useRef<HTMLDivElement>(null);

  const geometry = { pixelsPerSecond, rowHeight: 0 };
  const width = durationSeconds * pixelsPerSecond;
  const ready = state.status === 'ready' && state.duration > 0;
  const extent = ready ? mediaTimelineExtent(state.duration, map) : null;
  const introSeconds = ready ? hiddenIntroSeconds(map) : 0;

  const handleMouseDown = (event: MouseEvent<HTMLDivElement>) => {
    const track = trackRef.current;
    if (event.button !== 0 || !ready || track === null) return;
    event.preventDefault();
    focusFromPointer(track);
    const rect = track.getBoundingClientRect();
    api.seek(xToTime(event.clientX - rect.left, geometry));
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!ready) return;
    const value = timelineSeekForKey(position, event.key, event.shiftKey, extent?.end ?? 0);
    if (value === null) return;
    event.preventDefault();
    api.seek(value);
  };

  return (
    <div className="media-timeline" role="group" aria-label="Media timeline" style={{ width }}>
      <div
        ref={trackRef}
        className="media-timeline__track"
        role="slider"
        tabIndex={ready ? 0 : -1}
        aria-label="Media position"
        aria-disabled={!ready}
        aria-valuemin={0}
        aria-valuemax={extent?.end ?? 0}
        aria-valuenow={position}
        aria-valuetext={mediaPositionText(position, map)}
        onMouseDown={handleMouseDown}
        onKeyDown={handleKeyDown}
      >
        {extent !== null && (
          <div
            className="media-timeline__media"
            style={{
              left: timeToX(extent.start, geometry),
              width: timeToX(extent.end, geometry) - timeToX(extent.start, geometry),
            }}
            title={state.fileName ?? undefined}
          />
        )}
        {introSeconds > 0 && (
          <span className="media-timeline__intro">{formatClock(introSeconds)} before bar 1</span>
        )}
        {!ready && (
          <span className="media-timeline__placeholder">
            Load audio or video to see its timeline here
          </span>
        )}
      </div>
    </div>
  );
}
