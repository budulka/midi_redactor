import * as idModule from '../utils/id.ts';
import {
  addNote,
  addNotes,
  addPedal,
  addPedals,
  loadProject,
  replaceProject,
  removeNotes,
  removePedals,
  setBpm,
  setTimeSignature,
  updateNote,
  updateNotes,
  updatePedal,
  updatePedals,
} from './actions.ts';
import { MIN_PEDAL_DURATION } from './constants.ts';
import { projectReducer } from './projectReducer.ts';
import type { Note, PedalEvent, Project } from './types.ts';

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

const n1: Note = { id: 'n1', pitch: 60, start: 0, duration: 0.5, velocity: 100 };
const n2: Note = { id: 'n2', pitch: 64, start: 0.5, duration: 0.5, velocity: 90 };
const n3: Note = { id: 'n3', pitch: 67, start: 1, duration: 1, velocity: 80 };
const sustain: PedalEvent = { id: 'p1', type: 'sustain', start: 0, end: 1 };
const soft: PedalEvent = { id: 'p2', type: 'soft', start: 0.5, end: 2 };

function makeState(overrides: Partial<Project> = {}): Project {
  return deepFreeze({
    bpm: 120,
    timeSignature: { numerator: 4, denominator: 4 },
    mediaOffset: 0,
    notes: [n1, n2, n3],
    pedals: [sustain, soft],
    ...overrides,
  });
}

describe('notes/add', () => {
  it('adds several notes in order', () => {
    const state = makeState({ notes: [] });
    const next = projectReducer(state, addNotes([n1, n2]));
    expect(next.notes).toEqual([n1, n2]);
  });

  it('normalizes added notes', () => {
    const state = makeState({ notes: [] });
    const next = projectReducer(state, addNotes([{ ...n1, pitch: 200 }]));
    expect(next.notes[0].pitch).toBe(108);
  });

  it('ignores duplicate ids', () => {
    const state = makeState();
    expect(projectReducer(state, addNotes([{ ...n1, pitch: 50 }]))).toBe(state);
    const next = projectReducer(
      state,
      addNotes([
        { ...n1, id: 'n4' },
        { ...n1, id: 'n4' },
      ]),
    );
    expect(next.notes.map((note) => note.id)).toEqual(['n1', 'n2', 'n3', 'n4']);
  });

  it('drops only notes with non-finite values', () => {
    const state = makeState({ notes: [] });
    const next = projectReducer(
      state,
      addNotes([{ ...n1, start: Number.NaN }, { ...n2, duration: Infinity }, n3]),
    );
    expect(next.notes).toEqual([n3]);
    expect(projectReducer(state, addNotes([{ ...n1, velocity: Number.NaN }]))).toBe(state);
  });
});

describe('notes/update', () => {
  it('changes only the given fields of the given notes', () => {
    const state = makeState();
    const next = projectReducer(state, updateNote('n2', { pitch: 65, velocity: 50 }));
    expect(next.notes[1]).toEqual({ ...n2, pitch: 65, velocity: 50 });
    expect(next.notes[0]).toBe(state.notes[0]);
    expect(next.notes[2]).toBe(state.notes[2]);
    expect(next.pedals).toBe(state.pedals);
  });

  it('returns the same state for unknown ids or no-op patches', () => {
    const state = makeState();
    expect(projectReducer(state, updateNote('missing', { pitch: 70 }))).toBe(state);
    expect(projectReducer(state, updateNote('n1', { pitch: 60 }))).toBe(state);
    expect(projectReducer(state, updateNotes([]))).toBe(state);
  });

  it('updates several notes with one action', () => {
    const state = makeState();
    const shift = 0.25;
    const next = projectReducer(
      state,
      updateNotes(
        state.notes.map((note) => ({ id: note.id, patch: { start: note.start + shift } })),
      ),
    );
    expect(next.notes.map((note) => note.start)).toEqual([0.25, 0.75, 1.25]);
  });

  it('normalizes patched values', () => {
    const state = makeState();
    const next = projectReducer(state, updateNote('n1', { start: -3, duration: 0, pitch: 5 }));
    expect(next.notes[0]).toEqual({ ...n1, start: 0, duration: 0.001, pitch: 21 });
  });

  it('ignores patches with non-finite values', () => {
    const state = makeState();
    expect(projectReducer(state, updateNote('n1', { start: Number.NaN }))).toBe(state);
    expect(projectReducer(state, updateNote('n1', { duration: Infinity }))).toBe(state);
    const next = projectReducer(
      state,
      updateNotes([
        { id: 'n1', patch: { start: Number.NaN } },
        { id: 'n2', patch: { start: 3 } },
      ]),
    );
    expect(next.notes[0]).toBe(state.notes[0]);
    expect(next.notes[1].start).toBe(3);
  });

  it('does not let a patch change the id', () => {
    const state = makeState();
    const patch = { id: 'hacked', pitch: 70 } as unknown as { pitch: number };
    const next = projectReducer(state, updateNote('n1', patch));
    expect(next.notes[0]).toEqual({ ...n1, pitch: 70 });
  });
});

describe('notes/remove', () => {
  it('removes notes by id', () => {
    const state = makeState();
    const next = projectReducer(state, removeNotes(['n1', 'n3']));
    expect(next.notes).toEqual([n2]);
  });

  it('returns the same state when nothing is removed', () => {
    const state = makeState();
    expect(projectReducer(state, removeNotes(['missing']))).toBe(state);
  });
});

describe('pedals', () => {
  it('adds pedals, ignoring duplicate ids and non-finite values', () => {
    const state = makeState({ pedals: [] });
    const sostenuto: PedalEvent = { id: 'p3', type: 'sostenuto', start: 1, end: 2 };
    const next = projectReducer(
      state,
      addPedals([sustain, { ...sustain, start: 5 }, { ...soft, end: Number.NaN }, sostenuto]),
    );
    expect(next.pedals).toEqual([sustain, sostenuto]);
    expect(projectReducer(next, addPedals([sustain]))).toBe(next);
  });

  it('normalizes added pedals', () => {
    const state = makeState({ pedals: [] });
    const next = projectReducer(state, addPedals([{ ...sustain, start: -1, end: -0.5 }]));
    expect(next.pedals[0]).toEqual({ ...sustain, start: 0, end: MIN_PEDAL_DURATION });
  });

  it('updates pedals and keeps the identity of the others', () => {
    const state = makeState();
    const next = projectReducer(state, updatePedal('p2', { end: 3 }));
    expect(next.pedals[1]).toEqual({ ...soft, end: 3 });
    expect(next.pedals[0]).toBe(state.pedals[0]);
    expect(next.notes).toBe(state.notes);
  });

  it('normalizes an end before the start', () => {
    const state = makeState();
    const next = projectReducer(state, updatePedal('p2', { end: 0.2 }));
    expect(next.pedals[1].end).toBe(0.5 + MIN_PEDAL_DURATION);
    expect(next.pedals[1].end).toBeCloseTo(0.501, 12);
  });

  it('returns the same state for unknown ids, no-ops and non-finite patches', () => {
    const state = makeState();
    expect(projectReducer(state, updatePedal('missing', { end: 5 }))).toBe(state);
    expect(projectReducer(state, updatePedal('p1', { end: 1 }))).toBe(state);
    expect(projectReducer(state, updatePedals([{ id: 'p1', patch: { start: Infinity } }]))).toBe(
      state,
    );
  });

  it('removes pedals by id', () => {
    const state = makeState();
    expect(projectReducer(state, removePedals(['p1'])).pedals).toEqual([soft]);
    expect(projectReducer(state, removePedals(['missing']))).toBe(state);
  });
});

describe('pedal overlaps', () => {
  const pedal = (id: string, type: PedalEvent['type'], start: number, end: number): PedalEvent => ({
    id,
    type,
    start,
    end,
  });

  it('rejects an added pedal that overlaps one of the same type', () => {
    const state = makeState();
    expect(projectReducer(state, addPedals([pedal('x', 'sustain', 0.5, 1.5)]))).toBe(state);
    expect(projectReducer(state, addPedals([pedal('x', 'sustain', 1, 2)])).pedals).toHaveLength(3);
    expect(projectReducer(state, addPedals([pedal('x', 'soft', 2, 3)])).pedals).toHaveLength(3);
    expect(
      projectReducer(state, addPedals([pedal('x', 'sostenuto', 0.5, 1.5)])).pedals,
    ).toHaveLength(3);
  });

  it('rejects the second of two new pedals that overlap each other', () => {
    const state = makeState();
    const first = pedal('x', 'sustain', 3, 4);
    const next = projectReducer(state, addPedals([first, pedal('y', 'sustain', 3.5, 5)]));
    expect(next.pedals).toEqual([sustain, soft, first]);
  });

  it('keeps adding valid pedals after a rejected one in the same action', () => {
    const state = makeState();
    const valid = pedal('y', 'sustain', 1, 2);
    const next = projectReducer(state, addPedals([pedal('x', 'sustain', 0.5, 1.5), valid]));
    expect(next.pedals).toEqual([sustain, soft, valid]);
  });

  it('checks overlaps after normalization', () => {
    const state = makeState();
    expect(projectReducer(state, addPedals([pedal('x', 'sustain', -1, -0.5)]))).toBe(state);
  });

  it('rejects an update that makes pedals overlap and allows touching', () => {
    const state = makeState({ pedals: [sustain, soft, pedal('p3', 'sustain', 2, 3)] });
    expect(projectReducer(state, updatePedal('p1', { end: 3 }))).toBe(state);
    expect(projectReducer(state, updatePedal('p1', { end: 2 })).pedals[0]).toEqual({
      ...sustain,
      end: 2,
    });
  });

  it('allows swapping two pedals in one action', () => {
    const state = makeState({ pedals: [sustain, pedal('p3', 'sustain', 1, 2)] });
    const next = projectReducer(
      state,
      updatePedals([
        { id: 'p1', patch: { start: 1, end: 2 } },
        { id: 'p3', patch: { start: 0, end: 1 } },
      ]),
    );
    expect(next.pedals).toEqual([{ ...sustain, start: 1, end: 2 }, pedal('p3', 'sustain', 0, 1)]);
  });

  it('rejects changing the type to one that is taken', () => {
    const state = makeState();
    expect(projectReducer(state, updatePedal('p2', { type: 'sustain' }))).toBe(state);
  });
});

describe('project/setBpm', () => {
  it('rescales notes and pedals to keep their bars and beats', () => {
    const state = makeState();
    const next = projectReducer(state, setBpm(60));
    expect(next.bpm).toBe(60);
    expect(next.notes).toEqual([
      { ...n1, start: 0, duration: 1 },
      { ...n2, start: 1, duration: 1 },
      { ...n3, start: 2, duration: 2 },
    ]);
    expect(next.pedals).toEqual([
      { ...sustain, start: 0, end: 2 },
      { ...soft, start: 1, end: 4 },
    ]);
  });

  it('compresses notes for a faster tempo', () => {
    const next = projectReducer(makeState(), setBpm(240));
    expect(next.notes.map((n) => [n.start, n.duration])).toEqual([
      [0, 0.25],
      [0.25, 0.25],
      [0.5, 0.5],
    ]);
  });

  it('rescales with the clamped bpm', () => {
    const state = makeState();
    const fastest = projectReducer(state, setBpm(1000));
    expect(fastest.bpm).toBe(300);
    expect(fastest.notes[2].start).toBeCloseTo(0.4, 9);
    expect(fastest.notes[2].duration).toBeCloseTo(0.4, 9);
    const slowest = projectReducer(state, setBpm(1));
    expect(slowest.bpm).toBe(20);
    expect(slowest.notes[2].start).toBe(6);
  });

  it('returns the same state when the clamped bpm does not change', () => {
    const state = makeState({ bpm: 300 });
    expect(projectReducer(state, setBpm(1000))).toBe(state);
  });

  it('ignores non-finite values and clamps out-of-range ones', () => {
    const state = makeState();
    expect(projectReducer(state, setBpm(Number.NaN))).toBe(state);
    expect(projectReducer(state, setBpm(Infinity))).toBe(state);
    expect(projectReducer(state, setBpm(1000)).bpm).toBe(300);
    expect(projectReducer(state, setBpm(1)).bpm).toBe(20);
  });

  it('returns the same state for the current value', () => {
    const state = makeState();
    expect(projectReducer(state, setBpm(120))).toBe(state);
  });
});

describe('project/setTimeSignature', () => {
  it('applies a valid time signature', () => {
    const state = makeState();
    const next = projectReducer(state, setTimeSignature({ numerator: 6, denominator: 8 }));
    expect(next.timeSignature).toEqual({ numerator: 6, denominator: 8 });
    expect(next.notes).toBe(state.notes);
  });

  it('ignores invalid or unchanged time signatures', () => {
    const state = makeState();
    expect(projectReducer(state, setTimeSignature({ numerator: 4, denominator: 3 }))).toBe(state);
    expect(projectReducer(state, setTimeSignature({ numerator: 0, denominator: 4 }))).toBe(state);
    expect(projectReducer(state, setTimeSignature({ numerator: 4, denominator: 4 }))).toBe(state);
  });

  it('does not move notes or pedals', () => {
    const state = makeState();
    const next = projectReducer(state, setTimeSignature({ numerator: 3, denominator: 8 }));
    expect(next.notes).toBe(state.notes);
    expect(next.pedals).toBe(state.pedals);
  });
});

describe('project/load', () => {
  it('replaces the whole state', () => {
    const state = makeState();
    const loaded = makeState({ bpm: 75, notes: [n2], pedals: [] });
    expect(projectReducer(state, loadProject(loaded))).toEqual(loaded);
  });
});

describe('project/replace', () => {
  it('replaces the whole state', () => {
    const state = makeState();
    const other = makeState({ bpm: 90, notes: [n2], pedals: [] });
    expect(projectReducer(state, replaceProject(other))).toBe(other);
  });

  it('keeps the same state when replaced by itself', () => {
    const state = makeState();
    expect(projectReducer(state, replaceProject(state))).toBe(state);
  });
});

describe('project/load and project/replace with another bpm', () => {
  it('do not rescale the seconds of the new project', () => {
    const state = makeState();
    const other = makeState({ bpm: 60, notes: [n3], pedals: [soft] });
    const replaced = projectReducer(state, replaceProject(other));
    expect(replaced).toBe(other);
    expect(replaced.notes[0].start).toBe(1);
    const loaded = projectReducer(state, loadProject(other));
    expect(loaded).toEqual(other);
    expect(loaded.notes[0]).toEqual(n3);
    expect(loaded.pedals[0]).toEqual(soft);
  });
});

describe('action creators', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('addNote generates a fresh id for each action', () => {
    const spy = vi.spyOn(idModule, 'createId');
    spy.mockReturnValueOnce('id-1').mockReturnValueOnce('id-2');
    const input = { pitch: 60, start: 0, duration: 1, velocity: 100 };

    const first = addNote(input);
    const second = addNote(input);

    expect(spy).toHaveBeenCalledTimes(2);
    expect(first).toEqual({ type: 'notes/add', notes: [{ ...input, id: 'id-1' }] });
    expect(second).toEqual({ type: 'notes/add', notes: [{ ...input, id: 'id-2' }] });
  });

  it('addPedal generates an id', () => {
    vi.spyOn(idModule, 'createId').mockReturnValue('pedal-id');
    const action = addPedal({ type: 'sustain', start: 0, end: 1 });
    expect(action).toEqual({
      type: 'pedals/add',
      pedals: [{ id: 'pedal-id', type: 'sustain', start: 0, end: 1 }],
    });
  });

  it('added notes from addNote end up in the state', () => {
    vi.spyOn(idModule, 'createId').mockReturnValue('new-note');
    const state = makeState({ notes: [] });
    const next = projectReducer(
      state,
      addNote({ pitch: 72, start: 1, duration: 0.5, velocity: 64 }),
    );
    expect(next.notes).toEqual([
      { id: 'new-note', pitch: 72, start: 1, duration: 0.5, velocity: 64 },
    ]);
  });
});
