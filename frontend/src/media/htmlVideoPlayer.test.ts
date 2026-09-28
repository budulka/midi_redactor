import { createHtmlVideoPlayer } from './htmlVideoPlayer.ts';
import type { MediaPlayerEvents } from './mediaPlayer.ts';

function makeEvents() {
  return {
    onReady: vi.fn<MediaPlayerEvents['onReady']>(),
    onPlay: vi.fn<MediaPlayerEvents['onPlay']>(),
    onPause: vi.fn<MediaPlayerEvents['onPause']>(),
    onFinish: vi.fn<MediaPlayerEvents['onFinish']>(),
    onSeek: vi.fn<MediaPlayerEvents['onSeek']>(),
    onError: vi.fn<MediaPlayerEvents['onError']>(),
  };
}

function setup() {
  const container = document.createElement('div');
  const events = makeEvents();
  const player = createHtmlVideoPlayer({ container, url: 'blob:v', events });
  const video = container.querySelector('video');
  if (video === null) throw new Error('no video element');
  const setDuration = (duration: number) => {
    Object.defineProperty(video, 'duration', { configurable: true, get: () => duration });
  };
  const fire = (type: string) => video.dispatchEvent(new Event(type));
  const makeReady = (duration = 12) => {
    setDuration(duration);
    fire('loadeddata');
  };
  return { container, events, player, video, setDuration, fire, makeReady };
}

describe('createHtmlVideoPlayer', () => {
  let play: ReturnType<typeof vi.spyOn>;
  let pause: ReturnType<typeof vi.spyOn>;
  let load: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
    load = vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('appends one configured video element with the URL', () => {
    const { container, video } = setup();
    expect(container.querySelectorAll('video')).toHaveLength(1);
    expect(video.getAttribute('src')).toBe('blob:v');
    expect(video.controls).toBe(false);
    expect(video.playsInline).toBe(true);
    expect(video.preload).toBe('auto');
    expect(video.preservesPitch).toBe(true);
    expect(video).toHaveClass('video-player__video');
  });

  it('reports ready once with the duration', () => {
    const { events, fire, makeReady } = setup();
    makeReady(12);
    expect(events.onReady).toHaveBeenCalledTimes(1);
    expect(events.onReady).toHaveBeenCalledWith(12);
    fire('loadeddata');
    expect(events.onReady).toHaveBeenCalledTimes(1);
  });

  it('finds an infinite duration by seeking to the end', () => {
    const { events, video, setDuration, fire } = setup();
    setDuration(Infinity);
    fire('loadeddata');
    expect(events.onReady).not.toHaveBeenCalled();
    expect(video.currentTime).toBe(Number.MAX_SAFE_INTEGER);
    setDuration(42);
    fire('durationchange');
    expect(video.currentTime).toBe(0);
    expect(events.onReady).toHaveBeenCalledWith(42);
  });

  it('ignores a duration change without probing', () => {
    const { events, setDuration, fire } = setup();
    setDuration(10);
    fire('durationchange');
    expect(events.onReady).not.toHaveBeenCalled();
  });

  it('reports play, pause and finish', () => {
    const { events, fire, makeReady } = setup();
    makeReady();
    fire('play');
    expect(events.onPlay).toHaveBeenCalledTimes(1);
    fire('pause');
    expect(events.onPause).toHaveBeenCalledTimes(1);
    fire('ended');
    expect(events.onFinish).toHaveBeenCalledTimes(1);
  });

  it('ignores play state events before ready', () => {
    const { events, setDuration, fire } = setup();
    setDuration(Infinity);
    fire('loadeddata');
    fire('play');
    fire('pause');
    fire('ended');
    expect(events.onPlay).not.toHaveBeenCalled();
    expect(events.onPause).not.toHaveBeenCalled();
    expect(events.onFinish).not.toHaveBeenCalled();
  });

  it('reports errors with the media error message or code', () => {
    const { events, video, fire } = setup();
    const setError = (error: { code: number; message: string }) => {
      Object.defineProperty(video, 'error', { configurable: true, get: () => error });
    };
    setError({ code: 4, message: 'unsupported codec' });
    fire('error');
    setError({ code: 3, message: '' });
    fire('error');
    const messages = events.onError.mock.calls.map(([error]) => {
      expect(error).toBeInstanceOf(Error);
      return error.message;
    });
    expect(messages).toEqual(['unsupported codec', 'Media error 3']);
  });

  it('delegates the player methods to the element', async () => {
    const { player, video } = setup();
    const result = player.play();
    expect(result).toBeInstanceOf(Promise);
    await result;
    expect(play).toHaveBeenCalledTimes(1);
    player.pause();
    expect(pause).toHaveBeenCalledTimes(1);
    player.setTime(4);
    expect(video.currentTime).toBe(4);
    expect(player.getCurrentTime()).toBe(video.currentTime);
    video.preservesPitch = false;
    player.setPlaybackRate(0.5);
    expect(video.playbackRate).toBe(0.5);
    expect(video.preservesPitch).toBe(true);
  });

  it('releases the element on destroy and reports nothing after it', () => {
    const { container, events, player, video, fire, makeReady } = setup();
    makeReady();
    player.destroy();
    expect(container.contains(video)).toBe(false);
    expect(video.hasAttribute('src')).toBe(false);
    expect(load).toHaveBeenCalled();
    fire('play');
    expect(events.onPlay).not.toHaveBeenCalled();
  });

  it('never reports a seek', () => {
    const { events, fire, makeReady, player } = setup();
    makeReady();
    fire('play');
    fire('pause');
    fire('seeked');
    fire('ended');
    player.setTime(3);
    expect(events.onSeek).not.toHaveBeenCalled();
  });

  it('mutes the element', () => {
    const { player, video } = setup();
    player.setMuted(true);
    expect(video.muted).toBe(true);
    player.setMuted(false);
    expect(video.muted).toBe(false);
  });
});
