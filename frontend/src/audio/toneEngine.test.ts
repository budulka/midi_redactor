import { PIANO_SAMPLE_BASE_URL } from './samples.ts';

interface BuffersOptions {
  urls: Record<string, string>;
  baseUrl: string;
  onload: () => void;
  onerror: (error: Error) => void;
}

const tone = vi.hoisted(() => {
  const state = {
    failLoading: false,
    samplers: [] as FakeSampler[],
    buffers: [] as FakeBuffers[],
  };

  class FakeSampler {
    readonly options: Record<string, unknown>;
    readonly triggerAttack = vi.fn();
    readonly triggerRelease = vi.fn();
    readonly releaseAll = vi.fn();
    readonly toDestination = vi.fn(() => this);
    readonly dispose = vi.fn();

    constructor(options: Record<string, unknown>) {
      this.options = options;
      state.samplers.push(this);
    }
  }

  class FakeBuffers {
    readonly options: BuffersOptions;
    readonly dispose = vi.fn();

    constructor(options: BuffersOptions) {
      this.options = options;
      state.buffers.push(this);
      queueMicrotask(() => {
        if (state.failLoading) options.onerror(new Error('404'));
        else options.onload();
      });
    }

    get(name: string) {
      return `buffer:${name}`;
    }
  }

  const context = {
    currentTime: 12.5,
    setInterval: vi.fn(() => 7),
    clearInterval: vi.fn(),
  };

  return {
    state,
    context,
    Sampler: FakeSampler,
    ToneAudioBuffers: FakeBuffers,
    getContext: vi.fn(() => context),
    start: vi.fn(() => Promise.resolve()),
  };
});

vi.mock('tone', () => ({
  Sampler: tone.Sampler,
  ToneAudioBuffers: tone.ToneAudioBuffers,
  getContext: tone.getContext,
  start: tone.start,
}));

const { createToneEngine } = await import('./toneEngine.ts');

describe('createToneEngine', () => {
  beforeEach(() => {
    tone.state.failLoading = false;
    tone.state.samplers.length = 0;
    tone.state.buffers.length = 0;
    vi.clearAllMocks();
  });

  it('starts the context, loads 30 samples and creates two samplers', async () => {
    await createToneEngine();
    expect(tone.start).toHaveBeenCalledTimes(1);
    expect(tone.state.buffers).toHaveLength(1);
    const { urls, baseUrl } = tone.state.buffers[0].options;
    expect(Object.keys(urls)).toHaveLength(30);
    expect(baseUrl).toBe(PIANO_SAMPLE_BASE_URL);
    expect(tone.state.samplers).toHaveLength(2);
    for (const sampler of tone.state.samplers) {
      expect(sampler.options).toMatchObject({ release: 0.2, volume: -6 });
      expect((sampler.options.urls as Record<string, string>)['D#1']).toBe('buffer:D#1');
      expect(sampler.toDestination).toHaveBeenCalledTimes(1);
    }
  });

  it('attacks and releases pitches by name on the sampler of the channel', async () => {
    const engine = await createToneEngine();
    const [playback, live] = tone.state.samplers;

    engine.attack('playback', 61, 127, 1.5);
    expect(playback.triggerAttack).toHaveBeenCalledWith('C#4', 1.5, 1);
    engine.attack('live', 60, 96, 2);
    expect(live.triggerAttack).toHaveBeenCalledWith('C4', 2, 96 / 127);

    engine.release('live', 60, 2);
    expect(live.triggerRelease).toHaveBeenCalledWith('C4', 2);
    expect(playback.triggerRelease).not.toHaveBeenCalled();
    engine.releaseAll('playback', 3);
    expect(playback.releaseAll).toHaveBeenCalledWith(3);
    expect(live.releaseAll).not.toHaveBeenCalled();
  });

  it('reads the context clock, runs the ticker and resumes the context', async () => {
    const engine = await createToneEngine();
    expect(engine.now()).toBe(12.5);

    const callback = vi.fn();
    const stopTicker = engine.startTicker(callback, 0.025);
    expect(tone.context.setInterval).toHaveBeenCalledWith(callback, 0.025);
    stopTicker();
    expect(tone.context.clearInterval).toHaveBeenCalledWith(7);

    await engine.resume();
    expect(tone.start).toHaveBeenCalledTimes(2);
  });

  it('rejects when the samples cannot be loaded', async () => {
    tone.state.failLoading = true;
    await expect(createToneEngine()).rejects.toThrow('Could not load piano samples');
    expect(tone.state.samplers).toHaveLength(0);
  });

  it('disposes both samplers and the buffers', async () => {
    const engine = await createToneEngine();
    engine.dispose();
    for (const sampler of tone.state.samplers) expect(sampler.dispose).toHaveBeenCalledTimes(1);
    expect(tone.state.buffers[0].dispose).toHaveBeenCalledTimes(1);
  });
});
