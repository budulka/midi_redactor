import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { FakePianoEngine } from '../audio/testing/FakePianoEngine.ts';
import AudioTrack from '../components/AudioTrack.tsx';
import { stubAnimationFrames } from '../components/testing/animationFrames.ts';
import TransportControls from '../components/TransportControls.tsx';
import VideoPlayer from '../components/VideoPlayer.tsx';
import { createFakeMediaPlayers, type FakeMediaPlayer } from '../media/testing/FakeMediaPlayer.ts';
import AudioTrackProvider from './AudioTrackProvider.tsx';
import EditorProvider from './EditorProvider.tsx';
import MediaSyncBridge from './MediaSyncBridge.tsx';
import ProjectProvider from './ProjectProvider.tsx';
import TransportProvider from './TransportProvider.tsx';
import VideoProvider from './VideoProvider.tsx';

vi.mock('../media/htmlVideoPlayer.ts', () => ({ createHtmlVideoPlayer: vi.fn() }));
vi.mock('../audio/waveSurferPlayer.ts', () => ({
  createWaveSurferPlayer: vi.fn(),
  createWaveSurferView: vi.fn(),
}));

function setup() {
  const audioPlayers = createFakeMediaPlayers();
  const videoPlayers = createFakeMediaPlayers();
  const engine = new FakePianoEngine();
  const tree = (withBridge: boolean) => (
    <ProjectProvider>
      <EditorProvider>
        <TransportProvider loadEngine={() => Promise.resolve(engine)}>
          <AudioTrackProvider createPlayer={audioPlayers.create} canPlayType={() => true}>
            <VideoProvider createPlayer={videoPlayers.create} canPlayType={() => true}>
              {withBridge && <MediaSyncBridge />}
              <TransportControls />
              <VideoPlayer />
              <AudioTrack />
            </VideoProvider>
          </AudioTrackProvider>
        </TransportProvider>
      </EditorProvider>
    </ProjectProvider>
  );
  const view = render(tree(true));
  const only = (players: FakeMediaPlayer[]): FakeMediaPlayer => {
    const player = players.at(-1);
    if (player === undefined) throw new Error('no player');
    return player;
  };

  fireEvent.change(screen.getByLabelText('Video file'), {
    target: { files: [new File(['v'], 'clip.mp4', { type: 'video/mp4' })] },
  });
  fireEvent.change(screen.getByLabelText('Audio file'), {
    target: { files: [new File(['a'], 'song.mp3', { type: 'audio/mpeg' })] },
  });
  const video = only(videoPlayers.players);
  const audio = only(audioPlayers.players);
  act(() => video.emitReady(65));
  act(() => audio.emitReady(200));
  const clearCalls = () => {
    video.calls.length = 0;
    audio.calls.length = 0;
  };
  return { view, tree, engine, video, audio, clearCalls };
}

const transportPosition = () => screen.getByRole('status', { name: 'Playback position' });

describe('MediaSyncBridge', () => {
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;

  beforeEach(() => {
    stubAnimationFrames();
    URL.createObjectURL = vi.fn(() => 'blob:media');
    URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    cleanup();
    URL.createObjectURL = originalCreate;
    URL.revokeObjectURL = originalRevoke;
    vi.unstubAllGlobals();
  });

  it('plays and pauses the video and the audio with the transport', async () => {
    const { video, audio } = setup();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Play' }));
      await Promise.resolve();
    });
    expect(video.calls).toContain('play');
    expect(audio.calls).toContain('play');
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    expect(video.calls).toContain('pause');
    expect(audio.calls).toContain('pause');
  });

  it('applies the playback speed to both media', () => {
    const { video, audio } = setup();
    fireEvent.change(screen.getByRole('combobox', { name: 'Playback speed' }), {
      target: { value: '0.5' },
    });
    expect(video.calls).toContain('setPlaybackRate:0.5');
    expect(audio.calls).toContain('setPlaybackRate:0.5');
  });

  it('seeks the whole timeline with the video slider', () => {
    const { video, audio, clearCalls } = setup();
    clearCalls();
    fireEvent.change(screen.getByRole('slider', { name: 'Seek video' }), {
      target: { value: '30' },
    });
    expect(transportPosition().textContent?.startsWith('0:30.000')).toBe(true);
    expect(video.calls.filter((call) => call.startsWith('setTime:'))).toEqual(['setTime:30']);
    expect(audio.calls.filter((call) => call.startsWith('setTime:'))).toEqual(['setTime:30']);
  });

  it('seeks the whole timeline with a click on the waveform', () => {
    const { video, audio, clearCalls } = setup();
    clearCalls();
    act(() => audio.emitSeek(150));
    expect(video.calls).toContain('setTime:65');
    expect(transportPosition().textContent?.startsWith('2:30.000')).toBe(true);
  });

  it('stops following the transport without the bridge', () => {
    const { view, tree, video, audio, clearCalls } = setup();
    view.rerender(tree(false));
    clearCalls();
    fireEvent.change(screen.getByRole('combobox', { name: 'Playback speed' }), {
      target: { value: '0.5' },
    });
    expect(video.calls).toEqual([]);
    expect(audio.calls).toEqual([]);
  });
});
