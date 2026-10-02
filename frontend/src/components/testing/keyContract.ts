import { cleanup, fireEvent } from '@testing-library/react';
import { formatChord, type KeyChord } from '../../utils/keyChord.ts';
import { scopeBindings, shortcutFor, type ShortcutScope } from '../../utils/shortcutRegistry.ts';
import { KEY_UNIVERSE, chordEvent, describeKey } from '../../utils/testing/keyUniverse.ts';

function rulesTarget(target: Element | Window): EventTarget | null {
  return target instanceof Window ? null : target;
}

/**
 * For a scope: (1) every KEY_UNIVERSE event that the scope does not bind leaves the default
 * action alone (fireEvent.keyDown returns true) — nothing outside the registry is handled;
 * (2) every chord of every action, fired on a fresh setup, is handled (returns false).
 */
export async function expectKeyContract(
  scope: ShortcutScope,
  setup: () => Element | Window,
  /** Awaited after a handled chord, before cleanup(): lets async effects finish (no act() warnings). */
  settle?: (chord: KeyChord) => Promise<void>,
): Promise<void> {
  const target = setup();
  for (const event of KEY_UNIVERSE) {
    if (shortcutFor(scope, event, rulesTarget(target)) !== null) continue;
    const kept = fireEvent.keyDown(target, event);
    if (!kept) {
      throw new Error(`${scope}: ${describeKey(event)} is not in the registry but was handled`);
    }
  }
  cleanup();

  for (const [action, binding] of scopeBindings(scope)) {
    for (const chord of binding.chords) {
      const fresh = setup();
      const handled = !fireEvent.keyDown(fresh, chordEvent(chord));
      if (settle !== undefined) await settle(chord);
      cleanup();
      if (!handled) {
        throw new Error(
          `${scope}.${action}: ${formatChord(chord)} (${binding.description}) is in the registry but was not handled`,
        );
      }
    }
  }
}
