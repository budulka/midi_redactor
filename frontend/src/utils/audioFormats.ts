export type AudioFormatId = 'mp3' | 'wav' | 'ogg' | 'aac' | 'm4a';

export interface AudioFormat {
  readonly id: AudioFormatId;
  /** Name shown in messages. */
  readonly label: string;
  /** Lowercase, without the dot. */
  readonly extensions: readonly string[];
  readonly mimeTypes: readonly string[];
  /** Argument for HTMLMediaElement.canPlayType. */
  readonly probeType: string;
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
export const AUDIO_FILE_ACCEPT: string = [
  ...AUDIO_FORMATS.flatMap((format) => format.extensions.map((ext) => `.${ext}`)),
  ...AUDIO_FORMATS.flatMap((format) => format.mimeTypes),
].join(',');

/** Lowercase part after the last dot; '' when there is no extension. */
export function fileExtension(name: string): string {
  const dot = name.lastIndexOf('.');
  if (dot < 0) return '';
  return name.slice(dot + 1).toLowerCase();
}

/**
 * Finds the format by extension first (operating systems name the MIME type of the same file
 * differently), then by MIME type for files without a known extension.
 */
export function detectAudioFormat(file: {
  readonly name: string;
  readonly type: string;
}): AudioFormat | null {
  const extension = fileExtension(file.name);
  if (extension !== '') {
    const byExtension = AUDIO_FORMATS.find((format) => format.extensions.includes(extension));
    if (byExtension !== undefined) return byExtension;
  }
  const type = file.type.toLowerCase();
  if (type === '') return null;
  return AUDIO_FORMATS.find((format) => format.mimeTypes.includes(type)) ?? null;
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
