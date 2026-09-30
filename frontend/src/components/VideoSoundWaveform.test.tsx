import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import {
  createFakeWaveformViews,
  type FakeWaveformView,
} from '../audio/testing/FakeWaveformView.ts';
import { createFakeMediaPlayers, type FakeMediaPlayer } from '../media/testing/FakeMediaPlayer.ts';
import AudioTrackProvider from '../state/AudioTrackProvider.tsx';
import VideoProvider from '../state/VideoProvider.tsx';
import AudioTrack from './AudioTrack.tsx';
import { stubAnimationFrames } from './testing/animationFrames.ts';
import VideoPlayer from './VideoPlayer.tsx';

vi.mock('../media/htmlVideoPlayer.ts', () => ({ createHtmlVideoPlayer: vi.fn() }));
vi.mock('../audio/waveSurferPlayer.ts', () => ({
  createWaveSurferPlayer: vi.fn(),
  createWaveSurferView: vi.fn(),
}));

const file = (name: string, type: string) => new File(['x'], name, { type });

function setup() {
  const audioPlayers = createFakeMediaPlayers();
  const videoPlayers = createFakeMediaPlayers();
  const views = createFakeWaveformViews();
  render(
    <AudioTrackProvider
      createPlayer={audioPlayers.create}
      canPlayType={() => true}
      createWaveformView={views.create}
    >
      <VideoProvider createPlayer={videoPlayers.create} canPlayType={() => true}>
        <section aria-label="Video">
          <VideoPlayer />
        </section>
        <section aria-label="Audio track">
          <AudioTrack />
        </section>
      </VideoProvider>
    </AudioTrackProvider>,
  );
  const last = (players: FakeMediaPlayer[]): FakeMediaPlayer => {
    const player = players.at(-1);
    if (player === undefined) throw new Error('no player');
    return player;
  };
  const view = (index = 0): FakeWaveformView => {
    const found = views.views[index];
    if (found === undefined) throw new Error(`no view ${index}`);
    return found;
  };
  const chooseVideo = (name = 'clip.mp4') => {
    fireEvent.change(screen.getByLabelText('Video file'), {
      target: { files: [file(name, 'video/mp4')] },
    });
    return last(videoPlayers.players);
  };
  /** Loads a video whose player has a media element and makes it ready. */
  const loadVideo = (duration = 30, name = 'clip.mp4') => {
    const player = chooseVideo(name);
    const element = document.createElement('video');
    player.mediaElement = element;
    act(() => player.emitReady(duration));
    return { player, element };
  };
  return { audioPlayers, videoPlayers, views: views.views, view, chooseVideo, loadVideo, last };
}

const audioRegion = () => within(screen.getByRole('region', { name: 'Audio track' }));
const audioPosition = () => screen.getByRole('status', { name: 'Audio position' });
const videoPosition = () => screen.getByRole('status', { name: 'Video position' });

describe('VideoSoundWaveform', () => {
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
  });

  it('shows that the sound of a loading video is on its way', () => {
    const { chooseVideo, views } = setup();
    chooseVideo();
    expect(audioRegion().getByText('Loading the sound of clip.mp4…')).toBeInTheDocument();
    expect(audioRegion().queryByText(/MP3, WAV, OGG, AAC, M4A/)).toBeNull();
    expect(views).toHaveLength(0);
  });

  it('draws the sound of the ready video', () => {
    const { loadVideo, views, view } = setup();
    const { element } = loadVideo(30);
    expect(views).toHaveLength(1);
    expect(view().options.container).toBe(screen.getByTestId('video-waveform'));
    expect(view().options.media).toBe(element);
    expect(view().options.url).toBe('blob:test');
    expect(audioRegion().getByText('Drawing the sound of clip.mp4…')).toBeInTheDocument();
    const name = screen.getByText('Video sound: clip.mp4');
    expect(name).toHaveClass('audio-track__name');
    expect(name).toHaveAttribute('title', 'clip.mp4');
    expect(screen.getByRole('button', { name: 'Remove audio' })).toBeDisabled();
    expect(audioPosition()).toHaveTextContent('0:00.000 / 0:30.000');

    act(() => view().emitReady());
    expect(audioRegion().queryByText(/Drawing the sound/)).toBeNull();
    expect(audioRegion().queryByText(/No sound to show/)).toBeNull();
  });

  it('seeks the video with a click on the waveform', () => {
    const { loadVideo, view } = setup();
    const { player } = loadVideo(30);
    act(() => view().emitReady());
    act(() => view().emitSeek(12));
    expect(player.calls).toContain('setTime:12');
    expect(audioPosition()).toHaveTextContent('0:12.000 / 0:30.000');
    expect(videoPosition()).toHaveTextContent('0:12.000 / 0:30.000');
  });

  it('follows the live position of the video', () => {
    const { loadVideo } = setup();
    const { player } = loadVideo(30);
    act(() => player.emitPlay());
    player.currentTime = 2.5;
    frames.flushFrame();
    expect(audioPosition()).toHaveTextContent('0:02.500 / 0:30.000');
  });

  it('tells when the video has no sound to show', () => {
    const { loadVideo, view } = setup();
    loadVideo(30);
    act(() => view().emitError(new Error('no audio')));
    expect(
      audioRegion().getByText(
        'No sound to show: "clip.mp4" has no audio track or the browser cannot decode it.',
      ),
    ).toBeInTheDocument();
    expect(audioRegion().queryByRole('alert')).toBeNull();
  });

  it('does not draw a video without a media element', () => {
    const { chooseVideo, views } = setup();
    const player = chooseVideo();
    act(() => player.emitReady(30));
    expect(views).toHaveLength(0);
    expect(audioRegion().getByText(/No sound to show/)).toBeInTheDocument();
  });

  it('removes the waveform with the video', () => {
    const { loadVideo, view } = setup();
    loadVideo(30);
    fireEvent.click(screen.getByRole('button', { name: 'Remove video' }));
    expect(view().destroyed).toBe(true);
    expect(screen.queryByTestId('video-waveform')).toBeNull();
    expect(audioRegion().getByText(/MP3, WAV, OGG, AAC, M4A/)).toBeInTheDocument();
  });

  it('draws a new waveform for a new video', () => {
    const { loadVideo, views, view } = setup();
    loadVideo(30);
    const { element } = loadVideo(40, 'clip2.mp4');
    expect(view(0).destroyed).toBe(true);
    expect(views).toHaveLength(2);
    expect(view(1).options.media).toBe(element);
    expect(view(1).destroyed).toBe(false);
  });

  it('shows the audio file while one is loaded', () => {
    const { audioPlayers, last, views } = setup();
    fireEvent.change(screen.getByLabelText('Audio file'), {
      target: { files: [file('song.mp3', 'audio/mpeg')] },
    });
    act(() => last(audioPlayers.players).emitReady(65));
    expect(views).toHaveLength(0);
    expect(screen.queryByTestId('video-waveform')).toBeNull();
    expect(screen.getByText('song.mp3')).toHaveClass('audio-track__name');
    expect(screen.getByRole('button', { name: 'Remove audio' })).toBeEnabled();
  });
});
