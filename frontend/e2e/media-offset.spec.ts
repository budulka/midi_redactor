import { expect, test, type Locator, type Page } from '@playwright/test';
import { dragBetween, openApp } from './helpers.ts';
import { loadVideo, recordTestVideo } from './media.ts';

const DRAW_TIMEOUT_MS = 10_000;

const audioTrack = (page: Page) => page.getByRole('region', { name: 'Audio track' });
const pianoRoll = (page: Page) => page.getByRole('region', { name: 'Piano roll' });
const playback = (page: Page) => page.getByRole('group', { name: 'Playback' });
const field = (page: Page) => page.getByLabel('Media offset (seconds)');
const position = (page: Page) => page.getByRole('status', { name: 'Playback position' });
const marker = (page: Page) => page.getByRole('slider', { name: 'Bar 1 position in the media' });

const videoTime = (video: Locator) =>
  video.evaluate((element: HTMLVideoElement) => element.currentTime);

async function box(locator: Locator) {
  const rect = await locator.boundingBox();
  if (rect === null) throw new Error('element is not visible');
  return rect;
}

async function loadTestVideo(page: Page, withSound: boolean): Promise<Locator> {
  const buffer = await recordTestVideo(page, {
    width: 320,
    height: 180,
    durationMs: 2000,
    withSound,
  });
  return loadVideo(page, withSound ? 'with-sound.webm' : 'silent.webm', buffer);
}

/** Waits until WaveSurfer has drawn the sound of the video on the audio track. */
async function videoSoundDrawn(page: Page): Promise<Locator> {
  const waveform = audioTrack(page).getByTestId('video-waveform');
  await expect(waveform.locator('> *')).not.toHaveCount(0, { timeout: DRAW_TIMEOUT_MS });
  await expect(audioTrack(page).getByText(/Drawing the sound/)).toHaveCount(0, {
    timeout: DRAW_TIMEOUT_MS,
  });
  await expect(marker(page)).toBeVisible();
  return waveform;
}

async function setOffset(page: Page, value: string): Promise<void> {
  await field(page).fill(value);
  await field(page).press('Enter');
}

test.beforeEach(async ({ page }) => {
  await openApp(page);
});

test('a number moves the video under bar 1', async ({ page }) => {
  const video = await loadTestVideo(page, false);

  await setOffset(page, '1');
  await expect.poll(() => videoTime(video)).toBeCloseTo(1, 1);
  await expect(position(page)).toHaveText(/^0:00\.000/);

  await pianoRoll(page).getByRole('button', { name: 'Undo' }).click();
  await expect.poll(() => videoTime(video)).toBeCloseTo(0, 1);
  await expect(field(page)).toHaveValue('0');

  await pianoRoll(page).getByRole('button', { name: 'Redo' }).click();
  await expect.poll(() => videoTime(video)).toBeCloseTo(1, 1);
});

test('"Bar 1 here" makes the current frame bar 1', async ({ page }) => {
  const video = await loadTestVideo(page, true);
  const waveform = await videoSoundDrawn(page);

  const rect = await box(waveform);
  await page.mouse.click(rect.x + rect.width * 0.6, rect.y + rect.height / 2);
  await expect.poll(() => videoTime(video)).toBeGreaterThan(1);
  const frame = await videoTime(video);

  await page.getByRole('button', { name: 'Set bar 1 to the current media position' }).click();

  await expect
    .poll(async () => Math.abs(Number(await field(page).inputValue()) - frame))
    .toBeLessThanOrEqual(0.002);
  await expect(position(page)).toHaveText(/^0:00\.000/);
  expect(Math.abs((await videoTime(video)) - frame)).toBeLessThanOrEqual(0.02);
});

test('dragging the bar 1 marker sets the offset', async ({ page }) => {
  const video = await loadTestVideo(page, true);
  await videoSoundDrawn(page);

  const stage = await box(audioTrack(page).locator('.audio-track__stage'));
  const handle = await box(marker(page));
  const from = { x: handle.x + handle.width * 0.75, y: handle.y + handle.height / 2 };
  await dragBetween(page, from, { x: stage.x + stage.width * 0.5, y: from.y });

  await expect.poll(async () => Number(await field(page).inputValue())).toBeCloseTo(1, 1);
  await expect.poll(() => videoTime(video)).toBeCloseTo(1, 1);
  const shade = await box(audioTrack(page).locator('.media-offset-overlay__before'));
  expect(shade.width).toBeGreaterThan(0);

  await pianoRoll(page).getByRole('button', { name: 'Undo' }).click();
  await expect(field(page)).toHaveValue('0');
});

test('a negative offset holds the media until it starts', async ({ page }) => {
  await loadTestVideo(page, false);
  await setOffset(page, '-3');

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
        paused: element?.paused ?? false,
        currentTime: element?.currentTime ?? -1,
        timeline: Number(minutes) * 60 + Number(seconds),
      };
    });

  await expect
    .poll(
      async () => {
        const { paused, currentTime, timeline } = await snapshot();
        return timeline < 2.5 && paused && currentTime === 0;
      },
      { intervals: [50] },
    )
    .toBe(true);

  let startedAt = -1;
  await expect
    .poll(
      async () => {
        const { paused, timeline } = await snapshot();
        if (!paused) startedAt = timeline;
        return !paused;
      },
      { intervals: [50], timeout: 8_000 },
    )
    .toBe(true);
  expect(startedAt).toBeGreaterThanOrEqual(3);

  await playback(page).getByRole('button', { name: 'Pause' }).click();
});

test('a click on the intro brings the media back to bar 1', async ({ page }) => {
  const video = await loadTestVideo(page, true);
  const waveform = await videoSoundDrawn(page);

  await setOffset(page, '1');
  await expect.poll(() => videoTime(video)).toBeCloseTo(1, 1);
  await expect(position(page)).toHaveText(/^0:00\.000/);

  const rect = await box(waveform);
  await page.mouse.click(rect.x + rect.width * 0.2, rect.y + rect.height / 2);

  await expect.poll(() => videoTime(video)).toBeCloseTo(1, 1);
  await expect(position(page)).toHaveText(/^0:00\.000/);
});
