import type { Note } from '../state/types.ts';
import type { ViewGeometry } from './pianoRollGeometry.ts';
import { isAdditive, notesInRect, rectFromPoints, toggleId, unionIds } from './selection.ts';

const g: ViewGeometry = { pixelsPerSecond: 100, rowHeight: 14 };
const a: Note = { id: 'a', pitch: 60, start: 0.5, duration: 0.5, velocity: 100 };
const b: Note = { id: 'b', pitch: 64, start: 1, duration: 0.5, velocity: 100 };
const e: Note = { id: 'e', pitch: 72, start: 3, duration: 0.5, velocity: 100 };

describe('isAdditive', () => {
  it('is true with Shift, Ctrl or Meta', () => {
    const none = { shiftKey: false, ctrlKey: false, metaKey: false };
    expect(isAdditive({ ...none, shiftKey: true })).toBe(true);
    expect(isAdditive({ ...none, ctrlKey: true })).toBe(true);
    expect(isAdditive({ ...none, metaKey: true })).toBe(true);
    expect(isAdditive(none)).toBe(false);
  });
});

describe('toggleId and unionIds', () => {
  it('toggles an id', () => {
    expect(toggleId(['a', 'b'], 'a')).toEqual(['b']);
    expect(toggleId(['a'], 'c')).toEqual(['a', 'c']);
  });

  it('appends only new ids', () => {
    expect(unionIds(['e'], ['a', 'e', 'b'])).toEqual(['e', 'a', 'b']);
  });
});

describe('rectFromPoints', () => {
  it('normalizes the corners', () => {
    expect(rectFromPoints({ x: 120, y: 690 }, { x: 40, y: 600 })).toEqual({
      x: 40,
      y: 600,
      width: 80,
      height: 90,
    });
  });
});

describe('notesInRect', () => {
  it('returns the notes intersecting the rectangle', () => {
    expect(notesInRect([a, b, e], { x: 40, y: 600, width: 80, height: 90 }, g)).toEqual(['a', 'b']);
  });

  it('does not count touching as intersecting', () => {
    expect(notesInRect([a, b, e], { x: 150, y: 600, width: 50, height: 90 }, g)).toEqual([]);
  });

  it('returns nothing for a rectangle of zero width', () => {
    expect(notesInRect([a, b, e], { x: 60, y: 600, width: 0, height: 90 }, g)).toEqual([]);
  });

  it('keeps the project order', () => {
    expect(notesInRect([b, e, a], { x: 40, y: 600, width: 80, height: 90 }, g)).toEqual(['b', 'a']);
  });
});
