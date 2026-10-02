import { useState, type KeyboardEvent } from 'react';
import { handleShortcut } from '../utils/shortcutRegistry.ts';

interface CommitNumberInputProps {
  value: number;
  onCommit: (value: number) => void;
  label: string;
  min?: number;
  max?: number;
  step?: number;
  className?: string;
}

/**
 * Number field that keeps a local draft and commits it on Enter or blur, so one edit is one
 * change. Escape or a non-numeric draft restores the value from props.
 */
export default function CommitNumberInput({
  value,
  onCommit,
  label,
  min,
  max,
  step,
  className,
}: CommitNumberInputProps) {
  const [draft, setDraft] = useState<string | null>(null);

  function commit() {
    if (draft === null) return;
    const text = draft.trim();
    const parsed = Number(text);
    setDraft(null);
    if (text !== '' && Number.isFinite(parsed)) onCommit(parsed);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    handleShortcut('numberField', event, { apply: commit, revert: () => setDraft(null) });
  }

  return (
    <input
      type="number"
      className={className}
      aria-label={label}
      min={min}
      max={max}
      step={step}
      value={draft ?? String(value)}
      onChange={(event) => setDraft(event.target.value)}
      onKeyDown={handleKeyDown}
      onBlur={commit}
    />
  );
}
