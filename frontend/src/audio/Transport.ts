import type { Project } from '../state/types.ts';
import { timelineDurationSeconds } from '../utils/pianoRollGeometry.ts';
import type { PianoEngine } from './engine.ts';
import { buildPlaybackEvents, type PlaybackEvent } from './playbackEvents.ts';
import { advanceSchedule, resyncSchedule, startSchedule, type ScheduleState } from './scheduler.ts';
import { contextTimeAt, positionAt, type TransportAnchor } from './transportClock.ts';

/** Delay between pressing Play and the first sound, so the first notes can be scheduled. */
export const START_DELAY_SECONDS = 0.05;
/** How far ahead of the audio clock events are handed to the engine. */
export const LOOKAHEAD_SECONDS = 0.2;
export const TICK_INTERVAL_SECONDS = 0.025;
/** Timeline seconds per audio second; playback speed arrives with the media tasks. */
export const PLAYBACK_RATE = 1;

export type TransportStatus = 'stopped' | 'playing' | 'paused';

export interface TransportSnapshot {
  readonly status: TransportStatus;
  /** Cue position; while playing, the position at the moment playback started. */
  readonly position: number;
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
  private endTime = timelineDurationSeconds([], 120, { numerator: 4, denominator: 4 });
  private snapshot: TransportSnapshot = { status: 'stopped', position: 0 };
  private anchor: TransportAnchor = { contextTime: 0, position: 0, rate: PLAYBACK_RATE };
  private schedule: ScheduleState = startSchedule([], 0);
  private stopTicker: (() => void) | null = null;
  private readonly listeners = new Set<() => void>();

  constructor(options: TransportOptions = {}) {
    this.lookahead = options.lookaheadSeconds ?? LOOKAHEAD_SECONDS;
    this.tickInterval = options.tickIntervalSeconds ?? TICK_INTERVAL_SECONDS;
    this.startDelay = options.startDelaySeconds ?? START_DELAY_SECONDS;
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
    this.events = buildPlaybackEvents(project.notes, project.pedals);
    this.endTime = timelineDurationSeconds(
      project.notes,
      project.bpm,
      project.timeSignature,
      project.pedals,
    );
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
      rate: PLAYBACK_RATE,
    };
    this.schedule = startSchedule(this.events, position);
    this.snapshot = { status: 'playing', position };
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
      this.snapshot = { status: 'stopped', position: 0 };
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
    this.snapshot = { status: this.snapshot.status, position: target };
    this.notify();
  }

  /** Live position while playing, the cue position otherwise. */
  getPosition(): number {
    return this.snapshot.status === 'playing' ? this.currentPosition() : this.snapshot.position;
  }

  /** The same object until the status or the cue position changes. */
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
    this.snapshot = { status, position };
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
