import type { SplitterAction } from './keyActions.ts';

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

/**
 * New width for a key action on the focused splitter: widen → +16 (widenMore: +64),
 * narrow → −16 (narrowMore: −64), narrowest → min, widest → max. The result is clamped.
 */
export function splitterWidthForAction(
  action: SplitterAction,
  width: number,
  viewportWidth: number,
): number {
  switch (action) {
    case 'widen':
      return clampMediaPanelWidth(width + SPLITTER_KEY_STEP_PX, viewportWidth);
    case 'widenMore':
      return clampMediaPanelWidth(width + SPLITTER_LARGE_KEY_STEP_PX, viewportWidth);
    case 'narrow':
      return clampMediaPanelWidth(width - SPLITTER_KEY_STEP_PX, viewportWidth);
    case 'narrowMore':
      return clampMediaPanelWidth(width - SPLITTER_LARGE_KEY_STEP_PX, viewportWidth);
    case 'narrowest':
      return MEDIA_PANEL_MIN_WIDTH_PX;
    case 'widest':
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
