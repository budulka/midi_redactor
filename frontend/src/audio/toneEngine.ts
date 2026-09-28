import { Sampler, ToneAudioBuffers, getContext, start } from 'tone';
import { pitchName } from '../utils/pitch.ts';
import type { EngineChannel, PianoEngine } from './engine.ts';
import { PIANO_SAMPLE_BASE_URL, pianoSampleUrls } from './samples.ts';

/** Release time of a voice after a note is let go, seconds. */
export const SAMPLER_RELEASE_SECONDS = 0.2;
/** Headroom so that many simultaneous notes do not clip. */
export const SAMPLER_VOLUME_DB = -6;

function loadBuffers(): Promise<ToneAudioBuffers> {
  return new Promise((resolve, reject) => {
    const buffers: ToneAudioBuffers = new ToneAudioBuffers({
      urls: pianoSampleUrls(),
      baseUrl: PIANO_SAMPLE_BASE_URL,
      onload: () => resolve(buffers),
      onerror: () => reject(new Error('Could not load piano samples')),
    });
  });
}

/**
 * Creates the Tone.js piano: the audio context is started, the Salamander samples are decoded once
 * and shared by two samplers, one for the transport and one for the on-screen keyboard.
 * This is the only module that imports Tone.js; it is loaded lazily on the first user gesture.
 */
export async function createToneEngine(): Promise<PianoEngine> {
  await start();
  const buffers = await loadBuffers();
  const sampleMap = Object.fromEntries(
    Object.keys(pianoSampleUrls()).map((name) => [name, buffers.get(name)]),
  );
  const createSampler = () =>
    new Sampler({
      urls: sampleMap,
      release: SAMPLER_RELEASE_SECONDS,
      volume: SAMPLER_VOLUME_DB,
    }).toDestination();
  const samplers: Record<EngineChannel, Sampler> = {
    playback: createSampler(),
    live: createSampler(),
  };

  return {
    now: () => getContext().currentTime,
    resume: () => start(),
    attack(channel, pitch, velocity, time) {
      samplers[channel].triggerAttack(pitchName(pitch), time, velocity / 127);
    },
    release(channel, pitch, time) {
      samplers[channel].triggerRelease(pitchName(pitch), time);
    },
    releaseAll(channel, time) {
      samplers[channel].releaseAll(time);
    },
    startTicker(callback, intervalSeconds) {
      const context = getContext();
      const id = context.setInterval(callback, intervalSeconds);
      return () => {
        context.clearInterval(id);
      };
    },
    dispose() {
      // Both samplers share the same ToneAudioBuffer objects, so each buffer is disposed more than
      // once here; disposing a Tone.js buffer again is harmless.
      samplers.playback.dispose();
      samplers.live.dispose();
      buffers.dispose();
    },
  };
}
