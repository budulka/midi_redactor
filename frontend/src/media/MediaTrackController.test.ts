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
});
