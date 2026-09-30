import { expect, type Locator, type Page } from '@playwright/test';

export interface TestVideoOptions {
  readonly width: number;
  readonly height: number;
  /** Length of the recording, 800 ms by default. */
  readonly durationMs?: number;
  /** Adds a sound track (a 440 Hz tone), so the video has audio to draw. */
  readonly withSound?: boolean;
}

const DEFAULT_DURATION_MS = 800;
/** Tolerance for rounding of element boxes, in CSS pixels. */
const TOLERANCE_PX = 1;

/**
 * Records a WebM clip of a moving pattern in the page (canvas + MediaRecorder), so the tests do not
 * need committed media files or ffmpeg. The frame has a border and a diagonal, which makes cropping
 * visible when debugging by hand.
 */
export async function recordTestVideo(page: Page, options: TestVideoOptions): Promise<Buffer> {
  const base64 = await page.evaluate(
    async ({ width, height, durationMs, withSound }) => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (context === null) throw new Error('2d canvas is not available');
      let frame = 0;
      const draw = () => {
        frame += 1;
        context.fillStyle = `hsl(${(frame * 12) % 360}, 60%, 40%)`;
        context.fillRect(0, 0, width, height);
        context.strokeStyle = '#ffffff';
        context.lineWidth = Math.max(2, Math.min(width, height) / 20);
        context.beginPath();
        context.moveTo(0, 0);
        context.lineTo(width, height);
        context.stroke();
        context.strokeRect(0, 0, width, height);
      };
      draw();
      const canvasStream = canvas.captureStream(30);
      let stream: MediaStream = canvasStream;
      let audioContext: AudioContext | null = null;
      if (withSound) {
        audioContext = new AudioContext();
        const oscillator = audioContext.createOscillator();
        oscillator.frequency.value = 440;
        const destination = audioContext.createMediaStreamDestination();
        oscillator.connect(destination);
        oscillator.start();
        stream = new MediaStream([
          ...canvasStream.getVideoTracks(),
          ...destination.stream.getAudioTracks(),
        ]);
      }
      const recorder = new MediaRecorder(stream, {
        mimeType: withSound ? 'video/webm;codecs=vp8,opus' : 'video/webm;codecs=vp8',
      });
      const chunks: Blob[] = [];
      recorder.addEventListener('dataavailable', (event) => chunks.push(event.data));
      const stopped = new Promise<void>((resolve) =>
        recorder.addEventListener('stop', () => resolve()),
      );
      const timer = window.setInterval(draw, 33);
      recorder.start();
      await new Promise((resolve) => window.setTimeout(resolve, durationMs));
      recorder.stop();
      await stopped;
      window.clearInterval(timer);
      await audioContext?.close();
      const blob = new Blob(chunks, { type: 'video/webm' });
      return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const url = String(reader.result);
          resolve(url.slice(url.indexOf(',') + 1));
        };
        reader.onerror = () => reject(new Error('could not read the recording'));
        reader.readAsDataURL(blob);
      });
    },
    {
      width: options.width,
      height: options.height,
      durationMs: options.durationMs ?? DEFAULT_DURATION_MS,
      withSound: options.withSound ?? false,
    },
  );
  return Buffer.from(base64, 'base64');
}

/** Loads a file into the video panel and waits until the <video> has its first frame. */
export async function loadVideo(page: Page, name: string, buffer: Buffer): Promise<Locator> {
  await page.getByLabel('Video file').setInputFiles({ name, mimeType: 'video/webm', buffer });
  await page.waitForFunction(() => {
    const video = document.querySelector<HTMLVideoElement>('.video-player__video');
    const loading = document.querySelector('.video-player__status');
    return video !== null && video.readyState >= 2 && video.videoWidth > 0 && loading === null;
  });
  return page.locator('.video-player__video');
}

/** Fails with the list of elements that overflow horizontally. */
export async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const result = await page.evaluate(() => {
    const targets: [string, Element | null][] = [
      ['html', document.documentElement],
      ['aside Media', document.querySelector('aside[aria-label="Media"]')],
      ['section Video', document.querySelector('section[aria-label="Video"]')],
      ['section Audio track', document.querySelector('section[aria-label="Audio track"]')],
      ['.video-player', document.querySelector('.video-player')],
      ['.video-player__stage', document.querySelector('.video-player__stage')],
    ];
    const overflowing = targets
      .filter((target): target is [string, Element] => target[1] !== null)
      .map(([name, element]) => [name, element.scrollWidth, element.clientWidth] as const)
      .filter(([, scrollWidth, clientWidth]) => scrollWidth > clientWidth);
    const aside = document.querySelector('aside[aria-label="Media"]');
    const asideRight = aside === null ? 0 : aside.getBoundingClientRect().right;
    return { overflowing, asideRight, innerWidth: window.innerWidth };
  });
  expect(result.overflowing).toEqual([]);
  expect(result.asideRight).toBeLessThanOrEqual(result.innerWidth);
}

async function boxOf(locator: Locator) {
  const box = await locator.boundingBox();
  if (box === null) throw new Error('element is not visible');
  return box;
}

/** Checks that the <video> fills the stage and that the stage lies inside the Video section. */
export async function expectVideoInsidePanel(page: Page): Promise<void> {
  const video = page.locator('.video-player__video');
  const stage = page.locator('.video-player__stage');
  const section = page.locator('section[aria-label="Video"]');
  const [videoBox, stageBox, sectionBox] = await Promise.all([
    boxOf(video),
    boxOf(stage),
    boxOf(section),
  ]);

  const inside = (
    inner: { x: number; y: number; width: number; height: number },
    outer: { x: number; y: number; width: number; height: number },
  ) =>
    inner.x >= outer.x - TOLERANCE_PX &&
    inner.y >= outer.y - TOLERANCE_PX &&
    inner.x + inner.width <= outer.x + outer.width + TOLERANCE_PX &&
    inner.y + inner.height <= outer.y + outer.height + TOLERANCE_PX;

  expect(inside(videoBox, stageBox), 'video lies inside the stage').toBe(true);
  expect(inside(stageBox, sectionBox), 'stage lies inside the Video section').toBe(true);
  expect(Math.abs(videoBox.width - stageBox.width)).toBeLessThanOrEqual(TOLERANCE_PX);
  expect(Math.abs(videoBox.height - stageBox.height)).toBeLessThanOrEqual(TOLERANCE_PX);
  expect(await video.evaluate((element) => getComputedStyle(element).objectFit)).toBe('contain');
}

/** A mono 16-bit PCM WAV file (8 kHz) with a sine tone, built in Node. */
export function makeTestWav(seconds = 2, frequency = 440): Buffer {
  const sampleRate = 8000;
  const samples = Math.round(seconds * sampleRate);
  const dataSize = samples * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write('RIFF', 0, 'ascii');
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8, 'ascii');
  buffer.write('fmt ', 12, 'ascii');
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36, 'ascii');
  buffer.writeUInt32LE(dataSize, 40);
  for (let i = 0; i < samples; i += 1) {
    const value = Math.sin((2 * Math.PI * frequency * i) / sampleRate) * 0.5;
    buffer.writeInt16LE(Math.round(value * 32767), 44 + i * 2);
  }
  return buffer;
}

/** Loads a file into the audio track and waits until its waveform is drawn. */
export async function loadAudio(page: Page, name: string, buffer: Buffer): Promise<void> {
  await page.getByLabel('Audio file').setInputFiles({ name, mimeType: 'audio/wav', buffer });
  const track = page.getByRole('region', { name: 'Audio track' });
  await expect(track.locator('.audio-track__status')).toHaveCount(0);
  await expect(track.locator('.audio-track__name')).toHaveText(name);
}

export interface MediaElementInfo {
  readonly tag: 'audio' | 'video';
  readonly src: string;
  readonly paused: boolean;
}

/** Every <audio> and <video> in the document, including those inside open shadow roots. */
export async function mediaElements(page: Page): Promise<MediaElementInfo[]> {
  return page.evaluate(() => {
    const found: { tag: 'audio' | 'video'; src: string; paused: boolean }[] = [];
    const visit = (root: Document | ShadowRoot) => {
      for (const element of Array.from(root.querySelectorAll('*'))) {
        if (element instanceof HTMLMediaElement) {
          found.push({
            tag: element instanceof HTMLVideoElement ? 'video' : 'audio',
            src: element.currentSrc || element.src,
            paused: element.paused,
          });
        }
        if (element.shadowRoot !== null) visit(element.shadowRoot);
      }
    };
    visit(document);
    return found;
  });
}

export interface TrackedObjectUrls {
  readonly created: { url: string; name: string }[];
  readonly revoked: string[];
}

/**
 * Records the object URLs made from files (not the blob URLs WaveSurfer makes itself) and the
 * revoked ones in window.__mediaUrls. Call it before opening the app.
 */
export async function trackObjectUrls(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const record: { created: { url: string; name: string }[]; revoked: string[] } = {
      created: [],
      revoked: [],
    };
    Object.assign(window, { __mediaUrls: record });
    const create = URL.createObjectURL.bind(URL);
    const revoke = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = (object: Blob | MediaSource) => {
      const url = create(object);
      if (object instanceof File) record.created.push({ url, name: object.name });
      return url;
    };
    URL.revokeObjectURL = (url: string) => {
      record.revoked.push(url);
      revoke(url);
    };
  });
}

/** The object URLs recorded by trackObjectUrls(). */
export async function objectUrls(page: Page): Promise<TrackedObjectUrls> {
  return page.evaluate(() => (window as unknown as { __mediaUrls: TrackedObjectUrls }).__mediaUrls);
}

/** The object URL made for the file with this name. */
export async function objectUrlOf(page: Page, name: string): Promise<string> {
  const { created } = await objectUrls(page);
  const entry = created.find((item) => item.name === name);
  if (entry === undefined) throw new Error(`no object URL for ${name}`);
  return entry.url;
}
