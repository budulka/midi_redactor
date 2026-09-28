import { render, screen } from '@testing-library/react';
import BackendStatus from './BackendStatus.tsx';

describe('BackendStatus', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows online when the health check succeeds', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: 'ok' }) });
    vi.stubGlobal('fetch', fetchMock);

    render(<BackendStatus />);

    expect(screen.getByRole('status')).toHaveTextContent('backend: checking…');
    expect(await screen.findByText('backend: online')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/health', expect.anything());
  });

  it('shows offline when the backend responds with an error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));

    render(<BackendStatus />);

    expect(await screen.findByText('backend: offline')).toBeInTheDocument();
  });

  it('shows offline when the request fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    render(<BackendStatus />);

    expect(await screen.findByText('backend: offline')).toBeInTheDocument();
  });
});
