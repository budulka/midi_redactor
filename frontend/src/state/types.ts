export type PedalType = 'sustain' | 'sostenuto' | 'soft';

export interface Note {
  readonly id: string;
  /** MIDI pitch, 21 (A0) to 108 (C8). */
  readonly pitch: number;
  /** Start time on the shared timeline, in seconds. */
  readonly start: number;
  /** Duration in seconds. */
  readonly duration: number;
  /** MIDI velocity, 1 to 127. */
  readonly velocity: number;
}

export interface PedalEvent {
  readonly id: string;
  readonly type: PedalType;
  /** Press time in seconds. */
  readonly start: number;
  /** Release time in seconds. */
  readonly end: number;
}

export interface TimeSignature {
  readonly numerator: number;
  readonly denominator: number;
}

export interface Project {
  /** Tempo in quarter notes per minute. */
  readonly bpm: number;
  readonly timeSignature: TimeSignature;
  /** Media second at the start of bar 1, seconds, rounded to 1 ms; see utils/mediaTimeMap.ts. */
  readonly mediaOffset: number;
  readonly notes: readonly Note[];
  readonly pedals: readonly PedalEvent[];
}

export type NotePatch = Partial<Omit<Note, 'id'>>;
export type PedalPatch = Partial<Omit<PedalEvent, 'id'>>;
