import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { addNotes, setBpm } from '../state/actions.ts';
import { useProject } from '../state/projectContext.ts';
import CommitNumberInput from './CommitNumberInput.tsx';
import { useProjectDispatch } from '../state/projectContext.ts';
import ProjectProvider from '../state/ProjectProvider.tsx';
import type { Project } from '../state/types.ts';
import { downloadBlob } from '../utils/download.ts';
import ExportButton from './ExportButton.tsx';

vi.mock('../utils/download.ts', () => ({ downloadBlob: vi.fn() }));

const initialProject: Project = {
  bpm: 100,
  timeSignature: { numerator: 3, denominator: 4 },
  mediaOffset: 0,
  mediaCuts: [],
  notes: [{ id: 'n1', pitch: 60, start: 0, duration: 0.5, velocity: 90 }],
  pedals: [{ id: 'p1', type: 'sustain', start: 0, end: 1 }],
};

interface FetchCall {
  url: string;
  init: RequestInit;
  resolve: (response: unknown) => void;
  reject: (error: unknown) => void;
}

function stubFetch() {
  const calls: FetchCall[] = [];
  const fetchMock = vi.fn(
    (url: string, init: RequestInit) =>
      new Promise((resolve, reject) => {
        calls.push({ url, init, resolve, reject });
      }),
  );
  vi.stubGlobal('fetch', fetchMock);
  return { fetchMock, calls };
}

function AddNoteButton() {
  const dispatch = useProjectDispatch();
  return (
    <button
      type="button"
      onClick={() =>
        dispatch(addNotes([{ id: 'n2', pitch: 64, start: 1, duration: 0.5, velocity: 80 }]))
      }
    >
      Add note
    </button>
  );
}

function renderButton() {
  return render(
    <ProjectProvider initialProject={initialProject}>
      <ExportButton />
      <AddNoteButton />
    </ProjectProvider>,
  );
}

const midiBlob = new Blob(['MThd'], { type: 'audio/midi' });
const okResponse = { ok: true, status: 200, blob: async () => midiBlob };

const exportButton = () => screen.getByRole('button', { name: /Export \.mid|Exporting…/ });

async function settle(call: FetchCall, response: unknown) {
  await act(async () => {
    call.resolve(response);
  });
}

describe('ExportButton', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.mocked(downloadBlob).mockClear();
    vi.restoreAllMocks();
  });

  it('starts enabled without an alert', () => {
    stubFetch();
    renderButton();

    expect(screen.getByRole('button', { name: 'Export .mid' })).toBeEnabled();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('posts the project and downloads the file', async () => {
    const { fetchMock, calls } = stubFetch();
    renderButton();

    fireEvent.click(exportButton());

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(calls[0].url).toBe('/api/export/midi');
    expect(JSON.parse(calls[0].init.body as string)).toEqual(initialProject);
    await settle(calls[0], okResponse);
    expect(downloadBlob).toHaveBeenCalledWith(midiBlob, 'arrangement.mid');
  });

  it('is disabled while the request is pending', async () => {
    const { fetchMock, calls } = stubFetch();
    renderButton();

    fireEvent.click(exportButton());

    expect(screen.getByRole('button', { name: 'Exporting…' })).toBeDisabled();
    fireEvent.click(exportButton());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await settle(calls[0], okResponse);
    expect(screen.getByRole('button', { name: 'Export .mid' })).toBeEnabled();
  });

  it('exports the current project state', async () => {
    const { calls } = stubFetch();
    renderButton();

    fireEvent.click(screen.getByRole('button', { name: 'Add note' }));
    fireEvent.click(exportButton());

    const sent = JSON.parse(calls[0].init.body as string) as Project;
    expect(sent.notes).toHaveLength(2);
    await settle(calls[0], okResponse);
  });

  it.each([
    [{ ok: false, status: 422 }, 'Could not export: the project is invalid.'],
    [{ ok: false, status: 500 }, 'Could not export: server error (500).'],
  ])('shows an error for a failed response', async (response, message) => {
    const { calls } = stubFetch();
    renderButton();

    fireEvent.click(exportButton());
    await settle(calls[0], response);

    expect(screen.getByRole('alert')).toHaveTextContent(message);
    expect(downloadBlob).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Export .mid' })).toBeEnabled();
  });

  it('shows an error when the backend is unavailable', async () => {
    const { calls } = stubFetch();
    renderButton();

    fireEvent.click(exportButton());
    await act(async () => {
      calls[0].reject(new TypeError('Failed to fetch'));
    });

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Could not export: the backend is unavailable.',
    );
    expect(downloadBlob).not.toHaveBeenCalled();
  });

  it('clears the error on a successful retry', async () => {
    const { calls } = stubFetch();
    renderButton();

    fireEvent.click(exportButton());
    await settle(calls[0], { ok: false, status: 500 });
    expect(screen.getByRole('alert')).toBeInTheDocument();

    fireEvent.click(exportButton());
    expect(screen.queryByRole('alert')).toBeNull();
    await settle(calls[1], okResponse);

    expect(screen.queryByRole('alert')).toBeNull();
    expect(downloadBlob).toHaveBeenCalledWith(midiBlob, 'arrangement.mid');
  });

  it('aborts the request on unmount without downloading', async () => {
    const consoleError = vi.spyOn(console, 'error');
    const { calls } = stubFetch();
    const { unmount } = renderButton();

    fireEvent.click(exportButton());
    unmount();

    const signal = calls[0].init.signal as AbortSignal;
    expect(signal.aborted).toBe(true);
    await act(async () => {
      calls[0].reject(new DOMException('aborted', 'AbortError'));
    });
    expect(downloadBlob).not.toHaveBeenCalled();
    expect(consoleError).not.toHaveBeenCalled();
  });

  const ctrlS = { key: 's', code: 'KeyS', ctrlKey: true };

  it('exports with Ctrl+S', async () => {
    const { fetchMock, calls } = stubFetch();
    renderButton();

    expect(fireEvent.keyDown(document.body, ctrlS)).toBe(false);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(calls[0].url).toBe('/api/export/midi');
    await settle(calls[0], okResponse);
    expect(downloadBlob).toHaveBeenCalledWith(midiBlob, 'arrangement.mid');
  });

  it('ignores Ctrl+S while the request is pending', async () => {
    const { fetchMock, calls } = stubFetch();
    renderButton();

    fireEvent.keyDown(document.body, ctrlS);
    fireEvent.keyDown(document.body, ctrlS);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    await settle(calls[0], okResponse);
  });

  function TempoField() {
    const { bpm } = useProject();
    const dispatch = useProjectDispatch();
    return (
      <CommitNumberInput label="Tempo" value={bpm} onCommit={(value) => dispatch(setBpm(value))} />
    );
  }

  it('exports with Ctrl+S from a number field, committing its value first', async () => {
    const { fetchMock, calls } = stubFetch();
    render(
      <ProjectProvider initialProject={initialProject}>
        <ExportButton />
        <TempoField />
      </ProjectProvider>,
    );
    const field = screen.getByLabelText('Tempo');
    field.focus();
    fireEvent.change(field, { target: { value: '90' } });

    expect(fireEvent.keyDown(field, ctrlS)).toBe(false);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect((JSON.parse(calls[0].init.body as string) as Project).bpm).toBe(90);
    await settle(calls[0], okResponse);
  });

  it('shows the shortcut in the title', () => {
    stubFetch();
    renderButton();
    const button = screen.getByRole('button', { name: 'Export .mid' });
    expect(button).toHaveAttribute('title', 'Export .mid (Ctrl+S)');
  });
});

describe('ExportButton and the media offset', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('sends the media offset with the project', () => {
    const { calls } = stubFetch();
    render(
      <ProjectProvider initialProject={{ ...initialProject, mediaOffset: 1.25 }}>
        <ExportButton />
      </ProjectProvider>,
    );
    fireEvent.click(exportButton());
    expect(calls).toHaveLength(1);
    expect(String(calls[0].init.body)).toContain('"mediaOffset":1.25');
  });
});

describe('ExportButton and the media cuts', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('sends the media cuts with the project', () => {
    const { calls } = stubFetch();
    render(
      <ProjectProvider
        initialProject={{ ...initialProject, mediaCuts: [{ id: 'c', start: 2, end: 5 }] }}
      >
        <ExportButton />
      </ProjectProvider>,
    );
    fireEvent.click(exportButton());
    expect(calls).toHaveLength(1);
    expect(String(calls[0].init.body)).toContain('"mediaCuts":[{"id":"c","start":2,"end":5}]');
  });
});
