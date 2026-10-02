import { act, fireEvent, screen } from '@testing-library/react';
import { MAX_MIDI_IMPORT_BYTES } from '../api/client.ts';
import { addNotes, setMediaOffset } from '../state/actions.ts';
import { useHistoryApi, useHistoryState } from '../state/historyContext.ts';
import { useProject, useProjectDispatch } from '../state/projectContext.ts';
import { useTransportApi, useTransportState } from '../state/transportContext.ts';
import type { Note, PedalEvent, Project } from '../state/types.ts';
import { readEditor, readNotes, readPedals, renderWithProviders } from './PianoRoll/testUtils.tsx';
import ImportButton from './ImportButton.tsx';

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

function TestControls() {
  const history = useHistoryApi();
  const { canUndo, canRedo } = useHistoryState();
  const transport = useTransportApi();
  const { status } = useTransportState();
  const dispatch = useProjectDispatch();
  return (
    <>
      <button type="button" disabled={!canUndo} onClick={history.undo}>
        Undo
      </button>
      <button type="button" disabled={!canRedo} onClick={history.redo}>
        Redo
      </button>
      <button type="button" onClick={transport.togglePlay}>
        Play
      </button>
      <button
        type="button"
        onClick={() =>
          dispatch(addNotes([{ id: 'added', pitch: 50, start: 3, duration: 1, velocity: 70 }]))
        }
      >
        Add note
      </button>
      <span data-testid="transport-status">{status}</span>
    </>
  );
}

const existing: Note = { id: 'n1', pitch: 40, start: 0, duration: 1, velocity: 60 };

const imported: Project = {
  bpm: 90,
  timeSignature: { numerator: 3, denominator: 4 },
  mediaOffset: 0,
  notes: [
    { id: 'n1', pitch: 60, start: 0, duration: 0.5, velocity: 100 },
    { id: 'n2', pitch: 64, start: 0.5, duration: 0.5, velocity: 80 },
  ],
  pedals: [{ id: 'p1', type: 'sustain', start: 0, end: 1 }],
};

function okResponse(warnings: unknown[] = []) {
  return { ok: true, status: 200, json: async () => ({ project: imported, warnings }) };
}

function render(notes: readonly Note[] = [], pedals: readonly PedalEvent[] = [], editor = {}) {
  return renderWithProviders(
    <>
      <ImportButton />
      <TestControls />
    </>,
    notes,
    editor,
    pedals,
  );
}

function midiFile(): File {
  return new File([new Uint8Array([0x4d, 0x54, 0x68, 0x64])], 'song.mid', { type: 'audio/midi' });
}

function choose(file: File = midiFile()) {
  fireEvent.change(screen.getByLabelText('Import MIDI file'), { target: { files: [file] } });
}

async function settle(call: FetchCall, response: unknown) {
  await act(async () => {
    call.resolve(response);
  });
}

const SUMMARY = 'Imported "song.mid": 2 notes, 1 pedal, 90 BPM, 3/4.';

describe('ImportButton', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('imports into an empty project without confirmation', async () => {
    const { fetchMock, calls } = stubFetch();
    const confirm = vi.spyOn(window, 'confirm');
    const file = midiFile();
    const view = render();

    choose(file);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(calls[0].url).toBe('/api/import/midi');
    expect(calls[0].init.body).toBe(file);
    await settle(calls[0], okResponse());

    expect(confirm).not.toHaveBeenCalled();
    expect(readNotes(view)).toEqual(imported.notes);
    expect(readPedals(view)).toEqual(imported.pedals);
    expect(screen.getByRole('status')).toHaveTextContent(SUMMARY);
  });

  it('keeps a non-empty project when the replacement is declined', async () => {
    const { calls } = stubFetch();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const view = render([existing]);

    choose();
    await settle(calls[0], okResponse());

    expect(confirm).toHaveBeenCalledTimes(1);
    expect(confirm.mock.calls[0][0]).toContain('"song.mid"');
    expect(confirm.mock.calls[0][0]).toContain('2 notes');
    expect(readNotes(view)).toEqual([existing]);
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByText('Import .mid')).toBeInTheDocument();
  });

  it('replaces a non-empty project when confirmed', async () => {
    const { calls } = stubFetch();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const view = render([existing]);

    choose();
    await settle(calls[0], okResponse());

    expect(readNotes(view)).toEqual(imported.notes);
  });

  it('is one undo step', async () => {
    const { calls } = stubFetch();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const view = render([existing]);

    choose();
    await settle(calls[0], okResponse());
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));

    expect(readNotes(view)).toEqual([existing]);
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Redo' }));
    expect(readNotes(view)).toEqual(imported.notes);
  });

  it('clears the selection and stops playback', async () => {
    const { calls } = stubFetch();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const view = render([existing], [], { selectedNoteIds: ['n1'] });

    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    expect(await screen.findByText('playing')).toBeInTheDocument();
    choose();
    await settle(calls[0], okResponse());

    expect(readEditor(view).selectedNoteIds).toEqual([]);
    expect(screen.getByTestId('transport-status')).toHaveTextContent('stopped');
  });

  it('lists warnings and can dismiss the message', async () => {
    const { calls } = stubFetch();
    render();

    choose();
    await settle(
      calls[0],
      okResponse([
        { code: 'tempo_changes', message: 'The file has 2 tempo change(s).', count: 2 },
        { code: 'no_notes', message: 'Something else.', count: 0 },
      ]),
    );

    expect(screen.getByText('2 warnings')).toBeInTheDocument();
    const items = screen.getAllByRole('listitem');
    expect(items.map((item) => item.textContent)).toEqual([
      'The file has 2 tempo change(s).',
      'Something else.',
    ]);
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss import message' }));
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByText('2 warnings')).toBeNull();
  });

  it('shows the backend message for an invalid file', async () => {
    const { calls } = stubFetch();
    const confirm = vi.spyOn(window, 'confirm');
    const view = render([existing]);

    choose();
    await settle(calls[0], {
      ok: false,
      status: 422,
      json: async () => ({
        detail: { code: 'invalid_file', message: 'The file is not a valid MIDI file.' },
      }),
    });

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Could not import: The file is not a valid MIDI file.',
    );
    expect(readNotes(view)).toEqual([existing]);
    expect(confirm).not.toHaveBeenCalled();
  });

  it('shows an error when the backend is unavailable', async () => {
    const { calls } = stubFetch();
    render();

    choose();
    await act(async () => {
      calls[0].reject(new TypeError('Failed to fetch'));
    });

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Could not import: the backend is unavailable.',
    );
  });

  it('rejects a too large file without a request', async () => {
    const { fetchMock } = stubFetch();
    render();
    const file = midiFile();
    Object.defineProperty(file, 'size', { value: MAX_MIDI_IMPORT_BYTES + 1 });

    choose(file);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not import: the file is larger than 4 MB.',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('ignores another file while a request is pending', async () => {
    const { fetchMock, calls } = stubFetch();
    render();

    choose();
    expect(screen.getByText('Importing…')).toBeInTheDocument();
    expect(screen.getByLabelText('Import MIDI file')).toBeDisabled();
    choose();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await settle(calls[0], okResponse());
    expect(screen.getByText('Import .mid')).toBeInTheDocument();
    expect(screen.getByLabelText('Import MIDI file')).not.toBeDisabled();
  });

  it('clears the previous error when a new import starts', async () => {
    const { calls } = stubFetch();
    render();

    choose();
    await settle(calls[0], { ok: false, status: 500 });
    expect(screen.getByRole('alert')).toBeInTheDocument();

    choose();
    expect(screen.queryByRole('alert')).toBeNull();
    await settle(calls[1], okResponse());
    expect(screen.getByRole('status')).toHaveTextContent(SUMMARY);
  });

  it('asks for confirmation when the project changed during the request', async () => {
    const { calls } = stubFetch();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const view = render();

    choose();
    fireEvent.click(screen.getByRole('button', { name: 'Add note' }));
    await settle(calls[0], okResponse());

    expect(confirm).toHaveBeenCalledTimes(1);
    expect(readNotes(view).map((note) => note.id)).toEqual(['added']);
  });

  it('aborts the request on unmount', async () => {
    const consoleError = vi.spyOn(console, 'error');
    const { calls } = stubFetch();
    const view = render();

    choose();
    view.unmount();

    const signal = calls[0].init.signal as AbortSignal;
    expect(signal.aborted).toBe(true);
    await act(async () => {
      calls[0].reject(new DOMException('aborted', 'AbortError'));
    });
    expect(consoleError).not.toHaveBeenCalled();
  });
});

function OffsetProbe() {
  const { mediaOffset } = useProject();
  const dispatch = useProjectDispatch();
  return (
    <>
      <button type="button" onClick={() => dispatch(setMediaOffset(2.5))}>
        Set offset
      </button>
      <output aria-label="media offset">{mediaOffset}</output>
    </>
  );
}

describe('ImportButton and the media offset', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('keeps the current media offset of the project', async () => {
    const { calls } = stubFetch();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const view = renderWithProviders(
      <>
        <ImportButton />
        <TestControls />
        <OffsetProbe />
      </>,
      [existing],
    );
    const offset = () => screen.getByRole('status', { name: 'media offset' }).textContent;
    fireEvent.click(screen.getByRole('button', { name: 'Set offset' }));
    expect(offset()).toBe('2.5');

    choose();
    await settle(calls[0], okResponse());

    expect(offset()).toBe('2.5');
    expect(readNotes(view)).toEqual(imported.notes);

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(readNotes(view)).toEqual([existing]);
    expect(offset()).toBe('2.5');
  });
});
