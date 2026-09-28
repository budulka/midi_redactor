import BackendStatus from './components/BackendStatus.tsx';
import ProjectInfo from './components/ProjectInfo.tsx';
import PianoRoll from './components/PianoRoll/PianoRoll.tsx';
import TempoControls from './components/TempoControls.tsx';
import TransportControls from './components/TransportControls.tsx';
import EditorProvider from './state/EditorProvider.tsx';
import ProjectProvider from './state/ProjectProvider.tsx';
import TransportProvider from './state/TransportProvider.tsx';

export default function App() {
  return (
    <ProjectProvider>
      <EditorProvider>
        <TransportProvider>
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
                <p className="placeholder">Video</p>
              </section>
              <section className="app__audio" aria-label="Audio track">
                <p className="placeholder">Audio track</p>
              </section>
            </aside>
          </div>
        </TransportProvider>
      </EditorProvider>
    </ProjectProvider>
  );
}
