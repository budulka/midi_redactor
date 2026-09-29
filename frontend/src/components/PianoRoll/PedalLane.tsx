import { memo, useCallback, useMemo, useRef } from 'react';
import type { KeyboardEvent, MouseEvent } from 'react';
import { addPedals, removePedals, updatePedal } from '../../state/actions.ts';
import { PEDAL_LABELS, PEDAL_TYPES } from '../../state/constants.ts';
import { useEditor, useEditorDispatch } from '../../state/editorContext.ts';
import { clearSelection, selectPedals, selectedPedals } from '../../state/editorState.ts';
import { useProject, useProjectDispatch } from '../../state/projectContext.ts';
import type { PedalEvent } from '../../state/types.ts';
import { focusFromPointer } from '../../utils/focus.ts';
import { withPreview, type DragOptions } from '../../utils/noteEditing.ts';
import { defaultPedalLength } from '../../utils/pedalEditing.ts';
import {
  PEDAL_LANE_HEIGHT_PX,
  PEDAL_ROW_HEIGHT_PX,
  hitTestPedals,
  pedalRect,
  pedalRowY,
} from '../../utils/pedalGeometry.ts';
import {
  gridBackgroundImage,
  gridLayers,
  timelineDurationSeconds,
  type Point,
  type ViewGeometry,
} from '../../utils/pianoRollGeometry.ts';
import { gridStepSeconds } from '../../utils/quantize.ts';
import { editorShortcutFor, globalShortcutFor } from '../../utils/shortcuts.ts';
import { usePedalDrag } from './usePedalDrag.ts';
import { useMediaDuration } from '../../state/timelineContext.ts';

function pedalDescription(pedal: PedalEvent): string {
  return `${PEDAL_LABELS[pedal.type]} from ${pedal.start.toFixed(2)} s to ${pedal.end.toFixed(2)} s`;
}

interface PedalViewProps {
  pedal: PedalEvent;
  geometry: ViewGeometry;
  selected: boolean;
}

const PedalView = memo(function PedalView({ pedal, geometry, selected }: PedalViewProps) {
  const rect = pedalRect(pedal, geometry);
  const description = pedalDescription(pedal);
  return (
    <div
      className={`pedal pedal--${pedal.type}${selected ? ' pedal--selected' : ''}`}
      data-testid="pedal"
      data-pedal-id={pedal.id}
      data-pedal-type={pedal.type}
      data-selected={selected}
      aria-label={description}
      title={description}
      style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height }}
    >
      <div className="pedal__handle pedal__handle--start" />
      <div className="pedal__handle pedal__handle--end" />
    </div>
  );
});

const LANE_ROWS = PEDAL_TYPES.map((type) => (
  <div
    key={type}
    className="pedal-lane__row"
    data-pedal-type={type}
    style={{ top: pedalRowY(type, PEDAL_ROW_HEIGHT_PX), height: PEDAL_ROW_HEIGHT_PX }}
  />
));

/**
 * Pedal lane under the note grid: one row per pedal type. Handles create/move/resize (mouse),
 * additive selection (Shift/Ctrl/⌘-click), delete (right click, Delete/Backspace while focused),
 * Ctrl/⌘+A and Escape (clears the selection or cancels a gesture).
 */
export default function PedalLane() {
  const project = useProject();
  const projectDispatch = useProjectDispatch();
  const { gridDivision, snapEnabled, pixelsPerSecond, selectedPedalIds } = useEditor();
  const editorDispatch = useEditorDispatch();
  const laneRef = useRef<HTMLDivElement>(null);
  const { bpm, timeSignature, notes, pedals } = project;

  const geometry = useMemo<ViewGeometry>(
    () => ({ pixelsPerSecond, rowHeight: PEDAL_ROW_HEIGHT_PX }),
    [pixelsPerSecond],
  );
  const dragOptions = useMemo<DragOptions>(
    () => ({ step: gridStepSeconds(gridDivision, bpm), snap: snapEnabled }),
    [gridDivision, bpm, snapEnabled],
  );
  const defaultLength = defaultPedalLength(bpm, timeSignature, dragOptions);

  const getLocalPoint = useCallback((event: { clientX: number; clientY: number }): Point => {
    const rect = laneRef.current?.getBoundingClientRect();
    return { x: event.clientX - (rect?.left ?? 0), y: event.clientY - (rect?.top ?? 0) };
  }, []);

  const { preview, onMouseDown, isGestureActive } = usePedalDrag({
    pedals,
    selectedIds: selectedPedalIds,
    geometry,
    dragOptions,
    defaultLength,
    getLocalPoint,
    onCommitCreate: (pedal: PedalEvent) => {
      projectDispatch(addPedals([pedal]));
      editorDispatch(selectPedals([pedal.id]));
    },
    onCommitUpdate: (id, times) => projectDispatch(updatePedal(id, times)),
    onSelect: (ids: readonly string[]) => editorDispatch(selectPedals(ids)),
  });

  const displayed = withPreview(pedals, preview);
  const selectedIds = useMemo(() => new Set(selectedPedalIds), [selectedPedalIds]);
  const mediaDuration = useMediaDuration();
  const width =
    timelineDurationSeconds(notes, bpm, timeSignature, displayed, mediaDuration) * pixelsPerSecond;
  const background = gridBackgroundImage(
    gridLayers(bpm, timeSignature, gridDivision, pixelsPerSecond),
  );

  function handleMouseDown(event: MouseEvent<HTMLDivElement>) {
    focusFromPointer(laneRef.current);
    onMouseDown(event);
  }

  function handleContextMenu(event: MouseEvent<HTMLDivElement>) {
    const hit = hitTestPedals(pedals, getLocalPoint(event), geometry);
    if (hit === null) return;
    event.preventDefault();
    projectDispatch(removePedals([hit.pedalId]));
    if (selectedIds.has(hit.pedalId)) {
      editorDispatch(selectPedals(selectedPedalIds.filter((id) => id !== hit.pedalId)));
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (isGestureActive()) {
      // Undo/redo in the middle of a gesture would be overwritten by its commit on mouseup.
      const global = globalShortcutFor(event, event.target);
      if (global === 'undo' || global === 'redo') event.preventDefault();
    }
    switch (editorShortcutFor(event)) {
      case 'selectAll':
        event.preventDefault();
        editorDispatch(selectPedals(pedals.map((pedal) => pedal.id)));
        return;
      case 'delete': {
        event.preventDefault();
        const ids = selectedPedals(pedals, selectedPedalIds).map((pedal) => pedal.id);
        if (ids.length > 0) projectDispatch(removePedals(ids));
        if (selectedPedalIds.length > 0) editorDispatch(clearSelection());
        return;
      }
      case 'clearSelection':
        if (isGestureActive() || selectedPedalIds.length === 0) return;
        event.preventDefault();
        editorDispatch(clearSelection());
        return;
      default:
        return;
    }
  }

  return (
    <div
      ref={laneRef}
      className="pedal-lane"
      role="application"
      aria-label="Pedal lane"
      tabIndex={0}
      style={{ width, height: PEDAL_LANE_HEIGHT_PX, backgroundImage: background }}
      onMouseDown={handleMouseDown}
      onContextMenu={handleContextMenu}
      onKeyDown={handleKeyDown}
    >
      {LANE_ROWS}
      {displayed.map((pedal) => (
        <PedalView
          key={pedal.id}
          pedal={pedal}
          geometry={geometry}
          selected={selectedIds.has(pedal.id)}
        />
      ))}
    </div>
  );
}
