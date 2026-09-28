import { useEffect, useRef, useState } from 'react';
import { KEYBOARD_PITCHES, isBlackKey, pitchName } from '../../utils/pitch.ts';

interface PianoKeyboardProps {
  rowHeight: number;
  onNoteOn?: (pitch: number) => void;
  onNoteOff?: (pitch: number) => void;
}

/** 88 keys from C8 (top) to A0 (bottom). A key stays pressed while the mouse button is held. */
export default function PianoKeyboard({ rowHeight, onNoteOn, onNoteOff }: PianoKeyboardProps) {
  const [pressed, setPressed] = useState<number | null>(null);
  const onNoteOffRef = useRef(onNoteOff);

  useEffect(() => {
    onNoteOffRef.current = onNoteOff;
  }, [onNoteOff]);

  useEffect(() => {
    if (pressed === null) return undefined;
    const release = () => {
      onNoteOffRef.current?.(pressed);
      setPressed(null);
    };
    window.addEventListener('mouseup', release);
    return () => window.removeEventListener('mouseup', release);
  }, [pressed]);

  function press(pitch: number) {
    setPressed(pitch);
    onNoteOn?.(pitch);
  }

  function releaseOnLeave(pitch: number) {
    if (pressed !== pitch) return;
    onNoteOff?.(pitch);
    setPressed(null);
  }

  return (
    <div className="piano-keyboard" aria-label="Piano keyboard" role="group">
      {KEYBOARD_PITCHES.map((pitch) => {
        const black = isBlackKey(pitch);
        const name = pitchName(pitch);
        const isPressed = pressed === pitch;
        return (
          <button
            key={pitch}
            type="button"
            tabIndex={-1}
            className={`piano-key ${black ? 'piano-key--black' : 'piano-key--white'}${
              isPressed ? ' piano-key--pressed' : ''
            }`}
            style={{ height: rowHeight }}
            aria-label={name}
            aria-pressed={isPressed}
            data-pitch={pitch}
            onMouseDown={(event) => {
              if (event.button !== 0) return;
              event.preventDefault();
              press(pitch);
            }}
            onMouseLeave={() => releaseOnLeave(pitch)}
          >
            {pitch % 12 === 0 ? <span className="piano-key__label">{name}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
