import { useLayoutEffect, useRef, type ChangeEvent, type DragEvent } from 'react';
import { useAudioTrackApi, useAudioTrackState } from '../state/audioTrackContext.ts';
import { AUDIO_FILE_ACCEPT } from '../utils/audioFormats.ts';
import { formatClock } from '../utils/transportFormat.ts';
import PlaybackRateSelect from './PlaybackRateSelect.tsx';
import { useAnimationFrame } from './useAnimationFrame.ts';

/** Audio file loading, waveform, play/pause, position and speed of the audio track. */
export default function AudioTrack() {
  const { status, fileName, duration, playing, position, rate, error } = useAudioTrackState();
  const api = useAudioTrackApi();
  const waveformRef = useRef<HTMLDivElement>(null);
  const positionRef = useRef<HTMLOutputElement>(null);

  const loadFile = (file: File | undefined) => {
    const container = waveformRef.current;
    if (file === undefined || container === null) return;
    api.loadFile(file, container);
  };

  const onFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    loadFile(event.target.files?.[0]);
    // Lets the same file be chosen again.
    event.target.value = '';
  };

  const onDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    // DragEvent.dataTransfer can be null for synthetic events.
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    loadFile(event.dataTransfer?.files[0]);
  };

  // The position text is written to the DOM directly, so playback does not re-render React.
  const showPosition = (seconds: number) => {
    const output = positionRef.current;
    if (output === null) return;
    output.textContent = `${formatClock(seconds)} / ${formatClock(duration)}`;
  };

  useLayoutEffect(() => {
    showPosition(playing ? api.getCurrentTime() : position);
  });

  useAnimationFrame(playing, () => showPosition(api.getCurrentTime()));

  const ready = status === 'ready';

  return (
    <div className="audio-track" onDragOver={onDragOver} onDrop={onDrop}>
      <div className="audio-track__toolbar">
        <label className="audio-track__load">
          Load audio…
          <input
            type="file"
            className="visually-hidden"
            aria-label="Audio file"
            accept={AUDIO_FILE_ACCEPT}
            onChange={onFileChange}
          />
        </label>
        {fileName !== null && <span className="audio-track__name">{fileName}</span>}
        <button
          type="button"
          aria-label="Remove audio"
          disabled={status === 'empty'}
          onClick={api.clear}
        >
          Remove
        </button>
      </div>
      <div className="audio-track__stage">
        <div ref={waveformRef} className="audio-track__waveform" data-testid="waveform" />
        {status === 'empty' && (
          <p className="placeholder audio-track__overlay">
            Drop an audio file here or use &quot;Load audio…&quot; (MP3, WAV, OGG, AAC, M4A)
          </p>
        )}
        {status === 'loading' && (
          <p className="audio-track__status audio-track__overlay">Loading {fileName}…</p>
        )}
      </div>
      <div className="audio-track__controls" role="group" aria-label="Audio playback">
        <button
          type="button"
          className="audio-track__play"
          aria-label={playing ? 'Pause audio' : 'Play audio'}
          disabled={!ready}
          onClick={api.togglePlay}
        >
          {playing ? 'Pause' : 'Play'}
        </button>
        <output ref={positionRef} className="audio-track__position" aria-label="Audio position" />
        <PlaybackRateSelect label="Audio speed" value={rate} onChange={api.setRate} />
      </div>
      {error !== null && (
        <p role="alert" className="audio-track__error">
          {error}
        </p>
      )}
    </div>
  );
}
