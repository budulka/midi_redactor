import type { Project } from '../state/types.ts';
import { parseImportResult } from './importResult.ts';

const project: Project = {
  bpm: 120,
  timeSignature: { numerator: 3, denominator: 4 },
  mediaOffset: 0,
  notes: [
    { id: 'n1', pitch: 21, start: 0, duration: 0.25, velocity: 64 },
    { id: 'n2', pitch: 60, start: 0.5, duration: 1.125, velocity: 100 },
    { id: 'n3', pitch: 108, start: 1.75, duration: 0.375, velocity: 127 },
  ],
  pedals: [
    { id: 'p1', type: 'sustain', start: 0, end: 1.5 },
    { id: 'p2', type: 'sostenuto', start: 0.5, end: 2.25 },
    { id: 'p3', type: 'soft', start: 1.125, end: 2 },
  ],
};

const warning = { code: 'no_notes', message: 'The file contains no notes.', count: 0 };

describe('parseImportResult', () => {
  it('returns a valid result unchanged', () => {
    const data = { project, warnings: [warning] };
    expect(parseImportResult(data)).toEqual(data);
  });

  it('rejects an invalid project', () => {
    const notes = [{ ...project.notes[0], pitch: 200 }];
    expect(() => parseImportResult({ project: { ...project, notes }, warnings: [] })).toThrow();
  });

  it('rejects malformed warnings', () => {
    expect(() => parseImportResult({ project, warnings: 'none' })).toThrow();
    expect(() => parseImportResult({ project, warnings: [{ code: 'x', message: 'y' }] })).toThrow();
  });

  it('rejects a non-object', () => {
    expect(() => parseImportResult(null)).toThrow();
  });
});
