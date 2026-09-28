import {
  PIANO_SAMPLE_BASE_URL,
  PIANO_SAMPLE_PITCHES,
  pianoSampleUrls,
  sampleFileName,
} from './samples.ts';

describe('piano samples', () => {
  it('lists every third pitch from A0 to C8', () => {
    expect(PIANO_SAMPLE_PITCHES).toHaveLength(30);
    expect(PIANO_SAMPLE_PITCHES[0]).toBe(21);
    expect(PIANO_SAMPLE_PITCHES[PIANO_SAMPLE_PITCHES.length - 1]).toBe(108);
    PIANO_SAMPLE_PITCHES.slice(1).forEach((pitch, index) => {
      expect(pitch - PIANO_SAMPLE_PITCHES[index]).toBe(3);
    });
  });

  it('names sample files with s instead of #', () => {
    expect(sampleFileName(21)).toBe('A0.mp3');
    expect(sampleFileName(27)).toBe('Ds1.mp3');
    expect(sampleFileName(30)).toBe('Fs1.mp3');
    expect(sampleFileName(108)).toBe('C8.mp3');
  });

  it('maps note names to sample files', () => {
    const urls = pianoSampleUrls();
    expect(Object.keys(urls)).toHaveLength(30);
    expect(urls['D#1']).toBe('Ds1.mp3');
    expect(urls['C4']).toBe('C4.mp3');
    expect(urls).not.toHaveProperty('C#4');
  });

  it('serves samples from the public samples directory', () => {
    expect(PIANO_SAMPLE_BASE_URL.endsWith('samples/salamander/')).toBe(true);
  });
});
