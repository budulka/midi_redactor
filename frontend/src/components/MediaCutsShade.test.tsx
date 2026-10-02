import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import {
  createFakeWaveformPlayers,
  type FakeWaveformPlayer,
} from '../audio/testing/FakeWaveformPlayer.ts';
import { createFakeWaveformViews } from '../audio/testing/FakeWaveformView.ts';
import { createFakeMediaPlayers } from '../media/testing/FakeMediaPlayer.ts';
import AudioTrackProvider from '../state/AudioTrackProvider.tsx';
import { createEmptyProject } from '../state/constants.ts';
import ProjectProvider from '../state/ProjectProvider.tsx';
import type { MediaCut } from '../state/types.ts';
import VideoProvider from '../state/VideoProvider.tsx';
import AudioTrack from './AudioTrack.tsx';
import MediaCutsShade from './MediaCutsShade.tsx';

vi.mock('../media/htmlVideoPlayer.ts', () => ({ createHtmlVideoPlayer: vi.fn() }));
vi.mock('../audio/waveSurferPlayer.ts', () => ({
  createWaveSurferPlayer: vi.fn(),
  createWaveSurferView: vi.fn(),
}));

function setup(mediaCuts: readonly MediaCut[]) {
  const fake = createFakeWaveformPlayers();
  render(
    <ProjectProvider initialProject={{ ...createEmptyProject(), mediaCuts }}>
      <AudioTrackProvider
        createPlayer={fake.create}
        canPlayType={() => true}
        createWaveformView={createFakeWaveformViews().create}
      >
        <VideoProvider createPlayer={createFakeMediaPlayers().create} canPlayType={() => true}>
          <AudioTrack />
          <MediaCutsShade />
        </VideoProvider>
      </AudioTrackProvider>
    </ProjectProvider>,
  );
  const loadReady = (duration: number): FakeWaveformPlayer => {
    fireEvent.change(screen.getByLabelText('Audio file'), {
      target: { files: [new File(['x'], 'song.mp3', { type: 'audio/mpeg' })] },
    });
    const player = fake.players.at(-1);
    if (player === undefined) throw new Error('no player');
    act(() => player.emitReady(duration));
    return player;
  };
  return { loadReady };
}

const shades = () => document.querySelectorAll<HTMLElement>('.media-cuts-overlay__cut');

describe('MediaCutsShade', () => {
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;

  beforeEach(() => {
    URL.createObjectURL = vi.fn(() => 'blob:test');
    URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    cleanup();
    URL.createObjectURL = originalCreate;
    URL.revokeObjectURL = originalRevoke;
  });

  it('renders nothing without media', () => {
    setup([{ id: 'c', start: 3, end: 6 }]);
    expect(document.querySelector('.media-cuts-overlay')).toBeNull();
  });

  it('shades each cut over the whole media', () => {
    const { loadReady } = setup([
      { id: 'c', start: 3, end: 6 },
      { id: 'd', start: 31, end: 40 },
    ]);
    loadReady(30);
    expect(shades()).toHaveLength(1);
    expect(shades()[0].style.left).toBe('10%');
    expect(shades()[0].style.width).toBe('10%');
    expect(shades()[0]).toHaveAttribute('title', 'Cut 0:03.000–0:06.000 (3.000 s)');
  });
});
