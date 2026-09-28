import { useCallback, useLayoutEffect, useRef } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import type { NotePatch, Note } from '../../state/types.ts';
import { createId } from '../../utils/id.ts';
import {
  DEFAULT_NOTE_VELOCITY,
  applyDrag,
  createNoteAt,
  type DragOptions,
  type DragState,
} from '../../utils/noteEditing.ts';
import {
  hitTestNotes,
  xToTime,
  yToPitch,
  type Point,
  type ViewGeometry,
} from '../../utils/pianoRollGeometry.ts';
import { useDragGesture, type PointerLike } from './useDragGesture.ts';

export interface UseNoteDragOptions {
  notes: readonly Note[];
  geometry: ViewGeometry;
  dragOptions: DragOptions;
  /** Converts client coordinates to coordinates inside the grid content. */
  getLocalPoint: (event: PointerLike) => Point;
  onCommitCreate: (note: Note) => void;
  onCommitUpdate: (id: string, patch: NotePatch) => void;
  onSelect: (ids: readonly string[]) => void;
}

export interface UseNoteDragResult {
  /** The note being created or changed, shown instead of the stored one until mouseup. */
  preview: Note | null;
  onMouseDown: (event: ReactMouseEvent<HTMLElement>) => void;
}

/**
 * Mouse gestures on the note grid: create, move and resize. The preview lives in local state and
 * the project receives exactly one action per gesture, on mouseup (see useDragGesture).
 */
export function useNoteDrag(options: UseNoteDragOptions): UseNoteDragResult {
  const latest = useRef(options);
  const getLocalPoint = useCallback(
    (event: PointerLike) => latest.current.getLocalPoint(event),
    [],
  );
  const { preview, begin } = useDragGesture<Note>(getLocalPoint);

  useLayoutEffect(() => {
    latest.current = options;
  });

  const onMouseDown = useCallback(
    (event: ReactMouseEvent<HTMLElement>) => {
      if (event.button !== 0) return;
      event.preventDefault();

      const { notes, geometry, dragOptions, onSelect } = latest.current;
      const point = getLocalPoint(event);
      const time = xToTime(point.x, geometry);
      const pitch = yToPitch(point.y, geometry);
      const hit = hitTestNotes(notes, point, geometry);

      let drag: DragState;
      if (hit === null) {
        const note = createNoteAt(createId(), time, pitch, DEFAULT_NOTE_VELOCITY, dragOptions);
        drag = { kind: 'create', original: note, originTime: time, originPitch: pitch };
      } else {
        const original = notes.find((note) => note.id === hit.noteId);
        if (original === undefined) return;
        onSelect([original.id]);
        drag = {
          kind: hit.zone === 'resize' ? 'resize' : 'move',
          original,
          originTime: time,
          originPitch: pitch,
        };
      }

      begin({
        startPoint: point,
        initialPreview: drag.kind === 'create' ? drag.original : null,
        update: (local) => {
          const current = latest.current;
          return applyDrag(
            drag,
            xToTime(local.x, current.geometry),
            yToPitch(local.y, current.geometry),
            current.dragOptions,
          );
        },
        commit: (result, moved) => {
          if (result === null) return;
          const { onCommitCreate, onCommitUpdate } = latest.current;
          if (drag.kind === 'create') {
            onCommitCreate(result);
          } else if (moved) {
            onCommitUpdate(result.id, {
              start: result.start,
              duration: result.duration,
              pitch: result.pitch,
            });
          }
        },
      });
    },
    [begin, getLocalPoint],
  );

  return { preview, onMouseDown };
}
