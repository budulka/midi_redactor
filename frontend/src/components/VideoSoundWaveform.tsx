import { useEffect, useRef, useState } from 'react';
import { useCreateWaveformView } from '../state/audioTrackContext.ts';
import { useVideoApi, useVideoState } from '../state/videoContext.ts';

type Phase = 'drawing' | 'ready' | 'failed';

/**
 * Waveform of the sound of the ready video, drawn on the audio track. It reads the <video> of
 * the video player (no second media element); a click on it seeks the whole timeline.
 */
export default function VideoSoundWaveform() {
  const { fileName } = useVideoState();
  const api = useVideoApi();
  const createView = useCreateWaveformView();
  const containerRef = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<Phase>('drawing');

  useEffect(() => {
    const container = containerRef.current;
    if (container === null) return undefined;
    const media = api.controller.getLoadedMedia();
    if (media === null) {
      setPhase('failed');
      return undefined;
    }
    const view = createView({
      container,
      media: media.element,
      url: media.url,
      events: {
        onReady: () => setPhase('ready'),
        onSeek: (time) => api.seek(time),
        onError: () => setPhase('failed'),
      },
    });
    return () => view.destroy();
  }, [api, createView]);

  return (
    <>
      <div
        ref={containerRef}
        className="audio-track__video-waveform"
        data-testid="video-waveform"
      />
      {phase === 'drawing' && (
        <p className="audio-track__status audio-track__overlay">Drawing the sound of {fileName}…</p>
      )}
      {phase === 'failed' && (
        <p className="placeholder audio-track__overlay">
          No sound to show: &quot;{fileName}&quot; has no audio track or the browser cannot decode
          it.
        </p>
      )}
    </>
  );
}
