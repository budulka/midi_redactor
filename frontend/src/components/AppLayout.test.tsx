import { act, fireEvent, render, screen } from '@testing-library/react';
import AppLayout from './AppLayout.tsx';

const editorRenders = vi.fn();

function Probe() {
  editorRenders();
  return null;
}

function makeStorage(stored: string | null) {
  return { getItem: vi.fn(() => stored), setItem: vi.fn() };
}

type FakeStorage = ReturnType<typeof makeStorage>;

function setInnerWidth(value: number) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value });
}

function renderLayout(storage: FakeStorage | null = makeStorage(null)) {
  const result = render(
    <AppLayout
      header={<span>H</span>}
      editor={<Probe />}
      media={<section aria-label="Video" />}
      storage={storage}
    />,
  );
  const app = result.container.querySelector<HTMLElement>('.app');
  if (app === null) throw new Error('.app is missing');
  const separator = screen.getByRole('separator', { name: 'Resize media panel' });
  return { ...result, app, separator };
}

function cssWidth(app: HTMLElement): string {
  return app.style.getPropertyValue('--media-panel-width');
}

describe('AppLayout', () => {
  beforeEach(() => {
    editorRenders.mockClear();
  });

  afterEach(() => {
    setInnerWidth(1024);
  });

  it('renders the areas and an accessible splitter', () => {
    const { app, separator } = renderLayout();

    const main = screen.getByRole('main', { name: 'MIDI editor' });
    const aside = screen.getByRole('complementary', { name: 'Media' });
    expect(screen.getByRole('banner', { name: 'Transport' })).toHaveTextContent('H');
    expect(aside).toHaveAttribute('id', 'media-panel');
    expect(separator).toHaveAttribute('aria-orientation', 'vertical');
    expect(separator).toHaveAttribute('aria-controls', 'media-panel');
    expect(separator).toHaveAttribute('aria-valuenow', '360');
    expect(separator).toHaveAttribute('aria-valuemin', '240');
    expect(separator).toHaveAttribute('aria-valuemax', '544');
    expect(separator).toHaveAttribute('aria-valuetext', '360 pixels');
    expect(separator.tabIndex).toBe(0);
    expect(main.nextElementSibling).toBe(separator);
    expect(separator.nextElementSibling).toBe(aside);
    expect(cssWidth(app)).toBe('360px');
  });

  it('starts from the stored width', () => {
    const { app, separator } = renderLayout(makeStorage('480'));
    expect(separator).toHaveAttribute('aria-valuenow', '480');
    expect(cssWidth(app)).toBe('480px');
  });

  it('ignores a bad stored value', () => {
    const { separator } = renderLayout(makeStorage('abc'));
    expect(separator).toHaveAttribute('aria-valuenow', '360');
  });

  it('limits a too large stored value without overwriting it', () => {
    const storage = makeStorage('2000');
    const { separator } = renderLayout(storage);
    expect(separator).toHaveAttribute('aria-valuenow', '544');
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it('works without a storage', () => {
    const { separator } = renderLayout(null);
    expect(separator).toHaveAttribute('aria-valuenow', '360');
    expect(() => fireEvent.keyDown(separator, { key: 'ArrowLeft' })).not.toThrow();
    expect(separator).toHaveAttribute('aria-valuenow', '376');
  });

  it('resizes the panel by dragging the splitter', () => {
    const storage = makeStorage(null);
    const { app, separator } = renderLayout(storage);

    fireEvent.mouseDown(separator, { button: 0, clientX: 700, clientY: 300 });
    fireEvent.mouseMove(window, { clientX: 600, clientY: 300 });
    expect(separator).toHaveAttribute('aria-valuenow', '460');
    expect(cssWidth(app)).toBe('460px');
    expect(app).toHaveClass('app--resizing');
    expect(storage.setItem).not.toHaveBeenCalled();

    fireEvent.mouseUp(window, { clientX: 600, clientY: 300 });
    expect(separator).toHaveAttribute('aria-valuenow', '460');
    expect(app).not.toHaveClass('app--resizing');
    expect(storage.setItem).toHaveBeenCalledTimes(1);
    expect(storage.setItem).toHaveBeenCalledWith('midiRedactor.mediaPanelWidth', '460');
    expect(document.activeElement).toBe(separator);
    expect(separator).toHaveAttribute('data-pointer-focus', 'true');
  });

  it('keeps the width within the limits while dragging', () => {
    const { separator } = renderLayout();
    fireEvent.mouseDown(separator, { button: 0, clientX: 700, clientY: 300 });
    fireEvent.mouseMove(window, { clientX: -1000, clientY: 300 });
    expect(separator).toHaveAttribute('aria-valuenow', '544');
    fireEvent.mouseMove(window, { clientX: 5000, clientY: 300 });
    expect(separator).toHaveAttribute('aria-valuenow', '240');
    fireEvent.mouseUp(window, { clientX: 5000, clientY: 300 });
  });

  it('ignores a move below the drag threshold', () => {
    const storage = makeStorage(null);
    const { app, separator } = renderLayout(storage);
    fireEvent.mouseDown(separator, { button: 0, clientX: 700, clientY: 300 });
    fireEvent.mouseMove(window, { clientX: 702, clientY: 300 });
    expect(app).not.toHaveClass('app--resizing');
    fireEvent.mouseUp(window, { clientX: 702, clientY: 300 });
    expect(separator).toHaveAttribute('aria-valuenow', '360');
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it('cancels the drag with Escape', () => {
    const storage = makeStorage(null);
    const { app, separator } = renderLayout(storage);
    fireEvent.mouseDown(separator, { button: 0, clientX: 700, clientY: 300 });
    fireEvent.mouseMove(window, { clientX: 600, clientY: 300 });
    expect(separator).toHaveAttribute('aria-valuenow', '460');

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(separator).toHaveAttribute('aria-valuenow', '360');
    expect(app).not.toHaveClass('app--resizing');

    fireEvent.mouseMove(window, { clientX: 500, clientY: 300 });
    fireEvent.mouseUp(window, { clientX: 500, clientY: 300 });
    expect(separator).toHaveAttribute('aria-valuenow', '360');
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it('ignores other mouse buttons', () => {
    const { separator } = renderLayout();
    fireEvent.mouseDown(separator, { button: 2, clientX: 700, clientY: 300 });
    fireEvent.mouseMove(window, { clientX: 600, clientY: 300 });
    expect(separator).toHaveAttribute('aria-valuenow', '360');
  });

  it('resizes the panel with the keyboard', () => {
    const storage = makeStorage(null);
    const { separator } = renderLayout(storage);

    expect(fireEvent.keyDown(separator, { key: 'ArrowLeft' })).toBe(false);
    expect(separator).toHaveAttribute('aria-valuenow', '376');
    expect(storage.setItem).toHaveBeenLastCalledWith('midiRedactor.mediaPanelWidth', '376');

    fireEvent.keyDown(separator, { key: 'ArrowRight' });
    fireEvent.keyDown(separator, { key: 'ArrowRight' });
    expect(separator).toHaveAttribute('aria-valuenow', '344');

    fireEvent.keyDown(separator, { key: 'ArrowLeft', shiftKey: true });
    expect(separator).toHaveAttribute('aria-valuenow', '408');

    fireEvent.keyDown(separator, { key: 'Home' });
    expect(separator).toHaveAttribute('aria-valuenow', '240');

    fireEvent.keyDown(separator, { key: 'End' });
    expect(separator).toHaveAttribute('aria-valuenow', '544');

    const calls = storage.setItem.mock.calls.length;
    expect(fireEvent.keyDown(separator, { key: 'a' })).toBe(true);
    expect(separator).toHaveAttribute('aria-valuenow', '544');
    expect(storage.setItem).toHaveBeenCalledTimes(calls);
  });

  it('resets the width on double-click', () => {
    const storage = makeStorage('500');
    const { separator } = renderLayout(storage);
    fireEvent.doubleClick(separator);
    expect(separator).toHaveAttribute('aria-valuenow', '360');
    expect(storage.setItem).toHaveBeenCalledWith('midiRedactor.mediaPanelWidth', '360');
  });

  it('follows the window width without changing the stored width', () => {
    setInnerWidth(1440);
    const storage = makeStorage('900');
    const { separator } = renderLayout(storage);
    expect(separator).toHaveAttribute('aria-valuenow', '900');
    expect(separator).toHaveAttribute('aria-valuemax', '960');

    setInnerWidth(1024);
    act(() => {
      window.dispatchEvent(new Event('resize'));
    });
    expect(separator).toHaveAttribute('aria-valuenow', '544');
    expect(separator).toHaveAttribute('aria-valuemax', '544');

    setInnerWidth(1440);
    act(() => {
      window.dispatchEvent(new Event('resize'));
    });
    expect(separator).toHaveAttribute('aria-valuenow', '900');
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it('does not re-render the areas while dragging', () => {
    const { separator } = renderLayout();
    expect(editorRenders).toHaveBeenCalledTimes(1);

    fireEvent.mouseDown(separator, { button: 0, clientX: 700, clientY: 300 });
    fireEvent.mouseMove(window, { clientX: 650, clientY: 300 });
    fireEvent.mouseMove(window, { clientX: 600, clientY: 300 });
    fireEvent.mouseMove(window, { clientX: 550, clientY: 300 });
    fireEvent.mouseUp(window, { clientX: 550, clientY: 300 });

    expect(separator).toHaveAttribute('aria-valuenow', '510');
    expect(editorRenders).toHaveBeenCalledTimes(1);
  });

  it('stops the drag on unmount', () => {
    const storage = makeStorage(null);
    const { separator, unmount } = renderLayout(storage);
    fireEvent.mouseDown(separator, { button: 0, clientX: 700, clientY: 300 });
    unmount();
    expect(() => {
      fireEvent.mouseMove(window, { clientX: 600, clientY: 300 });
      fireEvent.mouseUp(window, { clientX: 600, clientY: 300 });
    }).not.toThrow();
    expect(storage.setItem).not.toHaveBeenCalled();
  });
});
