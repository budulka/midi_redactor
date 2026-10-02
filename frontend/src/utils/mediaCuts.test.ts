import { describe, expect, it } from 'vitest';
import { MAX_MEDIA_CUTS, MAX_MEDIA_CUT_END } from '../state/constants.ts';
import type { MediaCut } from '../state/types.ts';
import {
  addCut,
  cutDescription,
  cutEdgeForAction,
  cutEdgeLimits,
  cutRangeForSelection,
  cutShadePercent,
  draggedCutEdge,
  normalizeCutRange,
  removeCut,
  updateCut,
} from './mediaCuts.ts';

function cut(id: string, start: number, end: number): MediaCut {
  return { id, start, end };
}

const a = cut('a', 2, 5);
const b = cut('b', 6, 8);

describe('normalizeCutRange', () => {
  it('rounds to 1 ms and clamps to the allowed range', () => {
    expect(normalizeCutRange({ start: 2.0004, end: 5.0006 })).toEqual({ start: 2, end: 5.001 });
    expect(normalizeCutRange({ start: -1, end: 3 })).toEqual({ start: 0, end: 3 });
    expect(normalizeCutRange({ start: 10, end: 1e9 })).toEqual({
      start: 10,
      end: MAX_MEDIA_CUT_END,
    });
  });

  it('rejects short, reversed and non-finite ranges', () => {
    expect(normalizeCutRange({ start: 2, end: 2.005 })).toBeNull();
    expect(normalizeCutRange({ start: NaN, end: 3 })).toBeNull();
    expect(normalizeCutRange({ start: 5, end: 2 })).toBeNull();
  });

  it('accepts the shortest cut', () => {
    expect(normalizeCutRange({ start: 2, end: 2.01 })).toEqual({ start: 2, end: 2.01 });
  });
});

describe('addCut', () => {
  it('adds cuts in order', () => {
    expect(addCut([], a)).toEqual([a]);
    expect(addCut([a], b)).toEqual([a, b]);
    expect(addCut([b], a)).toEqual([a, b]);
  });

  it('merges every cut the new one overlaps, keeping the new id', () => {
    expect(addCut([a, b], cut('c', 4, 7))).toEqual([cut('c', 2, 8)]);
  });

  it('merges a touching cut', () => {
    expect(addCut([a], cut('c', 5, 6))).toEqual([cut('c', 2, 6)]);
  });

  it('returns the same array when an existing cut covers the range', () => {
    const cuts = [a];
    expect(addCut(cuts, cut('c', 3, 4))).toBe(cuts);
  });

  it('returns the same array when the list is full', () => {
    const cuts = Array.from({ length: MAX_MEDIA_CUTS }, (_, index) =>
      cut(`c${index}`, index, index + 0.5),
    );
    expect(addCut(cuts, cut('x', 2000, 2001))).toBe(cuts);
  });
});

describe('updateCut', () => {
  it('moves the edges of one cut and keeps the others', () => {
    const cuts = [a, b];
    const next = updateCut(cuts, 'a', { start: 2, end: 5.5 });
    expect(next).toEqual([cut('a', 2, 5.5), b]);
    expect(next?.[1]).toBe(b);
  });

  it('rejects a range that touches another cut', () => {
    expect(updateCut([a, b], 'a', { start: 2, end: 6 })).toBeNull();
  });

  it('rejects an unknown id and an invalid range', () => {
    expect(updateCut([a, b], 'x', { start: 2, end: 5.5 })).toBeNull();
    expect(updateCut([a, b], 'a', { start: 2, end: 2.005 })).toBeNull();
    expect(updateCut([a, b], 'a', { start: -1, end: 3 })).toBeNull();
  });

  it('returns the same array when nothing changes', () => {
    const cuts = [a, b];
    expect(updateCut(cuts, 'a', { start: 2, end: 5 })).toBe(cuts);
  });
});

describe('removeCut', () => {
  it('removes the cut', () => {
    expect(removeCut([a, b], 'a')).toEqual([b]);
  });

  it('returns the same array for an unknown id', () => {
    const cuts = [a];
    expect(removeCut(cuts, 'x')).toBe(cuts);
  });
});

describe('cutEdgeLimits', () => {
  it('keeps the edges between the neighbours and the media', () => {
    expect(cutEdgeLimits([a, b], 'b', 'start', 30, 0)).toEqual({ start: 5.001, end: 7.99 });
    expect(cutEdgeLimits([a, b], 'b', 'end', 30, 0)).toEqual({ start: 6.01, end: 30 });
    expect(cutEdgeLimits([a, b], 'a', 'end', 30, 0)).toEqual({ start: 2.01, end: 5.999 });
  });

  it('stops the start of a cut after bar 1 at the offset', () => {
    expect(cutEdgeLimits([a, b], 'a', 'start', 30, 1)).toEqual({ start: 1, end: 4.99 });
  });

  it('keeps bar 1 inside a cut that contains it', () => {
    expect(cutEdgeLimits([a], 'a', 'end', 30, 3)).toEqual({ start: 3, end: 30 });
    expect(cutEdgeLimits([a], 'a', 'start', 30, 3)).toEqual({ start: 0, end: 3 });
  });

  it('handles the offset on the edges of the cut', () => {
    expect(cutEdgeLimits([a], 'a', 'end', 30, 5)).toEqual({ start: 5, end: 30 });
    expect(cutEdgeLimits([a], 'a', 'start', 30, 2)).toEqual({ start: 2, end: 4.99 });
  });

  it('keeps the shortest cut when the offset is just after the start', () => {
    expect(cutEdgeLimits([a], 'a', 'end', 30, 2.001).start).toBe(2.01);
  });

  it('has no offset bound for a cut wholly before bar 1', () => {
    expect(cutEdgeLimits([a], 'a', 'end', 30, 8)).toEqual({ start: 2.01, end: 30 });
  });

  it('uses the largest end when the media duration is unknown', () => {
    expect(cutEdgeLimits([a, b], 'b', 'end', 0, 0).end).toBe(MAX_MEDIA_CUT_END);
  });
});

describe('draggedCutEdge', () => {
  const limits = { start: 2.01, end: 30 };

  it('moves the edge by the delta within the limits', () => {
    expect(draggedCutEdge(5, 0.5, limits)).toBe(5.5);
    expect(draggedCutEdge(5, -10, limits)).toBe(2.01);
    expect(draggedCutEdge(5, 100, limits)).toBe(30);
  });

  it('rounds to 1 ms', () => {
    expect(draggedCutEdge(5, 0.00049, limits)).toBe(5);
  });
});

describe('cutEdgeForAction', () => {
  const limits = { start: 2.01, end: 30 };

  it('moves the edge with the arrow keys', () => {
    expect(cutEdgeForAction(5, 'stepForward', limits)).toBe(5.01);
    expect(cutEdgeForAction(5, 'bigStepBack', limits)).toBe(4.9);
  });

  it('stays within the limits', () => {
    expect(cutEdgeForAction(2.01, 'stepBack', limits)).toBe(2.01);
    expect(cutEdgeForAction(29.95, 'bigStepForward', limits)).toBe(30);
  });
});

describe('cutRangeForSelection', () => {
  it('maps a timeline selection onto the media', () => {
    expect(cutRangeForSelection({ start: 5, end: 8 }, { offset: 0, cuts: [] }, 30)).toEqual({
      start: 5,
      end: 8,
    });
    expect(cutRangeForSelection({ start: 5, end: 8 }, { offset: 1, cuts: [] }, 30)).toEqual({
      start: 6,
      end: 9,
    });
  });

  it('covers an existing cut inside the selection', () => {
    expect(
      cutRangeForSelection({ start: 1, end: 3 }, { offset: 0, cuts: [{ start: 2, end: 5 }] }, 30),
    ).toEqual({ start: 1, end: 6 });
  });

  it('clamps to the media', () => {
    expect(cutRangeForSelection({ start: 25, end: 40 }, { offset: 0, cuts: [] }, 30)).toEqual({
      start: 25,
      end: 30,
    });
    expect(cutRangeForSelection({ start: 31, end: 40 }, { offset: 0, cuts: [] }, 30)).toBeNull();
  });
});

describe('cutDescription', () => {
  it('describes the range and its length', () => {
    expect(cutDescription({ start: 5, end: 8 })).toBe('Cut 0:05.000–0:08.000 (3.000 s)');
  });
});

describe('cutShadePercent', () => {
  it('places the cut on the whole media', () => {
    expect(cutShadePercent({ start: 3, end: 6 }, 30)).toEqual({ left: 10, width: 10 });
    const clipped = cutShadePercent({ start: 25, end: 40 }, 30);
    expect(clipped?.left).toBeCloseTo(83.333, 3);
    expect(clipped?.width).toBeCloseTo(16.667, 3);
  });

  it('skips a cut past the end or an unknown duration', () => {
    expect(cutShadePercent({ start: 31, end: 40 }, 30)).toBeNull();
    expect(cutShadePercent({ start: 3, end: 6 }, 0)).toBeNull();
  });
});
