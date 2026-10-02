import { chordMatches, type KeyLike } from './keyChord.ts';
import {
  KEY_SCOPES,
  SHORTCUT_SCOPES,
  handleShortcut,
  scopeBindings,
  shortcutFor,
  shortcutHint,
  type ShortcutEvent,
  type ShortcutScope,
} from './shortcutRegistry.ts';
import { KEY_UNIVERSE, chordEvent, describeKey } from './testing/keyUniverse.ts';

function key(partial: Partial<KeyLike>): KeyLike {
  return {
    key: '',
    code: '',
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    altKey: false,
    repeat: false,
    ...partial,
  };
}

const named = (name: string, extra: Partial<KeyLike> = {}) =>
  key({ key: name, code: name, ...extra });
const letterA = key({ key: 'a', code: 'KeyA' });

describe('shortcutFor noteGrid (was editorShortcutFor)', () => {
  it('matches select all by code', () => {
    expect(shortcutFor('noteGrid', key({ key: 'a', code: 'KeyA', ctrlKey: true }))).toBe(
      'selectAll',
    );
    expect(shortcutFor('noteGrid', key({ key: 'ф', code: 'KeyA', metaKey: true }))).toBe(
      'selectAll',
    );
    expect(shortcutFor('noteGrid', key({ key: 'a', code: 'KeyA' }))).toBeNull();
  });

  it('matches delete, escape and arrows by key', () => {
    expect(shortcutFor('noteGrid', key({ key: 'Delete' }))).toBe('delete');
    expect(shortcutFor('noteGrid', key({ key: 'Backspace' }))).toBe('delete');
    expect(shortcutFor('noteGrid', key({ key: 'Escape' }))).toBe('clearSelection');
    expect(shortcutFor('noteGrid', key({ key: 'ArrowLeft' }))).toBe('nudgeLeft');
    expect(shortcutFor('noteGrid', key({ key: 'ArrowRight' }))).toBe('nudgeRight');
    expect(shortcutFor('noteGrid', key({ key: 'ArrowUp' }))).toBe('nudgeUp');
    expect(shortcutFor('noteGrid', key({ key: 'ArrowDown' }))).toBe('nudgeDown');
    expect(shortcutFor('noteGrid', key({ key: 'ArrowUp', shiftKey: true }))).toBe('octaveUp');
    expect(shortcutFor('noteGrid', key({ key: 'ArrowDown', shiftKey: true }))).toBe('octaveDown');
  });

  it('ignores other combinations', () => {
    expect(shortcutFor('noteGrid', key({ key: 'ArrowUp', ctrlKey: true }))).toBeNull();
    expect(shortcutFor('noteGrid', key({ key: 'ArrowUp', altKey: true }))).toBeNull();
    expect(shortcutFor('noteGrid', key({ key: 'ArrowLeft', shiftKey: true }))).toBeNull();
    expect(shortcutFor('noteGrid', key({ key: 'constructor' }))).toBeNull();
  });
});

describe('shortcutFor in the other scopes', () => {
  it('pedalLane: select all, delete and clear, no arrows', () => {
    expect(shortcutFor('pedalLane', key({ key: 'a', code: 'KeyA', ctrlKey: true }))).toBe(
      'selectAll',
    );
    expect(shortcutFor('pedalLane', named('Delete'))).toBe('delete');
    expect(shortcutFor('pedalLane', named('Backspace'))).toBe('delete');
    expect(shortcutFor('pedalLane', named('Escape'))).toBe('clearSelection');
    expect(shortcutFor('pedalLane', named('ArrowUp'))).toBeNull();
    expect(shortcutFor('pedalLane', named('ArrowLeft'))).toBeNull();
  });

  it('mediaTimeline: seek, cut and clear', () => {
    expect(shortcutFor('mediaTimeline', named('ArrowLeft'))).toBe('stepBack');
    expect(shortcutFor('mediaTimeline', named('ArrowRight', { shiftKey: true }))).toBe(
      'bigStepForward',
    );
    expect(shortcutFor('mediaTimeline', named('Home'))).toBe('toStart');
    expect(shortcutFor('mediaTimeline', named('Home', { shiftKey: true }))).toBe('toStart');
    expect(shortcutFor('mediaTimeline', named('End'))).toBe('toEnd');
    expect(shortcutFor('mediaTimeline', named('Delete'))).toBe('cutSelection');
    expect(shortcutFor('mediaTimeline', named('Backspace'))).toBe('cutSelection');
    expect(shortcutFor('mediaTimeline', named('Escape'))).toBe('clearSelection');
    expect(shortcutFor('mediaTimeline', letterA)).toBeNull();
    expect(shortcutFor('mediaTimeline', named('ArrowLeft', { ctrlKey: true }))).toBeNull();
    expect(shortcutFor('mediaTimeline', named('ArrowLeft', { altKey: true }))).toBeNull();
    expect(shortcutFor('mediaTimeline', named('ArrowRight', { metaKey: true }))).toBeNull();
  });

  it('mediaTimeline and cutEdge: Delete, Backspace and Escape only without modifiers', () => {
    expect(shortcutFor('mediaTimeline', named('Delete', { shiftKey: true }))).toBeNull();
    expect(shortcutFor('mediaTimeline', named('Backspace', { ctrlKey: true }))).toBeNull();
    expect(shortcutFor('mediaTimeline', named('Escape', { shiftKey: true }))).toBeNull();
    expect(shortcutFor('cutEdge', named('Delete', { shiftKey: true }))).toBeNull();
  });

  it('cutEdge: arrows and remove', () => {
    expect(shortcutFor('cutEdge', named('ArrowRight'))).toBe('stepForward');
    expect(shortcutFor('cutEdge', named('ArrowLeft', { shiftKey: true }))).toBe('bigStepBack');
    expect(shortcutFor('cutEdge', named('Delete'))).toBe('removeCut');
    expect(shortcutFor('cutEdge', named('Home'))).toBeNull();
    expect(shortcutFor('cutEdge', letterA)).toBeNull();
  });

  it('barOneMarker: arrows, Home and End', () => {
    expect(shortcutFor('barOneMarker', named('ArrowLeft'))).toBe('stepBack');
    expect(shortcutFor('barOneMarker', named('ArrowRight', { shiftKey: true }))).toBe(
      'bigStepForward',
    );
    expect(shortcutFor('barOneMarker', named('Home', { shiftKey: true }))).toBe('toStart');
    expect(shortcutFor('barOneMarker', named('End'))).toBe('toEnd');
    expect(shortcutFor('barOneMarker', named('ArrowLeft', { altKey: true }))).toBeNull();
    expect(shortcutFor('barOneMarker', named('Delete'))).toBeNull();
    expect(shortcutFor('barOneMarker', named('Escape'))).toBeNull();
    expect(shortcutFor('barOneMarker', letterA)).toBeNull();
  });

  it('splitter: arrows, Home and End without Ctrl, ⌘ or Alt', () => {
    expect(shortcutFor('splitter', named('ArrowLeft'))).toBe('widen');
    expect(shortcutFor('splitter', named('ArrowLeft', { shiftKey: true }))).toBe('widenMore');
    expect(shortcutFor('splitter', named('ArrowRight'))).toBe('narrow');
    expect(shortcutFor('splitter', named('ArrowRight', { shiftKey: true }))).toBe('narrowMore');
    expect(shortcutFor('splitter', named('Home'))).toBe('narrowest');
    expect(shortcutFor('splitter', named('End'))).toBe('widest');
    for (const name of ['ArrowUp', 'ArrowDown', 'Enter', 'Tab']) {
      expect(shortcutFor('splitter', named(name))).toBeNull();
    }
    expect(shortcutFor('splitter', letterA)).toBeNull();
    for (const modifier of [{ ctrlKey: true }, { metaKey: true }, { altKey: true }]) {
      expect(shortcutFor('splitter', named('ArrowLeft', modifier))).toBeNull();
    }
  });

  it('contextMenu: navigation and close without modifiers', () => {
    expect(shortcutFor('contextMenu', named('ArrowDown'))).toBe('next');
    expect(shortcutFor('contextMenu', named('ArrowUp'))).toBe('previous');
    expect(shortcutFor('contextMenu', named('Home'))).toBe('first');
    expect(shortcutFor('contextMenu', named('End'))).toBe('last');
    expect(shortcutFor('contextMenu', named('Escape'))).toBe('close');
    expect(shortcutFor('contextMenu', named('ArrowDown', { shiftKey: true }))).toBeNull();
  });

  it('numberField: Enter and Escape without modifiers', () => {
    expect(shortcutFor('numberField', named('Enter'))).toBe('apply');
    expect(shortcutFor('numberField', named('Escape'))).toBe('revert');
    expect(shortcutFor('numberField', named('Tab'))).toBeNull();
    expect(shortcutFor('numberField', named('Enter', { ctrlKey: true }))).toBeNull();
    expect(shortcutFor('numberField', named('Enter', { shiftKey: true }))).toBeNull();
    expect(shortcutFor('numberField', named('Escape', { shiftKey: true }))).toBeNull();
  });

  it('dragGesture: Escape with any modifiers', () => {
    expect(shortcutFor('dragGesture', named('Escape'))).toBe('cancel');
    expect(shortcutFor('dragGesture', named('Escape', { shiftKey: true }))).toBe('cancel');
    expect(shortcutFor('dragGesture', named('Escape', { ctrlKey: true }))).toBe('cancel');
    expect(shortcutFor('dragGesture', named('Enter'))).toBeNull();
  });

  it('infoDialog: close and the focus trap', () => {
    expect(shortcutFor('infoDialog', named('Escape'))).toBe('close');
    expect(shortcutFor('infoDialog', named('Tab'))).toBe('focusNext');
    expect(shortcutFor('infoDialog', named('Tab', { shiftKey: true }))).toBe('focusPrevious');
  });
});

describe('global shortcuts and a modal window', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  function buttonIn(html: string): Element {
    const container = document.createElement('div');
    container.innerHTML = html;
    document.body.append(container);
    const found = container.querySelector('button');
    if (found === null) throw new Error('no button');
    return found;
  }

  const ctrlZ = key({ key: 'z', code: 'KeyZ', ctrlKey: true });
  const ctrlY = key({ key: 'y', code: 'KeyY', ctrlKey: true });
  const ctrlS = key({ key: 's', code: 'KeyS', ctrlKey: true });
  const space = key({ key: ' ', code: 'Space' });

  it('turns off undo, redo and play inside a modal window, but not export', () => {
    const inside = buttonIn('<div role="dialog" aria-modal="true"><button>b</button></div>');
    expect(shortcutFor('global', ctrlZ, inside)).toBeNull();
    expect(shortcutFor('global', ctrlY, inside)).toBeNull();
    expect(shortcutFor('global', space, inside)).toBeNull();
    expect(shortcutFor('global', ctrlS, inside)).toBe('export');
  });

  it('keeps them in a dialog that is not modal', () => {
    const inside = buttonIn('<div role="dialog"><button>b</button></div>');
    expect(shortcutFor('global', ctrlZ, inside)).toBe('undo');
  });
});

describe('registry structure', () => {
  it('has chords and a description for every action', () => {
    for (const scope of SHORTCUT_SCOPES) {
      for (const [action, binding] of scopeBindings(scope)) {
        expect(binding.chords.length, `${scope}.${action}`).toBeGreaterThan(0);
        expect(binding.description, `${scope}.${action}`).not.toBe('');
      }
    }
  });

  it('lists the scopes in order', () => {
    expect(SHORTCUT_SCOPES).toEqual(Object.keys(KEY_SCOPES));
    expect(SHORTCUT_SCOPES).toHaveLength(11);
  });

  function matchingActions(scope: ShortcutScope, event: KeyLike): string[] {
    return scopeBindings(scope)
      .filter(([, binding]) => binding.chords.some((chord) => chordMatches(chord, event)))
      .map(([action]) => action);
  }

  it('has no conflicts inside a scope', () => {
    for (const scope of SHORTCUT_SCOPES) {
      for (const event of KEY_UNIVERSE) {
        expect(
          matchingActions(scope, event).length,
          `${scope} ${describeKey(event)}`,
        ).toBeLessThanOrEqual(1);
      }
    }
  });

  it('does not let a scope take a page-wide key', () => {
    for (const event of KEY_UNIVERSE) {
      if (shortcutFor('global', event, null) === null) continue;
      for (const scope of SHORTCUT_SCOPES) {
        if (scope === 'global') continue;
        expect(shortcutFor(scope, event), `${scope} ${describeKey(event)}`).toBeNull();
      }
    }
  });

  it('tries every chord of the registry in the key universe', () => {
    const universe = new Set(KEY_UNIVERSE.map(describeKey));
    for (const scope of SHORTCUT_SCOPES) {
      for (const [action, binding] of scopeBindings(scope)) {
        for (const chord of binding.chords) {
          expect(universe.has(describeKey(chordEvent(chord))), `${scope}.${action}`).toBe(true);
        }
      }
    }
  });
});

describe('handleShortcut', () => {
  function event(
    partial: Partial<KeyLike>,
  ): ShortcutEvent & { preventDefault: ReturnType<typeof vi.fn> } {
    return { ...key(partial), target: null, preventDefault: vi.fn() };
  }

  it('runs the handler and prevents the default', () => {
    const escape = event({ key: 'Escape' });
    const revert = vi.fn();
    expect(handleShortcut('numberField', escape, { apply: vi.fn(), revert })).toBe(true);
    expect(revert).toHaveBeenCalledWith('revert');
    expect(escape.preventDefault).toHaveBeenCalledTimes(1);
  });

  it('keeps the default when the handler returns false', () => {
    const escape = event({ key: 'Escape' });
    expect(handleShortcut('numberField', escape, { apply: vi.fn(), revert: () => false })).toBe(
      false,
    );
    expect(escape.preventDefault).not.toHaveBeenCalled();
  });

  it('does nothing for other keys', () => {
    const tab = event({ key: 'Tab' });
    const apply = vi.fn();
    const revert = vi.fn();
    expect(handleShortcut('numberField', tab, { apply, revert })).toBe(false);
    expect(apply).not.toHaveBeenCalled();
    expect(revert).not.toHaveBeenCalled();
    expect(tab.preventDefault).not.toHaveBeenCalled();
  });
});

describe('hints and descriptions', () => {
  it('formats the first chord', () => {
    expect(shortcutHint('global', 'redo')).toBe('Ctrl+Shift+Z');
    expect(shortcutHint('splitter', 'narrowest')).toBe('Home');
  });

  it('takes the numbers from the step constants', () => {
    expect(KEY_SCOPES.mediaTimeline.stepBack.description).toContain('0.1 s');
    expect(KEY_SCOPES.cutEdge.bigStepForward.description).toContain('100 ms');
    expect(KEY_SCOPES.splitter.widenMore.description).toContain('64 px');
  });
});
