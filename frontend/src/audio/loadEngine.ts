import type { PianoEngine } from './engine.ts';

/** Loads Tone.js and the piano samples on demand, so no AudioContext exists before a gesture. */
export const loadPianoEngine = (): Promise<PianoEngine> =>
  import('./toneEngine.ts').then((module) => module.createToneEngine());
