import { describe, expect, it } from 'vitest';
import {
  markerPercent,
  mediaOffsetDescription,
  offsetForKey,
  offsetFromPointer,
} from './mediaOffset.ts';

describe('markerPercent', () => {
  it('places the marker in % of the duration', () => {
    expect(markerPercent(3, 30)).toBe(10);
    expect(markerPercent(0, 30)).toBe(0);
    expect(markerPercent(30, 30)).toBe(100);
  });

  it('has no marker outside the media or without a duration', () => {
    expect(markerPercent(-1, 30)).toBeNull();
    expect(markerPercent(31, 30)).toBeNull();
    expect(markerPercent(1, 0)).toBeNull();
  });
});

describe('offsetFromPointer', () => {
  it('maps the pointer onto the duration', () => {
    expect(offsetFromPointer(150, 300, 30)).toBe(15);
    expect(offsetFromPointer(-10, 300, 30)).toBe(0);
    expect(offsetFromPointer(400, 300, 30)).toBe(30);
    expect(offsetFromPointer(100, 300, 10)).toBe(3.333);
  });

  it('gives 0 without a width', () => {
    expect(offsetFromPointer(10, 0, 30)).toBe(0);
  });
});

describe('offsetForKey', () => {
  it('moves by small and big steps', () => {
    expect(offsetForKey(3.2, 'ArrowRight', false, 30)).toBe(3.21);
    expect(offsetForKey(3.2, 'ArrowLeft', true, 30)).toBe(3.1);
  });

  it('stays inside the media', () => {
    expect(offsetForKey(0.005, 'ArrowLeft', false, 30)).toBe(0);
    expect(offsetForKey(29.995, 'ArrowRight', false, 30)).toBe(30);
  });

  it('jumps to the ends', () => {
    expect(offsetForKey(3.2, 'Home', false, 30)).toBe(0);
    expect(offsetForKey(3.2, 'End', false, 30)).toBe(30);
  });

  it('ignores other keys', () => {
    expect(offsetForKey(3.2, 'a', false, 30)).toBeNull();
  });
});

describe('mediaOffsetDescription', () => {
  it('describes where bar 1 is', () => {
    expect(mediaOffsetDescription(0)).toBe('Bar 1 is at the start of the media.');
    expect(mediaOffsetDescription(3.2)).toBe('Bar 1 is at 0:03.200 of the media.');
    expect(mediaOffsetDescription(-1.5)).toBe('The media starts 0:01.500 after bar 1.');
  });
});
