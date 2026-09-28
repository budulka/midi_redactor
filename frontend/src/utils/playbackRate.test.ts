import {
  clampPlaybackRate,
  DEFAULT_PLAYBACK_RATE,
  formatPlaybackRate,
  MAX_PLAYBACK_RATE,
  MIN_PLAYBACK_RATE,
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
