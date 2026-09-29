import { MidiImportError } from '../api/client.ts';
import { createEmptyProject } from '../state/constants.ts';
import type { Note, PedalEvent, Project } from '../state/types.ts';
import {
  countLabel,
  importConfirmMessage,
  importErrorMessage,
  importSummary,
  isProjectEmpty,
} from './midiImport.ts';

function notes(count: number): Note[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `n${index}`,
    pitch: 60,
    start: index,
    duration: 0.5,
    velocity: 100,
  }));
}

function pedals(count: number): PedalEvent[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `p${index}`,
    type: 'sustain',
    start: index * 2,
    end: index * 2 + 1,
  }));
}

function project(noteCount: number, pedalCount: number, extra: Partial<Project> = {}): Project {
  return { ...createEmptyProject(), notes: notes(noteCount), pedals: pedals(pedalCount), ...extra };
}

describe('isProjectEmpty', () => {
  it('is true without notes and pedals', () => {
    expect(isProjectEmpty(createEmptyProject())).toBe(true);
    expect(isProjectEmpty({ ...createEmptyProject(), bpm: 90 })).toBe(true);
  });

  it('is false with a note or a pedal', () => {
    expect(isProjectEmpty(project(1, 0))).toBe(false);
    expect(isProjectEmpty(project(0, 1))).toBe(false);
  });
});

describe('countLabel', () => {
  it('pluralizes', () => {
    expect(countLabel(1, 'note')).toBe('1 note');
    expect(countLabel(0, 'note')).toBe('0 notes');
    expect(countLabel(2, 'pedal')).toBe('2 pedals');
  });
});

describe('messages', () => {
  it('builds the confirmation', () => {
    expect(importConfirmMessage('song.mid', project(3, 1), project(120, 4))).toBe(
      'Replace the current project (3 notes, 1 pedal) with "song.mid" (120 notes, 4 pedals)? ' +
        'You can undo this with Ctrl+Z.',
    );
  });

  it('builds the summary', () => {
    const imported = project(120, 4, { bpm: 90, timeSignature: { numerator: 3, denominator: 4 } });
    expect(importSummary('song.mid', imported)).toBe(
      'Imported "song.mid": 120 notes, 4 pedals, 90 BPM, 3/4.',
    );
  });
});

describe('importErrorMessage', () => {
  it('describes each error kind', () => {
    expect(importErrorMessage(new MidiImportError('too_large', null))).toBe(
      'Could not import: the file is larger than 4 MB.',
    );
    expect(importErrorMessage(new MidiImportError('invalid', 422, 'The file is empty.'))).toBe(
      'Could not import: The file is empty.',
    );
    expect(importErrorMessage(new MidiImportError('invalid', 422))).toBe(
      'Could not import: the file is not a valid MIDI file.',
    );
    expect(importErrorMessage(new MidiImportError('response', 200))).toBe(
      'Could not import: unexpected response from the backend.',
    );
    expect(importErrorMessage(new MidiImportError('server', 500))).toBe(
      'Could not import: server error (500).',
    );
    expect(importErrorMessage(new MidiImportError('network', null))).toBe(
      'Could not import: the backend is unavailable.',
    );
    expect(importErrorMessage(new Error('boom'))).toBe(
      'Could not import: the backend is unavailable.',
    );
  });
});
