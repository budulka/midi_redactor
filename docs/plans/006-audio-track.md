# 006 — Аудіо: завантаження, waveform, швидкість відтворення

**Статус:** схвалено
**Гілка:** feature/006-audio-track

## Мета
Користувач завантажує аудіофайл, бачить його waveform у правій панелі («Audio track»), слухає його, ставить на паузу, перемотує кліком по waveform і змінює швидкість від 0.25× до 2× без зміни висоти тону. Некоректний файл дає зрозуміле повідомлення. Файл обробляється лише в браузері через Object URL, backend не змінюється.

Задача спирається на готове й не дублює його:
- `formatClock` (`src/utils/transportFormat.ts`, 005) для показу позиції;
- `useAnimationFrame` (`src/components/useAnimationFrame.ts`, 005) для оновлення позиції без ререндерів;
- патерн «імперативне ядро + `subscribe`/`getSnapshot` + provider з двома контекстами (стан і стабільний API)» з `Transport`/`TransportProvider` (005);
- тестовий помічник `stubAnimationFrames` (`src/components/testing/animationFrames.ts`).

Пункти розділу 2 CLAUDE.md, які задача **закриває повністю** (після виконання ставимо `[x]`), усі з розділу 2.1:
- «Завантаження аудіофайлу у форматах mp3, wav, ogg, aac (m4a з AAC теж приймається)».
- «Після завантаження з'являється аудіодоріжка з waveform файлу».
- «Відтворення, пауза, перемотування (клік по waveform)».
- «Зміна швидкості відтворення (сповільнення і прискорення, мінімум діапазон 0.25×–2×) без зміни висоти тону».
- «Некоректний формат → зрозуміле повідомлення про помилку».

Пункти, яких задача **не закриває**: 2.4 «Відтворення MIDI синхронізоване з аудіо та відео» і 2.5 «Синхронізація з таймлайном редактора» лишаються `[ ]` до 008.

## Поза межами задачі
- **Синхронізація з MIDI-транспортом (008).** В 006 аудіодоріжка має власні кнопки Play/Pause і власну швидкість. Play у верхній панелі (MIDI) аудіо не запускає, і навпаки; обидва можуть грати одночасно без узгодження. Швидкість MIDI-відтворення (`PLAYBACK_RATE = 1` у `Transport.ts`) не змінюється. 008 зведе обидва годинники до спільного таймлайну. Для цього `AudioTrackController` уже має потрібний API: `play`/`pause`/`seek`/`setRate`/`getCurrentTime`/`subscribe`.
- Зсув (offset) аудіо відносно нуля таймлайну, обрізання, кілька аудіодоріжок, гучність і mute.
- Waveform у масштабі piano roll (спільний `pixelsPerSecond`, розміщення під сіткою) — це рішення 008. Тут waveform показує весь файл у ширину правої панелі.
- Гарячі клавіші (Space, стрілки для перемотування) — 010. Перемотування з клавіатури в 006 немає, лише клік по waveform (`dragToSeek` вимкнено, див. «Технічні рішення»).
- Збереження аудіо між перезавантаженнями сторінки (IndexedDB), завантаження аудіо на backend.
- Відео (007). Відеофайл, вибраний у полі аудіо, відхиляється з повідомленням про непідтримуваний формат.
- Власний time-stretch (SoundTouch/Rubber Band в AudioWorklet): використовуємо вбудований у браузер `preservesPitch` (див. «Ризики»).

## Технічні рішення

### Нова залежність: `wavesurfer.js@^8.0.1`
- Стек (розділ 3) прямо передбачає `wavesurfer.js` для waveform. Бібліотека малює waveform на canvas, сама обробляє клік по ньому (seek) і відтворює файл через `HTMLAudioElement`. Нам лишається тонкий адаптер.
- 8.0.1 — поточна версія з тегом `latest` на npm (перевірено 2026-09-28). Ліцензія BSD-3-Clause, runtime-залежностей немає, типи TypeScript вбудовані (`dist/wavesurfer.d.ts`).
- 8.0 — мажорний реліз, але публічний API (`WaveSurfer.create`, `load`, `play`, `pause`, `setTime`, `setPlaybackRate`, `getCurrentTime`, `getDuration`, `destroy`, події) лишився як у 7.x. Ламаючі зміни стосуються крайових випадків: `destroy()` остаточний (знищений екземпляр не можна перевикористати), `getMediaElement()` повертає `null` у WebAudio-бекенді, payload події `error` типізовано як `Error`, «витіснені» завантаження відхиляються з `AbortError`. Наш адаптер створює **новий** екземпляр на кожен файл, тож остаточний `destroy()` нас не зачіпає.
- Розглянуті альтернативи:
  - власний рендер: `decodeAudioData` + обчислення піків + canvas + обробка кліків. Це повторення того, що вже робить бібліотека зі стеку;
  - `peaks.js`: важчий, орієнтований на великі файли з попередньо обчисленими піками на сервері, і його немає в стеку.
- Якщо з 8.x виявиться несумісність (наприклад, з Vite 5), запасний варіант — `wavesurfer.js@^7.12.12` з тим самим API. Це дрібне відхилення, яке implementer описує у звіті.

### Швидкість без зміни висоти тону: `HTMLMediaElement.preservesPitch`
- WaveSurfer за замовчуванням відтворює через `HTMLAudioElement` (бекенд `MediaElement`). Його `setPlaybackRate(rate, preservePitch?)` у коді `Player` робить `if (preservePitch != null) this.media.preservesPitch = preservePitch; this.media.playbackRate = rate`.
- `preservesPitch` за замовчуванням `true` і підтримується в Chrome, Firefox і Safari (Baseline з грудня 2023). Браузер сам робить time-stretch.
- Ми **явно** задаємо обидва параметри: бекенд `'MediaElement'` в опціях `WaveSurfer.create` (у WebAudio-бекенді `preservesPitch` не працює) і `setPlaybackRate(rate, true)` при кожній зміні.
- **Діапазон.** Gecko глушить звук при `playbackRate` поза `[0.25, 4.0]` (MDN). Наш діапазон `[0.25, 2]` у ці межі вкладається, 0.25 включно.
- **Скидання швидкості при завантаженні.** Алгоритм завантаження медіа (новий `src`) скидає `playbackRate` до `defaultPlaybackRate`. Тому контролер застосовує поточну швидкість до плеєра на події `ready`, а не одразу після створення.

### Розпізнавання формату (чисті функції) — `src/utils/audioFormats.ts`
```ts
export type AudioFormatId = 'mp3' | 'wav' | 'ogg' | 'aac' | 'm4a';
export interface AudioFormat {
  readonly id: AudioFormatId;
  readonly label: string;                 // for messages: 'MP3', 'WAV', 'OGG', 'AAC', 'M4A (AAC)'
  readonly extensions: readonly string[]; // lowercase, without the dot
  readonly mimeTypes: readonly string[];
  readonly probeType: string;             // argument for HTMLMediaElement.canPlayType
}
export const AUDIO_FORMATS: readonly AudioFormat[];
export const AUDIO_FILE_ACCEPT: string;   // value of <input accept>
export function fileExtension(name: string): string;
export function detectAudioFormat(file: { readonly name: string; readonly type: string }): AudioFormat | null;
export function unsupportedFileMessage(name: string): string;
export function unplayableFormatMessage(format: AudioFormat): string;
export function decodeFailedMessage(name: string): string;
```
Таблиця форматів:

| id | extensions | mimeTypes | probeType |
|---|---|---|---|
| mp3 | `mp3` | `audio/mpeg`, `audio/mp3`, `audio/mpeg3`, `audio/x-mpeg-3` | `audio/mpeg` |
| wav | `wav`, `wave` | `audio/wav`, `audio/x-wav`, `audio/wave`, `audio/vnd.wave` | `audio/wav` |
| ogg | `ogg`, `oga` | `audio/ogg`, `application/ogg` | `audio/ogg` |
| aac | `aac` | `audio/aac`, `audio/x-aac`, `audio/aacp` | `audio/aac` |
| m4a | `m4a` | `audio/mp4`, `audio/x-m4a`, `audio/m4a` | `audio/mp4; codecs="mp4a.40.2"` |

- `fileExtension(name)` — частина після останньої крапки в нижньому регістрі; без крапки або з крапкою в кінці → `''`.
- `detectAudioFormat`:
  1. Якщо розширення є в таблиці, повертається цей формат **незалежно від `type`**. ОС по-різному називають MIME тих самих файлів (наприклад, `.ogg` у Linux часто `video/ogg`, `.m4a` буває `video/mp4`), тож розширення надійніше. Файл з правильним розширенням, але зіпсованим вмістом, відсіється на декодуванні (див. нижче).
  2. Якщо розширення невідоме (або його немає), шукаємо `type` у `mimeTypes` (файли без розширення).
  3. Інакше `null`.
- `AUDIO_FILE_ACCEPT` — усі розширення з крапкою, потім усі MIME через кому: `.mp3,.wav,.wave,.ogg,.oga,.aac,.m4a,audio/mpeg,…`. `audio/*` не додаємо: діалог і так показує потрібні файли, а решту (flac тощо) користувач усе одно може вибрати через «All files» або перетягнути, і отримає повідомлення.
- Повідомлення (інтерфейс застосунку англійською, як і решта UI):
  - `unsupportedFileMessage('a.flac')` → `Unsupported file "a.flac". Choose an MP3, WAV, OGG, AAC or M4A audio file.`
  - `unplayableFormatMessage(aac)` → `This browser cannot play AAC audio. Try MP3 or WAV.`
  - `decodeFailedMessage('x.mp3')` → `Could not read "x.mp3": the file is damaged or is not a supported audio file.`

**Три рівні перевірки «некоректного формату»:**
1. Розширення/MIME не з таблиці → `unsupportedFileMessage`, плеєр не створюється.
2. Формат відомий, але браузер його не відтворює (`canPlayType(probeType) === ''`, наприклад AAC у Chromium без пропрієтарних кодеків чи у Firefox на Linux без ffmpeg) → `unplayableFormatMessage`, плеєр не створюється.
3. Файл не декодується (зіпсований, текст з розширенням `.mp3`) → подія `error` від WaveSurfer → `decodeFailedMessage`, доріжка прибирається.

### Швидкість (чисті функції) — `src/utils/playbackRate.ts`
Окремий модуль, бо 007 (відео) використає ті самі значення і той самий компонент вибору.
```ts
export const MIN_PLAYBACK_RATE = 0.25;
export const MAX_PLAYBACK_RATE = 2;
export const DEFAULT_PLAYBACK_RATE = 1;
export const PLAYBACK_RATES: readonly number[] = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
export function clampPlaybackRate(rate: number): number; // NaN → 1, інакше min(max(rate, 0.25), 2)
export function formatPlaybackRate(rate: number): string; // `${rate}×`: 0.25 → '0.25×', 1 → '1×'
```
Фіксований набір значень у `<select>` замість повзунка: його легко вибрати точно, легко протестувати, і він покриває вимогу 0.25×–2×.

### Абстракція плеєра (тестування без canvas і медіа) — `src/audio/waveformPlayer.ts`
У jsdom немає canvas, декодування аудіо і відтворення медіа. Тому весь код поза адаптером працює через інтерфейс, а тести використовують фейк (так само, як `PianoEngine` у 005).
```ts
export interface WaveformPlayerEvents {
  onReady(duration: number): void;  // decoded and can play
  onPlay(): void;
  onPause(): void;
  onFinish(): void;
  onSeek(time: number): void;       // the user clicked the waveform (seek is already applied)
  onError(error: Error): void;      // fetch/decode failed or the media element reported an error
}
export interface WaveformPlayer {
  play(): Promise<void>;
  pause(): void;
  setTime(seconds: number): void;
  getCurrentTime(): number;
  /** Always preserves pitch. */
  setPlaybackRate(rate: number): void;
  destroy(): void;
}
export interface CreateWaveformPlayerOptions {
  readonly container: HTMLElement;
  readonly url: string;
  readonly events: WaveformPlayerEvents;
}
export type CreateWaveformPlayer = (options: CreateWaveformPlayerOptions) => WaveformPlayer;
```

### Адаптер WaveSurfer — `src/audio/waveSurferPlayer.ts`
Єдиний файл з імпортом `wavesurfer.js` (статичний `import WaveSurfer from 'wavesurfer.js'`). Лінивий `import()` як у Tone.js не потрібен: WaveSurfer не створює `AudioContext` при імпорті, лише під час декодування файлу. Бібліотека невелика порівняно з Tone.js.

`createWaveSurferPlayer: CreateWaveformPlayer`:
1. `const ws = WaveSurfer.create({ container, backend: 'MediaElement', height: WAVEFORM_HEIGHT_PX (96), waveColor: '#8a90a0', progressColor: '#5b9cf0', cursorColor: '#ff5a5a', cursorWidth: 2, normalize: true, interact: true, dragToSeek: false })`. Кольори — ті самі, що `--muted`, `--note`, `--playhead` в `App.css`. Canvas не читає CSS-змінні, тому значення записані константами в модулі. `url` в опції **не** передаємо, щоб самим обробити відхилення `load`.
2. Підписки: `ready` → `onReady(duration)`, `play` → `onPlay`, `pause` → `onPause`, `finish` → `onFinish`, `interaction` → `onSeek(newTime)`, `error` → `onError(error)`.
3. `ws.load(url).catch((error) => { if (!isAbortError(error)) events.onError(toError(error)); })`. У 8.x помилка завантаження і відхиляє Promise, і генерує подію `error`. Тож `onError` може прийти двічі, і контролер це ігнорує (див. нижче). `.catch` потрібен, щоб не було unhandled rejection.
4. Методи: `play` → `ws.play()`; `pause` → `ws.pause()`; `setTime` → `ws.setTime(s)`; `getCurrentTime` → `ws.getCurrentTime()`; `setPlaybackRate(r)` → `ws.setPlaybackRate(r, true)`; `destroy` → `ws.destroy()`.

`dragToSeek: false`: з перетягуванням WaveSurfer під час руху миші постійно змінює `currentTime`, і при 008 це давало б серію seek-подій. Для вимоги «клік по waveform» досить кліку.

`src/audio/testing/FakeWaveformPlayer.ts` — тестовий двійник (імпортують лише тести):
- `createFakeWaveformPlayers()` → `{ create: CreateWaveformPlayer; players: FakeWaveformPlayer[] }`; `create` зберігає `options` у плеєрі;
- у плеєра: поля `options`, `currentTime`, `rate` (`null`, поки `setPlaybackRate` не викликали), `destroyed`, `calls: string[]` (`'play'`, `'pause'`, `'setTime:4'`, `'setPlaybackRate:0.5'`, `'destroy'`);
- `play()` за замовчуванням викликає `events.onPlay()` і резолвиться; поле `playError: Error | null` змушує `play()` відхилитися;
- `pause()` викликає `events.onPause()`;
- помічники `emitReady(d)`, `emitError(e?)`, `emitSeek(t)` (ставить `currentTime = t` і викликає `onSeek`), `emitFinish()`.

### Контролер доріжки (імперативне ядро без React) — `src/audio/AudioTrackController.ts`
```ts
export type AudioTrackStatus = 'empty' | 'loading' | 'ready';
export interface AudioTrackSnapshot {
  readonly status: AudioTrackStatus;
  readonly fileName: string | null;  // file being loaded or loaded
  readonly duration: number;         // 0 until ready
  readonly playing: boolean;
  readonly position: number;         // cue position: updated on ready/pause/seek/finish, not while playing
  readonly rate: number;
  readonly error: string | null;     // last error message
}
export interface AudioTrackControllerOptions {
  readonly createPlayer: CreateWaveformPlayer;
  readonly canPlayType: (mime: string) => boolean;
  readonly createObjectUrl?: (file: Blob) => string;   // default URL.createObjectURL
  readonly revokeObjectUrl?: (url: string) => void;    // default URL.revokeObjectURL
}
export class AudioTrackController {
  constructor(options: AudioTrackControllerOptions);
  load(file: File, container: HTMLElement): void;
  clear(): void;
  togglePlay(): void;
  play(): void;
  pause(): void;
  seek(seconds: number): void;
  setRate(rate: number): void;
  getCurrentTime(): number;
  getSnapshot(): AudioTrackSnapshot; // stable object between changes (arrow property, as in Transport)
  subscribe(listener: () => void): () => void;
}
export function defaultCanPlayType(mime: string): boolean; // document.createElement('audio').canPlayType(mime) !== ''
```
Поведінка:
- **Початковий snapshot:** `{ status: 'empty', fileName: null, duration: 0, playing: false, position: 0, rate: 1, error: null }`.
- **`load(file, container)`:**
  1. `format = detectAudioFormat(file)`. Якщо `null`: `error = unsupportedFileMessage(file.name)`, сповістити, **поточну доріжку не чіпати** (невдалий вибір не знищує вже завантажений файл).
  2. Якщо `!canPlayType(format.probeType)`: `error = unplayableFormatMessage(format)`, решта як у п. 1.
  3. Інакше знищити попередній плеєр (`destroy`) і відкликати попередній URL (`releaseTrack`), збільшити лічильник поколінь `generation`, `url = createObjectUrl(file)`, `player = createPlayer({ container, url, events })`. Snapshot: `{ status: 'loading', fileName: file.name, duration: 0, playing: false, position: 0, rate (без змін), error: null }`.
- **Події плеєра** прив'язані до покоління, в якому його створено. Подія від плеєра попереднього покоління (пізній `ready` старого файлу, повторний `onError`) ігнорується.
  - `onReady(d)`: `player.setPlaybackRate(rate)` (див. про скидання швидкості), `status 'ready'`, `duration d`, `position 0`.
  - `onPlay`: `playing true`. `onPause`: `playing false`, `position = player.getCurrentTime()`.
  - `onFinish`: `playing false`, `position = duration`.
  - `onSeek(t)`: `position t`. Статус відтворення не змінюється: під час відтворення WaveSurfer грає далі з нової позиції.
  - `onError`: `releaseTrack()` (`destroy` + `revokeObjectUrl`, збільшення `generation`), snapshot `{ status: 'empty', fileName: null, duration: 0, playing: false, position: 0, rate, error: decodeFailedMessage(name) }`. Це стосується і помилки під час завантаження, і помилки медіа під час відтворення.
- **`togglePlay()`**: лише у `ready`; `playing ? pause() : play()`.
- **`play()`**: лише у `ready`. `player.play()`; стан `playing` ставить подія `onPlay`. Відхилення Promise: `AbortError` (play перервали pause-ом) ігнорується; інша помилка (`NotAllowedError` тощо) → `error = 'Could not start audio playback.'`, `playing false`. Це перевіряється лише для поточного покоління.
- **`pause()`**: лише коли `playing`; `player.pause()`.
- **`seek(t)`**: лише у `ready`. `t` обмежується до `[0, duration]`, `player.setTime(t)`, `position t`, сповіщення.
- **`setRate(r)`**: `r = clampPlaybackRate(r)`. Якщо значення не змінилось, нічого не робить. Інакше `rate r` у snapshot, а в `ready` ще й `player.setPlaybackRate(r)`. У `loading` швидкість застосується на `onReady`. Швидкість зберігається між файлами й після `clear()`.
- **`getCurrentTime()`**: у `ready` → `player.getCurrentTime()`, інакше `snapshot.position`.
- **`clear()`**: `releaseTrack()`, snapshot як початковий, але `rate` зберігається. Якщо вже `empty` без помилки, нічого не робить (без сповіщення).
- **Слухачі** сповіщаються на кожну зміну snapshot, але не на кожен кадр. Позицію під час відтворення компонент читає через `getCurrentTime()` у `requestAnimationFrame`.
- **Object URL.** URL створюється на кожен файл і відкликається, коли плеєр знищується (новий файл, помилка, `clear`). Після `destroy` WaveSurfer URL уже не потрібен. Типові значення `createObjectUrl`/`revokeObjectUrl` — стрілкові обгортки `(file) => URL.createObjectURL(file)` і `(url) => URL.revokeObjectURL(url)`, що звертаються до `URL` у момент виклику. Так тести можуть застабувати ці методи (у jsdom `URL.createObjectURL` відсутній), а сам модуль імпортується без помилок.

Навіщо окремий клас, а не стан у компоненті: 008 під'єднає аудіо до `Transport`, і йому потрібен той самий об'єкт з `play`/`pause`/`seek`/`setRate`/`getCurrentTime`/`subscribe` поза деревом `AudioTrack`. Контролер не залежить від React і тестується без DOM-рендеру.

### Стан у React — `src/state/AudioTrackProvider.tsx` + `src/state/audioTrackContext.ts`
- Патерн як у `TransportProvider`. У `App.tsx` provider кладеться всередину `TransportProvider`: `ProjectProvider > EditorProvider > TransportProvider > AudioTrackProvider`.
- Props: `{ children; createPlayer?: CreateWaveformPlayer; canPlayType?: (mime: string) => boolean }`, за замовчуванням `createWaveSurferPlayer` і `defaultCanPlayType`.
- `const [controller] = useState(() => new AudioTrackController({ createPlayer, canPlayType }))`; `snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot)`.
- Cleanup ефекту при unmount: `controller.clear()`. Контролер лишається придатним (новий WaveSurfer створюється на кожен файл), тож це сумісно з подвійним монтуванням StrictMode.
- Контексти:
  - `AudioTrackStateContext`: `AudioTrackSnapshot`;
  - `AudioTrackApiContext`: стабільний об'єкт (`useMemo` з `[controller]`) `{ loadFile(file, container), clear(), togglePlay(), seek(t), setRate(r), getCurrentTime() }`.
  - Хуки `useAudioTrackState()` і `useAudioTrackApi()` кидають помилку поза provider'ом.

### Компоненти
- **`src/components/PlaybackRateSelect.tsx`** (перевикористає 007): props `{ label: string; value: number; onChange(rate: number): void; disabled?: boolean }`. `<label className="rate-select">Speed <select aria-label={label} value={String(value)}>`, опції з `PLAYBACK_RATES` (текст `formatPlaybackRate`, `value` = `String(rate)`). `onChange` передає `Number(event.target.value)`.
- **`src/components/AudioTrack.tsx`** — вміст секції `section.app__audio[aria-label="Audio track"]` у `App.tsx` (замість `<p className="placeholder">Audio track</p>`; сама секція лишається в `App.tsx`). Структура:
  - `div.audio-track` з обробниками drag-and-drop: `onDragOver` робить `preventDefault()` (без нього `drop` не спрацює) і ставить `dropEffect = 'copy'`; `onDrop` робить `preventDefault()` і передає `dataTransfer.files[0]` (якщо є) у `api.loadFile(file, waveformRef.current)`;
  - панель `div.audio-track__toolbar`:
    - `<label className="audio-track__load">Load audio…<input type="file" className="visually-hidden" aria-label="Audio file" accept={AUDIO_FILE_ACCEPT} /></label>`. На `change`: перший файл → `api.loadFile(file, container)`, потім `event.target.value = ''`, щоб повторний вибір того самого файлу знову спрацював;
    - назва файлу `span.audio-track__name` (якщо `fileName`);
    - кнопка «Remove» (`aria-label="Remove audio"`), `disabled` у стані `empty` → `api.clear()`;
  - `div.audio-track__waveform` (`ref={waveformRef}`, `data-testid="waveform"`) рендериться **завжди**, щоб у WaveSurfer був контейнер з реальною шириною в момент `load`. Висота 96 px задана в CSS;
  - у стані `empty` поверх контейнера підказка `p.placeholder`: `Drop an audio file here or use "Load audio…" (MP3, WAV, OGG, AAC, M4A)`; у `loading` — `p.audio-track__status` з текстом `Loading <fileName>…`;
  - група `div.audio-track__controls` (`role="group" aria-label="Audio playback"`):
    - кнопка Play/Pause: видимий текст «Play»/«Pause», `aria-label` «Play audio»/«Pause audio» (щоб не плутати з Play MIDI-транспорту), `disabled`, коли статус не `ready`;
    - `<output aria-label="Audio position">` у форматі `${formatClock(t)} / ${formatClock(duration)}`. Коли не грає, `t = position`, текст ставиться в `useLayoutEffect`. Коли грає, `useAnimationFrame(playing, …)` пише `api.getCurrentTime()` у `ref.textContent` без ререндеру (як у `TransportControls`);
    - `<PlaybackRateSelect label="Audio speed" value={rate} onChange={api.setRate} />`. Вибір доступний і до завантаження файлу (швидкість зберігається);
  - якщо `error !== null`: `<p role="alert" className="audio-track__error">{error}</p>`.
- **CSS** (`App.css`):
  - `.app__audio` отримує власну розкладку: `flex-direction: column; align-items: stretch; justify-content: flex-start; padding: 8px; gap: 8px; min-height: 0`. Правило `.app__media > section` для відео не змінюється;
  - `.audio-track`, `.audio-track__toolbar` і `.audio-track__controls` (flex, `gap: 8px`), `.audio-track__waveform` (`position: relative; height: 96px; background: var(--bg)`), `.audio-track__name` (обрізання `text-overflow: ellipsis`), `.audio-track__error` (`color: var(--err)`), `.audio-track__load` (вигляд кнопки, `cursor: pointer`);
  - `.visually-hidden` — стандартний клас прихованого, але доступного елемента (`position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap`).

## Кроки реалізації
1. Від актуального `main` створити гілку `feature/006-audio-track`.
2. `cd frontend && npm install wavesurfer.js@^8.0.1` (у `dependencies`). Коміт `chore: add wavesurfer.js for the audio track`.
3. `src/utils/audioFormats.ts` і `src/utils/playbackRate.ts` + тести. Коміт `feat: detect audio formats and clamp playback rates`.
4. `src/audio/waveformPlayer.ts`, `src/audio/testing/FakeWaveformPlayer.ts`, `src/audio/AudioTrackController.ts` + `AudioTrackController.test.ts`. Коміт `feat: add audio track controller`.
5. `src/audio/waveSurferPlayer.ts` + `waveSurferPlayer.test.ts` (з `vi.mock('wavesurfer.js')`). Коміт `feat: add WaveSurfer waveform player`.
6. `src/state/audioTrackContext.ts`, `src/state/AudioTrackProvider.tsx` + тести. Коміт `feat: add audio track provider`.
7. `src/components/PlaybackRateSelect.tsx`, `src/components/AudioTrack.tsx` + тести; CSS у `App.css`; у `App.tsx` додати `AudioTrackProvider` і `<AudioTrack />` у секцію «Audio track»; доповнити `App.test.tsx`. Коміт `feat: show the audio track with waveform and speed control`.
8. README: розділ «Аудіодоріжка» після «Відтворення»: формати, drag-and-drop, клік по waveform, швидкість без зміни висоти тону, повідомлення про помилки, файл лишається в браузері (не завантажується на сервер), аудіо поки не синхронізоване з MIDI (008). Коміт `docs: describe the audio track`.
9. Усі перевірки з DoD і ручна перевірка в браузері (у гілці).
10. У гілці (**до** злиття): у CLAUDE.md `[x]` для п'яти пунктів 2.1; статус 006 у розділі 8 — «виконано»; статус плану — `виконано`. Коміт `docs: mark task 006 as done`.
11. Злиття `git checkout main && git merge --no-ff feature/006-audio-track`, повторні перевірки на `main`, push `main` і гілки.

## Тести
Backend не змінюється, наявні тести мають і далі проходити.

Позначення: `file(name, type)` = `new File(['x'], name, { type })`. У тестах контролера `createObjectUrl` повертає по черзі `blob:1`, `blob:2`, …, `revokeObjectUrl` — `vi.fn()`, `canPlayType` — `vi.fn(() => true)`, якщо не сказано інше. `container = document.createElement('div')`.

### `src/utils/audioFormats.test.ts`
- `fileExtension`: `'Song.MP3'` → `'mp3'`; `'archive.tar.gz'` → `'gz'`; `'README'` → `''`; `'trailing.'` → `''`.
- `detectAudioFormat(...)?.id`:
  - `('a.mp3', 'audio/mpeg')` → `mp3`; `('a.WAV', '')` → `wav`; `('a.wave', '')` → `wav`;
  - `('a.oga', 'audio/ogg')` → `ogg`; `('a.ogg', 'video/ogg')` → `ogg` (розширення важливіше за MIME);
  - `('a.aac', 'audio/aac')` → `aac`; `('a.m4a', 'audio/x-m4a')` → `m4a`; `('a.m4a', 'video/mp4')` → `m4a`;
  - без розширення: `('track', 'audio/mpeg')` → `mp3`; `('track', 'audio/x-m4a')` → `m4a`; `('track', '')` → `null`;
  - непідтримувані: `('a.flac', 'audio/flac')`, `('clip.mp4', 'video/mp4')`, `('notes.txt', 'text/plain')`, `('a.mp3.txt', 'text/plain')` → `null`.
- `AUDIO_FORMATS`: п'ять форматів з id `mp3, wav, ogg, aac, m4a`; `m4a.probeType` містить `mp4a.40.2`.
- `AUDIO_FILE_ACCEPT` містить `.mp3`, `.wav`, `.ogg`, `.aac`, `.m4a`, `audio/mpeg` і не містить `video/` та `audio/*`.
- Повідомлення: три точні рядки з розділу «Розпізнавання формату»; `unplayableFormatMessage(m4a)` → `This browser cannot play M4A (AAC) audio. Try MP3 or WAV.`

### `src/utils/playbackRate.test.ts`
- `PLAYBACK_RATES`: перше 0.25, останнє 2, містить 1, зростає строго.
- `clampPlaybackRate`: `0.1` → 0.25; `3` → 2; `0.5` → 0.5; `NaN` → 1; `Infinity` → 2; `-Infinity` → 0.25.
- `formatPlaybackRate`: `0.25` → `0.25×`; `1` → `1×`; `1.5` → `1.5×`.

### `src/audio/AudioTrackController.test.ts` (з `createFakeWaveformPlayers`)
- Початковий snapshot точно дорівнює `{ status: 'empty', fileName: null, duration: 0, playing: false, position: 0, rate: 1, error: null }`.
- `load(file('song.mp3', 'audio/mpeg'), container)` → `createObjectUrl` викликано з файлом; створено один плеєр з `options.container === container` і `url 'blob:1'`; snapshot `loading`, `fileName 'song.mp3'`, `error null`; `rate` плеєра ще `null`.
- `emitReady(65)` → `ready`, `duration 65`, `position 0`; плеєр отримав `setPlaybackRate:1`.
- `canPlayType` викликано з `probeType` формату (`'audio/mpeg'`).
- Непідтримуваний файл `file('notes.txt', 'text/plain')` у стані `empty` → плеєр не створено, `createObjectUrl` не викликано, `error` = `unsupportedFileMessage('notes.txt')`, статус `empty`.
- Непідтримуваний файл, коли доріжка `ready` → попередній плеєр не знищено (`destroyed false`), статус `ready`, `fileName` старий, `error` встановлено. Наступний коректний `load` → `error null`.
- `canPlayType → false` для `file('a.aac', 'audio/aac')` → плеєр не створено, `error` = `This browser cannot play AAC audio. Try MP3 or WAV.`
- Помилка декодування: `load`, `emitError(new Error('decode'))` → плеєр `destroyed`, `revokeObjectUrl('blob:1')`, snapshot `empty`, `fileName null`, `error` = `decodeFailedMessage('song.mp3')`. Другий `emitError` того самого плеєра → стан не змінюється, `revokeObjectUrl` викликано рівно один раз, слухач не отримав другого сповіщення.
- Заміна файлу: `load` A, `emitReady(10)`, `load` B → плеєр A `destroyed`, `revokeObjectUrl('blob:1')`, плеєр B з `url 'blob:2'`, статус `loading`, `fileName` B. Пізній `emitReady(99)` від A → нічого не змінює (статус `loading`, `duration 0`).
- `togglePlay` у `empty` і `loading` → жодного `play` у плеєрі.
- У `ready`: `togglePlay` → `play` викликано, `playing true`; `togglePlay` → `pause`, `playing false`, `position` = `currentTime` плеєра (задати `currentTime = 12.5` перед паузою → 12.5).
- `play()` з `playError = new DOMException('blocked', 'NotAllowedError')` → після `await` мікротасків `error 'Could not start audio playback.'`, `playing false`. З `AbortError` → `error null`.
- `seek(10)` у `ready` (duration 65) → `setTime:10`, `position 10`; `seek(-1)` → `setTime:0`; `seek(100)` → `setTime:65`. `seek(5)` у `empty` → без викликів і сповіщень.
- `emitSeek(7)` (клік по waveform) → `position 7`; під час відтворення `playing` лишається `true`.
- `emitFinish()` під час відтворення → `playing false`, `position 65`.
- `setRate(0.5)` у `ready` → `rate 0.5`, `setPlaybackRate:0.5`; `setRate(3)` → `rate 2`; `setRate(0.1)` → `rate 0.25`; повторний `setRate(0.25)` → без сповіщення і без виклику плеєра.
- `setRate(0.5)` у `loading` → плеєр не викликано; `emitReady(10)` → `setPlaybackRate:0.5`. Наступний файл після `ready` також отримує 0.5 на своєму `ready`.
- `getCurrentTime()`: `ready` і `currentTime 3.2` → 3.2; `empty` → 0.
- `clear()` у `ready` з `rate 0.75` → плеєр `destroyed`, `revokeObjectUrl`, snapshot = початковий, але `rate 0.75`. `clear()` у `empty` без помилки → без сповіщення. `clear()` з помилкою → `error null`.
- `subscribe`: слухача викликано на `load`, `ready`, `play`, `pause`, `seek`, `setRate`, `clear`; після unsubscribe виклики припиняються. Між змінами `getSnapshot()` повертає той самий об'єкт.

### `src/audio/waveSurferPlayer.test.ts` (`vi.mock('wavesurfer.js', …)` з фейковим `create`, що повертає об'єкт з `vi.fn()`-методами і `on`, який зберігає обробники)
- `createWaveSurferPlayer({ container, url: 'blob:x', events })` → `WaveSurfer.create` викликано один раз з об'єктом, що містить `container`, `backend: 'MediaElement'`, `interact: true`, `dragToSeek: false`, `normalize: true`, `height: 96`, і **не** містить `url`; `ws.load` викликано з `'blob:x'`.
- Події: `ready(12)` → `onReady(12)`; `play` → `onPlay`; `pause` → `onPause`; `finish` → `onFinish`; `interaction(3.5)` → `onSeek(3.5)`; `error(err)` → `onError(err)`.
- `ws.load` відхилено з `Error('decode')` → `onError` з цією помилкою; відхилено з `DOMException('aborted', 'AbortError')` → `onError` не викликано. Unhandled rejection немає (тест не падає).
- `setPlaybackRate(0.5)` → `ws.setPlaybackRate(0.5, true)`; `setTime(4)` → `ws.setTime(4)`; `getCurrentTime()` повертає значення `ws.getCurrentTime()`; `play()` повертає Promise з `ws.play()`; `pause` і `destroy` делегуються.

### `src/state/AudioTrackProvider.test.tsx`
Помічник рендерить `AudioTrackProvider` з фейковою фабрикою і `canPlayType = () => true` та тестовий компонент з кнопками, що викликають API, і `<pre>` зі snapshot.
- Початково `status 'empty'`; фабрика не викликалася.
- `loadFile` → `loading`; `emitReady(20)` → у `<pre>` `ready`, `duration 20` (ререндер через `useSyncExternalStore`).
- API-об'єкт стабільний між ререндерами (однакове посилання до і після зміни стану).
- Unmount у стані `ready` → плеєр `destroyed`, `revokeObjectUrl` викликано (через `vi.spyOn(URL, 'revokeObjectURL')`, а `URL.createObjectURL` застабовано, бо в jsdom його немає).
- `useAudioTrackApi()` і `useAudioTrackState()` поза provider'ом кидають помилку.

### `src/components/PlaybackRateSelect.test.tsx`
- Рендер з `label "Audio speed"`, `value 1` → комбобокс з цією назвою, 8 опцій, перша з текстом `0.25×`, вибрано `1×`.
- Вибір `0.5` → `onChange(0.5)` (число, не рядок).
- `disabled` → `select` вимкнено.

### `src/components/AudioTrack.test.tsx`
Рендер `AudioTrackProvider(createPlayer = fake, canPlayType = () => true) > AudioTrack`; `URL.createObjectURL`/`revokeObjectURL` застабовано; `stubAnimationFrames()` для тестів з відтворенням.
- Порожній стан: поле з назвою «Audio file» з атрибутом `accept` = `AUDIO_FILE_ACCEPT`; підказка з `MP3, WAV, OGG, AAC, M4A`; кнопка «Play audio» вимкнена; «Remove audio» вимкнена; «Audio speed» = `1`; `Audio position` = `0:00.000 / 0:00.000`.
- `fireEvent.change(input, { target: { files: [file('song.mp3', 'audio/mpeg')] } })` → текст `Loading song.mp3…`; плеєр отримав контейнер `getByTestId('waveform')`; `input.value === ''`.
- `emitReady(65)` (в `act`) → назва `song.mp3`, `Audio position` = `0:00.000 / 1:05.000`, «Play audio» активна.
- Клік «Play audio» → у плеєрі `play`, кнопка стає «Pause audio». `currentTime = 2.5`, `flushFrame()` → `0:02.500 / 1:05.000`. Клік «Pause audio» → «Play audio», `cancelAnimationFrame` викликано.
- `emitSeek(30)` у паузі → `0:30.000 / 1:05.000`.
- Вибір швидкості `0.5` → у плеєрі `setPlaybackRate:0.5`.
- Непідтримуваний файл `a.flac` → `role="alert"` з `Unsupported file "a.flac". Choose an MP3, WAV, OGG, AAC or M4A audio file.`
- `emitError()` після завантаження → `role="alert"` з `Could not read "song.mp3": …`, знову підказка порожнього стану.
- `fireEvent.drop` на `.audio-track` з `dataTransfer: { files: [file('drop.wav', 'audio/wav')] }` → створено плеєр, `Loading drop.wav…`. `fireEvent.dragOver` → подію скасовано (`fireEvent` повертає `false`).
- «Remove audio» у стані `ready` → плеєр `destroyed`, знову порожній стан.

### `src/App.test.tsx` (доповнення; наявні перевірки лишаються)
- `vi.mock('./audio/waveSurferPlayer.ts', () => ({ createWaveSurferPlayer: vi.fn() }))`. У регіоні «Audio track» є поле «Audio file», група «Audio playback» з вимкненою кнопкою «Play audio» і комбобокс «Audio speed»; `createWaveSurferPlayer` при рендері не викликано.
- Група «Playback» у банері, як і раніше, має кнопку «Play» (кнопки аудіо не заважають запитам за назвою).

### Ручна перевірка в браузері
`cd frontend && npm run dev`, http://localhost:5173, Chrome і Firefox. Потрібні будь-які локальні файли mp3, wav, ogg, aac, m4a (у репозиторій **не** комітяться), а також `.flac` або `.txt` і текстовий файл, перейменований на `.mp3`.
1. «Load audio…» відкриває діалог, у якому видно аудіофайли. Після вибору mp3 з'являється «Loading …», потім waveform на всю ширину панелі й назва файлу. На вкладці Network немає запитів до `/api` з файлом (лише `blob:`).
2. Те саме для wav, ogg, aac і m4a. Якщо браузер не підтримує AAC (наприклад, Chromium без пропрієтарних кодеків), показується `This browser cannot play AAC audio. Try MP3 or WAV.`, а не порожня доріжка.
3. Play/Pause працюють, прогрес і курсор на waveform рухаються, позиція `хв:сс.мс / тривалість` оновлюється плавно.
4. Клік по waveform перемотує і на паузі, і під час відтворення (відтворення триває з нової позиції).
5. Швидкість 0.25×, 0.5×, 1.5×, 2×: темп змінюється, **висота тону ні** (перевірити на впізнаваній ноті чи голосі). Швидкість зберігається після паузи та після завантаження іншого файлу.
6. `.flac`/`.txt` → повідомлення `Unsupported file …`, уже завантажений файл лишається. Текстовий файл з розширенням `.mp3` → `Could not read …`, доріжка порожня.
7. Перетягування файлу з файлового менеджера на панель завантажує його; браузер не відкриває файл у вкладці.
8. «Remove» прибирає waveform; повторний вибір того самого файлу знову його завантажує.
9. Заміна файлу під час відтворення: старий звук зупиняється, новий файл готовий на позиції 0, з поточною швидкістю.
10. MIDI-транспорт (Play у верхній панелі) і далі працює; аудіо й MIDI поки грають незалежно (очікувано до 008).
11. Консоль без помилок і попереджень React під час усіх кроків (попередження Chrome про `AudioContext`, створений WaveSurfer для декодування після drag-and-drop без жодного кліку по сторінці, допустиме, див. «Ризики»).

## Критерії готовності (Definition of Done)
- [ ] `cd frontend && npm test -- --run && npm run lint && npm run typecheck && npm run build && npx prettier --check .` — зелено.
- [ ] `cd backend && uv run pytest && uv run ruff check . && uv run ruff format --check . && uv run mypy app` — зелено (код backend не змінювався).
- [ ] Усі тести з розділу «Тести» наявні й проходять. Кожна експортована функція `audioFormats.ts`, `playbackRate.ts`, публічні методи `AudioTrackController`, `createWaveSurferPlayer` і компоненти `PlaybackRateSelect`, `AudioTrack` мають щонайменше один тест.
- [ ] Наявні тести 001–005 не видалені й не послаблені: `git diff main -- frontend/src/App.test.tsx` містить лише додані перевірки і `vi.mock` для `waveSurferPlayer`; інші наявні `*.test.ts(x)` не змінені.
- [ ] `git diff main -- frontend/package.json` містить лише `wavesurfer.js` у `dependencies`; `git diff main --stat -- backend/` порожній.
- [ ] `grep -rl "from 'wavesurfer.js'" frontend/src` → лише `frontend/src/audio/waveSurferPlayer.ts` (і `waveSurferPlayer.test.ts` для `vi.mock`).
- [ ] `grep -n "backend: 'MediaElement'" frontend/src/audio/waveSurferPlayer.ts` і `grep -n "setPlaybackRate(rate, true)" frontend/src/audio/waveSurferPlayer.ts` знаходять по рядку (висота тону зберігається явно; параметр методу адаптера називається `rate`).
- [ ] `git status --porcelain` після ручної перевірки не показує медіафайлів (вони ігноруються `.gitignore`).
- [ ] README має розділ «Аудіодоріжка».
- [ ] Ручна перевірка (11 пунктів) пройдена в Chrome і Firefox.
- [ ] У гілці до злиття (коміт `docs: mark task 006 as done`) у CLAUDE.md відмічено `[x]` п'ять пунктів 2.1; пункти про синхронізацію (2.4, 2.5) лишаються `[ ]`; статус 006 — «виконано»; статус плану — `виконано`.
- [ ] Гілку `feature/006-audio-track` злито в `main` (`--no-ff`) і запушено; на `main` перевірки зелені.

## Ризики / відкриті питання
- **Якість time-stretch на 0.25×.** Браузерний алгоритм (`preservesPitch`) на дуже малих швидкостях дає помітні артефакти («металевий» звук, розмиті атаки), особливо в Chrome. Висота тону при цьому зберігається, тож вимога виконана. Якщо власник захоче кращу якість, окрема задача може додати SoundTouch в AudioWorklet; інтерфейс `WaveformPlayer` дозволяє підмінити реалізацію без змін у контролері й UI.
- **Декодування для waveform.** WaveSurfer декодує весь файл через `decodeAudioData` у тимчасовому `AudioContext` (8 кГц) і закриває його. Для дуже довгих файлів (година і більше) це кількасот мегабайт пам'яті на час декодування. Для аранжувань під пісні й кліпи (до ~10 хв) це некритично. Якщо файл перетягнули до будь-якого кліку по сторінці, Chrome може попередити в консолі, що `AudioContext` не дозволено запустити. Декодування працює й у призупиненому контексті, тож попередження нешкідливе.
- **`canPlayType` може дати хибне «ні».** Якщо на ручній перевірці браузер відтворює файл, але `canPlayType(probeType)` повертає `''`, implementer прибирає відповідний `probeType` (або перевірку рівня 2 загалом) і покладається на помилку декодування. Це дрібне відхилення зі звітом.
- **wavesurfer.js 8 — свіжий мажорний реліз.** Можливі регресії, яких не було в 7.x. Запасний варіант — `^7.12.12` з тим самим API (див. «Технічні рішення»).
- **Розміщення доріжки.** Waveform у правій панелі шириною 360 px показує весь файл. Для «аранжування під музику» зручніше мати його під piano roll у тому ж масштабі часу. Це рішення про спільний таймлайн, тож воно лишається за 008 (WaveSurfer має `minPxPerSec` і `setScroll`, контролер від цього не зміниться).
- **Відкрите питання до власника (не блокує, прийнято дефолт):** невдалий вибір файлу (непідтримуваний формат) **не** прибирає вже завантажену доріжку, а лише показує помилку. Файл, що не декодувався, доріжку прибирає, бо старий плеєр на той момент уже знищено.
- **Обсяг.** Два чисті модулі, адаптер, контролер, provider і два компоненти. Це менше за 005 і вкладається в одну гілку.
