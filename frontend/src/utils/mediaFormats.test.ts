import { acceptAttribute, detectFormat, fileExtension, type MediaFormat } from './mediaFormats.ts';

const X: MediaFormat = {
  id: 'x',
  label: 'X',
  extensions: ['x', 'xx'],
  mimeTypes: ['app/x'],
  probeType: 'app/x',
};
const Y: MediaFormat = {
  id: 'y',
  label: 'Y',
  extensions: ['y'],
  mimeTypes: ['app/y'],
  probeType: 'app/y',
};

describe('fileExtension', () => {
  it('returns the lowercase extension or an empty string', () => {
    expect(fileExtension('Clip.MP4')).toBe('mp4');
    expect(fileExtension('noext')).toBe('');
    expect(fileExtension('dot.')).toBe('');
  });
});

describe('detectFormat', () => {
  it('prefers the extension over the MIME type', () => {
    expect(detectFormat([X, Y], { name: 'a.XX', type: 'app/y' })).toBe(X);
  });

  it('falls back to the MIME type, ignoring its case', () => {
    expect(detectFormat([X, Y], { name: 'a', type: 'APP/Y' })).toBe(Y);
  });

  it('returns null for unknown files', () => {
    expect(detectFormat([X, Y], { name: 'a', type: '' })).toBeNull();
    expect(detectFormat([X, Y], { name: 'a.z', type: 'text/plain' })).toBeNull();
  });
});

describe('acceptAttribute', () => {
  it('lists every extension with a dot, then every MIME type', () => {
    expect(acceptAttribute([X, Y])).toBe('.x,.xx,.y,app/x,app/y');
  });
});
