import type { ChangeEvent } from 'react';

interface FileLoadButtonProps {
  /** Visible button text. */
  text: string;
  /** Accessible name of the file input. */
  inputLabel: string;
  accept: string;
  /** Disables the file input and dims the button. */
  disabled?: boolean;
  onFile(file: File): void;
}

/** A button-like label that opens the file dialog; the same file can be chosen again. */
export default function FileLoadButton({
  text,
  inputLabel,
  accept,
  disabled = false,
  onFile,
}: FileLoadButtonProps) {
  const onChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file !== undefined) onFile(file);
    // Lets the same file be chosen again.
    event.target.value = '';
  };

  return (
    <label className={disabled ? 'file-load file-load--disabled' : 'file-load'}>
      {text}
      <input
        type="file"
        className="visually-hidden"
        aria-label={inputLabel}
        accept={accept}
        disabled={disabled}
        onChange={onChange}
      />
    </label>
  );
}
