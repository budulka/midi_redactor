import type { ReactNode } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { FakePianoEngine } from '../audio/testing/FakePianoEngine.ts';
import { createFakeWaveformPlayers } from '../audio/testing/FakeWaveformPlayer.ts';
import { createFakeWaveformViews } from '../audio/testing/FakeWaveformView.ts';
import { createFakeMediaPlayers } from '../media/testing/FakeMediaPlayer.ts';
import AudioTrackProvider from '../state/AudioTrackProvider.tsx';
import { createEmptyProject } from '../state/constants.ts';
import EditorProvider from '../state/EditorProvider.tsx';
import MediaSyncBridge from '../state/MediaSyncBridge.tsx';
import ProjectProvider from '../state/ProjectProvider.tsx';
import TransportProvider from '../state/TransportProvider.tsx';
import type { MediaCut, Note, PedalEvent } from '../state/types.ts';
import VideoProvider from '../state/VideoProvider.tsx';
import type { KeyChord } from '../utils/keyChord.ts';
import { SHORTCUT_SCOPES, type ShortcutScope } from '../utils/shortcutRegistry.ts';
import AppLayout from './AppLayout.tsx';
import AudioTrack from './AudioTrack.tsx';
import CommitNumberInput from './CommitNumberInput.tsx';
import ContextMenu from './ContextMenu.tsx';
import ExportButton from './ExportButton.tsx';
import KeyboardShortcuts from './KeyboardShortcuts.tsx';
import MediaOffsetMarker from './MediaOffsetMarker.tsx';
import MediaTimeline from './MediaTimeline.tsx';
import PianoRoll from './PianoRoll/PianoRoll.tsx';
import { renderWithProviders } from './PianoRoll/testUtils.tsx';
import ShortcutsDialog from './ShortcutsDialog.tsx';
import { stubAnimationFrames } from './testing/animationFrames.ts';
import { expectKeyContract } from './testing/keyContract.ts';
import TransportControls from './TransportControls.tsx';

vi.mock('../media/htmlVideoPlayer.ts', () => ({ createHtmlVideoPlayer: vi.fn() }));
vi.mock('../audio/waveSurferPlayer.ts', () => ({
  createWaveSurferPlayer: vi.fn(),
  createWaveSurferView: vi.fn(),
}));

const notes: Note[] = [
  { id: 'n1', pitch: 60, start: 0, duration: 0.5, velocity: 100 },
  { id: 'n2', pitch: 64, start: 1, duration: 0.5, velocity: 100 },
];

const pedals: PedalEvent[] = [
  { id: 'p1', type: 'sustain', start: 0, end: 1 },
  { id: 'p2', type: 'sustain', start: 2, end: 3 },
];

/** Media providers with a ready 30 s audio file; no KeyboardShortcuts. */
function renderMedia(
  ui: ReactNode,
  project: { mediaOffset?: number; mediaCuts?: readonly MediaCut[] } = {},
) {
  const fake = createFakeWaveformPlayers();
  render(
    <ProjectProvider initialProject={{ ...createEmptyProject(), ...project }}>
      <EditorProvider>
        <TransportProvider loadEngine={() => Promise.resolve(new FakePianoEngine())}>
          <AudioTrackProvider
            createPlayer={fake.create}
            canPlayType={() => true}
            createWaveformView={createFakeWaveformViews().create}
          >
            <VideoProvider createPlayer={createFakeMediaPlayers().create} canPlayType={() => true}>
              <MediaSyncBridge />
              {ui}
            </VideoProvider>
          </AudioTrackProvider>
        </TransportProvider>
      </EditorProvider>
    </ProjectProvider>,
  );
  fireEvent.change(screen.getByLabelText('Audio file'), {
    target: { files: [new File(['x'], 'song.mp3', { type: 'audio/mpeg' })] },
  });
  const player = fake.players.at(-1);
  if (player === undefined) throw new Error('no player');
  act(() => player.emitReady(30));
}

function mockTrackRect() {
  const track = document.querySelector<HTMLElement>('.media-timeline__track');
  if (track === null) throw new Error('no track');
  vi.spyOn(track, 'getBoundingClientRect').mockReturnValue({
    left: 0,
    top: 0,
    right: 6000,
    bottom: 28,
    width: 6000,
    height: 28,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  });
}

function renderTimeline(mediaCuts: readonly MediaCut[] = []) {
  renderMedia(
    <>
      <MediaTimeline durationSeconds={60} pixelsPerSecond={100} />
      <AudioTrack />
    </>,
    { mediaCuts },
  );
  mockTrackRect();
}

const SETUPS: { readonly [S in ShortcutScope]: () => Element | Window } = {
  global: () => {
    stubAnimationFrames();
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => {})),
    );
    renderWithProviders(
      <>
        <KeyboardShortcuts />
        <TransportControls />
        <ExportButton />
      </>,
    );
    return document.body;
  },
  noteGrid: () => {
    renderWithProviders(<PianoRoll />, notes, { selectedNoteIds: ['n1', 'n2'] });
    return screen.getByRole('application', { name: 'Note grid' });
  },
  pedalLane: () => {
    renderWithProviders(<PianoRoll />, [], { selectedPedalIds: ['p1', 'p2'] }, pedals);
    return screen.getByRole('application', { name: 'Pedal lane' });
  },
  dragGesture: () => {
    renderWithProviders(<PianoRoll />);
    fireEvent.mouseDown(screen.getByRole('application', { name: 'Note grid' }), {
      button: 0,
      clientX: 30,
      clientY: 100,
    });
    return window;
  },
  mediaTimeline: () => {
    renderTimeline();
    const slider = screen.getByRole('slider', { name: 'Media position' });
    fireEvent.mouseDown(slider, { button: 0, clientX: 500 });
    fireEvent.mouseMove(window, { clientX: 800 });
    fireEvent.mouseUp(window, { clientX: 800 });
    if (document.querySelector('.media-timeline__selection') === null) {
      throw new Error('no selection');
    }
    return slider;
  },
  cutEdge: () => {
    renderTimeline([{ id: 'c', start: 5, end: 8 }]);
    return screen.getByRole('slider', { name: 'End of cut 1' });
  },
  barOneMarker: () => {
    renderMedia(<AudioTrack overlay={<MediaOffsetMarker />} />, { mediaOffset: 3 });
    return screen.getByRole('slider', { name: 'Bar 1 position in the media' });
  },
  splitter: () => {
    render(<AppLayout header={<span>H</span>} editor={<div />} media={<div />} storage={null} />);
    return screen.getByRole('separator', { name: 'Resize media panel' });
  },
  contextMenu: () => {
    render(
      <ContextMenu
        x={10}
        y={10}
        label="Menu"
        items={[
          { label: 'a', onSelect: vi.fn() },
          { label: 'b', onSelect: vi.fn() },
        ]}
        onClose={vi.fn()}
      />,
    );
    return screen.getAllByRole('menuitem')[0];
  },
  numberField: () => {
    render(<CommitNumberInput value={120} label="Tempo" onCommit={vi.fn()} />);
    return screen.getByLabelText('Tempo');
  },
  infoDialog: () => {
    render(<ShortcutsDialog onClose={vi.fn()} />);
    return screen.getByRole('button', { name: 'Close' });
  },
};

const SETTLES: Partial<Record<ShortcutScope, (chord: KeyChord) => Promise<void>>> = {
  global: async (chord) => {
    if (chord.code === 'Space') await screen.findByRole('button', { name: 'Pause' });
  },
};

describe('key contract: the registry keys and only they are handled', () => {
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;

  beforeEach(() => {
    stubAnimationFrames();
    URL.createObjectURL = vi.fn(() => 'blob:test');
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(console, 'error');
  });

  afterEach(() => {
    cleanup();
    expect(console.error).not.toHaveBeenCalled();
    URL.createObjectURL = originalCreate;
    URL.revokeObjectURL = originalRevoke;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  for (const scope of SHORTCUT_SCOPES) {
    it(scope, () => expectKeyContract(scope, SETUPS[scope], SETTLES[scope]));
  }
});
