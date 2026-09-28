import {
  detectVideoFormat,
  unplayableVideoMessage,
  unsupportedVideoMessage,
  VIDEO_FILE_ACCEPT,
  VIDEO_FORMATS,
  VIDEO_PLAY_FAILED_MESSAGE,
  videoLoadFailedMessage,
  type VideoFormat,
} from './videoFormats.ts';

const detect = (name: string, type: string) => detectVideoFormat({ name, type })?.id ?? null;

function format(id: string): VideoFormat {
  const found = VIDEO_FORMATS.find((candidate) => candidate.id === id);
  if (found === undefined) throw new Error(`no format ${id}`);
  return found;
}

describe('detectVideoFormat', () => {
  it('detects MP4 and WebM files', () => {
    expect(detect('a.mp4', 'video/mp4')).toBe('mp4');
    expect(detect('a.MP4', '')).toBe('mp4');
    expect(detect('a.m4v', 'video/x-m4v')).toBe('mp4');
    expect(detect('a.webm', 'video/webm')).toBe('webm');
    expect(detect('a.webm', 'audio/webm')).toBe('webm');
    expect(detect('clip', 'video/webm')).toBe('webm');
  });

  it('rejects other files', () => {
    expect(detect('a.mov', 'video/quicktime')).toBeNull();
    expect(detect('a.mkv', 'video/x-matroska')).toBeNull();
    expect(detect('a.avi', 'video/x-msvideo')).toBeNull();
    expect(detect('song.mp3', 'audio/mpeg')).toBeNull();
    expect(detect('clip', '')).toBeNull();
  });
});

describe('VIDEO_FORMATS', () => {
  it('probes the containers only', () => {
    expect(VIDEO_FORMATS.map((f) => f.id)).toEqual(['mp4', 'webm']);
    expect(VIDEO_FORMATS.map((f) => f.probeType)).toEqual(['video/mp4', 'video/webm']);
  });

  it('builds the accept attribute', () => {
    expect(VIDEO_FILE_ACCEPT).toBe('.mp4,.m4v,.webm,video/mp4,video/x-m4v,video/webm');
  });
});

describe('video messages', () => {
  it('explains what went wrong', () => {
    expect(unsupportedVideoMessage('a.avi')).toBe(
      'Unsupported file "a.avi". Choose an MP4 or WebM video file.',
    );
    expect(unplayableVideoMessage(format('mp4'))).toBe(
      'This browser cannot play MP4 video. Try WebM.',
    );
    expect(unplayableVideoMessage(format('webm'))).toBe(
      'This browser cannot play WebM video. Try MP4.',
    );
    expect(videoLoadFailedMessage('clip.mp4')).toBe(
      'Could not play "clip.mp4": the file is damaged or uses a codec this browser does not support.',
    );
    expect(VIDEO_PLAY_FAILED_MESSAGE).toBe('Could not start video playback.');
  });
});
