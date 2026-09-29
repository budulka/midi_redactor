import { useEffect, useRef, useState } from 'react';
import { exportMidi, MIDI_EXPORT_FILENAME, MidiExportError } from '../api/client.ts';
import { useProject } from '../state/projectContext.ts';
import { downloadBlob } from '../utils/download.ts';

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

  useEffect(() => () => controllerRef.current?.abort(), []);

  const handleClick = async () => {
    const controller = new AbortController();
    controllerRef.current = controller;
    setExporting(true);
    setError(null);
    try {
      const blob = await exportMidi(project, controller.signal);
      if (controller.signal.aborted) return;
      downloadBlob(blob, MIDI_EXPORT_FILENAME);
    } catch (caught) {
      if (controller.signal.aborted) return;
      setError(errorMessage(caught));
    }
    setExporting(false);
  };

  const label = exporting ? 'Exporting…' : 'Export .mid';
  return (
    <div className="export-button">
      <button
        type="button"
        aria-label={label}
        disabled={exporting}
        onClick={() => void handleClick()}
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
