import { parseProject } from '../state/validation.ts';
import type { Project } from '../state/types.ts';

export interface ImportWarning {
  readonly code: string;
  readonly message: string;
  readonly count: number;
}

export interface MidiImportResult {
  readonly project: Project;
  readonly warnings: readonly ImportWarning[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseWarning(data: unknown, index: number): ImportWarning {
  if (
    !isRecord(data) ||
    typeof data.code !== 'string' ||
    typeof data.message !== 'string' ||
    typeof data.count !== 'number'
  ) {
    throw new Error(`warnings[${index}] must have a string code and message and a number count`);
  }
  return { code: data.code, message: data.message, count: data.count };
}

/** Parses the backend response of a MIDI import; throws `Error` for any unexpected shape. */
export function parseImportResult(data: unknown): MidiImportResult {
  if (!isRecord(data)) throw new Error('import result must be an object');
  const project = parseProject(data.project);
  if (!Array.isArray(data.warnings)) throw new Error('warnings must be an array');
  const warnings = data.warnings.map((warning: unknown, index) => parseWarning(warning, index));
  return { project, warnings };
}
