export const MEDIA_PANEL_DEFAULT_WIDTH_PX = 360;
export const MEDIA_PANEL_MIN_WIDTH_PX = 240;
export const MEDIA_PANEL_MAX_WIDTH_PX = 960;
/** The editor column never gets narrower than this (keyboard + a usable part of the grid). */
export const EDITOR_MIN_WIDTH_PX = 480;
/** Width of the splitter column; App.css repeats it in `.app { grid-template-columns }`. */
export const SPLITTER_WIDTH_PX = 6;
export const SPLITTER_KEY_STEP_PX = 16;
export const SPLITTER_LARGE_KEY_STEP_PX = 64;
export const MEDIA_PANEL_WIDTH_STORAGE_KEY = 'midiRedactor.mediaPanelWidth';

/** Largest panel width for a window: min(960, viewport − 480), never below 240. */
export function maxMediaPanelWidth(viewportWidth: number): number {
  return Math.max(
    MEDIA_PANEL_MIN_WIDTH_PX,
    Math.min(MEDIA_PANEL_MAX_WIDTH_PX, Math.floor(viewportWidth) - EDITOR_MIN_WIDTH_PX),
  );
}

/** Rounds to whole pixels and clamps to [240, maxMediaPanelWidth(viewport)]; NaN → 360. */
export function clampMediaPanelWidth(width: number, viewportWidth: number): number {
  const wanted = Number.isNaN(width) ? MEDIA_PANEL_DEFAULT_WIDTH_PX : Math.round(width);
  return Math.min(maxMediaPanelWidth(viewportWidth), Math.max(MEDIA_PANEL_MIN_WIDTH_PX, wanted));
}

/**
 * Width while dragging: the panel is on the right, so moving the splitter left widens it.
 * clampMediaPanelWidth(startWidth + (startX − x), viewportWidth).
 */
export function dragMediaPanelWidth(
  startWidth: number,
  startX: number,
  x: number,
  viewportWidth: number,
): number {
  return clampMediaPanelWidth(startWidth + (startX - x), viewportWidth);
}

export type SplitterKeyName = 'ArrowLeft' | 'ArrowRight' | 'Home' | 'End';

/**
 * Keys of the focused splitter; the single source for keyboardMediaPanelWidth and, later, for
 * the shortcut list of task 018.
 */
export const SPLITTER_KEYS: readonly {
  readonly key: SplitterKeyName;
  readonly description: string;
}[] = [
  {
    key: 'ArrowLeft',
    description: `Widen the media panel by ${SPLITTER_KEY_STEP_PX} px (Shift: ${SPLITTER_LARGE_KEY_STEP_PX} px)`,
  },
  {
    key: 'ArrowRight',
    description: `Narrow the media panel by ${SPLITTER_KEY_STEP_PX} px (Shift: ${SPLITTER_LARGE_KEY_STEP_PX} px)`,
  },
  { key: 'Home', description: 'Make the media panel as narrow as possible' },
  { key: 'End', description: 'Make the media panel as wide as possible' },
];

export interface SplitterKey {
  readonly key: string;
  readonly shiftKey: boolean;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly altKey: boolean;
}

function isSplitterKeyName(key: string): key is SplitterKeyName {
  return SPLITTER_KEYS.some((entry) => entry.key === key);
}

/**
 * New width for a key on the focused splitter, or null when the key is not ours.
 * ArrowLeft → +16 (Shift: +64), ArrowRight → −16 (Shift: −64), Home → min, End → max.
 * Any key with Ctrl, ⌘ or Alt → null. The result is clamped.
 */
export function keyboardMediaPanelWidth(
  event: SplitterKey,
  width: number,
  viewportWidth: number,
): number | null {
  if (event.ctrlKey || event.metaKey || event.altKey) return null;
  if (!isSplitterKeyName(event.key)) return null;
  const step = event.shiftKey ? SPLITTER_LARGE_KEY_STEP_PX : SPLITTER_KEY_STEP_PX;
  switch (event.key) {
    case 'ArrowLeft':
      return clampMediaPanelWidth(width + step, viewportWidth);
    case 'ArrowRight':
      return clampMediaPanelWidth(width - step, viewportWidth);
    case 'Home':
      return MEDIA_PANEL_MIN_WIDTH_PX;
    case 'End':
      return maxMediaPanelWidth(viewportWidth);
  }
}

/** A stored value: a finite positive number (rounded) or null. */
export function parseStoredMediaPanelWidth(raw: string | null): number | null {
  if (raw === null || raw.trim() === '') return null;
  const value = Number(raw);
  if (!Number.isFinite(value)) return null;
  const rounded = Math.round(value);
  return rounded > 0 ? rounded : null;
}

export type WidthStorage = Pick<Storage, 'getItem' | 'setItem'>;

/** window.localStorage, or null when the browser refuses access (privacy mode, sandbox). */
export function browserStorage(): WidthStorage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Stored width or null; never throws. */
export function loadMediaPanelWidth(storage: WidthStorage | null): number | null {
  if (storage === null) return null;
  try {
    return parseStoredMediaPanelWidth(storage.getItem(MEDIA_PANEL_WIDTH_STORAGE_KEY));
  } catch {
    return null;
  }
}

/** Stores the width as an integer string; storage errors (quota, privacy mode) are ignored. */
export function saveMediaPanelWidth(storage: WidthStorage | null, width: number): void {
  if (storage === null) return;
  try {
    storage.setItem(MEDIA_PANEL_WIDTH_STORAGE_KEY, String(Math.round(width)));
  } catch {
    // The width then lasts only for this session, which is fine for a layout preference.
  }
}
