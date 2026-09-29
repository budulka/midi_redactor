import type { Note } from '../state/types.ts';
import {
  applyGroupDrag,
  clampGroupOffset,
  translateNotes,
  withPreviews,
  type GroupDragState,
} from './groupEditing.ts';
import { applyDrag, type DragOptions } from './noteEditing.ts';

const a: Note = Object.freeze({ id: 'a', pitch: 60, start: 0.5, duration: 0.5, velocity: 100 });
const b: Note = Object.freeze({ id: 'b', pitch: 64, start: 1, duration: 0.5, velocity: 100 });
const opts: DragOptions = { step: 0.125, snap: true };
const free: DragOptions = { step: 0.125, snap: false };

function byId(notes: readonly Note[], id: string): Note {
  const note = notes.find((n) => n.id === id);
  if (note === undefined) throw new Error(`no note ${id}`);
  return note;
}

describe('translateNotes', () => {
  it('shifts all notes by the offset', () => {
    const [ta, tb] = translateNotes([a, b], 0.25, 2);
    expect(ta).toEqual({ ...a, start: 0.75, pitch: 62 });
    expect(tb).toEqual({ ...b, start: 1.25, pitch: 66 });
    expect(a.start).toBe(0.5);
    expect(b.pitch).toBe(64);
  });

  it('stops the group at 0 s', () => {
    const [ta, tb] = translateNotes([a, b], -1, 0);
    expect(ta?.start).toBe(0);
    expect(tb?.start).toBe(0.5);
  });

  it('stops the group at the edges of the keyboard', () => {
    const high = translateNotes(
      [
        { ...a, pitch: 100 },
        { ...b, pitch: 60 },
      ],
      0,
      20,
    ).map((note) => note.pitch);
    expect(high).toEqual([108, 68]);
    const low = translateNotes(
      [
        { ...a, pitch: 21 },
        { ...b, pitch: 60 },
      ],
      0,
      -5,
    ).map((note) => note.pitch);
    expect(low).toEqual([21, 60]);
  });

  it('clamps the offset', () => {
    expect(clampGroupOffset([a, b], -1, 50)).toEqual({ dt: -0.5, dp: 44 });
  });
});

describe('applyGroupDrag', () => {
  const move: GroupDragState = {
    kind: 'move',
    anchor: a,
    originals: [a, b],
    originTime: 0.6,
    originPitch: 60,
  };

  it('moves the group, snapping the anchor', () => {
    const result = applyGroupDrag(move, 0.83, 62, opts);
    expect(byId(result, 'a')).toMatchObject({ start: 0.75, pitch: 62 });
    expect(byId(result, 'b')).toMatchObject({ start: 1.25, pitch: 66 });
  });

  it('moves the group without snapping', () => {
    const result = applyGroupDrag(move, 0.83, 62, free);
    expect(byId(result, 'a').start).toBeCloseTo(0.73, 10);
    expect(byId(result, 'b').start).toBeCloseTo(1.23, 10);
  });

  it('stops at 0 s when another note starts earlier than the anchor', () => {
    const c: Note = { ...b, id: 'c', start: 0.25 };
    const result = applyGroupDrag({ ...move, originals: [a, c] }, 0, 60, opts);
    expect(byId(result, 'a').start).toBe(0.25);
    expect(byId(result, 'c').start).toBe(0);
  });

  it('resizes the group by the change of the anchor', () => {
    const shortB: Note = { ...b, duration: 0.25 };
    const resize: GroupDragState = {
      kind: 'resize',
      anchor: a,
      originals: [a, shortB],
      originTime: 0.97,
      originPitch: 60,
    };
    const longer = applyGroupDrag(resize, 1.3, 60, opts);
    expect(byId(longer, 'a').duration).toBe(0.875);
    expect(byId(longer, 'b').duration).toBe(0.625);
    const shorter = applyGroupDrag(resize, 0.4, 60, opts);
    expect(byId(shorter, 'a').duration).toBe(0.125);
    expect(byId(shorter, 'b').duration).toBe(0.125);
  });

  it.each([
    ['move', 0.83, 62, opts],
    ['move', 0.83, 62, free],
    ['move', 0, 60, opts],
    ['move', 0, 60, free],
    ['move', 0.6, 108, opts],
    ['resize', 1.3, 60, opts],
    ['resize', 1.3, 60, free],
    ['resize', 0.4, 60, opts],
    ['resize', 0.4, 60, free],
  ] as const)('matches applyDrag for one note (%s to %s s, pitch %s)', (kind, time, pitch, o) => {
    const drag = { kind, originTime: 0.6, originPitch: 60 };
    const group = applyGroupDrag({ ...drag, anchor: a, originals: [a] }, time, pitch, o);
    expect(group).toEqual([applyDrag({ ...drag, original: a }, time, pitch, o)]);
  });
});

describe('withPreviews', () => {
  it('returns the same array without previews', () => {
    const items = [a, b];
    expect(withPreviews(items, [])).toBe(items);
  });

  it('replaces items by id and appends new ones', () => {
    const changed: Note = { ...b, start: 2 };
    expect(withPreviews([a, b], [changed])).toEqual([a, changed]);
    const n: Note = { ...a, id: 'n' };
    expect(withPreviews([a, b], [n])).toEqual([a, b, n]);
  });
});
