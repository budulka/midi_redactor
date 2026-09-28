import type {
  CreateWaveformPlayer,
  CreateWaveformPlayerOptions,
  WaveformPlayer,
} from '../waveformPlayer.ts';

/** Test double of a waveform player: a call log and helpers that fire the player events. */
export class FakeWaveformPlayer implements WaveformPlayer {
  currentTime = 0;
  rate: number | null = null;
  destroyed = false;
  playError: Error | null = null;
  readonly calls: string[] = [];

  constructor(readonly options: CreateWaveformPlayerOptions) {}

  play(): Promise<void> {
    this.calls.push('play');
    if (this.playError !== null) return Promise.reject(this.playError);
    this.options.events.onPlay();
    return Promise.resolve();
  }

  pause(): void {
    this.calls.push('pause');
    this.options.events.onPause();
  }

  setTime(seconds: number): void {
    this.calls.push(`setTime:${seconds}`);
    this.currentTime = seconds;
  }

  getCurrentTime(): number {
    return this.currentTime;
  }

  setPlaybackRate(rate: number): void {
    this.calls.push(`setPlaybackRate:${rate}`);
    this.rate = rate;
  }

  destroy(): void {
    this.calls.push('destroy');
    this.destroyed = true;
  }

  emitReady(duration: number): void {
    this.options.events.onReady(duration);
  }

  emitError(error: Error = new Error('decode failed')): void {
    this.options.events.onError(error);
  }

  emitSeek(time: number): void {
    this.currentTime = time;
    this.options.events.onSeek(time);
  }

  emitPause(): void {
    this.options.events.onPause();
  }

  emitFinish(): void {
    this.options.events.onFinish();
  }
}

export function createFakeWaveformPlayers(): {
  create: CreateWaveformPlayer;
  players: FakeWaveformPlayer[];
} {
  const players: FakeWaveformPlayer[] = [];
  const create: CreateWaveformPlayer = (options) => {
    const player = new FakeWaveformPlayer(options);
    players.push(player);
    return player;
  };
  return { create, players };
}
