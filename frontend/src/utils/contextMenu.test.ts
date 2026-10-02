import { describe, expect, it } from 'vitest';
import { fitMenuPosition } from './contextMenu.ts';

describe('fitMenuPosition', () => {
  it('keeps a menu that fits where it was opened', () => {
    expect(fitMenuPosition(10, 10, 100, 50, 800, 600)).toEqual({ left: 10, top: 10 });
  });

  it('moves a menu back inside the window', () => {
    expect(fitMenuPosition(780, 590, 100, 50, 800, 600)).toEqual({ left: 696, top: 546 });
    expect(fitMenuPosition(-5, -5, 100, 50, 800, 600)).toEqual({ left: 4, top: 4 });
  });
});
