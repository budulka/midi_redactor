import { HELP_SECTION_SPECS, buildHelpSections } from './helpSections.ts';
import { MOUSE_ACTIONS, type MouseArea } from './mouseActions.ts';
import { SHORTCUT_SCOPES, scopeBindings } from './shortcutRegistry.ts';

describe('HELP_SECTION_SPECS', () => {
  it('shows every key scope in exactly one section', () => {
    for (const scope of SHORTCUT_SCOPES) {
      expect(
        HELP_SECTION_SPECS.filter((spec) => spec.keyScope === scope),
        scope,
      ).toHaveLength(1);
    }
  });

  it('shows every mouse area in exactly one section', () => {
    const areas = new Set<MouseArea>(MOUSE_ACTIONS.map((action) => action.area));
    for (const area of areas) {
      expect(
        HELP_SECTION_SPECS.filter((spec) => spec.mouseArea === area),
        area,
      ).toHaveLength(1);
    }
  });
});

describe('buildHelpSections', () => {
  const sections = buildHelpSections();

  it('starts with the page-wide keys and their target notes', () => {
    expect(sections[0].title).toBe('Whole page');
    expect(sections[0].rows.map(({ inputs, description }) => ({ inputs, description }))).toEqual([
      { inputs: ['Ctrl+Z'], description: 'Undo (not in text fields)' },
      { inputs: ['Ctrl+Shift+Z', 'Ctrl+Y'], description: 'Redo (not in text fields)' },
      {
        inputs: ['Space'],
        description: 'Play / Pause (not in text fields, buttons, lists, checkboxes or sliders)',
      },
      { inputs: ['Ctrl+S'], description: 'Export .mid (works in text fields too)' },
    ]);
  });

  it('lists the keys of a section before its mouse actions', () => {
    const grid = sections.find((section) => section.title === 'Note grid');
    if (grid === undefined) throw new Error('no note grid');
    const keyRow = grid.rows.findIndex(
      (row) =>
        row.kind === 'key' &&
        row.description === 'Delete the selected notes' &&
        row.inputs.join() === 'Delete,Backspace',
    );
    const mouseRow = grid.rows.findIndex(
      (row) =>
        row.kind === 'mouse' &&
        row.description === 'Delete the note' &&
        row.inputs.join() === 'Right-click a note',
    );
    expect(keyRow).toBeGreaterThanOrEqual(0);
    expect(mouseRow).toBeGreaterThan(keyRow);
    const lastKey = grid.rows.map((row) => row.kind).lastIndexOf('key');
    const firstMouse = grid.rows.map((row) => row.kind).indexOf('mouse');
    expect(lastKey).toBeLessThan(firstMouse);
  });

  it('loses nothing', () => {
    const rows = sections.flatMap((section) => section.rows);
    const keyActions = SHORTCUT_SCOPES.reduce((sum, scope) => sum + scopeBindings(scope).length, 0);
    expect(rows.filter((row) => row.kind === 'key')).toHaveLength(keyActions);
    expect(rows.filter((row) => row.kind === 'mouse')).toHaveLength(MOUSE_ACTIONS.length);
    expect(new Set(rows.map((row) => row.id)).size).toBe(rows.length);
  });
});
