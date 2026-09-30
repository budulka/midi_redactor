import { expect, test, type Page } from '@playwright/test';
import { C4, clickGrid, grid, notes, openApp, PX_PER_SECOND } from './helpers.ts';
import {
  dragSplitterBy,
  dragSplitterTo,
  editorScrollWidth,
  expectNoHorizontalOverflow,
  expectVideoInsidePanel,
  loadVideo,
  mediaPanelWidth,
  recordTestVideo,
  splitter,
} from './media.ts';

// Every test gets a new browser context, so localStorage starts empty and the panel is 360 px.

const STORAGE_KEY = 'midiRedactor.mediaPanelWidth';
const DRAW_TIMEOUT_MS = 10_000;

async function storedWidth(page: Page): Promise<string | null> {
  return page.evaluate((key) => window.localStorage.getItem(key), STORAGE_KEY);
}

async function expectPanelWidth(page: Page, width: number): Promise<void> {
  await expect(splitter(page)).toHaveAttribute('aria-valuenow', String(width));
  expect(Math.abs((await mediaPanelWidth(page)) - width)).toBeLessThanOrEqual(1);
}

async function widthOf(page: Page, selector: string): Promise<number> {
  const box = await page.locator(selector).boundingBox();
  if (box === null) throw new Error(`${selector} is not visible`);
  return box.width;
}

/** CSS width covered by the canvases WaveSurfer draws in the shadow root of the video waveform. */
async function videoWaveformCanvasWidth(page: Page): Promise<number> {
  return page.locator('[data-testid="video-waveform"]').evaluate((container) => {
    const canvases: HTMLCanvasElement[] = [];
    const visit = (root: Element | ShadowRoot) => {
      for (const element of Array.from(root.querySelectorAll('*'))) {
        if (element instanceof HTMLCanvasElement) canvases.push(element);
        if (element.shadowRoot !== null) visit(element.shadowRoot);
      }
    };
    visit(container);
    if (canvases.length === 0) return 0;
    const rects = canvases.map((canvas) => canvas.getBoundingClientRect());
    return (
      Math.max(...rects.map((rect) => rect.right)) - Math.min(...rects.map((rect) => rect.left))
    );
  });
}

test.beforeEach(async ({ page }) => {
  await openApp(page);
});

test('the panel is 360 px wide by default', async ({ page }) => {
  await expectPanelWidth(page, 360);
  await expectNoHorizontalOverflow(page);
});

test('dragging the splitter resizes the panel and the piano roll takes the rest', async ({
  page,
}) => {
  const before = await editorScrollWidth(page);

  await dragSplitterBy(page, -200);

  await expectPanelWidth(page, 560);
  expect(Math.abs((await editorScrollWidth(page)) - (before - 200))).toBeLessThanOrEqual(2);
  await expectNoHorizontalOverflow(page);
  expect(await storedWidth(page)).toBe('560');
});

test('the width survives a reload', async ({ page }) => {
  await dragSplitterBy(page, -200);
  await expectPanelWidth(page, 560);

  await page.reload();
  await openApp(page);

  await expectPanelWidth(page, 560);
});

test('the width stays within the limits', async ({ page }) => {
  const viewport = page.viewportSize();
  if (viewport === null) throw new Error('no viewport');

  await dragSplitterTo(page, () => viewport.width - 5);
  await expectPanelWidth(page, 240);
  await expectNoHorizontalOverflow(page);

  await dragSplitterTo(page, () => 5);
  await expectPanelWidth(page, 960);
  expect(await widthOf(page, 'main[aria-label="MIDI editor"]')).toBeGreaterThanOrEqual(472);
  await expectNoHorizontalOverflow(page);
});

test('the video and the waveforms fit a panel of any width', async ({ page }) => {
  const buffer = await recordTestVideo(page, {
    width: 3840,
    height: 240,
    durationMs: 2000,
    withSound: true,
  });
  await loadVideo(page, 'with-sound.webm', buffer);
  const audioTrack = page.getByRole('region', { name: 'Audio track' });
  await expect(page.getByTestId('video-waveform').locator('> *')).not.toHaveCount(0, {
    timeout: DRAW_TIMEOUT_MS,
  });
  await expect(audioTrack.getByText(/Drawing the sound/)).toHaveCount(0, {
    timeout: DRAW_TIMEOUT_MS,
  });
  await expect(audioTrack.getByText(/No sound to show/)).toHaveCount(0);

  const actions: [string, number, () => Promise<void>][] = [
    ['Home', 240, () => splitter(page).press('Home')],
    ['End', 960, () => splitter(page).press('End')],
    ['double-click', 360, () => splitter(page).dblclick()],
  ];
  for (const [name, width, action] of actions) {
    await action();
    await expectPanelWidth(page, width);

    await expectNoHorizontalOverflow(page);
    await expectVideoInsidePanel(page);

    const videoWaveform = await widthOf(page, '[data-testid="video-waveform"]');
    const waveform = await widthOf(page, '[data-testid="waveform"]');
    const section = await widthOf(page, 'section[aria-label="Audio track"]');
    expect(Math.abs(videoWaveform - waveform), name).toBeLessThanOrEqual(1);
    expect(Math.abs(waveform - (section - 16)), name).toBeLessThanOrEqual(1);

    await expect
      .poll(async () => Math.abs((await videoWaveformCanvasWidth(page)) - videoWaveform), {
        message: `the waveform is redrawn after ${name}`,
        timeout: 2000,
      })
      .toBeLessThanOrEqual(2);
  }
});

test('the splitter works with the keyboard', async ({ page }) => {
  await splitter(page).focus();

  await page.keyboard.press('ArrowLeft');
  await expectPanelWidth(page, 376);
  await page.keyboard.press('Shift+ArrowRight');
  await expectPanelWidth(page, 312);
  await page.keyboard.press('Home');
  await expectPanelWidth(page, 240);
  await page.keyboard.press('End');
  await expectPanelWidth(page, 960);
  expect(await storedWidth(page)).toBe('960');

  await expect(splitter(page)).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Video file')).toBeFocused();
  const insidePanel = await page.evaluate(
    () =>
      document.querySelector('aside[aria-label="Media"]')?.contains(document.activeElement) ??
      false,
  );
  expect(insidePanel).toBe(true);
});

test('the piano roll works after a resize', async ({ page }) => {
  await dragSplitterBy(page, -300);
  await expectPanelWidth(page, 660);

  await clickGrid(page, 1.02, C4);
  await expect(notes(page)).toHaveCount(1);
  const gridBox = await grid(page).boundingBox();
  const noteBox = await notes(page).first().boundingBox();
  if (gridBox === null || noteBox === null) throw new Error('the grid or the note is not visible');
  expect(Math.abs(noteBox.x - (gridBox.x + 1.0 * PX_PER_SECOND))).toBeLessThanOrEqual(2);

  const scroll = await page.locator('.piano-roll__scroll').evaluate((element) => {
    element.scrollLeft = element.scrollWidth;
    return {
      scrollLeft: element.scrollLeft,
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
    };
  });
  expect(Math.abs(scroll.scrollLeft + scroll.clientWidth - scroll.scrollWidth)).toBeLessThanOrEqual(
    1,
  );
  await expectNoHorizontalOverflow(page);
});

test('dragging the splitter neither edits the project nor seeks', async ({ page }) => {
  await dragSplitterBy(page, -400);

  await expectPanelWidth(page, 760);
  await expect(notes(page)).toHaveCount(0);
  await expect(page.getByRole('status', { name: 'Playback position' })).toHaveText(/^0:00\.000/);
});

test('the panel follows the window width', async ({ page }) => {
  await splitter(page).press('End');
  await expectPanelWidth(page, 960);

  await page.setViewportSize({ width: 1024, height: 768 });
  await expectPanelWidth(page, 544);
  await expect(splitter(page)).toHaveAttribute('aria-valuemax', '544');
  await expectNoHorizontalOverflow(page);

  await page.setViewportSize({ width: 1440, height: 900 });
  await expectPanelWidth(page, 960);
  expect(await storedWidth(page)).toBe('960');
});
