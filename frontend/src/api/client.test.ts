import type { Project } from '../state/types.ts';
import { exportMidi, MidiExportError } from './client.ts';

const project: Project = {
  bpm: 100,
  timeSignature: { numerator: 3, denominator: 4 },
  notes: [{ id: 'n1', pitch: 60, start: 0, duration: 0.5, velocity: 90 }],
  pedals: [{ id: 'p1', type: 'sustain', start: 0, end: 1 }],
};

function stubFetch(implementation: () => Promise<unknown>) {
  const fetchMock = vi.fn(implementation);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

async function captureError(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('expected the promise to reject');
}

describe('exportMidi', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('posts the project and returns the MIDI blob', async () => {
    const blob = new Blob(['MThd'], { type: 'audio/midi' });
    const fetchMock = stubFetch(async () => ({ ok: true, status: 200, blob: async () => blob }));

    await expect(exportMidi(project)).resolves.toBe(blob);
    expect(fetchMock).toHaveBeenCalledWith('/api/export/midi', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(project),
      signal: undefined,
    });
  });

  it('reports an invalid project for 422', async () => {
    stubFetch(async () => ({ ok: false, status: 422 }));

    const error = await captureError(exportMidi(project));

    expect(error).toBeInstanceOf(MidiExportError);
    expect(error).toMatchObject({ kind: 'invalid', status: 422 });
  });

  it('reports a server error for other statuses', async () => {
    stubFetch(async () => ({ ok: false, status: 503 }));

    const error = await captureError(exportMidi(project));

    expect(error).toBeInstanceOf(MidiExportError);
    expect(error).toMatchObject({ kind: 'server', status: 503 });
  });

  it('reports a network error when fetch fails', async () => {
    stubFetch(async () => {
      throw new TypeError('Failed to fetch');
    });

    const error = await captureError(exportMidi(project));

    expect(error).toBeInstanceOf(MidiExportError);
    expect(error).toMatchObject({ kind: 'network', status: null });
  });

  it('rethrows the abort error when the request is cancelled', async () => {
    const abortError = new DOMException('aborted', 'AbortError');
    stubFetch(async () => {
      throw abortError;
    });
    const controller = new AbortController();
    controller.abort();

    const error = await captureError(exportMidi(project, controller.signal));

    expect(error).toBe(abortError);
    expect(error).not.toBeInstanceOf(MidiExportError);
  });
});
