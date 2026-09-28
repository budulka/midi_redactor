import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import type { NotePatch, Note } from '../../state/types.ts';
import { createId } from '../../utils/id.ts';
import {
  DEFAULT_NOTE_VELOCITY,
  applyDrag,
  createNoteAt,
  exceedsDragThreshold,
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

interface PointerLike {
  readonly clientX: number;
  readonly clientY: number;
}

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

interface Gesture {
  readonly drag: DragState;
  readonly startPoint: Point;
  /** False until the mouse moves past the drag threshold (always true for create). */
  active: boolean;
  preview: Note | null;
}

/**
 * Mouse gestures on the note grid: create, move and resize. The preview lives in local state and
 * the project receives exactly one action per gesture, on mouseup. Window listeners are added
 * synchronously on mousedown and removed on mouseup, Escape and unmount.
 */
export function useNoteDrag(options: UseNoteDragOptions): UseNoteDragResult {
  const [preview, setPreview] = useState<Note | null>(null);
  const latest = useRef(options);
  const gestureRef = useRef<Gesture | null>(null);
  const detachRef = useRef<(() => void) | null>(null);

  useLayoutEffect(() => {
    latest.current = options;
  });

  useEffect(
    () => () => {
      detachRef.current?.();
    },
    [],
  );

  const onMouseDown = useCallback((event: ReactMouseEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    detachRef.current?.();

    const { notes, geometry, dragOptions, getLocalPoint, onSelect } = latest.current;
    const point = getLocalPoint(event);
    const time = xToTime(point.x, geometry);
    const pitch = yToPitch(point.y, geometry);
    const hit = hitTestNotes(notes, point, geometry);

    let gesture: Gesture;
    if (hit === null) {
      const note = createNoteAt(createId(), time, pitch, DEFAULT_NOTE_VELOCITY, dragOptions);
      gesture = {
        drag: { kind: 'create', original: note, originTime: time, originPitch: pitch },
        startPoint: point,
        active: true,
        preview: note,
      };
    } else {
      const original = notes.find((note) => note.id === hit.noteId);
      if (original === undefined) return;
      onSelect([original.id]);
      gesture = {
        drag: {
          kind: hit.zone === 'resize' ? 'resize' : 'move',
          original,
          originTime: time,
          originPitch: pitch,
        },
        startPoint: point,
        active: false,
        preview: null,
      };
    }
    gestureRef.current = gesture;
    setPreview(gesture.preview);

    const track = (moveEvent: PointerLike) => {
      const current = latest.current;
      const local = current.getLocalPoint(moveEvent);
      if (
        !gesture.active &&
        !exceedsDragThreshold(local.x - gesture.startPoint.x, local.y - gesture.startPoint.y)
      ) {
        return;
      }
      gesture.active = true;
      gesture.preview = applyDrag(
        gesture.drag,
        xToTime(local.x, current.geometry),
        yToPitch(local.y, current.geometry),
        current.dragOptions,
      );
      setPreview(gesture.preview);
    };

    const finish = () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
      window.removeEventListener('keydown', handleKeyDown);
      if (gestureRef.current === gesture) gestureRef.current = null;
      if (detachRef.current === finish) detachRef.current = null;
      setPreview(null);
    };

    function handleMove(moveEvent: MouseEvent) {
      track(moveEvent);
    }

    function handleUp(upEvent: MouseEvent) {
      track(upEvent);
      const result = gesture.preview;
      const { onCommitCreate, onCommitUpdate } = latest.current;
      finish();
      if (result === null || !gesture.active) return;
      if (gesture.drag.kind === 'create') {
        onCommitCreate(result);
      } else {
        onCommitUpdate(result.id, {
          start: result.start,
          duration: result.duration,
          pitch: result.pitch,
        });
      }
    }

    function handleKeyDown(keyEvent: KeyboardEvent) {
      if (keyEvent.key !== 'Escape') return;
      keyEvent.preventDefault();
      finish();
    }

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    window.addEventListener('keydown', handleKeyDown);
    detachRef.current = finish;
  }, []);

  return { preview, onMouseDown };
}
