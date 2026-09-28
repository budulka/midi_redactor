import { createFakeMediaPlayers, type FakeMediaPlayer } from './testing/FakeMediaPlayer.ts';
import { defaultVideoCanPlayType, VideoController } from './VideoController.ts';

const file = (name: string, type: string) => new File(['x'], name, { type });

function setup(canPlay = true) {
  const fake = createFakeMediaPlayers();
  const canPlayType = vi.fn(() => canPlay);
  let urls = 0;
  const controller = new VideoController({
    createPlayer: fake.create,
    canPlayType,
    createObjectUrl: () => {
      urls += 1;
      return `blob:${urls}`;
    },
    revokeObjectUrl: vi.fn(),
  });
  const container = document.createElement('div');
  const player = (index = 0): FakeMediaPlayer => {
    const found = fake.players[index];
    if (found === undefined) throw new Error(`no player ${index}`);
    return found;
  };
  return { controller, canPlayType, container, player, players: fake.players };
}

describe('VideoController', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('loads an MP4 file', () => {
    const { controller, canPlayType, container, player } = setup();
    controller.load(file('clip.mp4', 'video/mp4'), container);
    expect(canPlayType).toHaveBeenCalledWith('video/mp4');
    expect(player().options.url).toBe('blob:1');
    expect(player().options.container).toBe(container);
    expect(controller.getSnapshot()).toMatchObject({ status: 'loading', fileName: 'clip.mp4' });
    player().emitReady(30);
    expect(controller.getSnapshot()).toMatchObject({ status: 'ready', duration: 30 });
  });

  it('rejects an audio file', () => {
    const { controller, container, players } = setup();
    controller.load(file('song.mp3', 'audio/mpeg'), container);
    expect(controller.getSnapshot().error).toBe(
      'Unsupported file "song.mp3". Choose an MP4 or WebM video file.',
    );
    expect(players).toHaveLength(0);
  });

  it('reports a format the browser cannot play', () => {
    const { controller, container } = setup(false);
    controller.load(file('clip.webm', 'video/webm'), container);
    expect(controller.getSnapshot().error).toBe('This browser cannot play WebM video. Try MP4.');
  });

  it('reports a file that failed to load', () => {
    const { controller, container, player } = setup();
    controller.load(file('clip.mp4', 'video/mp4'), container);
    player().emitError();
    expect(controller.getSnapshot().error).toBe(
      'Could not play "clip.mp4": the file is damaged or uses a codec this browser does not support.',
    );
  });

  it('reports refused playback', async () => {
    const { controller, container, player } = setup();
    controller.load(file('clip.mp4', 'video/mp4'), container);
    player().emitReady(30);
    player().playError = new DOMException('blocked', 'NotAllowedError');
    controller.play();
    await Promise.resolve();
    await Promise.resolve();
    expect(controller.getSnapshot().error).toBe('Could not start video playback.');
  });
});

describe('defaultVideoCanPlayType', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('asks a video element', () => {
    vi.spyOn(HTMLMediaElement.prototype, 'canPlayType').mockImplementation(function (
      this: HTMLMediaElement,
      mime: string,
    ) {
      return this instanceof HTMLVideoElement && mime === 'video/webm' ? 'maybe' : '';
    });
    expect(defaultVideoCanPlayType('video/webm')).toBe(true);
    expect(defaultVideoCanPlayType('video/ogg')).toBe(false);
  });
});
