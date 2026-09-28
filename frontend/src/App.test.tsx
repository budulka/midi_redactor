import { render, screen, within } from '@testing-library/react';
import App from './App.tsx';
import { loadPianoEngine } from './audio/loadEngine.ts';
import { createWaveSurferPlayer } from './audio/waveSurferPlayer.ts';

vi.mock('./audio/loadEngine.ts', () => ({ loadPianoEngine: vi.fn() }));
vi.mock('./audio/waveSurferPlayer.ts', () => ({ createWaveSurferPlayer: vi.fn() }));

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
    expect(playback.getByRole('button', { name: 'Play audio' })).toBeDisabled();
    expect(playback.getByRole('combobox', { name: 'Audio speed' })).toBeInTheDocument();
    expect(createWaveSurferPlayer).not.toHaveBeenCalled();
    expect(await screen.findByText('backend: online')).toBeInTheDocument();
  });
});
