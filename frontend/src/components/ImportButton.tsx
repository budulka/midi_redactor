import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { importMidi, type ImportWarning } from '../api/client.ts';
import { replaceProject } from '../state/actions.ts';
import { useEditorDispatch } from '../state/editorContext.ts';
import { clearSelection } from '../state/editorState.ts';
import { useProject, useProjectDispatch } from '../state/projectContext.ts';
import { useTransportApi } from '../state/transportContext.ts';
import {
  countLabel,
  importConfirmMessage,
  importErrorMessage,
  importSummary,
  isProjectEmpty,
} from '../utils/midiImport.ts';
import FileLoadButton from './FileLoadButton.tsx';

interface ImportOutcome {
  readonly summary: string;
  readonly warnings: readonly ImportWarning[];
}

const MIDI_ACCEPT = '.mid,.midi,audio/midi,audio/x-midi';

/** Imports a Standard MIDI File through the backend and replaces the project (undoable). */
export default function ImportButton() {
  const project = useProject();
  const dispatch = useProjectDispatch();
  const editorDispatch = useEditorDispatch();
  const transportApi = useTransportApi();
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<ImportOutcome | null>(null);
  const projectRef = useRef(project);
  const controllerRef = useRef<AbortController | null>(null);
  /** True while a request is pending; guards against a second file chosen meanwhile. */
  const busyRef = useRef(false);

  useLayoutEffect(() => {
    projectRef.current = project;
  });

  useEffect(() => () => controllerRef.current?.abort(), []);

  const onFile = async (file: File) => {
    if (busyRef.current) return;
    busyRef.current = true;
    const controller = new AbortController();
    controllerRef.current = controller;
    setImporting(true);
    setError(null);
    setOutcome(null);
    try {
      const result = await importMidi(file, controller.signal);
      if (controller.signal.aborted) return;
      const current = projectRef.current;
      if (
        !isProjectEmpty(current) &&
        !window.confirm(importConfirmMessage(file.name, current, result.project))
      ) {
        return;
      }
      transportApi.stop();
      editorDispatch(clearSelection());
      // A MIDI file knows nothing about the media: the loaded media keeps its bar 1.
      dispatch(replaceProject({ ...result.project, mediaOffset: current.mediaOffset }));
      setOutcome({ summary: importSummary(file.name, result.project), warnings: result.warnings });
    } catch (caught) {
      if (controller.signal.aborted) return;
      setError(importErrorMessage(caught));
    } finally {
      busyRef.current = false;
      if (!controller.signal.aborted) setImporting(false);
    }
  };

  return (
    <div className="import-button">
      <FileLoadButton
        text={importing ? 'Importing…' : 'Import .mid'}
        inputLabel="Import MIDI file"
        accept={MIDI_ACCEPT}
        disabled={importing}
        onFile={(file) => void onFile(file)}
      />
      {outcome !== null && (
        <>
          <span role="status" className="import-button__status" title={outcome.summary}>
            {outcome.summary}
          </span>
          {outcome.warnings.length > 0 && (
            <details className="import-button__warnings">
              <summary>{countLabel(outcome.warnings.length, 'warning')}</summary>
              <ul>
                {outcome.warnings.map((warning) => (
                  <li key={warning.code}>{warning.message}</li>
                ))}
              </ul>
            </details>
          )}
          <button
            type="button"
            aria-label="Dismiss import message"
            onClick={() => setOutcome(null)}
          >
            ×
          </button>
        </>
      )}
      {error !== null && (
        <span role="alert" className="import-button__error">
          {error}
        </span>
      )}
    </div>
  );
}
