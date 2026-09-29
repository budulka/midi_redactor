import type { Project } from '../state/types.ts';
import { parseImportResult, type MidiImportResult } from './importResult.ts';

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

export type { ImportWarning, MidiImportResult } from './importResult.ts';

export const MIDI_IMPORT_URL = '/api/import/midi';
/** Mirrors `MAX_MIDI_UPLOAD_BYTES` of the backend. */
export const MAX_MIDI_IMPORT_BYTES = 4 * 1024 * 1024;

export type MidiImportErrorKind = 'too_large' | 'invalid' | 'response' | 'server' | 'network';

export class MidiImportError extends Error {
  readonly kind: MidiImportErrorKind;
  readonly status: number | null;
  /** The backend message for an `invalid` file, when it sent one. */
  readonly detail: string | null;

  constructor(kind: MidiImportErrorKind, status: number | null, detail: string | null = null) {
    super(`MIDI import failed: ${kind}${status === null ? '' : ` (${status})`}`);
    this.name = 'MidiImportError';
    this.kind = kind;
    this.status = status;
    this.detail = detail;
  }
}

const PAYLOAD_TOO_LARGE = 413;

async function readErrorDetail(response: Response): Promise<string | null> {
  try {
    const body: unknown = await response.json();
    if (typeof body !== 'object' || body === null || !('detail' in body)) return null;
    const detail: unknown = body.detail;
    if (typeof detail !== 'object' || detail === null || !('message' in detail)) return null;
    return typeof detail.message === 'string' ? detail.message : null;
  } catch {
    return null;
  }
}

/** Sends a Standard MIDI File to the backend and returns the project parsed from it. */
export async function importMidi(file: Blob, signal?: AbortSignal): Promise<MidiImportResult> {
  if (file.size > MAX_MIDI_IMPORT_BYTES) throw new MidiImportError('too_large', null);
  let response: Response;
  try {
    response = await fetch(MIDI_IMPORT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'audio/midi' },
      body: file,
      signal,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new MidiImportError('network', null);
  }
  if (response.status === PAYLOAD_TOO_LARGE) {
    throw new MidiImportError('too_large', response.status);
  }
  if (response.status === UNPROCESSABLE_ENTITY) {
    throw new MidiImportError('invalid', response.status, await readErrorDetail(response));
  }
  if (!response.ok) throw new MidiImportError('server', response.status);
  try {
    return parseImportResult(await response.json());
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new MidiImportError('response', response.status);
  }
}
