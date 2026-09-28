/**
 * Focuses an element after a mouse press without showing the keyboard focus ring.
 * The element gets `data-pointer-focus="true"` until it loses focus; CSS hides the
 * `:focus-visible` outline while the attribute is present. Keyboard focus (Tab) never sets it,
 * so the outline stays visible for keyboard users.
 */
export function focusFromPointer(element: HTMLElement | null): void {
  if (element === null) return;
  if (element.dataset.pointerFocus !== 'true') {
    element.dataset.pointerFocus = 'true';
    element.addEventListener(
      'blur',
      () => {
        delete element.dataset.pointerFocus;
      },
      { once: true },
    );
  }
  element.focus({ preventScroll: true });
}
