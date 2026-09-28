import { act, fireEvent, render, screen } from '@testing-library/react';
import type { PianoEngine } from '../audio/engine.ts';
import { FakePianoEngine } from '../audio/testing/FakePianoEngine.ts';
import EditorProvider from '../state/EditorProvider.tsx';
import ProjectProvider from '../state/ProjectProvider.tsx';
import TransportProvider from '../state/TransportProvider.tsx';
import type { Project } from '../state/types.ts';
import StateProbe from './PianoRoll/StateProbe.tsx';
import { readEditor } from './PianoRoll/testUtils.tsx';
import { stubAnimationFrames } from './testing/animationFrames.ts';
import TransportControls from './TransportControls.tsx';

const project: Project = {
  bpm: 120,
  timeSignature: { numerator: 4, denominator: 4 },
  notes: [{ id: 'a', pitch: 60, start: 0, duration: 0.5, velocity: 100 }],
  pedals: [],
};

function setup() {
  const loads: Array<{ resolve: (e: PianoEngine) => void; reject: (e: Error) => void }> = [];
  const loadEngine = vi.fn(
    () =>
      new Promise<PianoEngine>((resolve, reject) => {
        loads.push({ resolve, reject });
      }),
  );
  render(
    <ProjectProvider initialProject={project}>
      <EditorProvider>
        <TransportProvider loadEngine={loadEngine}>
          <TransportControls />
          <StateProbe />
        </TransportProvider>
      </EditorProvider>
    </ProjectProvider>,
  );
  return { loadEngine, loads };
}

const position = () => screen.getByRole('status', { name: 'Playback position' });

async function startPlaying(engine: FakePianoEngine) {
  const { loads } = setup();
  fireEvent.click(screen.getByRole('button', { name: 'Play' }));
  await act(async () => {
    loads[0].resolve(engine);
  });
}

describe('TransportControls', () => {
  let frames: ReturnType<typeof stubAnimationFrames>;

  beforeEach(() => {
    frames = stubAnimationFrames();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows Play, a disabled Stop, the position and Follow', () => {
    setup();
    expect(screen.getByRole('group', { name: 'Playback' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Play' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Stop' })).toBeDisabled();
    expect(position()).toHaveTextContent('0:00.000 · 1.1');
    expect(screen.getByRole('checkbox', { name: 'Follow' })).toBeChecked();
  });

  it('shows loading while the piano loads, then Pause', async () => {
    const { loads } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    const loading = screen.getByRole('button', { name: 'Loading piano…' });
    expect(loading).toBeDisabled();
    expect(loading).toHaveTextContent('Loading piano…');

    await act(async () => {
      loads[0].resolve(new FakePianoEngine());
    });
    expect(screen.getByRole('button', { name: 'Pause' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Stop' })).toBeEnabled();
  });

  it('pauses at the transport position', async () => {
    const engine = new FakePianoEngine();
    await startPlaying(engine);
    engine.time = 1.05;
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument();
    expect(position()).toHaveTextContent('0:01.000 · 1.3');
    expect(screen.getByRole('button', { name: 'Stop' })).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    expect(position()).toHaveTextContent('0:00.000 · 1.1');
    expect(screen.getByRole('button', { name: 'Stop' })).toBeDisabled();
  });

  it('updates the position in animation frames while playing', async () => {
    const engine = new FakePianoEngine();
    await startPlaying(engine);
    engine.time = 2.55;
    act(() => frames.flushFrame());
    expect(position()).toHaveTextContent('0:02.500 · 2.2');
    expect(frames.pending).toBe(1);

    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    expect(frames.cancelAnimationFrame).toHaveBeenCalled();
    expect(frames.pending).toBe(0);
  });

  it('shows a loading error with a retry button', async () => {
    const { loadEngine, loads } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    await act(async () => {
      loads[0].reject(new Error('Could not load piano samples'));
    });
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load piano samples');

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(loadEngine).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('switches following the playhead off', () => {
    setup();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Follow' }));
    expect(readEditor(screen).followPlayhead).toBe(false);
  });
});
