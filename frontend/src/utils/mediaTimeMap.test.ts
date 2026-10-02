import { describe, expect, it } from 'vitest';
import {
  IDENTITY_MEDIA_TIME_MAP,
  cutPoints,
  editedMediaTime,
  mediaSegmentAt,
  mediaTimeMapOf,
  mediaTimelineEnd,
  mediaToTimeline,
  nextCutPoint,
  rawMediaTime,
  sameMediaTimeMap,
  timelineToMedia,
} from './mediaTimeMap.ts';

describe('mediaToTimeline', () => {
  it('subtracts the offset', () => {
    expect(mediaToTimeline(5, { offset: 3.2, cuts: [] })).toBeCloseTo(1.8, 9);
    expect(mediaToTimeline(3.2, { offset: 3.2, cuts: [] })).toBe(0);
    expect(mediaToTimeline(1, { offset: 3.2, cuts: [] })).toBeCloseTo(-2.2, 9);
    expect(mediaToTimeline(0, { offset: -1.5, cuts: [] })).toBe(1.5);
  });

  it('returns the input for the identity map', () => {
    expect(mediaToTimeline(7.25, IDENTITY_MEDIA_TIME_MAP)).toBe(7.25);
  });
});

describe('timelineToMedia', () => {
  it('adds the offset', () => {
    expect(timelineToMedia(0, { offset: 3.2, cuts: [] })).toBe(3.2);
    expect(timelineToMedia(1, { offset: -1.5, cuts: [] })).toBe(-0.5);
  });

  it('returns the input for the identity map', () => {
    expect(timelineToMedia(7.25, IDENTITY_MEDIA_TIME_MAP)).toBe(7.25);
  });

  it.each([-2.5, 0, 3.2])('round-trips with offset %s', (offset) => {
    const map = { offset, cuts: [] };
    for (const t of [0, 0.001, 1.5, 100]) {
      expect(mediaToTimeline(timelineToMedia(t, map), map)).toBeCloseTo(t, 9);
    }
  });
});

describe('mediaTimelineEnd', () => {
  it('gives the timeline second where the media ends', () => {
    expect(mediaTimelineEnd(30, { offset: 3.2, cuts: [] })).toBeCloseTo(26.8, 9);
    expect(mediaTimelineEnd(30, { offset: -2, cuts: [] })).toBe(32);
    expect(mediaTimelineEnd(2, { offset: 5, cuts: [] })).toBe(0);
    expect(mediaTimelineEnd(30, IDENTITY_MEDIA_TIME_MAP)).toBe(30);
  });
});

describe('sameMediaTimeMap', () => {
  it('compares the offsets', () => {
    expect(sameMediaTimeMap({ offset: 1, cuts: [] }, { offset: 1, cuts: [] })).toBe(true);
    expect(sameMediaTimeMap({ offset: 1, cuts: [] }, { offset: 1.001, cuts: [] })).toBe(false);
  });
});

describe('mediaTimeMapOf', () => {
  it('takes the offset from the project', () => {
    expect(mediaTimeMapOf({ mediaOffset: 1.25, mediaCuts: [] })).toEqual({
      offset: 1.25,
      cuts: [],
    });
  });
});

const C = [{ start: 2, end: 5 }];
const CC = [
  { start: 2, end: 5 },
  { start: 6, end: 8 },
];

describe('editedMediaTime', () => {
  it('removes the cut length before a media second', () => {
    expect(editedMediaTime(1, C)).toBe(1);
    expect(editedMediaTime(2, C)).toBe(2);
    expect(editedMediaTime(3, C)).toBe(2);
    expect(editedMediaTime(5, C)).toBe(2);
    expect(editedMediaTime(6, C)).toBe(3);
    expect(editedMediaTime(9, CC)).toBe(4);
  });

  it('returns the input without cuts', () => {
    expect(editedMediaTime(-1.5, [])).toBe(-1.5);
    expect(editedMediaTime(7, [])).toBe(7);
  });
});

describe('rawMediaTime', () => {
  it('inverts editedMediaTime, taking the end of a cut at its cut point', () => {
    expect(rawMediaTime(1.9, C)).toBe(1.9);
    expect(rawMediaTime(2, C)).toBe(5);
    expect(rawMediaTime(3, C)).toBe(6);
    expect(rawMediaTime(3, CC)).toBe(8);
    expect(rawMediaTime(2.5, CC)).toBe(5.5);
  });
});

describe('mapping with cuts', () => {
  it('skips a cut after bar 1', () => {
    const map = { offset: 0, cuts: C };
    expect(mediaToTimeline(6, map)).toBe(3);
    expect(timelineToMedia(2, map)).toBe(5);
    expect(timelineToMedia(1.999, map)).toBeCloseTo(1.999, 9);
  });

  it('combines a cut with an offset before it', () => {
    const map = { offset: 1, cuts: C };
    expect(mediaToTimeline(6, map)).toBe(2);
    expect(timelineToMedia(1, map)).toBe(5);
    expect(timelineToMedia(0.5, map)).toBe(1.5);
  });

  it('puts bar 1 at the end of a cut that contains the offset', () => {
    const map = { offset: 3, cuts: C };
    expect(timelineToMedia(0, map)).toBe(5);
    expect(mediaToTimeline(5, map)).toBe(0);
    expect(mediaToTimeline(1, map)).toBe(-1);
  });

  it('combines a cut with a negative offset', () => {
    const map = { offset: -2, cuts: C };
    expect(mediaToTimeline(0, map)).toBe(2);
    expect(mediaToTimeline(6, map)).toBe(5);
    expect(timelineToMedia(4, map)).toBe(5);
  });

  it('shortens the media on the timeline', () => {
    expect(mediaTimelineEnd(10, { offset: 0, cuts: CC })).toBe(5);
    expect(mediaTimelineEnd(30, { offset: 3.2, cuts: [{ start: 10, end: 15 }] })).toBeCloseTo(
      21.8,
      9,
    );
  });

  it.each([-2, 0, 1, 3])('round-trips with offset %s', (offset) => {
    for (const cuts of [[], C, CC]) {
      const map = { offset, cuts };
      for (const t of [0, 0.5, 1.999, 2, 3.5, 10]) {
        expect(mediaToTimeline(timelineToMedia(t, map), map)).toBeCloseTo(t, 9);
      }
    }
  });
});

describe('sameMediaTimeMap with cuts', () => {
  it('compares every cut by start and end', () => {
    expect(
      sameMediaTimeMap(
        { offset: 0, cuts: [{ start: 2, end: 5 }] },
        { offset: 0, cuts: [{ start: 2, end: 5 }] },
      ),
    ).toBe(true);
    expect(
      sameMediaTimeMap(
        { offset: 0, cuts: [{ start: 2, end: 5 }] },
        { offset: 0, cuts: [{ start: 2, end: 5.001 }] },
      ),
    ).toBe(false);
    expect(sameMediaTimeMap({ offset: 0, cuts: [] }, { offset: 0, cuts: C })).toBe(false);
  });
});

describe('mediaSegmentAt', () => {
  it('finds the playing segment around a media second', () => {
    expect(mediaSegmentAt(1, CC)).toEqual({ start: -Infinity, end: 2, nextStart: 5 });
    expect(mediaSegmentAt(5, CC)).toEqual({ start: 5, end: 6, nextStart: 8 });
    expect(mediaSegmentAt(8.5, CC)).toEqual({ start: 8, end: Infinity, nextStart: Infinity });
    expect(mediaSegmentAt(3, [])).toEqual({ start: -Infinity, end: Infinity, nextStart: Infinity });
  });
});

describe('cut points', () => {
  it('lists the timeline second of every cut', () => {
    expect(cutPoints({ offset: 0, cuts: CC })).toEqual([2, 3]);
    expect(cutPoints({ offset: 1, cuts: CC })).toEqual([1, 2]);
  });

  it('finds the next cut point strictly after a timeline second', () => {
    const map = { offset: 0, cuts: CC };
    expect(nextCutPoint(0, map)).toBe(2);
    expect(nextCutPoint(2, map)).toBe(3);
    expect(nextCutPoint(2.5, map)).toBe(3);
    expect(nextCutPoint(3, map)).toBeNull();
    expect(nextCutPoint(0, { offset: 3, cuts: C })).toBeNull();
  });
});

describe('mediaTimeMapOf with cuts', () => {
  it('passes the project cuts without copying', () => {
    const mediaCuts = [{ id: 'a', start: 2, end: 5 }];
    expect(mediaTimeMapOf({ mediaOffset: 1, mediaCuts }).cuts).toBe(mediaCuts);
  });
});
