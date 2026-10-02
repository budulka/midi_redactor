import { chordMatches, formatChord, type KeyChord, type KeyLike } from './keyChord.ts';
import type { SeekAction, SplitterAction, StepAction } from './keyActions.ts';
import { isActivationTarget, isInsideModal, isTextEntryTarget } from './keyTargets.ts';
import { CUT_KEY_BIG_STEP_SECONDS, CUT_KEY_STEP_SECONDS } from './mediaCuts.ts';
import { OFFSET_KEY_BIG_STEP_SECONDS, OFFSET_KEY_STEP_SECONDS } from './mediaOffset.ts';
import { SPLITTER_KEY_STEP_PX, SPLITTER_LARGE_KEY_STEP_PX } from './mediaPanelWidth.ts';
import { TIMELINE_KEY_BIG_STEP_SECONDS, TIMELINE_KEY_STEP_SECONDS } from './mediaTimeline.ts';

/** The actions of every place that handles keys. */
interface ScopeActionMap {
  global: 'undo' | 'redo' | 'playPause' | 'export';
  noteGrid:
    | 'selectAll'
    | 'delete'
    | 'clearSelection'
    | 'nudgeLeft'
    | 'nudgeRight'
    | 'nudgeUp'
    | 'nudgeDown'
    | 'octaveUp'
    | 'octaveDown';
  pedalLane: 'selectAll' | 'delete' | 'clearSelection';
  dragGesture: 'cancel';
  mediaTimeline: SeekAction | 'cutSelection' | 'clearSelection';
  cutEdge: StepAction | 'removeCut';
  barOneMarker: SeekAction;
  splitter: SplitterAction;
  contextMenu: 'next' | 'previous' | 'first' | 'last' | 'close';
  numberField: 'apply' | 'revert';
  infoDialog: 'close' | 'focusNext' | 'focusPrevious';
}

export type ShortcutScope = keyof ScopeActionMap;
export type ScopeAction<S extends ShortcutScope> = ScopeActionMap[S];

/** Where a page-wide shortcut works. */
export type TargetRule = 'everywhere' | 'notInTextFields' | 'notInTextFieldsOrControls';

export interface KeyBinding {
  /** At least one; the first one is the hint. */
  readonly chords: readonly KeyChord[];
  /** English, shown in the Info window. */
  readonly description: string;
  /** Only for the global scope; default 'everywhere'. */
  readonly target?: TargetRule;
  /** Auto-repeated keydowns trigger the action; default true. */
  readonly repeat?: boolean;
}

type ScopeBindings<S extends ShortcutScope> = { readonly [A in ScopeAction<S>]: KeyBinding };

/** "10 ms" for 0.01 s. */
function ms(seconds: number): string {
  return `${Math.round(seconds * 1000)} ms`;
}

const DELETE_KEYS: readonly KeyChord[] = [{ key: 'Delete' }, { key: 'Backspace' }];
const SELECT_ALL: readonly KeyChord[] = [{ code: 'KeyA', mod: true }];
const ESCAPE: readonly KeyChord[] = [{ key: 'Escape' }];
const LEFT: readonly KeyChord[] = [{ key: 'ArrowLeft' }];
const RIGHT: readonly KeyChord[] = [{ key: 'ArrowRight' }];
const SHIFT_LEFT: readonly KeyChord[] = [{ key: 'ArrowLeft', shift: true }];
const SHIFT_RIGHT: readonly KeyChord[] = [{ key: 'ArrowRight', shift: true }];
const HOME: readonly KeyChord[] = [{ key: 'Home', shift: 'any' }];
const END: readonly KeyChord[] = [{ key: 'End', shift: 'any' }];

/**
 * Every keyboard shortcut of the app. Handlers recognize keys only through this registry
 * (shortcutFor, handleShortcut) and the Info window lists it, so the two cannot drift apart.
 * Keyed by action, so TypeScript requires a binding for every action of a scope.
 */
export const KEY_SCOPES: { readonly [S in ShortcutScope]: ScopeBindings<S> } = {
  global: {
    undo: { chords: [{ code: 'KeyZ', mod: true }], description: 'Undo', target: 'notInTextFields' },
    redo: {
      chords: [
        { code: 'KeyZ', mod: true, shift: true },
        { code: 'KeyY', mod: true },
      ],
      description: 'Redo',
      target: 'notInTextFields',
    },
    playPause: {
      chords: [{ code: 'Space' }],
      description: 'Play / Pause',
      target: 'notInTextFieldsOrControls',
      repeat: false,
    },
    export: {
      chords: [{ code: 'KeyS', mod: true }],
      description: 'Export .mid',
      target: 'everywhere',
    },
  },
  noteGrid: {
    selectAll: { chords: SELECT_ALL, description: 'Select all notes' },
    delete: { chords: DELETE_KEYS, description: 'Delete the selected notes' },
    clearSelection: { chords: ESCAPE, description: 'Clear the selection' },
    nudgeLeft: { chords: LEFT, description: 'Move the selected notes one grid step earlier' },
    nudgeRight: { chords: RIGHT, description: 'Move the selected notes one grid step later' },
    nudgeUp: { chords: [{ key: 'ArrowUp' }], description: 'Move the selected notes a semitone up' },
    nudgeDown: {
      chords: [{ key: 'ArrowDown' }],
      description: 'Move the selected notes a semitone down',
    },
    octaveUp: {
      chords: [{ key: 'ArrowUp', shift: true }],
      description: 'Move the selected notes an octave up',
    },
    octaveDown: {
      chords: [{ key: 'ArrowDown', shift: true }],
      description: 'Move the selected notes an octave down',
    },
  },
  pedalLane: {
    selectAll: { chords: SELECT_ALL, description: 'Select all pedal presses' },
    delete: { chords: DELETE_KEYS, description: 'Delete the selected pedal presses' },
    clearSelection: { chords: ESCAPE, description: 'Clear the selection' },
  },
  dragGesture: {
    cancel: {
      chords: [{ key: 'Escape', mod: 'any', shift: 'any', alt: 'any' }],
      description: 'Cancel the drag (nothing changes)',
    },
  },
  mediaTimeline: {
    stepBack: {
      chords: LEFT,
      description: `Move the playhead ${TIMELINE_KEY_STEP_SECONDS} s back`,
    },
    stepForward: {
      chords: RIGHT,
      description: `Move the playhead ${TIMELINE_KEY_STEP_SECONDS} s forward`,
    },
    bigStepBack: {
      chords: SHIFT_LEFT,
      description: `Move the playhead ${TIMELINE_KEY_BIG_STEP_SECONDS} s back`,
    },
    bigStepForward: {
      chords: SHIFT_RIGHT,
      description: `Move the playhead ${TIMELINE_KEY_BIG_STEP_SECONDS} s forward`,
    },
    toStart: { chords: HOME, description: 'Go to bar 1' },
    toEnd: { chords: END, description: 'Go to the end of the media' },
    cutSelection: { chords: DELETE_KEYS, description: 'Cut the selected range from the media' },
    clearSelection: { chords: ESCAPE, description: 'Clear the selected range' },
  },
  cutEdge: {
    stepBack: { chords: LEFT, description: `Move the edge ${ms(CUT_KEY_STEP_SECONDS)} earlier` },
    stepForward: { chords: RIGHT, description: `Move the edge ${ms(CUT_KEY_STEP_SECONDS)} later` },
    bigStepBack: {
      chords: SHIFT_LEFT,
      description: `Move the edge ${ms(CUT_KEY_BIG_STEP_SECONDS)} earlier`,
    },
    bigStepForward: {
      chords: SHIFT_RIGHT,
      description: `Move the edge ${ms(CUT_KEY_BIG_STEP_SECONDS)} later`,
    },
    removeCut: { chords: DELETE_KEYS, description: 'Remove the cut (bring the range back)' },
  },
  barOneMarker: {
    stepBack: {
      chords: LEFT,
      description: `Move bar 1 ${ms(OFFSET_KEY_STEP_SECONDS)} earlier in the media`,
    },
    stepForward: {
      chords: RIGHT,
      description: `Move bar 1 ${ms(OFFSET_KEY_STEP_SECONDS)} later in the media`,
    },
    bigStepBack: {
      chords: SHIFT_LEFT,
      description: `Move bar 1 ${ms(OFFSET_KEY_BIG_STEP_SECONDS)} earlier in the media`,
    },
    bigStepForward: {
      chords: SHIFT_RIGHT,
      description: `Move bar 1 ${ms(OFFSET_KEY_BIG_STEP_SECONDS)} later in the media`,
    },
    toStart: { chords: HOME, description: 'Put bar 1 at the start of the media' },
    toEnd: { chords: END, description: 'Put bar 1 at the end of the media' },
  },
  splitter: {
    widen: { chords: LEFT, description: `Widen the media panel by ${SPLITTER_KEY_STEP_PX} px` },
    narrow: { chords: RIGHT, description: `Narrow the media panel by ${SPLITTER_KEY_STEP_PX} px` },
    widenMore: {
      chords: SHIFT_LEFT,
      description: `Widen the media panel by ${SPLITTER_LARGE_KEY_STEP_PX} px`,
    },
    narrowMore: {
      chords: SHIFT_RIGHT,
      description: `Narrow the media panel by ${SPLITTER_LARGE_KEY_STEP_PX} px`,
    },
    narrowest: { chords: HOME, description: 'Make the media panel as narrow as possible' },
    widest: { chords: END, description: 'Make the media panel as wide as possible' },
  },
  contextMenu: {
    next: { chords: [{ key: 'ArrowDown' }], description: 'Next item' },
    previous: { chords: [{ key: 'ArrowUp' }], description: 'Previous item' },
    first: { chords: [{ key: 'Home' }], description: 'First item' },
    last: { chords: [{ key: 'End' }], description: 'Last item' },
    close: { chords: ESCAPE, description: 'Close the menu' },
  },
  numberField: {
    apply: {
      chords: [{ key: 'Enter' }],
      description: 'Apply the value (leaving the field applies it too)',
    },
    revert: { chords: ESCAPE, description: 'Restore the current value' },
  },
  infoDialog: {
    close: { chords: ESCAPE, description: 'Close this window' },
    focusNext: { chords: [{ key: 'Tab' }], description: 'Next control in this window' },
    focusPrevious: {
      chords: [{ key: 'Tab', shift: true }],
      description: 'Previous control in this window',
    },
  },
};

/** The scopes in registry order. */
export const SHORTCUT_SCOPES: readonly ShortcutScope[] = Object.keys(KEY_SCOPES) as ShortcutScope[];

/** The bindings of a scope as [action, binding] pairs, in registry order. */
export function scopeBindings<S extends ShortcutScope>(
  scope: S,
): readonly (readonly [ScopeAction<S>, KeyBinding])[] {
  // Object.entries loses the key type; the keys of KEY_SCOPES[scope] are exactly its actions.
  return Object.entries(KEY_SCOPES[scope]) as [ScopeAction<S>, KeyBinding][];
}

function targetAllows(rule: TargetRule, target: EventTarget | null): boolean {
  if (rule === 'everywhere') return true;
  if (isTextEntryTarget(target) || isInsideModal(target)) return false;
  return rule === 'notInTextFields' || !isActivationTarget(target);
}

/** The action of a scope for a keydown, or null. `target` matters only for the global scope. */
export function shortcutFor<S extends ShortcutScope>(
  scope: S,
  event: KeyLike,
  target: EventTarget | null = null,
): ScopeAction<S> | null {
  for (const [action, binding] of scopeBindings(scope)) {
    if (!binding.chords.some((chord) => chordMatches(chord, event))) continue;
    if (binding.repeat === false && event.repeat) continue;
    if (scope === 'global' && !targetAllows(binding.target ?? 'everywhere', target)) continue;
    return action;
  }
  return null;
}

export type ShortcutHandlers<S extends ShortcutScope> = {
  readonly [A in ScopeAction<S>]: (action: A) => boolean | void;
};

/** The keydown fields handleShortcut needs. */
export type ShortcutEvent = KeyLike & {
  readonly target: EventTarget | null;
  preventDefault(): void;
};

/**
 * Runs the handler of the scope's action for a keydown. A handler returns false when the action
 * does not apply now (e.g. nothing is selected); then the event keeps its default action.
 * Otherwise the default is prevented and the function returns true.
 */
export function handleShortcut<S extends ShortcutScope>(
  scope: S,
  event: ShortcutEvent,
  handlers: ShortcutHandlers<S>,
): boolean {
  const action = shortcutFor(scope, event, event.target);
  if (action === null) return false;
  // TypeScript cannot correlate the action with its handler for a generic scope.
  const handler = handlers[action] as (action: ScopeAction<S>) => boolean | void;
  if (handler(action) === false) return false;
  event.preventDefault();
  return true;
}

/** formatChord of the first chord of an action: shortcutHint('global', 'redo') === 'Ctrl+Shift+Z'. */
export function shortcutHint<S extends ShortcutScope>(scope: S, action: ScopeAction<S>): string {
  const bindings: ScopeBindings<S> = KEY_SCOPES[scope];
  const binding: KeyBinding = bindings[action];
  return formatChord(binding.chords[0]);
}

/** Where a page-wide shortcut works, as a note for its description. */
export function targetRuleNote(rule: TargetRule): string {
  switch (rule) {
    case 'everywhere':
      return 'works in text fields too';
    case 'notInTextFields':
      return 'not in text fields';
    case 'notInTextFieldsOrControls':
      return 'not in text fields, buttons, lists, checkboxes or sliders';
  }
}
