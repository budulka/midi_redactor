import { useRef } from 'react';
import { useAudioTrackApi, useAudioTrackState } from '../state/audioTrackContext.ts';
import { useVideoApi, useVideoState } from '../state/videoContext.ts';
import { AUDIO_FILE_ACCEPT } from '../utils/audioFormats.ts';
import { formatMediaPosition } from '../utils/transportFormat.ts';
import FileLoadButton from './FileLoadButton.tsx';
import { useFileDrop } from './useFileDrop.ts';
import { useLivePosition } from './useLivePosition.ts';
import VideoSoundWaveform from './VideoSoundWaveform.tsx';

/**
 * Audio file loading, waveform and position of the audio track. Playback and speed follow the
 * transport; a click on the waveform seeks the whole timeline. While a video is loaded instead of
 * an audio file (only one media file is loaded at a time), the track shows the video's sound.
 */
export default function AudioTrack() {
  const audio = useAudioTrackState();
  const video = useVideoState();
  const api = useAudioTrackApi();
  const videoApi = useVideoApi();
  const { status, fileName, error } = audio;
  const showsVideo = status === 'empty' && video.status !== 'empty';
  // The position follows the media shown on the track.
  const shown = showsVideo ? video : audio;
  const getShownTime = showsVideo ? videoApi.getCurrentTime : api.getCurrentTime;
  const { duration } = shown;
  const waveformRef = useRef<HTMLDivElement>(null);
  const positionRef = useRef<HTMLOutputElement>(null);

  const loadFile = (file: File) => {
    const container = waveformRef.current;
    if (container === null) return;
    api.loadFile(file, container);
  };

  const { onDragOver, onDrop } = useFileDrop(loadFile);

  // The position text is written to the DOM directly, so playback does not re-render React.
  const showPosition = (seconds: number) => {
    const output = positionRef.current;
    if (output === null) return;
    output.textContent = formatMediaPosition(seconds, duration);
  };

  useLivePosition(shown.playing, shown.position, getShownTime, showPosition);

  return (
    <div className="audio-track" onDragOver={onDragOver} onDrop={onDrop}>
      <div className="audio-track__toolbar">
        <FileLoadButton
          text="Load audio…"
          inputLabel="Audio file"
          accept={AUDIO_FILE_ACCEPT}
          onFile={loadFile}
        />
        {fileName !== null && (
          <span className="audio-track__name" title={fileName}>
            {fileName}
          </span>
        )}
        {showsVideo && video.fileName !== null && (
          <span className="audio-track__name" title={video.fileName}>
            Video sound: {video.fileName}
          </span>
        )}
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
        {showsVideo && video.status === 'loading' && (
          <p className="audio-track__status audio-track__overlay">
            Loading the sound of {video.fileName}…
          </p>
        )}
        {showsVideo && video.status === 'ready' && <VideoSoundWaveform />}
        {status === 'empty' && !showsVideo && (
          <p className="placeholder audio-track__overlay">
            Drop an audio file here or use &quot;Load audio…&quot; (MP3, WAV, OGG, AAC, M4A)
          </p>
        )}
        {status === 'loading' && (
          <p className="audio-track__status audio-track__overlay">Loading {fileName}…</p>
        )}
      </div>
      <div className="audio-track__controls" role="group" aria-label="Audio playback">
        <output ref={positionRef} className="audio-track__position" aria-label="Audio position" />
      </div>
      {error !== null && (
        <p role="alert" className="audio-track__error">
          {error}
        </p>
      )}
    </div>
  );
}
