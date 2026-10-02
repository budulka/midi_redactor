import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
} from 'react';
import { addMediaCut, removeMediaCut, updateMediaCut } from '../state/actions.ts';
import { useProject, useProjectDispatch } from '../state/projectContext.ts';
import { useTransportApi, useTransportState } from '../state/transportContext.ts';
import type { MediaCut } from '../state/types.ts';
import { useMediaTimeMap } from '../state/useMediaTimeMap.ts';
import { focusFromPointer } from '../utils/focus.ts';
import {
  cutDescription,
  cutEdgeForKey,
  cutEdgeLimits,
  cutRangeForSelection,
  draggedCutEdge,
  type CutEdge,
} from '../utils/mediaCuts.ts';
import { mediaToTimeline, type MediaTimeMap, type TimeRange } from '../utils/mediaTimeMap.ts';
import {
  clampSelection,
  hiddenIntroSeconds,
  mediaPositionText,
  mediaTimelineExtent,
  selectionLabel,
  timelineSeekForKey,
  type TimelineExtent,
} from '../utils/mediaTimeline.ts';
import { timeToX, xToTime } from '../utils/pianoRollGeometry.ts';
import { formatClock } from '../utils/transportFormat.ts';
import ContextMenu, { type ContextMenuItem } from './ContextMenu.tsx';
import type { MediaTimelineGeometry } from './PianoRoll/PianoRoll.tsx';
import { useDragGesture, type PointerLike } from './PianoRoll/useDragGesture.ts';
import { useShownMedia } from './useShownMedia.ts';
import './MediaTimeline.css';

/** A paused preview of the start edge shows the last frame before the cut, seconds before it. */
const BEFORE_CUT_SECONDS = 0.001;

/** A selection belongs to the map it was made with; another map (undo, offset) drops it. */
interface Selection {
  readonly range: TimeRange;
  readonly map: MediaTimeMap;
}

type MenuState =
  | { readonly x: number; readonly y: number; readonly kind: 'range' }
  | { readonly x: number; readonly y: number; readonly kind: 'cut'; readonly id: string };

interface PendingPreview {
  readonly map: MediaTimeMap;
  readonly seekTo: number | undefined;
}

function previewMapOf(map: MediaTimeMap, cuts: readonly MediaCut[], preview: MediaCut) {
  return {
    offset: map.offset,
    cuts: cuts.map((cut) => (cut.id === preview.id ? preview : cut)),
  };
}

/**
 * The media timeline row above the piano roll ruler: shows where the loaded audio or video lies on
 * the timeline (same scale and scroll as the piano roll) and seeks the whole timeline on a click
 * or with the arrow keys, Home and End. A drag selects a range that the context menu ("Delete
 * range") or Delete cuts from the media; every cut leaves a mark whose edges are dragged or moved
 * with the arrow keys, and the context menu ("Remove cut") or Delete brings the range back. The
 * media file itself never changes; notes stay where they are on the timeline.
 */
export default function MediaTimeline({ durationSeconds, pixelsPerSecond }: MediaTimelineGeometry) {
  const { state } = useShownMedia();
  const timeMap = useMediaTimeMap();
  const { mediaCuts } = useProject();
  const dispatch = useProjectDispatch();
  const { position, status } = useTransportState();
  const api = useTransportApi();
  const trackRef = useRef<HTMLDivElement>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);

  const geometry = { pixelsPerSecond, rowHeight: 0 };
  const width = durationSeconds * pixelsPerSecond;
  const ready = state.status === 'ready' && state.duration > 0;
  const mediaDuration = ready ? state.duration : 0;

  const latest = useRef({
    timeMap,
    mediaCuts,
    pixelsPerSecond,
    playing: false,
    extent: null as TimelineExtent | null,
  });
  const committedRef = useRef(false);
  const pendingPreviewRef = useRef<PendingPreview | null>(null);
  const frameRef = useRef<number | null>(null);

  const getLocalPoint = (event: PointerLike) => {
    const rect = trackRef.current?.getBoundingClientRect();
    return { x: event.clientX - (rect?.left ?? 0), y: event.clientY - (rect?.top ?? 0) };
  };
  const selectionDrag = useDragGesture<TimeRange | null>(getLocalPoint);
  const edgeDrag = useDragGesture<MediaCut>(getLocalPoint);

  const edgePreview = edgeDrag.preview;
  const shownCuts =
    edgePreview === null
      ? mediaCuts
      : mediaCuts.map((cut) => (cut.id === edgePreview.id ? edgePreview : cut));
  const shownMap = edgePreview === null ? timeMap : { offset: timeMap.offset, cuts: shownCuts };
  const extent = ready ? mediaTimelineExtent(state.duration, shownMap) : null;
  const introSeconds = ready ? hiddenIntroSeconds(shownMap) : 0;

  useLayoutEffect(() => {
    latest.current = {
      timeMap,
      mediaCuts,
      pixelsPerSecond,
      playing: status === 'playing',
      extent,
    };
  });

  const cancelPreviewFrame = () => {
    pendingPreviewRef.current = null;
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
  };

  useEffect(
    () => () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    },
    [],
  );

  // Escape ends an edge drag without a commit: the media goes back to the project map.
  const previewingEdge = edgePreview !== null;
  const wasPreviewingRef = useRef(false);
  useEffect(() => {
    if (wasPreviewingRef.current && !previewingEdge && !committedRef.current) {
      cancelPreviewFrame();
      api.applyMediaTimeMap(latest.current.timeMap);
    }
    wasPreviewingRef.current = previewingEdge;
  }, [previewingEdge, api]);

  const shownSelection =
    selectionDrag.preview ??
    (selection !== null && selection.map === timeMap ? selection.range : null);
  const x = (seconds: number) => timeToX(seconds, geometry);

  const focusTrack = () => trackRef.current?.focus();

  const deleteRange = () => {
    if (shownSelection === null) return;
    const range = cutRangeForSelection(shownSelection, timeMap, mediaDuration);
    if (range !== null) dispatch(addMediaCut(range));
    setSelection(null);
    focusTrack();
  };

  const removeCut = (id: string) => {
    dispatch(removeMediaCut(id));
    focusTrack();
  };

  const handleMouseDown = (event: MouseEvent<HTMLDivElement>) => {
    const track = trackRef.current;
    if (event.button !== 0 || !ready || track === null || menu !== null) return;
    event.preventDefault();
    focusFromPointer(track);
    const startPoint = getLocalPoint(event);
    const from = xToTime(startPoint.x, geometry);
    api.seek(from);
    setSelection(null);
    const selectionMap = timeMap;
    selectionDrag.begin({
      startPoint,
      initialPreview: null,
      update: (point) =>
        clampSelection(
          from,
          xToTime(point.x, { pixelsPerSecond: latest.current.pixelsPerSecond, rowHeight: 0 }),
          latest.current.extent,
        ),
      commit: (result, moved) => {
        setSelection(moved && result !== null ? { range: result, map: selectionMap } : null);
      },
    });
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!ready) return;
    if (shownSelection !== null && (event.key === 'Delete' || event.key === 'Backspace')) {
      event.preventDefault();
      deleteRange();
      return;
    }
    if (shownSelection !== null && event.key === 'Escape') {
      event.preventDefault();
      setSelection(null);
      return;
    }
    const value = timelineSeekForKey(position, event.key, event.shiftKey, extent?.end ?? 0);
    if (value === null) return;
    event.preventDefault();
    api.seek(value);
  };

  const handleContextMenu = (event: MouseEvent<HTMLDivElement>) => {
    if (!ready || shownSelection === null) return;
    const time = xToTime(getLocalPoint(event).x, geometry);
    if (time < shownSelection.start || time > shownSelection.end) return;
    event.preventDefault();
    setMenu({ x: event.clientX, y: event.clientY, kind: 'range' });
  };

  const flushPreview = () => {
    frameRef.current = null;
    const pending = pendingPreviewRef.current;
    pendingPreviewRef.current = null;
    if (pending !== null) api.applyMediaTimeMap(pending.map, pending.seekTo);
  };

  const handleEdgeMouseDown = (event: MouseEvent<HTMLDivElement>, cut: MediaCut, edge: CutEdge) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    if (menu !== null) return;
    focusFromPointer(event.currentTarget);
    const limits = cutEdgeLimits(mediaCuts, cut.id, edge, mediaDuration, timeMap.offset);
    const startPoint = getLocalPoint(event);
    committedRef.current = false;
    edgeDrag.begin({
      startPoint,
      initialPreview: null,
      update: (point) => {
        const { timeMap: map, mediaCuts: cuts, pixelsPerSecond: pps, playing } = latest.current;
        const value = draggedCutEdge(cut[edge], (point.x - startPoint.x) / pps, limits);
        const preview: MediaCut = { ...cut, [edge]: value };
        const previewMap = previewMapOf(map, cuts, preview);
        let seekTo: number | undefined;
        if (!playing) {
          const cutPoint = mediaToTimeline(preview.start, previewMap);
          seekTo = edge === 'end' ? cutPoint : Math.max(0, cutPoint - BEFORE_CUT_SECONDS);
        }
        pendingPreviewRef.current = { map: previewMap, seekTo };
        if (frameRef.current === null) frameRef.current = requestAnimationFrame(flushPreview);
        return preview;
      },
      commit: (result, moved) => {
        committedRef.current = true;
        cancelPreviewFrame();
        const { timeMap: map, mediaCuts: cuts } = latest.current;
        if (moved && result !== null) {
          api.applyMediaTimeMap(previewMapOf(map, cuts, result));
          dispatch(updateMediaCut(cut.id, { start: result.start, end: result.end }));
        } else {
          api.applyMediaTimeMap(map);
        }
      },
    });
  };

  const handleEdgeKeyDown = (
    event: KeyboardEvent<HTMLDivElement>,
    cut: MediaCut,
    edge: CutEdge,
  ) => {
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      removeCut(cut.id);
      return;
    }
    const limits = cutEdgeLimits(mediaCuts, cut.id, edge, mediaDuration, timeMap.offset);
    const value = cutEdgeForKey(cut[edge], event.key, event.shiftKey, limits);
    if (value === null) return;
    event.preventDefault();
    const range = { start: cut.start, end: cut.end, [edge]: value };
    dispatch(updateMediaCut(cut.id, range));
  };

  let menuItems: ContextMenuItem[] = [];
  if (menu?.kind === 'range') {
    menuItems = [{ label: 'Delete range', onSelect: deleteRange }];
  } else if (menu?.kind === 'cut') {
    const { id } = menu;
    menuItems = [{ label: 'Remove cut', onSelect: () => removeCut(id) }];
  }

  return (
    <div className="media-timeline" role="group" aria-label="Media timeline" style={{ width }}>
      <div
        ref={trackRef}
        className="media-timeline__track"
        role="slider"
        tabIndex={ready ? 0 : -1}
        aria-label="Media position"
        aria-disabled={!ready}
        aria-valuemin={0}
        aria-valuemax={extent?.end ?? 0}
        aria-valuenow={position}
        aria-valuetext={mediaPositionText(position, timeMap)}
        onMouseDown={handleMouseDown}
        onKeyDown={handleKeyDown}
        onContextMenu={handleContextMenu}
      >
        {extent !== null && (
          <div
            className="media-timeline__media"
            style={{ left: x(extent.start), width: x(extent.end) - x(extent.start) }}
            title={state.fileName ?? undefined}
          />
        )}
        {ready && shownSelection !== null && (
          <div
            className="media-timeline__selection"
            aria-label={selectionLabel(shownSelection)}
            style={{
              left: x(shownSelection.start),
              width: x(shownSelection.end) - x(shownSelection.start),
            }}
          />
        )}
        {introSeconds > 0 && (
          <span className="media-timeline__intro">{formatClock(introSeconds)} before bar 1</span>
        )}
        {!ready && (
          <span className="media-timeline__placeholder">
            Load audio or video to see its timeline here
          </span>
        )}
      </div>
      {ready &&
        shownCuts.map((cut, index) => {
          const point = mediaToTimeline(cut.start, shownMap);
          if (point < 0 || point > durationSeconds) return null;
          const projectCut = mediaCuts[index];
          const number = index + 1;
          const description = cutDescription(cut);
          const edgeProps = (edge: CutEdge) => {
            const limits = cutEdgeLimits(
              mediaCuts,
              projectCut.id,
              edge,
              mediaDuration,
              timeMap.offset,
            );
            return {
              role: 'slider',
              tabIndex: 0,
              className: `media-timeline__cut-edge media-timeline__cut-edge--${edge}`,
              'aria-label': `${edge === 'start' ? 'Start' : 'End'} of cut ${number}`,
              'aria-valuemin': limits.start,
              'aria-valuemax': limits.end,
              'aria-valuenow': cut[edge],
              'aria-valuetext': description,
              onMouseDown: (event: MouseEvent<HTMLDivElement>) =>
                handleEdgeMouseDown(event, projectCut, edge),
              onKeyDown: (event: KeyboardEvent<HTMLDivElement>) =>
                handleEdgeKeyDown(event, projectCut, edge),
            };
          };
          return (
            <div
              key={cut.id}
              className="media-timeline__cut"
              data-cut-id={cut.id}
              style={{ left: x(point) }}
              title={`${description}. Notes stay on the timeline and do not move with the media.`}
              onContextMenu={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setMenu({ x: event.clientX, y: event.clientY, kind: 'cut', id: cut.id });
              }}
            >
              <div {...edgeProps('start')} />
              <div {...edgeProps('end')} />
              {edgePreview?.id === cut.id && (
                <span className="media-timeline__cut-label">{description}</span>
              )}
            </div>
          );
        })}
      {menu !== null && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          label="Media timeline actions"
          items={menuItems}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  );
}
