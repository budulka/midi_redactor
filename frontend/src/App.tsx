import BackendStatus from './components/BackendStatus.tsx';
import ProjectInfo from './components/ProjectInfo.tsx';
import PianoRoll from './components/PianoRoll/PianoRoll.tsx';
import TempoControls from './components/TempoControls.tsx';
import EditorProvider from './state/EditorProvider.tsx';
import ProjectProvider from './state/ProjectProvider.tsx';

export default function App() {
  return (
    <ProjectProvider>
      <EditorProvider>
        <div className="app">
          <header className="app__transport" aria-label="Transport">
            <h1 className="app__title">MIDI Redactor</h1>
            <TempoControls />
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
      </EditorProvider>
    </ProjectProvider>
  );
}
