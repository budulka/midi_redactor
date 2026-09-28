import { decodeFailedMessage, unsupportedFileMessage } from '../utils/audioFormats.ts';
import { AudioTrackController, defaultCanPlayType } from './AudioTrackController.ts';
import {
  createFakeWaveformPlayers,
  type FakeWaveformPlayer,
} from './testing/FakeWaveformPlayer.ts';

const file = (name: string, type: string) => new File(['x'], name, { type });

function setup(canPlay: (mime: string) => boolean = () => true) {
  const { create, players } = createFakeWaveformPlayers();
  let urlCount = 0;
  const createObjectUrl = vi.fn(() => {
    urlCount += 1;
    return `blob:${urlCount}`;
  });
  const revokeObjectUrl = vi.fn();
  const canPlayType = vi.fn(canPlay);
  const controller = new AudioTrackController({
    createPlayer: create,
    canPlayType,
    createObjectUrl,
    revokeObjectUrl,
  });
  const listener = vi.fn();
  controller.subscribe(listener);
  const container = document.createElement('div');
  const player = (index = 0): FakeWaveformPlayer => {
    const found = players[index];
    if (found === undefined) throw new Error(`no player ${index}`);
    return found;
  };
  /** Loads song.mp3 and makes it ready with the given duration. */
  const loadReady = (duration = 65) => {
    controller.load(file('song.mp3', 'audio/mpeg'), container);
    player(players.length - 1).emitReady(duration);
    return player(players.length - 1);
  };
  return {
    controller,
    players,
    player,
    createObjectUrl,
    revokeObjectUrl,
    canPlayType,
    listener,
    container,
    loadReady,
  };
}

const flushMicrotasks = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe('AudioTrackController', () => {
  it('starts empty', () => {
    const { controller } = setup();
    expect(controller.getSnapshot()).toEqual({
      status: 'empty',
      fileName: null,
      duration: 0,
      playing: false,
      position: 0,
      rate: 1,
      error: null,
    });
  });

  describe('load', () => {
    it('creates a player for a supported file', () => {
      const { controller, players, player, createObjectUrl, container, canPlayType } = setup();
      const song = file('song.mp3', 'audio/mpeg');
      controller.load(song, container);

      expect(createObjectUrl).toHaveBeenCalledWith(song);
      expect(canPlayType).toHaveBeenCalledWith('audio/mpeg');
      expect(players).toHaveLength(1);
      expect(player().options.container).toBe(container);
      expect(player().options.url).toBe('blob:1');
      expect(player().rate).toBeNull();
      expect(controller.getSnapshot()).toMatchObject({
        status: 'loading',
        fileName: 'song.mp3',
        error: null,
      });
    });

    it('becomes ready and applies the rate on ready', () => {
      const { controller, player, container } = setup();
      controller.load(file('song.mp3', 'audio/mpeg'), container);
      player().emitReady(65);

      expect(controller.getSnapshot()).toMatchObject({
        status: 'ready',
        duration: 65,
        position: 0,
      });
      expect(player().calls).toContain('setPlaybackRate:1');
    });

    it('rejects an unsupported file without creating a player', () => {
      const { controller, players, createObjectUrl, container } = setup();
      controller.load(file('notes.txt', 'text/plain'), container);

      expect(players).toHaveLength(0);
      expect(createObjectUrl).not.toHaveBeenCalled();
      expect(controller.getSnapshot()).toMatchObject({
        status: 'empty',
        error: unsupportedFileMessage('notes.txt'),
      });
    });

    it('keeps the loaded track when an unsupported file is chosen', () => {
      const { controller, loadReady, container } = setup();
      const first = loadReady();
      controller.load(file('notes.txt', 'text/plain'), container);

      expect(first.destroyed).toBe(false);
      expect(controller.getSnapshot()).toMatchObject({
        status: 'ready',
        fileName: 'song.mp3',
        error: unsupportedFileMessage('notes.txt'),
      });

      controller.load(file('next.wav', 'audio/wav'), container);
      expect(controller.getSnapshot().error).toBeNull();
    });

    it('rejects a format the browser cannot play', () => {
      const { controller, players, container } = setup(() => false);
      controller.load(file('a.aac', 'audio/aac'), container);

      expect(players).toHaveLength(0);
      expect(controller.getSnapshot().error).toBe(
        'This browser cannot play AAC audio. Try MP3 or WAV.',
      );
    });

    it('clears the track when the file cannot be decoded', () => {
      const { controller, player, revokeObjectUrl, listener, container } = setup();
      controller.load(file('song.mp3', 'audio/mpeg'), container);
      player().emitError(new Error('decode'));

      expect(player().destroyed).toBe(true);
      expect(revokeObjectUrl).toHaveBeenCalledWith('blob:1');
      expect(controller.getSnapshot()).toMatchObject({
        status: 'empty',
        fileName: null,
        error: decodeFailedMessage('song.mp3'),
      });

      const snapshot = controller.getSnapshot();
      const notifications = listener.mock.calls.length;
      player().emitError(new Error('decode'));
      expect(controller.getSnapshot()).toBe(snapshot);
      expect(revokeObjectUrl).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledTimes(notifications);
    });

    it('replaces the previous file and ignores its late events', () => {
      const { controller, player, revokeObjectUrl, container } = setup();
      controller.load(file('a.mp3', 'audio/mpeg'), container);
      player(0).emitReady(10);
      controller.load(file('b.ogg', 'audio/ogg'), container);

      expect(player(0).destroyed).toBe(true);
      expect(revokeObjectUrl).toHaveBeenCalledWith('blob:1');
      expect(player(1).options.url).toBe('blob:2');
      expect(controller.getSnapshot()).toMatchObject({ status: 'loading', fileName: 'b.ogg' });

      player(0).emitReady(99);
      expect(controller.getSnapshot()).toMatchObject({ status: 'loading', duration: 0 });
    });

    it('ignores events the old player fires while it is destroyed', () => {
      const { controller, player, container } = setup();
      controller.load(file('a.mp3', 'audio/mpeg'), container);
      const first = player(0);
      first.emitReady(10);
      const getCurrentTime = vi.spyOn(first, 'getCurrentTime');
      first.destroy = () => first.emitPause();
      controller.load(file('b.mp3', 'audio/mpeg'), container);

      expect(getCurrentTime).not.toHaveBeenCalled();
      expect(controller.getSnapshot()).toMatchObject({ status: 'loading', fileName: 'b.mp3' });
    });
  });

  describe('playback', () => {
    it('does not play before the file is ready', () => {
      const { controller, player, container } = setup();
      controller.togglePlay();
      controller.load(file('song.mp3', 'audio/mpeg'), container);
      controller.togglePlay();
      expect(player().calls).not.toContain('play');
    });

    it('toggles play and pause', () => {
      const { controller, loadReady } = setup();
      const player = loadReady();
      controller.togglePlay();
      expect(player.calls).toContain('play');
      expect(controller.getSnapshot().playing).toBe(true);

      player.currentTime = 12.5;
      controller.togglePlay();
      expect(player.calls).toContain('pause');
      expect(controller.getSnapshot()).toMatchObject({ playing: false, position: 12.5 });
    });

    it('reports a rejected play', async () => {
      const { controller, loadReady } = setup();
      const player = loadReady();
      player.playError = new DOMException('blocked', 'NotAllowedError');
      controller.play();
      await flushMicrotasks();
      expect(controller.getSnapshot()).toMatchObject({
        error: 'Could not start audio playback.',
        playing: false,
      });
    });

    it('ignores an aborted play', async () => {
      const { controller, loadReady } = setup();
      const player = loadReady();
      player.playError = new DOMException('aborted', 'AbortError');
      controller.play();
      await flushMicrotasks();
      expect(controller.getSnapshot().error).toBeNull();
    });

    it('pauses only while playing', () => {
      const { controller, loadReady } = setup();
      const player = loadReady();
      controller.pause();
      expect(player.calls).not.toContain('pause');
    });

    it('stops at the end of the file', () => {
      const { controller, loadReady } = setup();
      const player = loadReady(65);
      controller.play();
      player.emitFinish();
      expect(controller.getSnapshot()).toMatchObject({ playing: false, position: 65 });
    });

    it('ends at the duration when pause arrives before finish', () => {
      const { controller, loadReady } = setup();
      const player = loadReady(65);
      controller.play();
      player.currentTime = 64.99;
      player.emitPause();
      player.emitFinish();
      expect(controller.getSnapshot()).toMatchObject({ playing: false, position: 65 });
    });
  });

  describe('seek', () => {
    it('clamps the position to the file', () => {
      const { controller, loadReady } = setup();
      const player = loadReady(65);
      controller.seek(10);
      expect(player.calls).toContain('setTime:10');
      expect(controller.getSnapshot().position).toBe(10);
      controller.seek(-1);
      expect(player.calls).toContain('setTime:0');
      controller.seek(100);
      expect(player.calls).toContain('setTime:65');
      expect(controller.getSnapshot().position).toBe(65);
    });

    it('does nothing without a file', () => {
      const { controller, listener } = setup();
      controller.seek(5);
      expect(listener).not.toHaveBeenCalled();
    });

    it('follows clicks on the waveform', () => {
      const { controller, loadReady } = setup();
      const player = loadReady();
      player.emitSeek(7);
      expect(controller.getSnapshot().position).toBe(7);

      controller.play();
      player.emitSeek(20);
      expect(controller.getSnapshot()).toMatchObject({ position: 20, playing: true });
    });
  });

  describe('setRate', () => {
    it('applies and clamps the rate', () => {
      const { controller, loadReady, listener } = setup();
      const player = loadReady();
      controller.setRate(0.5);
      expect(controller.getSnapshot().rate).toBe(0.5);
      expect(player.calls).toContain('setPlaybackRate:0.5');
      controller.setRate(3);
      expect(controller.getSnapshot().rate).toBe(2);
      controller.setRate(0.1);
      expect(controller.getSnapshot().rate).toBe(0.25);

      const notifications = listener.mock.calls.length;
      const calls = player.calls.length;
      controller.setRate(0.25);
      expect(listener).toHaveBeenCalledTimes(notifications);
      expect(player.calls).toHaveLength(calls);
    });

    it('applies the rate chosen while loading on ready and keeps it for the next file', () => {
      const { controller, player, container } = setup();
      controller.load(file('a.mp3', 'audio/mpeg'), container);
      controller.setRate(0.5);
      expect(player(0).calls).toHaveLength(0);
      player(0).emitReady(10);
      expect(player(0).calls).toContain('setPlaybackRate:0.5');

      controller.load(file('b.mp3', 'audio/mpeg'), container);
      player(1).emitReady(10);
      expect(player(1).calls).toContain('setPlaybackRate:0.5');
    });
  });

  it('reads the current time from the player when ready', () => {
    const { controller, loadReady } = setup();
    expect(controller.getCurrentTime()).toBe(0);
    const player = loadReady();
    player.currentTime = 3.2;
    expect(controller.getCurrentTime()).toBe(3.2);
  });

  describe('clear', () => {
    it('removes the track and keeps the rate', () => {
      const { controller, loadReady, revokeObjectUrl } = setup();
      const player = loadReady();
      controller.setRate(0.75);
      controller.clear();
      expect(player.destroyed).toBe(true);
      expect(revokeObjectUrl).toHaveBeenCalledWith('blob:1');
      expect(controller.getSnapshot()).toEqual({
        status: 'empty',
        fileName: null,
        duration: 0,
        playing: false,
        position: 0,
        rate: 0.75,
        error: null,
      });
    });

    it('does nothing when already empty', () => {
      const { controller, listener } = setup();
      controller.clear();
      expect(listener).not.toHaveBeenCalled();
    });

    it('clears an error', () => {
      const { controller, container } = setup();
      controller.load(file('notes.txt', 'text/plain'), container);
      controller.clear();
      expect(controller.getSnapshot().error).toBeNull();
    });
  });

  it('notifies subscribers on every change and keeps the snapshot stable', () => {
    const { controller, player, container } = setup();
    const listener = vi.fn();
    const unsubscribe = controller.subscribe(listener);

    controller.load(file('song.mp3', 'audio/mpeg'), container);
    expect(listener).toHaveBeenCalledTimes(1);
    player().emitReady(30);
    expect(listener).toHaveBeenCalledTimes(2);
    controller.play();
    expect(listener).toHaveBeenCalledTimes(3);
    controller.pause();
    expect(listener).toHaveBeenCalledTimes(4);
    controller.seek(5);
    expect(listener).toHaveBeenCalledTimes(5);
    controller.setRate(1.5);
    expect(listener).toHaveBeenCalledTimes(6);
    expect(controller.getSnapshot()).toBe(controller.getSnapshot());
    controller.clear();
    expect(listener).toHaveBeenCalledTimes(7);

    unsubscribe();
    controller.load(file('song.mp3', 'audio/mpeg'), container);
    expect(listener).toHaveBeenCalledTimes(7);
  });

  it('asks an audio element whether a type can play', () => {
    const canPlayType = vi
      .spyOn(HTMLMediaElement.prototype, 'canPlayType')
      .mockImplementation((mime) => (mime === 'audio/mpeg' ? 'maybe' : ''));
    expect(defaultCanPlayType('audio/mpeg')).toBe(true);
    expect(defaultCanPlayType('audio/aac')).toBe(false);
    canPlayType.mockRestore();
  });
});
