import { focusFromPointer } from './focus.ts';

function focusableDiv(): HTMLDivElement {
  const div = document.createElement('div');
  div.tabIndex = 0;
  document.body.appendChild(div);
  return div;
}

describe('focusFromPointer', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('focuses the element and marks it until blur', () => {
    const div = focusableDiv();
    focusFromPointer(div);
    expect(document.activeElement).toBe(div);
    expect(div.dataset.pointerFocus).toBe('true');
    div.blur();
    expect(div.dataset.pointerFocus).toBeUndefined();
  });

  it('adds only one blur listener for repeated calls', () => {
    const div = focusableDiv();
    const addSpy = vi.spyOn(div, 'addEventListener');
    focusFromPointer(div);
    focusFromPointer(div);
    expect(addSpy).toHaveBeenCalledTimes(1);
    expect(() => div.blur()).not.toThrow();
    expect(div.dataset.pointerFocus).toBeUndefined();
  });

  it('marks the element again after it was blurred', () => {
    const div = focusableDiv();
    focusFromPointer(div);
    div.blur();
    focusFromPointer(div);
    expect(div.dataset.pointerFocus).toBe('true');
  });

  it('does nothing for null', () => {
    expect(() => focusFromPointer(null)).not.toThrow();
  });
});
