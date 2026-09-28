/**
 * Smallest multiple of step that is not less than value. Range inputs snap their value to the
 * step, so a max rounded up this way lets the thumb reach the end of a media file whose duration
 * is not a multiple of the step. Works in whole milliseconds to avoid float drift.
 */
export function ceilToStep(value: number, step: number): number {
  const stepMs = Math.round(step * 1000);
  return (Math.ceil(Math.round(value * 1000) / stepMs) * stepMs) / 1000;
}

/** Slider value for a position: the end of the file maps to the (rounded up) slider max. */
export function seekSliderValue(seconds: number, duration: number, max: number): number {
  return seconds >= duration ? max : seconds;
}
