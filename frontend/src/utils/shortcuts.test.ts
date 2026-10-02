import {
  SHORTCUT_HINTS,
  globalShortcutFor,
  isActivationTarget,
  isTextEntryTarget,
  type KeyLike,
} from './shortcuts.ts';

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

function element(html: string): Element {
  const container = document.createElement('div');
  container.innerHTML = html;
  document.body.append(container);
  const first = container.firstElementChild;
  if (first === null) throw new Error('no element');
  return first;
}

const ctrlZ = key({ key: 'z', code: 'KeyZ', ctrlKey: true });
const space = key({ key: ' ', code: 'Space' });
const ctrlS = key({ key: 's', code: 'KeyS', ctrlKey: true });

describe('globalShortcutFor', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('matches undo and redo by code', () => {
    const body = document.body;
    expect(globalShortcutFor(ctrlZ, body)).toBe('undo');
    expect(globalShortcutFor(key({ key: 'z', code: 'KeyZ', metaKey: true }), body)).toBe('undo');
    expect(globalShortcutFor(key({ key: 'я', code: 'KeyZ', ctrlKey: true }), body)).toBe('undo');
    expect(
      globalShortcutFor(key({ key: 'Z', code: 'KeyZ', ctrlKey: true, shiftKey: true }), body),
    ).toBe('redo');
    expect(globalShortcutFor(key({ key: 'y', code: 'KeyY', ctrlKey: true }), body)).toBe('redo');
    expect(
      globalShortcutFor(key({ key: 'z', code: 'KeyZ', ctrlKey: true, altKey: true }), body),
    ).toBeNull();
    expect(globalShortcutFor(key({ key: 'z', code: 'KeyZ' }), body)).toBeNull();
  });

  it('leaves undo to text fields', () => {
    expect(globalShortcutFor(ctrlZ, element('<input type="text">'))).toBeNull();
    expect(globalShortcutFor(ctrlZ, element('<input type="number">'))).toBeNull();
    expect(globalShortcutFor(ctrlZ, element('<textarea></textarea>'))).toBeNull();
    const span = element('<div contenteditable="true"><span></span></div>').firstElementChild;
    expect(globalShortcutFor(ctrlZ, span)).toBeNull();
    expect(globalShortcutFor(ctrlZ, element('<button>b</button>'))).toBe('undo');
    expect(globalShortcutFor(ctrlZ, element('<select></select>'))).toBe('undo');
    expect(globalShortcutFor(ctrlZ, element('<input type="checkbox">'))).toBe('undo');
  });

  it('matches Space as play/pause except on fields and activatable elements', () => {
    expect(globalShortcutFor(space, document.body)).toBe('playPause');
    expect(globalShortcutFor(space, element('<div role="application" tabindex="0"></div>'))).toBe(
      'playPause',
    );
    expect(globalShortcutFor({ ...space, repeat: true }, document.body)).toBeNull();
    expect(globalShortcutFor({ ...space, ctrlKey: true }, document.body)).toBeNull();
    for (const html of [
      '<button>b</button>',
      '<a href="#">a</a>',
      '<select></select>',
      '<input type="checkbox">',
      '<input type="range">',
      '<input type="number">',
      '<div role="slider"></div>',
    ]) {
      expect(globalShortcutFor(space, element(html))).toBeNull();
    }
  });

  it('matches Ctrl+S as export everywhere', () => {
    expect(globalShortcutFor(ctrlS, document.body)).toBe('export');
    expect(globalShortcutFor(ctrlS, element('<input type="number">'))).toBe('export');
    expect(globalShortcutFor({ ...ctrlS, shiftKey: true }, document.body)).toBeNull();
    expect(globalShortcutFor({ ...ctrlS, altKey: true }, document.body)).toBeNull();
  });

  it('handles missing and plain targets', () => {
    expect(isTextEntryTarget(null)).toBe(false);
    expect(isActivationTarget(document.body)).toBe(false);
  });

  it('has hints for button titles', () => {
    expect(SHORTCUT_HINTS).toEqual({
      undo: 'Ctrl+Z',
      redo: 'Ctrl+Shift+Z',
      export: 'Ctrl+S',
      playPause: 'Space',
    });
  });
});
