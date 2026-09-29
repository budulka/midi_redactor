import appCss from './App.css?raw';

// jsdom does not lay out the page, so these tests pin the CSS rules the media panel layout relies
// on (see the e2e test e2e/video-fit.spec.ts for the real geometry).

let style: HTMLStyleElement;

beforeAll(() => {
  style = document.createElement('style');
  style.textContent = appCss;
  document.head.append(style);
});

afterAll(() => {
  style.remove();
});

const normalize = (selector: string) => selector.trim().replace(/\s+/g, ' ');

/** Declarations of all rules whose selector list contains exactly `selector`; later rules win. */
function declarations(selector: string): Record<string, string> {
  const sheet = style.sheet;
  if (sheet === null) throw new Error('the stylesheet is not parsed');
  const result: Record<string, string> = {};
  for (const rule of Array.from(sheet.cssRules)) {
    if (!(rule instanceof CSSStyleRule)) continue;
    if (!rule.selectorText.split(',').map(normalize).includes(selector)) continue;
    for (const property of Array.from(rule.style)) {
      result[property] = rule.style.getPropertyValue(property);
    }
  }
  return result;
}

describe('media panel layout rules', () => {
  it('gives the editor and the panel rows a zero minimum', () => {
    const app = declarations('.app');
    expect(app['grid-template-columns']).toMatch(/^minmax\(0, 1fr\)/);
    expect(app['grid-template-rows']).toBe('auto minmax(0, 1fr)');
  });

  it('wraps the header instead of widening the page', () => {
    expect(declarations('.app__transport')['flex-wrap']).toBe('wrap');
  });

  it('keeps the media column within the panel', () => {
    expect(declarations('.app__media')).toMatchObject({
      'grid-template-columns': 'minmax(0, 1fr)',
      'grid-template-rows': 'minmax(0, 1fr) minmax(0, 1fr)',
      'min-width': '0',
      overflow: 'hidden',
    });
  });

  it('never lets a media section scroll horizontally', () => {
    expect(declarations('.app__media > section')).toMatchObject({
      'min-width': '0',
      'overflow-x': 'hidden',
    });
  });

  it('clips the video stage and positions the screen inside it', () => {
    expect(declarations('.video-player__stage')).toMatchObject({
      'min-width': '0',
      overflow: 'hidden',
      position: 'relative',
    });
    expect(declarations('.video-player__screen').position).toBe('absolute');
  });

  it('fits the video frame into its box', () => {
    expect(declarations('.video-player__video')).toMatchObject({
      'object-fit': 'contain',
      width: '100%',
      height: '100%',
      'max-width': '100%',
      'max-height': '100%',
    });
  });

  it.each(['.video-player__name', '.audio-track__name'])(
    'truncates %s with an ellipsis',
    (name) => {
      expect(declarations(name)).toMatchObject({
        'min-width': '0',
        overflow: 'hidden',
        'text-overflow': 'ellipsis',
      });
    },
  );

  it.each(['.video-player__error', '.audio-track__error'])('wraps long words in %s', (name) => {
    expect(declarations(name)['overflow-wrap']).toBe('anywhere');
  });
});
