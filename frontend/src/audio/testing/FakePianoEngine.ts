import type { EngineChannel, PianoEngine } from '../engine.ts';

export interface EngineCall {
  readonly op: 'attack' | 'release' | 'releaseAll';
  readonly channel: EngineChannel;
  readonly pitch?: number;
  readonly velocity?: number;
  readonly time: number;
}

/** Test double of the audio engine: a manual clock, a call log and manually fired tickers. */
export class FakePianoEngine implements PianoEngine {
  time = 0;
  readonly calls: EngineCall[] = [];
  resumeCount = 0;
  disposed = false;
  private readonly tickers = new Set<() => void>();

  now(): number {
    return this.time;
  }

  resume(): Promise<void> {
    this.resumeCount += 1;
    return Promise.resolve();
  }

  attack(channel: EngineChannel, pitch: number, velocity: number, time: number): void {
    this.calls.push({ op: 'attack', channel, pitch, velocity, time });
  }

  release(channel: EngineChannel, pitch: number, time: number): void {
    this.calls.push({ op: 'release', channel, pitch, time });
  }

  releaseAll(channel: EngineChannel, time: number): void {
    this.calls.push({ op: 'releaseAll', channel, time });
  }

  startTicker(callback: () => void): () => void {
    const entry = () => callback();
    this.tickers.add(entry);
    return () => {
      this.tickers.delete(entry);
    };
  }

  /** Fires every active ticker once. */
  tick(): void {
    for (const ticker of [...this.tickers]) ticker();
  }

  get activeTickers(): number {
    return this.tickers.size;
  }

  dispose(): void {
    this.disposed = true;
  }
}
