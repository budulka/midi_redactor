import type { PedalType, Project, TimeSignature } from './types.ts';

export const MIN_PITCH = 21;
export const MAX_PITCH = 108;
export const MIN_VELOCITY = 1;
export const MAX_VELOCITY = 127;
export const MIN_NOTE_DURATION = 0.001;
export const MIN_PEDAL_DURATION = 0.001;
export const MIN_BPM = 20;
export const MAX_BPM = 300;
export const MIN_NUMERATOR = 1;
export const MAX_NUMERATOR = 32;
/** Limits of the media offset (media second at bar 1), seconds. */
export const MIN_MEDIA_OFFSET = -3600;
export const MAX_MEDIA_OFFSET = 3600;
/** The media offset is kept to the millisecond. */
export const MEDIA_OFFSET_STEP = 0.001;

export const PEDAL_TYPES: readonly PedalType[] = ['sustain', 'sostenuto', 'soft'];
export const ALLOWED_DENOMINATORS: readonly number[] = [1, 2, 4, 8, 16, 32];

export const DEFAULT_BPM = 120;
export const DEFAULT_TIME_SIGNATURE: TimeSignature = { numerator: 4, denominator: 4 };

export function createEmptyProject(): Project {
  return {
    bpm: DEFAULT_BPM,
    timeSignature: DEFAULT_TIME_SIGNATURE,
    mediaOffset: 0,
    notes: [],
    pedals: [],
  };
}

/** MIDI control change numbers of the piano pedals. */
export const PEDAL_CC: Readonly<Record<PedalType, number>> = {
  sustain: 64,
  sostenuto: 66,
  soft: 67,
};

export const PEDAL_LABELS: Readonly<Record<PedalType, string>> = {
  sustain: 'Sustain',
  sostenuto: 'Sostenuto',
  soft: 'Soft',
};
