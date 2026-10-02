import { useEffect, useRef, useState } from 'react';
import ShortcutsDialog from './ShortcutsDialog.tsx';

/** The "Info" button of the top bar: opens the window with the shortcuts and mouse actions. */
export default function InfoButton() {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);

  useEffect(() => {
    // Runs after the dialog has unmounted and removed its focusin guard, which would otherwise
    // pull the focus back into the window.
    if (wasOpen.current && !open) buttonRef.current?.focus();
    wasOpen.current = open;
  }, [open]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className="info-button"
        aria-haspopup="dialog"
        aria-expanded={open}
        title="Keyboard shortcuts and mouse actions"
        onClick={() => setOpen(true)}
      >
        Info
      </button>
      {open && <ShortcutsDialog onClose={() => setOpen(false)} />}
    </>
  );
}
