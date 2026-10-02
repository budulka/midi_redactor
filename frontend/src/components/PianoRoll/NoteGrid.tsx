import { memo, useCallback, useMemo, useRef } from 'react';
import type { KeyboardEvent, MouseEvent } from 'react';
import { addNotes, removeNotes, updateNotes } from '../../state/actions.ts';
import { useEditor, useEditorDispatch } from '../../state/editorContext.ts';
import { clearSelection, selectNotes, selectedNotes } from '../../state/editorState.ts';
import { useProject, useProjectDispatch } from '../../state/projectContext.ts';
import type { Note } from '../../state/types.ts';
import { focusFromPointer } from '../../utils/focus.ts';
import { translateNotes, withPreviews } from '../../utils/groupEditing.ts';
import type { DragOptions } from '../../utils/noteEditing.ts';
import { noteGridMouseAction } from '../../utils/mouseActions.ts';
import { noteSoundingEnds } from '../../utils/pedalEffects.ts';
import {
  ROW_HEIGHT_PX,
  gridBackgroundImage,
  gridContentSize,
  gridLayers,
  hitTestNotes,
  noteRect,
  noteTailRect,
  timelineDurationSeconds,
  velocityToOpacity,
  type Point,
  type ViewGeometry,
} from '../../utils/pianoRollGeometry.ts';
import { KEYBOARD_PITCHES, isBlackKey, pitchName } from '../../utils/pitch.ts';
import { gridStepSeconds } from '../../utils/quantize.ts';
import { handleShortcut, type ScopeAction } from '../../utils/shortcutRegistry.ts';
import { globalShortcutFor } from '../../utils/shortcuts.ts';
import { useNoteDrag } from './useNoteDrag.ts';
import { useMediaDuration } from '../../state/timelineContext.ts';

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

interface NoteTailViewProps {
  note: Note;
  soundingEnd: number;
  geometry: ViewGeometry;
}

/** Thin bar after a note while it keeps sounding (sustain or sostenuto); not clickable. */
const NoteTailView = memo(function NoteTailView({
  note,
  soundingEnd,
  geometry,
}: NoteTailViewProps) {
  const rect = noteTailRect(note, soundingEnd, geometry);
  if (rect === null) return null;
  return (
    <div
      className="note-tail"
      data-testid="note-tail"
      data-note-id={note.id}
      style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height }}
    />
  );
});

const GRID_ROWS = KEYBOARD_PITCHES.map((pitch) => (
  <div
    key={pitch}
    className={`note-grid__row${isBlackKey(pitch) ? ' note-grid__row--black' : ''}`}
  />
));

/** Semitone offsets of the vertical arrow shortcuts. */
const PITCH_NUDGES = { nudgeUp: 1, nudgeDown: -1, octaveUp: 12, octaveDown: -12 } as const;

type NudgeAction = Exclude<ScopeAction<'noteGrid'>, 'selectAll' | 'delete' | 'clearSelection'>;

/**
 * The editable grid: renders notes and handles create/move/resize of one or all selected notes
 * (mouse), additive selection and the selection rectangle (Shift/Ctrl/⌘), delete (right click,
 * Delete/Backspace while focused), Ctrl/⌘+A, Escape (clears the selection or cancels a gesture)
 * and the arrow keys (move the selected notes).
 */
export default function NoteGrid() {
  const project = useProject();
  const projectDispatch = useProjectDispatch();
  const { gridDivision, snapEnabled, pixelsPerSecond, selectedNoteIds } = useEditor();
  const editorDispatch = useEditorDispatch();
  const gridRef = useRef<HTMLDivElement>(null);
  const { bpm, timeSignature, notes, pedals } = project;

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

  const { preview, onMouseDown, isGestureActive } = useNoteDrag({
    notes,
    selectedIds: selectedNoteIds,
    geometry,
    dragOptions,
    getLocalPoint,
    onCommitCreate: (note: Note) => {
      projectDispatch(addNotes([note]));
      editorDispatch(selectNotes([note.id]));
    },
    onCommitUpdate: (changes) => projectDispatch(updateNotes(changes)),
    onSelect: (ids: readonly string[]) => editorDispatch(selectNotes(ids)),
  });

  const displayed = preview?.kind === 'notes' ? withPreviews(notes, preview.notes) : notes;
  const marquee = preview?.kind === 'marquee' ? preview : null;
  const selectedIds = useMemo(() => new Set(selectedNoteIds), [selectedNoteIds]);
  const marqueeIds = useMemo(() => new Set(marquee?.ids ?? []), [marquee]);
  const mediaDuration = useMediaDuration();
  const soundingEnds = useMemo(() => noteSoundingEnds(displayed, pedals), [displayed, pedals]);
  const size = gridContentSize(
    timelineDurationSeconds(displayed, bpm, timeSignature, pedals, mediaDuration),
    geometry,
  );
  const background = gridBackgroundImage(
    gridLayers(bpm, timeSignature, gridDivision, pixelsPerSecond),
  );

  function handleMouseDown(event: MouseEvent<HTMLDivElement>) {
    focusFromPointer(gridRef.current);
    onMouseDown(event);
  }

  function handleContextMenu(event: MouseEvent<HTMLDivElement>) {
    const hit = hitTestNotes(notes, getLocalPoint(event), geometry);
    if (hit === null || noteGridMouseAction('right', false, hit.zone) !== 'deleteNote') return;
    event.preventDefault();
    projectDispatch(removeNotes([hit.noteId]));
    if (selectedIds.has(hit.noteId)) {
      editorDispatch(selectNotes(selectedNoteIds.filter((id) => id !== hit.noteId)));
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (isGestureActive()) {
      // Undo/redo in the middle of a gesture would be overwritten by its commit on mouseup.
      const global = globalShortcutFor(event, event.target);
      if (global === 'undo' || global === 'redo') event.preventDefault();
    }
    const selected = selectedNotes(notes, selectedNoteIds);
    function nudge(action: NudgeAction): boolean {
      if (selected.length === 0) return false;
      const step = gridStepSeconds(gridDivision, bpm);
      const dt = action === 'nudgeLeft' ? -step : action === 'nudgeRight' ? step : 0;
      const dp = action === 'nudgeLeft' || action === 'nudgeRight' ? 0 : PITCH_NUDGES[action];
      projectDispatch(
        updateNotes(
          translateNotes(selected, dt, dp).map((note) => ({
            id: note.id,
            patch: { start: note.start, pitch: note.pitch },
          })),
        ),
      );
      return true;
    }
    handleShortcut('noteGrid', event, {
      selectAll: () => {
        editorDispatch(selectNotes(notes.map((note) => note.id)));
      },
      delete: () => {
        if (selected.length > 0) projectDispatch(removeNotes(selected.map((note) => note.id)));
        if (selectedNoteIds.length > 0) editorDispatch(clearSelection());
      },
      clearSelection: () => {
        // During a gesture Escape cancels it (window listener of useDragGesture) and keeps the selection.
        if (isGestureActive() || selectedNoteIds.length === 0) return false;
        editorDispatch(clearSelection());
      },
      nudgeLeft: nudge,
      nudgeRight: nudge,
      nudgeUp: nudge,
      nudgeDown: nudge,
      octaveUp: nudge,
      octaveDown: nudge,
    });
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
        <NoteTailView
          key={note.id}
          note={note}
          soundingEnd={soundingEnds.get(note.id) ?? note.start + note.duration}
          geometry={geometry}
        />
      ))}
      {displayed.map((note) => (
        <NoteView
          key={note.id}
          note={note}
          geometry={geometry}
          selected={selectedIds.has(note.id) || marqueeIds.has(note.id)}
        />
      ))}
      {marquee !== null && (
        <div
          className="note-grid__marquee"
          data-testid="marquee"
          style={{
            left: marquee.rect.x,
            top: marquee.rect.y,
            width: marquee.rect.width,
            height: marquee.rect.height,
          }}
        />
      )}
    </div>
  );
}
