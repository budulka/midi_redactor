import AudioTrack from './components/AudioTrack.tsx';
import BackendStatus from './components/BackendStatus.tsx';
import ProjectInfo from './components/ProjectInfo.tsx';
import PianoRoll from './components/PianoRoll/PianoRoll.tsx';
import TempoControls from './components/TempoControls.tsx';
import TransportControls from './components/TransportControls.tsx';
import VideoPlayer from './components/VideoPlayer.tsx';
import AudioTrackProvider from './state/AudioTrackProvider.tsx';
import EditorProvider from './state/EditorProvider.tsx';
import ProjectProvider from './state/ProjectProvider.tsx';
import TransportProvider from './state/TransportProvider.tsx';
import VideoProvider from './state/VideoProvider.tsx';

export default function App() {
  return (
    <ProjectProvider>
      <EditorProvider>
        <TransportProvider>
          <AudioTrackProvider>
            <VideoProvider>
              <div className="app">
                <header className="app__transport" aria-label="Transport">
                  <h1 className="app__title">MIDI Redactor</h1>
                  <TempoControls />
                  <TransportControls />
                  <ProjectInfo />
                  <BackendStatus />
                </header>
                <main className="app__editor" aria-label="MIDI editor">
                  <PianoRoll />
                </main>
                <aside className="app__media" aria-label="Media">
                  <section className="app__video" aria-label="Video">
                    <VideoPlayer />
                  </section>
                  <section className="app__audio" aria-label="Audio track">
                    <AudioTrack />
                  </section>
                </aside>
              </div>
            </VideoProvider>
          </AudioTrackProvider>
        </TransportProvider>
      </EditorProvider>
    </ProjectProvider>
  );
}
