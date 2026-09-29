import { expect, test, type Page } from '@playwright/test';
import { C4, E4, clickGrid, notes, openApp } from './helpers.ts';

async function noteLayout(page: Page): Promise<string[]> {
  return notes(page).evaluateAll((elements) =>
    elements
      .map((element) => {
        const style = (element as HTMLElement).style;
        return `${element.getAttribute('aria-label')} @ ${style.left} / ${style.top} / ${style.width}`;
      })
      .sort(),
  );
}

async function exportToFile(page: Page): Promise<string> {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export .mid' }).click(),
  ]);
  // The download is stored under a random name; keep the suggested one for the summary text.
  const path = test.info().outputPath(download.suggestedFilename());
  await download.saveAs(path);
  return path;
}

function importInput(page: Page) {
  return page.getByLabel('Import MIDI file');
}

test.beforeEach(async ({ page }) => {
  await openApp(page);
  await clickGrid(page, 0.52, C4);
  await clickGrid(page, 1.02, E4);
  await expect(notes(page)).toHaveCount(2);
});

test('round-trips exported notes and undoes the import', async ({ page }) => {
  const before = await noteLayout(page);
  const path = await exportToFile(page);

  await clickGrid(page, 0.56, C4);
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.press('Delete');
  await expect(notes(page)).toHaveCount(0);

  await importInput(page).setInputFiles(path);
  await expect(page.getByRole('status').filter({ hasText: 'Imported' })).toContainText(
    'Imported "arrangement.mid": 2 notes',
  );
  await expect(notes(page)).toHaveCount(2);
  expect(await noteLayout(page)).toEqual(before);

  await page.getByRole('heading', { name: 'MIDI Redactor' }).click();
  await page.keyboard.press('ControlOrMeta+z');
  await expect(notes(page)).toHaveCount(0);
});

test('asks before replacing a non-empty project', async ({ page }) => {
  const path = await exportToFile(page);
  await clickGrid(page, 2.02, C4);
  await expect(notes(page)).toHaveCount(3);

  page.once('dialog', (dialog) => void dialog.dismiss());
  await importInput(page).setInputFiles(path);
  await expect(page.getByText('Import .mid')).toBeVisible();
  await expect(notes(page)).toHaveCount(3);

  page.once('dialog', (dialog) => void dialog.accept());
  await importInput(page).setInputFiles(path);
  await expect(page.getByRole('status').filter({ hasText: 'Imported' })).toBeVisible();
  await expect(notes(page)).toHaveCount(2);
});

test('shows an error for an invalid file', async ({ page }) => {
  await importInput(page).setInputFiles({
    name: 'bad.mid',
    mimeType: 'audio/midi',
    buffer: Buffer.from('nope'),
  });

  await expect(page.getByRole('alert')).toHaveText(
    'Could not import: The file is not a valid MIDI file.',
  );
  await expect(notes(page)).toHaveCount(2);
});
