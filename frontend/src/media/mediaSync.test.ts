import {
  afterTransportCommand,
  INITIAL_TRACK_SYNC_STATE,
  nudgeFactor,
  planMediaSync,
  type MediaSyncInput,
  type TrackSyncState,
} from './mediaSync.ts';

const I: MediaSyncInput = Object.freeze({
  transportPlaying: true,
  target: 10,
  mediaTime: 10,
  duration: 30,
  mediaPlaying: true,
  now: 100,
});
const S: TrackSyncState = INITIAL_TRACK_SYNC_STATE;

function plan(input: Partial<MediaSyncInput> = {}, state: Partial<TrackSyncState> = {}) {
  return planMediaSync(Object.freeze({ ...I, ...input }), Object.freeze({ ...S, ...state }));
}

const NONE = { seekTo: null, play: false, pause: false, nudge: 1 };

describe('nudgeFactor', () => {
  it('leaves a small drift alone and nudges a larger one proportionally', () => {
    expect(nudgeFactor(0, 1)).toBe(1);
    expect(nudgeFactor(0.02, 1)).toBe(1);
    expect(nudgeFactor(0.03, 1)).toBe(1);
    expect(nudgeFactor(0.04, 1)).toBe(0.98);
    expect(nudgeFactor(0.1, 1)).toBe(0.95);
    expect(nudgeFactor(-0.1, 1)).toBe(1.05);
    expect(nudgeFactor(-0.06, 1)).toBe(1.03);
  });

  it('limits the nudge to ±5 %', () => {
    expect(nudgeFactor(1, 1)).toBe(0.95);
    expect(nudgeFactor(-1, 1)).toBe(1.05);
  });

  it('keeps nudging until the drift falls to the lower threshold', () => {
    expect(nudgeFactor(0.02, 0.98)).toBe(0.99);
    expect(nudgeFactor(0.005, 0.99)).toBe(1);
    expect(nudgeFactor(-0.02, 1.02)).toBe(1.01);
  });
});

describe('planMediaSync', () => {
  describe('transport not playing', () => {
    it('pauses the media at the transport position', () => {
      expect(plan({ transportPlaying: false, mediaTime: 10.3 }).action).toEqual({
        seekTo: 10,
        play: false,
        pause: true,
        nudge: 1,
      });
    });

    it('does not seek a paused media that is already in place', () => {
      const { action } = plan({ transportPlaying: false, mediaPlaying: false, mediaTime: 10.003 });
      expect(action.seekTo).toBeNull();
      expect(action.pause).toBe(false);
    });

    it('keeps the target within the media', () => {
      expect(plan({ transportPlaying: false, target: 40 }).action.seekTo).toBe(30);
      expect(plan({ transportPlaying: false, target: -1 }).action.seekTo).toBe(0);
    });

    it('drops the nudge', () => {
      const result = plan({ transportPlaying: false }, { nudge: 0.95 });
      expect(result.action.nudge).toBe(1);
      expect(result.state.nudge).toBe(1);
    });
  });

  it('pauses the media when the timeline is past its end', () => {
    expect(plan({ target: 30 }).action).toEqual({ ...NONE, pause: true });
    expect(plan({ target: 35, mediaPlaying: false }).action).toEqual(NONE);
  });

  describe('tail of the media', () => {
    it('lets the media play its last moments on its own', () => {
      expect(plan({ target: 29.95, mediaPlaying: false, mediaTime: 29.9 }).action).toEqual(NONE);
    });

    it('does not replay the end of a media that finished ahead of the transport', () => {
      expect(plan({ mediaPlaying: false, mediaTime: 30, target: 29.85 }).action).toEqual(NONE);
    });

    it('restarts a finished media when the transport is well before its end', () => {
      const { action } = plan({ mediaPlaying: false, mediaTime: 30, target: 29.7 });
      expect(action.seekTo).toBeCloseTo(29.7);
      expect(action.play).toBe(true);
    });
  });

  describe('media not playing', () => {
    it('seeks and plays', () => {
      const result = plan({ mediaPlaying: false, mediaTime: 0 });
      expect(result.action).toEqual({ seekTo: 10, play: true, pause: false, nudge: 1 });
      expect(result.state.playRequested).toBe(true);
      expect(result.state.lastSeekAt).toBe(100);
    });

    it('plays without a seek when the media is close', () => {
      const result = plan({ mediaPlaying: false, mediaTime: 10.01 });
      expect(result.action).toEqual({ seekTo: null, play: true, pause: false, nudge: 1 });
      expect(result.state.lastSeekAt).toBe(-Infinity);
    });

    it('waits for the play event after play() was requested', () => {
      expect(plan({ mediaPlaying: false, mediaTime: 0 }, { playRequested: true }).action).toEqual(
        NONE,
      );
    });

    it('restarts a media that finished', () => {
      const { action } = plan({ mediaPlaying: false, mediaTime: 30, target: 5 });
      expect(action.seekTo).toBe(5);
      expect(action.play).toBe(true);
    });

    it('keeps the pending measurement when the media stopped after a correction seek', () => {
      const result = plan(
        { mediaPlaying: false, mediaTime: 9.7 },
        { lastSeekAt: 98.9, checkAfterSeek: true, seekLead: 0.2, seekStreak: 1 },
      );
      expect(result.action).toEqual({ seekTo: 10, play: true, pause: false, nudge: 1 });
      expect(result.state).toEqual({
        nudge: 1,
        playRequested: true,
        lastSeekAt: 100,
        checkAfterSeek: true,
        seekLead: 0.2,
        seekStreak: 1,
      });
    });
  });

  describe('media playing', () => {
    it('nudges the rate by the drift', () => {
      expect(plan({ mediaTime: 10.01 }).action.nudge).toBe(1);
      expect(plan({ mediaTime: 10.1 }).action.nudge).toBe(0.95);
      expect(plan({ mediaTime: 9.9 }).action.nudge).toBe(1.05);
      expect(plan({ mediaTime: 10.1 }).state.nudge).toBe(0.95);
    });

    it('applies the hysteresis of the dead zone', () => {
      expect(plan({ mediaTime: 10.02 }, { nudge: 0.98 }).action.nudge).toBe(0.99);
      expect(plan({ mediaTime: 10.025 }, { nudge: 1 }).action.nudge).toBe(1);
    });
  });

  describe('correction seek', () => {
    it('seeks when the drift is large', () => {
      const result = plan({ mediaTime: 10.3 });
      expect(result.action).toEqual({ ...NONE, seekTo: 10 });
      expect(result.state).toMatchObject({ lastSeekAt: 100, checkAfterSeek: true, seekStreak: 1 });
    });

    it('jumps ahead by the seek lead', () => {
      expect(plan({ mediaTime: 10.3 }, { seekLead: 0.2 }).action.seekTo).toBeCloseTo(10.2);
    });

    it('stays before the tail of the media', () => {
      const { action } = plan({ target: 29.5, mediaTime: 28.5 }, { seekLead: 0.5 });
      expect(action.seekTo).toBeCloseTo(29.9);
    });

    it('jumps less ahead while the transport has not started moving yet', () => {
      const { action } = plan({ mediaTime: 10.3, startDelay: 0.05 }, { seekLead: 0.2 });
      expect(action.seekTo).toBeCloseTo(10.15);
    });

    it('waits after a seek', () => {
      const state = { lastSeekAt: 99.5, checkAfterSeek: true, seekStreak: 1 };
      const result = plan({ mediaTime: 10.3 }, state);
      expect(result.action).toEqual(NONE);
      expect(result.state).toEqual({ ...S, ...state });
    });
  });

  describe('measurement after a seek', () => {
    const measured = { lastSeekAt: 98.9, checkAfterSeek: true };

    it('learns a steady lag at 1× and seeks ahead of it', () => {
      const result = plan({ mediaTime: 9.7 }, { ...measured, seekStreak: 1, seekLead: 0 });
      expect(result.state.seekLead).toBeCloseTo(0.3);
      expect(result.action.seekTo).toBeCloseTo(10.3);
      expect(result.state).toMatchObject({ seekStreak: 2, checkAfterSeek: true, lastSeekAt: 100 });
    });

    it('stops seeking once the drift converged', () => {
      const result = plan({ mediaTime: 10.0 }, { ...measured, seekStreak: 2, seekLead: 0.3 });
      expect(result.action).toEqual(NONE);
      expect(result.state.seekLead).toBeCloseTo(0.3);
      expect(result.state).toMatchObject({ seekStreak: 0, checkAfterSeek: false });
    });

    it('learns a steady lag at 2× and leaves the rest to the nudge', () => {
      const result = plan({ mediaTime: 9.85 }, { ...measured, seekStreak: 1, seekLead: 0 });
      expect(result.action.seekTo).toBeNull();
      expect(result.action.nudge).toBe(1.05);
      expect(result.state.seekLead).toBeCloseTo(0.15);
      expect(result.state.seekStreak).toBe(0);
    });

    it('reduces a seek lead that is too large', () => {
      const result = plan({ mediaTime: 10.1 }, { ...measured, seekLead: 0.3 });
      expect(result.state.seekLead).toBeCloseTo(0.2);
      expect(result.action.nudge).toBe(0.95);
    });

    it('keeps the seek lead within its limits', () => {
      expect(plan({ mediaTime: 9.5 }, { ...measured, seekLead: 0.9 }).state.seekLead).toBe(1);
      const result = plan({ mediaTime: 10.4 }, { ...measured, seekLead: 0.1 });
      expect(result.state.seekLead).toBe(0);
      expect(result.action.seekTo).toBe(10);
    });
  });

  it('nudges instead of seeking once the seek limit is reached', () => {
    expect(plan({ mediaTime: 10.5 }, { seekStreak: 3 }).action).toEqual({ ...NONE, nudge: 0.95 });
    expect(plan({ mediaTime: 9.0 }, { seekStreak: 3 }).action.nudge).toBe(1.05);
  });
});

describe('afterTransportCommand', () => {
  it('forgets the seek history but keeps the nudge and the seek lead', () => {
    const state = Object.freeze({
      nudge: 0.95,
      playRequested: true,
      lastSeekAt: 99,
      checkAfterSeek: true,
      seekLead: 0.3,
      seekStreak: 3,
    });
    expect(afterTransportCommand(state)).toEqual({
      nudge: 0.95,
      playRequested: false,
      lastSeekAt: -Infinity,
      checkAfterSeek: false,
      seekLead: 0.3,
      seekStreak: 0,
    });
  });
});
