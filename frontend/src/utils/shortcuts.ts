/** Shortcuts handled on the whole page. */
export type GlobalShortcutId = 'undo' | 'redo' | 'playPause' | 'export';

/** Shortcuts handled by a focused note grid or pedal lane. */
export type EditorShortcutId =
  | 'selectAll'
  | 'delete'
  | 'clearSelection'
  | 'nudgeLeft'
  | 'nudgeRight'
  | 'nudgeUp'
  | 'nudgeDown'
  | 'octaveUp'
  | 'octaveDown';

export interface KeyLike {
  readonly key: string;
  readonly code: string;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly shiftKey: boolean;
  readonly altKey: boolean;
  readonly repeat: boolean;
}

/** Key names shown in button titles. On macOS the Ctrl shortcuts use ⌘ as well. */
export const SHORTCUT_HINTS: Readonly<Record<'undo' | 'redo' | 'export' | 'playPause', string>> = {
  undo: 'Ctrl+Z',
  redo: 'Ctrl+Shift+Z',
  export: 'Ctrl+S',
  playPause: 'Space',
};

/** Input types without text entry; Space and Enter activate or toggle them. */
const NON_TEXT_INPUT_TYPES: readonly string[] = [
  'checkbox',
  'radio',
  'button',
  'submit',
  'reset',
  'range',
  'file',
  'color',
  'image',
];

const ACTIVATION_ROLES: readonly string[] = ['button', 'checkbox', 'slider', 'switch'];

function asElement(target: EventTarget | null): Element | null {
  return target instanceof Element ? target : null;
}

/** True for text fields, where the browser handles typing, text undo and Space itself. */
export function isTextEntryTarget(target: EventTarget | null): boolean {
  const element = asElement(target);
  if (element === null) return false;
  if (element instanceof HTMLTextAreaElement) return true;
  if (element instanceof HTMLInputElement) {
    return !NON_TEXT_INPUT_TYPES.includes(element.type);
  }
  return element.closest('[contenteditable=""], [contenteditable="true"]') !== null;
}

/** True for elements where Space has a native action (press, toggle, open a list). */
export function isActivationTarget(target: EventTarget | null): boolean {
  const element = asElement(target);
  if (element === null) return false;
  if (
    element instanceof HTMLButtonElement ||
    element instanceof HTMLSelectElement ||
    element.matches('a[href], summary')
  ) {
    return true;
  }
  if (element instanceof HTMLInputElement && NON_TEXT_INPUT_TYPES.includes(element.type)) {
    return true;
  }
  const role = element.getAttribute('role');
  return role !== null && ACTIVATION_ROLES.includes(role);
}

function hasMod(event: KeyLike): boolean {
  return event.ctrlKey || event.metaKey;
}

/**
 * Page-wide shortcut for a keydown. Letters are matched by `code`, so the shortcuts work with
 * any keyboard layout; any combination with Alt (AltGr on Windows) is ignored.
 */
export function globalShortcutFor(
  event: KeyLike,
  target: EventTarget | null,
): GlobalShortcutId | null {
  if (event.altKey) return null;
  if (hasMod(event)) {
    if (event.code === 'KeyS') return event.shiftKey ? null : 'export';
    if (isTextEntryTarget(target)) return null;
    if (event.code === 'KeyZ') return event.shiftKey ? 'redo' : 'undo';
    if (event.code === 'KeyY' && !event.shiftKey) return 'redo';
    return null;
  }
  if (event.code === 'Space' && !event.shiftKey) {
    if (event.repeat || isTextEntryTarget(target) || isActivationTarget(target)) return null;
    return 'playPause';
  }
  return null;
}

const PLAIN_KEYS: ReadonlyMap<string, EditorShortcutId> = new Map([
  ['Delete', 'delete'],
  ['Backspace', 'delete'],
  ['Escape', 'clearSelection'],
  ['ArrowLeft', 'nudgeLeft'],
  ['ArrowRight', 'nudgeRight'],
  ['ArrowUp', 'nudgeUp'],
  ['ArrowDown', 'nudgeDown'],
]);

const SHIFT_KEYS: ReadonlyMap<string, EditorShortcutId> = new Map([
  ['ArrowUp', 'octaveUp'],
  ['ArrowDown', 'octaveDown'],
]);

/**
 * Shortcut of the focused note grid or pedal lane. Ctrl/⌘+A is matched by `code`; Delete,
 * Backspace, Escape and the arrows by `key`, which does not depend on the layout for them.
 */
export function editorShortcutFor(event: KeyLike): EditorShortcutId | null {
  if (event.altKey) return null;
  if (hasMod(event)) {
    return event.code === 'KeyA' && !event.shiftKey ? 'selectAll' : null;
  }
  const keys = event.shiftKey ? SHIFT_KEYS : PLAIN_KEYS;
  return keys.get(event.key) ?? null;
}
