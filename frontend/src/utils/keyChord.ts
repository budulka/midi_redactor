/** The fields of a keydown that shortcuts look at (KeyboardEvent and React's KeyboardEvent fit). */
export interface KeyLike {
  readonly key: string;
  readonly code: string;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly shiftKey: boolean;
  readonly altKey: boolean;
  readonly repeat: boolean;
}

/** true: the modifier must be held; false: it must not be; 'any': it does not matter. */
export type ModifierRule = boolean | 'any';

/** One key combination. Letters and Space are matched by `code` (any keyboard layout), named keys by `key`. */
export type KeyChord = (
  { readonly code: string; readonly key?: never } | { readonly key: string; readonly code?: never }
) & {
  /** Ctrl or ⌘ held; default false. */
  readonly mod?: ModifierRule;
  /** Default false. */
  readonly shift?: ModifierRule;
  /** Default false: Alt (AltGr on Windows) combinations are never shortcuts unless allowed. */
  readonly alt?: ModifierRule;
};

function modifierMatches(rule: ModifierRule | undefined, held: boolean): boolean {
  const wanted = rule ?? false;
  return wanted === 'any' || wanted === held;
}

/** True when the keydown is this chord: the modifiers agree and the code (or key) is the same. */
export function chordMatches(chord: KeyChord, event: KeyLike): boolean {
  if (!modifierMatches(chord.mod, event.ctrlKey || event.metaKey)) return false;
  if (!modifierMatches(chord.shift, event.shiftKey)) return false;
  if (!modifierMatches(chord.alt, event.altKey)) return false;
  if (chord.code !== undefined) return event.code === chord.code;
  return event.key === chord.key;
}

const KEY_NAMES: Readonly<Record<string, string>> = {
  ArrowLeft: '←',
  ArrowRight: '→',
  ArrowUp: '↑',
  ArrowDown: '↓',
  Escape: 'Esc',
};

function codeName(code: string): string {
  const letter = /^Key([A-Z])$/.exec(code);
  if (letter !== null) return letter[1];
  const digit = /^Digit([0-9])$/.exec(code);
  if (digit !== null) return digit[1];
  return code;
}

/** "Ctrl+Shift+Z", "Shift+↑", "Space", "Esc", "Home". Modifiers with 'any' are not shown. */
export function formatChord(chord: KeyChord): string {
  const name =
    chord.code !== undefined ? codeName(chord.code) : (KEY_NAMES[chord.key] ?? chord.key);
  const prefix =
    (chord.mod === true ? 'Ctrl+' : '') +
    (chord.alt === true ? 'Alt+' : '') +
    (chord.shift === true ? 'Shift+' : '');
  return prefix + name;
}
