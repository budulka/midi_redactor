import type { SyncClock, SyncClockSnapshot } from '../MediaSync.ts';

/** Test double of the transport clock: the position and the start delay are set by the test. */
export class FakeSyncClock implements SyncClock {
  snapshot: SyncClockSnapshot = { status: 'stopped', position: 0, rate: 1 };
  /** Live position returned by getPosition(). */
  position = 0;
  startDelay = 0;
  readonly seeks: number[] = [];
  private readonly listeners = new Set<() => void>();

  /** Replaces the snapshot (a new object) and notifies; a position also moves the live position. */
  set(changes: Partial<SyncClockSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...changes };
    if (changes.position !== undefined) this.position = changes.position;
    this.notify();
  }

  getSnapshot(): SyncClockSnapshot {
    return this.snapshot;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getPosition(): number {
    return this.position;
  }

  getStartDelay(): number {
    return this.startDelay;
  }

  seek(position: number): void {
    this.seeks.push(position);
    this.snapshot = { ...this.snapshot, position };
    this.position = position;
    this.notify();
  }

  get listenerCount(): number {
    return this.listeners.size;
  }

  private notify(): void {
    for (const listener of [...this.listeners]) listener();
  }
}
