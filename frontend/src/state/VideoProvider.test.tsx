import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useRef } from 'react';
import { createFakeMediaPlayers } from '../media/testing/FakeMediaPlayer.ts';
import type { MediaTrackApi } from './useMediaTrackController.ts';
import { useVideoApi, useVideoState } from './videoContext.ts';
import VideoProvider from './VideoProvider.tsx';

vi.mock('../media/htmlVideoPlayer.ts', () => ({ createHtmlVideoPlayer: vi.fn() }));

const seenApis: MediaTrackApi[] = [];

function Probe() {
  const state = useVideoState();
  const api = useVideoApi();
  const containerRef = useRef<HTMLDivElement>(null);
  seenApis.push(api);
  return (
    <>
      <div ref={containerRef} />
      <button
        type="button"
        onClick={() => {
          if (containerRef.current !== null) {
            api.loadFile(new File(['x'], 'clip.mp4', { type: 'video/mp4' }), containerRef.current);
          }
        }}
      >
        load
      </button>
      <pre data-testid="state">{JSON.stringify(state)}</pre>
    </>
  );
}

function renderProvider() {
  const fake = createFakeMediaPlayers();
  const createPlayer = vi.fn(fake.create);
  const result = render(
    <VideoProvider createPlayer={createPlayer} canPlayType={() => true}>
      <Probe />
    </VideoProvider>,
  );
  const state = () => JSON.parse(screen.getByTestId('state').textContent ?? '{}') as unknown;
  return { ...result, fake, createPlayer, state };
}

describe('VideoProvider', () => {
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;
  let revokeObjectURL: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    seenApis.length = 0;
    revokeObjectURL = vi.fn();
    URL.createObjectURL = vi.fn(() => 'blob:video');
    URL.revokeObjectURL = revokeObjectURL;
  });

  afterEach(() => {
    cleanup();
    URL.createObjectURL = originalCreate;
    URL.revokeObjectURL = originalRevoke;
  });

  it('starts empty without creating a player', () => {
    const { state, createPlayer } = renderProvider();
    expect(state()).toMatchObject({ status: 'empty' });
    expect(createPlayer).not.toHaveBeenCalled();
  });

  it('loads a video and keeps the API stable', () => {
    const { state, fake } = renderProvider();
    fireEvent.click(screen.getByRole('button', { name: 'load' }));
    expect(state()).toMatchObject({ status: 'loading', fileName: 'clip.mp4' });

    act(() => fake.players[0]?.emitReady(20));
    expect(state()).toMatchObject({ status: 'ready', duration: 20 });
    expect(seenApis.length).toBeGreaterThan(2);
    expect(new Set(seenApis).size).toBe(1);
  });

  it('releases the video on unmount', () => {
    const { fake, unmount } = renderProvider();
    fireEvent.click(screen.getByRole('button', { name: 'load' }));
    act(() => fake.players[0]?.emitReady(20));
    unmount();
    expect(fake.players[0]?.destroyed).toBe(true);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:video');
  });

  it('throws outside the provider', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    function StateOnly() {
      useVideoState();
      return null;
    }
    function ApiOnly() {
      useVideoApi();
      return null;
    }
    expect(() => render(<StateOnly />)).toThrow(/useVideoState/);
    expect(() => render(<ApiOnly />)).toThrow(/useVideoApi/);
    vi.mocked(console.error).mockRestore();
  });
});
