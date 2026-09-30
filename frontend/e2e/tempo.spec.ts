import { expect, test, type Page } from '@playwright/test';
import { C4, clickGrid, grid, notes, openApp } from './helpers.ts';

test.beforeEach(async ({ page }) => {
  await openApp(page);
});

const tempoField = (page: Page) => page.getByLabel('Tempo (quarter notes per minute)');
const pianoRoll = (page: Page) => page.getByRole('region', { name: 'Piano roll' });

async function setTempo(page: Page, bpm: string): Promise<void> {
  await tempoField(page).fill(bpm);
  await tempoField(page).press('Enter');
  await expect(tempoField(page)).toHaveValue(bpm);
}

/** Left edge and width of the only note, in pixels relative to the note grid. */
async function noteGeometry(page: Page): Promise<{ left: number; width: number }> {
  // The note grid must not be scrolled horizontally, so the positions are comparable.
  const scrollLeft = await page
    .locator('.piano-roll__scroll')
    .evaluate((element) => element.scrollLeft);
  expect(scrollLeft).toBe(0);
  const gridBox = await grid(page).boundingBox();
  const noteBox = await notes(page).first().boundingBox();
  if (gridBox === null || noteBox === null) throw new Error('note grid or note is not visible');
  return { left: noteBox.x - gridBox.x, width: noteBox.width };
}

async function expectNoteAt(page: Page, left: number, width?: number): Promise<void> {
  await expect
    .poll(async () => Math.abs((await noteGeometry(page)).left - left))
    .toBeLessThanOrEqual(1);
  if (width !== undefined) {
    expect(Math.abs((await noteGeometry(page)).width - width)).toBeLessThanOrEqual(1);
  }
}

async function addNoteAtOneSecond(page: Page): Promise<void> {
  await clickGrid(page, 1.02, C4);
  await expect(notes(page)).toHaveCount(1);
  await expectNoteAt(page, 100, 12.5);
}

test('moves and stretches a note when the tempo slows down', async ({ page }) => {
  await addNoteAtOneSecond(page);
  await setTempo(page, '60');
  await expectNoteAt(page, 200, 25);
});

test('undoes and redoes a tempo change as one step', async ({ page }) => {
  await addNoteAtOneSecond(page);
  await setTempo(page, '60');
  await expectNoteAt(page, 200);

  const undo = pianoRoll(page).getByRole('button', { name: 'Undo' });
  const redo = pianoRoll(page).getByRole('button', { name: 'Redo' });
  await undo.click();
  await expect(tempoField(page)).toHaveValue('120');
  await expect(notes(page)).toHaveCount(1);
  await expectNoteAt(page, 100);

  await undo.click();
  await expect(notes(page)).toHaveCount(0);
  await expect(undo).toBeDisabled();

  await redo.click();
  await redo.click();
  await expect(tempoField(page)).toHaveValue('60');
  await expect(notes(page)).toHaveCount(1);
  await expectNoteAt(page, 200);
});

test('compresses a note when the tempo speeds up', async ({ page }) => {
  await addNoteAtOneSecond(page);
  await setTempo(page, '240');
  await expectNoteAt(page, 50);
});
