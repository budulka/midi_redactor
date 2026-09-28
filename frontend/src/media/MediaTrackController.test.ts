import type { MediaFormat } from '../utils/mediaFormats.ts';
import { detectFormat } from '../utils/mediaFormats.ts';
import { EMPTY_MEDIA_TRACK_SNAPSHOT, MediaTrackController } from './MediaTrackController.ts';
import { createFakeMediaPlayers, type FakeMediaPlayer } from './testing/FakeMediaPlayer.ts';

const X: MediaFormat = {
  id: 'x',
  label: 'X',
  extensions: ['x', 'xx'],
  mimeTypes: ['app/x'],
  probeType: 'app/x',
};

const file = (name: string, type: string) => new File(['x'], name, { type });

function setup(canPlay = true) {
  const fake = createFakeMediaPlayers();
  const canPlayType = vi.fn(() => canPlay);
  let urls = 0;
  const revokeObjectUrl = vi.fn();
  const controller = new MediaTrackController<MediaFormat>({
    createPlayer: fake.create,
    canPlayType,
    detectFormat: (f) => detectFormat([X], f),
    messages: {
      unsupported: (name) => `bad ${name}`,
      unplayable: (format) => `cannot ${format.label}`,
      loadFailed: (name) => `broken ${name}`,
      playFailed: 'no play',
    },
    createObjectUrl: () => {
      urls += 1;
      return `blob:${urls}`;
    },
    revokeObjectUrl,
  });
  const container = document.createElement('div');
  const player = (index = 0): FakeMediaPlayer => {
    const found = fake.players[index];
    if (found === undefined) throw new Error(`no player ${index}`);
    return found;
  };
  return { controller, canPlayType, revokeObjectUrl, container, players: fake.players, player };
}

describe('MediaTrackController', () => {
  it('uses the unsupported message for unknown files', () => {
    const { controller, container, players } = setup();
    controller.load(file('a.txt', 'text/plain'), container);
    expect(controller.getSnapshot().error).toBe('bad a.txt');
    expect(players).toHaveLength(0);
  });

  it('probes the format and uses the unplayable message', () => {
    const { controller, container, canPlayType, players } = setup(false);
    controller.load(file('a.x', 'app/x'), container);
    expect(canPlayType).toHaveBeenCalledWith('app/x');
    expect(controller.getSnapshot().error).toBe('cannot X');
    expect(players).toHaveLength(0);
  });

  it('uses the load failed message when the player reports an error', () => {
    const { controller, container, player, revokeObjectUrl } = setup();
    controller.load(file('a.x', 'app/x'), container);
    player().emitError();
    expect(controller.getSnapshot().error).toBe('broken a.x');
    expect(controller.getSnapshot().status).toBe('empty');
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:1');
  });

  it('uses the play failed message when playback is refused', async () => {
    const { controller, container, player } = setup();
    controller.load(file('a.x', 'app/x'), container);
    player().emitReady(10);
    player().playError = new DOMException('blocked', 'NotAllowedError');
    controller.play();
    await Promise.resolve();
    await Promise.resolve();
    expect(controller.getSnapshot().error).toBe('no play');
    expect(controller.getSnapshot().playing).toBe(false);
  });

  it('runs a full cycle and keeps the rate after clear', () => {
    const { controller, container, player } = setup();
    controller.load(file('a.x', 'app/x'), container);
    expect(player().options.url).toBe('blob:1');
    player().emitReady(10);
    expect(player().calls).toContain('setPlaybackRate:1');
    controller.togglePlay();
    expect(controller.getSnapshot().playing).toBe(true);
    controller.seek(20);
    expect(player().calls).toContain('setTime:10');
    controller.setRate(0.5);
    expect(player().calls).toContain('setPlaybackRate:0.5');
    controller.clear();
    expect(controller.getSnapshot()).toEqual({ ...EMPTY_MEDIA_TRACK_SNAPSHOT, rate: 0.5 });
  });

  describe('synchronization', () => {
    function ready(duration = 30) {
      const context = setup();
      context.controller.load(file('a.x', 'app/x'), context.container);
      context.player().emitReady(duration);
      return context;
    }

    it('moves the media without calling seek listeners', () => {
      const { controller, player } = ready();
      const onSeek = vi.fn();
      controller.subscribeSeek(onSeek);
      controller.syncTo(12);
      expect(player().calls).toContain('setTime:12');
      expect(controller.getSnapshot().position).toBe(12);
      expect(onSeek).not.toHaveBeenCalled();
      controller.syncTo(40);
      expect(player().calls).toContain('setTime:30');
    });

    it('does not move a media that is not ready', () => {
      const { controller, container, player } = setup();
      controller.load(file('a.x', 'app/x'), container);
      controller.syncTo(12);
      expect(player().calls).toEqual([]);
    });

    it('reports seeks by the user', () => {
      const { controller, player } = ready();
      const onSeek = vi.fn();
      const unsubscribe = controller.subscribeSeek(onSeek);
      controller.seek(12);
      expect(onSeek).toHaveBeenLastCalledWith(12);
      controller.seek(-3);
      expect(onSeek).toHaveBeenLastCalledWith(0);
      player().emitSeek(8);
      expect(onSeek).toHaveBeenLastCalledWith(8);
      unsubscribe();
      controller.seek(5);
      expect(onSeek).toHaveBeenCalledTimes(3);
    });

    it('does not report a seek of an empty track', () => {
      const { controller } = setup();
      const onSeek = vi.fn();
      controller.subscribeSeek(onSeek);
      controller.seek(5);
      expect(onSeek).not.toHaveBeenCalled();
    });

    it('calls seek listeners before snapshot listeners', () => {
      const { controller, player } = ready();
      const order: string[] = [];
      controller.subscribe(() => order.push(`snapshot:${controller.getSnapshot().position}`));
      controller.subscribeSeek((seconds) => {
        order.push(`seek:${seconds}:${controller.getSnapshot().position}`);
        expect(player().currentTime).toBe(seconds);
      });
      controller.seek(12);
      expect(order).toEqual(['seek:12:0', 'snapshot:12']);
      expect(player().calls.at(-1)).toBe('setTime:12');
      order.length = 0;
      player().emitSeek(8);
      expect(order).toEqual(['seek:8:12', 'snapshot:8']);
    });

    it('clears the play failed message after a successful start', async () => {
      const { controller, player } = ready();
      player().playError = new DOMException('blocked', 'NotAllowedError');
      controller.play();
      await Promise.resolve();
      await Promise.resolve();
      expect(controller.getSnapshot().error).toBe('no play');
      player().playError = null;
      controller.play();
      expect(controller.getSnapshot().error).toBeNull();
    });

    it('keeps other errors after a successful start', () => {
      const { controller, container, player } = ready();
      controller.load(file('a.txt', 'text/plain'), container);
      expect(controller.getSnapshot().error).toBe('bad a.txt');
      controller.play();
      expect(player().calls).toContain('play');
      expect(controller.getSnapshot().error).toBe('bad a.txt');
    });

    it('nudges the rate without changing the snapshot', () => {
      const { controller, player } = ready();
      const listener = vi.fn();
      controller.subscribe(listener);
      const snapshot = controller.getSnapshot();
      player().calls.length = 0;
      controller.setRateNudge(0.95);
      expect(player().calls).toEqual(['setPlaybackRate:0.95']);
      expect(listener).not.toHaveBeenCalled();
      expect(controller.getSnapshot()).toBe(snapshot);
      controller.setRateNudge(0.95);
      expect(player().calls).toEqual(['setPlaybackRate:0.95']);
      controller.setRate(0.5);
      expect(player().calls.at(-1)).toBe('setPlaybackRate:0.5');
      controller.setRateNudge(0.9);
      expect(player().calls.at(-1)).toBe('setPlaybackRate:0.45');
      controller.setRate(0.25);
      controller.setRateNudge(0.95);
      expect(player().calls.at(-1)).toBe('setPlaybackRate:0.25');
    });

    it('restores the base rate when the same rate is set on a nudged media', () => {
      const { controller, player } = ready();
      controller.setRateNudge(0.95);
      controller.setRate(1);
      expect(player().calls.at(-1)).toBe('setPlaybackRate:1');
      controller.setRateNudge(0.95);
      expect(player().calls.at(-1)).toBe('setPlaybackRate:0.95');
    });

    it('does not nudge a media that is loading', () => {
      const { controller, container, player } = setup();
      controller.load(file('a.x', 'app/x'), container);
      controller.setRateNudge(0.95);
      expect(player().calls).toEqual([]);
      player().emitReady(10);
      expect(player().calls).toEqual(['setPlaybackRate:1']);
      controller.setRateNudge(0.95);
      expect(player().calls.at(-1)).toBe('setPlaybackRate:0.95');
    });

    it('drops the nudge with a new file', () => {
      const { controller, container, player } = ready();
      controller.setRateNudge(0.9);
      controller.load(file('b.x', 'app/x'), container);
      player(1).emitReady(10);
      expect(player(1).calls).toEqual(['setPlaybackRate:1']);
      controller.setRateNudge(0.9);
      expect(player(1).calls.at(-1)).toBe('setPlaybackRate:0.9');
    });

    it('mutes the media and keeps the setting for the next file', () => {
      const { controller, container, player } = ready();
      const listener = vi.fn();
      controller.subscribe(listener);
      controller.setMuted(true);
      expect(player().calls.at(-1)).toBe('setMuted:true');
      expect(controller.getSnapshot().muted).toBe(true);
      expect(listener).toHaveBeenCalledTimes(1);
      controller.setMuted(true);
      expect(listener).toHaveBeenCalledTimes(1);
      controller.load(file('b.x', 'app/x'), container);
      player(1).emitReady(10);
      expect(player(1).calls).toContain('setMuted:true');
      controller.clear();
      expect(controller.getSnapshot().muted).toBe(true);
    });

    it('does not mute a new player without the setting', () => {
      const { player } = ready();
      expect(player().calls.some((call) => call.startsWith('setMuted'))).toBe(false);
    });
  });
});
