import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import ContextMenu from './ContextMenu.tsx';

function setup() {
  const order: string[] = [];
  const onClose = vi.fn(() => order.push('close'));
  const first = vi.fn(() => order.push('first'));
  const second = vi.fn();
  function Harness() {
    const [open, setOpen] = useState(false);
    return (
      <>
        <button type="button" onClick={() => setOpen(true)}>
          Opener
        </button>
        {open && (
          <ContextMenu
            x={120}
            y={80}
            label="Test actions"
            items={[
              { label: 'First', onSelect: first },
              { label: 'Second', onSelect: second },
            ]}
            onClose={() => {
              onClose();
              setOpen(false);
            }}
          />
        )}
      </>
    );
  }
  render(<Harness />);
  const opener = screen.getByRole('button', { name: 'Opener' });
  opener.focus();
  fireEvent.click(opener);
  return { opener, onClose, first, second, order };
}

describe('ContextMenu', () => {
  it('renders a labelled menu at the pointer with the first item focused', () => {
    setup();
    const menu = screen.getByRole('menu', { name: 'Test actions' });
    expect(screen.getAllByRole('menuitem')).toHaveLength(2);
    expect(screen.getByRole('menuitem', { name: 'First' })).toHaveFocus();
    expect(menu.style.left).toBe('120px');
    expect(menu.style.top).toBe('80px');
  });

  it('moves the focus with the arrows, Home and End', () => {
    setup();
    const menu = screen.getByRole('menu');
    const first = screen.getByRole('menuitem', { name: 'First' });
    const second = screen.getByRole('menuitem', { name: 'Second' });
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(second).toHaveFocus();
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(first).toHaveFocus();
    fireEvent.keyDown(menu, { key: 'ArrowUp' });
    expect(second).toHaveFocus();
    fireEvent.keyDown(menu, { key: 'Home' });
    expect(first).toHaveFocus();
    fireEvent.keyDown(menu, { key: 'End' });
    expect(second).toHaveFocus();
  });

  it('closes and then runs the chosen item', () => {
    const { onClose, first, second, order } = setup();
    fireEvent.click(screen.getByRole('menuitem', { name: 'First' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();
    expect(order).toEqual(['close', 'first']);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('closes on Escape and gives the focus back', () => {
    const { opener, onClose } = setup();
    const event = fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
    expect(event).toBe(false);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(opener).toHaveFocus();
  });

  it('closes on a mousedown outside the menu only', () => {
    const { onClose } = setup();
    fireEvent.mouseDown(screen.getByRole('menuitem', { name: 'Second' }));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.mouseDown(document.body);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it.each(['scroll', 'resize', 'blur'])('closes on a window %s', (type) => {
    const { onClose } = setup();
    fireEvent(window, new Event(type));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
