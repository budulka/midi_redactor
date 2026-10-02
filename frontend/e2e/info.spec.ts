import { expect, test, type Locator, type Page } from '@playwright/test';
import { C4, clickGrid, createThreeNotes, notes, openApp } from './helpers.ts';
import { expectNoHorizontalOverflow } from './media.ts';

function dialogOf(page: Page): Locator {
  return page.getByRole('dialog', { name: 'Keyboard shortcuts and mouse actions' });
}

function infoButton(page: Page): Locator {
  return page.getByRole('button', { name: 'Info' });
}

async function openInfo(page: Page): Promise<Locator> {
  await infoButton(page).click();
  const dialog = dialogOf(page);
  await expect(dialog).toBeVisible();
  return dialog;
}

/** Space, Ctrl+Z and Tab/Shift+Tab do not leave the window or reach the page. */
async function expectPageKeysOff(page: Page, dialog: Locator): Promise<void> {
  await page.keyboard.press('Space');
  await expect(page.getByRole('button', { name: 'Play' })).toBeVisible();
  await page.keyboard.press('ControlOrMeta+z');
  await expect(notes(page)).toHaveCount(3);
  await page.keyboard.press('Tab');
  await expect(dialog.locator(':focus')).toHaveCount(1);
  await page.keyboard.press('Tab');
  await expect(dialog.locator(':focus')).toHaveCount(1);
  await page.keyboard.press('Shift+Tab');
  await expect(dialog.locator(':focus')).toHaveCount(1);
}

test.beforeEach(async ({ page }) => {
  await openApp(page);
});

test('opens and closes the Info window', async ({ page }) => {
  const dialog = await openInfo(page);
  await expect(dialog.getByRole('button', { name: 'Close' })).toBeFocused();
  await expect(infoButton(page)).toHaveAttribute('aria-expanded', 'true');
  for (const title of [
    'Whole page',
    'Note grid',
    'Pedal lane',
    'While dragging',
    'Media timeline',
    'Cut marks',
    'Media panel splitter',
    'This window',
  ]) {
    await expect(dialog.getByRole('heading', { name: title, exact: true })).toBeVisible();
  }
  const redo = dialog.locator('tr', { hasText: 'Ctrl+Shift+Z' });
  await expect(redo).toContainText('Ctrl+Y');
  await expect(redo).toContainText('Redo');
  await expect(dialog.locator('tr', { hasText: 'Shift+↑' })).toContainText('octave up');
  await expect(dialog.locator('tr', { hasText: 'Right-click a note' })).toContainText(
    'Delete the note',
  );
  await expect(dialog.locator('tr', { hasText: 'Double-click the splitter' })).toContainText(
    'Reset the width',
  );
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(infoButton(page)).toBeFocused();
});

test('turns the page keys off while the window is open', async ({ page }) => {
  await createThreeNotes(page);
  const dialog = await openInfo(page);
  await page.keyboard.press('ControlOrMeta+z');
  await expect(notes(page)).toHaveCount(3);
  await page.keyboard.press('Tab');
  await expect(dialog.getByRole('region', { name: 'Shortcut list' })).toBeFocused();
  await page.keyboard.press('Space');
  await expect(page.getByRole('button', { name: 'Play' })).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(dialog.getByRole('button', { name: 'Close' })).toBeFocused();
  await page.mouse.click(5, 5);
  await expect(dialog).toHaveCount(0);
  await page.keyboard.press('ControlOrMeta+z');
  await expect(notes(page)).toHaveCount(2);
});

test('keeps the focus inside after a click on a part of the window', async ({ page }) => {
  await createThreeNotes(page);
  const dialog = await openInfo(page);
  await dialog.getByRole('heading', { level: 2 }).click();
  await expect(dialog).toBeFocused();
  await expectPageKeysOff(page, dialog);
  await dialog.getByText('On macOS use ⌘').click();
  await expect(dialog).toBeFocused();
  await expectPageKeysOff(page, dialog);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await page.keyboard.press('ControlOrMeta+z');
  await expect(notes(page)).toHaveCount(2);
});

test('lists keys that work', async ({ page }) => {
  const dialog = await openInfo(page);
  const section = dialog.getByRole('region', { name: 'Note grid' });
  const row = section.locator('tr', { hasText: 'Select all notes' });
  await expect(row.locator('th')).toHaveText('Ctrl+A');
  await dialog.getByRole('button', { name: 'Close' }).click();
  await createThreeNotes(page);
  await clickGrid(page, 0.56, C4);
  await page.keyboard.press('ControlOrMeta+a');
  await expect(page.getByText('3 notes selected')).toBeVisible();
});

test('fits a small window', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 500 });
  const dialog = await openInfo(page);
  const rect = await dialog.boundingBox();
  if (rect === null) throw new Error('the window is not visible');
  expect(rect.x).toBeGreaterThanOrEqual(0);
  expect(rect.y).toBeGreaterThanOrEqual(0);
  expect(rect.x + rect.width).toBeLessThanOrEqual(900);
  expect(rect.y + rect.height).toBeLessThanOrEqual(500);
  const scrolls = await dialog
    .getByRole('region', { name: 'Shortcut list' })
    .evaluate((element) => element.scrollHeight > element.clientHeight);
  expect(scrolls).toBe(true);
  await expectNoHorizontalOverflow(page);
  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(dialog).toHaveCount(0);
});
