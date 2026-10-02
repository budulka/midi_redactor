import { chordMatches, formatChord, type KeyLike } from './keyChord.ts';

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

describe('chordMatches', () => {
  it('matches letters by code with Ctrl or ⌘', () => {
    const chord = { code: 'KeyZ', mod: true } as const;
    expect(chordMatches(chord, key({ key: 'z', code: 'KeyZ', ctrlKey: true }))).toBe(true);
    expect(chordMatches(chord, key({ key: 'z', code: 'KeyZ', metaKey: true }))).toBe(true);
    expect(chordMatches(chord, key({ key: 'я', code: 'KeyZ', ctrlKey: true }))).toBe(true);
    expect(chordMatches(chord, key({ key: 'z', code: 'KeyZ', ctrlKey: true, altKey: true }))).toBe(
      false,
    );
    expect(chordMatches(chord, key({ key: 'z', code: 'KeyZ' }))).toBe(false);
    expect(
      chordMatches(chord, key({ key: 'Z', code: 'KeyZ', ctrlKey: true, shiftKey: true })),
    ).toBe(false);
  });

  it('lets Shift be anything when allowed', () => {
    const chord = { key: 'Home', shift: 'any' } as const;
    expect(chordMatches(chord, key({ key: 'Home' }))).toBe(true);
    expect(chordMatches(chord, key({ key: 'Home', shiftKey: true }))).toBe(true);
    expect(chordMatches(chord, key({ key: 'Home', ctrlKey: true }))).toBe(false);
    expect(chordMatches(chord, key({ key: 'Home', altKey: true }))).toBe(false);
  });

  it('lets every modifier be anything when allowed', () => {
    const chord = { key: 'Escape', mod: 'any', shift: 'any', alt: 'any' } as const;
    expect(chordMatches(chord, key({ key: 'Escape' }))).toBe(true);
    expect(chordMatches(chord, key({ key: 'Escape', ctrlKey: true }))).toBe(true);
    expect(chordMatches(chord, key({ key: 'Escape', shiftKey: true, altKey: true }))).toBe(true);
    expect(chordMatches(chord, key({ key: 'Enter' }))).toBe(false);
  });

  it('requires Shift when the chord has it', () => {
    const chord = { key: 'ArrowUp', shift: true } as const;
    expect(chordMatches(chord, key({ key: 'ArrowUp', shiftKey: true }))).toBe(true);
    expect(chordMatches(chord, key({ key: 'ArrowUp' }))).toBe(false);
    expect(chordMatches(chord, key({ key: 'ArrowUp', shiftKey: true, ctrlKey: true }))).toBe(false);
  });
});

describe('formatChord', () => {
  it('names the keys and modifiers', () => {
    expect(formatChord({ code: 'KeyZ', mod: true, shift: true })).toBe('Ctrl+Shift+Z');
    expect(formatChord({ code: 'Space' })).toBe('Space');
    expect(formatChord({ key: 'ArrowLeft' })).toBe('←');
    expect(formatChord({ key: 'ArrowDown', shift: true })).toBe('Shift+↓');
    expect(formatChord({ key: 'Escape' })).toBe('Esc');
    expect(formatChord({ key: 'Home', shift: 'any' })).toBe('Home');
    expect(formatChord({ key: 'Tab', shift: true })).toBe('Shift+Tab');
    expect(formatChord({ key: 'Delete' })).toBe('Delete');
    expect(formatChord({ key: 'Escape', mod: 'any', shift: 'any', alt: 'any' })).toBe('Esc');
    expect(formatChord({ key: 'ArrowLeft', alt: true, mod: true })).toBe('Ctrl+Alt+←');
  });
});
