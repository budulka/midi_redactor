import { formatChord } from './keyChord.ts';
import { MOUSE_ACTIONS, mouseActionLabel, type MouseArea } from './mouseActions.ts';
import {
  scopeBindings,
  targetRuleNote,
  type KeyBinding,
  type ShortcutScope,
} from './shortcutRegistry.ts';

export type HelpSectionId =
  | 'page'
  | 'noteGrid'
  | 'pianoKeyboard'
  | 'pedalLane'
  | 'dragging'
  | 'timeRuler'
  | 'mediaTimeline'
  | 'cutMarks'
  | 'waveform'
  | 'splitter'
  | 'mediaFiles'
  | 'contextMenu'
  | 'numberFields'
  | 'infoWindow';

export interface HelpSectionSpec {
  readonly id: HelpSectionId;
  readonly title: string;
  /** Where the keys and mouse actions of the section work; may be ''. */
  readonly where: string;
  readonly keyScope?: ShortcutScope;
  readonly mouseArea?: MouseArea;
}

/** The sections of the Info window, in order. */
export const HELP_SECTION_SPECS: readonly HelpSectionSpec[] = [
  { id: 'page', title: 'Whole page', where: 'Works anywhere on the page.', keyScope: 'global' },
  {
    id: 'noteGrid',
    title: 'Note grid',
    where: 'Keys work when the note grid has the focus (click it or use Tab).',
    keyScope: 'noteGrid',
    mouseArea: 'noteGrid',
  },
  {
    id: 'pianoKeyboard',
    title: 'Piano keyboard',
    where: 'The keys to the left of the note grid.',
    mouseArea: 'pianoKeyboard',
  },
  {
    id: 'pedalLane',
    title: 'Pedal lane',
    where:
      'The rows under the note grid: Sustain, Sostenuto, Soft. Keys work when the lane has the focus.',
    keyScope: 'pedalLane',
    mouseArea: 'pedalLane',
  },
  {
    id: 'dragging',
    title: 'While dragging',
    where:
      'Any drag in the editor, on the media timeline, on the bar 1 marker or on the splitter. Undo and Redo do not work during a drag of notes or pedal presses.',
    keyScope: 'dragGesture',
  },
  {
    id: 'timeRuler',
    title: 'Time ruler',
    where: 'The bar numbers above the note grid.',
    mouseArea: 'timeRuler',
  },
  {
    id: 'mediaTimeline',
    title: 'Media timeline',
    where: 'The "Media" row above the ruler. Keys work when it has the focus.',
    keyScope: 'mediaTimeline',
    mouseArea: 'mediaTimeline',
  },
  {
    id: 'cutMarks',
    title: 'Cut marks',
    where: 'The red marks on the media timeline. Keys work on a focused edge of a mark.',
    keyScope: 'cutEdge',
    mouseArea: 'cutMarks',
  },
  {
    id: 'waveform',
    title: 'Waveform and bar 1 marker',
    where: 'The audio track in the media panel. Keys work when the "1" marker has the focus.',
    keyScope: 'barOneMarker',
    mouseArea: 'waveform',
  },
  {
    id: 'splitter',
    title: 'Media panel splitter',
    where: 'The bar between the editor and the media panel. Keys work when it has the focus.',
    keyScope: 'splitter',
    mouseArea: 'splitter',
  },
  {
    id: 'mediaFiles',
    title: 'Media files',
    where: 'Only one media file is loaded at a time.',
    mouseArea: 'mediaFiles',
  },
  {
    id: 'contextMenu',
    title: 'Context menu',
    where: 'The menu of the media timeline.',
    keyScope: 'contextMenu',
  },
  {
    id: 'numberFields',
    title: 'Number fields',
    where: 'Tempo, time signature, velocity and media offset.',
    keyScope: 'numberField',
  },
  { id: 'infoWindow', title: 'This window', where: '', keyScope: 'infoDialog' },
];

export interface HelpRow {
  /** "noteGrid.delete", "mouse.deleteNote". */
  readonly id: string;
  readonly kind: 'key' | 'mouse';
  /** ["Delete", "Backspace"] or ["Right-click a note"]. */
  readonly inputs: readonly string[];
  readonly description: string;
}

export interface HelpSection {
  readonly id: HelpSectionId;
  readonly title: string;
  readonly where: string;
  readonly rows: readonly HelpRow[];
}

export const HELP_NOTE =
  'On macOS use ⌘ instead of Ctrl. Letter shortcuts work with any keyboard layout. Undo, Redo and Play / Pause are off while this window is open.';

function keyDescription(scope: ShortcutScope, binding: KeyBinding): string {
  if (scope !== 'global') return binding.description;
  return `${binding.description} (${targetRuleNote(binding.target ?? 'everywhere')})`;
}

function keyRows(scope: ShortcutScope): HelpRow[] {
  return scopeBindings(scope).map(([action, binding]) => ({
    id: `${scope}.${action}`,
    kind: 'key',
    inputs: binding.chords.map(formatChord),
    description: keyDescription(scope, binding),
  }));
}

function mouseRows(area: MouseArea): HelpRow[] {
  return MOUSE_ACTIONS.filter((action) => action.area === area).map((action) => ({
    id: `mouse.${action.id}`,
    kind: 'mouse',
    inputs: [mouseActionLabel(action)],
    description: action.description,
  }));
}

/** Key rows (in registry order) then mouse rows (in catalog order) of every section. */
export function buildHelpSections(): readonly HelpSection[] {
  return HELP_SECTION_SPECS.map((spec) => ({
    id: spec.id,
    title: spec.title,
    where: spec.where,
    rows: [
      ...(spec.keyScope !== undefined ? keyRows(spec.keyScope) : []),
      ...(spec.mouseArea !== undefined ? mouseRows(spec.mouseArea) : []),
    ],
  }));
}
