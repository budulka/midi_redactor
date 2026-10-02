import { describe, expect, it } from 'vitest';
import {
  IDENTITY_MEDIA_TIME_MAP,
  mediaTimeMapOf,
  mediaTimelineEnd,
  mediaToTimeline,
  sameMediaTimeMap,
  timelineToMedia,
} from './mediaTimeMap.ts';

describe('mediaToTimeline', () => {
  it('subtracts the offset', () => {
    expect(mediaToTimeline(5, { offset: 3.2 })).toBeCloseTo(1.8, 9);
    expect(mediaToTimeline(3.2, { offset: 3.2 })).toBe(0);
    expect(mediaToTimeline(1, { offset: 3.2 })).toBeCloseTo(-2.2, 9);
    expect(mediaToTimeline(0, { offset: -1.5 })).toBe(1.5);
  });

  it('returns the input for the identity map', () => {
    expect(mediaToTimeline(7.25, IDENTITY_MEDIA_TIME_MAP)).toBe(7.25);
  });
});

describe('timelineToMedia', () => {
  it('adds the offset', () => {
    expect(timelineToMedia(0, { offset: 3.2 })).toBe(3.2);
    expect(timelineToMedia(1, { offset: -1.5 })).toBe(-0.5);
  });

  it('returns the input for the identity map', () => {
    expect(timelineToMedia(7.25, IDENTITY_MEDIA_TIME_MAP)).toBe(7.25);
  });

  it.each([-2.5, 0, 3.2])('round-trips with offset %s', (offset) => {
    const map = { offset };
    for (const t of [0, 0.001, 1.5, 100]) {
      expect(mediaToTimeline(timelineToMedia(t, map), map)).toBeCloseTo(t, 9);
    }
  });
});

describe('mediaTimelineEnd', () => {
  it('gives the timeline second where the media ends', () => {
    expect(mediaTimelineEnd(30, { offset: 3.2 })).toBeCloseTo(26.8, 9);
    expect(mediaTimelineEnd(30, { offset: -2 })).toBe(32);
    expect(mediaTimelineEnd(2, { offset: 5 })).toBe(0);
    expect(mediaTimelineEnd(30, IDENTITY_MEDIA_TIME_MAP)).toBe(30);
  });
});

describe('sameMediaTimeMap', () => {
  it('compares the offsets', () => {
    expect(sameMediaTimeMap({ offset: 1 }, { offset: 1 })).toBe(true);
    expect(sameMediaTimeMap({ offset: 1 }, { offset: 1.001 })).toBe(false);
  });
});

describe('mediaTimeMapOf', () => {
  it('takes the offset from the project', () => {
    expect(mediaTimeMapOf({ mediaOffset: 1.25 })).toEqual({ offset: 1.25 });
  });
});
