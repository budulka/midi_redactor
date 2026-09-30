import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { FakePianoEngine } from '../audio/testing/FakePianoEngine.ts';
import {
  createFakeWaveformViews,
  type FakeWaveformView,
} from '../audio/testing/FakeWaveformView.ts';
import AudioTrack from '../components/AudioTrack.tsx';
import { stubAnimationFrames } from '../components/testing/animationFrames.ts';
import TransportControls from '../components/TransportControls.tsx';
import VideoPlayer from '../components/VideoPlayer.tsx';
import { createFakeMediaPlayers, type FakeMediaPlayer } from '../media/testing/FakeMediaPlayer.ts';
import AudioTrackProvider from './AudioTrackProvider.tsx';
import EditorProvider from './EditorProvider.tsx';
import MediaSyncBridge from './MediaSyncBridge.tsx';
import ProjectProvider from './ProjectProvider.tsx';
import SingleMediaSource from './SingleMediaSource.tsx';
import TransportProvider from './TransportProvider.tsx';
import VideoProvider from './VideoProvider.tsx';

vi.mock('../media/htmlVideoPlayer.ts', () => ({ createHtmlVideoPlayer: vi.fn() }));
vi.mock('../audio/waveSurferPlayer.ts', () => ({
  createWaveSurferPlayer: vi.fn(),
  createWaveSurferView: vi.fn(),
}));

const last = (players: readonly FakeMediaPlayer[]): FakeMediaPlayer => {
  const player = players.at(-1);
  if (player === undefined) throw new Error('no player');
  return player;
};

const lastView = (views: readonly FakeWaveformView[]): FakeWaveformView => {
  const view = views.at(-1);
  if (view === undefined) throw new Error('no view');
  return view;
};

function chooseAudio(name = 'song.mp3') {
  fireEvent.change(screen.getByLabelText('Audio file'), {
    target: { files: [new File(['a'], name, { type: 'audio/mpeg' })] },
  });
}

function chooseVideo(name = 'clip.mp4', type = 'video/mp4') {
  fireEvent.change(screen.getByLabelText('Video file'), {
    target: { files: [new File(['v'], name, { type })] },
  });
}

const audioRegion = () => within(screen.getByRole('region', { name: 'Audio track' }));
const videoRegion = () => within(screen.getByRole('region', { name: 'Video' }));

const panels = (
  <>
    <section aria-label="Video">
      <VideoPlayer />
    </section>
    <section aria-label="Audio track">
      <AudioTrack />
    </section>
  </>
);

describe('SingleMediaSource', () => {
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;
  let revokeObjectURL: ReturnType<typeof vi.fn>;
  let frames: ReturnType<typeof stubAnimationFrames>;

  beforeEach(() => {
    frames = stubAnimationFrames();
    URL.createObjectURL = vi.fn(() => 'blob:test');
    revokeObjectURL = vi.fn();
    URL.revokeObjectURL = revokeObjectURL;
  });

  afterEach(() => {
    cleanup();
    URL.createObjectURL = originalCreate;
    URL.revokeObjectURL = originalRevoke;
    vi.unstubAllGlobals();
  });

  function setup() {
    const audioPlayers = createFakeMediaPlayers();
    const videoPlayers = createFakeMediaPlayers();
    const views = createFakeWaveformViews();
    const tree = (withSource: boolean) => (
      <AudioTrackProvider
        createPlayer={audioPlayers.create}
        canPlayType={() => true}
        createWaveformView={views.create}
      >
        <VideoProvider createPlayer={videoPlayers.create} canPlayType={() => true}>
          {withSource && <SingleMediaSource />}
          {panels}
        </VideoProvider>
      </AudioTrackProvider>
    );
    const view = render(tree(true));
    return { view, tree, audioPlayers, videoPlayers, views: views.views };
  }

  it('replaces the audio file with a video', () => {
    const { audioPlayers } = setup();
    chooseAudio();
    const audio = last(audioPlayers.players);
    act(() => audio.emitReady(65));
    chooseVideo();
    expect(audio.destroyed).toBe(true);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:test');
    expect(audioRegion().queryByText('song.mp3')).toBeNull();
    expect(audioRegion().getByText('Loading the sound of clip.mp4…')).toBeInTheDocument();
  });

  it('replaces the video with an audio file', () => {
    const { videoPlayers, views } = setup();
    chooseVideo();
    const video = last(videoPlayers.players);
    video.mediaElement = document.createElement('video');
    act(() => video.emitReady(30));
    const waveform = lastView(views);
    chooseAudio('song2.mp3');
    expect(video.destroyed).toBe(true);
    expect(waveform.destroyed).toBe(true);
    expect(videoRegion().getByText(/Drop a video file here/)).toBeInTheDocument();
    expect(audioRegion().getByText('Loading song2.mp3…')).toBeInTheDocument();
  });

  it('keeps the audio when the chosen video is rejected', () => {
    const { audioPlayers } = setup();
    chooseAudio();
    const audio = last(audioPlayers.players);
    act(() => audio.emitReady(65));
    chooseVideo('a.avi', 'video/x-msvideo');
    expect(audio.destroyed).toBe(false);
    expect(audioRegion().getByText('song.mp3')).toBeInTheDocument();
    expect(videoRegion().getByRole('alert')).toHaveTextContent('Unsupported file "a.avi"');
  });

  it('stops replacing files when unmounted', () => {
    const { view, tree, audioPlayers } = setup();
    view.rerender(tree(false));
    chooseAudio();
    const audio = last(audioPlayers.players);
    act(() => audio.emitReady(65));
    chooseVideo();
    expect(audio.destroyed).toBe(false);
    expect(audioRegion().getByText('song.mp3')).toBeInTheDocument();
  });

  describe('with the transport', () => {
    function setupWithTransport() {
      const audioPlayers = createFakeMediaPlayers();
      const videoPlayers = createFakeMediaPlayers();
      const views = createFakeWaveformViews();
      const engine = new FakePianoEngine();
      render(
        <ProjectProvider>
          <EditorProvider>
            <TransportProvider loadEngine={() => Promise.resolve(engine)}>
              <AudioTrackProvider
                createPlayer={audioPlayers.create}
                canPlayType={() => true}
                createWaveformView={views.create}
              >
                <VideoProvider createPlayer={videoPlayers.create} canPlayType={() => true}>
                  <MediaSyncBridge />
                  <SingleMediaSource />
                  <TransportControls />
                  {panels}
                </VideoProvider>
              </AudioTrackProvider>
            </TransportProvider>
          </EditorProvider>
        </ProjectProvider>,
      );
      return { audioPlayers, videoPlayers, views: views.views, engine };
    }

    const playback = () => within(screen.getByRole('group', { name: 'Playback' }));
    const transportPosition = () => screen.getByRole('status', { name: 'Playback position' });

    it('keeps playing while the audio is replaced by a video', async () => {
      const { audioPlayers, videoPlayers, engine } = setupWithTransport();
      chooseAudio();
      const audio = last(audioPlayers.players);
      act(() => audio.emitReady(180));
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Play' }));
        await Promise.resolve();
      });
      engine.time = 90.05;
      act(() => engine.tick());

      chooseVideo();
      expect(audio.destroyed).toBe(true);
      engine.time = 90.5;
      act(() => engine.tick());
      act(() => frames.flushFrame());
      expect(playback().getByRole('button', { name: 'Pause' })).toBeInTheDocument();
      expect(transportPosition().textContent?.startsWith('1:30.')).toBe(true);

      const video = last(videoPlayers.players);
      act(() => video.emitReady(120));
      const seekIndex = video.calls.findIndex((call) => call.startsWith('setTime:'));
      expect(seekIndex).toBeGreaterThanOrEqual(0);
      expect(Number(video.calls[seekIndex]?.slice('setTime:'.length))).toBeCloseTo(90.5, 0);
      expect(video.calls.indexOf('play')).toBeGreaterThan(seekIndex);
    });

    it('seeks the transport with a click on the waveform of the video sound', () => {
      const { videoPlayers, views } = setupWithTransport();
      chooseVideo();
      const video = last(videoPlayers.players);
      video.mediaElement = document.createElement('video');
      act(() => video.emitReady(120));
      const waveform = lastView(views);
      act(() => waveform.emitReady());
      act(() => waveform.emitSeek(40));
      expect(transportPosition().textContent?.startsWith('0:40.000')).toBe(true);
      expect(video.calls).toContain('setTime:40');
    });
  });
});
