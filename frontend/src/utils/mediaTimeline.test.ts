import { describe, expect, it } from 'vitest';
import {
  TIMELINE_KEY_BIG_STEP_SECONDS,
  TIMELINE_KEY_STEP_SECONDS,
  clampSelection,
  hiddenIntroSeconds,
  mediaPositionText,
  mediaTimelineExtent,
  selectionLabel,
  timelineSeekForKey,
} from './mediaTimeline.ts';

describe('mediaTimelineExtent', () => {
  it('covers the whole media without an offset', () => {
    expect(mediaTimelineExtent(30, { offset: 0, cuts: [] })).toEqual({ start: 0, end: 30 });
  });

  it('hides the intro before bar 1', () => {
    const extent = mediaTimelineExtent(30, { offset: 3.2, cuts: [] });
    expect(extent?.start).toBe(0);
    expect(extent?.end).toBeCloseTo(26.8, 9);
  });

  it('starts after bar 1 with a negative offset', () => {
    expect(mediaTimelineExtent(30, { offset: -2, cuts: [] })).toEqual({ start: 2, end: 32 });
  });

  it('is null when the media ends before bar 1 or has no duration', () => {
    expect(mediaTimelineExtent(2, { offset: 5, cuts: [] })).toBeNull();
    expect(mediaTimelineExtent(0, { offset: 0, cuts: [] })).toBeNull();
  });
});

describe('hiddenIntroSeconds', () => {
  it('is the media before bar 1', () => {
    expect(hiddenIntroSeconds({ offset: 3.2, cuts: [] })).toBe(3.2);
    expect(hiddenIntroSeconds({ offset: -1, cuts: [] })).toBe(0);
    expect(hiddenIntroSeconds({ offset: 0, cuts: [] })).toBe(0);
  });
});

describe('timelineSeekForKey', () => {
  it('has the documented steps', () => {
    expect(TIMELINE_KEY_STEP_SECONDS).toBe(0.1);
    expect(TIMELINE_KEY_BIG_STEP_SECONDS).toBe(1);
  });

  it('moves with arrows and clamps to the media', () => {
    expect(timelineSeekForKey(1, 'ArrowRight', false, 30)).toBe(1.1);
    expect(timelineSeekForKey(1, 'ArrowLeft', true, 30)).toBe(0);
    expect(timelineSeekForKey(29.95, 'ArrowRight', false, 30)).toBe(30);
  });

  it('jumps with Home and End', () => {
    expect(timelineSeekForKey(5, 'Home', false, 30)).toBe(0);
    expect(timelineSeekForKey(5, 'End', false, 30)).toBe(30);
  });

  it('ignores other keys and an empty media', () => {
    expect(timelineSeekForKey(5, 'a', false, 30)).toBeNull();
    expect(timelineSeekForKey(0, 'ArrowRight', false, 0)).toBeNull();
  });

  it('rounds to 1 ms', () => {
    expect(timelineSeekForKey(1.0000001, 'ArrowRight', false, 30)).toBe(1.1);
  });
});

describe('mediaPositionText', () => {
  it('shows the timeline and the media time', () => {
    expect(mediaPositionText(1.5, { offset: 3.2, cuts: [] })).toBe('0:01.500 (media 0:04.700)');
  });

  it('omits the media time before the media starts', () => {
    expect(mediaPositionText(1, { offset: -2, cuts: [] })).toBe('0:01.000');
  });
});

describe('clampSelection', () => {
  const extent = { start: 2, end: 30 };

  it('orders the ends and clamps them to the media', () => {
    expect(clampSelection(8, 5, extent)).toEqual({ start: 5, end: 8 });
    expect(clampSelection(1, 5, extent)).toEqual({ start: 2, end: 5 });
    expect(clampSelection(25, 40, extent)).toEqual({ start: 25, end: 30 });
  });

  it('gives null for a too short selection or without media', () => {
    expect(clampSelection(5, 5.005, extent)).toBeNull();
    expect(clampSelection(31, 40, extent)).toBeNull();
    expect(clampSelection(5, 8, null)).toBeNull();
  });
});

describe('selectionLabel', () => {
  it('names the selected range', () => {
    expect(selectionLabel({ start: 5, end: 8 })).toBe('Selected 0:05.000–0:08.000');
  });
});
