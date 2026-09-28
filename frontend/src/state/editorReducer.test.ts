import { editorReducer } from './editorReducer.ts';
import {
  DEFAULT_EDITOR_STATE,
  clearSelection,
  selectNotes,
  selectedNotes,
  setGridDivision,
  setSnap,
  setZoom,
  type EditorState,
} from './editorState.ts';
import type { Note } from './types.ts';

const initial: EditorState = Object.freeze({
  ...DEFAULT_EDITOR_STATE,
  selectedNoteIds: Object.freeze([]) as readonly string[],
});

describe('editorReducer', () => {
  it('has the expected defaults', () => {
    expect(DEFAULT_EDITOR_STATE).toEqual({
      gridDivision: '1/16',
      snapEnabled: true,
      pixelsPerSecond: 100,
      selectedNoteIds: [],
    });
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
