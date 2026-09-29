import { useCallback, useLayoutEffect, useRef } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import type { PedalEvent } from '../../state/types.ts';
import { createId } from '../../utils/id.ts';
import type { DragOptions } from '../../utils/noteEditing.ts';
import {
  applyPedalDrag,
  createPedalAt,
  type PedalDragKind,
  type PedalDragState,
} from '../../utils/pedalEditing.ts';
import { hitTestPedals, pedalTypeAtY, type PedalHitZone } from '../../utils/pedalGeometry.ts';
import { gapAt, neighborBounds } from '../../utils/pedalIntervals.ts';
import { xToTime, type Point, type ViewGeometry } from '../../utils/pianoRollGeometry.ts';
import { isAdditive, toggleId } from '../../utils/selection.ts';
import { useDragGesture, type PointerLike } from './useDragGesture.ts';

export interface UsePedalDragOptions {
  pedals: readonly PedalEvent[];
  selectedIds: readonly string[];
  /** `rowHeight` is the height of one lane row. */
  geometry: ViewGeometry;
  dragOptions: DragOptions;
  /** Length of a pedal created by a click. */
  defaultLength: number;
  /** Converts client coordinates to coordinates inside the lane content. */
  getLocalPoint: (event: PointerLike) => Point;
  onCommitCreate: (pedal: PedalEvent) => void;
  onCommitUpdate: (id: string, times: { start: number; end: number }) => void;
  onSelect: (ids: readonly string[]) => void;
}

export interface UsePedalDragResult {
  /** The pedal being created or changed, shown instead of the stored one until mouseup. */
  preview: PedalEvent | null;
  onMouseDown: (event: ReactMouseEvent<HTMLElement>) => void;
  /** True while a mouse gesture is in progress; stable. */
  isGestureActive: () => boolean;
}

const KIND_BY_ZONE: Readonly<Record<PedalHitZone, PedalDragKind>> = {
  body: 'move',
  start: 'resize-start',
  end: 'resize-end',
};

/**
 * Mouse gestures on the pedal lane: create (click or drag right in an empty place of a row),
 * move and resize by either edge. Shift/Ctrl/⌘-click toggles a pedal in the selection and does
 * nothing in an empty place. Pedals of one type stop at their neighbours. The row where the
 * gesture starts sets the type; it never changes during the gesture.
 *
 * A mousedown in an empty place computes the free gap around the time. When the gap is null
 * (the time is exactly at the start of a pedal of that type that was not hit, which the current
 * hit test cannot produce) or too small for a pedal, the gesture does nothing.
 */
export function usePedalDrag(options: UsePedalDragOptions): UsePedalDragResult {
  const latest = useRef(options);
  const getLocalPoint = useCallback(
    (event: PointerLike) => latest.current.getLocalPoint(event),
    [],
  );
  const { preview, begin, isActive } = useDragGesture<PedalEvent>(getLocalPoint);

  useLayoutEffect(() => {
    latest.current = options;
  });

  const onMouseDown = useCallback(
    (event: ReactMouseEvent<HTMLElement>) => {
      if (event.button !== 0) return;
      event.preventDefault();

      const { pedals, selectedIds, geometry, dragOptions, defaultLength, onSelect } =
        latest.current;
      const point = getLocalPoint(event);
      const time = xToTime(point.x, geometry);
      const hit = hitTestPedals(pedals, point, geometry);

      if (isAdditive(event)) {
        if (hit !== null) onSelect(toggleId(selectedIds, hit.pedalId));
        return;
      }

      let drag: PedalDragState;
      if (hit === null) {
        const type = pedalTypeAtY(point.y, geometry.rowHeight);
        const gap = gapAt(pedals, type, time);
        if (gap === null) return;
        const pedal = createPedalAt(createId(), type, time, defaultLength, dragOptions, gap);
        if (pedal === null) return;
        drag = {
          kind: 'create',
          original: pedal,
          originTime: time,
          bounds: { min: pedal.start, max: gap.max },
        };
      } else {
        const original = pedals.find((pedal) => pedal.id === hit.pedalId);
        if (original === undefined) return;
        onSelect([original.id]);
        drag = {
          kind: KIND_BY_ZONE[hit.zone],
          original,
          originTime: time,
          bounds: neighborBounds(pedals, original),
        };
      }

      begin({
        startPoint: point,
        initialPreview: drag.kind === 'create' ? drag.original : null,
        update: (local) => {
          const current = latest.current;
          return applyPedalDrag(drag, xToTime(local.x, current.geometry), current.dragOptions);
        },
        commit: (result, moved) => {
          if (result === null) return;
          const { onCommitCreate, onCommitUpdate } = latest.current;
          if (drag.kind === 'create') {
            onCommitCreate(result);
          } else if (moved) {
            onCommitUpdate(result.id, { start: result.start, end: result.end });
          }
        },
      });
    },
    [begin, getLocalPoint],
  );

  return { preview, onMouseDown, isGestureActive: isActive };
}
