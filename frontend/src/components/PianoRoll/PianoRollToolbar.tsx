import { updateNotes } from '../../state/actions.ts';
import { useEditor, useEditorDispatch } from '../../state/editorContext.ts';
import { selectedNotes, setGridDivision, setSnap, setZoom } from '../../state/editorState.ts';
import { useHistoryApi, useHistoryState } from '../../state/historyContext.ts';
import { useProject, useProjectDispatch } from '../../state/projectContext.ts';
import {
  MAX_PIXELS_PER_SECOND,
  MIN_PIXELS_PER_SECOND,
  ZOOM_FACTOR,
  clampZoom,
} from '../../utils/pianoRollGeometry.ts';
import {
  GRID_DIVISIONS,
  gridStepSeconds,
  quantizeNote,
  type GridDivision,
} from '../../utils/quantize.ts';
import NoteInspector from './NoteInspector.tsx';

function divisionLabel(division: GridDivision): string {
  return division.endsWith('T') ? `${division.slice(0, -1)} triplet` : division;
}

function isGridDivision(value: string): value is GridDivision {
  return (GRID_DIVISIONS as readonly string[]).includes(value);
}

export default function PianoRollToolbar() {
  const { notes, bpm } = useProject();
  const { gridDivision, snapEnabled, pixelsPerSecond, selectedNoteIds } = useEditor();
  const projectDispatch = useProjectDispatch();
  const editorDispatch = useEditorDispatch();
  const { canUndo, canRedo } = useHistoryState();
  const history = useHistoryApi();
  const selected = selectedNotes(notes, selectedNoteIds);

  function quantizeSelected() {
    const step = gridStepSeconds(gridDivision, bpm);
    projectDispatch(
      updateNotes(
        selected.map((note) => {
          const { start, duration } = quantizeNote(note, step);
          return { id: note.id, patch: { start, duration } };
        }),
      ),
    );
  }

  return (
    <div className="piano-roll-toolbar" role="toolbar" aria-label="Piano roll tools">
      <button
        type="button"
        aria-label="Undo"
        title="Undo (Ctrl+Z)"
        disabled={!canUndo}
        onClick={history.undo}
      >
        Undo
      </button>
      <button
        type="button"
        aria-label="Redo"
        title="Redo (Ctrl+Shift+Z)"
        disabled={!canRedo}
        onClick={history.redo}
      >
        Redo
      </button>
      <label>
        Grid{' '}
        <select
          aria-label="Grid"
          value={gridDivision}
          onChange={(event) => {
            if (isGridDivision(event.target.value)) {
              editorDispatch(setGridDivision(event.target.value));
            }
          }}
        >
          {GRID_DIVISIONS.map((division) => (
            <option key={division} value={division}>
              {divisionLabel(division)}
            </option>
          ))}
        </select>
      </label>
      <label>
        <input
          type="checkbox"
          checked={snapEnabled}
          onChange={(event) => editorDispatch(setSnap(event.target.checked))}
        />{' '}
        Snap
      </label>
      <button
        type="button"
        disabled={pixelsPerSecond <= MIN_PIXELS_PER_SECOND}
        onClick={() => editorDispatch(setZoom(clampZoom(pixelsPerSecond / ZOOM_FACTOR)))}
      >
        Zoom out
      </button>
      <button
        type="button"
        disabled={pixelsPerSecond >= MAX_PIXELS_PER_SECOND}
        onClick={() => editorDispatch(setZoom(clampZoom(pixelsPerSecond * ZOOM_FACTOR)))}
      >
        Zoom in
      </button>
      <button type="button" disabled={selected.length === 0} onClick={quantizeSelected}>
        Quantize
      </button>
      <NoteInspector />
    </div>
  );
}
