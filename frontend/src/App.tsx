import BackendStatus from './components/BackendStatus.tsx';

export default function App() {
  return (
    <div className="app">
      <header className="app__transport" aria-label="Transport">
        <h1 className="app__title">MIDI Redactor</h1>
        <BackendStatus />
      </header>
      <main className="app__editor" aria-label="MIDI editor">
        <p className="placeholder">Piano roll</p>
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
  );
}
