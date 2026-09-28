import type { CreateMediaPlayer, MediaPlayer } from './mediaPlayer.ts';

/**
 * Video player on a native <video> element appended to the container. There are no native
 * controls: the element is driven only through the returned player. A changed rate keeps the
 * pitch of the video's sound (HTMLMediaElement.preservesPitch).
 */
export const createHtmlVideoPlayer: CreateMediaPlayer = ({ container, url, events }) => {
  const video = document.createElement('video');
  video.className = 'video-player__video';
  video.preload = 'auto';
  video.playsInline = true;
  video.controls = false;
  video.preservesPitch = true;

  const listeners = new AbortController();
  const { signal } = listeners;
  let readyEmitted = false;
  let probingDuration = false;

  const emitReady = (duration: number) => {
    if (readyEmitted) return;
    readyEmitted = true;
    events.onReady(duration);
  };

  video.addEventListener(
    'loadeddata',
    () => {
      if (readyEmitted || probingDuration) return;
      if (Number.isFinite(video.duration)) {
        emitReady(video.duration);
        return;
      }
      // WebM files recorded by MediaRecorder have no duration in the header (duration is
      // Infinity): seeking far past the end makes the browser read the file and report it.
      probingDuration = true;
      video.currentTime = Number.MAX_SAFE_INTEGER;
    },
    { signal },
  );
  video.addEventListener(
    'durationchange',
    () => {
      if (!probingDuration || !Number.isFinite(video.duration)) return;
      probingDuration = false;
      video.currentTime = 0;
      emitReady(video.duration);
    },
    { signal },
  );
  // Probing the duration may make the browser fire play state events; they mean nothing yet.
  video.addEventListener(
    'play',
    () => {
      if (readyEmitted) events.onPlay();
    },
    { signal },
  );
  video.addEventListener(
    'pause',
    () => {
      if (readyEmitted) events.onPause();
    },
    { signal },
  );
  video.addEventListener(
    'ended',
    () => {
      if (readyEmitted) events.onFinish();
    },
    { signal },
  );
  video.addEventListener(
    'error',
    () => {
      const error = video.error;
      events.onError(new Error(error?.message || `Media error ${error?.code ?? 0}`));
    },
    { signal },
  );

  container.append(video);
  video.src = url;

  const player: MediaPlayer = {
    play: () => video.play(),
    pause: () => video.pause(),
    setTime: (seconds) => {
      video.currentTime = seconds;
    },
    getCurrentTime: () => video.currentTime,
    setPlaybackRate: (rate) => {
      video.preservesPitch = true;
      video.playbackRate = rate;
    },
    destroy: () => {
      listeners.abort();
      video.pause();
      // Releases the media resource (the recommended way to unload a media element).
      video.removeAttribute('src');
      video.load();
      video.remove();
    },
  };
  return player;
};
