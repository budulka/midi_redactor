import {
  browserStorage,
  clampMediaPanelWidth,
  dragMediaPanelWidth,
  loadMediaPanelWidth,
  maxMediaPanelWidth,
  parseStoredMediaPanelWidth,
  saveMediaPanelWidth,
  splitterWidthForAction,
  type WidthStorage,
} from './mediaPanelWidth.ts';

function fakeStorage(getItem: () => string | null): WidthStorage & {
  getItem: ReturnType<typeof vi.fn>;
  setItem: ReturnType<typeof vi.fn>;
} {
  return { getItem: vi.fn(getItem), setItem: vi.fn() };
}

describe('maxMediaPanelWidth', () => {
  it.each([
    [1440, 960],
    [1920, 960],
    [1024, 544],
    [600, 240],
  ])('for a %i px window is %i px', (viewport, expected) => {
    expect(maxMediaPanelWidth(viewport)).toBe(expected);
  });
});

describe('clampMediaPanelWidth', () => {
  it.each([
    [500, 1440, 500],
    [100, 1440, 240],
    [2000, 1440, 960],
    [800, 1024, 544],
    [300, 600, 240],
    [360.6, 1440, 361],
    [Number.NaN, 1440, 360],
  ])('clamps %f in a %i px window to %i', (width, viewport, expected) => {
    expect(clampMediaPanelWidth(width, viewport)).toBe(expected);
  });
});

describe('dragMediaPanelWidth', () => {
  it.each([
    [900, 460],
    [1100, 260],
    [1200, 240],
    [0, 960],
    [1000, 360],
  ])('moving the splitter from 1000 to %i gives %i', (x, expected) => {
    expect(dragMediaPanelWidth(360, 1000, x, 1440)).toBe(expected);
  });
});

describe('splitterWidthForAction', () => {
  it.each([
    ['widen', 376],
    ['narrow', 344],
    ['widenMore', 424],
    ['narrowMore', 296],
    ['narrowest', 240],
    ['widest', 960],
  ] as const)('maps %s to %i', (action, expected) => {
    expect(splitterWidthForAction(action, 360, 1440)).toBe(expected);
  });

  it('limits widest by the window width', () => {
    expect(splitterWidthForAction('widest', 360, 1024)).toBe(544);
  });

  it('stops at the limits', () => {
    expect(splitterWidthForAction('widen', 960, 1440)).toBe(960);
    expect(splitterWidthForAction('narrow', 240, 1440)).toBe(240);
  });
});

describe('parseStoredMediaPanelWidth', () => {
  it('reads whole and fractional numbers', () => {
    expect(parseStoredMediaPanelWidth('480')).toBe(480);
    expect(parseStoredMediaPanelWidth('480.4')).toBe(480);
  });

  it.each([null, '', 'abc', '0', '-5', 'Infinity', 'NaN'])('rejects %s', (raw) => {
    expect(parseStoredMediaPanelWidth(raw)).toBeNull();
  });
});

describe('loadMediaPanelWidth', () => {
  it('reads the stored width', () => {
    const storage = fakeStorage(() => '500');
    expect(loadMediaPanelWidth(storage)).toBe(500);
    expect(storage.getItem).toHaveBeenCalledWith('midiRedactor.mediaPanelWidth');
  });

  it('returns null for a bad value, a failing storage or no storage', () => {
    expect(loadMediaPanelWidth(fakeStorage(() => 'abc'))).toBeNull();
    expect(
      loadMediaPanelWidth(
        fakeStorage(() => {
          throw new DOMException('denied', 'SecurityError');
        }),
      ),
    ).toBeNull();
    expect(loadMediaPanelWidth(null)).toBeNull();
  });
});

describe('saveMediaPanelWidth', () => {
  it('stores the width as a string', () => {
    const storage = fakeStorage(() => null);
    saveMediaPanelWidth(storage, 480);
    expect(storage.setItem).toHaveBeenCalledWith('midiRedactor.mediaPanelWidth', '480');
  });

  it('ignores storage errors and a missing storage', () => {
    const storage = fakeStorage(() => null);
    storage.setItem.mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    expect(() => saveMediaPanelWidth(storage, 480)).not.toThrow();
    expect(() => saveMediaPanelWidth(null, 480)).not.toThrow();
  });
});

describe('browserStorage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns localStorage', () => {
    const storage = browserStorage();
    expect(storage).toBeInstanceOf(Storage);
    expect(storage).toBe(window.localStorage);
  });

  it('returns null when the browser refuses access', () => {
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });
    expect(browserStorage()).toBeNull();
  });
});
