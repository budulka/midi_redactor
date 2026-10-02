import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { FakePianoEngine } from '../audio/testing/FakePianoEngine.ts';
import {
  createFakeWaveformPlayers,
  type FakeWaveformPlayer,
} from '../audio/testing/FakeWaveformPlayer.ts';
import { createFakeWaveformViews } from '../audio/testing/FakeWaveformView.ts';
import { createFakeMediaPlayers } from '../media/testing/FakeMediaPlayer.ts';
import AudioTrackProvider from '../state/AudioTrackProvider.tsx';
import EditorProvider from '../state/EditorProvider.tsx';
import { useHistoryApi } from '../state/historyContext.ts';
import MediaSyncBridge from '../state/MediaSyncBridge.tsx';
import { useProject } from '../state/projectContext.ts';
import ProjectProvider from '../state/ProjectProvider.tsx';
import TransportProvider from '../state/TransportProvider.tsx';
import { useTransportState } from '../state/transportContext.ts';
import VideoProvider from '../state/VideoProvider.tsx';
import AudioTrack from './AudioTrack.tsx';
import MediaOffsetControls from './MediaOffsetControls.tsx';
import MediaOffsetMarker from './MediaOffsetMarker.tsx';
import { stubAnimationFrames } from './testing/animationFrames.ts';

vi.mock('../media/htmlVideoPlayer.ts', () => ({ createHtmlVideoPlayer: vi.fn() }));
vi.mock('../audio/waveSurferPlayer.ts', () => ({
  createWaveSurferPlayer: vi.fn(),
  createWaveSurferView: vi.fn(),
}));

function Probe() {
  const { mediaOffset } = useProject();
  const { position } = useTransportState();
  const history = useHistoryApi();
  return (
    <>
      <output aria-label="offset">{mediaOffset}</output>
      <output aria-label="transport position">{position}</output>
      <button type="button" onClick={history.undo}>
        Undo
      </button>
      <button type="button" onClick={history.redo}>
        Redo
      </button>
    </>
  );
}

function setup() {
  const fake = createFakeWaveformPlayers();
  render(
    <ProjectProvider>
      <EditorProvider>
        <TransportProvider loadEngine={() => Promise.resolve(new FakePianoEngine())}>
          <AudioTrackProvider
            createPlayer={fake.create}
            canPlayType={() => true}
            createWaveformView={createFakeWaveformViews().create}
          >
            <VideoProvider createPlayer={createFakeMediaPlayers().create} canPlayType={() => true}>
              <MediaSyncBridge />
              <AudioTrack overlay={<MediaOffsetMarker />} />
              <MediaOffsetControls />
              <Probe />
            </VideoProvider>
          </AudioTrackProvider>
        </TransportProvider>
      </EditorProvider>
    </ProjectProvider>,
  );
  const loadReady = (duration = 30): FakeWaveformPlayer => {
    fireEvent.change(screen.getByLabelText('Audio file'), {
      target: { files: [new File(['x'], 'song.mp3', { type: 'audio/mpeg' })] },
    });
    const player = fake.players.at(-1);
    if (player === undefined) throw new Error('no player');
    act(() => player.emitReady(duration));
    return player;
  };
  return { loadReady };
}

const field = () => screen.getByLabelText<HTMLInputElement>('Media offset (seconds)');
const hereButton = () =>
  screen.getByRole('button', { name: 'Set bar 1 to the current media position' });
const offset = () => screen.getByRole('status', { name: 'offset' }).textContent;
const transportPosition = () =>
  screen.getByRole('status', { name: 'transport position' }).textContent;
const slider = () => screen.getByRole('slider', { name: 'Bar 1 position in the media' });
const setTimes = (player: FakeWaveformPlayer) =>
  player.calls.filter((call) => call.startsWith('setTime:'));

function enterOffset(value: string) {
  fireEvent.change(field(), { target: { value } });
  fireEvent.keyDown(field(), { key: 'Enter' });
}

function click(name: string) {
  fireEvent.click(screen.getByRole('button', { name }));
}

function mockOverlayRect() {
  const overlay = document.querySelector<HTMLElement>('.media-offset-overlay');
  if (overlay === null) throw new Error('no overlay');
  vi.spyOn(overlay, 'getBoundingClientRect').mockReturnValue({
    left: 0,
    top: 0,
    right: 300,
    bottom: 96,
    width: 300,
    height: 96,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  });
}

describe('MediaOffsetControls and MediaOffsetMarker', () => {
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

  it('shows the offset without media', () => {
    setup();
    expect(field().value).toBe('0');
    expect(hereButton()).toBeDisabled();
    expect(screen.getByText('Bar 1 is at the start of the media.')).toBeInTheDocument();
    expect(screen.queryByRole('slider', { name: 'Bar 1 position in the media' })).toBeNull();
  });

  it('sets the offset by number as one undoable step', () => {
    setup();
    enterOffset('3.2');
    expect(offset()).toBe('3.2');
    expect(screen.getByText('Bar 1 is at 0:03.200 of the media.')).toBeInTheDocument();
    click('Undo');
    expect(offset()).toBe('0');
    click('Redo');
    expect(offset()).toBe('3.2');

    fireEvent.change(field(), { target: { value: '-1.5' } });
    fireEvent.blur(field());
    expect(offset()).toBe('-1.5');
    expect(screen.getByText('The media starts 0:01.500 after bar 1.')).toBeInTheDocument();
  });

  it('makes the current media position bar 1 without moving the media', () => {
    const { loadReady } = setup();
    const player = loadReady(30);
    expect(hereButton()).toBeEnabled();
    player.currentTime = 4.5678;
    player.calls.length = 0;
    fireEvent.click(hereButton());
    expect(offset()).toBe('4.568');
    expect(transportPosition()).toBe('0');
    expect(setTimes(player).every((call) => call === 'setTime:4.568')).toBe(true);
    expect(player.currentTime).toBeCloseTo(4.568, 3);
  });

  it('shows the marker and moves it with the keyboard', () => {
    const { loadReady } = setup();
    loadReady(30);
    enterOffset('3');
    expect(slider()).toHaveAttribute('aria-valuenow', '3');
    expect(slider()).toHaveAttribute('aria-valuetext', 'Bar 1 at 0:03.000');
    expect(slider().style.left).toBe('10%');
    const shade = document.querySelector<HTMLElement>('.media-offset-overlay__before');
    expect(shade?.style.width).toBe('10%');

    fireEvent.keyDown(slider(), { key: 'ArrowRight' });
    expect(offset()).toBe('3.01');
    fireEvent.keyDown(slider(), { key: 'ArrowLeft', shiftKey: true });
    expect(offset()).toBe('2.91');
    click('Undo');
    click('Undo');
    expect(offset()).toBe('3');
    fireEvent.keyDown(slider(), { key: 'Home' });
    expect(offset()).toBe('0');
  });

  it('drags the marker with a preview and commits once', () => {
    const { loadReady } = setup();
    const player = loadReady(30);
    enterOffset('3');
    mockOverlayRect();
    fireEvent.mouseDown(slider(), { button: 0, clientX: 30, clientY: 10 });
    fireEvent.mouseMove(window, { clientX: 150, clientY: 10 });
    expect(offset()).toBe('3');
    expect(setTimes(player).at(-1)).toBe('setTime:15');
    fireEvent.mouseUp(window, { clientX: 150, clientY: 10 });
    expect(offset()).toBe('15');
    click('Undo');
    expect(offset()).toBe('3');
  });

  it('brings the media back when a drag is cancelled with Escape', () => {
    const { loadReady } = setup();
    const player = loadReady(30);
    enterOffset('3');
    mockOverlayRect();
    fireEvent.mouseDown(slider(), { button: 0, clientX: 30, clientY: 10 });
    fireEvent.mouseMove(window, { clientX: 150, clientY: 10 });
    expect(setTimes(player).at(-1)).toBe('setTime:15');
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(offset()).toBe('3');
    expect(setTimes(player).at(-1)).toBe('setTime:3');
  });

  it('does not add a history step for a click without a move', () => {
    const { loadReady } = setup();
    loadReady(30);
    enterOffset('3');
    mockOverlayRect();
    fireEvent.mouseDown(slider(), { button: 0, clientX: 30, clientY: 10 });
    fireEvent.mouseUp(window, { clientX: 30, clientY: 10 });
    expect(offset()).toBe('3');
    click('Undo');
    expect(offset()).toBe('0');
  });

  it('has no marker for a negative offset', () => {
    const { loadReady } = setup();
    loadReady(30);
    enterOffset('-2');
    expect(screen.queryByRole('slider', { name: 'Bar 1 position in the media' })).toBeNull();
    expect(document.querySelector('.media-offset-overlay__before')).toBeNull();
  });

  it('brings the media back to bar 1 after a click on the intro', () => {
    const { loadReady } = setup();
    const player = loadReady(30);
    enterOffset('1');
    expect(transportPosition()).toBe('0');
    expect(player.currentTime).toBe(1);
    player.calls.length = 0;
    act(() => player.emitSeek(0.4));
    expect(transportPosition()).toBe('0');
    expect(setTimes(player).at(-1)).toBe('setTime:1');
  });
});
