import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { useEditor } from '../../state/editorContext.ts';
import { useProject } from '../../state/projectContext.ts';
import { useTransportApi } from '../../state/transportContext.ts';
import {
  KEYBOARD_WIDTH_PX,
  MEDIA_TIMELINE_HEIGHT_PX,
  ROW_HEIGHT_PX,
  RULER_HEIGHT_PX,
  pitchToY,
  timelineDurationSeconds,
} from '../../utils/pianoRollGeometry.ts';
import { PEDAL_LANE_HEIGHT_PX } from '../../utils/pedalGeometry.ts';
import NoteGrid from './NoteGrid.tsx';
import PedalLabels from './PedalLabels.tsx';
import PedalLane from './PedalLane.tsx';
import PianoKeyboard from './PianoKeyboard.tsx';
import PianoRollToolbar from './PianoRollToolbar.tsx';
import Playhead from './Playhead.tsx';
import TimeRuler from './TimeRuler.tsx';
import './PianoRoll.css';
import { useMediaDuration } from '../../state/timelineContext.ts';

const CENTER_PITCH = 60;

export interface MediaTimelineGeometry {
  /** Timeline length in seconds, the same as the ruler's. */
  readonly durationSeconds: number;
  readonly pixelsPerSecond: number;
}

interface PianoRollProps {
  /** Renders the media timeline row above the ruler; without it the row is absent. */
  mediaTimeline?: (geometry: MediaTimelineGeometry) => ReactNode;
}

/**
 * Piano roll: toolbar on top and one scroll container with a sticky ruler, a sticky keyboard and a
 * sticky pedal lane at the bottom, so the keyboard scrolls vertically with the grid while the
 * ruler and the pedal lane scroll horizontally with it. An optional sticky media timeline row sits
 * above the ruler in the same grid, so it shares the scale and the horizontal scroll.
 */
export default function PianoRoll({ mediaTimeline }: PianoRollProps = {}) {
  const { notes, pedals, bpm, timeSignature } = useProject();
  const { pixelsPerSecond } = useEditor();
  const api = useTransportApi();
  const scrollRef = useRef<HTMLDivElement>(null);
  const mediaDuration = useMediaDuration();
  const durationSeconds = timelineDurationSeconds(notes, bpm, timeSignature, pedals, mediaDuration);
  const hasMediaTimeline = mediaTimeline !== undefined;
  const rulerStyle = hasMediaTimeline ? { top: MEDIA_TIMELINE_HEIGHT_PX } : undefined;

  useLayoutEffect(() => {
    const scroller = scrollRef.current;
    if (scroller === null) return;
    const centerY = pitchToY(CENTER_PITCH, { pixelsPerSecond: 0, rowHeight: ROW_HEIGHT_PX });
    scroller.scrollTop = Math.max(0, centerY - scroller.clientHeight / 2);
  }, []);

  return (
    <section className="piano-roll" aria-label="Piano roll">
      <PianoRollToolbar />
      <div
        ref={scrollRef}
        className="piano-roll__scroll"
        style={{
          gridTemplateColumns: `${KEYBOARD_WIDTH_PX}px max-content`,
          gridTemplateRows: hasMediaTimeline
            ? `${MEDIA_TIMELINE_HEIGHT_PX}px ${RULER_HEIGHT_PX}px max-content ${PEDAL_LANE_HEIGHT_PX}px`
            : `${RULER_HEIGHT_PX}px max-content ${PEDAL_LANE_HEIGHT_PX}px`,
        }}
      >
        {hasMediaTimeline && (
          <>
            <div className="piano-roll__corner piano-roll__corner--media">Media</div>
            <div className="piano-roll__media">
              {mediaTimeline({ durationSeconds, pixelsPerSecond })}
            </div>
          </>
        )}
        <div className="piano-roll__corner" style={rulerStyle} />
        <div className="piano-roll__ruler" style={rulerStyle}>
          <TimeRuler
            durationSeconds={durationSeconds}
            bpm={bpm}
            timeSignature={timeSignature}
            pixelsPerSecond={pixelsPerSecond}
            onSeek={api.seek}
          />
        </div>
        <div className="piano-roll__keyboard">
          <PianoKeyboard rowHeight={ROW_HEIGHT_PX} onNoteOn={api.noteOn} onNoteOff={api.noteOff} />
        </div>
        <NoteGrid />
        <div className="piano-roll__pedal-labels">
          <PedalLabels />
        </div>
        <div className="piano-roll__pedals">
          <PedalLane />
        </div>
        <Playhead scrollRef={scrollRef} />
      </div>
    </section>
  );
}
