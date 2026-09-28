import { contextTimeAt, positionAt, type TransportAnchor } from './transportClock.ts';

describe('transport clock', () => {
  const anchor: TransportAnchor = { contextTime: 10, position: 2, rate: 1 };

  it('converts between the audio clock and the timeline', () => {
    expect(positionAt(anchor, 10.5)).toBeCloseTo(2.5);
    expect(contextTimeAt(anchor, 3)).toBeCloseTo(11);
  });

  it('does not move before the anchor', () => {
    expect(positionAt(anchor, 9.95)).toBe(2);
  });

  it('takes the rate into account', () => {
    const slow: TransportAnchor = { ...anchor, rate: 0.5 };
    expect(positionAt(slow, 11)).toBeCloseTo(2.5);
    expect(contextTimeAt(slow, 3)).toBeCloseTo(12);
  });

  it('is the inverse of contextTimeAt', () => {
    expect(positionAt(anchor, contextTimeAt(anchor, 7.25))).toBeCloseTo(7.25);
  });
});
