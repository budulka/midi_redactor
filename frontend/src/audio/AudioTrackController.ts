import {
  MediaTrackController,
  type MediaTrackSnapshot,
  type MediaTrackStatus,
} from '../media/MediaTrackController.ts';
import {
  decodeFailedMessage,
  detectAudioFormat,
  unplayableFormatMessage,
  unsupportedFileMessage,
  type AudioFormat,
} from '../utils/audioFormats.ts';
import type { CreateWaveformPlayer } from './waveformPlayer.ts';

export type AudioTrackStatus = MediaTrackStatus;
export type AudioTrackSnapshot = MediaTrackSnapshot;

export interface AudioTrackControllerOptions {
  readonly createPlayer: CreateWaveformPlayer;
  readonly canPlayType: (mime: string) => boolean;
  readonly createObjectUrl?: (file: Blob) => string;
  readonly revokeObjectUrl?: (url: string) => void;
}

export const PLAY_FAILED_MESSAGE = 'Could not start audio playback.';

/** True when the browser reports it may play the MIME type. */
export function defaultCanPlayType(mime: string): boolean {
  return document.createElement('audio').canPlayType(mime) !== '';
}

/** Owns the audio file of the audio track (one waveform player per file). */
export class AudioTrackController extends MediaTrackController<AudioFormat> {
  constructor(options: AudioTrackControllerOptions) {
    super({
      ...options,
      detectFormat: detectAudioFormat,
      messages: {
        unsupported: unsupportedFileMessage,
        unplayable: unplayableFormatMessage,
        loadFailed: decodeFailedMessage,
        playFailed: PLAY_FAILED_MESSAGE,
      },
    });
  }
}
