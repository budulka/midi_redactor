import type { PedalHitZone } from './pedalGeometry.ts';
import type { HitZone } from './pianoRollGeometry.ts';
import { ADDITIVE_MODIFIERS_LABEL } from './selection.ts';

/** Where a mouse action is made; every area is one section of the Info window. */
export type MouseArea =
  | 'noteGrid'
  | 'pianoKeyboard'
  | 'pedalLane'
  | 'timeRuler'
  | 'mediaTimeline'
  | 'cutMarks'
  | 'waveform'
  | 'splitter'
  | 'mediaFiles';

export type GestureKind = 'click' | 'drag' | 'rightClick' | 'doubleClick' | 'pressHold' | 'drop';

export type NoteGridMouseAction =
  'createNote' | 'moveNotes' | 'resizeNotes' | 'toggleNote' | 'selectRect' | 'deleteNote';

export type PedalLaneMouseAction =
  | 'createPedal'
  | 'movePedal'
  | 'resizePedalStart'
  | 'resizePedalEnd'
  | 'togglePedal'
  | 'deletePedal';

export type MouseActionId =
  | NoteGridMouseAction
  | PedalLaneMouseAction
  | 'playKey'
  | 'seekRuler'
  | 'seekTimeline'
  | 'selectRange'
  | 'rangeMenu'
  | 'dragCutStart'
  | 'dragCutEnd'
  | 'cutMenu'
  | 'seekWaveform'
  | 'dragBarOne'
  | 'resizePanel'
  | 'resetPanel'
  | 'dropAudio'
  | 'dropVideo';

export interface MouseAction {
  readonly id: MouseActionId;
  readonly area: MouseArea;
  readonly gesture: GestureKind;
  /** Shift, Ctrl or ⌘ held (see isAdditive). */
  readonly additive?: true;
  /** What the gesture is made on: "a note", "an empty place". */
  readonly on: string;
  readonly description: string;
}

/**
 * Every mouse action of the app, in the order of the Info window. The note grid and the pedal lane
 * decide what to do through noteGridMouseAction and pedalLaneMouseAction, which return only ids
 * of this catalog.
 */
export const MOUSE_ACTIONS: readonly MouseAction[] = [
  {
    id: 'createNote',
    area: 'noteGrid',
    gesture: 'click',
    on: 'an empty place',
    description: 'Add a note one grid step long; drag right to set its length',
  },
  {
    id: 'moveNotes',
    area: 'noteGrid',
    gesture: 'drag',
    on: 'a note',
    description: 'Move the note (or all selected notes) in time and pitch',
  },
  {
    id: 'resizeNotes',
    area: 'noteGrid',
    gesture: 'drag',
    on: 'the right edge of a note',
    description: 'Change the length of the note (or all selected notes)',
  },
  {
    id: 'toggleNote',
    area: 'noteGrid',
    gesture: 'click',
    additive: true,
    on: 'a note',
    description: 'Add the note to the selection or remove it',
  },
  {
    id: 'selectRect',
    area: 'noteGrid',
    gesture: 'drag',
    additive: true,
    on: 'an empty place',
    description: 'Select the notes in a rectangle (adds to the selection)',
  },
  {
    id: 'deleteNote',
    area: 'noteGrid',
    gesture: 'rightClick',
    on: 'a note',
    description: 'Delete the note',
  },
  {
    id: 'playKey',
    area: 'pianoKeyboard',
    gesture: 'pressHold',
    on: 'a key',
    description: 'Play the note while the button is held',
  },
  {
    id: 'createPedal',
    area: 'pedalLane',
    gesture: 'click',
    on: 'an empty place of a row',
    description: 'Add a press of that pedal one beat long; drag right to set its end',
  },
  {
    id: 'movePedal',
    area: 'pedalLane',
    gesture: 'drag',
    on: 'a pedal press',
    description: 'Move it in time',
  },
  {
    id: 'resizePedalStart',
    area: 'pedalLane',
    gesture: 'drag',
    on: 'the left edge of a pedal press',
    description: 'Change when the pedal goes down',
  },
  {
    id: 'resizePedalEnd',
    area: 'pedalLane',
    gesture: 'drag',
    on: 'the right edge of a pedal press',
    description: 'Change when the pedal goes up',
  },
  {
    id: 'togglePedal',
    area: 'pedalLane',
    gesture: 'click',
    additive: true,
    on: 'a pedal press',
    description: 'Add it to the selection or remove it',
  },
  {
    id: 'deletePedal',
    area: 'pedalLane',
    gesture: 'rightClick',
    on: 'a pedal press',
    description: 'Delete it',
  },
  {
    id: 'seekRuler',
    area: 'timeRuler',
    gesture: 'click',
    on: 'the ruler',
    description: 'Move the playhead there (during playback, jump there and keep playing)',
  },
  {
    id: 'seekTimeline',
    area: 'mediaTimeline',
    gesture: 'click',
    on: 'the media timeline',
    description: 'Move the playhead there',
  },
  {
    id: 'selectRange',
    area: 'mediaTimeline',
    gesture: 'drag',
    on: 'along the media timeline',
    description: 'Select a range',
  },
  {
    id: 'rangeMenu',
    area: 'mediaTimeline',
    gesture: 'rightClick',
    on: 'the selected range',
    description: 'Open the menu with "Delete range" (cut the range from the media)',
  },
  {
    id: 'dragCutStart',
    area: 'cutMarks',
    gesture: 'drag',
    on: 'the left half of a cut mark',
    description: 'Move the start of the cut',
  },
  {
    id: 'dragCutEnd',
    area: 'cutMarks',
    gesture: 'drag',
    on: 'the right half of a cut mark',
    description: 'Move the end of the cut',
  },
  {
    id: 'cutMenu',
    area: 'cutMarks',
    gesture: 'rightClick',
    on: 'a cut mark',
    description: 'Open the menu with "Remove cut" (bring the range back)',
  },
  {
    id: 'seekWaveform',
    area: 'waveform',
    gesture: 'click',
    on: 'the waveform',
    description: 'Move the playhead there',
  },
  {
    id: 'dragBarOne',
    area: 'waveform',
    gesture: 'drag',
    on: 'the yellow "1" marker',
    description: 'Choose the media second where bar 1 starts',
  },
  {
    id: 'resizePanel',
    area: 'splitter',
    gesture: 'drag',
    on: 'the splitter',
    description: 'Change the width of the media panel (kept after a reload)',
  },
  {
    id: 'resetPanel',
    area: 'splitter',
    gesture: 'doubleClick',
    on: 'the splitter',
    description: 'Reset the width',
  },
  {
    id: 'dropAudio',
    area: 'mediaFiles',
    gesture: 'drop',
    on: 'an audio file on the audio track',
    description: 'Load it instead of the current media',
  },
  {
    id: 'dropVideo',
    area: 'mediaFiles',
    gesture: 'drop',
    on: 'a video file on the video panel',
    description: 'Load it instead of the current media',
  },
];

const GESTURE_NAMES: Readonly<Record<GestureKind, string>> = {
  click: 'Click',
  drag: 'Drag',
  rightClick: 'Right-click',
  doubleClick: 'Double-click',
  pressHold: 'Press and hold',
  drop: 'Drop',
};

/** "Click", "Shift/Ctrl/⌘+drag", "Right-click", "Double-click", "Press and hold", "Drop". */
export function gestureLabel(action: Pick<MouseAction, 'gesture' | 'additive'>): string {
  const name = GESTURE_NAMES[action.gesture];
  return action.additive === true ? `${ADDITIVE_MODIFIERS_LABEL}+${name.toLowerCase()}` : name;
}

/** gestureLabel + " " + on: "Right-click a note". */
export function mouseActionLabel(action: MouseAction): string {
  return `${gestureLabel(action)} ${action.on}`;
}

export type MouseButtonName = 'left' | 'right';

/** What a mouse button does on the note grid, by the hit zone under the pointer (null: empty place). */
export function noteGridMouseAction(
  button: MouseButtonName,
  additive: boolean,
  hit: HitZone | null,
): NoteGridMouseAction | null {
  if (button === 'right') return hit !== null ? 'deleteNote' : null;
  if (hit === null) return additive ? 'selectRect' : 'createNote';
  if (additive) return 'toggleNote';
  return hit === 'resize' ? 'resizeNotes' : 'moveNotes';
}

const PEDAL_DRAGS: Readonly<Record<PedalHitZone, PedalLaneMouseAction>> = {
  body: 'movePedal',
  start: 'resizePedalStart',
  end: 'resizePedalEnd',
};

/** What a mouse button does on the pedal lane, by the hit zone under the pointer (null: empty place). */
export function pedalLaneMouseAction(
  button: MouseButtonName,
  additive: boolean,
  hit: PedalHitZone | null,
): PedalLaneMouseAction | null {
  if (button === 'right') return hit !== null ? 'deletePedal' : null;
  if (additive) return hit !== null ? 'togglePedal' : null;
  return hit === null ? 'createPedal' : PEDAL_DRAGS[hit];
}
