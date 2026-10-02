import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createFakeWaveformPlayers } from '../audio/testing/FakeWaveformPlayer.ts';
import { createFakeWaveformViews } from '../audio/testing/FakeWaveformView.ts';
import { createFakeMediaPlayers } from '../media/testing/FakeMediaPlayer.ts';
import AudioTrackProvider from '../state/AudioTrackProvider.tsx';
import { useAudioTrackApi } from '../state/audioTrackContext.ts';
import VideoProvider from '../state/VideoProvider.tsx';
import { useVideoApi } from '../state/videoContext.ts';
import { useShownMedia } from './useShownMedia.ts';

vi.mock('../media/htmlVideoPlayer.ts', () => ({ createHtmlVideoPlayer: vi.fn() }));
vi.mock('../audio/waveSurferPlayer.ts', () => ({
  createWaveSurferPlayer: vi.fn(),
  createWaveSurferView: vi.fn(),
}));

function Probe() {
  const { showsVideo, state } = useShownMedia();
  const audioApi = useAudioTrackApi();
  const videoApi = useVideoApi();
  const container = document.createElement('div');
  return (
    <>
      <output aria-label="shown">{JSON.stringify({ showsVideo, duration: state.duration })}</output>
      <button
        type="button"
        onClick={() =>
          videoApi.loadFile(new File(['v'], 'clip.mp4', { type: 'video/mp4' }), container)
        }
      >
        video
      </button>
      <button
        type="button"
        onClick={() =>
          audioApi.loadFile(new File(['a'], 'song.mp3', { type: 'audio/mpeg' }), container)
        }
      >
        audio
      </button>
    </>
  );
}

function setup() {
  const audio = createFakeWaveformPlayers();
  const video = createFakeMediaPlayers();
  render(
    <AudioTrackProvider
      createPlayer={audio.create}
      canPlayType={() => true}
      createWaveformView={createFakeWaveformViews().create}
    >
      <VideoProvider createPlayer={video.create} canPlayType={() => true}>
        <Probe />
      </VideoProvider>
    </AudioTrackProvider>,
  );
  return { audio, video };
}

const shown = () =>
  JSON.parse(screen.getByRole('status', { name: 'shown' }).textContent ?? '{}') as {
    showsVideo: boolean;
    duration: number;
  };

describe('useShownMedia', () => {
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;

  beforeEach(() => {
    URL.createObjectURL = vi.fn(() => 'blob:test');
    URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    cleanup();
    URL.createObjectURL = originalCreate;
    URL.revokeObjectURL = originalRevoke;
  });

  it('shows the audio track without media', () => {
    setup();
    expect(shown()).toEqual({ showsVideo: false, duration: 0 });
  });

  it('shows the video when only a video is loaded', () => {
    const { video } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'video' }));
    act(() => video.players.at(-1)?.emitReady(12));
    expect(shown()).toEqual({ showsVideo: true, duration: 12 });
  });

  it('shows the audio file when one is loaded', () => {
    const { audio } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'audio' }));
    act(() => audio.players.at(-1)?.emitReady(30));
    expect(shown()).toEqual({ showsVideo: false, duration: 30 });
  });
});
