import {
  AUDIO_FILE_ACCEPT,
  AUDIO_FORMATS,
  decodeFailedMessage,
  detectAudioFormat,
  fileExtension,
  unplayableFormatMessage,
  unsupportedFileMessage,
  type AudioFormat,
  type AudioFormatId,
} from './audioFormats.ts';

function format(id: AudioFormatId): AudioFormat {
  const found = AUDIO_FORMATS.find((candidate) => candidate.id === id);
  if (found === undefined) throw new Error(`no format ${id}`);
  return found;
}

const detect = (name: string, type: string) => detectAudioFormat({ name, type })?.id ?? null;

describe('fileExtension', () => {
  it('returns the lowercase part after the last dot', () => {
    expect(fileExtension('Song.MP3')).toBe('mp3');
    expect(fileExtension('archive.tar.gz')).toBe('gz');
  });

  it('returns an empty string without an extension', () => {
    expect(fileExtension('README')).toBe('');
    expect(fileExtension('trailing.')).toBe('');
  });
});

describe('detectAudioFormat', () => {
  it('detects formats by extension', () => {
    expect(detect('a.mp3', 'audio/mpeg')).toBe('mp3');
    expect(detect('a.WAV', '')).toBe('wav');
    expect(detect('a.wave', '')).toBe('wav');
    expect(detect('a.oga', 'audio/ogg')).toBe('ogg');
    expect(detect('a.aac', 'audio/aac')).toBe('aac');
    expect(detect('a.m4a', 'audio/x-m4a')).toBe('m4a');
  });

  it('prefers the extension over the MIME type', () => {
    expect(detect('a.ogg', 'video/ogg')).toBe('ogg');
    expect(detect('a.m4a', 'video/mp4')).toBe('m4a');
  });

  it('falls back to the MIME type without an extension', () => {
    expect(detect('track', 'audio/mpeg')).toBe('mp3');
    expect(detect('track', 'audio/x-m4a')).toBe('m4a');
    expect(detect('track', '')).toBeNull();
  });

  it('rejects unsupported files', () => {
    expect(detect('a.flac', 'audio/flac')).toBeNull();
    expect(detect('clip.mp4', 'video/mp4')).toBeNull();
    expect(detect('notes.txt', 'text/plain')).toBeNull();
    expect(detect('a.mp3.txt', 'text/plain')).toBeNull();
  });
});

describe('AUDIO_FORMATS', () => {
  it('lists the five supported formats', () => {
    expect(AUDIO_FORMATS.map((candidate) => candidate.id)).toEqual([
      'mp3',
      'wav',
      'ogg',
      'aac',
      'm4a',
    ]);
    expect(format('m4a').probeType).toContain('mp4a.40.2');
  });
});

describe('AUDIO_FILE_ACCEPT', () => {
  it('lists audio extensions and MIME types only', () => {
    for (const part of ['.mp3', '.wav', '.ogg', '.aac', '.m4a', 'audio/mpeg']) {
      expect(AUDIO_FILE_ACCEPT.split(',')).toContain(part);
    }
    expect(AUDIO_FILE_ACCEPT).not.toContain('video/');
    expect(AUDIO_FILE_ACCEPT).not.toContain('audio/*');
  });
});

describe('messages', () => {
  it('explains unsupported files', () => {
    expect(unsupportedFileMessage('a.flac')).toBe(
      'Unsupported file "a.flac". Choose an MP3, WAV, OGG, AAC or M4A audio file.',
    );
  });

  it('explains formats the browser cannot play', () => {
    expect(unplayableFormatMessage(format('aac'))).toBe(
      'This browser cannot play AAC audio. Try MP3 or WAV.',
    );
    expect(unplayableFormatMessage(format('m4a'))).toBe(
      'This browser cannot play M4A (AAC) audio. Try MP3 or WAV.',
    );
  });

  it('explains files that cannot be decoded', () => {
    expect(decodeFailedMessage('x.mp3')).toBe(
      'Could not read "x.mp3": the file is damaged or is not a supported audio file.',
    );
  });
});
