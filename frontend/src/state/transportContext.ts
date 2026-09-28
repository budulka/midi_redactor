import { createContext, useContext } from 'react';
import type { TransportStatus } from '../audio/Transport.ts';

/** Velocity of notes played on the on-screen keyboard. */
export const LIVE_VELOCITY = 96;

/** Loading state of the piano engine: nothing is loaded before the first user gesture. */
export type EngineStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface TransportState {
  readonly status: TransportStatus;
  /** Cue position; while playing, the position at the moment playback started. */
  readonly position: number;
  readonly engineStatus: EngineStatus;
  readonly engineError: string | null;
}

/** Stable transport commands; the same object for the whole lifetime of the provider. */
export interface TransportApi {
  togglePlay(): void;
  stop(): void;
  seek(position: number): void;
  /** Live position while playing (read it in animation frames, it does not trigger renders). */
  getPosition(): number;
  noteOn(pitch: number): void;
  noteOff(pitch: number): void;
  /** Retries loading the piano after an error. */
  retry(): void;
}

export const TransportStateContext = createContext<TransportState | null>(null);
export const TransportApiContext = createContext<TransportApi | null>(null);

export function useTransportState(): TransportState {
  const state = useContext(TransportStateContext);
  if (state === null) {
    throw new Error('useTransportState must be used within TransportProvider');
  }
  return state;
}

export function useTransportApi(): TransportApi {
  const api = useContext(TransportApiContext);
  if (api === null) {
    throw new Error('useTransportApi must be used within TransportProvider');
  }
  return api;
}
