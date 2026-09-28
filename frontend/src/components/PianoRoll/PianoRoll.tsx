import { useLayoutEffect, useRef } from 'react';
import { useEditor } from '../../state/editorContext.ts';
import { useProject } from '../../state/projectContext.ts';
import {
  KEYBOARD_WIDTH_PX,
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
import TimeRuler from './TimeRuler.tsx';
import './PianoRoll.css';

const CENTER_PITCH = 60;

/**
 * Piano roll: toolbar on top and one scroll container with a sticky ruler, a sticky keyboard and a
 * sticky pedal lane at the bottom, so the keyboard scrolls vertically with the grid while the
 * ruler and the pedal lane scroll horizontally with it.
 */
export default function PianoRoll() {
  const { notes, pedals, bpm, timeSignature } = useProject();
  const { pixelsPerSecond } = useEditor();
  const scrollRef = useRef<HTMLDivElement>(null);
  const durationSeconds = timelineDurationSeconds(notes, bpm, timeSignature, pedals);

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
          gridTemplateRows: `${RULER_HEIGHT_PX}px max-content ${PEDAL_LANE_HEIGHT_PX}px`,
        }}
      >
        <div className="piano-roll__corner" />
        <div className="piano-roll__ruler">
          <TimeRuler
            durationSeconds={durationSeconds}
            bpm={bpm}
            timeSignature={timeSignature}
            pixelsPerSecond={pixelsPerSecond}
          />
        </div>
        <div className="piano-roll__keyboard">
          <PianoKeyboard rowHeight={ROW_HEIGHT_PX} />
        </div>
        <NoteGrid />
        <div className="piano-roll__pedal-labels">
          <PedalLabels />
        </div>
        <div className="piano-roll__pedals">
          <PedalLane />
        </div>
      </div>
    </section>
  );
}
