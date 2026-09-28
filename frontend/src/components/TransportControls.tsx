import { useLayoutEffect, useRef } from 'react';
import { useEditor, useEditorDispatch } from '../state/editorContext.ts';
import { setFollowPlayhead } from '../state/editorState.ts';
import { useProject } from '../state/projectContext.ts';
import { useTransportApi, useTransportState } from '../state/transportContext.ts';
import { formatBarBeat, formatClock } from '../utils/transportFormat.ts';
import PlaybackRateSelect from './PlaybackRateSelect.tsx';
import { useAnimationFrame } from './useAnimationFrame.ts';

/**
 * Play/Pause, Stop and the speed of the one transport for notes, audio and video, the playback
 * position and the Follow switch.
 */
export default function TransportControls() {
  const { status, position, rate, engineStatus } = useTransportState();
  const api = useTransportApi();
  const { bpm, timeSignature } = useProject();
  const { followPlayhead } = useEditor();
  const editorDispatch = useEditorDispatch();
  const positionRef = useRef<HTMLOutputElement>(null);
  const playing = status === 'playing';
  const loading = engineStatus === 'loading';

  // The position text is written to the DOM directly, so playback does not re-render React.
  const showPosition = (seconds: number) => {
    const output = positionRef.current;
    if (output === null) return;
    output.textContent = `${formatClock(seconds)} · ${formatBarBeat(seconds, bpm, timeSignature)}`;
  };

  useLayoutEffect(() => {
    showPosition(playing ? api.getPosition() : position);
  });

  useAnimationFrame(playing, () => showPosition(api.getPosition()));

  const playLabel = loading ? 'Loading piano…' : playing ? 'Pause' : 'Play';

  return (
    <div className="transport-controls" role="group" aria-label="Playback">
      <button
        type="button"
        className="transport-controls__play"
        aria-label={playLabel}
        disabled={loading}
        onClick={api.togglePlay}
      >
        {playLabel}
      </button>
      <button type="button" disabled={status === 'stopped' && position === 0} onClick={api.stop}>
        Stop
      </button>
      <PlaybackRateSelect label="Playback speed" value={rate} onChange={api.setRate} />
      <output
        ref={positionRef}
        className="transport-controls__position"
        aria-label="Playback position"
      />
      <label className="transport-controls__follow">
        <input
          type="checkbox"
          checked={followPlayhead}
          onChange={(event) => editorDispatch(setFollowPlayhead(event.target.checked))}
        />
        Follow
      </label>
      {engineStatus === 'error' && (
        <>
          <span role="alert" className="transport-controls__error">
            Could not load piano samples
          </span>
          <button type="button" onClick={api.retry}>
            Retry
          </button>
        </>
      )}
    </div>
  );
}
