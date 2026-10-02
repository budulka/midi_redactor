import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createFakeMediaPlayers, type FakeMediaPlayer } from '../media/testing/FakeMediaPlayer.ts';
import VideoProvider from '../state/VideoProvider.tsx';
import { VIDEO_FILE_ACCEPT } from '../utils/videoFormats.ts';
import { stubAnimationFrames } from './testing/animationFrames.ts';
import VideoPlayer from './VideoPlayer.tsx';

vi.mock('../media/htmlVideoPlayer.ts', () => ({ createHtmlVideoPlayer: vi.fn() }));

const file = (name: string, type: string) => new File(['x'], name, { type });

function setup() {
  const fake = createFakeMediaPlayers();
  render(
    <VideoProvider createPlayer={fake.create} canPlayType={() => true}>
      <VideoPlayer />
    </VideoProvider>,
  );
  const player = (index = 0): FakeMediaPlayer => {
    const found = fake.players[index];
    if (found === undefined) throw new Error(`no player ${index}`);
    return found;
  };
  return { players: fake.players, player };
}

const fileInput = () => screen.getByLabelText<HTMLInputElement>('Video file');
const position = () => screen.getByRole('status', { name: 'Video position' });
const button = (name: string) => screen.getByRole('button', { name });

function choose(name: string, type: string) {
  fireEvent.change(fileInput(), { target: { files: [file(name, type)] } });
}

function loadReady(player: (index?: number) => FakeMediaPlayer, duration = 65) {
  choose('clip.mp4', 'video/mp4');
  act(() => player().emitReady(duration));
  return player();
}

describe('VideoPlayer', () => {
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;
  let frames: ReturnType<typeof stubAnimationFrames>;

  beforeEach(() => {
    frames = stubAnimationFrames();
    URL.createObjectURL = vi.fn(() => 'blob:video');
    URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    cleanup();
    URL.createObjectURL = originalCreate;
    URL.revokeObjectURL = originalRevoke;
    vi.unstubAllGlobals();
  });

  it('shows the empty panel', () => {
    setup();
    expect(fileInput()).toHaveAttribute('accept', VIDEO_FILE_ACCEPT);
    expect(screen.getByText(/MP4, WebM/)).toBeInTheDocument();
    for (const name of ['Back 5 seconds', 'Forward 5 seconds', 'Remove video']) {
      expect(button(name)).toBeDisabled();
    }
    expect(screen.queryByRole('slider', { name: 'Seek video' })).toBeNull();
    expect(screen.queryByRole('combobox', { name: 'Video speed' })).toBeNull();
    expect(position()).toHaveTextContent('0:00.000 / 0:00.000');
  });

  it('loads a chosen file into the video screen', () => {
    const { player } = setup();
    choose('clip.mp4', 'video/mp4');
    expect(screen.getByText('Loading clip.mp4…')).toBeInTheDocument();
    expect(player().options.container).toBe(screen.getByTestId('video-screen'));
  });

  it('shows the ready video', () => {
    const { player } = setup();
    loadReady(player);
    expect(screen.getByText('clip.mp4')).toBeInTheDocument();
    expect(position()).toHaveTextContent('0:00.000 / 1:05.000');
    for (const name of ['Back 5 seconds', 'Forward 5 seconds', 'Remove video']) {
      expect(button(name)).toBeEnabled();
    }
    expect(screen.queryByRole('combobox', { name: 'Video speed' })).toBeNull();
    expect(screen.queryByRole('slider', { name: 'Seek video' })).toBeNull();
  });

  it('skips back and forward within the video', () => {
    const { player } = setup();
    const ready = loadReady(player);
    ready.currentTime = 30;
    fireEvent.click(button('Forward 5 seconds'));
    expect(ready.calls).toContain('setTime:35');
    ready.currentTime = 2;
    fireEvent.click(button('Back 5 seconds'));
    expect(ready.calls).toContain('setTime:0');
    ready.currentTime = 63;
    fireEvent.click(button('Forward 5 seconds'));
    expect(ready.calls).toContain('setTime:65');
  });

  it('follows the position while the video plays', () => {
    const { player } = setup();
    const ready = loadReady(player);
    act(() => ready.emitPlay());

    ready.currentTime = 2.5;
    frames.flushFrame();
    expect(position()).toHaveTextContent('0:02.500 / 1:05.000');

    act(() => ready.emitPause());
    expect(frames.cancelAnimationFrame).toHaveBeenCalled();
  });

  it('has no own play, pause or speed controls', () => {
    const { player } = setup();
    loadReady(player);
    for (const name of ['Play video', 'Pause video']) {
      expect(screen.queryByRole('button', { name })).toBeNull();
    }
    expect(screen.queryByRole('combobox', { name: 'Video speed' })).toBeNull();
  });

  it('mutes the video', () => {
    const { player } = setup();
    const ready = loadReady(player);
    const mute = screen.getByRole('checkbox', { name: 'Mute video' });
    expect(mute).not.toBeChecked();
    fireEvent.click(mute);
    expect(ready.calls.at(-1)).toBe('setMuted:true');
    expect(mute).toBeChecked();
    fireEvent.click(mute);
    expect(ready.calls.at(-1)).toBe('setMuted:false');
    expect(mute).not.toBeChecked();
  });

  it('explains an unsupported file and keeps the loaded video', () => {
    const { player } = setup();
    loadReady(player);
    choose('a.avi', 'video/x-msvideo');
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Unsupported file "a.avi". Choose an MP4 or WebM video file.',
    );
    expect(screen.getByText('clip.mp4')).toBeInTheDocument();
  });

  it('explains a file that cannot be played', () => {
    const { player } = setup();
    choose('clip.mp4', 'video/mp4');
    act(() => player().emitError());
    expect(screen.getByRole('alert')).toHaveTextContent('Could not play "clip.mp4":');
    expect(screen.getByText(/MP4, WebM/)).toBeInTheDocument();
  });

  it('loads a dropped file', () => {
    const { players } = setup();
    const panel = screen.getByTestId('video-screen').closest('.video-player');
    if (panel === null) throw new Error('no video player');
    expect(fireEvent.dragOver(panel, { dataTransfer: { dropEffect: 'none', files: [] } })).toBe(
      false,
    );
    fireEvent.drop(panel, { dataTransfer: { files: [file('drop.webm', 'video/webm')] } });
    expect(players).toHaveLength(1);
    expect(screen.getByText('Loading drop.webm…')).toBeInTheDocument();
  });

  it('removes the video', () => {
    const { player } = setup();
    const ready = loadReady(player);
    fireEvent.click(button('Remove video'));
    expect(ready.destroyed).toBe(true);
    expect(screen.getByText(/MP4, WebM/)).toBeInTheDocument();
    expect(button('Remove video')).toBeDisabled();
  });

  it('keeps the screen inside the clipping stage', () => {
    const { player } = setup();
    const screenElement = screen.getByTestId('video-screen');
    expect(screenElement).toHaveClass('video-player__screen');
    expect(screenElement.parentElement).toHaveClass('video-player__stage');

    const longName = 'v'.repeat(120) + '.mp4';
    choose(longName, 'video/mp4');
    act(() => player().emitReady(65));
    const name = document.querySelector('.video-player__name');
    expect(name).toHaveTextContent(longName);
    expect(name).toHaveAttribute('title', longName);
  });
});
