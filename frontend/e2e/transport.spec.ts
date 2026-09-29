import { expect, test, type Page } from '@playwright/test';
import { C4, clickGrid, notes, openApp } from './helpers.ts';

test.beforeEach(async ({ page }) => {
  await openApp(page);
});

const playback = (page: Page) => page.getByRole('group', { name: 'Playback' });

test('toggles playback with Space', async ({ page }) => {
  await page.keyboard.press('Space');
  await expect(playback(page).getByRole('button', { name: 'Pause' })).toBeVisible({
    timeout: 20_000,
  });
  await page.keyboard.press('Space');
  await expect(playback(page).getByRole('button', { name: 'Play' })).toBeVisible();
});

test('does not start playback with Space in the tempo field', async ({ page }) => {
  await page.getByLabel('Tempo (quarter notes per minute)').click();
  await page.keyboard.press('Space');
  await page.waitForTimeout(1000);
  await expect(playback(page).getByRole('button', { name: 'Play' })).toBeVisible();
});

test('leaves Ctrl+Z to the tempo field', async ({ page }) => {
  await clickGrid(page, 0.52, C4);
  await expect(notes(page)).toHaveCount(1);
  await page.getByLabel('Tempo (quarter notes per minute)').click();
  await page.keyboard.press('ControlOrMeta+z');
  await expect(notes(page)).toHaveCount(1);
});
