import type { Project } from '../state/types.ts';

export interface HealthResponse {
  status: 'ok';
}

export async function fetchHealth(signal?: AbortSignal): Promise<HealthResponse> {
  const response = await fetch('/api/health', { signal });
  if (!response.ok) {
    throw new Error(`Health check failed: ${response.status}`);
  }
  return (await response.json()) as HealthResponse;
}

export const MIDI_EXPORT_URL = '/api/export/midi';
export const MIDI_EXPORT_FILENAME = 'arrangement.mid';

export type MidiExportErrorKind = 'invalid' | 'server' | 'network';

export class MidiExportError extends Error {
  readonly kind: MidiExportErrorKind;
  readonly status: number | null;

  constructor(kind: MidiExportErrorKind, status: number | null) {
    super(`MIDI export failed: ${kind}${status === null ? '' : ` (${status})`}`);
    this.name = 'MidiExportError';
    this.kind = kind;
    this.status = status;
  }
}

const UNPROCESSABLE_ENTITY = 422;

/** Sends the project to the backend and returns the Standard MIDI File it builds. */
export async function exportMidi(project: Project, signal?: AbortSignal): Promise<Blob> {
  let response: Response;
  try {
    response = await fetch(MIDI_EXPORT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(project),
      signal,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new MidiExportError('network', null);
  }
  if (response.ok) return await response.blob();
  if (response.status === UNPROCESSABLE_ENTITY) {
    throw new MidiExportError('invalid', response.status);
  }
  throw new MidiExportError('server', response.status);
}
