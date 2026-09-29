import { readFile } from 'node:fs/promises';
import { expect, test, type Download, type Page } from '@playwright/test';
import { C4, E4, clickGrid, notes, openApp } from './helpers.ts';

test.beforeEach(async ({ page }) => {
  await openApp(page);
  await clickGrid(page, 0.52, C4);
  await clickGrid(page, 1.02, E4);
  await expect(notes(page)).toHaveCount(2);
});

async function expectMidiFile(download: Download): Promise<void> {
  expect(download.suggestedFilename()).toBe('arrangement.mid');
  const path = await download.path();
  const bytes = await readFile(path);
  expect(bytes.subarray(0, 4).toString('latin1')).toBe('MThd');
}

async function downloadWith(page: Page, action: () => Promise<void>): Promise<Download> {
  const [download] = await Promise.all([page.waitForEvent('download'), action()]);
  return download;
}

test('downloads a .mid file with Ctrl+S', async ({ page }) => {
  await expectMidiFile(await downloadWith(page, () => page.keyboard.press('ControlOrMeta+s')));
});

test('downloads a .mid file with the export button', async ({ page }) => {
  await expectMidiFile(
    await downloadWith(page, () => page.getByRole('button', { name: 'Export .mid' }).click()),
  );
});
