import { MidiImportError } from '../api/client.ts';
import type { Project } from '../state/types.ts';

/** A project without notes and pedals; BPM and time signature alone do not count. */
export function isProjectEmpty(project: Project): boolean {
  return project.notes.length === 0 && project.pedals.length === 0;
}

/** `1 note`, `2 notes`, `0 notes`. */
export function countLabel(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

function contentsLabel(project: Project): string {
  return `${countLabel(project.notes.length, 'note')}, ${countLabel(project.pedals.length, 'pedal')}`;
}

export function importConfirmMessage(
  fileName: string,
  current: Project,
  imported: Project,
): string {
  return (
    `Replace the current project (${contentsLabel(current)}) with "${fileName}" ` +
    `(${contentsLabel(imported)})? You can undo this with Ctrl+Z.`
  );
}

export function importSummary(fileName: string, imported: Project): string {
  const { numerator, denominator } = imported.timeSignature;
  return (
    `Imported "${fileName}": ${contentsLabel(imported)}, ${imported.bpm} BPM, ` +
    `${numerator}/${denominator}.`
  );
}

export function importErrorMessage(error: unknown): string {
  if (error instanceof MidiImportError) {
    switch (error.kind) {
      case 'too_large':
        return 'Could not import: the file is larger than 4 MB.';
      case 'invalid':
        return `Could not import: ${error.detail ?? 'the file is not a valid MIDI file.'}`;
      case 'response':
        return 'Could not import: unexpected response from the backend.';
      case 'server':
        return `Could not import: server error (${error.status}).`;
      case 'network':
        break;
    }
  }
  return 'Could not import: the backend is unavailable.';
}
