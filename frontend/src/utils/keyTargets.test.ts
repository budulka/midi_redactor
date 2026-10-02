import { isInsideModal } from './keyTargets.ts';

function button(wrapper: string): Element {
  const container = document.createElement('div');
  container.innerHTML = wrapper;
  document.body.append(container);
  const found = container.querySelector('button');
  if (found === null) throw new Error('no button');
  return found;
}

describe('isInsideModal', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('is true inside a modal dialog', () => {
    expect(
      isInsideModal(button('<div role="dialog" aria-modal="true"><p><button>b</button></p></div>')),
    ).toBe(true);
  });

  it('is false in a dialog that is not modal and outside dialogs', () => {
    expect(isInsideModal(button('<div role="dialog"><button>b</button></div>'))).toBe(false);
    expect(isInsideModal(document.body)).toBe(false);
    expect(isInsideModal(null)).toBe(false);
  });
});
