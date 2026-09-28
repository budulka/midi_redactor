import type { ChangeEvent } from 'react';

interface FileLoadButtonProps {
  /** Visible button text. */
  text: string;
  /** Accessible name of the file input. */
  inputLabel: string;
  accept: string;
  onFile(file: File): void;
}

/** A button-like label that opens the file dialog; the same file can be chosen again. */
export default function FileLoadButton({ text, inputLabel, accept, onFile }: FileLoadButtonProps) {
  const onChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file !== undefined) onFile(file);
    // Lets the same file be chosen again.
    event.target.value = '';
  };

  return (
    <label className="file-load">
      {text}
      <input
        type="file"
        className="visually-hidden"
        aria-label={inputLabel}
        accept={accept}
        onChange={onChange}
      />
    </label>
  );
}
