import type { Project } from '../state/types.ts';
import { timelineDurationSeconds } from '../utils/pianoRollGeometry.ts';
import { clampPlaybackRate, DEFAULT_PLAYBACK_RATE } from '../utils/playbackRate.ts';
import type { PianoEngine } from './engine.ts';
import { buildPlaybackEvents, type PlaybackEvent } from './playbackEvents.ts';
import { advanceSchedule, resyncSchedule, startSchedule, type ScheduleState } from './scheduler.ts';
import { contextTimeAt, positionAt, type TransportAnchor } from './transportClock.ts';

/** Delay between pressing Play and the first sound, so the first notes can be scheduled. */
export const START_DELAY_SECONDS = 0.05;
/** How far ahead of the audio clock events are handed to the engine. */
export const LOOKAHEAD_SECONDS = 0.2;
export const TICK_INTERVAL_SECONDS = 0.025;

const EMPTY_PROJECT: Project = {
  bpm: 120,
  timeSignature: { numerator: 4, denominator: 4 },
  mediaOffset: 0,
  notes: [],
  pedals: [],
};

export type TransportStatus = 'stopped' | 'playing' | 'paused';

export interface TransportSnapshot {
  readonly status: TransportStatus;
  /** Cue position; while playing, the position at the moment playback started. */
  readonly position: number;
  /** Timeline seconds per audio second (playback speed). */
  readonly rate: number;
}

export interface TransportOptions {
  readonly lookaheadSeconds?: number;
  readonly tickIntervalSeconds?: number;
  readonly startDelaySeconds?: number;
}

/**
 * Plays the project through a PianoEngine with a lookahead scheduler. The audio clock is the
 * time source; the timeline position follows it through a TransportAnchor. Listeners are notified
 * when the status or the cue position changes, not on every tick.
 */
export class Transport {
  private readonly lookahead: number;
  private readonly tickInterval: number;
  private readonly startDelay: number;
  private engine: PianoEngine | null = null;
  private events: readonly PlaybackEvent[] = [];
  private project: Project = EMPTY_PROJECT;
  private mediaDuration = 0;
  private endTime = 0;
  private snapshot: TransportSnapshot = {
    status: 'stopped',
    position: 0,
    rate: DEFAULT_PLAYBACK_RATE,
  };
  private anchor: TransportAnchor = { contextTime: 0, position: 0, rate: DEFAULT_PLAYBACK_RATE };
  private schedule: ScheduleState = startSchedule([], 0);
  private stopTicker: (() => void) | null = null;
  private readonly listeners = new Set<() => void>();

  constructor(options: TransportOptions = {}) {
    this.lookahead = options.lookaheadSeconds ?? LOOKAHEAD_SECONDS;
    this.tickInterval = options.tickIntervalSeconds ?? TICK_INTERVAL_SECONDS;
    this.startDelay = options.startDelaySeconds ?? START_DELAY_SECONDS;
    this.updateEndTime();
  }

  setEngine(engine: PianoEngine | null): void {
    if (engine === this.engine) return;
    if (this.snapshot.status === 'playing') this.halt('paused', this.currentPosition());
    this.engine = engine;
  }

  hasEngine(): boolean {
    return this.engine !== null;
  }

  setProject(project: Project): void {
    this.project = project;
    this.events = buildPlaybackEvents(project.notes, project.pedals);
    this.updateEndTime();
    if (this.snapshot.status !== 'playing' || this.engine === null) return;
    const { state, forcedPitches } = resyncSchedule(this.schedule, this.events);
    this.schedule = state;
    const time = contextTimeAt(this.anchor, state.scheduledUntil);
    for (const pitch of forcedPitches) this.engine.release('playback', pitch, time);
  }

  play(): void {
    const engine = this.engine;
    if (engine === null) throw new Error('Piano engine is not loaded');
    if (this.snapshot.status === 'playing') return;
    const position = this.snapshot.position >= this.endTime ? 0 : this.snapshot.position;
    this.anchor = {
      contextTime: engine.now() + this.startDelay,
      position,
      rate: this.snapshot.rate,
    };
    this.schedule = startSchedule(this.events, position);
    this.snapshot = { status: 'playing', position, rate: this.snapshot.rate };
    this.tick();
    if (this.snapshot.status === 'playing') {
      this.stopTicker = engine.startTicker(this.tick, this.tickInterval);
    }
    this.notify();
  }

  pause(): void {
    if (this.snapshot.status !== 'playing') return;
    this.halt('paused', this.currentPosition());
    this.notify();
  }

  stop(): void {
    if (this.snapshot.status === 'playing') {
      this.halt('stopped', 0);
    } else if (this.snapshot.status === 'stopped' && this.snapshot.position === 0) {
      return;
    } else {
      this.snapshot = { status: 'stopped', position: 0, rate: this.snapshot.rate };
    }
    this.notify();
  }

  seek(position: number): void {
    const target = Math.max(0, position);
    if (this.snapshot.status === 'playing') {
      this.halt('paused', target);
      this.play();
      return;
    }
    if (target === this.snapshot.position) return;
    this.snapshot = { ...this.snapshot, position: target };
    this.notify();
  }

  /**
   * Changes the playback speed. While playing this works like a seek to the current position:
   * notes already handed to the engine were timed for the old rate, so playback restarts.
   */
  setRate(rate: number): void {
    const next = clampPlaybackRate(rate);
    if (next === this.snapshot.rate) return;
    if (this.snapshot.status === 'playing') {
      this.halt('paused', this.currentPosition());
      this.snapshot = { ...this.snapshot, rate: next };
      this.play();
      return;
    }
    this.snapshot = { ...this.snapshot, rate: next };
    this.notify();
  }

  /** Length of the longest loaded media, seconds; the timeline covers it. */
  setMediaDuration(seconds: number): void {
    this.mediaDuration = Math.max(0, seconds);
    this.updateEndTime();
  }

  /**
   * Timeline seconds the position still stays at the cue position after Play or a seek while
   * playing (the start delay); 0 once it moves and when not playing.
   */
  getStartDelay(): number {
    if (this.snapshot.status !== 'playing' || this.engine === null) return 0;
    return Math.max(0, this.anchor.contextTime - this.engine.now()) * this.anchor.rate;
  }

  /** Live position while playing, the cue position otherwise. */
  getPosition(): number {
    return this.snapshot.status === 'playing' ? this.currentPosition() : this.snapshot.position;
  }

  /** The same object until the status, the cue position or the rate changes. */
  getSnapshot = (): TransportSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  dispose(): void {
    this.stop();
    this.setEngine(null);
  }

  private currentPosition(): number {
    if (this.engine === null) return this.snapshot.position;
    return Math.min(positionAt(this.anchor, this.engine.now()), this.endTime);
  }

  /** Silences playback and stops the ticker without notifying listeners. */
  private halt(status: TransportStatus, position: number): void {
    this.stopTicker?.();
    this.stopTicker = null;
    this.engine?.releaseAll('playback', this.engine.now());
    this.snapshot = { status, position, rate: this.snapshot.rate };
  }

  private updateEndTime(): void {
    const { notes, bpm, timeSignature, pedals } = this.project;
    this.endTime = timelineDurationSeconds(notes, bpm, timeSignature, pedals, this.mediaDuration);
  }

  private readonly tick = (): void => {
    const engine = this.engine;
    if (engine === null || this.snapshot.status !== 'playing') return;
    const now = engine.now();
    const { state, due } = advanceSchedule(
      this.schedule,
      this.events,
      positionAt(this.anchor, now + this.lookahead),
    );
    this.schedule = state;
    for (const event of due) {
      const time = contextTimeAt(this.anchor, event.time);
      if (event.kind === 'attack') {
        engine.attack('playback', event.pitch, event.velocity, time);
      } else {
        engine.release('playback', event.pitch, time);
      }
    }
    if (positionAt(this.anchor, now) >= this.endTime) {
      this.halt('paused', this.endTime);
      this.notify();
    }
  };

  private notify(): void {
    for (const listener of [...this.listeners]) listener();
  }
}
