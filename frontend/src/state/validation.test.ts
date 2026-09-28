import sample from '../../../backend/tests/fixtures/sample_project.json';
import type { Note, PedalEvent, Project } from './types.ts';
import {
  ProjectParseError,
  parseProject,
  validateNote,
  validatePedal,
  validateProject,
  validateTimeSignature,
} from './validation.ts';

const note: Note = { id: 'n1', pitch: 60, start: 0.5, duration: 0.25, velocity: 100 };
const pedal: PedalEvent = { id: 'p1', type: 'sustain', start: 0, end: 1.5 };
const project: Project = {
  bpm: 120,
  timeSignature: { numerator: 4, denominator: 4 },
  notes: [note],
  pedals: [pedal],
};

function paths(issues: readonly { path: string }[]): string[] {
  return issues.map((issue) => issue.path);
}

function expectParseError(data: unknown): ProjectParseError {
  try {
    parseProject(data);
  } catch (error) {
    expect(error).toBeInstanceOf(ProjectParseError);
    const parseError = error as ProjectParseError;
    expect(parseError.issues.length).toBeGreaterThan(0);
    return parseError;
  }
  throw new Error('parseProject did not throw');
}

describe('valid data', () => {
  it('reports no issues', () => {
    expect(validateNote(note)).toEqual([]);
    expect(validatePedal(pedal)).toEqual([]);
    expect(validateTimeSignature({ numerator: 6, denominator: 8 })).toEqual([]);
    expect(validateProject(project)).toEqual([]);
  });

  it('accepts boundary values', () => {
    expect(validateNote({ ...note, pitch: 21, velocity: 1, duration: 0.001, start: 0 })).toEqual(
      [],
    );
    expect(validateNote({ ...note, pitch: 108, velocity: 127 })).toEqual([]);
    expect(validatePedal({ ...pedal, start: 2, end: 2 + 0.001 })).toEqual([]);
    expect(validateProject({ ...project, bpm: 20 })).toEqual([]);
    expect(validateProject({ ...project, bpm: 300 })).toEqual([]);
  });
});

describe('note violations', () => {
  it.each<[Partial<Note>, string]>([
    [{ pitch: 109 }, 'notes[0].pitch'],
    [{ pitch: 20 }, 'notes[0].pitch'],
    [{ pitch: 60.5 }, 'notes[0].pitch'],
    [{ velocity: 0 }, 'notes[0].velocity'],
    [{ velocity: 128 }, 'notes[0].velocity'],
    [{ velocity: 64.5 }, 'notes[0].velocity'],
    [{ start: -0.01 }, 'notes[0].start'],
    [{ start: Number.NaN }, 'notes[0].start'],
    [{ start: Infinity }, 'notes[0].start'],
    [{ duration: 0 }, 'notes[0].duration'],
    [{ duration: -0.1 }, 'notes[0].duration'],
    [{ duration: Infinity }, 'notes[0].duration'],
    [{ id: '' }, 'notes[0].id'],
  ])('%o -> %s', (patch, path) => {
    expect(paths(validateProject({ ...project, notes: [{ ...note, ...patch }] }))).toEqual([path]);
  });

  it('uses bare field paths without a prefix', () => {
    expect(paths(validateNote({ ...note, pitch: 109 }))).toEqual(['pitch']);
  });

  it('reports duplicate note ids on the later note', () => {
    const notes = [note, { ...note, pitch: 62 }];
    expect(paths(validateProject({ ...project, notes }))).toEqual(['notes[1].id']);
  });
});

describe('pedal violations', () => {
  it.each<[Partial<PedalEvent>, string]>([
    [{ type: 'expression' as PedalEvent['type'] }, 'pedals[0].type'],
    [{ start: -1 }, 'pedals[0].start'],
    [{ end: 0 }, 'pedals[0].end'],
    [{ start: 1, end: 0.5 }, 'pedals[0].end'],
    [{ end: Number.NaN }, 'pedals[0].end'],
    [{ id: '' }, 'pedals[0].id'],
  ])('%o -> %s', (patch, path) => {
    expect(paths(validateProject({ ...project, pedals: [{ ...pedal, ...patch }] }))).toEqual([
      path,
    ]);
  });

  it('reports duplicate pedal ids', () => {
    const pedals = [pedal, { ...pedal, type: 'soft' as const }];
    expect(paths(validateProject({ ...project, pedals }))).toEqual(['pedals[1].id']);
  });

  it('reports overlapping pedals of the same type', () => {
    const pedals: PedalEvent[] = [
      { id: 'a', type: 'sustain', start: 0, end: 2 },
      { id: 'b', type: 'sustain', start: 1, end: 3 },
    ];
    expect(paths(validateProject({ ...project, pedals }))).toEqual(['pedals[1]']);
  });

  it('checks overlaps in time order, not array order', () => {
    const pedals: PedalEvent[] = [
      { id: 'late', type: 'sostenuto', start: 1, end: 3 },
      { id: 'early', type: 'sostenuto', start: 0, end: 2 },
    ];
    expect(paths(validateProject({ ...project, pedals }))).toEqual(['pedals[0]']);
  });

  it('allows touching pedals and overlaps of different types', () => {
    const touching: PedalEvent[] = [
      { id: 'a', type: 'sustain', start: 0, end: 1 },
      { id: 'b', type: 'sustain', start: 1, end: 2 },
    ];
    const differentTypes: PedalEvent[] = [
      { id: 'a', type: 'sustain', start: 0, end: 2 },
      { id: 'b', type: 'soft', start: 1, end: 3 },
    ];
    expect(validateProject({ ...project, pedals: touching })).toEqual([]);
    expect(validateProject({ ...project, pedals: differentTypes })).toEqual([]);
  });
});

describe('project-level violations', () => {
  it.each([
    [{ bpm: 19 }, 'bpm'],
    [{ bpm: 301 }, 'bpm'],
    [{ bpm: Number.NaN }, 'bpm'],
    [{ timeSignature: { numerator: 4, denominator: 3 } }, 'timeSignature.denominator'],
    [{ timeSignature: { numerator: 0, denominator: 4 } }, 'timeSignature.numerator'],
    [{ timeSignature: { numerator: 33, denominator: 4 } }, 'timeSignature.numerator'],
  ])('%o -> %s', (patch, path) => {
    expect(paths(validateProject({ ...project, ...patch }))).toEqual([path]);
  });
});

describe('parseProject', () => {
  it('accepts the shared backend fixture unchanged (contract test)', () => {
    const parsed = parseProject(sample);
    expect(parsed).toEqual(sample);
    expect(parsed.timeSignature).toEqual({ numerator: 3, denominator: 4 });
    expect(parsed.notes).toHaveLength(3);
    expect(parsed.pedals.map((p) => p.type)).toEqual(['sustain', 'sostenuto', 'soft']);
  });

  it('round-trips through JSON serialization', () => {
    expect(parseProject(JSON.parse(JSON.stringify(sample)))).toEqual(sample);
  });

  it.each([
    ['null', null],
    ['a string', 'project'],
    ['an array', []],
  ])('rejects %s', (_label, data) => {
    expect(paths(expectParseError(data).issues)).toEqual(['(root)']);
  });

  it('rejects a project without notes', () => {
    const withoutNotes: Record<string, unknown> = { ...sample };
    delete withoutNotes.notes;
    expect(paths(expectParseError(withoutNotes).issues)).toEqual(['notes']);
  });

  it('rejects a note with a string pitch', () => {
    const data = { ...sample, notes: [{ ...sample.notes[0], pitch: '60' }] };
    expect(paths(expectParseError(data).issues)).toEqual(['notes[0].pitch']);
  });

  it('rejects unknown fields', () => {
    expect(paths(expectParseError({ ...sample, foo: 1 }).issues)).toEqual(['foo']);
    const data = { ...sample, pedals: [{ ...sample.pedals[0], level: 127 }] };
    expect(paths(expectParseError(data).issues)).toEqual(['pedals[0].level']);
  });

  it('rejects a bad time signature shape and an unknown pedal type', () => {
    const data = {
      ...sample,
      timeSignature: { numerator: 4 },
      pedals: [{ ...sample.pedals[0], type: 'expression' }],
    };
    expect(paths(expectParseError(data).issues)).toEqual([
      'timeSignature.denominator',
      'pedals[0].type',
    ]);
  });

  it('rejects structurally valid data that breaks model rules', () => {
    const data = { ...sample, notes: [{ ...sample.notes[0], pitch: 200 }] };
    expect(paths(expectParseError(data).issues)).toEqual(['notes[0].pitch']);
  });

  it('builds a readable error message', () => {
    expect(expectParseError(null).message).toContain('(root)');
  });
});
