import { useRef } from 'react';
import { useVideoApi, useVideoState } from '../state/videoContext.ts';
import { formatMediaPosition } from '../utils/transportFormat.ts';
import { VIDEO_FILE_ACCEPT } from '../utils/videoFormats.ts';
import FileLoadButton from './FileLoadButton.tsx';
import { useFileDrop } from './useFileDrop.ts';
import { useLivePosition } from './useLivePosition.ts';

/** Jump of the back/forward buttons. */
export const SKIP_SECONDS = 5;

/**
 * Video file loading, picture, skipping and mute of the video panel. Playback and speed follow the
 * transport; seeking happens on the media timeline above the piano roll, the waveform and the
 * ±5 s buttons, and always seeks the whole timeline.
 */
export default function VideoPlayer() {
  const { status, fileName, duration, playing, position, muted, error } = useVideoState();
  const api = useVideoApi();
  const screenRef = useRef<HTMLDivElement>(null);
  const positionRef = useRef<HTMLOutputElement>(null);

  const ready = status === 'ready';

  const loadFile = (file: File) => {
    const container = screenRef.current;
    if (container === null) return;
    api.loadFile(file, container);
  };

  const { onDragOver, onDrop } = useFileDrop(loadFile);

  // The position text is written to the DOM directly, so playback does not re-render React.
  const showPosition = (seconds: number) => {
    const output = positionRef.current;
    if (output !== null) output.textContent = formatMediaPosition(seconds, duration);
  };

  useLivePosition(playing, position, api.getCurrentTime, showPosition);

  const skip = (delta: number) => api.seek(api.getCurrentTime() + delta);

  return (
    <div className="video-player" onDragOver={onDragOver} onDrop={onDrop}>
      <div className="video-player__toolbar">
        <FileLoadButton
          text="Load video…"
          inputLabel="Video file"
          accept={VIDEO_FILE_ACCEPT}
          onFile={loadFile}
        />
        {fileName !== null && (
          <span className="video-player__name" title={fileName}>
            {fileName}
          </span>
        )}
        <button
          type="button"
          aria-label="Remove video"
          disabled={status === 'empty'}
          onClick={api.clear}
        >
          Remove
        </button>
      </div>
      <div className="video-player__stage">
        <div ref={screenRef} className="video-player__screen" data-testid="video-screen" />
        {status === 'empty' && (
          <p className="placeholder video-player__overlay">
            Drop a video file here or use &quot;Load video…&quot; (MP4, WebM)
          </p>
        )}
        {status === 'loading' && (
          <p className="video-player__status video-player__overlay">Loading {fileName}…</p>
        )}
      </div>
      <div className="video-player__controls" role="group" aria-label="Video playback">
        <button
          type="button"
          aria-label="Back 5 seconds"
          disabled={!ready}
          onClick={() => skip(-SKIP_SECONDS)}
        >
          −5 s
        </button>
        <button
          type="button"
          aria-label="Forward 5 seconds"
          disabled={!ready}
          onClick={() => skip(SKIP_SECONDS)}
        >
          +5 s
        </button>
        <output ref={positionRef} className="video-player__position" aria-label="Video position" />
        <label className="video-player__mute">
          <input
            type="checkbox"
            aria-label="Mute video"
            checked={muted}
            onChange={(event) => api.setMuted(event.currentTarget.checked)}
          />
          Mute
        </label>
      </div>
      {error !== null && (
        <p role="alert" className="video-player__error">
          {error}
        </p>
      )}
    </div>
  );
}
