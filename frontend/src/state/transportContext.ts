import { createContext, useContext } from 'react';
import type { TransportStatus } from '../audio/Transport.ts';
import type { SyncedMediaTrack } from '../media/MediaSync.ts';
import type { MediaTimeMap } from '../utils/mediaTimeMap.ts';

/** Velocity of notes played on the on-screen keyboard. */
export const LIVE_VELOCITY = 96;

/** Loading state of the piano engine: nothing is loaded before the first user gesture. */
export type EngineStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface TransportState {
  readonly status: TransportStatus;
  /** Cue position; while playing, the position at the moment playback started. */
  readonly position: number;
  /** Playback speed of the notes and the media. */
  readonly rate: number;
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
  /** Playback speed of the notes and the media, 0.25–2. */
  setRate(rate: number): void;
  /** Makes a media track follow the transport; returns the function that detaches it. */
  attachMedia(track: SyncedMediaTrack): () => void;
  /**
   * Applies a media offset to the synchronization at once, before the project change reaches it
   * (drag preview, "Bar 1 here"); with `seekTo` the transport seeks in the same sync pass.
   */
  applyMediaOffset(offset: number, seekTo?: number): void;
  /** Applies a whole media time map at once (cut edge preview); with `seekTo` the transport seeks in the same sync pass. */
  applyMediaTimeMap(map: MediaTimeMap, seekTo?: number): void;
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
