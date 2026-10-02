import type { KeyLike } from './keyChord.ts';
import { shortcutFor, shortcutHint, type ScopeAction } from './shortcutRegistry.ts';

export type { KeyLike } from './keyChord.ts';
export { isActivationTarget, isTextEntryTarget } from './keyTargets.ts';

/** Shortcuts handled on the whole page. */
export type GlobalShortcutId = ScopeAction<'global'>;

/** Key names shown in button titles, from the shortcut registry. On macOS Ctrl means ⌘ as well. */
export const SHORTCUT_HINTS: Readonly<Record<'undo' | 'redo' | 'export' | 'playPause', string>> = {
  undo: shortcutHint('global', 'undo'),
  redo: shortcutHint('global', 'redo'),
  export: shortcutHint('global', 'export'),
  playPause: shortcutHint('global', 'playPause'),
};

/**
 * Page-wide shortcut for a keydown (see the global scope of the registry). Letters are matched by
 * `code`, so the shortcuts work with any keyboard layout; combinations with Alt are ignored.
 */
export function globalShortcutFor(
  event: KeyLike,
  target: EventTarget | null,
): GlobalShortcutId | null {
  return shortcutFor('global', event, target);
}
