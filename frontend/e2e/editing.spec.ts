import { expect, test } from '@playwright/test';
import {
  C4,
  E4,
  G4,
  ROW_HEIGHT,
  clickAt,
  clickGrid,
  createThreeNotes,
  dragBetween,
  gridPoint,
  lanePoint,
  noteByLabel,
  notes,
  openApp,
  pedals,
  selectedNotes,
} from './helpers.ts';

test.beforeEach(async ({ page }) => {
  await openApp(page);
});

test('undoes and redoes with the keyboard and the buttons', async ({ page }) => {
  await createThreeNotes(page);
  await page.keyboard.press('ControlOrMeta+z');
  await expect(notes(page)).toHaveCount(2);
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await expect(notes(page)).toHaveCount(3);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(notes(page)).toHaveCount(2);
  const redo = page.getByRole('button', { name: 'Redo' });
  await redo.click();
  await expect(notes(page)).toHaveCount(3);
  await expect(redo).toBeDisabled();
});

test('moves several selected notes together', async ({ page }) => {
  await createThreeNotes(page);
  await clickGrid(page, 0.56, C4);
  await clickGrid(page, 1.06, E4, ['Shift']);
  await expect(page.getByText('2 notes selected')).toBeVisible();

  await dragBetween(page, await gridPoint(page, 0.56, C4), await gridPoint(page, 1.06, C4));
  await expect(noteByLabel(page, 'C4, velocity 100')).toHaveCSS('left', '100px');
  await expect(noteByLabel(page, 'E4, velocity 100')).toHaveCSS('left', '150px');
  await expect(noteByLabel(page, 'G4, velocity 100')).toHaveCSS('left', '150px');

  await page.keyboard.press('ControlOrMeta+z');
  await expect(noteByLabel(page, 'C4, velocity 100')).toHaveCSS('left', '50px');
  await expect(noteByLabel(page, 'E4, velocity 100')).toHaveCSS('left', '100px');
});

test('selects notes with a rectangle and deletes them', async ({ page }) => {
  await createThreeNotes(page);
  // The last created note is selected and a Shift rectangle adds to the selection, so clear it.
  await page.keyboard.press('Escape');
  await expect(page.getByText('No note selected')).toBeVisible();
  const top = await gridPoint(page, 0.4, G4);
  const bottom = await gridPoint(page, 1.4, C4);
  await dragBetween(
    page,
    { x: top.x, y: top.y - (ROW_HEIGHT - 3) },
    { x: bottom.x, y: bottom.y + (ROW_HEIGHT - 3) },
    ['Shift'],
    async () => {
      await expect(page.getByTestId('marquee')).toBeVisible();
    },
  );
  await expect(page.getByTestId('marquee')).toHaveCount(0);
  await expect(page.getByText('2 notes selected')).toBeVisible();
  await expect(selectedNotes(page)).toHaveCount(2);
  await expect(noteByLabel(page, 'G4, velocity 100')).toHaveAttribute('data-selected', 'false');

  await page.keyboard.press('Delete');
  await expect(notes(page)).toHaveCount(1);
  await expect(noteByLabel(page, 'G4, velocity 100')).toHaveCount(1);
  await page.keyboard.press('ControlOrMeta+z');
  await expect(notes(page)).toHaveCount(3);
});

test('selects all, moves with the arrows and clears with Escape', async ({ page }) => {
  await createThreeNotes(page);
  await clickGrid(page, 0.56, C4);
  await page.keyboard.press('ControlOrMeta+a');
  await expect(page.getByText('3 notes selected')).toBeVisible();

  await page.keyboard.press('ArrowUp');
  for (const name of ['C#4', 'F4', 'G#4']) {
    await expect(noteByLabel(page, `${name}, velocity 100`)).toHaveCount(1);
  }
  await page.keyboard.press('Shift+ArrowUp');
  for (const name of ['C#5', 'F5', 'G#5']) {
    await expect(noteByLabel(page, `${name}, velocity 100`)).toHaveCount(1);
  }
  await page.keyboard.press('ArrowRight');
  await expect(noteByLabel(page, 'C#5, velocity 100')).toHaveCSS('left', '62.5px');

  await page.keyboard.press('Escape');
  await expect(page.getByText('No note selected')).toBeVisible();
});

test('selects several pedals and deletes them', async ({ page }) => {
  await clickAt(page, await lanePoint(page, 0.2, 0));
  await clickAt(page, await lanePoint(page, 1.2, 0));
  await expect(pedals(page)).toHaveCount(2);

  // Pedals are 0.125–0.625 s and 1.125–1.625 s; click the middle of their bodies.
  await clickAt(page, await lanePoint(page, 0.375, 0));
  await clickAt(page, await lanePoint(page, 1.375, 0), ['Shift']);
  await expect(page.locator('[data-testid="pedal"][data-selected="true"]')).toHaveCount(2);

  await page.keyboard.press('Delete');
  await expect(pedals(page)).toHaveCount(0);
  await page.keyboard.press('ControlOrMeta+z');
  await expect(pedals(page)).toHaveCount(2);
});
