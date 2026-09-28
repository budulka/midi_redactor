import { ceilToStep, seekSliderValue } from './seekSlider.ts';

describe('ceilToStep', () => {
  it('keeps multiples of the step', () => {
    expect(ceilToStep(65, 0.1)).toBe(65);
    expect(ceilToStep(0, 0.1)).toBe(0);
    expect(ceilToStep(2.3, 0.1)).toBe(2.3);
  });

  it('rounds other values up to the step', () => {
    expect(ceilToStep(12.345, 0.1)).toBe(12.4);
    expect(ceilToStep(12.301, 0.1)).toBe(12.4);
  });
});

describe('seekSliderValue', () => {
  it('maps the end of the file to the slider max', () => {
    expect(seekSliderValue(2.5, 12.345, 12.4)).toBe(2.5);
    expect(seekSliderValue(12.345, 12.345, 12.4)).toBe(12.4);
  });
});
