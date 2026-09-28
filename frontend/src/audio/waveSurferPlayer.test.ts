import WaveSurfer from 'wavesurfer.js';
import type { WaveformPlayerEvents } from './waveformPlayer.ts';
import { createWaveSurferPlayer } from './waveSurferPlayer.ts';

type Handler = (...args: unknown[]) => void;

interface FakeWaveSurfer {
  handlers: Map<string, Handler>;
  on: ReturnType<typeof vi.fn>;
  load: ReturnType<typeof vi.fn>;
  play: ReturnType<typeof vi.fn>;
  pause: ReturnType<typeof vi.fn>;
  setTime: ReturnType<typeof vi.fn>;
  getCurrentTime: ReturnType<typeof vi.fn>;
  setPlaybackRate: ReturnType<typeof vi.fn>;
  setMuted: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
  emit(event: string, ...args: unknown[]): void;
}

const mocks = vi.hoisted(() => ({
  instances: [] as FakeWaveSurfer[],
  loadResult: null as unknown,
}));

vi.mock('wavesurfer.js', () => {
  const create = vi.fn(() => {
    const handlers = new Map<string, Handler>();
    const instance: FakeWaveSurfer = {
      handlers,
      on: vi.fn((event: string, handler: Handler) => {
        handlers.set(event, handler);
        return () => undefined;
      }),
      load: vi.fn(() =>
        mocks.loadResult === null ? Promise.resolve() : Promise.reject(mocks.loadResult),
      ),
      play: vi.fn(() => Promise.resolve()),
      pause: vi.fn(),
      setTime: vi.fn(),
      getCurrentTime: vi.fn(() => 4.25),
      setPlaybackRate: vi.fn(),
      setMuted: vi.fn(),
      destroy: vi.fn(),
      emit(event, ...args) {
        handlers.get(event)?.(...args);
      },
    };
    mocks.instances.push(instance);
    return instance;
  });
  return { default: { create } };
});

function events(): { [K in keyof WaveformPlayerEvents]: ReturnType<typeof vi.fn> } {
  return {
    onReady: vi.fn(),
    onPlay: vi.fn(),
    onPause: vi.fn(),
    onFinish: vi.fn(),
    onSeek: vi.fn(),
    onError: vi.fn(),
  };
}

const flushMicrotasks = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function setup() {
  const container = document.createElement('div');
  const callbacks = events();
  const player = createWaveSurferPlayer({ container, url: 'blob:x', events: callbacks });
  const ws = mocks.instances[mocks.instances.length - 1];
  if (ws === undefined) throw new Error('WaveSurfer was not created');
  return { container, callbacks, player, ws };
}

describe('createWaveSurferPlayer', () => {
  beforeEach(() => {
    mocks.instances.length = 0;
    mocks.loadResult = null;
    vi.mocked(WaveSurfer.create).mockClear();
  });

  it('creates WaveSurfer on a media element and loads the URL', () => {
    const { container, ws } = setup();
    expect(WaveSurfer.create).toHaveBeenCalledTimes(1);
    const options = vi.mocked(WaveSurfer.create).mock.calls[0]?.[0];
    expect(options).toMatchObject({
      container,
      backend: 'MediaElement',
      interact: true,
      dragToSeek: false,
      normalize: true,
      height: 96,
    });
    expect(options).not.toHaveProperty('url');
    expect(ws.load).toHaveBeenCalledWith('blob:x');
  });

  it('forwards WaveSurfer events', () => {
    const { callbacks, ws } = setup();
    ws.emit('ready', 12);
    expect(callbacks.onReady).toHaveBeenCalledWith(12);
    ws.emit('play');
    expect(callbacks.onPlay).toHaveBeenCalled();
    ws.emit('pause');
    expect(callbacks.onPause).toHaveBeenCalled();
    ws.emit('finish');
    expect(callbacks.onFinish).toHaveBeenCalled();
    ws.emit('interaction', 3.5);
    expect(callbacks.onSeek).toHaveBeenCalledWith(3.5);
    const error = new Error('media');
    ws.emit('error', error);
    expect(callbacks.onError).toHaveBeenCalledWith(error);
  });

  it('reports a failed load', async () => {
    const error = new Error('decode');
    mocks.loadResult = error;
    const { callbacks } = setup();
    await flushMicrotasks();
    expect(callbacks.onError).toHaveBeenCalledWith(error);
  });

  it('ignores a superseded load', async () => {
    mocks.loadResult = new DOMException('aborted', 'AbortError');
    const { callbacks } = setup();
    await flushMicrotasks();
    expect(callbacks.onError).not.toHaveBeenCalled();
  });

  it('delegates the player methods and preserves pitch', async () => {
    const { player, ws } = setup();
    player.setPlaybackRate(0.5);
    expect(ws.setPlaybackRate).toHaveBeenCalledWith(0.5, true);
    player.setTime(4);
    expect(ws.setTime).toHaveBeenCalledWith(4);
    expect(player.getCurrentTime()).toBe(4.25);
    await expect(player.play()).resolves.toBeUndefined();
    expect(ws.play).toHaveBeenCalled();
    player.pause();
    expect(ws.pause).toHaveBeenCalled();
    player.destroy();
    expect(ws.destroy).toHaveBeenCalled();
  });

  it('mutes the media element', () => {
    const { player, ws } = setup();
    player.setMuted(true);
    expect(ws.setMuted).toHaveBeenCalledWith(true);
  });
});
