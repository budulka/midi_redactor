import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { fitMenuPosition } from '../utils/contextMenu.ts';

export interface ContextMenuItem {
  readonly label: string;
  readonly onSelect: () => void;
}

interface ContextMenuProps {
  /** Viewport coordinates of the pointer. */
  readonly x: number;
  readonly y: number;
  readonly label: string;
  readonly items: readonly ContextMenuItem[];
  /** Called after an item is chosen and on Escape, a mousedown outside, scroll, resize or window blur. */
  readonly onClose: () => void;
}

function focusElement(element: Element | null): void {
  if (element instanceof HTMLElement && element.isConnected) element.focus();
}

/**
 * A small menu at the pointer, rendered into document.body so that no scroll container clips it.
 * The first item gets the focus; the arrows, Home and End move it, Escape closes the menu and
 * gives the focus back.
 */
export default function ContextMenu({ x, y, label, items, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLUListElement>(null);
  const [position, setPosition] = useState({ left: x, top: y });
  const [returnFocusTo] = useState<Element | null>(() => document.activeElement);
  const onCloseRef = useRef(onClose);
  useLayoutEffect(() => {
    onCloseRef.current = onClose;
  });

  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (menu === null) return;
    const rect = menu.getBoundingClientRect();
    setPosition(
      fitMenuPosition(x, y, rect.width, rect.height, window.innerWidth, window.innerHeight),
    );
  }, [x, y]);

  useEffect(() => {
    menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
  }, []);

  useEffect(() => {
    const close = () => onCloseRef.current();
    const onMouseDown = (event: MouseEvent) => {
      const menu = menuRef.current;
      if (menu !== null && event.target instanceof Node && menu.contains(event.target)) return;
      focusElement(returnFocusTo);
      close();
    };
    window.addEventListener('mousedown', onMouseDown, true);
    window.addEventListener('resize', close);
    window.addEventListener('blur', close);
    window.addEventListener('scroll', close, true);
    return () => {
      window.removeEventListener('mousedown', onMouseDown, true);
      window.removeEventListener('resize', close);
      window.removeEventListener('blur', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [returnFocusTo]);

  const onKeyDown = (event: ReactKeyboardEvent<HTMLUListElement>) => {
    const buttons = Array.from(
      menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [],
    );
    if (buttons.length === 0) return;
    const index = buttons.findIndex((button) => button === document.activeElement);
    let next: number | null = null;
    switch (event.key) {
      case 'ArrowDown':
        next = (index + 1) % buttons.length;
        break;
      case 'ArrowUp':
        next = (index - 1 + buttons.length) % buttons.length;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = buttons.length - 1;
        break;
      case 'Escape':
        event.preventDefault();
        event.stopPropagation();
        focusElement(returnFocusTo);
        onCloseRef.current();
        return;
      default:
        return;
    }
    event.preventDefault();
    event.stopPropagation();
    buttons[next].focus();
  };

  return createPortal(
    <ul
      ref={menuRef}
      role="menu"
      aria-label={label}
      className="context-menu"
      style={{ left: position.left, top: position.top }}
      onKeyDown={onKeyDown}
      onContextMenu={(event) => event.preventDefault()}
    >
      {items.map((item) => (
        <li key={item.label} role="none">
          <button
            type="button"
            role="menuitem"
            className="context-menu__item"
            onClick={() => {
              onCloseRef.current();
              item.onSelect();
            }}
          >
            {item.label}
          </button>
        </li>
      ))}
    </ul>,
    document.body,
  );
}
