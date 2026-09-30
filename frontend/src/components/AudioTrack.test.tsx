import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import {
  createFakeWaveformPlayers,
  type FakeWaveformPlayer,
} from '../audio/testing/FakeWaveformPlayer.ts';
import { createFakeWaveformViews } from '../audio/testing/FakeWaveformView.ts';
import { createFakeMediaPlayers } from '../media/testing/FakeMediaPlayer.ts';
import AudioTrackProvider from '../state/AudioTrackProvider.tsx';
import VideoProvider from '../state/VideoProvider.tsx';
import { AUDIO_FILE_ACCEPT } from '../utils/audioFormats.ts';
import AudioTrack from './AudioTrack.tsx';
import { stubAnimationFrames } from './testing/animationFrames.ts';

vi.mock('../media/htmlVideoPlayer.ts', () => ({ createHtmlVideoPlayer: vi.fn() }));
vi.mock('../audio/waveSurferPlayer.ts', () => ({
  createWaveSurferPlayer: vi.fn(),
  createWaveSurferView: vi.fn(),
}));

const file = (name: string, type: string) => new File(['x'], name, { type });

function setup() {
  const fake = createFakeWaveformPlayers();
  render(
    <AudioTrackProvider
      createPlayer={fake.create}
      canPlayType={() => true}
      createWaveformView={createFakeWaveformViews().create}
    >
      <VideoProvider createPlayer={createFakeMediaPlayers().create} canPlayType={() => true}>
        <AudioTrack />
      </VideoProvider>
    </AudioTrackProvider>,
  );
  const player = (index = 0): FakeWaveformPlayer => {
    const found = fake.players[index];
    if (found === undefined) throw new Error(`no player ${index}`);
    return found;
  };
  return { players: fake.players, player };
}

const fileInput = () => screen.getByLabelText<HTMLInputElement>('Audio file');
const position = () => screen.getByRole('status', { name: 'Audio position' });

function choose(name: string, type: string) {
  fireEvent.change(fileInput(), { target: { files: [file(name, type)] } });
}

function loadReady(player: (index?: number) => FakeWaveformPlayer, duration = 65) {
  choose('song.mp3', 'audio/mpeg');
  act(() => player().emitReady(duration));
  return player();
}

describe('AudioTrack', () => {
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

  it('shows the empty track', () => {
    setup();
    expect(fileInput()).toHaveAttribute('accept', AUDIO_FILE_ACCEPT);
    expect(screen.getByText(/MP3, WAV, OGG, AAC, M4A/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Play audio' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Remove audio' })).toBeDisabled();
    expect(screen.queryByRole('combobox', { name: 'Audio speed' })).toBeNull();
    expect(position()).toHaveTextContent('0:00.000 / 0:00.000');
  });

  it('loads a chosen file into the waveform container', () => {
    const { player } = setup();
    choose('song.mp3', 'audio/mpeg');
    expect(screen.getByText('Loading song.mp3…')).toBeInTheDocument();
    expect(player().options.container).toBe(screen.getByTestId('waveform'));
    expect(fileInput().value).toBe('');
  });

  it('shows the ready track', () => {
    const { player } = setup();
    loadReady(player);
    expect(screen.getByText('song.mp3')).toBeInTheDocument();
    expect(position()).toHaveTextContent('0:00.000 / 1:05.000');
    expect(screen.queryByRole('button', { name: 'Play audio' })).toBeNull();
    expect(screen.queryByRole('combobox', { name: 'Audio speed' })).toBeNull();
  });

  it('follows the position while the audio plays', () => {
    const { player } = setup();
    const ready = loadReady(player);
    act(() => ready.emitPlay());

    ready.currentTime = 2.5;
    frames.flushFrame();
    expect(position()).toHaveTextContent('0:02.500 / 1:05.000');

    act(() => ready.emitPause());
    expect(frames.cancelAnimationFrame).toHaveBeenCalled();
  });

  it('has no own play, pause or speed controls', () => {
    const { player } = setup();
    loadReady(player);
    for (const name of ['Play audio', 'Pause audio']) {
      expect(screen.queryByRole('button', { name })).toBeNull();
    }
    expect(screen.queryByRole('combobox', { name: 'Audio speed' })).toBeNull();
  });

  it('shows a click on the waveform', () => {
    const { player } = setup();
    const ready = loadReady(player);
    act(() => ready.emitSeek(30));
    expect(position()).toHaveTextContent('0:30.000 / 1:05.000');
  });

  it('explains an unsupported file', () => {
    setup();
    choose('a.flac', 'audio/flac');
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Unsupported file "a.flac". Choose an MP3, WAV, OGG, AAC or M4A audio file.',
    );
  });

  it('explains a file that cannot be decoded', () => {
    const { player } = setup();
    choose('song.mp3', 'audio/mpeg');
    act(() => player().emitError());
    expect(screen.getByRole('alert')).toHaveTextContent('Could not read "song.mp3":');
    expect(screen.getByText(/MP3, WAV, OGG, AAC, M4A/)).toBeInTheDocument();
  });

  it('loads a dropped file', () => {
    const { players } = setup();
    const track = screen.getByTestId('waveform').closest('.audio-track');
    if (track === null) throw new Error('no audio track');
    expect(fireEvent.dragOver(track)).toBe(false);
    expect(fireEvent.dragOver(track, { dataTransfer: { dropEffect: 'none', files: [] } })).toBe(
      false,
    );
    fireEvent.drop(track, { dataTransfer: { files: [file('drop.wav', 'audio/wav')] } });
    expect(players).toHaveLength(1);
    expect(screen.getByText('Loading drop.wav…')).toBeInTheDocument();
  });

  it('removes the track', () => {
    const { player } = setup();
    const ready = loadReady(player);
    fireEvent.click(screen.getByRole('button', { name: 'Remove audio' }));
    expect(ready.destroyed).toBe(true);
    expect(screen.getByText(/MP3, WAV, OGG, AAC, M4A/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove audio' })).toBeDisabled();
  });

  it('shows the full file name in a tooltip', () => {
    const { player } = setup();
    const longName = 'a'.repeat(120) + '.mp3';
    choose(longName, 'audio/mpeg');
    act(() => player().emitReady(65));
    const name = document.querySelector('.audio-track__name');
    expect(name).toHaveTextContent(longName);
    expect(name).toHaveAttribute('title', longName);
  });
});
