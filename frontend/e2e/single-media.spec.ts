import { expect, test, type Page } from '@playwright/test';
import { openApp } from './helpers.ts';
import {
  loadAudio,
  loadVideo,
  makeTestWav,
  mediaElements,
  objectUrlOf,
  objectUrls,
  recordTestVideo,
  trackObjectUrls,
} from './media.ts';

const DRAW_TIMEOUT_MS = 10_000;

const audioTrack = (page: Page) => page.getByRole('region', { name: 'Audio track' });
const videoPanel = (page: Page) => page.getByRole('region', { name: 'Video' });
const playback = (page: Page) => page.getByRole('group', { name: 'Playback' });

async function loadVideoWithSound(page: Page, name = 'with-sound.webm') {
  const buffer = await recordTestVideo(page, {
    width: 320,
    height: 180,
    durationMs: 2000,
    withSound: true,
  });
  return loadVideo(page, name, buffer);
}

/** Waits until WaveSurfer has drawn the sound of the video on the audio track. */
async function expectVideoSoundDrawn(page: Page) {
  const waveform = audioTrack(page).getByTestId('video-waveform');
  await expect(waveform.locator('> *')).not.toHaveCount(0, { timeout: DRAW_TIMEOUT_MS });
  await expect(audioTrack(page).getByText(/Drawing the sound/)).toHaveCount(0, {
    timeout: DRAW_TIMEOUT_MS,
  });
  await expect(audioTrack(page).getByText(/No sound to show/)).toHaveCount(0);
  return waveform;
}

test.beforeEach(async ({ page }) => {
  await trackObjectUrls(page);
  await openApp(page);
});

test('a video replaces the audio file and its sound is drawn', async ({ page }) => {
  await loadAudio(page, 'tone.wav', makeTestWav(2));
  const toneUrl = await objectUrlOf(page, 'tone.wav');
  const video = await loadVideoWithSound(page);

  await expect(audioTrack(page).locator('.audio-track__name')).toHaveText(
    'Video sound: with-sound.webm',
  );
  await expect(page.getByRole('button', { name: 'Remove audio' })).toBeDisabled();
  expect((await objectUrls(page)).revoked).toContain(toneUrl);

  const elements = await mediaElements(page);
  expect(elements.map((element) => element.tag)).toEqual(['video']);

  await expectVideoSoundDrawn(page);
  const videoUrl = await objectUrlOf(page, 'with-sound.webm');
  expect(await video.evaluate((element: HTMLVideoElement) => element.currentSrc)).toBe(videoUrl);
});

test('an audio file replaces the video', async ({ page }) => {
  const buffer = await recordTestVideo(page, { width: 320, height: 180 });
  await loadVideo(page, 'silent.webm', buffer);
  const videoUrl = await objectUrlOf(page, 'silent.webm');

  await loadAudio(page, 'tone.wav', makeTestWav(2));

  await expect(videoPanel(page).getByText(/Drop a video file here/)).toBeVisible();
  expect((await objectUrls(page)).revoked).toContain(videoUrl);
  const tags = (await mediaElements(page)).map((element) => element.tag);
  expect(tags).not.toContain('video');
  expect(tags.filter((tag) => tag === 'audio').length).toBeLessThanOrEqual(1);
  await expect(page.getByTestId('video-waveform')).toHaveCount(0);
});

test('only one media file sounds', async ({ page }) => {
  await loadAudio(page, 'tone.wav', makeTestWav(2));
  await loadVideoWithSound(page);

  await playback(page).getByRole('button', { name: 'Play' }).click();
  await expect(playback(page).getByRole('button', { name: 'Pause' })).toBeVisible({
    timeout: 20_000,
  });
  await page.waitForTimeout(500);

  const playing = (await mediaElements(page)).filter((element) => !element.paused);
  expect(playing.map((element) => element.tag)).toEqual(['video']);
  await playback(page).getByRole('button', { name: 'Pause' }).click();
});

test('a video without sound says there is nothing to draw', async ({ page }) => {
  const buffer = await recordTestVideo(page, { width: 320, height: 180 });
  await loadVideo(page, 'silent.webm', buffer);

  await expect(
    audioTrack(page).getByText(
      'No sound to show: "silent.webm" has no audio track or the browser cannot decode it.',
    ),
  ).toBeVisible({ timeout: DRAW_TIMEOUT_MS });
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('a click on the video sound seeks the timeline', async ({ page }) => {
  const video = await loadVideoWithSound(page);
  const waveform = await expectVideoSoundDrawn(page);

  const box = await waveform.boundingBox();
  if (box === null) throw new Error('the waveform is not visible');
  await page.mouse.click(box.x + box.width * 0.75, box.y + box.height / 2);

  await expect
    .poll(() => video.evaluate((element: HTMLVideoElement) => element.currentTime))
    .toBeGreaterThan(1);
  await expect(page.getByRole('status', { name: 'Playback position' })).not.toHaveText(
    /^0:00\.000/,
  );
});

test('a rejected file replaces nothing', async ({ page }) => {
  await loadAudio(page, 'tone.wav', makeTestWav(2));
  const toneUrl = await objectUrlOf(page, 'tone.wav');

  await page.getByLabel('Video file').setInputFiles({
    name: 'broken.avi',
    mimeType: 'video/x-msvideo',
    buffer: Buffer.from('nope'),
  });

  await expect(videoPanel(page).getByRole('alert')).toContainText('Unsupported file "broken.avi"');
  await expect(audioTrack(page).locator('.audio-track__name')).toHaveText('tone.wav');
  expect((await objectUrls(page)).revoked).not.toContain(toneUrl);
});
