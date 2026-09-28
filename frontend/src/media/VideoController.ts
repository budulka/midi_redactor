import {
  detectVideoFormat,
  unplayableVideoMessage,
  unsupportedVideoMessage,
  VIDEO_PLAY_FAILED_MESSAGE,
  videoLoadFailedMessage,
  type VideoFormat,
} from '../utils/videoFormats.ts';
import type { CreateMediaPlayer } from './mediaPlayer.ts';
import { MediaTrackController } from './MediaTrackController.ts';

export interface VideoControllerOptions {
  readonly createPlayer: CreateMediaPlayer;
  readonly canPlayType: (mime: string) => boolean;
  readonly createObjectUrl?: (file: Blob) => string;
  readonly revokeObjectUrl?: (url: string) => void;
}

/** True when the browser reports a video element may play the MIME type. */
export function defaultVideoCanPlayType(mime: string): boolean {
  return document.createElement('video').canPlayType(mime) !== '';
}

/** Owns the video file of the video panel (one video player per file). */
export class VideoController extends MediaTrackController<VideoFormat> {
  constructor(options: VideoControllerOptions) {
    super({
      ...options,
      detectFormat: detectVideoFormat,
      messages: {
        unsupported: unsupportedVideoMessage,
        unplayable: unplayableVideoMessage,
        loadFailed: videoLoadFailedMessage,
        playFailed: VIDEO_PLAY_FAILED_MESSAGE,
      },
    });
  }
}
