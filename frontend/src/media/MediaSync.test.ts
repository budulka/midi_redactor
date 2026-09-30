import type { MediaFormat } from '../utils/mediaFormats.ts';
import { detectFormat } from '../utils/mediaFormats.ts';
import { MediaSync } from './MediaSync.ts';
import { MAX_CORRECTION_SEEKS } from './mediaSyncRules.ts';
import { MediaTrackController } from './MediaTrackController.ts';
import { keepSingleMediaSource } from './singleMediaSource.ts';
import { createFakeMediaPlayers, type FakeMediaPlayer } from './testing/FakeMediaPlayer.ts';
import { FakeSyncClock } from './testing/FakeSyncClock.ts';

const X: MediaFormat = {
  id: 'x',
  label: 'X',
  extensions: ['x'],
  mimeTypes: ['app/x'],
  probeType: 'app/x',
};

function makeController() {
  const fake = createFakeMediaPlayers();
  const controller = new MediaTrackController<MediaFormat>({
    createPlayer: fake.create,
    canPlayType: () => true,
    detectFormat: (f) => detectFormat([X], f),
    messages: {
      unsupported: (name) => `bad ${name}`,
      unplayable: (format) => `cannot ${format.label}`,
      loadFailed: (name) => `broken ${name}`,
      playFailed: 'no play',
    },
    createObjectUrl: () => 'blob:x',
    revokeObjectUrl: () => undefined,
  });
  const player = (): FakeMediaPlayer => {
    const found = fake.players.at(-1);
    if (found === undefined) throw new Error('no player');
    return found;
  };
  const load = () => controller.load(new File(['x'], 'a.x'), document.createElement('div'));
  return { controller, player, load };
}

function setup(clock = new FakeSyncClock()) {
  let timer: (() => void) | null = null;
  let activeTimers = 0;
  const env = { clockNow: 0 };
  const sync = new MediaSync(clock, {
    startTimer: (callback) => {
      timer = callback;
      activeTimers += 1;
      return () => {
        activeTimers -= 1;
        timer = null;
      };
    },
    now: () => env.clockNow,
  });
  const fireTimer = () => timer?.();
  const readyTrack = (duration = 30) => {
    const track = makeController();
    track.load();
    track.player().emitReady(duration);
    return track;
  };
  return {
    clock,
    sync,
    env,
    fireTimer,
    readyTrack,
    activeTimers: () => activeTimers,
  };
}

const setTimes = (player: FakeMediaPlayer) => player.calls.filter((c) => c.startsWith('setTime:'));
const count = (player: FakeMediaPlayer, call: string) =>
  player.calls.filter((c) => c === call).length;

describe('MediaSync', () => {
  it('subscribes to the clock only while tracks are attached', () => {
    const { clock, sync, readyTrack } = setup();
    expect(clock.listenerCount).toBe(0);
    sync.attach(readyTrack().controller);
    expect(clock.listenerCount).toBe(1);
    sync.detachAll();
    expect(clock.listenerCount).toBe(0);

    const detachA = sync.attach(readyTrack().controller);
    const detachB = sync.attach(readyTrack().controller);
    detachA();
    expect(clock.listenerCount).toBe(1);
    detachB();
    expect(clock.listenerCount).toBe(0);
  });

  it('keeps a stopped track paused and reports its duration', () => {
    const { sync, readyTrack } = setup();
    const { controller, player } = readyTrack();
    const listener = vi.fn();
    sync.subscribe(listener);
    sync.attach(controller);
    expect(player().calls).not.toContain('play');
    expect(sync.getMediaDuration()).toBe(30);
    expect(listener).toHaveBeenCalled();
  });

  it('plays with the clock, corrects the drift and pauses with it', () => {
    const { clock, sync, readyTrack, fireTimer, activeTimers } = setup();
    const { controller, player } = readyTrack();
    sync.attach(controller);
    player().calls.length = 0;

    clock.set({ status: 'playing' });
    expect(player().calls).toEqual(['play']);
    expect(activeTimers()).toBe(1);

    clock.position = 5;
    player().currentTime = 5.1;
    fireTimer();
    expect(player().calls.at(-1)).toBe('setPlaybackRate:0.95');
    const calls = player().calls.length;
    fireTimer();
    expect(player().calls).toHaveLength(calls);
    player().currentTime = 5.0;
    fireTimer();
    expect(player().calls.at(-1)).toBe('setPlaybackRate:1');

    player().calls.length = 0;
    clock.set({ status: 'paused', position: 7 });
    expect(player().calls).toEqual(['pause', 'setTime:7']);
    expect(activeTimers()).toBe(0);

    clock.set({ status: 'stopped', position: 0 });
    expect(player().calls.at(-1)).toBe('setTime:0');
  });

  describe('while playing', () => {
    function playing(duration = 30, position = 0) {
      const context = setup();
      const track = context.readyTrack(duration);
      context.clock.set({ status: 'paused', position });
      context.sync.attach(track.controller);
      context.clock.set({ status: 'playing' });
      track.player().calls.length = 0;
      return { ...context, ...track };
    }

    it('seeks when the drift is large and waits after the seek', () => {
      const { clock, env, player, fireTimer } = playing();
      env.clockNow = 10;
      clock.position = 5;
      player().currentTime = 5.5;
      fireTimer();
      expect(setTimes(player())).toEqual(['setTime:5']);

      env.clockNow = 10.5;
      player().currentTime = 5.6;
      clock.position = 5.1;
      fireTimer();
      expect(setTimes(player())).toEqual(['setTime:5']);

      env.clockNow = 11.2;
      fireTimer();
      expect(setTimes(player())).toEqual(['setTime:5', 'setTime:5.1']);
    });

    it('seeks at once when the transport seeks right after a correction seek', () => {
      const { clock, env, player, fireTimer } = playing();
      env.clockNow = 10;
      clock.position = 5;
      player().currentTime = 5.5;
      fireTimer();
      clock.set({ position: 20 });
      expect(setTimes(player())).toEqual(['setTime:5', 'setTime:20']);
    });

    it('jumps less ahead while the transport has not started moving', () => {
      const { clock, player, fireTimer } = playing();
      clock.startDelay = 0.05;
      clock.position = 5;
      player().currentTime = 6;
      fireTimer();
      const [seek] = setTimes(player());
      expect(Number(seek?.slice('setTime:'.length))).toBeCloseTo(4.95);
    });

    it('pauses the media at its end and does not restart it', () => {
      const { clock, player, fireTimer } = playing();
      clock.position = 40;
      fireTimer();
      expect(player().calls).toEqual(['pause']);
      fireTimer();
      expect(player().calls).toEqual(['pause']);
    });

    it('changes the rate of the media with the clock', () => {
      const { clock, controller, player } = playing();
      clock.set({ rate: 0.5 });
      expect(player().calls).toContain('setPlaybackRate:0.5');
      expect(controller.getSnapshot().rate).toBe(0.5);
    });

    it('does not retry a refused play until the next transport command', async () => {
      const { clock, player, fireTimer } = playing();
      clock.set({ status: 'paused' });
      player().calls.length = 0;
      player().playError = new DOMException('blocked', 'NotAllowedError');
      clock.set({ status: 'playing' });
      await Promise.resolve();
      await Promise.resolve();
      expect(count(player(), 'play')).toBe(1);
      fireTimer();
      fireTimer();
      fireTimer();
      expect(count(player(), 'play')).toBe(1);
      clock.set({ status: 'paused' });
      clock.set({ status: 'playing' });
      expect(count(player(), 'play')).toBe(2);
    });

    it('calls play once per start although the player reports play synchronously', () => {
      const { clock, player, fireTimer } = playing();
      expect(player().calls).toEqual([]);
      clock.set({ status: 'paused' });
      clock.set({ status: 'playing' });
      fireTimer();
      expect(count(player(), 'play')).toBe(1);
    });

    it('pauses and restores the rate of a detached track', () => {
      const { clock, sync, readyTrack } = setup();
      const { controller, player } = readyTrack();
      const detach = sync.attach(controller);
      clock.set({ status: 'playing', position: 5 });
      player().currentTime = 5.1;
      clock.set({ position: 5 });
      expect(player().calls.at(-1)).toBe('setPlaybackRate:0.95');
      player().calls.length = 0;
      detach();
      expect(player().calls).toEqual(['pause', 'setPlaybackRate:1']);
      clock.set({ status: 'paused', position: 9 });
      expect(player().calls).toEqual(['pause', 'setPlaybackRate:1']);
      detach();
      expect(player().calls).toEqual(['pause', 'setPlaybackRate:1']);
    });

    it('stops the timer on detachAll and works again after a new attach', () => {
      const { clock, sync, controller, player, activeTimers } = playing();
      sync.detachAll();
      expect(activeTimers()).toBe(0);
      player().calls.length = 0;
      clock.set({ position: 3 });
      expect(player().calls).toEqual([]);
      sync.attach(controller);
      expect(activeTimers()).toBe(1);
      clock.set({ status: 'paused', position: 4 });
      expect(player().calls).toContain('setTime:4');
    });
  });

  it('does not pause a detached paused track', () => {
    const { sync, readyTrack } = setup();
    const { controller, player } = readyTrack();
    const detach = sync.attach(controller);
    player().calls.length = 0;
    detach();
    expect(player().calls).not.toContain('pause');
  });

  it('starts a media loaded during playback at the clock position', () => {
    const { clock, sync } = setup();
    clock.set({ status: 'playing', position: 3 });
    const { controller, player, load } = makeController();
    load();
    sync.attach(controller);
    player().emitReady(30);
    expect(player().calls).toEqual(['setPlaybackRate:1', 'setTime:3', 'play']);
  });

  describe('seeks by the user', () => {
    it('moves the clock without moving the media back first', () => {
      const { clock, sync, readyTrack } = setup();
      const { controller, player } = readyTrack();
      clock.set({ status: 'paused' });
      sync.attach(controller);
      player().calls.length = 0;
      controller.seek(12);
      expect(clock.seeks).toEqual([12]);
      expect(setTimes(player())).toEqual(['setTime:12']);
      player().emitSeek(8);
      expect(clock.seeks).toEqual([12, 8]);
      expect(setTimes(player())).toEqual(['setTime:12']);
    });

    it('moves the clock during playback without a correction seek', () => {
      const { clock, sync, readyTrack } = setup();
      const { controller, player } = readyTrack(200);
      clock.set({ status: 'paused', position: 100 });
      sync.attach(controller);
      clock.set({ status: 'playing' });
      player().calls.length = 0;
      player().emitSeek(150);
      expect(clock.seeks).toEqual([150]);
      expect(setTimes(player())).toEqual([]);
    });

    it('does not record its own corrections as seeks', () => {
      const { clock, sync, readyTrack, fireTimer } = setup();
      const { controller, player } = readyTrack();
      sync.attach(controller);
      clock.set({ status: 'paused', position: 7 });
      clock.set({ status: 'playing' });
      clock.position = 10;
      fireTimer();
      expect(setTimes(player()).length).toBeGreaterThan(0);
      expect(clock.seeks).toEqual([]);
    });

    it('does not pull the timeline back to the end of a shorter media', () => {
      const { clock, sync, readyTrack } = setup();
      const { controller } = readyTrack(65);
      clock.set({ status: 'paused', position: 100 });
      sync.attach(controller);
      controller.seek(70);
      controller.seek(65);
      expect(clock.seeks).toEqual([]);
      controller.seek(60);
      expect(clock.seeks).toEqual([60]);
    });

    it('moves the timeline to the end of a media when it is before it', () => {
      const { clock, sync, readyTrack } = setup();
      const { controller } = readyTrack(65);
      clock.set({ status: 'paused', position: 30 });
      sync.attach(controller);
      controller.seek(70);
      expect(clock.seeks).toEqual([65]);
    });
  });

  it('reports the longest ready media', () => {
    const { sync, readyTrack } = setup();
    const listener = vi.fn();
    sync.subscribe(listener);
    const a = readyTrack(30);
    const b = readyTrack(45);
    const detachA = sync.attach(a.controller);
    sync.attach(b.controller);
    expect(sync.getMediaDuration()).toBe(45);
    b.controller.clear();
    expect(sync.getMediaDuration()).toBe(30);
    detachA();
    expect(sync.getMediaDuration()).toBe(0);
    expect(listener).toHaveBeenCalledTimes(4);
  });

  describe('seek loop protection', () => {
    /** Clock and media playing together at 10 with the media one second ahead. */
    function drifting(rate = 1) {
      const context = setup();
      const track = context.readyTrack(200);
      const { clock, sync, env } = context;
      env.clockNow = 100;
      clock.set({ status: 'paused', position: 10, rate });
      sync.attach(track.controller);
      clock.set({ status: 'playing' });
      track.player().calls.length = 0;
      track.player().currentTime = 11;

      let lags: number[] = [0];
      let lagIndex = 0;
      const setLag = (...values: number[]) => {
        lags = values;
        lagIndex = 0;
      };
      /** Applies the seek latency to the last seek: the media stood still for `lag`. */
      const applyLag = (before: number) => {
        const seeks = setTimes(track.player());
        if (seeks.length === before) return;
        const target = Number(seeks.at(-1)?.slice('setTime:'.length));
        const lag = lags[lagIndex % lags.length] ?? 0;
        lagIndex += 1;
        track.player().currentTime = target - lag;
      };
      const run = (steps: number) => {
        for (let step = 0; step < steps; step += 1) {
          const player = track.player();
          const before = setTimes(player).length;
          env.clockNow += 0.1;
          clock.position += 0.1 * clock.snapshot.rate;
          player.currentTime += 0.1 * (player.rate ?? clock.snapshot.rate);
          context.fireTimer();
          applyLag(before);
        }
      };
      const drift = () => track.player().currentTime - clock.position;
      return { ...context, ...track, run, setLag, applyLag, drift };
    }

    it('converges with two seeks for a steady lag at 1×', () => {
      const { clock, player, run, setLag, drift } = drifting();
      setLag(0.3);
      let secondSeekPosition = 0;
      const seekCount = () => setTimes(player()).length;
      for (let step = 0; step < 60; step += 1) {
        const before = seekCount();
        run(1);
        if (before === 1 && seekCount() === 2) secondSeekPosition = clock.position;
      }
      const seeks = setTimes(player());
      expect(seeks).toHaveLength(2);
      expect(Number(seeks[1]?.slice('setTime:'.length))).toBeCloseTo(secondSeekPosition + 0.3);
      expect(Math.abs(drift())).toBeLessThanOrEqual(0.03);
    });

    it('converges with one seek and a nudge for a steady lag at 2×', () => {
      const { player, run, setLag, drift } = drifting(2);
      setLag(0.15);
      run(60);
      expect(setTimes(player())).toHaveLength(1);
      expect(player().calls).toContain('setPlaybackRate:2.1');
      expect(Math.abs(drift())).toBeLessThanOrEqual(0.03);
    });

    it('stops seeking after the limit when the lag is unpredictable', () => {
      const { controller, player, run, setLag } = drifting();
      setLag(0.6, 0.1);
      const nudged = vi.spyOn(controller, 'setRateNudge');
      run(100);
      expect(setTimes(player())).toHaveLength(MAX_CORRECTION_SEEKS);
      const lastNudge = nudged.mock.calls.at(-1)?.[0];
      expect(lastNudge).toBeDefined();
      expect(lastNudge).not.toBe(1);
    });

    it('keeps the learned seek lead after a transport seek', () => {
      const { clock, player, run, setLag, applyLag } = drifting();
      setLag(0.3);
      run(60);
      player().calls.length = 0;
      clock.set({ position: 30 });
      applyLag(0);
      const seeks = setTimes(player());
      expect(seeks).toHaveLength(1);
      expect(Number(seeks[0]?.slice('setTime:'.length))).toBeCloseTo(30.3);
      run(30);
      expect(setTimes(player())).toHaveLength(1);
    });

    it('seeks again after a transport command once the limit was reached', () => {
      const { clock, player, run, setLag } = drifting();
      setLag(0.6, 0.1);
      run(100);
      player().calls.length = 0;
      clock.set({ position: 50 });
      expect(setTimes(player())).toHaveLength(1);
    });
  });

  describe('media duration while a file is replaced', () => {
    function attachedReady(duration: number) {
      const context = setup();
      const listener = vi.fn();
      context.sync.subscribe(listener);
      const track = context.readyTrack(duration);
      context.sync.attach(track.controller);
      listener.mockClear();
      return { ...context, listener, track };
    }

    it('keeps the duration while the same track loads another file', () => {
      const { sync, listener, track } = attachedReady(180);
      expect(sync.getMediaDuration()).toBe(180);
      track.load();
      expect(track.controller.getSnapshot().status).toBe('loading');
      expect(sync.getMediaDuration()).toBe(180);
      expect(listener).not.toHaveBeenCalled();
      track.player().emitReady(120);
      expect(sync.getMediaDuration()).toBe(120);
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('drops the duration when the new file fails', () => {
      const { sync, track } = attachedReady(180);
      track.load();
      track.player().emitError();
      expect(sync.getMediaDuration()).toBe(0);
    });

    it('grows with a longer new file', () => {
      const { sync, track } = attachedReady(60);
      track.load();
      track.player().emitReady(200);
      expect(sync.getMediaDuration()).toBe(200);
    });

    it('keeps the duration while another track replaces the file', () => {
      const { sync, listener, track: a } = attachedReady(180);
      const b = makeController();
      sync.attach(b.controller);
      keepSingleMediaSource([a.controller, b.controller]);
      // Recorded on every duration change, so a drop to 0 in the middle of load() shows up too.
      const durations: number[] = [];
      sync.subscribe(() => durations.push(sync.getMediaDuration()));
      b.load();
      expect(a.controller.getSnapshot().status).toBe('empty');
      expect(b.controller.getSnapshot().status).toBe('loading');
      expect(sync.getMediaDuration()).toBe(180);
      expect(listener).not.toHaveBeenCalled();
      expect(durations).toEqual([]);
      b.player().emitReady(120);
      expect(sync.getMediaDuration()).toBe(120);
      expect(durations).toEqual([120]);
    });

    it('drops the duration at once when a file is removed', () => {
      const { sync, track } = attachedReady(180);
      track.controller.clear();
      expect(sync.getMediaDuration()).toBe(0);
    });

    it('does not grow from nothing while the first file loads', () => {
      const { sync } = setup();
      const track = makeController();
      sync.attach(track.controller);
      track.load();
      expect(sync.getMediaDuration()).toBe(0);
      track.player().emitReady(30);
      expect(sync.getMediaDuration()).toBe(30);
    });
  });
});

describe('MediaSync with a media offset', () => {
  it('shows the frame at the offset while stopped or paused', () => {
    const { clock, sync, readyTrack } = setup();
    sync.setTimeMap({ offset: 2 });
    const { controller, player } = readyTrack();
    sync.attach(controller);
    expect(setTimes(player()).at(-1)).toBe('setTime:2');
    clock.set({ position: 5 });
    expect(setTimes(player()).at(-1)).toBe('setTime:7');
  });

  it('moves paused media to the new frame when the map changes', () => {
    const { clock, sync, readyTrack } = setup();
    const { controller, player } = readyTrack();
    clock.set({ status: 'paused', position: 5 });
    sync.attach(controller);
    expect(player().currentTime).toBe(5);
    player().calls.length = 0;
    sync.setTimeMap({ offset: 1.5 });
    expect(setTimes(player())).toEqual(['setTime:6.5']);
    sync.setTimeMap({ offset: 1.5 });
    expect(setTimes(player())).toEqual(['setTime:6.5']);
    expect(sync.getTimeMap()).toEqual({ offset: 1.5 });
  });

  it('corrects playing media at once, without waiting for the seek cooldown', () => {
    const { clock, sync, readyTrack, fireTimer, env } = setup();
    const { controller, player } = readyTrack();
    sync.attach(controller);
    clock.set({ status: 'playing' });
    clock.position = 5;
    player().currentTime = 3;
    fireTimer();
    expect(setTimes(player()).at(-1)).toBe('setTime:5');
    player().calls.length = 0;
    sync.setTimeMap({ offset: 3 });
    expect(env.clockNow).toBe(0);
    expect(setTimes(player())).toEqual(['setTime:8']);
  });

  it('reports where the media ends on the timeline', () => {
    const { sync, readyTrack } = setup();
    const listener = vi.fn();
    sync.subscribe(listener);
    sync.attach(readyTrack(30).controller);
    listener.mockClear();
    sync.setTimeMap({ offset: 2 });
    expect(sync.getMediaDuration()).toBe(28);
    expect(listener).toHaveBeenCalledTimes(1);
    sync.setTimeMap({ offset: -3 });
    expect(sync.getMediaDuration()).toBe(33);
    expect(listener).toHaveBeenCalledTimes(2);
    sync.setTimeMap({ offset: 40 });
    expect(sync.getMediaDuration()).toBe(0);
    expect(listener).toHaveBeenCalledTimes(3);
    sync.setTimeMap({ offset: 50 });
    expect(sync.getMediaDuration()).toBe(0);
    expect(listener).toHaveBeenCalledTimes(3);
  });

  it('maps a seek by the user onto the timeline', () => {
    const { clock, sync, readyTrack } = setup();
    const { controller } = readyTrack();
    clock.set({ status: 'paused' });
    sync.attach(controller);
    sync.setTimeMap({ offset: 2 });
    controller.seek(10);
    expect(clock.seeks.at(-1)).toBe(8);
    controller.seek(1);
    expect(clock.seeks.at(-1)).toBe(0);
  });

  it.each([
    ['paused', 1],
    ['stopped', 0],
  ] as const)(
    'brings the media back to bar 1 after a seek into the intro while %s at bar 1',
    (status, seconds) => {
      const { clock, sync, readyTrack } = setup(new FakeSyncClock({ notifyUnchangedSeek: false }));
      const { controller, player } = readyTrack(30);
      clock.set({ status, position: 0 });
      sync.setTimeMap({ offset: 2 });
      sync.attach(controller);
      expect(player().currentTime).toBe(2);
      player().calls.length = 0;
      controller.seek(seconds);
      expect(clock.seeks.at(-1)).toBe(0);
      expect(setTimes(player())[0]).toBe(`setTime:${seconds}`);
      expect(setTimes(player()).at(-1)).toBe('setTime:2');
    },
  );

  it('makes no extra seek when the media already matches the clock', () => {
    const { clock, sync, readyTrack } = setup(new FakeSyncClock({ notifyUnchangedSeek: false }));
    const { controller, player } = readyTrack(30);
    clock.set({ status: 'paused', position: 0 });
    sync.attach(controller);
    player().calls.length = 0;
    controller.seek(5);
    expect(clock.seeks.at(-1)).toBe(5);
    expect(setTimes(player())).toEqual(['setTime:5']);
  });

  it('does not pull the timeline back to the end of a media with an offset', () => {
    const { clock, sync, readyTrack } = setup();
    const { controller } = readyTrack(30);
    clock.set({ status: 'paused', position: 40 });
    sync.setTimeMap({ offset: 2 });
    sync.attach(controller);
    controller.seek(30);
    expect(clock.seeks).toEqual([]);
    clock.set({ position: 20 });
    controller.seek(30);
    expect(clock.seeks.at(-1)).toBe(28);
  });

  it('keeps the media on its first frame until the timeline reaches it', () => {
    const { clock, sync, readyTrack, fireTimer } = setup();
    const { controller, player } = readyTrack(30);
    sync.setTimeMap({ offset: -2 });
    sync.attach(controller);
    clock.set({ status: 'playing', position: 1 });
    expect(player().calls).not.toContain('play');
    expect(player().currentTime).toBe(0);
    player().calls.length = 0;
    clock.position = 2.5;
    fireTimer();
    const tail = player().calls.filter((c) => c === 'play' || c.startsWith('setTime:'));
    expect(tail[0]).toBe('setTime:0.5');
    expect(tail[1]).toBe('play');
  });

  it('applies a new map and a clock seek in one pass', () => {
    const { clock, sync, readyTrack } = setup();
    const { controller, player } = readyTrack(30);
    clock.set({ status: 'paused', position: 5 });
    sync.attach(controller);
    expect(player().currentTime).toBe(5);
    player().calls.length = 0;
    sync.batch(() => {
      sync.setTimeMap({ offset: 3 });
      clock.seek(0);
    });
    expect(setTimes(player())).toEqual(['setTime:3']);
  });
});
