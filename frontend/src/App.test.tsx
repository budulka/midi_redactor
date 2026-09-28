import { render, screen, within } from '@testing-library/react';
import App from './App.tsx';
import { loadPianoEngine } from './audio/loadEngine.ts';
import { createWaveSurferPlayer } from './audio/waveSurferPlayer.ts';
import { createHtmlVideoPlayer } from './media/htmlVideoPlayer.ts';

vi.mock('./audio/loadEngine.ts', () => ({ loadPianoEngine: vi.fn() }));
vi.mock('./audio/waveSurferPlayer.ts', () => ({ createWaveSurferPlayer: vi.fn() }));
vi.mock('./media/htmlVideoPlayer.ts', () => ({ createHtmlVideoPlayer: vi.fn() }));

describe('App', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: 'ok' }) }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders the transport, editor and media areas', async () => {
    render(<App />);

    expect(screen.getByRole('banner', { name: 'Transport' })).toBeInTheDocument();
    expect(screen.getByRole('main', { name: 'MIDI editor' })).toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: 'Media' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Video' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Audio track' })).toBeInTheDocument();
    const transport = within(screen.getByRole('banner', { name: 'Transport' }));
    expect(transport.getByLabelText('Tempo (quarter notes per minute)')).toHaveValue(120);
    expect(transport.getByText(/♩ =/)).toBeInTheDocument();
    expect(
      within(screen.getByRole('main', { name: 'MIDI editor' })).getByRole('region', {
        name: 'Piano roll',
      }),
    ).toBeInTheDocument();
    expect(await screen.findByText('backend: online')).toBeInTheDocument();
  });

  it('shows the playback controls without loading the piano', async () => {
    render(<App />);
    const playback = within(
      within(screen.getByRole('banner', { name: 'Transport' })).getByRole('group', {
        name: 'Playback',
      }),
    );
    expect(playback.getByRole('button', { name: 'Play' })).toBeInTheDocument();
    expect(playback.getByRole('button', { name: 'Stop' })).toBeInTheDocument();
    expect(loadPianoEngine).not.toHaveBeenCalled();
    expect(await screen.findByText('backend: online')).toBeInTheDocument();
  });

  it('shows the audio track without creating a waveform player', async () => {
    render(<App />);
    const audio = within(screen.getByRole('region', { name: 'Audio track' }));
    expect(audio.getByLabelText('Audio file')).toBeInTheDocument();
    const playback = within(audio.getByRole('group', { name: 'Audio playback' }));
    expect(playback.getByRole('status', { name: 'Audio position' })).toBeInTheDocument();
    expect(createWaveSurferPlayer).not.toHaveBeenCalled();
    expect(await screen.findByText('backend: online')).toBeInTheDocument();
  });

  it('shows the video player without creating a video element', async () => {
    render(<App />);
    const video = within(screen.getByRole('region', { name: 'Video' }));
    expect(video.getByLabelText('Video file')).toBeInTheDocument();
    const playback = within(video.getByRole('group', { name: 'Video playback' }));
    expect(playback.getByRole('status', { name: 'Video position' })).toBeInTheDocument();
    expect(playback.getByRole('checkbox', { name: 'Mute video' })).toBeInTheDocument();
    expect(video.getByRole('slider', { name: 'Seek video' })).toBeInTheDocument();
    expect(createHtmlVideoPlayer).not.toHaveBeenCalled();
    expect(await screen.findByText('backend: online')).toBeInTheDocument();
  });

  it('has one playback transport for MIDI, audio and video', async () => {
    render(<App />);
    const playback = within(screen.getByRole('group', { name: 'Playback' }));
    expect(playback.getByRole('button', { name: 'Play' })).toBeInTheDocument();
    expect(playback.getByRole('button', { name: 'Stop' })).toBeInTheDocument();
    expect(playback.getByRole('combobox', { name: 'Playback speed' })).toBeInTheDocument();
    for (const name of ['Play audio', 'Play video']) {
      expect(screen.queryByRole('button', { name })).toBeNull();
    }
    for (const name of ['Audio speed', 'Video speed']) {
      expect(screen.queryByRole('combobox', { name })).toBeNull();
    }
    const video = within(screen.getByRole('region', { name: 'Video' }));
    expect(video.getByRole('checkbox', { name: 'Mute video' })).toBeInTheDocument();
    expect(video.getByRole('slider', { name: 'Seek video' })).toBeInTheDocument();
    expect(createWaveSurferPlayer).not.toHaveBeenCalled();
    expect(createHtmlVideoPlayer).not.toHaveBeenCalled();
    expect(loadPianoEngine).not.toHaveBeenCalled();
    expect(await screen.findByText('backend: online')).toBeInTheDocument();
  });
});
