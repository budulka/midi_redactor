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
import { useHistoryApi } from '../state/historyContext.ts';
import { useProject } from '../state/projectContext.ts';
import EditorProvider from '../state/EditorProvider.tsx';
import MediaSyncBridge from '../state/MediaSyncBridge.tsx';
import ProjectProvider from '../state/ProjectProvider.tsx';
import TransportProvider from '../state/TransportProvider.tsx';
import { useTransportState } from '../state/transportContext.ts';
import type { MediaCut } from '../state/types.ts';
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

function CutsProbe() {
  const { mediaCuts } = useProject();
  const history = useHistoryApi();
  return (
    <>
      <output aria-label="media cuts">
        {JSON.stringify(mediaCuts.map(({ start, end }) => ({ start, end })))}
      </output>
      <button type="button" onClick={history.undo}>
        Undo
      </button>
      <button type="button" onClick={history.redo}>
        Redo
      </button>
    </>
  );
}

function setup(mediaOffset = 0, mediaCuts: readonly MediaCut[] = []) {
  const fake = createFakeWaveformPlayers();
  const loadEngine = vi.fn(() => Promise.resolve(new FakePianoEngine()));
  render(
    <ProjectProvider initialProject={{ ...createEmptyProject(), mediaOffset, mediaCuts }}>
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
              <CutsProbe />
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

const cutsText = () => screen.getByRole('status', { name: 'media cuts' }).textContent;
const selectionBox = () => document.querySelector<HTMLElement>('.media-timeline__selection');
const cutMarks = () => document.querySelectorAll<HTMLElement>('.media-timeline__cut');
const lastSetTime = (player: FakeWaveformPlayer) =>
  player.calls.filter((call) => call.startsWith('setTime:')).at(-1);

/** Drags on the media timeline from one x to another (local px = client px). */
function dragTrack(from: number, to: number) {
  fireEvent.mouseDown(slider(), { button: 0, clientX: from });
  fireEvent.mouseMove(window, { clientX: to });
  fireEvent.mouseUp(window, { clientX: to });
}

function openRangeMenu(clientX: number) {
  fireEvent.contextMenu(slider(), { clientX });
}

function clickMenuItem(name: string) {
  fireEvent.click(screen.getByRole('menuitem', { name }));
}

/** Cuts the timeline range between two x positions through the context menu. */
function cutRange(from: number, to: number) {
  dragTrack(from, to);
  openRangeMenu((from + to) / 2);
  clickMenuItem('Delete range');
}

describe('MediaTimeline cuts', () => {
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;
  let frames: ReturnType<typeof stubAnimationFrames>;

  beforeEach(() => {
    frames = stubAnimationFrames();
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

  it('selects a range by dragging', () => {
    const { loadReady } = setup();
    loadReady(30);
    dragTrack(500, 800);
    expect(selectionBox()?.style.left).toBe('500px');
    expect(selectionBox()?.style.width).toBe('300px');
    expect(selectionBox()).toHaveAttribute('aria-label', 'Selected 0:05.000–0:08.000');
    expect(transportPosition()).toBe('5');
  });

  it('clears the selection with a click', () => {
    const { loadReady } = setup();
    loadReady(30);
    dragTrack(500, 800);
    fireEvent.mouseDown(slider(), { button: 0, clientX: 1000 });
    fireEvent.mouseUp(window, { clientX: 1000 });
    expect(selectionBox()).toBeNull();
  });

  it('deletes the selected range from the context menu', () => {
    const { loadReady } = setup();
    const player = loadReady(30);
    dragTrack(500, 800);
    openRangeMenu(600);
    expect(screen.getByRole('menu', { name: 'Media timeline actions' })).toBeInTheDocument();
    clickMenuItem('Delete range');
    expect(cutsText()).toBe('[{"start":5,"end":8}]');
    expect(band()?.style.width).toBe('2700px');
    expect(cutMarks()).toHaveLength(1);
    expect(cutMarks()[0].style.left).toBe('500px');
    expect(selectionBox()).toBeNull();
    expect(screen.queryByRole('menu')).toBeNull();
    expect(lastSetTime(player)).toBe('setTime:8');
    expect(slider()).toHaveFocus();
  });

  it('has no menu outside the selection', () => {
    const { loadReady } = setup();
    loadReady(30);
    dragTrack(500, 800);
    const notPrevented = fireEvent.contextMenu(slider(), { clientX: 1000 });
    expect(notPrevented).toBe(true);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('undoes and redoes a cut', () => {
    const { loadReady } = setup();
    loadReady(30);
    cutRange(500, 800);
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(cutsText()).toBe('[]');
    expect(cutMarks()).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Redo' }));
    expect(cutsText()).toBe('[{"start":5,"end":8}]');
    expect(cutMarks()).toHaveLength(1);
  });

  it('cuts and clears the selection with the keyboard', () => {
    const { loadReady } = setup();
    loadReady(30);
    dragTrack(500, 800);
    fireEvent.keyDown(slider(), { key: 'Escape' });
    expect(selectionBox()).toBeNull();
    expect(cutsText()).toBe('[]');

    dragTrack(500, 800);
    expect(slider()).toHaveFocus();
    fireEvent.keyDown(slider(), { key: 'Delete' });
    expect(cutsText()).toBe('[{"start":5,"end":8}]');
    expect(selectionBox()).toBeNull();
  });

  it('merges a new cut with the cut it covers', () => {
    const { loadReady } = setup();
    loadReady(30);
    cutRange(500, 800);
    cutRange(400, 600);
    expect(cutsText()).toBe('[{"start":4,"end":9}]');
  });

  it('cuts the media after the offset', () => {
    const { loadReady } = setup(1);
    const player = loadReady(30);
    cutRange(200, 300);
    expect(cutsText()).toBe('[{"start":3,"end":4}]');
    expect(transportPosition()).toBe('2');
    expect(lastSetTime(player)).toBe('setTime:4');
  });

  it('removes a cut from the context menu of its mark', () => {
    const { loadReady } = setup();
    loadReady(30);
    cutRange(500, 800);
    fireEvent.contextMenu(cutMarks()[0], { clientX: 500 });
    clickMenuItem('Remove cut');
    expect(cutsText()).toBe('[]');
    expect(slider()).toHaveFocus();
  });

  it('drags the end of a cut with one sync per frame and one undo step', () => {
    const { loadReady } = setup();
    const player = loadReady(30);
    cutRange(500, 800);
    const end = screen.getByRole('slider', { name: 'End of cut 1' });
    player.calls.length = 0;
    fireEvent.mouseDown(end, { button: 0, clientX: 503 });
    fireEvent.mouseMove(window, { clientX: 553 });
    expect(screen.getByText('Cut 0:05.000–0:08.500 (3.500 s)')).toBeInTheDocument();
    expect(player.calls).not.toContain('setTime:8.5');
    act(() => frames.flushFrame());
    expect(player.calls).toContain('setTime:8.5');

    const before = player.calls.filter((call) => call.startsWith('setTime:')).length;
    fireEvent.mouseMove(window, { clientX: 553 });
    fireEvent.mouseMove(window, { clientX: 563 });
    act(() => frames.flushFrame());
    const added = player.calls.filter((call) => call.startsWith('setTime:')).slice(before);
    expect(added).toEqual(['setTime:8.6']);

    fireEvent.mouseMove(window, { clientX: 573 });
    fireEvent.mouseUp(window, { clientX: 563 });
    expect(cutsText()).toBe('[{"start":5,"end":8.6}]');
    expect(frames.pending).toBe(0);

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(cutsText()).toBe('[{"start":5,"end":8}]');
  });

  it('drags the start of a cut with its mark', () => {
    const { loadReady } = setup();
    loadReady(30);
    cutRange(500, 800);
    const start = screen.getByRole('slider', { name: 'Start of cut 1' });
    fireEvent.mouseDown(start, { button: 0, clientX: 497 });
    fireEvent.mouseMove(window, { clientX: 397 });
    expect(cutMarks()[0].style.left).toBe('400px');
    fireEvent.mouseUp(window, { clientX: 397 });
    expect(cutsText()).toBe('[{"start":4,"end":8}]');
  });

  it('stops the end of a cut at the end of the media', () => {
    const { loadReady } = setup();
    loadReady(30);
    cutRange(500, 800);
    const end = screen.getByRole('slider', { name: 'End of cut 1' });
    fireEvent.mouseDown(end, { button: 0, clientX: 503 });
    fireEvent.mouseMove(window, { clientX: 5000 });
    fireEvent.mouseUp(window, { clientX: 5000 });
    expect(cutsText()).toBe('[{"start":5,"end":30}]');
  });

  it('keeps bar 1 inside a cut that contains it', () => {
    const { loadReady } = setup(3, [{ id: 'c', start: 2, end: 5 }]);
    loadReady(30);
    expect(cutMarks()[0].style.left).toBe('0px');

    const end = screen.getByRole('slider', { name: 'End of cut 1' });
    fireEvent.mouseDown(end, { button: 0, clientX: 3 });
    fireEvent.mouseMove(window, { clientX: -297 });
    expect(cutMarks()).toHaveLength(1);
    expect(cutMarks()[0].style.left).toBe('0px');
    expect(screen.getByText('Cut 0:02.000–0:03.000 (1.000 s)')).toBeInTheDocument();
    fireEvent.mouseUp(window, { clientX: -297 });
    expect(cutsText()).toBe('[{"start":2,"end":3}]');
  });

  it('keeps bar 1 inside a cut when its start is dragged', () => {
    const { loadReady } = setup(3, [{ id: 'c', start: 2, end: 5 }]);
    loadReady(30);
    const start = screen.getByRole('slider', { name: 'Start of cut 1' });
    fireEvent.mouseDown(start, { button: 0, clientX: -3 });
    fireEvent.mouseMove(window, { clientX: 297 });
    expect(cutMarks()[0].style.left).toBe('0px');
    fireEvent.mouseUp(window, { clientX: 297 });
    expect(cutsText()).toBe('[{"start":3,"end":5}]');
    expect(cutMarks()[0].style.left).toBe('0px');
  });

  it('brings the project map back on Escape', () => {
    const { loadReady } = setup();
    const player = loadReady(30);
    cutRange(500, 800);
    const end = screen.getByRole('slider', { name: 'End of cut 1' });
    fireEvent.mouseDown(end, { button: 0, clientX: 503 });
    fireEvent.mouseMove(window, { clientX: 553 });
    act(() => frames.flushFrame());
    expect(lastSetTime(player)).toBe('setTime:8.5');
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(cutsText()).toBe('[{"start":5,"end":8}]');
    expect(lastSetTime(player)).toBe('setTime:8');
    expect(frames.pending).toBe(0);
  });

  it('moves and removes a cut edge with the keyboard, one undo step each', () => {
    const { loadReady } = setup();
    loadReady(30);
    cutRange(500, 800);
    const end = screen.getByRole('slider', { name: 'End of cut 1' });
    end.focus();
    fireEvent.keyDown(end, { key: 'ArrowRight' });
    expect(cutsText()).toBe('[{"start":5,"end":8.01}]');
    fireEvent.keyDown(screen.getByRole('slider', { name: 'End of cut 1' }), {
      key: 'ArrowLeft',
      shiftKey: true,
    });
    expect(cutsText()).toBe('[{"start":5,"end":7.91}]');
    fireEvent.keyDown(screen.getByRole('slider', { name: 'End of cut 1' }), { key: 'Delete' });
    expect(cutsText()).toBe('[]');
    expect(slider()).toHaveFocus();

    const undo = screen.getByRole('button', { name: 'Undo' });
    fireEvent.click(undo);
    fireEvent.click(undo);
    fireEvent.click(undo);
    expect(cutsText()).toBe('[{"start":5,"end":8}]');
  });
});
