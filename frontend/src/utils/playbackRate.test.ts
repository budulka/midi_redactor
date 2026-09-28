import {
  clampPlaybackRate,
  DEFAULT_PLAYBACK_RATE,
  formatPlaybackRate,
  MAX_PLAYBACK_RATE,
  MIN_PLAYBACK_RATE,
  nudgedPlaybackRate,
  PLAYBACK_RATES,
} from './playbackRate.ts';

describe('PLAYBACK_RATES', () => {
  it('covers 0.25× to 2× in strictly ascending order', () => {
    expect(PLAYBACK_RATES[0]).toBe(0.25);
    expect(PLAYBACK_RATES[PLAYBACK_RATES.length - 1]).toBe(2);
    expect(PLAYBACK_RATES).toContain(1);
    for (let i = 1; i < PLAYBACK_RATES.length; i += 1) {
      expect(PLAYBACK_RATES[i]).toBeGreaterThan(PLAYBACK_RATES[i - 1] ?? Infinity);
    }
  });

  it('matches the limits', () => {
    expect(MIN_PLAYBACK_RATE).toBe(0.25);
    expect(MAX_PLAYBACK_RATE).toBe(2);
    expect(DEFAULT_PLAYBACK_RATE).toBe(1);
  });
});

describe('clampPlaybackRate', () => {
  it('keeps the rate within 0.25–2', () => {
    expect(clampPlaybackRate(0.1)).toBe(0.25);
    expect(clampPlaybackRate(3)).toBe(2);
    expect(clampPlaybackRate(0.5)).toBe(0.5);
  });

  it('handles non-finite values', () => {
    expect(clampPlaybackRate(NaN)).toBe(1);
    expect(clampPlaybackRate(Infinity)).toBe(2);
    expect(clampPlaybackRate(-Infinity)).toBe(0.25);
  });
});

describe('formatPlaybackRate', () => {
  it('appends the multiplication sign', () => {
    expect(formatPlaybackRate(0.25)).toBe('0.25×');
    expect(formatPlaybackRate(1)).toBe('1×');
    expect(formatPlaybackRate(1.5)).toBe('1.5×');
  });
});

describe('nudgedPlaybackRate', () => {
  it('multiplies the base rate by the nudge', () => {
    expect(nudgedPlaybackRate(1, 0.95)).toBe(0.95);
    expect(nudgedPlaybackRate(0.5, 0.97)).toBe(0.485);
    expect(nudgedPlaybackRate(2, 1.05)).toBe(2.1);
  });

  it('never goes below the minimum rate', () => {
    expect(nudgedPlaybackRate(0.25, 0.95)).toBe(0.25);
  });

  it('hides floating-point noise', () => {
    expect(nudgedPlaybackRate(0.7, 0.97)).toBe(0.679);
  });
});
