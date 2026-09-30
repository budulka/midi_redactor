import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useRef } from 'react';
import { createFakeWaveformPlayers } from '../audio/testing/FakeWaveformPlayer.ts';
import { createFakeWaveformViews } from '../audio/testing/FakeWaveformView.ts';
import type { CreateWaveformView } from '../audio/waveformView.ts';
import AudioTrackProvider from './AudioTrackProvider.tsx';
import {
  useAudioTrackApi,
  useAudioTrackState,
  useCreateWaveformView,
  type AudioTrackApi,
} from './audioTrackContext.ts';

vi.mock('../audio/waveSurferPlayer.ts', () => ({
  createWaveSurferPlayer: vi.fn(),
  createWaveSurferView: vi.fn(),
}));

const seenApis: AudioTrackApi[] = [];

function Probe() {
  const state = useAudioTrackState();
  const api = useAudioTrackApi();
  const containerRef = useRef<HTMLDivElement>(null);
  seenApis.push(api);
  return (
    <>
      <div ref={containerRef} />
      <button
        type="button"
        onClick={() => {
          if (containerRef.current !== null) {
            api.loadFile(new File(['x'], 'song.mp3', { type: 'audio/mpeg' }), containerRef.current);
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
  const fake = createFakeWaveformPlayers();
  const createPlayer = vi.fn(fake.create);
  const result = render(
    <AudioTrackProvider createPlayer={createPlayer} canPlayType={() => true}>
      <Probe />
    </AudioTrackProvider>,
  );
  const state = () => JSON.parse(screen.getByTestId('state').textContent ?? '{}') as unknown;
  return { ...result, fake, createPlayer, state };
}

describe('AudioTrackProvider', () => {
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;
  let revokeObjectURL: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    seenApis.length = 0;
    revokeObjectURL = vi.fn();
    URL.createObjectURL = vi.fn(() => 'blob:test');
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

  it('re-renders on controller changes and keeps the API stable', () => {
    const { state, fake } = renderProvider();
    fireEvent.click(screen.getByRole('button', { name: 'load' }));
    expect(state()).toMatchObject({ status: 'loading', fileName: 'song.mp3' });

    act(() => fake.players[0]?.emitReady(20));
    expect(state()).toMatchObject({ status: 'ready', duration: 20 });
    expect(seenApis.length).toBeGreaterThan(2);
    expect(new Set(seenApis).size).toBe(1);
  });

  it('releases the track on unmount', () => {
    const { fake, unmount } = renderProvider();
    fireEvent.click(screen.getByRole('button', { name: 'load' }));
    act(() => fake.players[0]?.emitReady(20));
    unmount();
    expect(fake.players[0]?.destroyed).toBe(true);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:test');
  });

  it('throws outside the provider', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    function StateOnly() {
      useAudioTrackState();
      return null;
    }
    function ApiOnly() {
      useAudioTrackApi();
      return null;
    }
    expect(() => render(<StateOnly />)).toThrow(/AudioTrackProvider/);
    expect(() => render(<ApiOnly />)).toThrow(/AudioTrackProvider/);
    vi.mocked(console.error).mockRestore();
  });

  it('provides the waveform view factory', () => {
    const views = createFakeWaveformViews();
    let seen: CreateWaveformView | null = null;
    function FactoryProbe() {
      seen = useCreateWaveformView();
      return null;
    }
    render(
      <AudioTrackProvider
        createPlayer={createFakeWaveformPlayers().create}
        canPlayType={() => true}
        createWaveformView={views.create}
      >
        <FactoryProbe />
      </AudioTrackProvider>,
    );
    expect(seen).toBe(views.create);
  });

  it('throws when the waveform view factory is used outside the provider', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    function FactoryOnly() {
      useCreateWaveformView();
      return null;
    }
    expect(() => render(<FactoryOnly />)).toThrow(/useCreateWaveformView/);
    vi.mocked(console.error).mockRestore();
  });
});
