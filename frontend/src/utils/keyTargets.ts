/** Input types without text entry; Space and Enter activate or toggle them. */
const NON_TEXT_INPUT_TYPES: readonly string[] = [
  'checkbox',
  'radio',
  'button',
  'submit',
  'reset',
  'range',
  'file',
  'color',
  'image',
];

const ACTIVATION_ROLES: readonly string[] = ['button', 'checkbox', 'slider', 'switch'];

function asElement(target: EventTarget | null): Element | null {
  return target instanceof Element ? target : null;
}

/** True for text fields, where the browser handles typing, text undo and Space itself. */
export function isTextEntryTarget(target: EventTarget | null): boolean {
  const element = asElement(target);
  if (element === null) return false;
  if (element instanceof HTMLTextAreaElement) return true;
  if (element instanceof HTMLInputElement) {
    return !NON_TEXT_INPUT_TYPES.includes(element.type);
  }
  return element.closest('[contenteditable=""], [contenteditable="true"]') !== null;
}

/** True for elements where Space has a native action (press, toggle, open a list). */
export function isActivationTarget(target: EventTarget | null): boolean {
  const element = asElement(target);
  if (element === null) return false;
  if (
    element instanceof HTMLButtonElement ||
    element instanceof HTMLSelectElement ||
    element.matches('a[href], summary')
  ) {
    return true;
  }
  if (element instanceof HTMLInputElement && NON_TEXT_INPUT_TYPES.includes(element.type)) {
    return true;
  }
  const role = element.getAttribute('role');
  return role !== null && ACTIVATION_ROLES.includes(role);
}

/** True inside an open modal dialog ([aria-modal="true"]). */
export function isInsideModal(target: EventTarget | null): boolean {
  const element = asElement(target);
  if (element === null) return false;
  return element.closest('[aria-modal="true"]') !== null;
}
