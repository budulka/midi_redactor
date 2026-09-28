import type { PedalEvent } from '../state/types.ts';
import {
  PEDAL_LANE_HEIGHT_PX,
  PEDAL_ROW_HEIGHT_PX,
  hitTestPedals,
  pedalRect,
  pedalRowY,
  pedalTypeAtY,
} from './pedalGeometry.ts';
import type { ViewGeometry } from './pianoRollGeometry.ts';

const g: ViewGeometry = { pixelsPerSecond: 100, rowHeight: PEDAL_ROW_HEIGHT_PX };

function pedal(id: string, type: PedalEvent['type'], start: number, end: number): PedalEvent {
  return { id, type, start, end };
}

describe('pedal lane rows', () => {
  it('has three rows of 20 px', () => {
    expect(PEDAL_LANE_HEIGHT_PX).toBe(60);
    expect(pedalRowY('sustain', 20)).toBe(0);
    expect(pedalRowY('sostenuto', 20)).toBe(20);
    expect(pedalRowY('soft', 20)).toBe(40);
  });

  it('maps y to a pedal type and clamps outside the lane', () => {
    expect(pedalTypeAtY(10, 20)).toBe('sustain');
    expect(pedalTypeAtY(30, 20)).toBe('sostenuto');
    expect(pedalTypeAtY(50, 20)).toBe('soft');
    expect(pedalTypeAtY(-5, 20)).toBe('sustain');
    expect(pedalTypeAtY(500, 20)).toBe('soft');
  });
});

describe('pedalRect', () => {
  it('places a pedal in its row', () => {
    expect(pedalRect(pedal('s', 'soft', 0.5, 1.5), g)).toEqual({
      x: 50,
      y: 40,
      width: 100,
      height: 20,
    });
  });
});

describe('hitTestPedals', () => {
  const a = pedal('a', 'sustain', 0.5, 1.5);

  it('finds the zone under the point', () => {
    expect(hitTestPedals([a], { x: 52, y: 10 }, g)).toEqual({ pedalId: 'a', zone: 'start' });
    expect(hitTestPedals([a], { x: 56, y: 10 }, g)).toEqual({ pedalId: 'a', zone: 'body' });
    expect(hitTestPedals([a], { x: 100, y: 10 }, g)).toEqual({ pedalId: 'a', zone: 'body' });
    expect(hitTestPedals([a], { x: 143, y: 10 }, g)).toEqual({ pedalId: 'a', zone: 'body' });
    expect(hitTestPedals([a], { x: 144, y: 10 }, g)).toEqual({ pedalId: 'a', zone: 'end' });
    expect(hitTestPedals([a], { x: 150, y: 10 }, g)).toBeNull();
    expect(hitTestPedals([a], { x: 100, y: 30 }, g)).toBeNull();
  });

  it('uses a third of the width for handles of narrow pedals', () => {
    const narrow = pedal('n', 'sustain', 1, 1.09);
    expect(hitTestPedals([narrow], { x: 102, y: 10 }, g)?.zone).toBe('start');
    expect(hitTestPedals([narrow], { x: 104, y: 10 }, g)?.zone).toBe('body');
    expect(hitTestPedals([narrow], { x: 106, y: 10 }, g)?.zone).toBe('end');
  });

  it('hits the pedal in the row under the point', () => {
    const sustain = pedal('s', 'sustain', 0, 1);
    const soft = pedal('f', 'soft', 0, 1);
    expect(hitTestPedals([sustain, soft], { x: 50, y: 10 }, g)?.pedalId).toBe('s');
    expect(hitTestPedals([sustain, soft], { x: 50, y: 50 }, g)?.pedalId).toBe('f');
  });

  it('returns null for no pedals', () => {
    expect(hitTestPedals([], { x: 0, y: 0 }, g)).toBeNull();
  });
});
