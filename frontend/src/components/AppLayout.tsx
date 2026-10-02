import {
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react';
import { focusFromPointer } from '../utils/focus.ts';
import type { SplitterAction } from '../utils/keyActions.ts';
import { handleShortcut } from '../utils/shortcutRegistry.ts';
import {
  browserStorage,
  clampMediaPanelWidth,
  dragMediaPanelWidth,
  loadMediaPanelWidth,
  maxMediaPanelWidth,
  MEDIA_PANEL_DEFAULT_WIDTH_PX,
  MEDIA_PANEL_MIN_WIDTH_PX,
  saveMediaPanelWidth,
  splitterWidthForAction,
  type WidthStorage,
} from '../utils/mediaPanelWidth.ts';
import { useDragGesture } from './PianoRoll/useDragGesture.ts';
import { useViewportWidth } from './useViewportWidth.ts';

export interface AppLayoutProps {
  readonly header: ReactNode;
  readonly editor: ReactNode;
  readonly media: ReactNode;
  /** Where the width is kept; defaults to browserStorage(). Tests pass a fake. */
  readonly storage?: WidthStorage | null;
}

const MEDIA_PANEL_ID = 'media-panel';

/**
 * The page grid: transport on top, the editor on the left, the media panel on the right and a
 * splitter between them. The splitter changes the panel width with the mouse or the keyboard;
 * the chosen width is kept in the storage and limited by the window width on screen.
 */
export default function AppLayout({ header, editor, media, storage: storageProp }: AppLayoutProps) {
  const [storage] = useState(() => (storageProp === undefined ? browserStorage() : storageProp));
  const [preferred, setPreferred] = useState(
    () => loadMediaPanelWidth(storage) ?? MEDIA_PANEL_DEFAULT_WIDTH_PX,
  );
  const viewportWidth = useViewportWidth();
  const viewportRef = useRef(viewportWidth);
  useLayoutEffect(() => {
    viewportRef.current = viewportWidth;
  });

  const drag = useDragGesture<number>((event) => ({ x: event.clientX, y: event.clientY }));

  const committed = clampMediaPanelWidth(preferred, viewportWidth);
  const width = drag.preview ?? committed;
  const maxWidth = maxMediaPanelWidth(viewportWidth);
  const resizing = drag.preview !== null;

  const commit = (next: number) => {
    setPreferred(next);
    saveMediaPanelWidth(storage, next);
  };

  const handleMouseDown = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    focusFromPointer(event.currentTarget);
    const startWidth = committed;
    const startX = event.clientX;
    drag.begin({
      startPoint: { x: event.clientX, y: event.clientY },
      initialPreview: null,
      update: (point) => dragMediaPanelWidth(startWidth, startX, point.x, viewportRef.current),
      commit: (result, moved) => {
        if (moved && result !== null) commit(result);
      },
    });
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const resize = (action: SplitterAction) => {
      commit(splitterWidthForAction(action, committed, viewportWidth));
    };
    handleShortcut('splitter', event, {
      widen: resize,
      narrow: resize,
      widenMore: resize,
      narrowMore: resize,
      narrowest: resize,
      widest: resize,
    });
  };

  const handleDoubleClick = () => {
    commit(clampMediaPanelWidth(MEDIA_PANEL_DEFAULT_WIDTH_PX, viewportWidth));
  };

  return (
    <div
      className={resizing ? 'app app--resizing' : 'app'}
      style={{ '--media-panel-width': `${width}px` } as CSSProperties}
    >
      <header className="app__transport" aria-label="Transport">
        {header}
      </header>
      <main className="app__editor" aria-label="MIDI editor">
        {editor}
      </main>
      <div
        className="app__splitter"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize media panel"
        aria-controls={MEDIA_PANEL_ID}
        aria-valuenow={width}
        aria-valuemin={MEDIA_PANEL_MIN_WIDTH_PX}
        aria-valuemax={maxWidth}
        aria-valuetext={`${width} pixels`}
        tabIndex={0}
        title="Drag to resize the media panel, double-click to reset"
        onMouseDown={handleMouseDown}
        onKeyDown={handleKeyDown}
        onDoubleClick={handleDoubleClick}
      />
      <aside id={MEDIA_PANEL_ID} className="app__media" aria-label="Media">
        {media}
      </aside>
    </div>
  );
}
