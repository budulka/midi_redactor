import { useEffect, useLayoutEffect, useRef } from 'react';
import { globalShortcutFor, type GlobalShortcutId } from '../utils/shortcuts.ts';

export type GlobalShortcutHandlers = Partial<Record<GlobalShortcutId, () => void>>;

/**
 * Handles page-wide shortcuts with one `keydown` listener on window. Events already handled
 * (`defaultPrevented`, e.g. by the note grid, whose React handler runs first) are ignored.
 * The latest handlers are read through a ref, so the listener is added only once.
 */
export function useGlobalShortcuts(handlers: GlobalShortcutHandlers): void {
  const latest = useRef(handlers);

  useLayoutEffect(() => {
    latest.current = handlers;
  });

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented) return;
      const id = globalShortcutFor(event, event.target);
      if (id === null) return;
      const handler = latest.current[id];
      if (handler === undefined) return;
      event.preventDefault();
      handler();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);
}
