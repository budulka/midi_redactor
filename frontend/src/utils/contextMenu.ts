/** Space a context menu keeps from the edges of the window, px. */
export const MENU_MARGIN_PX = 4;

/** Top left corner of a menu opened at (x, y), moved so that it stays inside the window. */
export function fitMenuPosition(
  x: number,
  y: number,
  menuWidth: number,
  menuHeight: number,
  viewportWidth: number,
  viewportHeight: number,
): { left: number; top: number } {
  return {
    left: Math.max(MENU_MARGIN_PX, Math.min(x, viewportWidth - menuWidth - MENU_MARGIN_PX)),
    top: Math.max(MENU_MARGIN_PX, Math.min(y, viewportHeight - menuHeight - MENU_MARGIN_PX)),
  };
}
