import {
  MOUSE_ACTIONS,
  gestureLabel,
  mouseActionLabel,
  noteGridMouseAction,
  pedalLaneMouseAction,
  type MouseArea,
  type MouseButtonName,
} from './mouseActions.ts';

const BUTTONS: readonly MouseButtonName[] = ['left', 'right'];
const ADDITIVE = [false, true] as const;

describe('noteGridMouseAction', () => {
  it('classifies the left button', () => {
    expect(noteGridMouseAction('left', false, null)).toBe('createNote');
    expect(noteGridMouseAction('left', true, null)).toBe('selectRect');
    expect(noteGridMouseAction('left', false, 'body')).toBe('moveNotes');
    expect(noteGridMouseAction('left', false, 'resize')).toBe('resizeNotes');
    expect(noteGridMouseAction('left', true, 'body')).toBe('toggleNote');
    expect(noteGridMouseAction('left', true, 'resize')).toBe('toggleNote');
  });

  it('classifies the right button', () => {
    for (const additive of ADDITIVE) {
      expect(noteGridMouseAction('right', additive, null)).toBeNull();
      expect(noteGridMouseAction('right', additive, 'body')).toBe('deleteNote');
      expect(noteGridMouseAction('right', additive, 'resize')).toBe('deleteNote');
    }
  });
});

describe('pedalLaneMouseAction', () => {
  it('classifies the left button', () => {
    expect(pedalLaneMouseAction('left', false, null)).toBe('createPedal');
    expect(pedalLaneMouseAction('left', true, null)).toBeNull();
    expect(pedalLaneMouseAction('left', false, 'body')).toBe('movePedal');
    expect(pedalLaneMouseAction('left', false, 'start')).toBe('resizePedalStart');
    expect(pedalLaneMouseAction('left', false, 'end')).toBe('resizePedalEnd');
    for (const hit of ['body', 'start', 'end'] as const) {
      expect(pedalLaneMouseAction('left', true, hit)).toBe('togglePedal');
    }
  });

  it('classifies the right button', () => {
    for (const additive of ADDITIVE) {
      expect(pedalLaneMouseAction('right', additive, null)).toBeNull();
      for (const hit of ['body', 'start', 'end'] as const) {
        expect(pedalLaneMouseAction('right', additive, hit)).toBe('deletePedal');
      }
    }
  });
});

function catalogIds(area: MouseArea): string[] {
  return MOUSE_ACTIONS.filter((action) => action.area === area).map((action) => action.id);
}

describe('classifier contract', () => {
  it('note grid: the classifier reaches exactly the catalog actions', () => {
    const results = new Set<string>();
    for (const button of BUTTONS) {
      for (const additive of ADDITIVE) {
        for (const hit of [null, 'body', 'resize'] as const) {
          const action = noteGridMouseAction(button, additive, hit);
          if (action !== null) results.add(action);
        }
      }
    }
    expect([...results].sort()).toEqual(catalogIds('noteGrid').sort());
  });

  it('pedal lane: the classifier reaches exactly the catalog actions', () => {
    const results = new Set<string>();
    for (const button of BUTTONS) {
      for (const additive of ADDITIVE) {
        for (const hit of [null, 'body', 'start', 'end'] as const) {
          const action = pedalLaneMouseAction(button, additive, hit);
          if (action !== null) results.add(action);
        }
      }
    }
    expect([...results].sort()).toEqual(catalogIds('pedalLane').sort());
  });
});

describe('MOUSE_ACTIONS', () => {
  it('has the documented actions in every area', () => {
    const byArea: Record<MouseArea, string[]> = {
      noteGrid: [
        'createNote',
        'moveNotes',
        'resizeNotes',
        'toggleNote',
        'selectRect',
        'deleteNote',
      ],
      pianoKeyboard: ['playKey'],
      pedalLane: [
        'createPedal',
        'movePedal',
        'resizePedalStart',
        'resizePedalEnd',
        'togglePedal',
        'deletePedal',
      ],
      timeRuler: ['seekRuler'],
      mediaTimeline: ['seekTimeline', 'selectRange', 'rangeMenu'],
      cutMarks: ['dragCutStart', 'dragCutEnd', 'cutMenu'],
      waveform: ['seekWaveform', 'dragBarOne'],
      splitter: ['resizePanel', 'resetPanel'],
      mediaFiles: ['dropAudio', 'dropVideo'],
    };
    for (const [area, ids] of Object.entries(byArea)) {
      expect(catalogIds(area as MouseArea), area).toEqual(ids);
    }
    expect(MOUSE_ACTIONS).toHaveLength(26);
  });

  it('has unique ids and texts', () => {
    expect(new Set(MOUSE_ACTIONS.map((action) => action.id)).size).toBe(MOUSE_ACTIONS.length);
    for (const action of MOUSE_ACTIONS) {
      expect(action.on, action.id).not.toBe('');
      expect(action.description, action.id).not.toBe('');
    }
  });
});

describe('labels', () => {
  it('names the gestures', () => {
    expect(gestureLabel({ gesture: 'click', additive: true })).toBe('Shift/Ctrl/⌘+click');
    expect(gestureLabel({ gesture: 'drag', additive: true })).toBe('Shift/Ctrl/⌘+drag');
    expect(gestureLabel({ gesture: 'rightClick' })).toBe('Right-click');
    expect(gestureLabel({ gesture: 'doubleClick' })).toBe('Double-click');
    expect(gestureLabel({ gesture: 'pressHold' })).toBe('Press and hold');
    expect(gestureLabel({ gesture: 'drop' })).toBe('Drop');
  });

  it('joins the gesture and the place', () => {
    const deleteNote = MOUSE_ACTIONS.find((action) => action.id === 'deleteNote');
    if (deleteNote === undefined) throw new Error('no deleteNote');
    expect(mouseActionLabel(deleteNote)).toBe('Right-click a note');
  });
});
