import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { exportMidi, MIDI_EXPORT_FILENAME, MidiExportError } from '../api/client.ts';
import { useProject } from '../state/projectContext.ts';
import { downloadBlob } from '../utils/download.ts';
import { SHORTCUT_HINTS, isTextEntryTarget } from '../utils/shortcuts.ts';
import { useGlobalShortcuts } from './useGlobalShortcuts.ts';

function errorMessage(error: unknown): string {
  if (error instanceof MidiExportError) {
    if (error.kind === 'invalid') return 'Could not export: the project is invalid.';
    if (error.kind === 'server') return `Could not export: server error (${error.status}).`;
  }
  return 'Could not export: the backend is unavailable.';
}

export default function ExportButton() {
  const project = useProject();
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const projectRef = useRef(project);
  /** True while a request is pending; the keyboard shortcut works even when the button is disabled. */
  const busyRef = useRef(false);
  const timerRef = useRef<number | null>(null);

  useLayoutEffect(() => {
    projectRef.current = project;
  });

  useEffect(
    () => () => {
      controllerRef.current?.abort();
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    },
    [],
  );

  const startExport = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    const controller = new AbortController();
    controllerRef.current = controller;
    setExporting(true);
    setError(null);
    try {
      const blob = await exportMidi(projectRef.current, controller.signal);
      if (controller.signal.aborted) return;
      downloadBlob(blob, MIDI_EXPORT_FILENAME);
    } catch (caught) {
      if (controller.signal.aborted) return;
      setError(errorMessage(caught));
    } finally {
      busyRef.current = false;
    }
    setExporting(false);
  };

  useGlobalShortcuts({
    export: () => {
      const active = document.activeElement;
      if (active instanceof HTMLElement && isTextEntryTarget(active)) {
        // Blur first so that a field commits its pending value; export after React applies it.
        active.blur();
        timerRef.current = window.setTimeout(() => {
          timerRef.current = null;
          void startExport();
        }, 0);
        return;
      }
      void startExport();
    },
  });

  const label = exporting ? 'Exporting…' : 'Export .mid';
  return (
    <div className="export-button">
      <button
        type="button"
        aria-label={label}
        title={`Export .mid (${SHORTCUT_HINTS.export})`}
        disabled={exporting}
        onClick={() => void startExport()}
      >
        {label}
      </button>
      {error !== null && (
        <span role="alert" className="export-button__error">
          {error}
        </span>
      )}
    </div>
  );
}
