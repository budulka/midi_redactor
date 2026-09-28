import type { PedalEvent } from '../state/types.ts';
import type { DragOptions } from './noteEditing.ts';
import {
  applyPedalDrag,
  createPedalAt,
  defaultPedalLength,
  type PedalDragKind,
  type PedalDragState,
} from './pedalEditing.ts';
import type { TimeBounds } from './pedalIntervals.ts';

const opts: DragOptions = { step: 0.125, snap: true };
const free: DragOptions = { step: 0.125, snap: false };
const inf: TimeBounds = { min: 0, max: Infinity };
const fourFour = { numerator: 4, denominator: 4 };

function drag(
  kind: PedalDragKind,
  original: PedalEvent,
  originTime: number,
  bounds: TimeBounds = inf,
): PedalDragState {
  return Object.freeze({
    kind,
    original: Object.freeze({ ...original }),
    originTime,
    bounds: Object.freeze({ ...bounds }),
  });
}

describe('defaultPedalLength', () => {
  it('is one beat, but at least one grid step', () => {
    expect(defaultPedalLength(120, fourFour, opts)).toBe(0.5);
    expect(defaultPedalLength(120, fourFour, { step: 2, snap: true })).toBe(2);
    expect(defaultPedalLength(120, fourFour, free)).toBe(0.5);
  });
});

describe('createPedalAt', () => {
  it('snaps the start down and uses the given length', () => {
    expect(createPedalAt('p', 'sustain', 0.3, 0.5, opts, inf)).toEqual({
      id: 'p',
      type: 'sustain',
      start: 0.25,
      end: 0.75,
    });
    expect(createPedalAt('p', 'sustain', 0.3, 0.5, free, inf)).toMatchObject({
      start: 0.3,
      end: 0.8,
    });
  });

  it('clamps to the gap', () => {
    expect(createPedalAt('p', 'sustain', 0.35, 0.5, opts, { min: 0.3, max: 0.6 })).toMatchObject({
      start: 0.3,
      end: 0.6,
    });
    expect(createPedalAt('p', 'sustain', 0.5, 0.5, opts, { min: 0.5, max: 0.5005 })).toBeNull();
  });
});

describe('applyPedalDrag', () => {
  const created: PedalEvent = { id: 'p', type: 'sustain', start: 0.25, end: 0.75 };
  const a: PedalEvent = { id: 'a', type: 'sustain', start: 0.5, end: 1.5 };

  it('extends a new pedal to the right while creating', () => {
    const bounds = { min: 0.25, max: Infinity };
    expect(applyPedalDrag(drag('create', created, 0.3, bounds), 1.3, opts).end).toBe(1.375);
    expect(applyPedalDrag(drag('create', created, 0.3, bounds), 0.1, opts).end).toBe(0.375);
    expect(applyPedalDrag(drag('create', created, 0.3, { min: 0.25, max: 1 }), 1.3, opts).end).toBe(
      1,
    );
    const unsnapped = { ...created, start: 0.3, end: 0.8 };
    const freeBounds = { min: 0.3, max: Infinity };
    expect(applyPedalDrag(drag('create', unsnapped, 0.3, freeBounds), 1.33, free).end).toBe(1.33);
    expect(applyPedalDrag(drag('create', unsnapped, 0.3, freeBounds), 0.2, free).end).toBeCloseTo(
      0.31,
      12,
    );
  });

  it('moves a pedal keeping its length and stops at the neighbours', () => {
    expect(applyPedalDrag(drag('move', a, 0.6), 0.82, opts)).toEqual({
      ...a,
      start: 0.75,
      end: 1.75,
    });
    expect(applyPedalDrag(drag('move', a, 0.6), 0, opts)).toEqual({ ...a, start: 0, end: 1 });
    const bounds = { min: 0.25, max: 2 };
    expect(applyPedalDrag(drag('move', a, 0.6, bounds), 0, opts)).toEqual({
      ...a,
      start: 0.25,
      end: 1.25,
    });
    expect(applyPedalDrag(drag('move', a, 0.6, bounds), 2, opts)).toEqual({
      ...a,
      start: 1,
      end: 2,
    });
    const moved = applyPedalDrag(drag('move', a, 0.6), 0.83, free);
    expect(moved.start).toBeCloseTo(0.73, 12);
    expect(moved.end - moved.start).toBeCloseTo(1, 12);
    expect(moved).toMatchObject({ id: 'a', type: 'sustain' });
  });

  it('changes the start', () => {
    expect(applyPedalDrag(drag('resize-start', a, 0.5), 0.2, opts)).toEqual({
      ...a,
      start: 0.25,
      end: 1.5,
    });
    expect(applyPedalDrag(drag('resize-start', a, 0.5), 1.6, opts).start).toBe(1.375);
    expect(
      applyPedalDrag(drag('resize-start', a, 0.5, { min: 0.4, max: Infinity }), 0.2, opts).start,
    ).toBe(0.4);
    expect(applyPedalDrag(drag('resize-start', a, 0.5), 1.6, free).start).toBeCloseTo(1.49, 12);
  });

  it('changes the end', () => {
    expect(applyPedalDrag(drag('resize-end', a, 1.5), 1.9, opts)).toEqual({ ...a, end: 1.875 });
    expect(applyPedalDrag(drag('resize-end', a, 1.5), 0, opts).end).toBe(0.625);
    expect(applyPedalDrag(drag('resize-end', a, 1.5, { min: 0, max: 1.7 }), 2.5, opts).end).toBe(
      1.7,
    );
  });
});
