import type { KeyChord, KeyLike } from '../keyChord.ts';

interface KeySpec {
  readonly key: string;
  readonly code: string;
}

const LETTERS: readonly KeySpec[] = Array.from({ length: 26 }, (_, index) => {
  const letter = String.fromCharCode(97 + index);
  return { key: letter, code: `Key${letter.toUpperCase()}` };
});

const DIGITS: readonly KeySpec[] = Array.from({ length: 10 }, (_, digit) => ({
  key: String(digit),
  code: `Digit${digit}`,
}));

const NAMED: readonly KeySpec[] = [
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'Home',
  'End',
  'PageUp',
  'PageDown',
  'Delete',
  'Backspace',
  'Escape',
  'Enter',
  'Tab',
  'Insert',
  'F1',
  'F5',
  'ContextMenu',
].map((name) => ({ key: name, code: name }));

const SYMBOLS: readonly KeySpec[] = [
  { key: ' ', code: 'Space' },
  { key: '?', code: 'Slash' },
  { key: '/', code: 'Slash' },
  { key: '+', code: 'Equal' },
  { key: '-', code: 'Minus' },
];

type Modifiers = Pick<KeyLike, 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey'>;

function modifiers(names: readonly ('ctrl' | 'meta' | 'shift' | 'alt')[]): Modifiers {
  return {
    ctrlKey: names.includes('ctrl'),
    metaKey: names.includes('meta'),
    shiftKey: names.includes('shift'),
    altKey: names.includes('alt'),
  };
}

const MODIFIER_SETS: readonly Modifiers[] = [
  modifiers([]),
  modifiers(['shift']),
  modifiers(['ctrl']),
  modifiers(['meta']),
  modifiers(['alt']),
  modifiers(['ctrl', 'shift']),
  modifiers(['meta', 'shift']),
  modifiers(['ctrl', 'alt']),
  modifiers(['shift', 'alt']),
];

/** Keys × modifier sets, not repeated: the keydowns the key contract tries. */
export const KEY_UNIVERSE: readonly KeyLike[] = [
  ...LETTERS,
  ...DIGITS,
  ...NAMED,
  ...SYMBOLS,
].flatMap((spec) => MODIFIER_SETS.map((mods) => ({ ...spec, ...mods, repeat: false })));

const KEY_FOR_CODE: Readonly<Record<string, string>> = { Space: ' ' };

/** A keydown that is this chord; an 'any' modifier is not held. */
export function chordEvent(chord: KeyChord): KeyLike {
  const spec: KeySpec =
    chord.code !== undefined
      ? {
          code: chord.code,
          key: KEY_FOR_CODE[chord.code] ?? chord.code.replace(/^(Key|Digit)/, '').toLowerCase(),
        }
      : { key: chord.key, code: chord.key };
  return {
    ...spec,
    ctrlKey: chord.mod === true,
    metaKey: false,
    shiftKey: chord.shift === true,
    altKey: chord.alt === true,
    repeat: false,
  };
}

/** "Ctrl+Shift+KeyZ (key z)", for failure messages. */
export function describeKey(event: KeyLike): string {
  const mods = [
    event.ctrlKey ? 'Ctrl' : '',
    event.metaKey ? 'Meta' : '',
    event.altKey ? 'Alt' : '',
    event.shiftKey ? 'Shift' : '',
  ].filter((name) => name !== '');
  return `${[...mods, event.code].join('+')} (key ${JSON.stringify(event.key)})`;
}
