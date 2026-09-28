import type { TimeSignature } from '../../state/types.ts';
import { barLabelStep, timeToX } from '../../utils/pianoRollGeometry.ts';
import { TIME_EPSILON, barDurationSeconds } from '../../utils/time.ts';

interface TimeRulerProps {
  durationSeconds: number;
  bpm: number;
  timeSignature: TimeSignature;
  pixelsPerSecond: number;
}

/** Bar numbers along the timeline; labels are thinned out to powers of two when bars are narrow. */
export default function TimeRuler({
  durationSeconds,
  bpm,
  timeSignature,
  pixelsPerSecond,
}: TimeRulerProps) {
  const geometry = { pixelsPerSecond, rowHeight: 0 };
  const barSeconds = barDurationSeconds(bpm, timeSignature);
  const step = barLabelStep(barSeconds * pixelsPerSecond);
  const barCount = Math.floor(durationSeconds / barSeconds + TIME_EPSILON);
  const width = durationSeconds * pixelsPerSecond;

  const labels: { bar: number; x: number }[] = [];
  for (let index = 0; index < barCount; index += step) {
    const x = timeToX(index * barSeconds, geometry);
    if (x >= width) break;
    labels.push({ bar: index + 1, x });
  }

  return (
    <div className="time-ruler" aria-label="Time ruler" style={{ width }}>
      {labels.map(({ bar, x }) => (
        <span key={bar} className="time-ruler__label" style={{ left: x }}>
          {bar}
        </span>
      ))}
    </div>
  );
}
