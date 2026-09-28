import type { Note } from '../state/types.ts';
import {
  DEFAULT_PIXELS_PER_SECOND,
  ROW_HEIGHT_PX,
  barLabelStep,
  clampZoom,
  gridBackgroundImage,
  gridContentSize,
  gridLayers,
  hitTestNotes,
  noteRect,
  pitchToY,
  timeToX,
  timelineDurationSeconds,
  velocityToOpacity,
  xToTime,
  yToPitch,
  type ViewGeometry,
} from './pianoRollGeometry.ts';
import { KEYBOARD_PITCHES } from './pitch.ts';

const g: ViewGeometry = { pixelsPerSecond: DEFAULT_PIXELS_PER_SECOND, rowHeight: ROW_HEIGHT_PX };
const fourFour = { numerator: 4, denominator: 4 };

function note(id: string, pitch: number, start: number, duration: number): Note {
  return { id, pitch, start, duration, velocity: 100 };
}

describe('pitch <-> y', () => {
  it('maps pitches to row tops', () => {
    expect(pitchToY(108, g)).toBe(0);
    expect(pitchToY(21, g)).toBe(1218);
  });

  it('maps y to the pitch of the row, clamping outside the keyboard', () => {
    expect(yToPitch(0, g)).toBe(108);
    expect(yToPitch(13.9, g)).toBe(108);
    expect(yToPitch(14, g)).toBe(107);
    expect(yToPitch(1231, g)).toBe(21);
    expect(yToPitch(5000, g)).toBe(21);
    expect(yToPitch(-5, g)).toBe(108);
  });

  it('round-trips every key', () => {
    for (const pitch of KEYBOARD_PITCHES) {
      expect(yToPitch(pitchToY(pitch, g) + 1, g)).toBe(pitch);
    }
  });
});

describe('time <-> x', () => {
  it('converts with pixels per second and never returns negative time', () => {
    expect(timeToX(1.5, g)).toBe(150);
    expect(xToTime(250, g)).toBe(2.5);
    expect(xToTime(-10, g)).toBe(0);
  });
});

describe('noteRect', () => {
  it('returns the note rectangle', () => {
    expect(noteRect(note('a', 60, 0.5, 0.5), g)).toEqual({ x: 50, y: 672, width: 50, height: 14 });
  });
});

describe('hitTestNotes', () => {
  const a = note('a', 60, 0.5, 0.5);

  it('finds the body and the resize zone', () => {
    expect(hitTestNotes([a], { x: 60, y: 679 }, g)).toEqual({ noteId: 'a', zone: 'body' });
    expect(hitTestNotes([a], { x: 95, y: 679 }, g)).toEqual({ noteId: 'a', zone: 'resize' });
    expect(hitTestNotes([a], { x: 94, y: 679 }, g)).toEqual({ noteId: 'a', zone: 'resize' });
    expect(hitTestNotes([a], { x: 93, y: 679 }, g)).toEqual({ noteId: 'a', zone: 'body' });
  });

  it('excludes the right and bottom edges', () => {
    expect(hitTestNotes([a], { x: 100, y: 679 }, g)).toBeNull();
    expect(hitTestNotes([a], { x: 60, y: 686 }, g)).toBeNull();
  });

  it('keeps the resize zone within a third of a narrow note', () => {
    const narrow = note('n', 60, 0.5, 0.09);
    const x = 50;
    expect(hitTestNotes([narrow], { x: x + 5, y: 679 }, g)).toEqual({ noteId: 'n', zone: 'body' });
    expect(hitTestNotes([narrow], { x: x + 6, y: 679 }, g)).toEqual({
      noteId: 'n',
      zone: 'resize',
    });
  });

  it('returns the last of overlapping notes', () => {
    const b = note('b', 60, 0.6, 0.5);
    expect(hitTestNotes([a, b], { x: 70, y: 679 }, g)?.noteId).toBe('b');
    expect(hitTestNotes([b, a], { x: 70, y: 679 }, g)?.noteId).toBe('a');
  });

  it('returns null for no notes', () => {
    expect(hitTestNotes([], { x: 60, y: 679 }, g)).toBeNull();
  });
});

describe('timelineDurationSeconds', () => {
  it('is at least the minimum', () => {
    expect(timelineDurationSeconds([], 120, fourFour)).toBe(60);
    expect(timelineDurationSeconds([], 120, { numerator: 3, denominator: 4 })).toBe(60);
  });

  it('extends two bars past the last note, rounded up to a whole bar', () => {
    expect(timelineDurationSeconds([note('a', 60, 70, 0.5)], 120, fourFour)).toBe(76);
  });
});

describe('gridContentSize', () => {
  it('covers the timeline and all keys', () => {
    expect(gridContentSize(60, g)).toEqual({ width: 6000, height: 1232 });
  });
});

describe('gridLayers', () => {
  it('returns bar, beat and step periods', () => {
    expect(gridLayers(120, fourFour, '1/16', 100)).toEqual({
      barPx: 200,
      beatPx: 50,
      stepPx: 12.5,
    });
    expect(gridLayers(120, { numerator: 6, denominator: 8 }, '1/16', 100)).toEqual({
      barPx: 150,
      beatPx: 25,
      stepPx: 12.5,
    });
  });

  it('drops the step layer when the step is not shorter than a beat', () => {
    expect(gridLayers(120, fourFour, '1/4', 100).stepPx).toBeNull();
    expect(gridLayers(120, fourFour, '1/2', 100).stepPx).toBeNull();
  });

  it('drops dense layers', () => {
    expect(gridLayers(120, fourFour, '1/32', 20)).toEqual({ barPx: 40, beatPx: 10, stepPx: null });
    expect(gridLayers(300, fourFour, '1/1', 20).beatPx).toBe(4);
  });

  it('drops the beat layer for one beat per bar', () => {
    expect(gridLayers(120, { numerator: 1, denominator: 4 }, '1/16', 100).beatPx).toBeNull();
  });
});

describe('gridBackgroundImage', () => {
  it('stacks bar lines first and skips missing layers', () => {
    const css = gridBackgroundImage({ barPx: 200, beatPx: 50, stepPx: null });
    expect(css.match(/repeating-linear-gradient/g)).toHaveLength(2);
    expect(css).toContain('200px');
    expect(css).toContain('50px');
    expect(css.indexOf('var(--grid-bar)')).toBeLessThan(css.indexOf('var(--grid-beat)'));
    expect(css).not.toContain('--grid-step');
    const single = gridBackgroundImage({ barPx: 200, beatPx: null, stepPx: null });
    expect(single.match(/repeating-linear-gradient/g)).toHaveLength(1);
  });

  it('includes the step layer', () => {
    expect(gridBackgroundImage({ barPx: 200, beatPx: 50, stepPx: 12.5 })).toContain(
      'var(--grid-step) 0 1px, transparent 1px 12.5px',
    );
  });
});

describe('barLabelStep', () => {
  it('returns the smallest power of two that keeps labels apart', () => {
    expect(barLabelStep(200)).toBe(1);
    expect(barLabelStep(25)).toBe(2);
    expect(barLabelStep(5)).toBe(8);
    expect(barLabelStep(0)).toBe(1);
  });
});

describe('clampZoom', () => {
  it('keeps zoom within limits', () => {
    expect(clampZoom(5)).toBe(20);
    expect(clampZoom(5000)).toBe(1000);
    expect(clampZoom(150)).toBe(150);
  });
});

describe('velocityToOpacity', () => {
  it('maps velocity to opacity and grows monotonically', () => {
    expect(velocityToOpacity(1)).toBeCloseTo(0.35);
    expect(velocityToOpacity(127)).toBeCloseTo(1);
    for (let v = 1; v < 127; v += 1) {
      expect(velocityToOpacity(v + 1)).toBeGreaterThan(velocityToOpacity(v));
    }
  });
});
