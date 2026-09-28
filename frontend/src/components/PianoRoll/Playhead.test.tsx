import { act, fireEvent, screen } from '@testing-library/react';
import { useRef, type RefObject } from 'react';
import { FakePianoEngine } from '../../audio/testing/FakePianoEngine.ts';
import type { EditorState } from '../../state/editorState.ts';
import { stubAnimationFrames } from '../testing/animationFrames.ts';
import TransportControls from '../TransportControls.tsx';
import Playhead from './Playhead.tsx';
import { renderWithProviders } from './testUtils.tsx';

let scroller: HTMLDivElement;

function Harness() {
  const ref = useRef<HTMLDivElement | null>(scroller);
  return (
    <>
      <TransportControls />
      <Playhead scrollRef={ref as RefObject<HTMLDivElement | null>} />
    </>
  );
}

const playhead = () => screen.getByTestId('playhead');

function renderPlayhead(engine: FakePianoEngine, editor?: Partial<EditorState>) {
  return renderWithProviders(<Harness />, [], editor, [], { engine });
}

async function play() {
  fireEvent.click(screen.getByRole('button', { name: 'Play' }));
  await screen.findByRole('button', { name: 'Pause' });
}

describe('Playhead', () => {
  let frames: ReturnType<typeof stubAnimationFrames>;
  let engine: FakePianoEngine;

  beforeEach(() => {
    frames = stubAnimationFrames();
    engine = new FakePianoEngine();
    scroller = document.createElement('div');
    Object.defineProperty(scroller, 'clientWidth', { configurable: true, value: 672 });
    let scrollLeft = 0;
    Object.defineProperty(scroller, 'scrollLeft', {
      configurable: true,
      get: () => scrollLeft,
      set: (value: number) => {
        scrollLeft = value;
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('starts at 0', () => {
    renderPlayhead(engine);
    expect(playhead()).toHaveStyle({ transform: 'translateX(0px)' });
    expect(playhead()).toHaveAttribute('aria-hidden', 'true');
  });

  it('moves in animation frames while playing', async () => {
    renderPlayhead(engine);
    await play();
    engine.time = 1.05;
    act(() => frames.flushFrame());
    expect(playhead()).toHaveStyle({ transform: 'translateX(100px)' });
    engine.time = 2.05;
    act(() => frames.flushFrame());
    expect(playhead()).toHaveStyle({ transform: 'translateX(200px)' });
  });

  it('scrolls the view to follow the playhead', async () => {
    renderPlayhead(engine);
    await play();
    engine.time = 5.95;
    act(() => frames.flushFrame());
    expect(playhead()).toHaveStyle({ transform: 'translateX(590px)' });
    expect(scroller.scrollLeft).toBe(566);
  });

  it('does not scroll when following is off', async () => {
    renderPlayhead(engine, { followPlayhead: false });
    await play();
    engine.time = 5.95;
    act(() => frames.flushFrame());
    expect(playhead()).toHaveStyle({ transform: 'translateX(590px)' });
    expect(scroller.scrollLeft).toBe(0);
  });

  it('stops at the pause position', async () => {
    renderPlayhead(engine);
    await play();
    engine.time = 1.05;
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    expect(frames.cancelAnimationFrame).toHaveBeenCalled();
    expect(playhead()).toHaveStyle({ transform: 'translateX(100px)' });
  });

  it('uses the zoom level', async () => {
    renderPlayhead(engine, { pixelsPerSecond: 200 });
    await play();
    engine.time = 1.05;
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    expect(playhead()).toHaveStyle({ transform: 'translateX(200px)' });
  });

  it('cancels the animation frame on unmount', async () => {
    const view = renderPlayhead(engine);
    await play();
    frames.cancelAnimationFrame.mockClear();
    view.unmount();
    expect(frames.cancelAnimationFrame).toHaveBeenCalled();
  });
});
