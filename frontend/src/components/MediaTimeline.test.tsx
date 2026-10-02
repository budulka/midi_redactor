import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { FakePianoEngine } from '../audio/testing/FakePianoEngine.ts';
import {
  createFakeWaveformPlayers,
  type FakeWaveformPlayer,
} from '../audio/testing/FakeWaveformPlayer.ts';
import { createFakeWaveformViews } from '../audio/testing/FakeWaveformView.ts';
import { createFakeMediaPlayers } from '../media/testing/FakeMediaPlayer.ts';
import AudioTrackProvider from '../state/AudioTrackProvider.tsx';
import { createEmptyProject } from '../state/constants.ts';
import EditorProvider from '../state/EditorProvider.tsx';
import MediaSyncBridge from '../state/MediaSyncBridge.tsx';
import ProjectProvider from '../state/ProjectProvider.tsx';
import TransportProvider from '../state/TransportProvider.tsx';
import { useTransportState } from '../state/transportContext.ts';
import VideoProvider from '../state/VideoProvider.tsx';
import AudioTrack from './AudioTrack.tsx';
import KeyboardShortcuts from './KeyboardShortcuts.tsx';
import MediaTimeline from './MediaTimeline.tsx';
import { stubAnimationFrames } from './testing/animationFrames.ts';

vi.mock('../media/htmlVideoPlayer.ts', () => ({ createHtmlVideoPlayer: vi.fn() }));
vi.mock('../audio/waveSurferPlayer.ts', () => ({
  createWaveSurferPlayer: vi.fn(),
  createWaveSurferView: vi.fn(),
}));

function Probe() {
  const { position, status } = useTransportState();
  return (
    <>
      <output aria-label="transport position">{position}</output>
      <output aria-label="transport status">{status}</output>
    </>
  );
}

function setup(mediaOffset = 0) {
  const fake = createFakeWaveformPlayers();
  const loadEngine = vi.fn(() => Promise.resolve(new FakePianoEngine()));
  render(
    <ProjectProvider initialProject={{ ...createEmptyProject(), mediaOffset }}>
      <EditorProvider>
        <TransportProvider loadEngine={loadEngine}>
          <AudioTrackProvider
            createPlayer={fake.create}
            canPlayType={() => true}
            createWaveformView={createFakeWaveformViews().create}
          >
            <VideoProvider createPlayer={createFakeMediaPlayers().create} canPlayType={() => true}>
              <MediaSyncBridge />
              <KeyboardShortcuts />
              <MediaTimeline durationSeconds={60} pixelsPerSecond={100} />
              <AudioTrack />
              <Probe />
            </VideoProvider>
          </AudioTrackProvider>
        </TransportProvider>
      </EditorProvider>
    </ProjectProvider>,
  );
  const track = document.querySelector<HTMLElement>('.media-timeline__track');
  if (track === null) throw new Error('no track');
  vi.spyOn(track, 'getBoundingClientRect').mockReturnValue({
    left: 0,
    top: 0,
    right: 6000,
    bottom: 28,
    width: 6000,
    height: 28,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  });
  const loadReady = (duration = 30): FakeWaveformPlayer => {
    fireEvent.change(screen.getByLabelText('Audio file'), {
      target: { files: [new File(['x'], 'song.mp3', { type: 'audio/mpeg' })] },
    });
    const player = fake.players.at(-1);
    if (player === undefined) throw new Error('no player');
    act(() => player.emitReady(duration));
    return player;
  };
  return { loadReady, loadEngine };
}

const slider = () => screen.getByRole('slider', { name: 'Media position' });
const band = () => document.querySelector<HTMLElement>('.media-timeline__media');
const transportPosition = () =>
  screen.getByRole('status', { name: 'transport position' }).textContent;
const transportStatus = () => screen.getByRole('status', { name: 'transport status' }).textContent;

describe('MediaTimeline', () => {
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;

  beforeEach(() => {
    stubAnimationFrames();
    URL.createObjectURL = vi.fn(() => 'blob:test');
    URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    cleanup();
    URL.createObjectURL = originalCreate;
    URL.revokeObjectURL = originalRevoke;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('is disabled without media and does not seek', () => {
    setup();
    expect(slider()).toHaveAttribute('aria-disabled', 'true');
    expect(slider().tabIndex).toBe(-1);
    expect(screen.getByText('Load audio or video to see its timeline here')).toBeInTheDocument();
    expect(band()).toBeNull();
    fireEvent.mouseDown(slider(), { button: 0, clientX: 250 });
    expect(transportPosition()).toBe('0');
  });

  it('is as wide as the timeline', () => {
    setup();
    const group = screen.getByRole('group', { name: 'Media timeline' });
    expect(group.style.width).toBe('6000px');
  });

  it('shows where the media lies on the timeline', () => {
    const { loadReady } = setup();
    loadReady(30);
    expect(slider()).toHaveAttribute('aria-disabled', 'false');
    expect(slider().tabIndex).toBe(0);
    expect(band()?.style.left).toBe('0px');
    expect(band()?.style.width).toBe('3000px');
    expect(screen.queryByText('Load audio or video to see its timeline here')).toBeNull();
  });

  it('hides the intro before bar 1 and says how long it is', () => {
    const { loadReady } = setup(3.2);
    loadReady(30);
    expect(band()?.style.left).toBe('0px');
    expect(band()?.style.width).toBe('2680px');
    expect(screen.getByText('0:03.200 before bar 1')).toBeInTheDocument();
  });

  it('starts the band after bar 1 with a negative offset', () => {
    const { loadReady } = setup(-2);
    loadReady(30);
    expect(band()?.style.left).toBe('200px');
    expect(band()?.style.width).toBe('3000px');
  });

  it('does not seek with the right button', () => {
    const { loadReady } = setup();
    loadReady(30);
    fireEvent.mouseDown(slider(), { button: 2, clientX: 250 });
    expect(transportPosition()).toBe('0');
  });

  it('seeks the whole timeline with a click', () => {
    const { loadReady } = setup();
    const player = loadReady(30);
    player.calls.length = 0;
    fireEvent.mouseDown(slider(), { button: 0, clientX: 250 });
    expect(transportPosition()).toBe('2.5');
    expect(player.calls).toContain('setTime:2.5');
    expect(slider()).toHaveFocus();
  });

  it('seeks with the keyboard', () => {
    const { loadReady } = setup();
    loadReady(30);
    fireEvent.mouseDown(slider(), { button: 0, clientX: 250 });
    fireEvent.keyDown(slider(), { key: 'ArrowRight' });
    expect(transportPosition()).toBe('2.6');
    fireEvent.keyDown(slider(), { key: 'ArrowRight', shiftKey: true });
    expect(transportPosition()).toBe('3.6');
    fireEvent.keyDown(slider(), { key: 'End' });
    expect(transportPosition()).toBe('30');
    fireEvent.keyDown(slider(), { key: 'Home' });
    expect(transportPosition()).toBe('0');
    expect(slider()).toHaveAttribute('aria-valuetext', '0:00.000 (media 0:00.000)');
  });

  it('does not start playback with Space', () => {
    const { loadReady, loadEngine } = setup();
    loadReady(30);
    slider().focus();
    fireEvent.keyDown(slider(), { key: ' ', code: 'Space' });
    expect(transportStatus()).not.toBe('playing');
    expect(loadEngine).not.toHaveBeenCalled();
  });
});
