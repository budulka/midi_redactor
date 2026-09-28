import type { Note, PedalEvent } from '../state/types.ts';
import {
  DEFAULT_NOTE_VELOCITY,
  MIN_FREE_DURATION,
  applyDrag,
  createNoteAt,
  exceedsDragThreshold,
  minDragDuration,
  withPreview,
  type DragOptions,
  type DragState,
} from './noteEditing.ts';

const opts: DragOptions = { step: 0.125, snap: true };
const free: DragOptions = { step: 0.125, snap: false };

describe('createNoteAt', () => {
  it('snaps the start down to the grid and uses one step as duration', () => {
    expect(createNoteAt('n', 0.3, 60, DEFAULT_NOTE_VELOCITY, opts)).toEqual({
      id: 'n',
      start: 0.25,
      duration: 0.125,
      pitch: 60,
      velocity: 100,
    });
  });

  it('keeps the exact time without snapping', () => {
    const created = createNoteAt('n', 0.3, 60, 100, free);
    expect(created.start).toBe(0.3);
    expect(created.duration).toBe(0.125);
  });
});

describe('minDragDuration', () => {
  it('is one step with snapping and a small constant without', () => {
    expect(minDragDuration(opts)).toBe(0.125);
    expect(minDragDuration(free)).toBe(MIN_FREE_DURATION);
  });
});

describe('applyDrag', () => {
  describe('create', () => {
    const drag: DragState = {
      kind: 'create',
      original: { id: 'n', pitch: 60, start: 0.25, duration: 0.125, velocity: 100 },
      originTime: 0.3,
      originPitch: 60,
    };

    it('extends to the next grid line', () => {
      expect(applyDrag(drag, 0.8, 60, opts).duration).toBeCloseTo(0.625);
    });

    it('keeps the minimum duration when dragged left of the start', () => {
      expect(applyDrag(drag, 0.1, 60, opts).duration).toBe(0.125);
      expect(applyDrag(drag, 0.2, 60, free).duration).toBe(0.01);
    });

    it('follows the mouse without snapping', () => {
      expect(applyDrag(drag, 0.8, 60, free).duration).toBeCloseTo(0.55);
    });

    it('does not move the start or change the pitch', () => {
      const result = applyDrag(drag, 0.8, 70, opts);
      expect(result.start).toBe(0.25);
      expect(result.pitch).toBe(60);
    });
  });

  describe('move', () => {
    const original: Note = { id: 'a', pitch: 60, start: 0.5, duration: 0.5, velocity: 90 };
    const drag: DragState = { kind: 'move', original, originTime: 0.6, originPitch: 60 };

    it('moves in time with snapping and in pitch', () => {
      expect(applyDrag(drag, 0.82, 62, opts)).toEqual({ ...original, start: 0.75, pitch: 62 });
    });

    it('does not move before zero', () => {
      expect(applyDrag(drag, 0, 60, opts).start).toBe(0);
      expect(applyDrag(drag, 0, 60, free).start).toBe(0);
    });

    it('clamps the pitch', () => {
      expect(applyDrag(drag, 0.6, 200, opts).pitch).toBe(108);
      expect(applyDrag(drag, 0.6, 0, opts).pitch).toBe(21);
    });

    it('moves freely without snapping', () => {
      expect(applyDrag(drag, 0.83, 60, free).start).toBeCloseTo(0.73);
    });

    it('keeps id, duration and velocity', () => {
      const result = applyDrag(drag, 1.3, 50, opts);
      expect(result.id).toBe('a');
      expect(result.duration).toBe(0.5);
      expect(result.velocity).toBe(90);
    });
  });

  describe('resize', () => {
    const original: Note = { id: 'a', pitch: 60, start: 0.5, duration: 0.5, velocity: 100 };
    const drag: DragState = { kind: 'resize', original, originTime: 0.97, originPitch: 60 };

    it('snaps the end to the nearest grid line', () => {
      const result = applyDrag(drag, 1.3, 64, opts);
      expect(result.duration).toBeCloseTo(0.875);
      expect(result.start).toBe(0.5);
      expect(result.pitch).toBe(60);
    });

    it('keeps the minimum duration', () => {
      expect(applyDrag(drag, 0, 60, opts).duration).toBe(0.125);
      expect(applyDrag(drag, 0, 60, free).duration).toBe(0.01);
    });
  });
});

describe('exceedsDragThreshold', () => {
  it('compares the distance with the threshold', () => {
    expect(exceedsDragThreshold(2, 0)).toBe(false);
    expect(exceedsDragThreshold(3, 0)).toBe(true);
    expect(exceedsDragThreshold(2, 2.3)).toBe(true);
  });
});

describe('withPreview', () => {
  const a: Note = { id: 'a', pitch: 60, start: 0, duration: 1, velocity: 100 };
  const b: Note = { id: 'b', pitch: 62, start: 1, duration: 1, velocity: 100 };

  it('returns the same array without a preview', () => {
    const notes = [a, b];
    expect(withPreview(notes, null)).toBe(notes);
  });

  it('replaces the note with the same id and keeps the others', () => {
    const notes = Object.freeze([a, b]);
    const preview = { ...a, start: 2 };
    const result = withPreview(notes, preview);
    expect(result).toEqual([preview, b]);
    expect(result[1]).toBe(b);
    expect(notes).toEqual([a, b]);
  });

  it('appends a new note', () => {
    const notes = Object.freeze([a]);
    const preview: Note = { id: 'new', pitch: 50, start: 0, duration: 1, velocity: 100 };
    const result = withPreview(notes, preview);
    expect(result).toEqual([a, preview]);
    expect(result[0]).toBe(a);
    expect(notes).toHaveLength(1);
  });

  it('works with pedals', () => {
    const p1: PedalEvent = { id: 'p1', type: 'sustain', start: 0, end: 1 };
    const p2: PedalEvent = { id: 'p2', type: 'soft', start: 0, end: 1 };
    const pedals = Object.freeze([p1, p2]);
    const moved = { ...p1, start: 0.5 };
    expect(withPreview(pedals, moved)).toEqual([moved, p2]);
    const added: PedalEvent = { id: 'p3', type: 'sostenuto', start: 2, end: 3 };
    expect(withPreview(pedals, added)).toEqual([p1, p2, added]);
  });
});
