import * as idModule from '../utils/id.ts';
import {
  addMediaCut,
  addNote,
  addNotes,
  addPedals,
  loadProject,
  removeMediaCut,
  replaceProject,
  setBpm,
  setMediaOffset,
  updateMediaCut,
  updateNote,
  updatePedal,
} from './actions.ts';
import { createEmptyProject } from './constants.ts';
import {
  HISTORY_LIMIT,
  createHistory,
  historyReducer,
  redo,
  undo,
  type History,
} from './history.ts';
import type { Project } from './types.ts';

const p0: Project = createEmptyProject();

function addFirstNote(): History {
  vi.spyOn(idModule, 'createId').mockReturnValue('n1');
  return historyReducer(
    createHistory(p0),
    addNote({ pitch: 60, start: 0, duration: 0.5, velocity: 100 }),
  );
}

describe('historyReducer', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('creates an empty history', () => {
    expect(createHistory(p0)).toEqual({ past: [], present: p0, future: [] });
  });

  it('records a change as an undo step', () => {
    const history = addFirstNote();
    expect(history.past).toEqual([p0]);
    expect(history.past[0]).toBe(p0);
    expect(history.present.notes.map((note) => note.id)).toEqual(['n1']);
    expect(history.future).toEqual([]);
  });

  it('returns the same history for an action that changes nothing', () => {
    const history = addFirstNote();
    expect(historyReducer(history, updateNote('missing', { pitch: 70 }))).toBe(history);
    expect(historyReducer(history, setBpm(120))).toBe(history);
  });

  it('returns the same history when the reducer rejects an overlapping pedal', () => {
    const history = historyReducer(
      createHistory(p0),
      addPedals([
        { id: 'p1', type: 'sustain', start: 0, end: 1 },
        { id: 'p2', type: 'sustain', start: 2, end: 3 },
      ]),
    );
    expect(historyReducer(history, updatePedal('p2', { start: 0.5 }))).toBe(history);
  });

  it('undoes and redoes a change', () => {
    const h1 = addFirstNote();
    const p1 = h1.present;
    const undone = historyReducer(h1, undo());
    expect(undone.present).toBe(p0);
    expect(undone.past).toEqual([]);
    expect(undone.future[0]).toBe(p1);
    const redone = historyReducer(undone, redo());
    expect(redone.present).toBe(p1);
    expect(redone.future).toEqual([]);
    expect(redone.past).toEqual([p0]);
  });

  it('ignores undo and redo with an empty stack', () => {
    const history = createHistory(p0);
    expect(historyReducer(history, undo())).toBe(history);
    expect(historyReducer(history, redo())).toBe(history);
  });

  it('clears the redo stack on a new change', () => {
    const undone = historyReducer(addFirstNote(), undo());
    expect(undone.future).toHaveLength(1);
    const next = historyReducer(undone, setBpm(90));
    expect(next.future).toEqual([]);
    expect(next.present.bpm).toBe(90);
  });

  it(`keeps at most ${HISTORY_LIMIT} undo steps`, () => {
    let history = createHistory(p0);
    for (let i = 0; i < 205; i += 1) {
      history = historyReducer(
        history,
        addNotes([{ id: `n${i}`, pitch: 60, start: i, duration: 0.5, velocity: 100 }]),
      );
    }
    expect(HISTORY_LIMIT).toBe(200);
    expect(history.past).toHaveLength(200);
    expect(history.past[0]?.notes).toHaveLength(5);
    for (let i = 0; i < 200; i += 1) {
      history = historyReducer(history, undo());
    }
    expect(history.present.notes).toHaveLength(5);
    expect(history.past).toEqual([]);
    expect(historyReducer(history, undo())).toBe(history);
  });

  it('starts a new history when a project is loaded', () => {
    let history = addFirstNote();
    history = historyReducer(history, setBpm(90));
    history = historyReducer(history, undo());
    const loaded: Project = { ...createEmptyProject(), bpm: 140 };
    const next = historyReducer(history, loadProject(loaded));
    expect(next.past).toEqual([]);
    expect(next.future).toEqual([]);
    expect(next.present.bpm).toBe(140);
  });

  it('records a project replace as one undoable step', () => {
    let history = addFirstNote();
    const withNote = history.present;
    const imported: Project = { ...createEmptyProject(), bpm: 90 };
    history = historyReducer(history, replaceProject(imported));
    expect(history.present).toBe(imported);
    expect(history.past).toHaveLength(2);
    expect(history.future).toEqual([]);

    history = historyReducer(history, undo());
    expect(history.present).toBe(withNote);
    history = historyReducer(history, redo());
    expect(history.present).toBe(imported);
  });

  it('clears the redo stack when a project is replaced after undo', () => {
    let history = addFirstNote();
    history = historyReducer(history, undo());
    expect(history.future).toHaveLength(1);
    history = historyReducer(history, replaceProject({ ...createEmptyProject(), bpm: 60 }));
    expect(history.future).toEqual([]);
  });

  it('records a tempo change as one undo step', () => {
    let history = addFirstNote();
    history = historyReducer(
      history,
      addNotes([{ id: 'n2', pitch: 64, start: 1, duration: 0.5, velocity: 90 }]),
    );
    const before = history.present;
    const pastLength = history.past.length;
    history = historyReducer(history, setBpm(60));
    expect(history.past).toHaveLength(pastLength + 1);
    expect(history.present.bpm).toBe(60);
    expect(history.present.notes[1]).toMatchObject({ id: 'n2', start: 2, duration: 1 });

    history = historyReducer(history, undo());
    expect(history.present).toBe(before);
    expect(history.present.notes[1].start).toBe(1);

    history = historyReducer(history, redo());
    expect(history.present.bpm).toBe(60);
    expect(history.present.notes[1].start).toBe(2);
  });
});

describe('media offset history', () => {
  it('records a media offset change as one undo step', () => {
    let history = createHistory(p0);
    const before = history.present;
    history = historyReducer(history, setMediaOffset(3.2));
    expect(history.past).toHaveLength(1);
    expect(history.present.mediaOffset).toBe(3.2);

    history = historyReducer(history, undo());
    expect(history.present.mediaOffset).toBe(0);
    expect(history.present).toBe(before);

    history = historyReducer(history, redo());
    expect(history.present.mediaOffset).toBe(3.2);
  });
});

describe('media cut history', () => {
  it('records adding, changing and removing a cut as separate undo steps', () => {
    vi.spyOn(idModule, 'createId').mockReturnValue('c1');
    let history = createHistory(p0);
    const pastBefore = history.past.length;
    const states = [history.present];
    history = historyReducer(history, addMediaCut({ start: 2, end: 5 }));
    states.push(history.present);
    history = historyReducer(history, updateMediaCut('c1', { start: 2, end: 6 }));
    states.push(history.present);
    history = historyReducer(history, removeMediaCut('c1'));
    expect(history.past).toHaveLength(pastBefore + 3);
    expect(history.present.mediaCuts).toEqual([]);

    history = historyReducer(history, undo());
    expect(history.present).toBe(states[2]);
    expect(history.present.mediaCuts).toEqual([{ id: 'c1', start: 2, end: 6 }]);
    history = historyReducer(history, undo());
    expect(history.present).toBe(states[1]);
    history = historyReducer(history, undo());
    expect(history.present).toBe(states[0]);
    expect(history.present.mediaCuts).toEqual([]);

    history = historyReducer(history, redo());
    expect(history.present.mediaCuts).toEqual([{ id: 'c1', start: 2, end: 5 }]);
  });
});
