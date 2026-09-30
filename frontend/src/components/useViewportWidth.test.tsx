import { act, render, screen } from '@testing-library/react';
import { useViewportWidth } from './useViewportWidth.ts';

function Probe() {
  return <output>{useViewportWidth()}</output>;
}

function setInnerWidth(value: number) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value });
}

describe('useViewportWidth', () => {
  afterEach(() => {
    setInnerWidth(1024);
    vi.restoreAllMocks();
  });

  it('shows the window width', () => {
    render(<Probe />);
    expect(screen.getByRole('status')).toHaveTextContent('1024');
  });

  it('follows window resizes', () => {
    render(<Probe />);
    setInnerWidth(1440);
    act(() => {
      window.dispatchEvent(new Event('resize'));
    });
    expect(screen.getByRole('status')).toHaveTextContent('1440');
  });

  it('removes its listener on unmount', () => {
    const add = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');
    const { unmount } = render(<Probe />);
    const added = add.mock.calls.find(([type]) => type === 'resize');
    expect(added).toBeDefined();
    unmount();
    expect(remove).toHaveBeenCalledWith('resize', added?.[1]);
  });
});
