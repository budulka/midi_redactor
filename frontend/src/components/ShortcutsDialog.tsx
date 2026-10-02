import { Fragment, useEffect, useId, useMemo, useRef, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { HELP_NOTE, buildHelpSections, type HelpRow } from '../utils/helpSections.ts';
import { handleShortcut } from '../utils/shortcutRegistry.ts';
import './ShortcutsDialog.css';

interface ShortcutsDialogProps {
  /** Called on Escape, on Close and on a mousedown on the backdrop. */
  readonly onClose: () => void;
}

function RowInputs({ row }: { readonly row: HelpRow }) {
  if (row.kind === 'mouse') {
    return <span className="shortcuts-dialog__gesture">{row.inputs.join(', ')}</span>;
  }
  return (
    <>
      {row.inputs.map((input, index) => (
        <Fragment key={input}>
          {index > 0 && ', '}
          <kbd>{input}</kbd>
        </Fragment>
      ))}
    </>
  );
}

/**
 * Modal window with every keyboard shortcut and mouse action, built from the shortcut registry and
 * the mouse action catalog. Rendered into document.body; the focus stays inside while it is open.
 */
export default function ShortcutsDialog({ onClose }: ShortcutsDialogProps) {
  const sections = useMemo(buildHelpSections, []);
  const baseId = useId();
  const titleId = `${baseId}-title`;
  const noteId = `${baseId}-note`;
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  useEffect(() => {
    // A focus outside the window (programmatic focus, autofocus) goes back to the window.
    function guard(event: FocusEvent) {
      const dialog = dialogRef.current;
      if (dialog === null) return;
      if (event.target instanceof Node && dialog.contains(event.target)) return;
      dialog.focus();
    }
    document.addEventListener('focusin', guard);
    return () => document.removeEventListener('focusin', guard);
  }, []);

  function moveFocus(direction: 1 | -1) {
    const stops = [closeRef.current, bodyRef.current].filter(
      (element): element is HTMLButtonElement | HTMLDivElement => element !== null,
    );
    if (stops.length === 0) return;
    const index = stops.findIndex((element) => element === document.activeElement);
    let next: number;
    if (index === -1) {
      next = direction === 1 ? 0 : stops.length - 1;
    } else {
      next = (index + direction + stops.length) % stops.length;
    }
    stops[next].focus();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    handleShortcut('infoDialog', event, {
      close: onClose,
      focusNext: () => moveFocus(1),
      focusPrevious: () => moveFocus(-1),
    });
  }

  return createPortal(
    <div
      className="shortcuts-dialog__backdrop"
      onMouseDown={(event) => {
        if (event.target !== event.currentTarget) return;
        event.preventDefault();
        onClose();
      }}
    >
      <div
        ref={dialogRef}
        className="shortcuts-dialog"
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        aria-labelledby={titleId}
        aria-describedby={noteId}
        onKeyDown={handleKeyDown}
      >
        <div className="shortcuts-dialog__header">
          <h2 id={titleId}>Keyboard shortcuts and mouse actions</h2>
          <button ref={closeRef} type="button" onClick={onClose}>
            Close
          </button>
        </div>
        <p id={noteId} className="shortcuts-dialog__note">
          {HELP_NOTE}
        </p>
        <div
          ref={bodyRef}
          className="shortcuts-dialog__body"
          role="region"
          aria-label="Shortcut list"
          tabIndex={0}
        >
          {sections.map((section) => (
            <section key={section.id} aria-labelledby={`${baseId}-${section.id}`}>
              <h3 id={`${baseId}-${section.id}`}>{section.title}</h3>
              {section.where !== '' && <p className="shortcuts-dialog__where">{section.where}</p>}
              <table className="shortcuts-dialog__table">
                <tbody>
                  {section.rows.map((row) => (
                    <tr key={row.id} data-kind={row.kind}>
                      <th scope="row">
                        <RowInputs row={row} />
                      </th>
                      <td>{row.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}
