import {
  afterTransportCommand,
  INITIAL_TRACK_SYNC_STATE,
  MAX_CORRECTION_SEEKS,
  mediaAhead,
  nudgeFactor,
  planMediaSync,
  type MediaSyncInput,
  type TrackSyncState,
} from './mediaSyncRules.ts';

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

describe('planMediaSync before the media starts (negative offset)', () => {
  it('keeps waiting media on its first frame', () => {
    const { action, state } = plan({ target: -0.5, mediaTime: 0, mediaPlaying: false });
    expect(action).toEqual({ seekTo: null, play: false, pause: false, nudge: 1 });
    expect(state.playRequested).toBe(false);
  });

  it('pauses playing media and puts it on its first frame', () => {
    const { action } = plan({ target: -0.5, mediaTime: 0.3, mediaPlaying: true });
    expect(action).toEqual({ seekTo: 0, play: false, pause: true, nudge: 1 });
  });

  it('forgets a pending play request', () => {
    const { action, state } = plan(
      { target: -0.5, mediaTime: 0, mediaPlaying: false },
      { playRequested: true },
    );
    expect(action.play).toBe(false);
    expect(state.playRequested).toBe(false);
  });

  it('starts the media once the target reaches it', () => {
    const { action } = plan({ target: 0.07, mediaTime: 0, mediaPlaying: false });
    expect(action).toMatchObject({ seekTo: 0.07, play: true });
  });

  it('shows the first frame while the transport does not play', () => {
    const { action } = plan({
      transportPlaying: false,
      target: -0.5,
      mediaTime: 0.3,
      mediaPlaying: false,
    });
    expect(action.seekTo).toBe(0);
  });
});

describe('mediaAhead', () => {
  it('crosses the next cut', () => {
    expect(mediaAhead(3, 0.3, { ...I, segmentEnd: 3.1, nextSegmentStart: 6 })).toBeCloseTo(6.2, 9);
  });

  it('does not go back across the previous cut', () => {
    expect(mediaAhead(5.05, -0.2, { ...I, segmentStart: 5 })).toBe(5);
  });

  it('stays before the tail of the media', () => {
    expect(mediaAhead(29.95, 0.5, { ...I, duration: 30 })).toBeCloseTo(29.9, 9);
  });
});

describe('planMediaSync with media cuts', () => {
  /** Cooldown active: a seek was made half a second ago. */
  const COOLDOWN = { lastSeekAt: 99.5 };

  describe('jump over a passed cut', () => {
    it('jumps to the target although the cooldown is active', () => {
      const result = plan({ target: 5.1, segmentStart: 5, mediaTime: 1.95 }, COOLDOWN);
      expect(result.action).toEqual({ ...NONE, seekTo: 5.1 });
      expect(result.state).toEqual({ ...S, lastSeekAt: 100, checkAfterSeek: false });
    });

    it('jumps ahead by the seek lead, across the next cut too', () => {
      expect(
        plan({ target: 5.1, segmentStart: 5, mediaTime: 1.95 }, { ...COOLDOWN, seekLead: 0.2 })
          .action.seekTo,
      ).toBeCloseTo(5.3, 9);
      expect(
        plan(
          { target: 5.1, segmentStart: 5, segmentEnd: 5.2, nextSegmentStart: 8, mediaTime: 1.95 },
          { ...COOLDOWN, seekLead: 0.2 },
        ).action.seekTo,
      ).toBeCloseTo(8.1, 9);
    });

    it('jumps although the correction seeks are used up', () => {
      const result = plan(
        { target: 5.1, segmentStart: 5, mediaTime: 1.95 },
        { ...COOLDOWN, seekStreak: MAX_CORRECTION_SEEKS },
      );
      expect(result.action.seekTo).toBe(5.1);
      expect(result.state.seekStreak).toBe(MAX_CORRECTION_SEEKS);
    });
  });

  describe('media entering the next cut', () => {
    const cut = { segmentEnd: 2, nextSegmentStart: 5 };

    it('jumps over the cut keeping its lead', () => {
      const result = plan({ ...cut, target: 1.98, mediaTime: 2.01 }, COOLDOWN);
      expect(result.action.seekTo).toBeCloseTo(5.01, 9);
      expect(result.action.pause).toBe(false);
      expect(result.state.lastSeekAt).toBe(100);
    });

    it('does not jump a second time when the media is already past the cut', () => {
      const result = plan({ ...cut, target: 1.98, mediaTime: 5.02 }, COOLDOWN);
      expect(result.action).toEqual(NONE);
      expect(result.state).toEqual({ ...S, ...COOLDOWN });
      expect(plan({ ...cut, target: 1.98, mediaTime: 5.02 }).action.seekTo).toBeNull();
    });

    it('seeks back before the cut when the media is far past it', () => {
      const result = plan({ ...cut, target: 1, mediaTime: 9 });
      expect(result.action.seekTo).toBe(1);
      expect(result.state.seekStreak).toBe(1);
    });

    it('seeks back to a far target instead of jumping', () => {
      const result = plan({ ...cut, target: 0, mediaTime: 2.5 });
      expect(result.action.seekTo).toBe(0);
    });
  });

  describe('cut that runs to the end of the file', () => {
    const tail = { segmentEnd: 25, nextSegmentStart: 30, duration: 30 };

    it('pauses the playing media at the cut', () => {
      expect(plan({ ...tail, target: 24.97, mediaTime: 25 }).action).toEqual({
        ...NONE,
        pause: true,
      });
      expect(plan({ ...tail, target: 24.97, mediaTime: 24.96 }).action).toEqual({
        ...NONE,
        pause: true,
      });
    });

    it('does not start the paused media again', () => {
      const result = plan(
        { ...tail, target: 24.97, mediaTime: 25, mediaPlaying: false },
        { playRequested: true },
      );
      expect(result.action).toMatchObject({ seekTo: null, play: false });
      expect(result.state.playRequested).toBe(false);
    });

    it('does nothing while the cut is far', () => {
      expect(plan({ ...tail, target: 20, mediaTime: 20 }).action).toEqual(NONE);
    });

    it('plays from the start after a pause at the end', () => {
      const result = planMediaSync(
        { ...I, ...tail, target: 0, mediaTime: 30, mediaPlaying: false },
        INITIAL_TRACK_SYNC_STATE,
      );
      expect(result.action).toEqual({ ...NONE, seekTo: 0, play: true });
      expect(result.state.playRequested).toBe(true);
    });

    it('seeks a playing media at the cut back to a far target', () => {
      const result = plan({ ...tail, target: 0, mediaTime: 25 });
      expect(result.action).toEqual({ ...NONE, seekTo: 0 });
      expect(result.state).toMatchObject({ seekStreak: 1, checkAfterSeek: true });
    });

    it('pauses within the hard drift of the cut and seeks beyond it', () => {
      expect(plan({ ...tail, target: 24.8, mediaTime: 25 }).action).toEqual({
        ...NONE,
        pause: true,
      });
      expect(plan({ ...tail, target: 24.7, mediaTime: 25 }).action).toEqual({
        ...NONE,
        seekTo: 24.7,
      });
    });

    it('moves a far media to a target in the last moments before the cut', () => {
      expect(plan({ ...tail, target: 24.95, mediaTime: 10 }).action).toEqual({
        ...NONE,
        seekTo: 24.95,
        pause: true,
      });
    });
  });

  describe('without a jump', () => {
    it('keeps the cooldown inside one segment', () => {
      expect(
        plan({ target: 3, segmentStart: -Infinity, segmentEnd: 10, mediaTime: 3.02 }, COOLDOWN)
          .action,
      ).toEqual(NONE);
    });

    it('corrects across the next cut', () => {
      const { action } = plan(
        { target: 3, mediaTime: 2, segmentEnd: 3.1, nextSegmentStart: 6 },
        { seekLead: 0.3 },
      );
      expect(action.seekTo).toBeCloseTo(6.2, 9);
    });
  });
});
