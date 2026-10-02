import { expect, test, type Locator, type Page } from '@playwright/test';
import { grid, openApp } from './helpers.ts';
import { expectNoHorizontalOverflow, loadVideo, recordTestVideo } from './media.ts';

const band = (page: Page) => page.locator('.media-timeline__media');
const track = (page: Page) => page.getByRole('slider', { name: 'Media position' });
const position = (page: Page) => page.getByRole('status', { name: 'Playback position' });
const field = (page: Page) => page.getByLabel('Media offset (seconds)');

const videoTime = (video: Locator) =>
  video.evaluate((element: HTMLVideoElement) => element.currentTime);

async function box(locator: Locator) {
  const rect = await locator.boundingBox();
  if (rect === null) throw new Error('element is not visible');
  return rect;
}

async function loadTestVideo(page: Page): Promise<Locator> {
  const buffer = await recordTestVideo(page, {
    width: 320,
    height: 180,
    durationMs: 2000,
    withSound: false,
  });
  return loadVideo(page, 'silent.webm', buffer);
}

/**
 * Duration of the loaded video as the app shows it ("0:00.000 / 0:02.016"), in seconds. A recorded
 * test video is about 2 s long, but MediaRecorder makes it a few milliseconds shorter or longer.
 */
async function shownVideoDuration(page: Page): Promise<number> {
  const text = (await page.getByRole('status', { name: 'Video position' }).textContent()) ?? '';
  const match = /\/ (\d+):(\d+\.\d+)$/.exec(text.trim());
  if (match === null) throw new Error(`unexpected video position: ${text}`);
  return Number(match[1]) * 60 + Number(match[2]);
}

async function setOffset(page: Page, value: string): Promise<void> {
  await field(page).fill(value);
  await field(page).press('Enter');
}

test.beforeEach(async ({ page }) => {
  await openApp(page);
});

test('the media band lines up with the note grid', async ({ page }) => {
  await loadTestVideo(page);
  await expect(band(page)).toBeVisible();
  const duration = await shownVideoDuration(page);
  expect(Math.abs(duration - 2)).toBeLessThan(0.1);
  const gridBox = await box(grid(page));
  const bandBox = await box(band(page));
  expect(Math.abs(bandBox.x - gridBox.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(bandBox.width - duration * 100)).toBeLessThanOrEqual(2);
  await expect(page.getByRole('slider', { name: 'Seek video' })).toHaveCount(0);
});

test('a click on the media timeline seeks the video', async ({ page }) => {
  const video = await loadTestVideo(page);
  const gridBox = await box(grid(page));
  const trackBox = await box(track(page));
  await page.mouse.click(gridBox.x + 100, trackBox.y + trackBox.height / 2);
  await expect(position(page)).toHaveText(/^0:01\.0/);
  await expect.poll(async () => Math.abs((await videoTime(video)) - 1)).toBeLessThanOrEqual(0.05);
});

test('the media offset moves the band', async ({ page }) => {
  await loadTestVideo(page);
  await expect(band(page)).toBeVisible();
  const fullWidth = (await shownVideoDuration(page)) * 100;
  await setOffset(page, '0.5');
  await expect(page.getByText('0:00.500 before bar 1')).toBeVisible();
  let gridBox = await box(grid(page));
  let bandBox = await box(band(page));
  expect(Math.abs(bandBox.width - (fullWidth - 50))).toBeLessThanOrEqual(2);
  expect(Math.abs(bandBox.x - gridBox.x)).toBeLessThanOrEqual(1);

  await setOffset(page, '-0.5');
  await expect(page.getByText('0:00.500 before bar 1')).toHaveCount(0);
  gridBox = await box(grid(page));
  bandBox = await box(band(page));
  expect(Math.abs(bandBox.x - (gridBox.x + 50))).toBeLessThanOrEqual(2);
  expect(Math.abs(bandBox.width - fullWidth)).toBeLessThanOrEqual(2);
});

test('the media timeline scrolls with the piano roll', async ({ page }) => {
  await loadTestVideo(page);
  const gridBefore = await box(grid(page));
  const bandBefore = await box(band(page));
  await page.locator('.piano-roll__scroll').evaluate((element) => {
    element.scrollLeft = 60;
  });
  await expect.poll(async () => (await box(grid(page))).x).toBeCloseTo(gridBefore.x - 60, 0);
  const gridAfter = await box(grid(page));
  const bandAfter = await box(band(page));
  expect(Math.abs(bandAfter.x - gridAfter.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(bandAfter.x - (bandBefore.x - 60))).toBeLessThanOrEqual(1);
});

test('the media timeline does not make the page overflow', async ({ page }) => {
  await loadTestVideo(page);
  await expect(band(page)).toBeVisible();
  await expectNoHorizontalOverflow(page);
});
