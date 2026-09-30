import type { MediaFormat } from '../utils/mediaFormats.ts';
import { detectFormat } from '../utils/mediaFormats.ts';
import { MediaTrackController } from './MediaTrackController.ts';
import { keepSingleMediaSource } from './singleMediaSource.ts';
import { FakeMediaPlayer } from './testing/FakeMediaPlayer.ts';

const X: MediaFormat = {
  id: 'x',
  label: 'X',
  extensions: ['x'],
  mimeTypes: ['app/x'],
  probeType: 'app/x',
};

const file = (name: string, type: string) => new File(['x'], name, { type });

function setup(names: readonly string[] = ['audio', 'video']) {
  const log: string[] = [];
  const revokeObjectUrl = vi.fn();
  const canPlay = { value: true };
  let urls = 0;
  const players = new Map<string, FakeMediaPlayer[]>();
  const tracks = names.map(
    (name) =>
      new MediaTrackController<MediaFormat>({
        createPlayer: (options) => {
          log.push(`create ${name}`);
          const player = new FakeMediaPlayer(options);
          const destroy = player.destroy.bind(player);
          player.destroy = () => {
            log.push(`destroy ${name}`);
            destroy();
          };
          players.set(name, [...(players.get(name) ?? []), player]);
          return player;
        },
        canPlayType: () => canPlay.value,
        detectFormat: (f) => detectFormat([X], f),
        messages: {
          unsupported: (fileName) => `bad ${fileName}`,
          unplayable: (format) => `cannot ${format.label}`,
          loadFailed: (fileName) => `broken ${fileName}`,
          playFailed: 'no play',
        },
        createObjectUrl: () => {
          urls += 1;
          return `blob:${urls}`;
        },
        revokeObjectUrl,
      }),
  );
  const container = document.createElement('div');
  const player = (name: string): FakeMediaPlayer => {
    const found = players.get(name)?.at(-1);
    if (found === undefined) throw new Error(`no ${name} player`);
    return found;
  };
  const track = (index: number): MediaTrackController<MediaFormat> => {
    const found = tracks[index];
    if (found === undefined) throw new Error(`no track ${index}`);
    return found;
  };
  const loadReady = (index: number, name: string, duration = 10) => {
    track(index).load(file(name, 'app/x'), container);
    player(names[index] ?? '').emitReady(duration);
  };
  const stop = keepSingleMediaSource(tracks);
  return { log, revokeObjectUrl, canPlay, container, player, track, loadReady, stop, tracks };
}

describe('keepSingleMediaSource', () => {
  it('clears the audio before the video player is created', () => {
    const { log, revokeObjectUrl, container, player, track, loadReady } = setup();
    const audio = track(0);
    const video = track(1);
    loadReady(0, 'a.x');
    player('audio').emitPlay();
    expect(audio.getSnapshot().playing).toBe(true);
    video.load(file('v.x', 'app/x'), container);
    expect(log).toEqual(['create audio', 'destroy audio', 'create video']);
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:1');
    expect(audio.getSnapshot()).toMatchObject({ status: 'empty', playing: false, fileName: null });
    expect(video.getSnapshot().status).toBe('loading');
  });

  it('clears the video when an audio file is loaded', () => {
    const { log, revokeObjectUrl, container, player, track, loadReady } = setup();
    loadReady(1, 'v.x');
    track(0).load(file('a.x', 'app/x'), container);
    expect(player('video').destroyed).toBe(true);
    expect(log).toEqual(['create video', 'destroy video', 'create audio']);
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:1');
    expect(track(1).getSnapshot().status).toBe('empty');
  });

  it('keeps the rate and the mute setting of the cleared track', () => {
    const { container, track, loadReady } = setup();
    loadReady(1, 'v.x');
    track(1).setMuted(true);
    track(1).setRate(0.5);
    track(0).load(file('a.x', 'app/x'), container);
    expect(track(1).getSnapshot()).toMatchObject({ status: 'empty', muted: true, rate: 0.5 });
  });

  it('does not clear anything for a rejected file', () => {
    const { log, canPlay, container, track, loadReady } = setup();
    loadReady(0, 'a.x');
    track(1).load(file('a.txt', 'text/plain'), container);
    expect(log).toEqual(['create audio']);
    expect(track(0).getSnapshot().status).toBe('ready');
    expect(track(1).getSnapshot().error).toBe('bad a.txt');

    canPlay.value = false;
    track(1).load(file('v.x', 'app/x'), container);
    expect(log).toEqual(['create audio']);
    expect(track(0).getSnapshot().status).toBe('ready');
    expect(track(1).getSnapshot().error).toBe('cannot X');
  });

  it('clears the error of the other track without a player to destroy', () => {
    const { log, container, track, loadReady } = setup();
    loadReady(0, 'a.x');
    track(1).load(file('a.txt', 'text/plain'), container);
    expect(track(1).getSnapshot().error).toBe('bad a.txt');
    track(0).load(file('b.x', 'app/x'), container);
    expect(track(1).getSnapshot().error).toBeNull();
    expect(log).not.toContain('destroy video');
  });

  it('stops clearing after stop()', () => {
    const { container, track, loadReady, stop } = setup();
    loadReady(0, 'a.x');
    stop();
    track(1).load(file('v.x', 'app/x'), container);
    expect(track(0).getSnapshot().status).toBe('ready');
  });

  it('clears every other track', () => {
    const stubs = ['one', 'two', 'three'].map(() => {
      const listeners: (() => void)[] = [];
      return {
        clear: vi.fn(),
        subscribeLoadStart: (listener: () => void) => {
          listeners.push(listener);
          return () => undefined;
        },
        startLoading: () => {
          for (const listener of listeners) listener();
        },
      };
    });
    keepSingleMediaSource(stubs);
    const [one, two, three] = stubs;
    one?.startLoading();
    expect(one?.clear).not.toHaveBeenCalled();
    expect(two?.clear).toHaveBeenCalledTimes(1);
    expect(three?.clear).toHaveBeenCalledTimes(1);
  });
});
