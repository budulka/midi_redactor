import type { Project } from '../state/types.ts';
import {
  exportMidi,
  importMidi,
  MAX_MIDI_IMPORT_BYTES,
  MidiExportError,
  MidiImportError,
} from './client.ts';

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

describe('importMidi', () => {
  const file = new Blob(['MThd'], { type: 'audio/midi' });
  const validResult = {
    project,
    warnings: [{ code: 'tempo_changes', message: 'The file has 1 tempo change(s).', count: 1 }],
  };

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('posts the file and returns the parsed result', async () => {
    const fetchMock = stubFetch(async () => ({
      ok: true,
      status: 200,
      json: async () => validResult,
    }));

    await expect(importMidi(file)).resolves.toEqual(validResult);
    expect(fetchMock).toHaveBeenCalledWith('/api/import/midi', {
      method: 'POST',
      headers: { 'Content-Type': 'audio/midi' },
      body: file,
      signal: undefined,
    });
  });

  it('rejects a too large file without a request', async () => {
    const fetchMock = stubFetch(async () => ({ ok: true, status: 200 }));
    const large = new Blob([new Uint8Array(MAX_MIDI_IMPORT_BYTES + 1)]);

    const error = await captureError(importMidi(large));

    expect(MAX_MIDI_IMPORT_BYTES).toBe(4194304);
    expect(error).toBeInstanceOf(MidiImportError);
    expect(error).toMatchObject({ kind: 'too_large', status: null });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports too large for 413', async () => {
    stubFetch(async () => ({ ok: false, status: 413 }));

    await expect(importMidi(file)).rejects.toMatchObject({ kind: 'too_large', status: 413 });
  });

  it('reports an invalid file with the backend message for 422', async () => {
    stubFetch(async () => ({
      ok: false,
      status: 422,
      json: async () => ({
        detail: { code: 'invalid_file', message: 'The file is not a valid MIDI file.' },
      }),
    }));

    const error = await captureError(importMidi(file));

    expect(error).toBeInstanceOf(MidiImportError);
    expect(error).toMatchObject({
      kind: 'invalid',
      status: 422,
      detail: 'The file is not a valid MIDI file.',
    });
  });

  it('reports an invalid file without a message when the 422 body is unreadable', async () => {
    stubFetch(async () => ({
      ok: false,
      status: 422,
      json: async () => {
        throw new SyntaxError('bad json');
      },
    }));

    await expect(importMidi(file)).rejects.toMatchObject({ kind: 'invalid', detail: null });
  });

  it('reports an invalid file without a message when the 422 body has another shape', async () => {
    for (const body of [null, { detail: 'text' }, { detail: { message: 5 } }]) {
      stubFetch(async () => ({ ok: false, status: 422, json: async () => body }));

      await expect(importMidi(file)).rejects.toMatchObject({ kind: 'invalid', detail: null });
    }
  });

  it('reports a server error for other statuses', async () => {
    stubFetch(async () => ({ ok: false, status: 500 }));

    await expect(importMidi(file)).rejects.toMatchObject({ kind: 'server', status: 500 });
  });

  it('reports a network error when fetch fails', async () => {
    stubFetch(async () => {
      throw new TypeError('Failed to fetch');
    });

    await expect(importMidi(file)).rejects.toMatchObject({ kind: 'network', status: null });
  });

  it('rethrows the abort error when the request is cancelled', async () => {
    const abortError = new DOMException('aborted', 'AbortError');
    stubFetch(async () => {
      throw abortError;
    });
    const controller = new AbortController();
    controller.abort();

    const error = await captureError(importMidi(file, controller.signal));

    expect(error).toBe(abortError);
    expect(error).not.toBeInstanceOf(MidiImportError);
  });

  it('reports an unexpected response for an invalid project', async () => {
    const notes = [{ ...project.notes[0], pitch: 200 }];
    stubFetch(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ project: { ...project, notes }, warnings: [] }),
    }));

    await expect(importMidi(file)).rejects.toMatchObject({ kind: 'response', status: 200 });
  });

  it('reports an unexpected response when the body is not JSON', async () => {
    stubFetch(async () => ({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError('bad json');
      },
    }));

    await expect(importMidi(file)).rejects.toMatchObject({ kind: 'response', status: 200 });
  });
});
