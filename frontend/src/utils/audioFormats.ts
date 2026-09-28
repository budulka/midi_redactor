import { acceptAttribute, detectFormat, type MediaFormat, type NamedFile } from './mediaFormats.ts';

export { fileExtension } from './mediaFormats.ts';

export type AudioFormatId = 'mp3' | 'wav' | 'ogg' | 'aac' | 'm4a';

export interface AudioFormat extends MediaFormat {
  readonly id: AudioFormatId;
}

export const AUDIO_FORMATS: readonly AudioFormat[] = [
  {
    id: 'mp3',
    label: 'MP3',
    extensions: ['mp3'],
    mimeTypes: ['audio/mpeg', 'audio/mp3', 'audio/mpeg3', 'audio/x-mpeg-3'],
    probeType: 'audio/mpeg',
  },
  {
    id: 'wav',
    label: 'WAV',
    extensions: ['wav', 'wave'],
    mimeTypes: ['audio/wav', 'audio/x-wav', 'audio/wave', 'audio/vnd.wave'],
    probeType: 'audio/wav',
  },
  {
    id: 'ogg',
    label: 'OGG',
    extensions: ['ogg', 'oga'],
    mimeTypes: ['audio/ogg', 'application/ogg'],
    probeType: 'audio/ogg',
  },
  {
    id: 'aac',
    label: 'AAC',
    extensions: ['aac'],
    mimeTypes: ['audio/aac', 'audio/x-aac', 'audio/aacp'],
    probeType: 'audio/aac',
  },
  {
    id: 'm4a',
    label: 'M4A (AAC)',
    extensions: ['m4a'],
    mimeTypes: ['audio/mp4', 'audio/x-m4a', 'audio/m4a'],
    probeType: 'audio/mp4; codecs="mp4a.40.2"',
  },
];

/** Value of the file input's accept attribute: every extension, then every MIME type. */
export const AUDIO_FILE_ACCEPT: string = acceptAttribute(AUDIO_FORMATS);

/** Finds the audio format by extension first, then by MIME type. */
export function detectAudioFormat(file: NamedFile): AudioFormat | null {
  return detectFormat(AUDIO_FORMATS, file);
}

export function unsupportedFileMessage(name: string): string {
  return `Unsupported file "${name}". Choose an MP3, WAV, OGG, AAC or M4A audio file.`;
}

export function unplayableFormatMessage(format: AudioFormat): string {
  return `This browser cannot play ${format.label} audio. Try MP3 or WAV.`;
}

export function decodeFailedMessage(name: string): string {
  return `Could not read "${name}": the file is damaged or is not a supported audio file.`;
}
