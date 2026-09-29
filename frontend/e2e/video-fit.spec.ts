import { expect, test, type Page } from '@playwright/test';
import { openApp } from './helpers.ts';
import {
  expectNoHorizontalOverflow,
  expectVideoInsidePanel,
  loadVideo,
  recordTestVideo,
} from './media.ts';

const LONG_NAME = 'wide-' + 'x'.repeat(150) + '.webm';

async function loadWideVideo(page: Page) {
  const buffer = await recordTestVideo(page, { width: 3840, height: 240 });
  return loadVideo(page, LONG_NAME, buffer);
}

async function videoSectionWidth(page: Page): Promise<number> {
  const box = await page.locator('section[aria-label="Video"]').boundingBox();
  if (box === null) throw new Error('the Video section is not visible');
  return box.width;
}

test.beforeEach(async ({ page }) => {
  await openApp(page);
});

test('nothing overflows horizontally before a video is loaded', async ({ page }) => {
  await expectNoHorizontalOverflow(page);
});

test('a very wide video with a long name fits the panel', async ({ page }) => {
  const video = await loadWideVideo(page);

  await expectNoHorizontalOverflow(page);
  await expectVideoInsidePanel(page);

  const ratio = await video.evaluate(
    (element: HTMLVideoElement) => element.videoWidth / element.videoHeight,
  );
  expect(ratio).toBeGreaterThan(16 * 0.99);
  expect(ratio).toBeLessThan(16 * 1.01);

  const name = page.locator('.video-player__name');
  await expect(name).toHaveAttribute('title', LONG_NAME);
  const truncated = await name.evaluate((element) => element.scrollWidth > element.clientWidth);
  expect(truncated).toBe(true);
});

test('a very tall video fits the panel and the page does not scroll', async ({ page }) => {
  const buffer = await recordTestVideo(page, { width: 240, height: 1920 });
  await loadVideo(page, 'tall.webm', buffer);

  await expectNoHorizontalOverflow(page);
  await expectVideoInsidePanel(page);
  const scrolls = await page.evaluate(
    () => document.documentElement.scrollHeight > document.documentElement.clientHeight,
  );
  expect(scrolls).toBe(false);
});

test('a small video is scaled up to the panel', async ({ page }) => {
  const buffer = await recordTestVideo(page, { width: 64, height: 36 });
  await loadVideo(page, 'small.webm', buffer);

  await expectVideoInsidePanel(page);
  await expectNoHorizontalOverflow(page);
});

test('the video fits a media panel of any width', async ({ page }) => {
  await loadWideVideo(page);

  for (const width of [240, 360, 720]) {
    await page.evaluate((w) => {
      const app = document.querySelector<HTMLElement>('.app');
      if (app === null) throw new Error('.app is missing');
      app.style.gridTemplateColumns = `minmax(0, 1fr) ${w}px`;
    }, width);

    expect(Math.abs((await videoSectionWidth(page)) - width)).toBeLessThanOrEqual(1);
    await expectNoHorizontalOverflow(page);
    await expectVideoInsidePanel(page);
  }
});

test('the video fits the panel in a narrow window', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await loadWideVideo(page);

  expect(Math.abs((await videoSectionWidth(page)) - 360)).toBeLessThanOrEqual(1);
  await expectNoHorizontalOverflow(page);
  await expectVideoInsidePanel(page);
});

test('a long error message wraps inside the panel', async ({ page }) => {
  const name = 'y'.repeat(200) + '.mp4';
  await page
    .getByLabel('Video file')
    .setInputFiles({ name, mimeType: 'video/mp4', buffer: Buffer.from('nope') });

  await expect(page.locator('section[aria-label="Video"]').getByRole('alert')).toContainText(
    `Could not play "${'y'.repeat(20)}`,
  );
  await expectNoHorizontalOverflow(page);
});
