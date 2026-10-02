import { useCallback, useLayoutEffect, useRef } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import type { NoteChange } from '../../state/actions.ts';
import { selectedNotes } from '../../state/editorState.ts';
import type { Note } from '../../state/types.ts';
import { applyGroupDrag, type GroupDragState } from '../../utils/groupEditing.ts';
import { createId } from '../../utils/id.ts';
import {
  DEFAULT_NOTE_VELOCITY,
  applyDrag,
  createNoteAt,
  type DragOptions,
  type DragState,
} from '../../utils/noteEditing.ts';
import { noteGridMouseAction } from '../../utils/mouseActions.ts';
import {
  hitTestNotes,
  xToTime,
  yToPitch,
  type Point,
  type Rect,
  type ViewGeometry,
} from '../../utils/pianoRollGeometry.ts';
import {
  isAdditive,
  notesInRect,
  rectFromPoints,
  toggleId,
  unionIds,
} from '../../utils/selection.ts';
import { useDragGesture, type PointerLike } from './useDragGesture.ts';

export type NoteGesturePreview =
  /** Notes being created, moved or resized, shown instead of the stored ones until mouseup. */
  | { readonly kind: 'notes'; readonly notes: readonly Note[] }
  /** Selection rectangle; `ids` is the selection it would produce (base selection included). */
  | { readonly kind: 'marquee'; readonly rect: Rect; readonly ids: readonly string[] };

export interface UseNoteDragOptions {
  notes: readonly Note[];
  selectedIds: readonly string[];
  geometry: ViewGeometry;
  dragOptions: DragOptions;
  /** Converts client coordinates to coordinates inside the grid content. */
  getLocalPoint: (event: PointerLike) => Point;
  onCommitCreate: (note: Note) => void;
  onCommitUpdate: (changes: readonly NoteChange[]) => void;
  onSelect: (ids: readonly string[]) => void;
}

export interface UseNoteDragResult {
  preview: NoteGesturePreview | null;
  onMouseDown: (event: ReactMouseEvent<HTMLElement>) => void;
  /** True while a mouse gesture is in progress; stable. */
  isGestureActive: () => boolean;
}

type NoteGesture =
  | { readonly kind: 'create'; readonly drag: DragState }
  | { readonly kind: 'group'; readonly drag: GroupDragState }
  | { readonly kind: 'marquee'; readonly start: Point; readonly base: readonly string[] };

/**
 * Mouse gestures on the note grid: create, move and resize (one note or all selected notes),
 * Shift/Ctrl/⌘-click to toggle a note in the selection and Shift/Ctrl/⌘-drag in an empty place
 * for a selection rectangle. The preview lives in local state and the project receives at most
 * one action per gesture, on mouseup (see useDragGesture).
 */
export function useNoteDrag(options: UseNoteDragOptions): UseNoteDragResult {
  const latest = useRef(options);
  const getLocalPoint = useCallback(
    (event: PointerLike) => latest.current.getLocalPoint(event),
    [],
  );
  const { preview, begin, isActive } = useDragGesture<NoteGesturePreview>(getLocalPoint);

  useLayoutEffect(() => {
    latest.current = options;
  });

  const onMouseDown = useCallback(
    (event: ReactMouseEvent<HTMLElement>) => {
      if (event.button !== 0) return;
      event.preventDefault();

      const { notes, selectedIds, geometry, dragOptions, onSelect } = latest.current;
      const additive = isAdditive(event);
      const point = getLocalPoint(event);
      const time = xToTime(point.x, geometry);
      const pitch = yToPitch(point.y, geometry);
      const hit = hitTestNotes(notes, point, geometry);

      let gesture: NoteGesture;
      const action = noteGridMouseAction('left', additive, hit?.zone ?? null);
      switch (action) {
        case 'selectRect':
          gesture = { kind: 'marquee', start: point, base: selectedIds };
          break;
        case 'createNote': {
          const note = createNoteAt(createId(), time, pitch, DEFAULT_NOTE_VELOCITY, dragOptions);
          gesture = {
            kind: 'create',
            drag: { kind: 'create', original: note, originTime: time, originPitch: pitch },
          };
          break;
        }
        case 'toggleNote':
        case 'moveNotes':
        case 'resizeNotes': {
          const anchor = notes.find((note) => note.id === hit?.noteId);
          if (anchor === undefined) return;
          if (action === 'toggleNote') {
            onSelect(toggleId(selectedIds, anchor.id));
            return;
          }
          let originals: readonly Note[] = [anchor];
          if (selectedIds.includes(anchor.id)) {
            originals = selectedNotes(notes, selectedIds);
          } else {
            onSelect([anchor.id]);
          }
          gesture = {
            kind: 'group',
            drag: {
              kind: action === 'resizeNotes' ? 'resize' : 'move',
              anchor,
              originals,
              originTime: time,
              originPitch: pitch,
            },
          };
          break;
        }
        default:
          return;
      }

      begin({
        startPoint: point,
        initialPreview:
          gesture.kind === 'create' ? { kind: 'notes', notes: [gesture.drag.original] } : null,
        update: (local) => {
          const current = latest.current;
          const localTime = xToTime(local.x, current.geometry);
          const localPitch = yToPitch(local.y, current.geometry);
          switch (gesture.kind) {
            case 'create':
              return {
                kind: 'notes',
                notes: [applyDrag(gesture.drag, localTime, localPitch, current.dragOptions)],
              };
            case 'group':
              return {
                kind: 'notes',
                notes: applyGroupDrag(gesture.drag, localTime, localPitch, current.dragOptions),
              };
            case 'marquee': {
              const rect = rectFromPoints(gesture.start, local);
              return {
                kind: 'marquee',
                rect,
                ids: unionIds(gesture.base, notesInRect(current.notes, rect, current.geometry)),
              };
            }
          }
        },
        commit: (result, moved) => {
          const current = latest.current;
          if (gesture.kind === 'create') {
            const created = result?.kind === 'notes' ? result.notes[0] : undefined;
            if (created !== undefined) current.onCommitCreate(created);
            return;
          }
          if (gesture.kind === 'marquee') {
            if (moved && result?.kind === 'marquee') current.onSelect(result.ids);
            return;
          }
          if (moved && result?.kind === 'notes') {
            current.onCommitUpdate(
              result.notes.map((note) => ({
                id: note.id,
                patch: { start: note.start, duration: note.duration, pitch: note.pitch },
              })),
            );
          } else if (!moved && gesture.drag.originals.length > 1) {
            current.onSelect([gesture.drag.anchor.id]);
          }
        },
      });
    },
    [begin, getLocalPoint],
  );

  return { preview, onMouseDown, isGestureActive: isActive };
}
