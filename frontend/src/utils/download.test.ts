import { downloadBlob, REVOKE_DELAY_MS } from './download.ts';

describe('downloadBlob', () => {
  const createObjectURL = vi.fn(() => 'blob:test');
  const revokeObjectURL = vi.fn();
  let clicked: HTMLAnchorElement[];

  beforeEach(() => {
    vi.useFakeTimers();
    createObjectURL.mockClear();
    revokeObjectURL.mockClear();
    Object.defineProperty(URL, 'createObjectURL', { value: createObjectURL, configurable: true });
    Object.defineProperty(URL, 'revokeObjectURL', { value: revokeObjectURL, configurable: true });
    clicked = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clicked.push(this);
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('clicks a temporary link to the blob and removes it', () => {
    const blob = new Blob(['MThd'], { type: 'audio/midi' });

    downloadBlob(blob, 'arrangement.mid');

    expect(createObjectURL).toHaveBeenCalledWith(blob);
    expect(clicked).toHaveLength(1);
    expect(clicked[0].getAttribute('href')).toBe('blob:test');
    expect(clicked[0].download).toBe('arrangement.mid');
    expect(document.body.querySelector('a')).toBeNull();
  });

  it('revokes the object URL after a delay', () => {
    downloadBlob(new Blob(['MThd']), 'arrangement.mid');

    vi.advanceTimersByTime(REVOKE_DELAY_MS - 1);
    expect(revokeObjectURL).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:test');
  });
});
