import type { NoteChange, PedalChange, ProjectAction } from './actions.ts';
import { clampBpm, normalizeNote, normalizePedal } from './normalize.ts';
import { pedalsOverlap } from '../utils/pedalIntervals.ts';
import type { Note, PedalEvent, Project } from './types.ts';
import { validateTimeSignature } from './validation.ts';

function isFiniteNote(note: Note): boolean {
  return [note.pitch, note.start, note.duration, note.velocity].every(Number.isFinite);
}

function isFinitePedal(pedal: PedalEvent): boolean {
  return Number.isFinite(pedal.start) && Number.isFinite(pedal.end);
}

function sameNote(a: Note, b: Note): boolean {
  return (
    a.pitch === b.pitch &&
    a.start === b.start &&
    a.duration === b.duration &&
    a.velocity === b.velocity
  );
}

function samePedal(a: PedalEvent, b: PedalEvent): boolean {
  return a.type === b.type && a.start === b.start && a.end === b.end;
}

interface Item {
  readonly id: string;
}

/**
 * Appends items with new ids. Items with a duplicate id or a non-finite value are dropped, as
 * are items rejected by `canAdd`, which receives the normalized item and the current list
 * (existing items plus those already accepted in this call).
 * Returns the original array when nothing was added.
 */
function addItems<T extends Item>(
  items: readonly T[],
  added: readonly T[],
  isFiniteItem: (item: T) => boolean,
  normalize: (item: T) => T,
  canAdd?: (item: T, current: readonly T[]) => boolean,
): readonly T[] {
  const ids = new Set(items.map((item) => item.id));
  const current: T[] = [...items];
  let acceptedCount = 0;
  for (const item of added) {
    if (ids.has(item.id) || !isFiniteItem(item)) continue;
    const normalized = normalize(item);
    if (canAdd !== undefined && !canAdd(normalized, current)) continue;
    ids.add(item.id);
    current.push(normalized);
    acceptedCount += 1;
  }
  return acceptedCount === 0 ? items : current;
}

function fitsAmongPedals(pedal: PedalEvent, current: readonly PedalEvent[]): boolean {
  return !current.some((other) => pedalsOverlap(pedal, other));
}

/** True when a pedal changed by an update overlaps another pedal of its type. */
function hasChangedOverlap(before: readonly PedalEvent[], after: readonly PedalEvent[]): boolean {
  return after.some(
    (pedal, index) =>
      pedal !== before[index] &&
      after.some((other) => other.id !== pedal.id && pedalsOverlap(pedal, other)),
  );
}

/**
 * Applies patches by id. Unknown ids and patches producing non-finite values are ignored.
 * Returns the original array when no item changed; unchanged items keep their identity.
 */
function updateItems<T extends Item, P>(
  items: readonly T[],
  changes: readonly { readonly id: string; readonly patch: P }[],
  isFiniteItem: (item: T) => boolean,
  normalize: (item: T) => T,
  same: (a: T, b: T) => boolean,
): readonly T[] {
  const patches = new Map<string, P[]>();
  for (const change of changes) {
    patches.set(change.id, [...(patches.get(change.id) ?? []), change.patch]);
  }
  let changed = false;
  const next = items.map((item) => {
    let current = item;
    for (const patch of patches.get(item.id) ?? []) {
      const candidate: T = { ...current, ...patch, id: item.id };
      if (isFiniteItem(candidate)) current = normalize(candidate);
    }
    if (current === item || same(current, item)) return item;
    changed = true;
    return current;
  });
  return changed ? next : items;
}

function removeItems<T extends Item>(items: readonly T[], ids: readonly string[]): readonly T[] {
  const removed = new Set(ids);
  const next = items.filter((item) => !removed.has(item.id));
  return next.length === items.length ? items : next;
}

function withNotes(state: Project, notes: readonly Note[]): Project {
  return notes === state.notes ? state : { ...state, notes };
}

function withPedals(state: Project, pedals: readonly PedalEvent[]): Project {
  return pedals === state.pedals ? state : { ...state, pedals };
}

function assertNever(action: never): never {
  throw new Error(`Unknown project action: ${JSON.stringify(action)}`);
}

/**
 * Pure reducer for the project. An action that changes nothing returns the same state object.
 */
export function projectReducer(state: Project, action: ProjectAction): Project {
  switch (action.type) {
    case 'notes/add':
      return withNotes(state, addItems(state.notes, action.notes, isFiniteNote, normalizeNote));
    case 'notes/update':
      return withNotes(
        state,
        updateItems<Note, NoteChange['patch']>(
          state.notes,
          action.changes,
          isFiniteNote,
          normalizeNote,
          sameNote,
        ),
      );
    case 'notes/remove':
      return withNotes(state, removeItems(state.notes, action.ids));
    case 'pedals/add':
      return withPedals(
        state,
        addItems(state.pedals, action.pedals, isFinitePedal, normalizePedal, fitsAmongPedals),
      );
    case 'pedals/update': {
      const pedals = updateItems<PedalEvent, PedalChange['patch']>(
        state.pedals,
        action.changes,
        isFinitePedal,
        normalizePedal,
        samePedal,
      );
      // The whole action is rejected when the final state would contain overlapping pedals.
      if (hasChangedOverlap(state.pedals, pedals)) return state;
      return withPedals(state, pedals);
    }
    case 'pedals/remove':
      return withPedals(state, removeItems(state.pedals, action.ids));
    case 'project/setBpm': {
      if (!Number.isFinite(action.bpm)) return state;
      const bpm = clampBpm(action.bpm);
      return bpm === state.bpm ? state : { ...state, bpm };
    }
    case 'project/setTimeSignature': {
      const { numerator, denominator } = action.timeSignature;
      if (validateTimeSignature(action.timeSignature).length > 0) return state;
      if (
        numerator === state.timeSignature.numerator &&
        denominator === state.timeSignature.denominator
      ) {
        return state;
      }
      return { ...state, timeSignature: { numerator, denominator } };
    }
    case 'project/load':
      return action.project;
    case 'project/replace':
      return action.project === state ? state : action.project;
    default:
      return assertNever(action);
  }
}
