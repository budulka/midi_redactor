import { expect, test, type Locator, type Page } from '@playwright/test';
import { dragBetween, grid, openApp } from './helpers.ts';
import { loadVideo, recordTestVideo } from './media.ts';

const band = (page: Page) => page.locator('.media-timeline__media');
const track = (page: Page) => page.getByRole('slider', { name: 'Media position' });
const cutMark = (page: Page) => page.locator('.media-timeline__cut');
const pianoRoll = (page: Page) => page.getByRole('region', { name: 'Piano roll' });
const audioTrack = (page: Page) => page.getByRole('region', { name: 'Audio track' });
const playback = (page: Page) => page.getByRole('group', { name: 'Playback' });
const field = (page: Page) => page.getByLabel('Media offset (seconds)');

const videoTime = (video: Locator) =>
  video.evaluate((element: HTMLVideoElement) => element.currentTime);

async function box(locator: Locator) {
  const rect = await locator.boundingBox();
  if (rect === null) throw new Error('element is not visible');
  return rect;
}

async function loadTestVideo(page: Page, withSound = false): Promise<Locator> {
  const buffer = await recordTestVideo(page, {
    width: 320,
    height: 180,
    durationMs: 4000,
    withSound,
  });
  const video = await loadVideo(page, withSound ? 'with-sound.webm' : 'silent.webm', buffer);
  await expect(band(page)).toBeVisible();
  return video;
}

/**
 * Duration of the loaded video as the app shows it ("0:00.000 / 0:04.016"), in seconds; a recorded
 * test video is a few milliseconds shorter or longer than asked.
 */
async function shownVideoDuration(page: Page): Promise<number> {
  const text = (await page.getByRole('status', { name: 'Video position' }).textContent()) ?? '';
  const match = /\/ (\d+):(\d+\.\d+)$/.exec(text.trim());
  if (match === null) throw new Error(`unexpected video position: ${text}`);
  return Number(match[1]) * 60 + Number(match[2]);
}

/** Screen point on the media timeline at a timeline second (100 px per second). */
async function trackPoint(page: Page, seconds: number) {
  const gridBox = await box(grid(page));
  const trackBox = await box(track(page));
  return { x: gridBox.x + seconds * 100, y: trackBox.y + trackBox.height / 2 };
}

async function clickTrack(page: Page, seconds: number) {
  const point = await trackPoint(page, seconds);
  await page.mouse.click(point.x, point.y);
}

/** Selects a timeline range on the media timeline and cuts it through the context menu. */
async function cutRange(page: Page, from: number, to: number) {
  await dragBetween(page, await trackPoint(page, from), await trackPoint(page, to));
  await expect(page.locator('.media-timeline__selection')).toBeVisible();
  const middle = await trackPoint(page, (from + to) / 2);
  await page.mouse.click(middle.x, middle.y, { button: 'right' });
  await page.getByRole('menuitem', { name: 'Delete range' }).click();
  await expect(cutMark(page)).toHaveCount(1);
}

async function expectBandWidth(page: Page, width: number, tolerance = 2) {
  await expect
    .poll(async () => Math.abs((await box(band(page))).width - width))
    .toBeLessThanOrEqual(tolerance);
}

test.beforeEach(async ({ page }) => {
  await openApp(page);
});

test('a selected range is cut from the media', async ({ page }) => {
  const video = await loadTestVideo(page);
  const duration = await shownVideoDuration(page);
  await cutRange(page, 1, 2);

  await expectBandWidth(page, (duration - 1) * 100);
  const gridBox = await box(grid(page));
  const markBox = await box(cutMark(page));
  expect(Math.abs(markBox.x + markBox.width / 2 - (gridBox.x + 100))).toBeLessThanOrEqual(2);

  await clickTrack(page, 1.5);
  await expect.poll(async () => Math.abs((await videoTime(video)) - 2.5)).toBeLessThanOrEqual(0.05);
});

test('playback skips the cut range', async ({ page }) => {
  await loadTestVideo(page);
  await cutRange(page, 1, 2);
  await clickTrack(page, 0.5);

  await playback(page).getByRole('button', { name: 'Play' }).click();
  await expect(playback(page).getByRole('button', { name: 'Pause' })).toBeVisible({
    timeout: 20_000,
  });

  const snapshot = () =>
    page.evaluate(() => {
      const element = document.querySelector<HTMLVideoElement>('.video-player__video');
      const text =
        document.querySelector('[aria-label="Playback position"]')?.textContent ?? '0:00.000';
      const [, minutes, seconds] = /^(\d+):(\d+\.\d+)/.exec(text) ?? ['', '0', '0'];
      return {
        currentTime: element?.currentTime ?? -1,
        timeline: Number(minutes) * 60 + Number(seconds),
      };
    });

  let found = { currentTime: -1, timeline: -1 };
  await expect
    .poll(
      async () => {
        found = await snapshot();
        return found.timeline >= 1.3 && found.timeline <= 2.5;
      },
      { intervals: [50], timeout: 10_000 },
    )
    .toBe(true);
  expect(Math.abs(found.currentTime - (found.timeline + 1))).toBeLessThanOrEqual(0.15);

  await playback(page).getByRole('button', { name: 'Pause' }).click();
});

test('a cut is undone and redone', async ({ page }) => {
  await loadTestVideo(page);
  const duration = await shownVideoDuration(page);
  await cutRange(page, 1, 2);

  await pianoRoll(page).getByRole('button', { name: 'Undo' }).click();
  await expectBandWidth(page, duration * 100);
  await expect(cutMark(page)).toHaveCount(0);

  await pianoRoll(page).getByRole('button', { name: 'Redo' }).click();
  await expectBandWidth(page, (duration - 1) * 100);
  await expect(cutMark(page)).toHaveCount(1);
});

test('the end of a cut is dragged', async ({ page }) => {
  await loadTestVideo(page);
  const duration = await shownVideoDuration(page);
  await cutRange(page, 1, 2);

  const edge = await box(page.getByRole('slider', { name: 'End of cut 1' }));
  const from = { x: edge.x + edge.width / 2, y: edge.y + edge.height / 2 };
  await dragBetween(page, from, { x: from.x + 50, y: from.y });
  await expectBandWidth(page, (duration - 1.5) * 100, 3);

  await pianoRoll(page).getByRole('button', { name: 'Undo' }).click();
  await expectBandWidth(page, (duration - 1) * 100);
});

test('a cut is removed from its context menu', async ({ page }) => {
  await loadTestVideo(page);
  const duration = await shownVideoDuration(page);
  await cutRange(page, 1, 2);

  const mark = await box(cutMark(page));
  await page.mouse.click(mark.x + mark.width / 2, mark.y + mark.height / 2, { button: 'right' });
  await page.getByRole('menuitem', { name: 'Remove cut' }).click();
  await expect(cutMark(page)).toHaveCount(0);
  await expectBandWidth(page, duration * 100);
});

test('a cut after bar 1 keeps the offset', async ({ page }) => {
  const video = await loadTestVideo(page);
  await field(page).fill('1');
  await field(page).press('Enter');
  await expect(page.getByText('0:01.000 before bar 1')).toBeVisible();

  await cutRange(page, 0.5, 1);
  // Timeline 0.6 s is media 1.6 s without the cut; the cut of media 1.5–2.0 s makes it 2.1 s.
  await clickTrack(page, 0.6);
  await expect.poll(async () => Math.abs((await videoTime(video)) - 2.1)).toBeLessThanOrEqual(0.05);
});

test('the waveform shades the cut', async ({ page }) => {
  await loadTestVideo(page, true);
  await cutRange(page, 1, 2);
  const shade = audioTrack(page).locator('.media-cuts-overlay__cut');
  await expect(shade).toHaveCount(1);
  expect((await box(shade)).width).toBeGreaterThan(0);
});
