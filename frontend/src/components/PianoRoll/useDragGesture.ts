import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { exceedsDragThreshold } from '../../utils/noteEditing.ts';
import type { Point } from '../../utils/pianoRollGeometry.ts';
import { shortcutFor } from '../../utils/shortcutRegistry.ts';

export interface PointerLike {
  readonly clientX: number;
  readonly clientY: number;
}

export interface GestureSpec<T> {
  /** Local point of the mousedown; the drag threshold is measured from it. */
  readonly startPoint: Point;
  /** Preview shown right away: the new item for create, null for move and resize. */
  readonly initialPreview: T | null;
  /**
   * Preview for a local mouse point; called only after the threshold is exceeded. Read
   * geometry, options and callbacks through a ref here, not from the mousedown closure.
   */
  readonly update: (local: Point) => T;
  /** Called once on mouseup, after the listeners are removed. */
  readonly commit: (result: T | null, moved: boolean) => void;
}

export interface DragGesture<T> {
  /** The item being created or changed, shown instead of the stored one until mouseup. */
  readonly preview: T | null;
  readonly begin: (spec: GestureSpec<T>) => void;
  /** True between `begin` and the end of the gesture (mouseup, Escape or unmount); stable. */
  readonly isActive: () => boolean;
}

interface ActiveGesture<T> {
  readonly spec: GestureSpec<T>;
  /** False until the mouse moves past the drag threshold. */
  moved: boolean;
  preview: T | null;
}

/**
 * Runs one mouse gesture at a time: window listeners for mousemove, mouseup and Escape are added
 * synchronously in `begin` and removed on mouseup, Escape and unmount. The preview lives in local
 * state; the caller changes the project only in `commit`, so a gesture is one reducer action.
 */
export function useDragGesture<T>(getLocalPoint: (event: PointerLike) => Point): DragGesture<T> {
  const [preview, setPreview] = useState<T | null>(null);
  const getLocalPointRef = useRef(getLocalPoint);
  const detachRef = useRef<(() => void) | null>(null);

  useLayoutEffect(() => {
    getLocalPointRef.current = getLocalPoint;
  });

  useEffect(
    () => () => {
      detachRef.current?.();
    },
    [],
  );

  const begin = useCallback((spec: GestureSpec<T>) => {
    detachRef.current?.();
    const gesture: ActiveGesture<T> = { spec, moved: false, preview: spec.initialPreview };
    setPreview(gesture.preview);

    const track = (event: PointerLike) => {
      const local = getLocalPointRef.current(event);
      if (
        !gesture.moved &&
        !exceedsDragThreshold(local.x - spec.startPoint.x, local.y - spec.startPoint.y)
      ) {
        return;
      }
      gesture.moved = true;
      gesture.preview = spec.update(local);
      setPreview(gesture.preview);
    };

    const finish = () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
      window.removeEventListener('keydown', handleKeyDown);
      if (detachRef.current === finish) detachRef.current = null;
      setPreview(null);
    };

    function handleMove(event: MouseEvent) {
      track(event);
    }

    function handleUp(event: MouseEvent) {
      track(event);
      const result = gesture.preview;
      finish();
      spec.commit(result, gesture.moved);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (shortcutFor('dragGesture', event) === null) return;
      event.preventDefault();
      finish();
    }

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    window.addEventListener('keydown', handleKeyDown);
    detachRef.current = finish;
  }, []);

  const isActive = useCallback(() => detachRef.current !== null, []);

  return { preview, begin, isActive };
}
