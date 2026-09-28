import { PEDAL_TYPES } from '../state/constants.ts';
import type { PedalEvent, PedalType } from '../state/types.ts';
import {
  RESIZE_HANDLE_PX,
  timeToX,
  type Point,
  type Rect,
  type ViewGeometry,
} from './pianoRollGeometry.ts';

export const PEDAL_ROW_HEIGHT_PX = 20;
export const PEDAL_LANE_HEIGHT_PX = PEDAL_TYPES.length * PEDAL_ROW_HEIGHT_PX;

export type PedalHitZone = 'body' | 'start' | 'end';

export interface PedalHit {
  readonly pedalId: string;
  readonly zone: PedalHitZone;
}

/** Top edge of the lane row of a pedal type; rows follow PEDAL_TYPES. */
export function pedalRowY(type: PedalType, rowHeight: number): number {
  return PEDAL_TYPES.indexOf(type) * rowHeight;
}

/** Pedal type of the lane row containing y; clamps outside the lane. */
export function pedalTypeAtY(y: number, rowHeight: number): PedalType {
  const index = Math.min(PEDAL_TYPES.length - 1, Math.max(0, Math.floor(y / rowHeight)));
  return PEDAL_TYPES[index];
}

/** Rectangle of a pedal in the lane; `g.rowHeight` is the height of one lane row. */
export function pedalRect(pedal: PedalEvent, g: ViewGeometry): Rect {
  return {
    x: timeToX(pedal.start, g),
    y: pedalRowY(pedal.type, g.rowHeight),
    width: (pedal.end - pedal.start) * g.pixelsPerSecond,
    height: g.rowHeight,
  };
}

/**
 * Finds the pedal under a point, scanning from the end like hitTestNotes. Each edge is a resize
 * handle of at most a third of the pedal width; the rest is the body.
 */
export function hitTestPedals(
  pedals: readonly PedalEvent[],
  point: Point,
  g: ViewGeometry,
  handlePx: number = RESIZE_HANDLE_PX,
): PedalHit | null {
  for (let index = pedals.length - 1; index >= 0; index -= 1) {
    const pedal = pedals[index];
    const rect = pedalRect(pedal, g);
    const inside =
      point.x >= rect.x &&
      point.x < rect.x + rect.width &&
      point.y >= rect.y &&
      point.y < rect.y + rect.height;
    if (!inside) continue;
    const handle = Math.min(handlePx, rect.width / 3);
    let zone: PedalHitZone = 'body';
    if (point.x < rect.x + handle) zone = 'start';
    else if (point.x >= rect.x + rect.width - handle) zone = 'end';
    return { pedalId: pedal.id, zone };
  }
  return null;
}
