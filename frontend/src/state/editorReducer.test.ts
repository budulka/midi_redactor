import { editorReducer } from './editorReducer.ts';
import {
  DEFAULT_EDITOR_STATE,
  clearSelection,
  selectNotes,
  selectPedals,
  selectedNotes,
  selectedPedals,
  setFollowPlayhead,
  setGridDivision,
  setSnap,
  setZoom,
  type EditorState,
} from './editorState.ts';
import type { Note, PedalEvent } from './types.ts';

const initial: EditorState = Object.freeze({
  ...DEFAULT_EDITOR_STATE,
  selectedNoteIds: Object.freeze([]) as readonly string[],
  selectedPedalIds: Object.freeze([]) as readonly string[],
});

describe('editorReducer', () => {
  it('has the expected defaults', () => {
    expect(DEFAULT_EDITOR_STATE).toEqual({
      gridDivision: '1/16',
      snapEnabled: true,
      pixelsPerSecond: 100,
      selectedNoteIds: [],
      selectedPedalIds: [],
      followPlayhead: true,
    });
  });

  it('toggles following the playhead', () => {
    const next = editorReducer(initial, setFollowPlayhead(false));
    expect(next.followPlayhead).toBe(false);
    expect(editorReducer(next, setFollowPlayhead(false))).toBe(next);
    expect(editorReducer(initial, setFollowPlayhead(true))).toBe(initial);
  });

  it('sets the grid division', () => {
    const next = editorReducer(initial, setGridDivision('1/8T'));
    expect(next.gridDivision).toBe('1/8T');
    expect(editorReducer(next, setGridDivision('1/8T'))).toBe(next);
    expect(initial.gridDivision).toBe('1/16');
  });

  it('toggles snapping', () => {
    const next = editorReducer(initial, setSnap(false));
    expect(next.snapEnabled).toBe(false);
    expect(editorReducer(initial, setSnap(true))).toBe(initial);
  });

  it('clamps zoom and ignores non-finite values', () => {
    expect(editorReducer(initial, setZoom(5)).pixelsPerSecond).toBe(20);
    expect(editorReducer(initial, setZoom(5000)).pixelsPerSecond).toBe(1000);
    expect(editorReducer(initial, setZoom(125)).pixelsPerSecond).toBe(125);
    expect(editorReducer(initial, setZoom(NaN))).toBe(initial);
    expect(editorReducer(initial, setZoom(Infinity))).toBe(initial);
    expect(editorReducer(initial, setZoom(100))).toBe(initial);
  });

  it('replaces and clears the selection', () => {
    const selected = editorReducer(initial, selectNotes(['a']));
    expect(selected.selectedNoteIds).toEqual(['a']);
    expect(editorReducer(selected, selectNotes(['a']))).toBe(selected);
    expect(editorReducer(selected, selectNotes(['b', 'c'])).selectedNoteIds).toEqual(['b', 'c']);
    expect(editorReducer(selected, clearSelection()).selectedNoteIds).toEqual([]);
    expect(editorReducer(initial, clearSelection())).toBe(initial);
  });

  it('selects pedals and clears the note selection', () => {
    const selected = editorReducer(initial, selectPedals(['p1']));
    expect(selected.selectedPedalIds).toEqual(['p1']);
    expect(editorReducer(selected, selectPedals(['p1']))).toBe(selected);
    const withNotes = editorReducer(initial, selectNotes(['a']));
    const switched = editorReducer(withNotes, selectPedals(['p1']));
    expect(switched.selectedNoteIds).toEqual([]);
    expect(switched.selectedPedalIds).toEqual(['p1']);
  });

  it('clears the pedal selection when notes are selected', () => {
    const withPedals = editorReducer(initial, selectPedals(['p1']));
    const next = editorReducer(withPedals, selectNotes(['a']));
    expect(next.selectedNoteIds).toEqual(['a']);
    expect(next.selectedPedalIds).toEqual([]);
    expect(editorReducer(next, selectNotes(['a']))).toBe(next);
  });

  it('clears both selections', () => {
    const withPedals = editorReducer(initial, selectPedals(['p1']));
    const cleared = editorReducer(withPedals, clearSelection());
    expect(cleared.selectedPedalIds).toEqual([]);
    expect(cleared.selectedNoteIds).toEqual([]);
    expect(editorReducer(cleared, clearSelection())).toBe(cleared);
  });
});

describe('selectedNotes', () => {
  const notes: Note[] = [
    { id: 'a', pitch: 60, start: 0, duration: 1, velocity: 100 },
    { id: 'b', pitch: 62, start: 1, duration: 1, velocity: 100 },
    { id: 'c', pitch: 64, start: 2, duration: 1, velocity: 100 },
  ];

  it('returns selected notes in project order and ignores unknown ids', () => {
    expect(selectedNotes(notes, ['b', 'zzz'])).toEqual([notes[1]]);
    expect(selectedNotes(notes, ['c', 'a'])).toEqual([notes[0], notes[2]]);
    expect(selectedNotes(notes, [])).toEqual([]);
  });
});

describe('selectedPedals', () => {
  const pedals: PedalEvent[] = [
    { id: 'p1', type: 'sustain', start: 0, end: 1 },
    { id: 'p2', type: 'soft', start: 0, end: 1 },
  ];

  it('returns selected pedals in project order and ignores unknown ids', () => {
    expect(selectedPedals(pedals, ['p2', 'zzz'])).toEqual([pedals[1]]);
    expect(selectedPedals(pedals, [])).toEqual([]);
  });
});
