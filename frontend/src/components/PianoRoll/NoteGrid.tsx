import { memo, useCallback, useMemo, useRef } from 'react';
import type { KeyboardEvent, MouseEvent } from 'react';
import { addNotes, removeNotes, updateNote } from '../../state/actions.ts';
import { useEditor, useEditorDispatch } from '../../state/editorContext.ts';
import { clearSelection, selectNotes, selectedNotes } from '../../state/editorState.ts';
import { useProject, useProjectDispatch } from '../../state/projectContext.ts';
import type { Note, NotePatch } from '../../state/types.ts';
import { withPreview, type DragOptions } from '../../utils/noteEditing.ts';
import {
  ROW_HEIGHT_PX,
  gridBackgroundImage,
  gridContentSize,
  gridLayers,
  hitTestNotes,
  noteRect,
  timelineDurationSeconds,
  velocityToOpacity,
  type Point,
  type ViewGeometry,
} from '../../utils/pianoRollGeometry.ts';
import { KEYBOARD_PITCHES, isBlackKey, pitchName } from '../../utils/pitch.ts';
import { gridStepSeconds } from '../../utils/quantize.ts';
import { useNoteDrag } from './useNoteDrag.ts';

interface NoteViewProps {
  note: Note;
  geometry: ViewGeometry;
  selected: boolean;
}

const NoteView = memo(function NoteView({ note, geometry, selected }: NoteViewProps) {
  const rect = noteRect(note, geometry);
  return (
    <div
      className={`note${selected ? ' note--selected' : ''}`}
      data-testid="note"
      data-note-id={note.id}
      data-selected={selected}
      aria-label={`${pitchName(note.pitch)}, velocity ${note.velocity}`}
      style={{
        left: rect.x,
        top: rect.y,
        width: rect.width,
        height: rect.height,
        opacity: velocityToOpacity(note.velocity),
      }}
    >
      <div className="note__handle" />
    </div>
  );
});

const GRID_ROWS = KEYBOARD_PITCHES.map((pitch) => (
  <div
    key={pitch}
    className={`note-grid__row${isBlackKey(pitch) ? ' note-grid__row--black' : ''}`}
  />
));

/**
 * The editable grid: renders notes and handles create/move/resize (mouse), delete (right click,
 * Delete/Backspace while focused) and cancel (Escape during a gesture).
 */
export default function NoteGrid() {
  const project = useProject();
  const projectDispatch = useProjectDispatch();
  const { gridDivision, snapEnabled, pixelsPerSecond, selectedNoteIds } = useEditor();
  const editorDispatch = useEditorDispatch();
  const gridRef = useRef<HTMLDivElement>(null);
  const { bpm, timeSignature, notes } = project;

  const geometry = useMemo<ViewGeometry>(
    () => ({ pixelsPerSecond, rowHeight: ROW_HEIGHT_PX }),
    [pixelsPerSecond],
  );
  const dragOptions = useMemo<DragOptions>(
    () => ({ step: gridStepSeconds(gridDivision, bpm), snap: snapEnabled }),
    [gridDivision, bpm, snapEnabled],
  );

  const getLocalPoint = useCallback((event: { clientX: number; clientY: number }): Point => {
    const rect = gridRef.current?.getBoundingClientRect();
    return { x: event.clientX - (rect?.left ?? 0), y: event.clientY - (rect?.top ?? 0) };
  }, []);

  const { preview, onMouseDown } = useNoteDrag({
    notes,
    geometry,
    dragOptions,
    getLocalPoint,
    onCommitCreate: (note: Note) => {
      projectDispatch(addNotes([note]));
      editorDispatch(selectNotes([note.id]));
    },
    onCommitUpdate: (id: string, patch: NotePatch) => projectDispatch(updateNote(id, patch)),
    onSelect: (ids: readonly string[]) => editorDispatch(selectNotes(ids)),
  });

  const displayed = withPreview(notes, preview);
  const selectedIds = useMemo(() => new Set(selectedNoteIds), [selectedNoteIds]);
  const size = gridContentSize(timelineDurationSeconds(displayed, bpm, timeSignature), geometry);
  const background = gridBackgroundImage(
    gridLayers(bpm, timeSignature, gridDivision, pixelsPerSecond),
  );

  function handleMouseDown(event: MouseEvent<HTMLDivElement>) {
    gridRef.current?.focus({ preventScroll: true });
    onMouseDown(event);
  }

  function handleContextMenu(event: MouseEvent<HTMLDivElement>) {
    const hit = hitTestNotes(notes, getLocalPoint(event), geometry);
    if (hit === null) return;
    event.preventDefault();
    projectDispatch(removeNotes([hit.noteId]));
    if (selectedIds.has(hit.noteId)) {
      editorDispatch(selectNotes(selectedNoteIds.filter((id) => id !== hit.noteId)));
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'Delete' && event.key !== 'Backspace') return;
    event.preventDefault();
    const ids = selectedNotes(notes, selectedNoteIds).map((note) => note.id);
    if (ids.length > 0) projectDispatch(removeNotes(ids));
    if (selectedNoteIds.length > 0) editorDispatch(clearSelection());
  }

  return (
    <div
      ref={gridRef}
      className="note-grid"
      role="application"
      aria-label="Note grid"
      tabIndex={0}
      style={{ width: size.width, height: size.height, backgroundImage: background }}
      onMouseDown={handleMouseDown}
      onContextMenu={handleContextMenu}
      onKeyDown={handleKeyDown}
    >
      <div className="note-grid__rows" style={{ gridAutoRows: geometry.rowHeight }}>
        {GRID_ROWS}
      </div>
      {displayed.map((note) => (
        <NoteView
          key={note.id}
          note={note}
          geometry={geometry}
          selected={selectedIds.has(note.id)}
        />
      ))}
    </div>
  );
}
