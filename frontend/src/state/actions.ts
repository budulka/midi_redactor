import { createId } from '../utils/id.ts';
import type { Note, NotePatch, PedalEvent, PedalPatch, Project, TimeSignature } from './types.ts';

export interface NoteChange {
  readonly id: string;
  readonly patch: NotePatch;
}

export interface PedalChange {
  readonly id: string;
  readonly patch: PedalPatch;
}

export type ProjectAction =
  | { readonly type: 'notes/add'; readonly notes: readonly Note[] }
  | { readonly type: 'notes/update'; readonly changes: readonly NoteChange[] }
  | { readonly type: 'notes/remove'; readonly ids: readonly string[] }
  | { readonly type: 'pedals/add'; readonly pedals: readonly PedalEvent[] }
  | { readonly type: 'pedals/update'; readonly changes: readonly PedalChange[] }
  | { readonly type: 'pedals/remove'; readonly ids: readonly string[] }
  | { readonly type: 'project/setBpm'; readonly bpm: number }
  | { readonly type: 'project/setTimeSignature'; readonly timeSignature: TimeSignature }
  | { readonly type: 'project/load'; readonly project: Project }
  | { readonly type: 'project/replace'; readonly project: Project };

export function addNote(input: Omit<Note, 'id'>): ProjectAction {
  return { type: 'notes/add', notes: [{ ...input, id: createId() }] };
}

export function addNotes(notes: readonly Note[]): ProjectAction {
  return { type: 'notes/add', notes };
}

export function updateNote(id: string, patch: NotePatch): ProjectAction {
  return { type: 'notes/update', changes: [{ id, patch }] };
}

export function updateNotes(changes: readonly NoteChange[]): ProjectAction {
  return { type: 'notes/update', changes };
}

export function removeNotes(ids: readonly string[]): ProjectAction {
  return { type: 'notes/remove', ids };
}

export function addPedal(input: Omit<PedalEvent, 'id'>): ProjectAction {
  return { type: 'pedals/add', pedals: [{ ...input, id: createId() }] };
}

export function addPedals(pedals: readonly PedalEvent[]): ProjectAction {
  return { type: 'pedals/add', pedals };
}

export function updatePedal(id: string, patch: PedalPatch): ProjectAction {
  return { type: 'pedals/update', changes: [{ id, patch }] };
}

export function updatePedals(changes: readonly PedalChange[]): ProjectAction {
  return { type: 'pedals/update', changes };
}

export function removePedals(ids: readonly string[]): ProjectAction {
  return { type: 'pedals/remove', ids };
}

export function setBpm(bpm: number): ProjectAction {
  return { type: 'project/setBpm', bpm };
}

export function setTimeSignature(timeSignature: TimeSignature): ProjectAction {
  return { type: 'project/setTimeSignature', timeSignature };
}

export function loadProject(project: Project): ProjectAction {
  return { type: 'project/load', project };
}

/** Replaces the whole project as one undoable step (unlike `loadProject`, keeps the history). */
export function replaceProject(project: Project): ProjectAction {
  return { type: 'project/replace', project };
}
