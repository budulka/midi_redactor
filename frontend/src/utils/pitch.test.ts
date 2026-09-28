import { KEYBOARD_PITCHES, KEY_COUNT, isBlackKey, pitchName } from './pitch.ts';

describe('pitchName', () => {
  it.each([
    [21, 'A0'],
    [60, 'C4'],
    [61, 'C#4'],
    [69, 'A4'],
    [108, 'C8'],
  ])('names pitch %i as %s', (pitch, name) => {
    expect(pitchName(pitch)).toBe(name);
  });
});

describe('isBlackKey', () => {
  it.each([
    [60, false],
    [61, true],
    [22, true],
    [108, false],
  ])('pitch %i -> %s', (pitch, black) => {
    expect(isBlackKey(pitch)).toBe(black);
  });
});

describe('KEYBOARD_PITCHES', () => {
  it('lists 88 keys from C8 down to A0', () => {
    expect(KEY_COUNT).toBe(88);
    expect(KEYBOARD_PITCHES).toHaveLength(88);
    expect(KEYBOARD_PITCHES[0]).toBe(108);
    expect(KEYBOARD_PITCHES[87]).toBe(21);
    expect(KEYBOARD_PITCHES.filter(isBlackKey)).toHaveLength(36);
    expect(KEYBOARD_PITCHES.filter((p) => !isBlackKey(p))).toHaveLength(52);
  });
});
