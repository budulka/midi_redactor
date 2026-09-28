import {
  ALLOWED_DENOMINATORS,
  MAX_BPM,
  MAX_NUMERATOR,
  MAX_PITCH,
  MAX_VELOCITY,
  MIN_BPM,
  MIN_NOTE_DURATION,
  MIN_NUMERATOR,
  MIN_PEDAL_DURATION,
  MIN_PITCH,
  MIN_VELOCITY,
  PEDAL_TYPES,
} from './constants.ts';
import type { Note, PedalEvent, PedalType, Project, TimeSignature } from './types.ts';

export interface ValidationIssue {
  /** Location of the problem, e.g. `notes[2].pitch`, `pedals[0].end`, `bpm`. */
  readonly path: string;
  readonly message: string;
}

export class ProjectParseError extends Error {
  readonly issues: readonly ValidationIssue[];

  constructor(issues: readonly ValidationIssue[]) {
    super(
      `Invalid project: ${issues.map((issue) => `${issue.path}: ${issue.message}`).join('; ')}`,
    );
    this.name = 'ProjectParseError';
    this.issues = issues;
  }
}

function join(prefix: string, key: string): string {
  return prefix ? `${prefix}.${key}` : key;
}

function isIntegerInRange(value: number, min: number, max: number): boolean {
  return Number.isInteger(value) && value >= min && value <= max;
}

function isNonNegativeFinite(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

function isPedalType(value: unknown): value is PedalType {
  return (PEDAL_TYPES as readonly unknown[]).includes(value);
}

export function validateNote(note: Note, path = ''): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (note.id.length === 0) {
    issues.push({ path: join(path, 'id'), message: 'must be a non-empty string' });
  }
  if (!isIntegerInRange(note.pitch, MIN_PITCH, MAX_PITCH)) {
    issues.push({
      path: join(path, 'pitch'),
      message: `must be an integer from ${MIN_PITCH} to ${MAX_PITCH}`,
    });
  }
  if (!isNonNegativeFinite(note.start)) {
    issues.push({ path: join(path, 'start'), message: 'must be a finite number >= 0' });
  }
  if (!(Number.isFinite(note.duration) && note.duration >= MIN_NOTE_DURATION)) {
    issues.push({
      path: join(path, 'duration'),
      message: `must be a finite number >= ${MIN_NOTE_DURATION}`,
    });
  }
  if (!isIntegerInRange(note.velocity, MIN_VELOCITY, MAX_VELOCITY)) {
    issues.push({
      path: join(path, 'velocity'),
      message: `must be an integer from ${MIN_VELOCITY} to ${MAX_VELOCITY}`,
    });
  }
  return issues;
}

export function validatePedal(pedal: PedalEvent, path = ''): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (pedal.id.length === 0) {
    issues.push({ path: join(path, 'id'), message: 'must be a non-empty string' });
  }
  if (!isPedalType(pedal.type)) {
    issues.push({ path: join(path, 'type'), message: `must be one of ${PEDAL_TYPES.join(', ')}` });
  }
  if (!isNonNegativeFinite(pedal.start)) {
    issues.push({ path: join(path, 'start'), message: 'must be a finite number >= 0' });
  }
  if (!Number.isFinite(pedal.end)) {
    issues.push({ path: join(path, 'end'), message: 'must be a finite number' });
  } else if (pedal.end < pedal.start + MIN_PEDAL_DURATION) {
    issues.push({
      path: join(path, 'end'),
      message: `must be at least ${MIN_PEDAL_DURATION} s after start`,
    });
  }
  return issues;
}

export function validateTimeSignature(
  ts: TimeSignature,
  path = 'timeSignature',
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!isIntegerInRange(ts.numerator, MIN_NUMERATOR, MAX_NUMERATOR)) {
    issues.push({
      path: join(path, 'numerator'),
      message: `must be an integer from ${MIN_NUMERATOR} to ${MAX_NUMERATOR}`,
    });
  }
  if (!ALLOWED_DENOMINATORS.includes(ts.denominator)) {
    issues.push({
      path: join(path, 'denominator'),
      message: `must be one of ${ALLOWED_DENOMINATORS.join(', ')}`,
    });
  }
  return issues;
}

export function validateBpm(bpm: number): ValidationIssue[] {
  if (Number.isFinite(bpm) && bpm >= MIN_BPM && bpm <= MAX_BPM) return [];
  return [{ path: 'bpm', message: `must be a number from ${MIN_BPM} to ${MAX_BPM}` }];
}

function duplicateIdIssues(items: readonly { id: string }[], prefix: string): ValidationIssue[] {
  const seen = new Set<string>();
  const issues: ValidationIssue[] = [];
  items.forEach((item, index) => {
    if (seen.has(item.id)) {
      issues.push({ path: `${prefix}[${index}].id`, message: `duplicate id "${item.id}"` });
    }
    seen.add(item.id);
  });
  return issues;
}

function pedalOverlapIssues(pedals: readonly PedalEvent[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (const type of PEDAL_TYPES) {
    const ordered = pedals
      .map((pedal, index) => ({ pedal, index }))
      .filter(({ pedal }) => pedal.type === type)
      .sort((a, b) => a.pedal.start - b.pedal.start);
    for (let i = 1; i < ordered.length; i += 1) {
      const previous = ordered[i - 1];
      const current = ordered[i];
      if (current.pedal.start < previous.pedal.end) {
        issues.push({
          path: `pedals[${current.index}]`,
          message: `overlaps ${type} pedal "${previous.pedal.id}"`,
        });
      }
    }
  }
  return issues;
}

export function validateProject(project: Project): ValidationIssue[] {
  return [
    ...validateBpm(project.bpm),
    ...validateTimeSignature(project.timeSignature),
    ...project.notes.flatMap((note, index) => validateNote(note, `notes[${index}]`)),
    ...duplicateIdIssues(project.notes, 'notes'),
    ...project.pedals.flatMap((pedal, index) => validatePedal(pedal, `pedals[${index}]`)),
    ...duplicateIdIssues(project.pedals, 'pedals'),
    ...pedalOverlapIssues(project.pedals),
  ];
}

type FieldKind = 'string' | 'number' | 'object' | 'array';

function kindOf(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

/**
 * Checks that `value` is an object with exactly the given fields of the given kinds.
 * Returns the object on success, or `undefined` after recording issues.
 */
function checkShape(
  value: unknown,
  shape: Record<string, FieldKind>,
  path: string,
  issues: ValidationIssue[],
): Record<string, unknown> | undefined {
  if (kindOf(value) !== 'object') {
    issues.push({ path: path || '(root)', message: `must be an object, got ${kindOf(value)}` });
    return undefined;
  }
  const record = value as Record<string, unknown>;
  const before = issues.length;
  for (const [key, kind] of Object.entries(shape)) {
    if (!(key in record)) {
      issues.push({ path: join(path, key), message: 'is required' });
    } else if (kindOf(record[key]) !== kind) {
      issues.push({
        path: join(path, key),
        message: `must be a ${kind}, got ${kindOf(record[key])}`,
      });
    }
  }
  for (const key of Object.keys(record)) {
    if (!(key in shape)) {
      issues.push({ path: join(path, key), message: 'is not allowed' });
    }
  }
  return issues.length === before ? record : undefined;
}

const NOTE_SHAPE: Record<keyof Note, FieldKind> = {
  id: 'string',
  pitch: 'number',
  start: 'number',
  duration: 'number',
  velocity: 'number',
};

const PEDAL_SHAPE: Record<keyof PedalEvent, FieldKind> = {
  id: 'string',
  type: 'string',
  start: 'number',
  end: 'number',
};

const TIME_SIGNATURE_SHAPE: Record<keyof TimeSignature, FieldKind> = {
  numerator: 'number',
  denominator: 'number',
};

const PROJECT_SHAPE: Record<keyof Project, FieldKind> = {
  bpm: 'number',
  timeSignature: 'object',
  notes: 'array',
  pedals: 'array',
};

function parseNote(value: unknown, path: string, issues: ValidationIssue[]): Note | undefined {
  const record = checkShape(value, NOTE_SHAPE, path, issues);
  if (!record) return undefined;
  return {
    id: record.id as string,
    pitch: record.pitch as number,
    start: record.start as number,
    duration: record.duration as number,
    velocity: record.velocity as number,
  };
}

function parsePedal(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): PedalEvent | undefined {
  const record = checkShape(value, PEDAL_SHAPE, path, issues);
  if (!record) return undefined;
  if (!isPedalType(record.type)) {
    issues.push({ path: join(path, 'type'), message: `must be one of ${PEDAL_TYPES.join(', ')}` });
    return undefined;
  }
  return {
    id: record.id as string,
    type: record.type,
    start: record.start as number,
    end: record.end as number,
  };
}

/**
 * Parses untrusted JSON data into a valid `Project`.
 * Throws `ProjectParseError` listing every structural or validation problem.
 */
export function parseProject(data: unknown): Project {
  const issues: ValidationIssue[] = [];
  const record = checkShape(data, PROJECT_SHAPE, '', issues);
  if (!record) throw new ProjectParseError(issues);

  const timeSignature = checkShape(
    record.timeSignature,
    TIME_SIGNATURE_SHAPE,
    'timeSignature',
    issues,
  );
  const notes = (record.notes as unknown[]).map((note, index) =>
    parseNote(note, `notes[${index}]`, issues),
  );
  const pedals = (record.pedals as unknown[]).map((pedal, index) =>
    parsePedal(pedal, `pedals[${index}]`, issues),
  );
  if (issues.length > 0 || !timeSignature) throw new ProjectParseError(issues);

  const project: Project = {
    bpm: record.bpm as number,
    timeSignature: {
      numerator: timeSignature.numerator as number,
      denominator: timeSignature.denominator as number,
    },
    notes: notes as Note[],
    pedals: pedals as PedalEvent[],
  };
  const validationIssues = validateProject(project);
  if (validationIssues.length > 0) throw new ProjectParseError(validationIssues);
  return project;
}
