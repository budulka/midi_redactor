# 007 — Відео: завантаження, пауза, прокрутка, швидкість

**Статус:** схвалено
**Гілка:** feature/007-video-player

## Мета
Користувач завантажує відеофайл (MP4 або WebM) у панель «Video» праворуч угорі, бачить кадр, запускає й ставить на паузу, перемотує повзунком або кнопками ±5 с і змінює швидкість від 0.25× до 2× без зміни висоти тону звуку відео. Некоректний файл дає зрозуміле повідомлення. Файл обробляється лише в браузері через Object URL, backend не змінюється.

Пункти розділу 2 CLAUDE.md, які задача **закриває повністю** (після виконання ставимо `[x]`), усі з розділу 2.5:
- «Завантаження відеофайлу (мінімум mp4/webm)».
- «Пауза / відтворення».
- «Прокрутка (перемотування) по часу».
- «Зміна швидкості відтворення».

Пункти, яких задача **не закриває**: 2.5 «Синхронізація з таймлайном редактора» і 2.4 «Відтворення MIDI синхронізоване з аудіо та відео» лишаються `[ ]` до 008. Тут лише закладаємо для них архітектуру (див. «Технічні рішення → Що отримає 008»).

Задача **перевикористовує** напрацювання 006 і 005 і не дублює їх. Логіку, спільну для аудіо й відео, виносимо з коду 006 у спільні модулі (рефакторинг без зміни поведінки аудіодоріжки):
- `src/utils/playbackRate.ts` і `PlaybackRateSelect` — без змін, як і задумано в 006;
- розпізнавання формату з `src/utils/audioFormats.ts` → загальні `src/utils/mediaFormats.ts`;
- `AudioTrackController` → загальний `MediaTrackController` (покоління, Object URL, snapshot/subscribe); `AudioTrackController` стає тонким підкласом;
- інтерфейс `WaveformPlayer` → загальний `MediaPlayer` (старі назви лишаються псевдонімами);
- `FakeWaveformPlayer` → загальний `FakeMediaPlayer` (старий модуль реекспортує);
- логіка `AudioTrackProvider` → хук `useMediaTrackController`; кнопка вибору файлу, drag-and-drop і «жива» позиція з `AudioTrack` → `FileLoadButton`, `useFileDrop`, `useLivePosition`;
- `formatClock`, `useAnimationFrame`, `stubAnimationFrames` — без змін.

## Поза межами задачі
- **Синхронізація з MIDI-транспортом і аудіодоріжкою (008).** Відео має власні кнопки Play/Pause, повзунок і швидкість. Play у верхній панелі (MIDI) і Play аудіодоріжки відео не запускають, і навпаки; усе може грати одночасно без узгодження. Зсув (offset) відео відносно нуля таймлайну — теж 008.
- Гучність і mute звуку відео, вибір звукової доріжки. Звук відео грає як є (його швидкість змінюється разом з відео, висота тону зберігається).
- Покадрове перемотування, мініатюри кадрів на повзунку, повноекранний режим, збільшення панелі відео. Розміщення й розмір відео — рішення 008 разом зі спільним таймлайном.
- Гарячі клавіші (Space, стрілки) — 010. Стрілки працюють лише «нативно», коли фокус на повзунку (так поводиться `<input type="range">`).
- Формати, крім MP4 (`.mp4`, `.m4v`) і WebM (`.webm`): `.mov`, `.mkv`, `.avi`, `.ogv` відхиляються повідомленням про непідтримуваний формат (див. «Ризики / відкриті питання» про `.mov`).
- Збереження відео між перезавантаженнями сторінки, завантаження відео на backend.
- Перенесення наявних файлів 006 з `src/audio/` у `src/media/`: старі модулі лишаються на місці (як тонкі обгортки або реекспорти), щоб не змінювати їхні тести.

## Технічні рішення

### Без нових залежностей: нативний `<video>`
- `HTMLVideoElement` сам декодує MP4/WebM, показує кадр після перемотування і має `playbackRate` + `preservesPitch`. Бібліотеки на кшталт `video.js`/`plyr` дають власний UI й обгортки, які довелося б «приборкувати» заради синхронізації в 008, і їх немає в стеку (розділ 3).
- Нативні `controls` **не** вмикаємо: їхній вигляд різний у браузерах, у Firefox/Chrome вони мають власне меню швидкості (без обмеження 0.25–2×) і власні кнопки Play, які обходили б контролер. Керування — лише наші кнопки, тоді 008 має одну точку контролю.

### Швидкість без зміни висоти тону
- Адаптер при створенні елемента і при кожній зміні швидкості **явно** ставить `video.preservesPitch = true`, потім `video.playbackRate = rate` (властивість типізована в `lib.dom.d.ts` TypeScript 5.6, Baseline з грудня 2023).
- Завантаження нового `src` скидає `playbackRate` до `defaultPlaybackRate`, тому, як і в 006, контролер застосовує поточну швидкість у `onReady`. Ця логіка вже є в контролері й переходить у `MediaTrackController` без змін.
- Діапазон `[0.25, 2]` і набір значень — з `src/utils/playbackRate.ts`, вибір — `PlaybackRateSelect` з `label="Video speed"`.

### Нова тека `src/media/`
Розділ 4 CLAUDE.md відводить `src/audio/` під Tone.js/Web Audio. Загальний код для HTML-медіаелементів (аудіо- й відеофайли) кладемо в нову теку `src/media/`, а не в `src/audio/`, щоб відеоадаптер не лежав в «audio». Файли 006 у `src/audio/` лишаються на місці й імпортують спільне з `src/media/`.

### Розпізнавання формату (чисті функції)

**`src/utils/mediaFormats.ts`** (новий, загальний; логіка переноситься з `audioFormats.ts` без змін):
```ts
export interface MediaFormat {
  readonly id: string;
  readonly label: string;                 // for messages
  readonly extensions: readonly string[]; // lowercase, without the dot
  readonly mimeTypes: readonly string[];
  readonly probeType: string;             // argument for HTMLMediaElement.canPlayType
}
export interface NamedFile { readonly name: string; readonly type: string }
export function fileExtension(name: string): string;
export function detectFormat<F extends MediaFormat>(formats: readonly F[], file: NamedFile): F | null;
export function acceptAttribute(formats: readonly MediaFormat[]): string; // extensions with dots, then MIME types, comma-separated
```
- `detectFormat` — алгоритм з 006: спершу розширення (незалежно від `type`), потім MIME (у нижньому регістрі) для файлів без відомого розширення, інакше `null`.

**`src/utils/audioFormats.ts`** (рефакторинг, публічний API і поведінка не змінюються):
- `export interface AudioFormat extends MediaFormat { readonly id: AudioFormatId }`;
- `export { fileExtension } from './mediaFormats.ts'`;
- `detectAudioFormat(file)` → `detectFormat(AUDIO_FORMATS, file)`;
- `AUDIO_FILE_ACCEPT = acceptAttribute(AUDIO_FORMATS)` (рядок той самий, що й зараз);
- повідомлення без змін.

**`src/utils/videoFormats.ts`** (новий):
```ts
export type VideoFormatId = 'mp4' | 'webm';
export interface VideoFormat extends MediaFormat { readonly id: VideoFormatId }
export const VIDEO_FORMATS: readonly VideoFormat[];
export const VIDEO_FILE_ACCEPT: string;              // acceptAttribute(VIDEO_FORMATS)
export function detectVideoFormat(file: NamedFile): VideoFormat | null;
export function unsupportedVideoMessage(name: string): string;
export function unplayableVideoMessage(format: VideoFormat): string;
export function videoLoadFailedMessage(name: string): string;
export const VIDEO_PLAY_FAILED_MESSAGE = 'Could not start video playback.';
```

| id | label | extensions | mimeTypes | probeType |
|---|---|---|---|---|
| mp4 | `MP4` | `mp4`, `m4v` | `video/mp4`, `video/x-m4v` | `video/mp4` |
| webm | `WebM` | `webm` | `video/webm` | `video/webm` |

- `probeType` — лише контейнер, без кодеків. `canPlayType('video/mp4; codecs="avc1…"')` дає `''` у браузерах без H.264 навіть тоді, коли файл у AV1/VP9 відтворився б, тобто хибне «ні». Файл з непідтримуваним кодеком відсіється на рівні 3 (подія `error` елемента).
- `VIDEO_FILE_ACCEPT` = `.mp4,.m4v,.webm,video/mp4,video/x-m4v,video/webm`.
- Повідомлення (UI англійською):
  - `unsupportedVideoMessage('a.avi')` → `Unsupported file "a.avi". Choose an MP4 or WebM video file.`
  - `unplayableVideoMessage(mp4)` → `This browser cannot play MP4 video. Try WebM.`; для webm → `This browser cannot play WebM video. Try MP4.` (підказка — мітки решти форматів з `VIDEO_FORMATS`, через ` or `).
  - `videoLoadFailedMessage('clip.mp4')` → `Could not play "clip.mp4": the file is damaged or uses a codec this browser does not support.`

**Три рівні перевірки** — як у 006: (1) розширення/MIME не з таблиці → `unsupportedVideoMessage`, плеєр не створюється, уже завантажене відео лишається; (2) `canPlayType(probeType) === ''` → `unplayableVideoMessage`, те саме; (3) подія `error` елемента (зіпсований файл, непідтримуваний кодек) → `videoLoadFailedMessage`, панель порожня. Аудіофайл (`song.mp3`) у полі відео — рівень 1.

### Загальний інтерфейс плеєра — `src/media/mediaPlayer.ts`
Той самий контракт, що `WaveformPlayer` з 006, під загальною назвою:
```ts
export interface MediaPlayerEvents {
  onReady(duration: number): void;
  onPlay(): void;
  onPause(): void;
  onFinish(): void;
  onSeek(time: number): void;   // the player's own UI moved the position (waveform click); the video player never emits it
  onError(error: Error): void;
}
export interface MediaPlayer {
  play(): Promise<void>;
  pause(): void;
  setTime(seconds: number): void;
  getCurrentTime(): number;
  /** Always preserves pitch. */
  setPlaybackRate(rate: number): void;
  destroy(): void;
}
export interface CreateMediaPlayerOptions {
  readonly container: HTMLElement;
  readonly url: string;
  readonly events: MediaPlayerEvents;
}
export type CreateMediaPlayer = (options: CreateMediaPlayerOptions) => MediaPlayer;
```
`src/audio/waveformPlayer.ts` стає реекспортом типів: `export type { MediaPlayerEvents as WaveformPlayerEvents, MediaPlayer as WaveformPlayer, CreateMediaPlayerOptions as CreateWaveformPlayerOptions, CreateMediaPlayer as CreateWaveformPlayer } from '../media/mediaPlayer.ts'`. `waveSurferPlayer.ts` і його тест не змінюються, крім заміни локальної `isAbortError` на імпорт з `src/media/errors.ts` (див. нижче).

`src/media/errors.ts`: `isAbortError(error: unknown): boolean` і `toError(error: unknown): Error` — перенесені без змін з `AudioTrackController.ts`/`waveSurferPlayer.ts` (там були дві однакові копії `isAbortError`).

### Відеоадаптер — `src/media/htmlVideoPlayer.ts`
`createHtmlVideoPlayer: CreateMediaPlayer` — єдиний модуль, що створює `<video>` для відтворення:
1. `const video = document.createElement('video')`; `className = 'video-player__video'`; `preload = 'auto'`; `playsInline = true`; `controls = false`; `preservesPitch = true`.
2. `const listeners = new AbortController()`; підписки з `{ signal: listeners.signal }`:
   - `loadeddata` (є перший кадр, `readyState >= HAVE_CURRENT_DATA`): якщо `Number.isFinite(video.duration)` → `emitReady(video.duration)`; інакше **обхід нескінченної тривалості** (WebM, записані `MediaRecorder`, не мають тривалості в заголовку, і `duration === Infinity`): `probingDuration = true`, `video.currentTime = Number.MAX_SAFE_INTEGER` — браузер дочитує файл і генерує `durationchange`;
   - `durationchange`: якщо `probingDuration` і тривалість скінченна → `probingDuration = false`, `video.currentTime = 0`, `emitReady(video.duration)`;
   - `emitReady` викликає `events.onReady` **не більше одного разу** на плеєр (прапорець `readyEmitted`);
   - `play` → `onPlay`; `pause` → `onPause`; `ended` → `onFinish`;
   - `error` → `onError(new Error(video.error?.message || \`Media error ${video.error?.code ?? 0}\`))`.
3. Після підписок: `container.append(video)`, `video.src = url`.
4. Методи: `play` → `video.play()` (Promise; відхилення обробляє контролер); `pause` → `video.pause()`; `setTime(s)` → `video.currentTime = s`; `getCurrentTime` → `video.currentTime`; `setPlaybackRate(r)` → `video.preservesPitch = true; video.playbackRate = r`.
5. `destroy()`: `listeners.abort()` (жодних подій після знищення), `video.pause()`, `video.removeAttribute('src')`, `video.load()` (рекомендований спосіб звільнити ресурс медіаелемента), `video.remove()`.

Елемент створюється імперативно всередині контейнера, який React рендерить порожнім (так само, як WaveSurfer малює в `audio-track__waveform`). Новий `<video>` на кожен файл узгоджується з поколіннями контролера: події старого елемента фізично відписані.

`src/media/testing/FakeMediaPlayer.ts` — переміщений без змін `FakeWaveformPlayer` під назвами `FakeMediaPlayer` і `createFakeMediaPlayers`. `src/audio/testing/FakeWaveformPlayer.ts` стає реекспортом: `export { FakeMediaPlayer as FakeWaveformPlayer, createFakeMediaPlayers as createFakeWaveformPlayers } from '../../media/testing/FakeMediaPlayer.ts'`.

### Загальний контролер — `src/media/MediaTrackController.ts`
Код `AudioTrackController` з 006 переноситься сюди майже дослівно. Відмінність у тому, що формат і тексти повідомлень передаються параметрами:
```ts
export type MediaTrackStatus = 'empty' | 'loading' | 'ready';
export interface MediaTrackSnapshot {
  readonly status: MediaTrackStatus;
  readonly fileName: string | null;
  readonly duration: number;
  readonly playing: boolean;
  readonly position: number;   // cue position: updated on ready/pause/seek/finish, not while playing
  readonly rate: number;
  readonly error: string | null;
}
export interface MediaTrackMessages<F extends MediaFormat> {
  unsupported(fileName: string): string;
  unplayable(format: F): string;
  loadFailed(fileName: string): string;
  readonly playFailed: string;
}
export interface MediaTrackControllerOptions<F extends MediaFormat> {
  readonly createPlayer: CreateMediaPlayer;
  readonly canPlayType: (mime: string) => boolean;
  readonly detectFormat: (file: NamedFile) => F | null;
  readonly messages: MediaTrackMessages<F>;
  readonly createObjectUrl?: (file: Blob) => string;
  readonly revokeObjectUrl?: (url: string) => void;
}
export const EMPTY_MEDIA_TRACK_SNAPSHOT: MediaTrackSnapshot;
export class MediaTrackController<F extends MediaFormat = MediaFormat> {
  constructor(options: MediaTrackControllerOptions<F>);
  load(file: File, container: HTMLElement): void;
  clear(): void;
  togglePlay(): void;
  play(): void;
  pause(): void;
  seek(seconds: number): void;
  setRate(rate: number): void;
  getCurrentTime(): number;
  getSnapshot: () => MediaTrackSnapshot;
  subscribe: (listener: () => void) => () => void;
}
```
Поведінка — точно та, що описана в плані 006 і реалізована в `AudioTrackController.ts` (покоління, `releaseTrack`, ігнорування подій старого плеєра, `AbortError`, clamp у `seek`, швидкість зберігається між файлами і після `clear()`, `setRate` у `ready` одразу, у `loading` — на `onReady`). Замінюються лише джерела текстів: `unsupportedFileMessage` → `messages.unsupported`, `unplayableFormatMessage` → `messages.unplayable`, `decodeFailedMessage` → `messages.loadFailed`, `PLAY_FAILED_MESSAGE` → `messages.playFailed`, `detectAudioFormat` → `detectFormat`.

**`src/audio/AudioTrackController.ts`** після рефакторингу (публічний API без змін, щоб `AudioTrackController.test.ts` лишився незмінним):
- `export type AudioTrackStatus = MediaTrackStatus; export type AudioTrackSnapshot = MediaTrackSnapshot;`
- `AudioTrackControllerOptions` — як зараз (`createPlayer`, `canPlayType`, `createObjectUrl?`, `revokeObjectUrl?`);
- `PLAY_FAILED_MESSAGE` і `defaultCanPlayType` (елемент `audio`) — як зараз;
- `export class AudioTrackController extends MediaTrackController<AudioFormat> { constructor(options: AudioTrackControllerOptions) { super({ ...options, detectFormat: detectAudioFormat, messages: { unsupported: unsupportedFileMessage, unplayable: unplayableFormatMessage, loadFailed: decodeFailedMessage, playFailed: PLAY_FAILED_MESSAGE } }); } }`.

**`src/media/VideoController.ts`** (новий):
- `export interface VideoControllerOptions { readonly createPlayer: CreateMediaPlayer; readonly canPlayType: (mime: string) => boolean; readonly createObjectUrl?: (file: Blob) => string; readonly revokeObjectUrl?: (url: string) => void }` (та сама форма, що `AudioTrackControllerOptions`);
- `export function defaultVideoCanPlayType(mime: string): boolean` → `document.createElement('video').canPlayType(mime) !== ''`;
- `export class VideoController extends MediaTrackController<VideoFormat>` з `detectVideoFormat` і повідомленнями `unsupportedVideoMessage`, `unplayableVideoMessage`, `videoLoadFailedMessage`, `VIDEO_PLAY_FAILED_MESSAGE`.

Чому підкласи, а не просто фабрики: у `App` і тестах 006 уже є `new AudioTrackController(...)`, а окремий тип `VideoController` дає 008 зрозумілу назву в сигнатурах. Логіка при цьому одна.

### Стан у React

**`src/state/useMediaTrackController.ts`** (новий, спільний для обох provider'ів):
```ts
export interface MediaTrackApi {
  loadFile(file: File, container: HTMLElement): void;
  clear(): void;
  togglePlay(): void;
  seek(seconds: number): void;
  setRate(rate: number): void;
  getCurrentTime(): number;
}
export function useMediaTrackController(create: () => MediaTrackController): {
  readonly controller: MediaTrackController;
  readonly snapshot: MediaTrackSnapshot;
  readonly api: MediaTrackApi;
};
```
Всередині — рівно те, що зараз у `AudioTrackProvider`: `useState(create)`, `useSyncExternalStore(controller.subscribe, controller.getSnapshot)`, `useEffect(() => () => controller.clear(), [controller])`, `useMemo` для стабільного `api` з `[controller]`.

- `src/state/audioTrackContext.ts`: `export type AudioTrackApi = MediaTrackApi` (решта без змін).
- `src/state/AudioTrackProvider.tsx`: ті самі props, тіло — `const { snapshot, api } = useMediaTrackController(() => new AudioTrackController({ createPlayer, canPlayType }))`.
- **`src/state/videoContext.ts`** (новий): `VideoStateContext: Context<MediaTrackSnapshot | null>`, `VideoApiContext: Context<MediaTrackApi | null>`, хуки `useVideoState()` і `useVideoApi()`, що кидають `Error('useVideoState must be used within VideoProvider')` / `…useVideoApi…` поза provider'ом.
- **`src/state/VideoProvider.tsx`** (новий): props `{ children; createPlayer?: CreateMediaPlayer; canPlayType?: (mime: string) => boolean }`, за замовчуванням `createHtmlVideoPlayer` і `defaultVideoCanPlayType`. У `App.tsx`: `… > TransportProvider > AudioTrackProvider > VideoProvider`.

### Компоненти

**Спільні (виносяться з `AudioTrack.tsx`, поведінка аудіодоріжки не змінюється):**
- `src/components/FileLoadButton.tsx`: props `{ text: string; inputLabel: string; accept: string; onFile(file: File): void }`. Рендер: `<label className="file-load">{text}<input type="file" className="visually-hidden" aria-label={inputLabel} accept={accept} onChange=…/></label>`. На `change`: якщо є перший файл → `onFile(file)`; завжди `event.target.value = ''`. CSS-клас `.audio-track__load` перейменовується на `.file-load` (з `:focus-within`).
- `src/components/useFileDrop.ts`: `useFileDrop(onFile: (file: File) => void): { onDragOver(e: DragEvent<HTMLElement>): void; onDrop(e: DragEvent<HTMLElement>): void }` — код обробників з `AudioTrack` (`preventDefault`, `dropEffect = 'copy'` з перевіркою `dataTransfer` на null, перший файл з `dataTransfer.files`).
- `src/components/useLivePosition.ts`: `useLivePosition(playing: boolean, cuePosition: number, getCurrentTime: () => number, show: (seconds: number) => void): void` — `useLayoutEffect` без залежностей викликає `show(playing ? getCurrentTime() : cuePosition)`, `useAnimationFrame(playing, () => show(getCurrentTime()))`.
- `src/utils/transportFormat.ts`: нова чиста функція `formatMediaPosition(current: number, duration: number): string` → `` `${formatClock(current)} / ${formatClock(duration)}` ``.
- `AudioTrack.tsx` переписується на `FileLoadButton` (`text="Load audio…"`, `inputLabel="Audio file"`), `useFileDrop`, `useLivePosition`, `formatMediaPosition`. DOM, класи (`audio-track`, `audio-track__…`), тексти й aria-назви лишаються тими самими, крім класу кнопки завантаження.

**`src/components/VideoPlayer.tsx`** (новий) — вміст секції `section.app__video[aria-label="Video"]` у `App.tsx` замість `<p className="placeholder">Video</p>`:
- `div.video-player` з `useFileDrop((file) => loadFile(file))`, де `loadFile` передає файл і `screenRef.current` у `api.loadFile`;
- `div.video-player__toolbar`: `<FileLoadButton text="Load video…" inputLabel="Video file" accept={VIDEO_FILE_ACCEPT} …/>`, назва файлу `span.video-player__name` (якщо `fileName`), кнопка «Remove» (`aria-label="Remove video"`, `disabled` у `empty`) → `api.clear()`;
- `div.video-player__stage` (`position: relative; flex: 1; min-height: 0`):
  - `div.video-player__screen` (`ref={screenRef}`, `data-testid="video-screen"`) рендериться **завжди** і не має React-дітей: адаптер додає туди `<video>`;
  - у `empty` поверх — `p.placeholder.video-player__overlay`: `Drop a video file here or use "Load video…" (MP4, WebM)`; у `loading` — `p.video-player__status.video-player__overlay`: `Loading <fileName>…`;
- повзунок `<input type="range" className="video-player__seek" aria-label="Seek video" min={0} max={ready ? duration : 0} step={SEEK_STEP_SECONDS} disabled={!ready} onChange={(e) => api.seek(Number(e.currentTarget.value))} />`. **Неконтрольований** (без `value`): значення пише `useLivePosition` у `ref` так само, як текст позиції, тож під час відтворення React не ререндериться, а між кадрами не «перетягує» значення назад. `SEEK_STEP_SECONDS = 0.1` (експорт з модуля компонента) — крок для миші та стрілок;
- `div.video-player__controls` (`role="group" aria-label="Video playback"`):
  - кнопка Play/Pause: текст «Play»/«Pause», `aria-label` «Play video»/«Pause video», `disabled`, коли не `ready` → `api.togglePlay`;
  - кнопки «−5 s» (`aria-label="Back 5 seconds"`) і «+5 s» (`aria-label="Forward 5 seconds"`), `disabled`, коли не `ready` → `api.seek(api.getCurrentTime() ∓ SKIP_SECONDS)`, `SKIP_SECONDS = 5`; обмеження `[0, duration]` робить контролер;
  - `<output aria-label="Video position">` з `formatMediaPosition`;
  - `<PlaybackRateSelect label="Video speed" value={rate} onChange={api.setRate} />` (доступний і до завантаження);
- `useLivePosition(playing, position, api.getCurrentTime, show)`, де `show(t)` пише `output.textContent = formatMediaPosition(t, duration)` і `seek.value = String(t)`;
- якщо `error !== null`: `<p role="alert" className="video-player__error">{error}</p>`.

**CSS** (`App.css`):
- `.app__media > .app__video` — як для аудіо: `flex-direction: column; align-items: stretch; justify-content: flex-start; padding: 8px; gap: 8px; min-height: 0` (специфічність вища за `.app__media > section`, урок рев'ю 006);
- `.video-player` (`display: flex; flex-direction: column; gap: 8px; width: 100%; height: 100%; min-height: 0`), `.video-player__toolbar`/`.video-player__controls` (flex, `gap: 8px`, `align-items: center`), `.video-player__stage` (`position: relative; flex: 1; min-height: 120px; background: #000`), `.video-player__screen` (`position: absolute; inset: 0`), `.video-player__video` (`width: 100%; height: 100%; object-fit: contain; display: block`), `.video-player__overlay` (як `.audio-track__overlay`), `.video-player__seek` (`width: 100%`), `.video-player__name` (ellipsis), `.video-player__error` (`color: var(--err)`), `.file-load` (колишній `.audio-track__load`).

### Що отримає 008
- Аудіо й відео — **той самий** тип `MediaTrackController` з однаковим API (`play`/`pause`/`seek`/`setRate`/`getCurrentTime`/`subscribe`/`getSnapshot`). 008 зможе працювати зі списком медіадоріжок і не розрізняти аудіо й відео.
- `useMediaTrackController` повертає й сам `controller`, тож 008 зможе підняти контролери вище (у спільний provider синхронізації), не змінюючи компонентів.
- Власних кнопок відтворення в `<video>` немає (`controls = false`), тож стан змінюється лише через контролер.
- `Transport` (005) не змінюється; `PLAYBACK_RATE = 1` лишається до 008.

## Кроки реалізації
1. Від актуального `main` створити гілку `feature/007-video-player`.
2. `src/utils/mediaFormats.ts` + `mediaFormats.test.ts`; `audioFormats.ts` перевести на нього. Перевірка: `npx vitest run src/utils` зелено, `audioFormats.test.ts` не змінено. Коміт `refactor: extract generic media format detection`.
3. `src/media/errors.ts`, `src/media/mediaPlayer.ts`, `src/media/testing/FakeMediaPlayer.ts` (перенесення з `FakeWaveformPlayer`), `src/media/MediaTrackController.ts` + `MediaTrackController.test.ts`. `waveformPlayer.ts` і `FakeWaveformPlayer.ts` → реекспорти, `AudioTrackController.ts` → підклас, `waveSurferPlayer.ts` → `isAbortError`/`toError` з `media/errors.ts`. Перевірка: усі тести `src/audio` зелені без змін у них. Коміт `refactor: generalize the audio track controller for any media file`.
4. `src/state/useMediaTrackController.ts`; `AudioTrackProvider.tsx` і `audioTrackContext.ts` перевести на нього. `FileLoadButton.tsx` + тест, `useFileDrop.ts`, `useLivePosition.ts`, `formatMediaPosition` + тест; `AudioTrack.tsx` перевести на них; CSS `.audio-track__load` → `.file-load`. Перевірка: `AudioTrack.test.tsx`, `AudioTrackProvider.test.tsx`, `App.test.tsx` зелені без змін. Коміт `refactor: share media track hooks and the file button`.
5. `src/utils/videoFormats.ts` + тести. Коміт `feat: detect video formats`.
6. `src/media/htmlVideoPlayer.ts` + `htmlVideoPlayer.test.ts`. Коміт `feat: add HTML video player`.
7. `src/media/VideoController.ts` + тест; `src/state/videoContext.ts`, `src/state/VideoProvider.tsx` + тест. Коміт `feat: add video controller and provider`.
8. `src/components/VideoPlayer.tsx` + тест; CSS; `App.tsx` (`VideoProvider`, `<VideoPlayer />` у секції «Video»); доповнити `App.test.tsx`. Коміт `feat: show the video player with seek and speed controls`.
9. `.gitignore`: додати `*.m4v` поруч з `*.mp4`. README: розділ «Відео» після «Аудіодоріжка» (формати, drag-and-drop, Play/Pause, повзунок і ±5 с, стрілки на повзунку, швидкість без зміни висоти тону, повідомлення про помилки, файл лишається в браузері, поки не синхронізовано з MIDI/аудіо — 008). Коміт `docs: describe the video player`.
10. Усі перевірки з DoD і ручна перевірка в браузері (у гілці).
11. У гілці (**до** злиття): у CLAUDE.md `[x]` для чотирьох пунктів 2.5 (крім «Синхронізація з таймлайном редактора»); статус 007 у розділі 8 — «виконано»; статус плану — `виконано`. Коміт `docs: mark task 007 as done`.
12. `git checkout main && git merge --no-ff feature/007-video-player`, повторні перевірки на `main`, push `main` і гілки.

## Тести
Backend не змінюється, наявні тести мають і далі проходити.

**Наявні тести 006 — головна перевірка рефакторингу.** `audioFormats.test.ts`, `playbackRate.test.ts`, `AudioTrackController.test.ts`, `waveSurferPlayer.test.ts`, `AudioTrackProvider.test.tsx`, `PlaybackRateSelect.test.tsx`, `AudioTrack.test.tsx` не змінюються і проходять після кроків 2–4.

Позначення: `file(name, type)` = `new File(['x'], name, { type })`; `container = document.createElement('div')`; у тестах контролерів `createObjectUrl` повертає `blob:1`, `blob:2`, …, `revokeObjectUrl = vi.fn()`.

### `src/utils/mediaFormats.test.ts`
Тестовий список: `X = { id: 'x', label: 'X', extensions: ['x', 'xx'], mimeTypes: ['app/x'], probeType: 'app/x' }`, `Y = { id: 'y', …, extensions: ['y'], mimeTypes: ['app/y'] }`.
- `fileExtension('Clip.MP4')` → `'mp4'`; `'noext'` → `''`; `'dot.'` → `''`.
- `detectFormat([X, Y], { name: 'a.XX', type: 'app/y' })` → `X` (розширення важливіше); `{ name: 'a', type: 'APP/Y' }` → `Y`; `{ name: 'a', type: '' }` → `null`; `{ name: 'a.z', type: 'text/plain' }` → `null`.
- `acceptAttribute([X, Y])` → `'.x,.xx,.y,app/x,app/y'`.

### `src/utils/videoFormats.test.ts`
- `detectVideoFormat(...)?.id`: `('a.mp4', 'video/mp4')` → `mp4`; `('a.MP4', '')` → `mp4`; `('a.m4v', 'video/x-m4v')` → `mp4`; `('a.webm', 'video/webm')` → `webm`; `('a.webm', 'audio/webm')` → `webm`; без розширення `('clip', 'video/webm')` → `webm`.
- Непідтримувані → `null`: `('a.mov', 'video/quicktime')`, `('a.mkv', 'video/x-matroska')`, `('a.avi', 'video/x-msvideo')`, `('song.mp3', 'audio/mpeg')`, `('clip', '')`.
- `VIDEO_FORMATS`: id `mp4`, `webm`; `probeType` `video/mp4` і `video/webm`.
- `VIDEO_FILE_ACCEPT` точно `.mp4,.m4v,.webm,video/mp4,video/x-m4v,video/webm`.
- Повідомлення: точні рядки з «Технічних рішень» для `unsupportedVideoMessage('a.avi')`, `unplayableVideoMessage` (mp4 і webm), `videoLoadFailedMessage('clip.mp4')`; `VIDEO_PLAY_FAILED_MESSAGE === 'Could not start video playback.'`.

### `src/utils/transportFormat.test.ts` (доповнення)
- `formatMediaPosition(2.5, 65)` → `'0:02.500 / 1:05.000'`; `formatMediaPosition(0, 0)` → `'0:00.000 / 0:00.000'`.

### `src/media/MediaTrackController.test.ts`
Контролер з форматом `X` (див. вище), `canPlayType = vi.fn(() => true)`, `createFakeMediaPlayers()` і повідомленнями `{ unsupported: (n) => \`bad ${n}\`, unplayable: (f) => \`cannot ${f.label}\`, loadFailed: (n) => \`broken ${n}\`, playFailed: 'no play' }`. Детальна поведінка вже покрита `AudioTrackController.test.ts`; тут перевіряємо саме параметризацію:
- `load(file('a.txt', 'text/plain'))` → `error 'bad a.txt'`, плеєр не створено.
- `canPlayType → false` для `a.x` → `canPlayType` викликано з `'app/x'`, `error 'cannot X'`.
- `load(file('a.x', 'app/x'))`, `emitError()` → `error 'broken a.x'`, статус `empty`, `revokeObjectUrl('blob:1')`.
- `play()` з `playError = new DOMException('blocked', 'NotAllowedError')` після `emitReady(10)` → після мікротасків `error 'no play'`, `playing false`.
- Повний цикл: `load` → `emitReady(10)` → плеєр отримав `setPlaybackRate:1`; `togglePlay` → `playing true`; `seek(20)` → `setTime:10`; `setRate(0.5)` → `setPlaybackRate:0.5`; `clear()` → snapshot = `EMPTY_MEDIA_TRACK_SNAPSHOT` з `rate 0.5`.

### `src/media/htmlVideoPlayer.test.ts`
`beforeEach`: `vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)`, так само `pause` і `load` (`mockImplementation(() => {})`); `afterEach`: `vi.restoreAllMocks()`. `events` — об'єкт з `vi.fn()` для всіх шести обробників. Тривалість задається `Object.defineProperty(video, 'duration', { configurable: true, get: () => d })`, помилка — так само для `error`.
- `createHtmlVideoPlayer({ container, url: 'blob:v', events })` → у `container` рівно один `video`; `video.getAttribute('src') === 'blob:v'`; `controls false`, `playsInline true`, `preload 'auto'`, `preservesPitch true`, клас `video-player__video`.
- `duration 12`, подія `loadeddata` → `onReady(12)` один раз; повторний `loadeddata` → `onReady` не викликано вдруге.
- Нескінченна тривалість: `duration Infinity`, `loadeddata` → `onReady` не викликано, `video.currentTime === Number.MAX_SAFE_INTEGER`; потім `duration 42`, `durationchange` → `video.currentTime === 0`, `onReady(42)`.
- `durationchange` без попереднього `loadeddata` → `onReady` не викликано.
- `play` → `onPlay`; `pause` → `onPause`; `ended` → `onFinish`.
- `error` з `video.error = { code: 4, message: 'unsupported codec' }` → `onError` з `Error`, чий `message === 'unsupported codec'`; з `{ code: 3, message: '' }` → `message === 'Media error 3'`.
- Методи: `play()` повертає Promise і викликає `HTMLMediaElement.prototype.play`; `pause()` делегується; `setTime(4)` → `video.currentTime === 4`; `getCurrentTime()` повертає `video.currentTime`; `setPlaybackRate(0.5)` → `playbackRate 0.5`, `preservesPitch true` (перед цим тест ставить `video.preservesPitch = false`).
- `destroy()` → `video` вилучено з `container`, атрибута `src` немає, `load` викликано; подія `play` після цього → `onPlay` не викликано.
- `onSeek` не викликається жодною з цих подій.

### `src/media/VideoController.test.ts`
- `load(file('clip.mp4', 'video/mp4'))` → `canPlayType('video/mp4')`, створено плеєр з `url 'blob:1'`, статус `loading`, `fileName 'clip.mp4'`; `emitReady(30)` → `ready`, `duration 30`.
- `load(file('song.mp3', 'audio/mpeg'))` → `error` = `Unsupported file "song.mp3". Choose an MP4 or WebM video file.`
- `canPlayType → false` для `clip.webm` → `This browser cannot play WebM video. Try MP4.`
- `emitError()` → `Could not play "clip.mp4": the file is damaged or uses a codec this browser does not support.`
- `play()` з `NotAllowedError` → `Could not start video playback.`
- `defaultVideoCanPlayType`: `vi.spyOn(HTMLMediaElement.prototype, 'canPlayType').mockImplementation(function (this: HTMLMediaElement, mime) { return this instanceof HTMLVideoElement && mime === 'video/webm' ? 'maybe' : ''; })` → `defaultVideoCanPlayType('video/webm') === true`, `('video/ogg') === false`.

### `src/state/VideoProvider.test.tsx`
Помічник рендерить `VideoProvider` з `createFakeMediaPlayers().create`, `canPlayType = () => true` і тестовий компонент з кнопками, що викликають API, та `<pre>` зі snapshot. `URL.createObjectURL`/`revokeObjectURL` підмінено присвоєнням і відновлено в `afterEach` (як у `AudioTrack.test.tsx`).
- Початково `status 'empty'`, фабрика не викликалась.
- `loadFile` → `loading`; `emitReady(20)` в `act` → `ready`, `duration 20`.
- API-об'єкт той самий до і після зміни стану.
- Unmount у `ready` → плеєр `destroyed`, `revokeObjectURL` викликано.
- `useVideoState()` і `useVideoApi()` поза provider'ом кидають помилку з назвою хука.
- `vi.mock('../media/htmlVideoPlayer.ts', () => ({ createHtmlVideoPlayer: vi.fn() }))` — справжній адаптер у тесті не використовується.

`useMediaTrackController` покривається тестами `VideoProvider.test.tsx` і незмінними `AudioTrackProvider.test.tsx` (обидва provider'и складаються лише з нього).

### `src/components/FileLoadButton.test.tsx`
- Рендер з `text "Load video…"`, `inputLabel "Video file"`, `accept ".webm"` → текст видно, поле з назвою «Video file» має `accept=".webm"` і тип `file`.
- `fireEvent.change` з одним файлом → `onFile` викликано з цим файлом; `input.value === ''` після цього.
- `change` з порожнім списком файлів → `onFile` не викликано.

### `src/components/VideoPlayer.test.tsx`
Рендер `VideoProvider(createPlayer = fake, canPlayType = () => true) > VideoPlayer`; `vi.mock('../media/htmlVideoPlayer.ts', …)`; Object URL підмінено; `stubAnimationFrames()`.
- Порожній стан: поле «Video file» з `accept` = `VIDEO_FILE_ACCEPT`; підказка з `MP4, WebM`; «Play video», «Back 5 seconds», «Forward 5 seconds», «Remove video» і повзунок «Seek video» вимкнені; «Video speed» = `1`; «Video position» = `0:00.000 / 0:00.000`.
- `change` з `file('clip.mp4', 'video/mp4')` → `Loading clip.mp4…`; плеєр отримав контейнер `getByTestId('video-screen')`.
- `emitReady(65)` в `act` → назва `clip.mp4`, позиція `0:00.000 / 1:05.000`, кнопки й повзунок активні, у повзунка `max="65"`, `value === '0'`.
- `fireEvent.change(slider, { target: { value: '30' } })` → у плеєрі `setTime:30`, позиція `0:30.000 / 1:05.000`.
- «Forward 5 seconds» (з `currentTime 30`) → `setTime:35`; «Back 5 seconds» при `currentTime 2` → `setTime:0`; «Forward 5 seconds» при `currentTime 63` → `setTime:65`.
- «Play video» → у плеєрі `play`, кнопка стає «Pause video»; `currentTime = 2.5`, `flushFrame()` → позиція `0:02.500 / 1:05.000`, повзунок `'2.5'`. «Pause video» → «Play video», `cancelAnimationFrame` викликано.
- Вибір швидкості `0.5` → у плеєрі `setPlaybackRate:0.5`.
- `a.avi` → `role="alert"` з `Unsupported file "a.avi". Choose an MP4 or WebM video file.`; уже завантажене відео лишається (назва на місці).
- `emitError()` після завантаження → `role="alert"` з `Could not play "clip.mp4": …`, знову підказка порожнього стану.
- `fireEvent.drop` на `.video-player` з `dataTransfer: { files: [file('drop.webm', 'video/webm')] }` → `Loading drop.webm…`; `fireEvent.dragOver` з `dataTransfer: { dropEffect: 'none', files: [] }` повертає `false`.
- «Remove video» у `ready` → плеєр `destroyed`, знову порожній стан.

### `src/App.test.tsx` (доповнення; наявні перевірки лишаються)
- `vi.mock('./media/htmlVideoPlayer.ts', () => ({ createHtmlVideoPlayer: vi.fn() }))`. У регіоні «Video» є поле «Video file», група «Video playback» з вимкненою «Play video», комбобокс «Video speed», повзунок «Seek video»; `createHtmlVideoPlayer` не викликано.
- Групи «Playback» (MIDI) і «Audio playback» на місці; кнопки «Play», «Play audio», «Play video» знаходяться за назвами однозначно.

### Ручна перевірка в браузері
`cd frontend && npm run dev`, http://localhost:5173, Chrome і Firefox. Потрібні локальні файли mp4 (H.264), webm (VP9 або AV1), webm, записаний через `MediaRecorder` (наприклад, запис екрана з браузера), `.mov`, `.mp3` і текстовий файл, перейменований на `.mp4`. У репозиторій вони не комітяться.
1. «Load video…» відкриває діалог з відеофайлами. Після вибору mp4 видно «Loading …», потім перший кадр у панелі «Video» (пропорції збережено, чорні поля) і назву файлу. У Network лише `blob:`, без запитів до `/api` з файлом.
2. Те саме для webm; для webm з `MediaRecorder` тривалість показується скінченна (не `Infinity`/`NaN`), повзунок працює.
3. Play/Pause працюють; позиція `хв:сс.мс / тривалість` і повзунок рухаються плавно.
4. Перетягування повзунка на паузі показує відповідні кадри; під час відтворення відтворення триває з нової позиції. Стрілки на сфокусованому повзунку крокують на 0.1 с. «−5 s»/«+5 s» перемотують і не виходять за межі 0 і тривалості.
5. Швидкість 0.25×, 0.5×, 1.5×, 2× — відео сповільнюється/прискорюється, **висота тону** звуку відео не змінюється. Швидкість зберігається після паузи й для наступного файлу.
6. Кінець відео: кнопка повертається в «Play», позиція = тривалість; наступний Play починає з початку.
7. `.mov`, `.mp3` → `Unsupported file …`, завантажене відео лишається. Текстовий файл `.mp4` → `Could not play …`, панель порожня.
8. Перетягування файлу з файлового менеджера на панель «Video» завантажує його, браузер не відкриває файл у вкладці.
9. «Remove» прибирає відео; повторний вибір того самого файлу знову його завантажує. Заміна файлу під час відтворення зупиняє старе відео.
10. Аудіодоріжка (006) працює як раніше: завантаження, waveform, клік, швидкість, Remove, drag-and-drop. MIDI-транспорт працює. Аудіо, відео й MIDI поки грають незалежно (очікувано до 008).
11. Консоль без помилок і попереджень React.

## Критерії готовності (Definition of Done)
- [ ] `cd frontend && npm test -- --run && npm run lint && npm run typecheck && npm run build && npx prettier --check .` — зелено.
- [ ] `cd backend && uv run pytest && uv run ruff check . && uv run ruff format --check . && uv run mypy app` — зелено; `git diff main --stat -- backend/` порожній.
- [ ] Усі тести з розділу «Тести» наявні й проходять. Кожна експортована функція `mediaFormats.ts`, `videoFormats.ts`, `formatMediaPosition`, `createHtmlVideoPlayer`, `MediaTrackController`, `VideoController`, `defaultVideoCanPlayType`, `VideoProvider` і компоненти `FileLoadButton`, `VideoPlayer` мають щонайменше один тест.
- [ ] Рефакторинг не зачепив тестів 001–006: `git diff main --name-status -- 'frontend/src/**/*.test.ts' 'frontend/src/**/*.test.tsx'` показує лише `A` для нових файлів і `M` для `frontend/src/App.test.tsx` та `frontend/src/utils/transportFormat.test.ts`; у цих двох `git diff main` містить лише додані рядки.
- [ ] `git diff main -- frontend/package.json frontend/package-lock.json` порожній (нових залежностей немає).
- [ ] `grep -rn "createElement('video')" frontend/src --include='*.ts' --include='*.tsx' | grep -v test` → лише `src/media/htmlVideoPlayer.ts` і `src/media/VideoController.ts`.
- [ ] `grep -n "preservesPitch = true" frontend/src/media/htmlVideoPlayer.ts` знаходить щонайменше два рядки (створення елемента і `setPlaybackRate`).
- [ ] `grep -rn "function isAbortError" frontend/src` → лише `src/media/errors.ts`.
- [ ] `.gitignore` містить `*.m4v`; `git status --porcelain` після ручної перевірки не показує медіафайлів.
- [ ] README має розділ «Відео».
- [ ] Ручна перевірка (11 пунктів) пройдена в Chrome і Firefox.
- [ ] У гілці до злиття (коміт `docs: mark task 007 as done`) у CLAUDE.md відмічено `[x]` чотири пункти 2.5; «Синхронізація з таймлайном редактора» (2.5) і пункт синхронізації 2.4 лишаються `[ ]`; статус 007 — «виконано»; статус плану — `виконано`.
- [ ] Гілку `feature/007-video-player` злито в `main` (`--no-ff`) і запушено; на `main` перевірки зелені.

## Ризики / відкриті питання
- **Рефакторинг коду 006.** Перенесення контролера й хуків може непомітно змінити поведінку аудіодоріжки. Страховка — незмінні тести 006 (DoD) і пункт 10 ручної перевірки. Рефакторинг іде окремими комітами (кроки 2–4) **до** відеокоду, тож регресію легко локалізувати.
- **Кодек не підтримується, а помилки немає.** Якщо браузер вміє звук, але не відео (наприклад, HEVC у mp4 у Firefox), деякі браузери грають лише звук на чорному тлі без події `error`. Надійно виявити це можна лише за `videoWidth === 0` після `loadeddata`. Не робимо: випадок рідкісний, а користувач бачить проблему одразу. Якщо на ручній перевірці це трапиться з поширеним файлом, implementer може додати перевірку `videoWidth === 0` → `onError` як дрібне відхилення зі звітом.
- **Обхід `duration === Infinity`.** Трюк з `currentTime = MAX_SAFE_INTEGER` — загальновживаний спосіб для WebM з `MediaRecorder`. Якщо браузер не згенерує `durationchange`, `onReady` не прийде і панель лишиться в «Loading…». Це перевіряється пунктом 2 ручної перевірки. Запасний варіант (дрібне відхилення): після `seeked` без скінченної тривалості викликати `onError`.
- **Якість звуку на 0.25×** — та сама, що в 006 (браузерний time-stretch). Відео при цьому просто показує кадри повільніше.
- **Розмір панелі.** Відео в панелі 360×~(половина висоти) px — дрібне. Розкладку зі збільшеним відео логічно вирішувати разом зі спільним таймлайном у 008.
- **Відкрите питання до власника (не блокує, прийнято дефолт): `.mov`.** Відео з iPhone часто мають `.mov`. Вимога — «мінімум mp4/webm», а `canPlayType('video/quicktime')` у Chrome і Firefox повертає `''`, хоча H.264 у `.mov` часто відтворюється. Зараз `.mov` відхиляється повідомленням. Якщо власник хоче підтримку `.mov`, це окремий рядок у `VIDEO_FORMATS` з `probeType: 'video/mp4'` (плюс ризик `Could not play …` для HEVC).
- **Відкрите питання до власника (не блокує): звук відео.** Звук відео грає разом з аудіодоріжкою і MIDI. Кнопку mute відео логічно додати в 008, коли з'явиться спільне відтворення.
- **Обсяг.** Рефакторинг (3 невеликі кроки) + формат, адаптер, контролер-підклас, provider і компонент. Нової залежності немає, контролер і фейк уже існують. Задача вкладається в одну гілку.
