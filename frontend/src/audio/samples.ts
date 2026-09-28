import { MAX_PITCH, MIN_PITCH } from '../state/constants.ts';
import { pitchName } from '../utils/pitch.ts';

const SAMPLE_STEP_SEMITONES = 3;

/** Pitches that have a recorded sample: every third key from A0 (21) to C8 (108), 30 in total. */
export const PIANO_SAMPLE_PITCHES: readonly number[] = Array.from(
  { length: (MAX_PITCH - MIN_PITCH) / SAMPLE_STEP_SEMITONES + 1 },
  (_, index) => MIN_PITCH + index * SAMPLE_STEP_SEMITONES,
);

/** File name of the sample of a pitch: 27 -> "Ds1.mp3" ('#' is written as 's'). */
export function sampleFileName(pitch: number): string {
  return `${pitchName(pitch).replace('#', 's')}.mp3`;
}

/** Sample map for Tone.js: note name -> file name, e.g. { 'D#1': 'Ds1.mp3' }. */
export function pianoSampleUrls(): Record<string, string> {
  const urls: Record<string, string> = {};
  for (const pitch of PIANO_SAMPLE_PITCHES) {
    urls[pitchName(pitch)] = sampleFileName(pitch);
  }
  return urls;
}

/** Where the samples are served from (frontend/public/samples/salamander). */
export const PIANO_SAMPLE_BASE_URL = `${import.meta.env.BASE_URL}samples/salamander/`;
