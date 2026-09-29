import { expect, type Locator, type Page } from '@playwright/test';

// Geometry of the editor at its default zoom. The values mirror ROW_HEIGHT_PX,
// DEFAULT_PIXELS_PER_SECOND and MAX_PITCH in src/utils/pianoRollGeometry.ts / src/state/constants.ts
// and PEDAL_ROW_HEIGHT_PX in src/utils/pedalGeometry.ts. They are copied on purpose: the e2e tests
// treat the UI as a black box and do not load application modules.
export const ROW_HEIGHT = 14;
export const PX_PER_SECOND = 100;
export const MAX_PITCH = 108;
export const PEDAL_ROW_HEIGHT = 20;

export const C4 = 60;
export const E4 = 64;
export const G4 = 67;

export type Modifier = 'Shift' | 'ControlOrMeta';

export interface ScreenPoint {
  readonly x: number;
  readonly y: number;
}

/** Opens the app and waits until the backend answers. */
export async function openApp(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.getByText('backend: online')).toBeVisible();
}

export function grid(page: Page): Locator {
  return page.getByRole('application', { name: 'Note grid' });
}

export function pedalLane(page: Page): Locator {
  return page.getByRole('application', { name: 'Pedal lane' });
}

async function box(locator: Locator): Promise<{ x: number; y: number }> {
  const rect = await locator.boundingBox();
  if (rect === null) throw new Error('element is not visible');
  return rect;
}

/** Viewport point at a time (s) in the middle of the row of a pitch. */
export async function gridPoint(page: Page, time: number, pitch: number): Promise<ScreenPoint> {
  const origin = await box(grid(page));
  return {
    x: origin.x + time * PX_PER_SECOND,
    y: origin.y + (MAX_PITCH - pitch) * ROW_HEIGHT + ROW_HEIGHT / 2,
  };
}

/** Viewport point at a time (s) in the middle of a pedal lane row (0 sustain, 1 sostenuto, 2 soft). */
export async function lanePoint(page: Page, time: number, row: number): Promise<ScreenPoint> {
  const origin = await box(pedalLane(page));
  return {
    x: origin.x + time * PX_PER_SECOND,
    y: origin.y + row * PEDAL_ROW_HEIGHT + PEDAL_ROW_HEIGHT / 2,
  };
}

async function withModifiers(
  page: Page,
  modifiers: readonly Modifier[],
  action: () => Promise<void>,
): Promise<void> {
  for (const modifier of modifiers) await page.keyboard.down(modifier);
  try {
    await action();
  } finally {
    for (const modifier of [...modifiers].reverse()) await page.keyboard.up(modifier);
  }
}

export async function clickAt(
  page: Page,
  point: ScreenPoint,
  modifiers: readonly Modifier[] = [],
): Promise<void> {
  await withModifiers(page, modifiers, () => page.mouse.click(point.x, point.y));
}

export async function clickGrid(
  page: Page,
  time: number,
  pitch: number,
  modifiers: readonly Modifier[] = [],
): Promise<void> {
  await clickAt(page, await gridPoint(page, time, pitch), modifiers);
}

/** Drags with the left button; `during` runs while the button is still held down. */
export async function dragBetween(
  page: Page,
  from: ScreenPoint,
  to: ScreenPoint,
  modifiers: readonly Modifier[] = [],
  during?: () => Promise<void>,
): Promise<void> {
  await withModifiers(page, modifiers, async () => {
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 5 });
    if (during !== undefined) await during();
    await page.mouse.up();
  });
}

export function noteByLabel(page: Page, label: string): Locator {
  return page.locator(`[data-testid="note"][aria-label="${label}"]`);
}

export function notes(page: Page): Locator {
  return page.getByTestId('note');
}

export function selectedNotes(page: Page): Locator {
  return page.locator('[data-testid="note"][data-selected="true"]');
}

export function pedals(page: Page): Locator {
  return page.getByTestId('pedal');
}

/** Creates notes C4 at 0.5 s, E4 at 1 s and G4 at 1.5 s, one grid step (0.125 s) each. */
export async function createThreeNotes(page: Page): Promise<void> {
  await clickGrid(page, 0.52, C4);
  await clickGrid(page, 1.02, E4);
  await clickGrid(page, 1.52, G4);
  await expect(notes(page)).toHaveCount(3);
}
