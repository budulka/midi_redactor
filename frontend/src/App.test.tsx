import { render, screen, within } from '@testing-library/react';
import App from './App.tsx';

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
    expect(
      within(screen.getByRole('banner', { name: 'Transport' })).getByText('120 BPM'),
    ).toBeInTheDocument();
    expect(await screen.findByText('backend: online')).toBeInTheDocument();
  });
});
