import WaveSurfer from 'wavesurfer.js';
import { isAbortError, toError } from '../media/errors.ts';
import type { CreateWaveformPlayer, WaveformPlayer } from './waveformPlayer.ts';

export const WAVEFORM_HEIGHT_PX = 96;
// The canvas cannot read CSS variables; these match --muted, --note and --playhead in App.css.
const WAVE_COLOR = '#8a90a0';
const PROGRESS_COLOR = '#5b9cf0';
const CURSOR_COLOR = '#ff5a5a';

/**
 * Waveform player on wavesurfer.js. Audio plays through an HTMLAudioElement, so a changed rate
 * keeps the pitch (HTMLMediaElement.preservesPitch).
 */
export const createWaveSurferPlayer: CreateWaveformPlayer = ({ container, url, events }) => {
  const ws = WaveSurfer.create({
    container,
    backend: 'MediaElement',
    height: WAVEFORM_HEIGHT_PX,
    waveColor: WAVE_COLOR,
    progressColor: PROGRESS_COLOR,
    cursorColor: CURSOR_COLOR,
    cursorWidth: 2,
    normalize: true,
    interact: true,
    dragToSeek: false,
  });
  ws.on('ready', (duration) => events.onReady(duration));
  ws.on('play', () => events.onPlay());
  ws.on('pause', () => events.onPause());
  ws.on('finish', () => events.onFinish());
  ws.on('interaction', (newTime) => events.onSeek(newTime));
  ws.on('error', (error) => events.onError(error));
  ws.load(url).catch((error: unknown) => {
    if (!isAbortError(error)) events.onError(toError(error));
  });

  const player: WaveformPlayer = {
    play: () => ws.play(),
    pause: () => ws.pause(),
    setTime: (seconds) => ws.setTime(seconds),
    getCurrentTime: () => ws.getCurrentTime(),
    setPlaybackRate: (rate) => ws.setPlaybackRate(rate, true),
    destroy: () => ws.destroy(),
  };
  return player;
};
