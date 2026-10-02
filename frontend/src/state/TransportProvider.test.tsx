import { act, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { PianoEngine } from '../audio/engine.ts';
import { FakePianoEngine } from '../audio/testing/FakePianoEngine.ts';
import { addNotes, setBpm, setMediaOffset } from './actions.ts';
import { createEmptyProject } from './constants.ts';
import EditorProvider from './EditorProvider.tsx';
import ProjectProvider from './ProjectProvider.tsx';
import { useProjectDispatch } from './projectContext.ts';
import TransportProvider from './TransportProvider.tsx';
import { useTransportApi, useTransportState, type TransportState } from './transportContext.ts';
import type { Note, Project } from './types.ts';
import { AudioTrackController } from '../audio/AudioTrackController.ts';
import { createFakeMediaPlayers, type FakeMediaPlayer } from '../media/testing/FakeMediaPlayer.ts';
import { useMediaDuration } from './timelineContext.ts';

interface Deferred {
  promise: Promise<PianoEngine>;
  resolve: (engine: PianoEngine) => void;
  reject: (error: Error) => void;
}

function deferred(): Deferred {
  let resolve!: (engine: PianoEngine) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<PianoEngine>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const a: Note = { id: 'a', pitch: 60, start: 0, duration: 0.5, velocity: 100 };

function Probe() {
  const state = useTransportState();
  const api = useTransportApi();
  const dispatch = useProjectDispatch();
  return (
    <>
      <pre data-testid="transport">{JSON.stringify(state)}</pre>
      <button type="button" onClick={api.togglePlay}>
        toggle
      </button>
      <button type="button" onClick={api.retry}>
        retry
      </button>
      <button type="button" onClick={() => api.noteOn(60)}>
        on60
      </button>
      <button type="button" onClick={() => api.noteOff(60)}>
        off60
      </button>
      <button type="button" onClick={() => api.noteOn(62)}>
        on62
      </button>
      <button type="button" onClick={() => api.noteOff(62)}>
        off62
      </button>
      <button
        type="button"
        onClick={() =>
          dispatch(addNotes([{ id: 'b', pitch: 64, start: 0.5, duration: 0.5, velocity: 80 }]))
        }
      >
        add
      </button>
      <button type="button" onClick={() => dispatch(setBpm(60))}>
        tempo60
      </button>
    </>
  );
}

function setup(notes: readonly Note[] = [a]) {
  const loads: Deferred[] = [];
  const loadEngine = vi.fn(() => {
    const load = deferred();
    loads.push(load);
    return load.promise;
  });
  const project: Project = {
    bpm: 120,
    timeSignature: { numerator: 4, denominator: 4 },
    mediaOffset: 0,
    notes,
    pedals: [],
  };
  const wrap = (children: ReactNode) => (
    <ProjectProvider initialProject={project}>
      <EditorProvider>
        <TransportProvider loadEngine={loadEngine}>{children}</TransportProvider>
      </EditorProvider>
    </ProjectProvider>
  );
  const view = render(wrap(<Probe />));
  return { view, loadEngine, loads };
}

function readState(): TransportState {
  return JSON.parse(screen.getByTestId('transport').textContent ?? '{}') as TransportState;
}

function click(name: string) {
  act(() => {
    screen.getByRole('button', { name }).click();
  });
}

async function resolveWith(load: Deferred, engine: PianoEngine) {
  await act(async () => {
    load.resolve(engine);
    await load.promise;
  });
}

describe('TransportProvider', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not load the engine before a gesture', () => {
    const { loadEngine } = setup();
    expect(readState()).toEqual({
      status: 'stopped',
      position: 0,
      rate: 1,
      engineStatus: 'idle',
      engineError: null,
    });
    expect(loadEngine).not.toHaveBeenCalled();
  });

  it('loads the engine once on play and starts playback when it is ready', async () => {
    const { loadEngine, loads } = setup();
    click('toggle');
    expect(readState().engineStatus).toBe('loading');
    click('toggle');
    expect(loadEngine).toHaveBeenCalledTimes(1);

    const engine = new FakePianoEngine();
    await resolveWith(loads[0], engine);
    expect(readState()).toMatchObject({ engineStatus: 'ready', status: 'playing' });
    expect(engine.calls).toContainEqual({
      op: 'attack',
      channel: 'playback',
      pitch: 60,
      velocity: 100,
      time: 0.05,
    });

    click('toggle');
    expect(readState().status).toBe('paused');
    click('toggle');
    expect(readState().status).toBe('playing');
    expect(loadEngine).toHaveBeenCalledTimes(1);
    expect(engine.resumeCount).toBeGreaterThan(0);
  });

  it('reports a loading error and retries', async () => {
    const { loadEngine, loads } = setup();
    click('toggle');
    await act(async () => {
      loads[0].reject(new Error('Could not load piano samples'));
      await loads[0].promise.catch(() => undefined);
    });
    expect(readState()).toMatchObject({
      engineStatus: 'error',
      engineError: 'Could not load piano samples',
      status: 'stopped',
    });

    click('retry');
    expect(loadEngine).toHaveBeenCalledTimes(2);
    expect(readState()).toMatchObject({ engineStatus: 'loading', engineError: null });
    await resolveWith(loads[1], new FakePianoEngine());
    expect(readState()).toMatchObject({ engineStatus: 'ready', status: 'stopped' });
  });

  it('plays keyboard notes on the live channel', async () => {
    const { loads } = setup();
    click('toggle');
    const engine = new FakePianoEngine();
    await resolveWith(loads[0], engine);
    engine.time = 3;

    click('on60');
    expect(engine.calls).toContainEqual({
      op: 'attack',
      channel: 'live',
      pitch: 60,
      velocity: 96,
      time: 3,
    });
    click('off60');
    expect(engine.calls).toContainEqual({ op: 'release', channel: 'live', pitch: 60, time: 3 });
  });

  it('plays a held key once the engine has loaded, but not a released one', async () => {
    const { loadEngine, loads } = setup();
    click('on60');
    click('on62');
    click('off62');
    expect(loadEngine).toHaveBeenCalledTimes(1);
    const engine = new FakePianoEngine();
    await resolveWith(loads[0], engine);

    const liveAttacks = engine.calls.filter((call) => call.op === 'attack');
    expect(liveAttacks).toEqual([
      { op: 'attack', channel: 'live', pitch: 60, velocity: 96, time: 0 },
    ]);
  });

  it('passes project changes to the playing transport', async () => {
    const { loads } = setup();
    click('toggle');
    const engine = new FakePianoEngine();
    await resolveWith(loads[0], engine);

    click('add');
    engine.time = 0.4;
    act(() => engine.tick());
    expect(engine.calls).toContainEqual({
      op: 'attack',
      channel: 'playback',
      pitch: 64,
      velocity: 80,
      time: 0.55,
    });
  });

  it('plays notes at the rescaled time after a tempo change', async () => {
    const c: Note = { id: 'c', pitch: 67, start: 1, duration: 0.5, velocity: 70 };
    const { loads } = setup([a, c]);
    click('tempo60');
    click('toggle');
    const engine = new FakePianoEngine();
    await resolveWith(loads[0], engine);
    expect(engine.calls).toContainEqual({
      op: 'attack',
      channel: 'playback',
      pitch: 60,
      velocity: 100,
      time: 0.05,
    });

    engine.time = 1.0;
    act(() => engine.tick());
    expect(engine.calls).not.toContainEqual(expect.objectContaining({ op: 'attack', pitch: 67 }));

    engine.time = 1.9;
    act(() => engine.tick());
    expect(engine.calls).toContainEqual({
      op: 'attack',
      channel: 'playback',
      pitch: 67,
      velocity: 70,
      time: 2.05,
    });
  });

  it('applies a tempo change during playback', async () => {
    const c: Note = { id: 'c', pitch: 67, start: 1, duration: 0.5, velocity: 70 };
    const { loads } = setup([a, c]);
    click('toggle');
    const engine = new FakePianoEngine();
    await resolveWith(loads[0], engine);
    engine.time = 0.3;
    act(() => engine.tick());

    click('tempo60');
    engine.time = 1.9;
    act(() => engine.tick());
    expect(engine.calls).toContainEqual({
      op: 'attack',
      channel: 'playback',
      pitch: 67,
      velocity: 70,
      time: 2.05,
    });
    expect(engine.calls).not.toContainEqual(
      expect.objectContaining({ op: 'attack', pitch: 67, time: 1.05 }),
    );
  });

  it('silences and disposes the engine on unmount', async () => {
    const { view, loads } = setup();
    click('toggle');
    const engine = new FakePianoEngine();
    await resolveWith(loads[0], engine);
    expect(engine.activeTickers).toBe(1);

    view.unmount();
    expect(engine.calls.at(-1)).toMatchObject({ op: 'releaseAll', channel: 'playback' });
    expect(engine.activeTickers).toBe(0);
    expect(engine.disposed).toBe(true);
  });

  it('disposes an engine that finishes loading after unmount', async () => {
    const consoleError = vi.spyOn(console, 'error');
    const { view, loads } = setup();
    click('toggle');
    view.unmount();

    const engine = new FakePianoEngine();
    await act(async () => {
      loads[0].resolve(engine);
      await loads[0].promise;
      await Promise.resolve();
    });
    expect(engine.disposed).toBe(true);
    expect(engine.calls.filter((call) => call.op === 'attack')).toEqual([]);
    expect(engine.activeTickers).toBe(0);
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('throws outside the provider', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    function Orphan() {
      useTransportApi();
      return null;
    }
    expect(() => render(<Orphan />)).toThrow('useTransportApi must be used within');
  });
});

describe('TransportProvider media synchronization', () => {
  function MediaProbe({ controller }: { controller: AudioTrackController }) {
    const state = useTransportState();
    const api = useTransportApi();
    const mediaDuration = useMediaDuration();
    const dispatch = useProjectDispatch();
    return (
      <>
        <pre data-testid="transport">{JSON.stringify(state)}</pre>
        <output aria-label="media duration">{mediaDuration}</output>
        <button type="button" onClick={api.togglePlay}>
          toggle
        </button>
        <button type="button" onClick={() => api.setRate(0.5)}>
          half
        </button>
        <button type="button" onClick={() => api.attachMedia(controller)}>
          attach
        </button>
        <button type="button" onClick={() => dispatch(setMediaOffset(2))}>
          offset2
        </button>
        <button type="button" onClick={() => api.applyMediaOffset(3, 0)}>
          apply3
        </button>
      </>
    );
  }

  function setupMedia(initialProject?: Project) {
    const fake = createFakeMediaPlayers();
    const controller = new AudioTrackController({
      createPlayer: fake.create,
      canPlayType: () => true,
      createObjectUrl: () => 'blob:a',
      revokeObjectUrl: () => undefined,
    });
    const engine = new FakePianoEngine();
    const view = render(
      <ProjectProvider initialProject={initialProject}>
        <EditorProvider>
          <TransportProvider loadEngine={() => Promise.resolve(engine)}>
            <MediaProbe controller={controller} />
          </TransportProvider>
        </EditorProvider>
      </ProjectProvider>,
    );
    const loadReady = (duration: number): FakeMediaPlayer => {
      act(() => {
        controller.load(new File(['a'], 'a.mp3'), document.createElement('div'));
      });
      const player = fake.players.at(-1);
      if (player === undefined) throw new Error('no player');
      act(() => player.emitReady(duration));
      return player;
    };
    const play = async () => {
      await act(async () => {
        screen.getByRole('button', { name: 'toggle' }).click();
        await Promise.resolve();
      });
    };
    return { view, controller, engine, loadReady, play };
  }

  it('changes the rate', () => {
    setupMedia();
    click('half');
    expect(readState().rate).toBe(0.5);
  });

  it('extends the transport to the attached media', async () => {
    const { engine, loadReady, play } = setupMedia();
    click('attach');
    loadReady(90);
    expect(screen.getByRole('status', { name: 'media duration' }).textContent).toBe('90');
    await play();
    expect(readState().status).toBe('playing');
    engine.time = 94.06;
    act(() => engine.tick());
    expect(readState().status).toBe('paused');
  });

  it('plays and pauses the attached media with the transport', async () => {
    const { loadReady, play } = setupMedia();
    click('attach');
    const player = loadReady(30);
    await play();
    expect(player.calls).toContain('play');
    click('toggle');
    expect(player.calls.at(-1)).toBe('pause');
  });

  it('stops the media before detaching it on unmount', async () => {
    const { view, engine, loadReady, play } = setupMedia();
    click('attach');
    const player = loadReady(30);
    await play();
    engine.time = 2;
    player.currentTime = 1.95;
    player.calls.length = 0;
    view.unmount();
    expect(player.calls).toEqual(['pause', 'setTime:0']);
  });

  it('keeps playing while the media file is replaced', async () => {
    const { controller, engine, loadReady, play } = setupMedia();
    click('attach');
    loadReady(180);
    await play();
    engine.time = 90.05;
    act(() => engine.tick());
    expect(readState().status).toBe('playing');
    const before = readState().position;
    act(() => controller.load(new File(['b'], 'b.mp3'), document.createElement('div')));
    engine.time = 90.5;
    act(() => engine.tick());
    expect(readState().status).toBe('playing');
    expect(screen.getByRole('status', { name: 'media duration' }).textContent).toBe('180');
    expect(readState().position).toBeGreaterThanOrEqual(before);
  });

  it('pauses at the end when the new file is shorter', async () => {
    const { engine, loadReady, play } = setupMedia();
    click('attach');
    loadReady(180);
    await play();
    engine.time = 90.05;
    act(() => engine.tick());
    expect(readState().status).toBe('playing');
    // Replaces the file with a 30 s one; the timeline shrinks to its 60 s minimum.
    loadReady(30);
    expect(screen.getByRole('status', { name: 'media duration' }).textContent).toBe('30');
    engine.time = 91;
    act(() => engine.tick());
    expect(readState().status).toBe('paused');
  });

  it('has no media duration outside the provider', () => {
    function Orphan() {
      return <output aria-label="orphan">{useMediaDuration()}</output>;
    }
    render(<Orphan />);
    expect(screen.getByRole('status', { name: 'orphan' }).textContent).toBe('0');
  });

  it('applies the project media offset to the media', () => {
    const { loadReady } = setupMedia();
    click('attach');
    const player = loadReady(30);
    click('offset2');
    expect(player.calls).toContain('setTime:2');
    expect(screen.getByRole('status', { name: 'media duration' }).textContent).toBe('28');
  });

  it('applies an offset and a seek in one pass', () => {
    const { loadReady } = setupMedia();
    click('attach');
    const player = loadReady(30);
    click('offset2');
    player.calls.length = 0;
    click('apply3');
    expect(player.calls.filter((call) => call.startsWith('setTime:'))).toEqual(['setTime:3']);
    expect(readState().position).toBe(0);
  });

  it('extends the timeline for a negative offset', async () => {
    const { engine, loadReady, play } = setupMedia({ ...createEmptyProject(), mediaOffset: -40 });
    click('attach');
    loadReady(30);
    expect(screen.getByRole('status', { name: 'media duration' }).textContent).toBe('70');
    await play();
    engine.time = 64.06;
    act(() => engine.tick());
    expect(readState().status).toBe('playing');
  });
});
