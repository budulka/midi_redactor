import { acceptAttribute, detectFormat, type MediaFormat, type NamedFile } from './mediaFormats.ts';

export type VideoFormatId = 'mp4' | 'webm';

export interface VideoFormat extends MediaFormat {
  readonly id: VideoFormatId;
}

/**
 * probeType names only the container: a codec list would make canPlayType answer '' for files the
 * browser can play; an unsupported codec is reported by the element's error event instead.
 */
export const VIDEO_FORMATS: readonly VideoFormat[] = [
  {
    id: 'mp4',
    label: 'MP4',
    extensions: ['mp4', 'm4v'],
    mimeTypes: ['video/mp4', 'video/x-m4v'],
    probeType: 'video/mp4',
  },
  {
    id: 'webm',
    label: 'WebM',
    extensions: ['webm'],
    mimeTypes: ['video/webm'],
    probeType: 'video/webm',
  },
];

/** Value of the file input's accept attribute. */
export const VIDEO_FILE_ACCEPT: string = acceptAttribute(VIDEO_FORMATS);

export const VIDEO_PLAY_FAILED_MESSAGE = 'Could not start video playback.';

/** Finds the video format by extension first, then by MIME type. */
export function detectVideoFormat(file: NamedFile): VideoFormat | null {
  return detectFormat(VIDEO_FORMATS, file);
}

export function unsupportedVideoMessage(name: string): string {
  return `Unsupported file "${name}". Choose an MP4 or WebM video file.`;
}

export function unplayableVideoMessage(format: VideoFormat): string {
  const others = VIDEO_FORMATS.filter((other) => other.id !== format.id).map(
    (other) => other.label,
  );
  return `This browser cannot play ${format.label} video. Try ${others.join(' or ')}.`;
}

export function videoLoadFailedMessage(name: string): string {
  return `Could not play "${name}": the file is damaged or uses a codec this browser does not support.`;
}
