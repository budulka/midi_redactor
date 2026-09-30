# 012 — fix: одне джерело медіа + waveform звуку відео на аудіодоріжці

**Статус:** схвалено
**Гілка:** fix/012-single-media-source

## Мета
Закрити два пункти розділу 2 CLAUDE.md (після виконання ставимо `[x]`):
- **2.7 «Одне джерело медіа»:** завантаження відео замінює раніше завантажене аудіо, і навпаки. Старий файл зупиняється, його плеєр знищується, Object URL звільняється. Два медіафайли ніколи не звучать одночасно.
- **2.8 «Звук відео на аудіодоріжці»:** після завантаження відео його звукова доріжка показується як waveform у панелі «Audio track», так само як для аудіофайлу. Клік по цьому waveform перемотує весь таймлайн, а курсор waveform рухається разом з відео.

Зараз аудіо (`AudioTrackController`) і відео (`VideoController`) незалежні. `MediaSyncBridge` під'єднує обидва до транспорту, тож після завантаження і аудіо, і відео вони грають разом. Звук відео ніде не показується.

Задача спирається на готове й не дублює його:
- `MediaTrackController` (007/008): покоління плеєрів, `releaseTrack()` (знищення плеєра + `revokeObjectUrl`), `clear()`, `subscribeSeek`;
- `MediaSync`/`MediaSyncBridge` (008): синхронізація з транспортом не змінюється, вона й далі вміє працювати з кількома доріжками;
- адаптер WaveSurfer (`src/audio/waveSurferPlayer.ts`, 006): ті самі кольори й висота waveform;
- `useLivePosition`, `formatMediaPosition`, `FakeMediaPlayer`, `stubAnimationFrames`;
- e2e-помічники `recordTestVideo`, `loadVideo` (`frontend/e2e/media.ts`, 011).

## Поза межами задачі
- **013:** вплив BPM на відтворення.
- **014:** змінна ширина правої панелі.
- **015:** зсув (offset) медіа. Медіа, як і раніше, починається в 0 с таймлайну.
- **016:** таймлайн відео над piano roll, перенесення waveform під сітку, вирізання проміжків. Waveform звуку відео лишається в правій панелі на всю її ширину, як і waveform аудіофайлу.
- Одночасна робота з відео й окремим аудіофайлом (наприклад, відео без звуку плюс окремий запис). Вимога 2.7 прямо забороняє два джерела. Якщо це знадобиться, потрібна окрема задача з вибором «яке джерело звучить».
- Вибір однієї з кількох звукових доріжок відео. Браузер декодує першу (типову) доріжку.
- Обмеження розміру відеофайлу для побудови waveform (див. «Ризики»).
- Об'єднання `AudioTrackProvider` і `VideoProvider` в один provider «медіа» (див. «Відкинуті альтернативи»).
- Backend не змінюється.

## Технічні рішення

### Відкинуті альтернативи
| Варіант | Чому ні |
|---|---|
| Один `MediaTrackController` на обидва типи файлів (один provider, один контролер, плеєр вибирається за форматом) | Потребує двох контейнерів у `load()` (екран відео й waveform), злиття двох provider'ів і контекстів і переписування тестів `AudioTrack`, `VideoPlayer`, `AudioTrackProvider`, `VideoProvider`, `MediaSyncBridge`, `App`. Великий обсяг змін заради того самого результату. Два контролери з правилом «завантаження одного очищає інший» дають ту саму поведінку локальною зміною |
| Слухати `subscribe` контролерів і очищати інший, коли статус став `loading` | Статус `loading` з'являється й без нового файлу: `setRate`/`setMuted` під час завантаження теж створюють snapshot зі статусом `loading`. Тоді «зайве» `clear()` стирало б, наприклад, повідомлення про помилку в іншій панелі. Явна подія «почалося завантаження нового файлу» однозначна |
| Окремий прихований `<audio>` з тим самим Object URL для waveform звуку відео | Це другий медіаелемент з тим самим звуком. Його довелося б тримати синхронним і приглушеним, а вимога 2.7 якраз забороняє два джерела |
| Власне декодування (`decodeAudioData`) і малювання піків | Дублює те, що вже робить `wavesurfer.js` зі стеку |

**Обрано:** WaveSurfer з опцією **`media`** (використати наявний медіаелемент замість створення власного `<audio>`). Це офіційний спосіб показати waveform відео у `wavesurfer.js`. Нових залежностей немає.

### Як WaveSurfer 8 працює з чужим медіаелементом (перевірено в `node_modules/wavesurfer.js/dist`)
- `player.js`: з `options.media` плеєр позначає елемент як зовнішній (`isExternalMedia = true`). `destroy()` лише знімає свої слухачі й **не** ставить елемент на паузу, не прибирає `src` і не видаляє його з DOM. `revokeSrc()` відкликає тільки URL, які WaveSurfer створив сам (`_ownBlobUrl`).
- `player.js`, `setSrc(url, blob)`: якщо `url` збігається з поточним `media.currentSrc || media.src`, нічого не робить. Отже, коли передаємо той самий Object URL, що вже стоїть у `<video>`, відео не перезавантажується.
- `wavesurfer.js`, `loadAudio`: для зовнішнього медіа не викликає `pause()`. Файл береться через `fetch(url)` (з `blob:` URL це працює), декодується `decodeAudioData` (частота 8 кГц за замовчуванням), після чого приходить подія `ready`. Помилка fetch чи декодування (наприклад, у відео немає звукової доріжки) дає подію `error`.
- Конструктор сам викликає `load(options.url || media.src)` у мікрозадачі. Тому адаптер **не** викликає `ws.load()` окремо (інакше було б два завантаження, і перше скасувалося б). URL передаємо опцією `url`, щоб завантаження було явним.
- Курсор waveform рухається за подіями `timeupdate`/`play` самого `<video>`. Клік по waveform ставить `video.currentTime` і генерує `interaction(time)`, як і для аудіо.

### Нове в `MediaPlayer` і `MediaTrackController`
**`src/media/mediaPlayer.ts`**, новий метод інтерфейсу:
```ts
/** The media element that plays the file, if the player has one. */
getMediaElement(): HTMLMediaElement | null;
```
- `htmlVideoPlayer.ts`: `getMediaElement: () => video`.
- `waveSurferPlayer.ts` (`createWaveSurferPlayer`): `getMediaElement: () => ws.getMediaElement()`.
- `FakeMediaPlayer`: публічне поле `mediaElement: HTMLMediaElement | null = null` і `getMediaElement()`, що повертає його. У журнал `calls` виклик не записується, тож наявні перевірки журналу не змінюються.

**`src/media/MediaTrackController.ts`**:
```ts
/** A ready file: its media element and the object URL it plays. */
export interface LoadedMedia {
  readonly element: HTMLMediaElement;
  readonly url: string;
}

/**
 * Calls the listener when a file passed the format checks and is about to replace the current
 * one, before the new player is created. Rejected files do not call it.
 */
subscribeLoadStart(listener: () => void): () => void;

/** The media element and URL of the ready file; null while empty, loading or without an element. */
getLoadedMedia(): LoadedMedia | null;
```
- `load(file, container)` отримує такий порядок (зміна порядку потрібна для «Утримання тривалості таймлайну», див. нижче):
  1. перевірки формату (`detectFormat`, `canPlayType`) — як зараз;
  2. `releaseTrack()` власного попереднього файлу, `createObjectUrl(file)`, `this.nudge = 1`;
  3. `this.snapshot = { status: 'loading', fileName, … }` — **без** `notify()`;
  4. виклик усіх слухачів `subscribeLoadStart` (копія множини, як у `notifySeek`). На цей момент `getSnapshot()` цієї доріжки вже `loading`, а нового плеєра ще немає;
  5. `createPlayer(...)`, потім `notify()` — як зараз.
  
  Для непідтримуваного файлу чи формату, який браузер не відтворює, слухачі не викликаються. Для власних слухачів `subscribe` нічого не змінюється: вони, як і раніше, отримують одне сповіщення наприкінці `load`.
- `getLoadedMedia()`: `status === 'ready'`, є плеєр, `url !== null` і `player.getMediaElement() !== null` → `{ element, url }`, інакше `null`.
- Snapshot не змінюється (нових полів немає), тож наявні `toEqual` у тестах лишаються як є.

### Одне джерело медіа — `src/media/singleMediaSource.ts` (новий)
```ts
/** Implemented by MediaTrackController. */
export interface ExclusiveMediaTrack {
  subscribeLoadStart(listener: () => void): () => void;
  clear(): void;
}

/**
 * Keeps at most one of the tracks loaded: when one starts loading a file, every other track is
 * cleared (its player is destroyed, its object URL revoked). Returns a function that stops it.
 */
export function keepSingleMediaSource(tracks: readonly ExclusiveMediaTrack[]): () => void;
```
- На кожну доріжку `track.subscribeLoadStart(() => { for (const other of tracks) if (other !== track) other.clear(); })`. Повертає функцію, що відписує всі підписки.
- Інша доріжка очищається **до** створення нового плеєра, тож навіть на мить не існує двох медіаелементів. `clear()` уже робить усе, що вимагає 2.7: `releaseTrack()` знищує плеєр (обидва адаптери в `destroy()` ставлять елемент на паузу), збільшує покоління (пізні події старого плеєра ігноруються) і відкликає Object URL. Snapshot стає порожнім (`playing: false`), а `rate` і `muted` зберігаються, як і раніше.
- Очищена доріжка переходить у `empty`, і `MediaSync` скидає її стан синхронізації (008). Нове медіа, завантажене під час відтворення, після `onReady` стає в позицію транспорту й починає грати (наявна поведінка 008). Щоб транспорт на час завантаження не зупинявся, потрібна зміна в `MediaSync` (наступний підрозділ).

### Утримання тривалості таймлайну під час заміни файлу — зміна `src/media/MediaSync.ts`
**Проблема (зауваження рев'ю).** Зараз `MediaSync.updateMediaDuration()` бере максимум тривалостей лише `ready`-доріжок. Під час заміни стара доріжка вже `empty`, а нова ще `loading`, тож тривалість медіа падає до 0. Далі `TransportProvider` викликає `transport.setMediaDuration(0)`, `Transport.updateEndTime()` скорочує `endTime` до таймлайну без медіа (щонайменше 60 с або 2 такти після останньої ноти), і найближчий `tick` робить `halt('paused', endTime)`. Відтворення зупиняється, а playhead стрибає назад, наприклад з 1:30 на 1:00. Ненадовго стискається й ширина piano roll. Те саме вже зараз стається, коли в **ту саму** доріжку завантажують інший файл (з `ready` одразу в `loading`).

**Обрано варіант (б): таймлайн не стискається, поки йде завантаження.** Правило в `updateMediaDuration()`:
```ts
const ready = max(duration of 'ready' tracks, 0);
const loading = some attached track has status 'loading';
const next = loading ? Math.max(ready, this.mediaDuration) : ready;
```
- Поки хоч одна доріжка `loading`, тривалість медіа може лише зростати. Транспорт грає далі з тієї самої позиції, playhead не стрибає, ширина piano roll не змінюється.
- Коли нова доріжка стала `ready`, тривалість дорівнює її тривалості. Якщо новий файл коротший за поточну позицію, транспорт стає на паузу в кінці нового таймлайну. Це та сама поведінка, що й для коротшого медіа чи «Remove» зараз: таймлайн справді став коротшим.
- Коли завантаження закінчилося помилкою (`onError` → `empty`), тривалість падає до тривалості решти `ready`-доріжок (тобто до 0) — як після «Remove».
- «Remove» (`clear()` без нового завантаження) скорочує таймлайн одразу, як і зараз: `loading`-доріжок немає.
- Чому це працює саме з новим порядком у `load()`: `keepSingleMediaSource` очищає стару доріжку зсередини слухача `subscribeLoadStart`. `MediaSync` отримує сповіщення про очищення синхронно й одразу перераховує тривалість. На цей момент нова доріжка вже повертає `status: 'loading'` з `getSnapshot()` (крок 3 у `load()`), тож правило бачить завантаження й тривалість не падає.

**Відкинутий варіант:** ставити транспорт на паузу в поточній позиції на час заміни. Користувач мусив би щоразу знову натискати Play, а заміна того самого файлу в одній доріжці все одно лишалася б зі стрибком. Утримання тривалості дає безперервне відтворення: ноти грають далі, а нове медіа підхоплюється після `onReady`.

Інші частини `MediaSync` не змінюються. Зміна ширини таймлайну з `loading` у `ready` новим (довшим чи коротшим) файлом лишається, як і зараз.
- `clear()` порожньої доріжки з повідомленням про помилку прибирає це повідомлення. Тому вдале завантаження аудіо прибирає й старе повідомлення про помилку в панелі відео. Це очікувано: помилка стосувалася файлу, який уже не актуальний.
- Невдалий вибір (непідтримуваний формат, формат, який браузер не відтворює) нічого не очищає. Це узгоджується з рішенням 006/007: невдалий вибір не знищує вже завантажений файл.
- Файл пройшов перевірки, але не декодувався (`onError`): інша доріжка на цей момент уже очищена. Лишаються обидві панелі порожні й повідомлення про помилку. Так само 006 поводиться для доріжки, чий попередній файл уже знищено. Див. «Ризики / відкриті питання».

**`src/state/SingleMediaSource.tsx`** (новий, рендерить `null`):
```tsx
export default function SingleMediaSource() {
  const audio = useAudioTrackApi().controller;
  const video = useVideoApi().controller;
  useEffect(() => keepSingleMediaSource([audio, video]), [audio, video]);
  return null;
}
```
В `App.tsx` він стоїть поруч з `<MediaSyncBridge />`. Окремий компонент, а не частина `MediaSyncBridge`: це інше правило, і `MediaSyncBridge.test.tsx` навмисно завантажує аудіо й відео разом, щоб перевірити синхронізацію двох доріжок. Цей тест лишається чинним. `MediaSync` і далі підтримує будь-яку кількість доріжок.

### Waveform для наявного медіаелемента — `src/audio/waveformView.ts` (новий)
```ts
export interface WaveformViewEvents {
  /** The sound is decoded and drawn. */
  onReady(): void;
  /** The user clicked the waveform; the media element is already moved there. */
  onSeek(time: number): void;
  /** The sound could not be fetched or decoded (for example, the video has no sound track). */
  onError(error: Error): void;
}
/** A waveform drawn for a media element owned by someone else; destroy() leaves the element alone. */
export interface WaveformView {
  destroy(): void;
}
export interface CreateWaveformViewOptions {
  readonly container: HTMLElement;
  readonly media: HTMLMediaElement;
  readonly url: string;
  readonly events: WaveformViewEvents;
}
export type CreateWaveformView = (options: CreateWaveformViewOptions) => WaveformView;
```

**Адаптер `createWaveSurferView: CreateWaveformView`** — у `src/audio/waveSurferPlayer.ts`, щоб `wavesurfer.js` і далі імпортувався лише в одному модулі (DoD 006):
- спільні параметри вигляду виносяться в константу модуля `WAVEFORM_STYLE = { height: WAVEFORM_HEIGHT_PX, waveColor, progressColor, cursorColor, cursorWidth: 2, normalize: true, interact: true, dragToSeek: false }`. `createWaveSurferPlayer` використовує її ж, а значення не змінюються (наявний тест `toMatchObject` проходить без змін);
- `const ws = WaveSurfer.create({ container, media, url, ...WAVEFORM_STYLE })`, без `backend` (з `media` WaveSurfer не створює власного плеєра);
- `ws.load()` **не** викликається (див. вище);
- підписки: `ready` → `onReady()`, `interaction` → `onSeek(time)`, `error` → `onError(error)`;
- `destroy` → `ws.destroy()`.

**Тестовий двійник `src/audio/testing/FakeWaveformView.ts`:** `createFakeWaveformViews()` → `{ create: CreateWaveformView; views: FakeWaveformView[] }`. У `FakeWaveformView` поля `options` і `destroyed`, помічники `emitReady()`, `emitSeek(time)`, `emitError(error?)`.

**Фабрика в React.** `src/state/audioTrackContext.ts` отримує `WaveformViewFactoryContext = createContext<CreateWaveformView | null>(null)` і хук `useCreateWaveformView()`, який поза provider'ом кидає `Error('useCreateWaveformView must be used within AudioTrackProvider')`. `AudioTrackProvider` отримує prop `createWaveformView?: CreateWaveformView` (за замовчуванням `createWaveSurferView`) і обгортає дітей у `WaveformViewFactoryContext.Provider`. Так тести підставляють фейк, як уже роблять із `createPlayer`.

### UI панелі «Audio track»
`AudioTrack.tsx` додатково читає `useVideoState()` і `useVideoApi()`. Через правило одного джерела непорожньою може бути лише одна з двох доріжок. Позначення: `audio` — snapshot аудіо, `video` — snapshot відео, `showsVideo = audio.status === 'empty' && video.status !== 'empty'`.

| Стан | Що показує панель |
|---|---|
| аудіо `loading`/`ready` | як зараз (без змін) |
| `showsVideo`, відео `loading` | `p.audio-track__status.audio-track__overlay`: `Loading the sound of <video.fileName>…` |
| `showsVideo`, відео `ready` | `<VideoSoundWaveform />` (нижче) |
| усе порожнє | як зараз: підказка `Drop an audio file here or use "Load audio…" (MP3, WAV, OGG, AAC, M4A)` |

Ще в режимі `showsVideo`:
- у панелі інструментів замість назви аудіофайлу — `span.audio-track__name` з текстом `Video sound: <video.fileName>` і `title={video.fileName}`;
- «Remove audio» вимкнена (аудіодоріжка порожня). Відео прибирається кнопкою «Remove video» у своїй панелі, і тоді зникає й waveform;
- «Load audio…» і drag-and-drop працюють як завжди. Завантаження аудіо замінює відео (правило одного джерела);
- `output` «Audio position» показує позицію відео: `useLivePosition` отримує `playing`, `position`, `duration` і `getCurrentTime` з відеодоріжки замість аудіо. Функції `getCurrentTime` обох API стабільні, тож вибір джерела на кожному рендері безпечний.

Контейнер `div.audio-track__waveform` (`data-testid="waveform"`) рендериться завжди, як і раніше. Аудіоплеєр малює в ньому, а waveform звуку відео має власний контейнер поверх нього.

**`src/components/VideoSoundWaveform.tsx`** (новий). Рендериться лише всередині `.audio-track__stage` і лише коли відео `ready`. Кожне нове завантаження відео проходить через `loading`, тож компонент перемонтовується на кожен файл, і `key` не потрібен.
- Бере `useVideoState().fileName`, `useVideoApi()` (`controller`, `seek`) і `useCreateWaveformView()`.
- Стан `phase: 'drawing' | 'ready' | 'failed'`, початково `'drawing'`.
- `useEffect(…, [api, createView])`:
  - `container = ref.current`; якщо `null` → нічого не робить (у звичайному рендері цього не буває, бо div рендериться разом з компонентом; перевірка потрібна для strict TS і не змінює фазу);
  - `media = api.controller.getLoadedMedia()`; якщо `null` → `setPhase('failed')`, нічого не створюється;
  - інакше `view = createView({ container, media: media.element, url: media.url, events: { onReady: () => setPhase('ready'), onSeek: (t) => api.seek(t), onError: () => setPhase('failed') } })`;
  - cleanup: `view.destroy()`. Сумісно з подвійним запуском ефектів у StrictMode: знищення вигляду не чіпає `<video>`.
- `onSeek` → `api.seek(t)`, тобто `controller.seek`: `setTime` (відео вже там, повторне присвоєння нешкідливе), слухачі `subscribeSeek` перемотують транспорт (008), `position` у snapshot. Це той самий шлях, що й клік по waveform аудіо.
- Розмітка:
  - `div.audio-track__video-waveform` (`ref`, `data-testid="video-waveform"`);
  - `phase === 'drawing'` → `p.audio-track__status.audio-track__overlay`: `Drawing the sound of <fileName>…`;
  - `phase === 'failed'` → `p.placeholder.audio-track__overlay`: `No sound to show: "<fileName>" has no audio track or the browser cannot decode it.` Це не `role="alert"`: відео без звуку — звичайний випадок, і саме відео працює.

**CSS** (`App.css`): `.audio-track__video-waveform { position: absolute; inset: 0; background: var(--bg); }`. `.audio-track__stage` уже має `position: relative`, а висоту 96 px задає `.audio-track__waveform`, що лежить під ним. Оверлеї йдуть у DOM після контейнера, тож малюються поверх нього.

### Що не змінюється
- `VideoPlayer.tsx` (крім того, що тепер його очищає завантаження аудіо), `mediaSync.ts` (чисті правила корекції), `Transport`, `MediaSyncBridge`. У `MediaSync.ts` змінюється лише `updateMediaDuration()` (див. вище).
- Прапорець «Mute video» глушить звук відео, а отже й «звук на аудіодоріжці» (це той самий `<video>`). Waveform при цьому лишається.
- Тривалість таймлайну поза заміною файлу: `MediaSync.getMediaDuration()` бере максимум готових доріжок, а тепер готова щонайбільше одна.

## Кроки реалізації
1. Від актуального `main` створити гілку `fix/012-single-media-source`.
2. `MediaPlayer.getMediaElement()`: реалізації в `htmlVideoPlayer.ts`, `waveSurferPlayer.ts`, `FakeMediaPlayer`. У `MediaTrackController`: новий порядок кроків у `load()`, `subscribeLoadStart`, `getLoadedMedia`, тип `LoadedMedia`. Тести (доповнення) у `MediaTrackController.test.ts`, `htmlVideoPlayer.test.ts`, `waveSurferPlayer.test.ts` (у фейковий `ws` додати `getMediaElement: vi.fn(() => null)`). Коміт `feat: expose the load start and the media element of a media track`.
3. `src/audio/waveformView.ts`; `createWaveSurferView` і `WAVEFORM_STYLE` у `waveSurferPlayer.ts`; `src/audio/testing/FakeWaveformView.ts`; `WaveformViewFactoryContext` і `useCreateWaveformView` в `audioTrackContext.ts`; prop `createWaveformView` в `AudioTrackProvider`. Тести `createWaveSurferView` у `waveSurferPlayer.test.ts`, тест фабрики в `AudioTrackProvider.test.tsx`. У фабриках `vi.mock('…/waveSurferPlayer.ts')` чотирьох тестових файлів (`App.test.tsx`, `AudioTrackProvider.test.tsx`, `MediaSyncBridge.test.tsx`, `AudioTrack.test.tsx`) додати `createWaveSurferView: vi.fn()`, бо Vitest кидає помилку, коли звертаються до експорту, якого немає в моку. Коміт `feat: draw a waveform for an existing media element`.
4. `src/components/VideoSoundWaveform.tsx`; зміни `AudioTrack.tsx`; CSS. У `AudioTrack.test.tsx` помічник `setup()` обгортає `AudioTrack` ще й у `VideoProvider` з фейковими плеєрами та передає `createWaveformView` (без цього `useVideoState()` кидає помилку); додати `vi.mock('../media/htmlVideoPlayer.ts', …)`. Наявні перевірки не змінюються. Новий `VideoSoundWaveform.test.tsx`. Коміт `feat: show the sound of a loaded video on the audio track`.
5. `MediaSync.updateMediaDuration()`: утримання тривалості, поки є `loading`-доріжка. Тести-доповнення в `MediaSync.test.ts` і `TransportProvider.test.tsx`. Коміт `fix: keep the timeline length while a media file is replaced`.
6. `src/media/singleMediaSource.ts` + `singleMediaSource.test.ts`; `src/state/SingleMediaSource.tsx` + `SingleMediaSource.test.tsx`; `<SingleMediaSource />` в `App.tsx` поруч з `<MediaSyncBridge />`. Коміт `fix: keep one media file loaded at a time`.
7. E2E: помічники в `frontend/e2e/media.ts` і `frontend/e2e/single-media.spec.ts` (див. «Тести»). Коміт `test: check the single media source in the browser`.
8. README:
   - у розділі «Синхронізація» замінити пункт про mute («Корисно, коли відео й аудіодоріжка — той самий запис…») і пункт «Коротше медіа… інше медіа грають далі»: тепер завантажене лише одне медіа;
   - новий пункт у «Синхронізації» або короткий розділ «Одне джерело медіа»: завантаження відео замінює аудіо і навпаки, старий файл зупиняється й звільняється, невдалий вибір файлу нічого не замінює. Заміна під час відтворення не зупиняє транспорт: ноти грають далі, таймлайн не коротшає, поки новий файл завантажується, а нове медіа підхоплює позицію, щойно буде готове. Якщо новий файл коротший за поточну позицію або не відкрився, транспорт стає на паузу в кінці таймлайну, як після «Remove»;
   - у розділі «Аудіодоріжка»: після завантаження відео тут показується waveform його звуку (`Video sound: …`), клік перемотує таймлайн, «Remove audio» вимкнена, а відео без звуку дає підказку `No sound to show…`.
   
   Коміт `docs: describe the single media source and the video sound waveform`.
9. Усі перевірки з DoD (включно з `npm run e2e`) і ручна перевірка в браузері.
10. У гілці до злиття: у CLAUDE.md `[x]` для 2.7 «Одне джерело медіа» і 2.8 «Звук відео на аудіодоріжці» (інші пункти 2.7 і 2.8 лишаються `[ ]`); статус 012 у розділі 8 — «виконано»; статус плану — `виконано`. Коміт `docs: mark task 012 as done`.
11. `git checkout main && git merge --no-ff fix/012-single-media-source`, повторні перевірки на `main` (включно з e2e), `git push origin main` і гілки.

## Тести
Backend не змінюється, наявні тести мають і далі проходити.

Позначення (як у тестах 007/008): `file(name, type) = new File(['x'], name, { type })`; контролери з форматом `X` (`extensions: ['x']`) і повідомленнями `bad …`, `cannot …`, `broken …`, `no play`, як у `MediaTrackController.test.ts`; `createObjectUrl` повертає `blob:1`, `blob:2`, …; `revokeObjectUrl = vi.fn()`.

### Зміни наявних тестів (вичерпний список і причина)
- `App.test.tsx`, `AudioTrackProvider.test.tsx`, `MediaSyncBridge.test.tsx`: у фабриці `vi.mock('…/waveSurferPlayer.ts', …)` додається `createWaveSurferView: vi.fn()`. `AudioTrackProvider` за замовчуванням звертається до цього експорту. Інші рядки не змінюються.
- `AudioTrack.test.tsx`: той самий рядок у `vi.mock`, новий `vi.mock('../media/htmlVideoPlayer.ts', () => ({ createHtmlVideoPlayer: vi.fn() }))`, а `setup()` рендерить `AudioTrackProvider(createPlayer, canPlayType, createWaveformView = fake) > VideoProvider(createPlayer = fake, canPlayType) > AudioTrack`. Усі наявні `it` і їхні перевірки не змінюються.
- `waveSurferPlayer.test.ts`: фейковий `ws` отримує `getMediaElement: vi.fn(() => null)`. Наявні перевірки не змінюються.

Інші наявні тести не змінюються. У файлах з доповненнями (`MediaTrackController.test.ts`, `htmlVideoPlayer.test.ts`, `waveSurferPlayer.test.ts`, `AudioTrackProvider.test.tsx`, `MediaSync.test.ts`, `TransportProvider.test.tsx`) видалених рядків немає, крім рядків імпорту.

Нове правило тривалості не ламає наявних перевірок `MediaSync.test.ts` і `TransportProvider.test.tsx`: жоден наявний тест не перезавантажує файл у готову доріжку й не чекає падіння тривалості під час `loading`. Сценарій «дві доріжки 30 і 45 → `clear()` → 30 → `detach` → 0» проходить без змін, бо `loading`-доріжок там немає.

### `src/media/MediaSync.test.ts` (доповнення: утримання тривалості)
Доріжки — справжні `MediaTrackController` з фейковими плеєрами, як у наявних тестах; `listener = vi.fn()` на `sync.subscribe`.
- **Заміна в тій самій доріжці:** доріжка `ready` (180) → `getMediaDuration() === 180`; `load` іншого файлу → доріжка `loading`, `getMediaDuration()` лишається 180, `listener` не викликано; `emitReady(120)` → 120, `listener` викликано один раз.
- **Помилка нового файлу:** `ready` (180) → `load` → `emitError()` → 0.
- **Нове медіа довше:** `ready` (60) → `load` → `emitReady(200)` → 200.
- **Заміна між доріжками через `keepSingleMediaSource`:** A `ready` (180), B `empty`, обидві приєднані, `keepSingleMediaSource([A, B])`; `B.load(valid)` → A `empty`, B `loading`, `getMediaDuration() === 180`, `listener` не викликано; `B.emitReady(120)` → 120.
- **«Remove» без завантаження:** A `ready` (180), `A.clear()` → 0 одразу (як і раніше).
- **Завантаження до першого `ready`:** порожня приєднана доріжка → `load` → тривалість 0 (не зростає з нічого), `emitReady(30)` → 30.

### `src/state/TransportProvider.test.tsx` (доповнення, помічник `setupMedia` без змін)
- «keeps playing while the media file is replaced»: `attach`, `loadReady(180)`, `play()`, `engine.time = 90.05`, `act(() => engine.tick())` → статус `playing`. `act(() => controller.load(new File(['b'], 'b.mp3'), div))` (нова доріжка `loading`), `engine.time = 90.5`, `act(() => engine.tick())` → статус `playing`, «media duration» = `180`, позиція в стані транспорту не зменшилась. Без утримання тривалості цей тест падає: транспорт став би на паузу на 60 с.
- «pauses at the end when the new file is shorter»: те саме, але потім `act(() => player.emitReady(30))` для нового плеєра, `engine.time = 91`, `act(() => engine.tick())` → статус `paused` (таймлайн 60 с < 90 с). Це фіксує задокументовану поведінку для коротшого файлу.

### `src/media/MediaTrackController.test.ts` (доповнення)
- `subscribeLoadStart`: слухач і фабрика плеєрів пишуть у спільний масив подій. `load(file('a.x', 'app/x'))` → події `['loadStart', 'create']`, тобто слухач викликано рівно один раз і **до** створення плеєра. Усередині слухача `getSnapshot()` повертає `status 'loading'` і `fileName 'a.x'`, а слухач `subscribe`, зареєстрований раніше, ще не викликався (його сповіщення йде після `create`).
- Заміна файлу в тій самій доріжці: `load` A, `emitReady(10)`, `load` B → події `[…, 'destroy A', 'loadStart', 'create B']`; `revokeObjectUrl('blob:1')` викликано до `loadStart`.
- Слухачі `subscribe` отримують рівно одне сповіщення на один `load`, як і раніше.
- `load(file('a.txt', 'text/plain'))` → слухача не викликано; `canPlayType → false` для `a.x` → не викликано.
- Після відписки слухача не викликано.
- `getLoadedMedia()`: у `empty` → `null`; у `loading` (плеєр з `mediaElement = video`) → `null`; після `emitReady(10)` → `{ element: video, url: 'blob:1' }`; плеєр без елемента (`mediaElement = null`) у `ready` → `null`; після `clear()` → `null`; після `emitError()` → `null`.

### `src/media/htmlVideoPlayer.test.ts` і `src/audio/waveSurferPlayer.test.ts` (доповнення)
- `createHtmlVideoPlayer(...).getMediaElement()` повертає той самий `<video>`, що лежить у `container`.
- `createWaveSurferPlayer(...).getMediaElement()` повертає результат `ws.getMediaElement()` (фейк повертає підставлений `document.createElement('audio')`).

### `src/audio/waveSurferPlayer.test.ts` — `createWaveSurferView` (новий `describe`)
`media = document.createElement('video')`, `events` — `vi.fn()` для трьох обробників.
- `createWaveSurferView({ container, media, url: 'blob:v', events })` → `WaveSurfer.create` викликано один раз з об'єктом, що містить `container`, `media`, `url: 'blob:v'`, `height: 96`, `interact: true`, `dragToSeek: false`, `normalize: true`, і **не** містить `backend`. `ws.load` не викликано.
- Події: `ready(12)` → `onReady` викликано; `interaction(3.5)` → `onSeek(3.5)`; `error(err)` → `onError(err)`.
- `destroy()` → `ws.destroy` викликано.
- Наявний тест «creates WaveSurfer on a media element and loads the URL» проходить без змін: `WAVEFORM_STYLE` не змінив параметрів `createWaveSurferPlayer`.

### `src/state/AudioTrackProvider.test.tsx` (доповнення)
- Проба з `useCreateWaveformView()` усередині `AudioTrackProvider createWaveformView={fake.create}` отримує саме `fake.create`.
- `useCreateWaveformView()` поза provider'ом кидає помилку з назвою хука.

### `src/components/VideoSoundWaveform.test.tsx` (новий)
Рендер `AudioTrackProvider(createPlayer = audioFake.create, canPlayType = () => true, createWaveformView = views.create) > VideoProvider(createPlayer = videoFake.create, canPlayType = () => true) > AudioTrack + VideoPlayer`; `vi.mock` для обох адаптерів; Object URL підмінено (`createObjectURL` → `'blob:test'`); `stubAnimationFrames()`. Помічник `loadVideo(duration = 30)`: `change` поля «Video file» з `file('clip.mp4', 'video/mp4')`, `videoPlayer.mediaElement = document.createElement('video')`, `act(() => videoPlayer.emitReady(duration))`.
- Відео `loading` (до `emitReady`) → у регіоні «Audio track» текст `Loading the sound of clip.mp4…`, підказки `MP3, WAV, OGG, AAC, M4A` немає, вигляд не створено.
- Після `emitReady(30)` → створено рівно один вигляд: `options.container === getByTestId('video-waveform')`, `options.media` — підставлений `<video>`, `options.url === 'blob:test'`; текст `Drawing the sound of clip.mp4…`; `.audio-track__name` має текст `Video sound: clip.mp4` і `title="clip.mp4"`; «Remove audio» вимкнена; «Audio position» = `0:00.000 / 0:30.000`.
- `act(() => view.emitReady())` → тексту `Drawing…` немає, повідомлення `No sound to show` немає.
- `act(() => view.emitSeek(12))` → журнал відеоплеєра містить `setTime:12`; «Audio position» і «Video position» = `0:12.000 / 0:30.000`.
- Жива позиція: `act(() => videoPlayer.emitPlay())`, `videoPlayer.currentTime = 2.5`, `flushFrame()` → «Audio position» = `0:02.500 / 0:30.000`.
- `act(() => view.emitError(new Error('no audio')))` → текст `No sound to show: "clip.mp4" has no audio track or the browser cannot decode it.`; `role="alert"` у регіоні «Audio track» немає.
- Плеєр без медіаелемента (`mediaElement` лишено `null`) → вигляд не створено, одразу повідомлення `No sound to show…`.
- «Remove video» → вигляд `destroyed`, `getByTestId('video-waveform')` зник, знову підказка порожньої аудіодоріжки.
- Нове відео (`clip2.mp4`) замість готового → перший вигляд `destroyed`; після `emitReady` нового плеєра створено другий вигляд з новим `media`.
- Аудіо завантажене і `ready` (без `SingleMediaSource`, відео порожнє) → вигляду немає, поведінка як у наявних тестах (`song.mp3` у назві).

### `src/media/singleMediaSource.test.ts` (новий)
Два справжні `MediaTrackController` (`audio`, `video`) з форматом `X`, спільним журналом подій (фабрика кожного пише `create audio`/`create video`, а обгортка `destroy` пише `destroy audio`/`destroy video`) і спільним `revokeObjectUrl = vi.fn()`. `stop = keepSingleMediaSource([audio, video])`.
- Аудіо `ready` (`blob:1`), `emitPlay()`; `video.load(file('v.x', 'app/x'))` → журнал `[…, 'destroy audio', 'create video']` (аудіо знищено **до** створення відеоплеєра); `revokeObjectUrl` викликано з `'blob:1'`; `audio.getSnapshot()` → `status 'empty'`, `playing false`, `fileName null`; `video.getSnapshot().status === 'loading'`.
- Навпаки: відео `ready` → `audio.load(…)` → відео знищено, його URL відкликано, відео `empty`.
- `rate` і `muted` очищеної доріжки зберігаються (`video.setMuted(true)` до заміни → після заміни `muted true`).
- Непідтримуваний файл: аудіо `ready`, `video.load(file('a.txt', 'text/plain'))` → аудіоплеєр не знищено, аудіо `ready`, у відео `error 'bad a.txt'`. Те саме для `canPlayType → false`.
- Повторне завантаження тієї самої доріжки: аудіо `ready`, відео `empty` з помилкою `bad a.txt`; `audio.load(file('b.x', 'app/x'))` → помилку відео прибрано (`error null`), `destroy video` у журналі немає (плеєра не було).
- Після `stop()` завантаження відео не очищає аудіо.
- Три доріжки: завантаження в першу очищає другу й третю.

### `src/state/SingleMediaSource.test.tsx` (новий)
Рендер `AudioTrackProvider(fakes) > VideoProvider(fakes) > SingleMediaSource + AudioTrack + VideoPlayer`; `vi.mock` для обох адаптерів; Object URL підмінено.
- Завантажити `song.mp3`, `emitReady(65)`; завантажити `clip.mp4` → аудіоплеєр `destroyed`, `URL.revokeObjectURL` викликано; у регіоні «Audio track» немає тексту `song.mp3`, є `Loading the sound of clip.mp4…`.
- Далі завантажити `song2.mp3` → відеоплеєр `destroyed`; у регіоні «Video» знову підказка `Drop a video file here…`; вигляд waveform звуку відео (якщо відео встигло стати `ready`) `destroyed`.
- `a.avi` у полі відео при готовому аудіо → аудіо лишається (`song.mp3` видно), `role="alert"` з `Unsupported file "a.avi"…`.
- Unmount `SingleMediaSource` (перерендер дерева без нього) → завантаження відео вже не прибирає готове аудіо.

Окремий `describe` «with the transport»: дерево `ProjectProvider > EditorProvider > TransportProvider(loadEngine → FakePianoEngine) > AudioTrackProvider(fakes) > VideoProvider(fakes) > MediaSyncBridge + SingleMediaSource + TransportControls + AudioTrack + VideoPlayer` (як у `MediaSyncBridge.test.tsx`); `stubAnimationFrames()`.
- **Заміна під час відтворення не зупиняє транспорт.** Аудіо `song.mp3` `ready` (180). Клік «Play» (з `await` завантаження движка), `engine.time = 90.05`, `act(() => engine.tick())`. Завантажити `clip.mp4` (відео `loading`, аудіоплеєр `destroyed`), `engine.time = 90.5`, `act(() => engine.tick())` → у групі «Playback» є кнопка «Pause» (транспорт грає), `Playback position` починається з `1:30.`. `act(() => videoPlayer.emitReady(120))` → журнал відеоплеєра містить `setTime:` з позицією транспорту (≈ 90.5) і після нього `play`.
- **Клік по waveform звуку відео перемотує транспорт** (рекомендація рев'ю). На паузі, відео `ready` (120) з `mediaElement`, вигляд `emitReady()`; `act(() => view.emitSeek(40))` → `Playback position` починається з `0:40.000`, у відеоплеєрі `setTime:40`.

### E2E — `frontend/e2e/single-media.spec.ts` (Playwright, Chromium)
Помічники в `frontend/e2e/media.ts`:
- `recordTestVideo(page, { …, withSound?: boolean })`: з `withSound: true` до потоку canvas додається звукова доріжка: `AudioContext` → `OscillatorNode` (440 Гц) → `MediaStreamAudioDestinationNode`; `new MediaStream([...canvasStream.getVideoTracks(), ...destination.stream.getAudioTracks()])`; `mimeType: 'video/webm;codecs=vp8,opus'`; після зупинки `context.close()`. Без опції поведінка та сама, що зараз (наявні виклики в `video-fit.spec.ts` не змінюються).
- `makeTestWav(seconds = 2, frequency = 440): Buffer` — у Node: RIFF/WAVE, PCM 16 біт, моно, 8000 Гц, синус.
- `loadAudio(page, name, buffer)`: `setInputFiles` у «Audio file» з `mimeType: 'audio/wav'`, потім чекає, поки в панелі зникне `.audio-track__status`, а `.audio-track__name` матиме текст `name`.
- `mediaElements(page)`: `page.evaluate` обходить документ і всі `shadowRoot` елементів (`document.querySelectorAll('*')` → `element.shadowRoot`, рекурсивно) і повертає `{ tag, src, paused }[]` для всіх `audio`/`video`. WaveSurfer 8 кладе свій `<audio>` у **відкритий** shadow root (`renderer.js`: `attachShadow({ mode: 'open' })`, `shadow.appendChild(audioElement)`), тож обхід його бачить. Якщо в іншій версії shadow root виявиться закритим, `<audio>` WaveSurfer не буде видно. Тоді implementer пише у звіт, що перевірка відсутності старого `<audio>` спирається на `destroy()` WaveSurfer і unit-тести, і лишає в e2e лише перевірки `<video>`.
- `trackObjectUrls(page)`: `page.addInitScript`, що обгортає `URL.createObjectURL`/`URL.revokeObjectURL` і записує у `window.__mediaUrls = { created: {url, name}[], revoked: string[] }` лише URL, створені з `File` (так відсіюються власні blob-URL WaveSurfer). Викликається до `openApp`.

Сценарії (`beforeEach`: `trackObjectUrls`, `openApp`):
1. **Відео замінює аудіо.** `loadAudio('tone.wav', makeTestWav(2))`, потім `loadVideo('with-sound.webm', recordTestVideo({ width: 320, height: 180, durationMs: 2000, withSound: true }))` →
   - у регіоні «Audio track» `.audio-track__name` має текст `Video sound: with-sound.webm`; «Remove audio» вимкнена;
   - URL файлу `tone.wav` є у `revoked`;
   - `mediaElements` → рівно один елемент, `tag === 'video'`;
   - у `[data-testid="video-waveform"]` з'явився вміст (дочірній елемент WaveSurfer), тексти `Drawing the sound` і `No sound to show` зникли (очікування до 10 с);
   - `video.currentSrc` дорівнює URL, створеному для `with-sound.webm`: WaveSurfer не підмінив джерело відео.
2. **Аудіо замінює відео.** Спершу відео (без звуку), потім `loadAudio` → у регіоні «Video» видно `Drop a video file here`; URL відео є у `revoked`; `mediaElements` не містить `video` і містить не більше одного `audio`; `[data-testid="video-waveform"]` немає.
3. **Звучить лише одне медіа.** `loadAudio`, `loadVideo(withSound)`, клік «Play» у групі «Playback», очікування кнопки «Pause» (до 20 с, як у `transport.spec.ts`), пауза 500 мс → серед `mediaElements` рівно один з `paused === false`, і це `video`. Клік «Pause».
4. **Відео без звуку.** `loadVideo` без `withSound` → у регіоні «Audio track» текст `No sound to show: "silent.webm" has no audio track or the browser cannot decode it.`; відео при цьому готове (`loadVideo` дочекався кадру), помилки `role="alert"` немає.
5. **Клік по waveform звуку відео перемотує таймлайн.** `loadVideo(withSound, durationMs 2000)`, дочекатися малювання, клік у точці 75 % ширини `[data-testid="video-waveform"]` → `video.currentTime` > 1 с (через `evaluate`), а текст `Playback position` у транспорті вже не починається з `0:00.000`.
6. **Невдалий вибір нічого не замінює.** `loadAudio`, потім `setInputFiles` у «Video file» з `{ name: 'broken.avi', mimeType: 'video/x-msvideo', buffer: Buffer.from('nope') }` → `role="alert"` з `Unsupported file "broken.avi"`; `.audio-track__name` і далі `tone.wav`; URL `tone.wav` не відкликано.

### Ручна перевірка в браузері
`cd frontend && npm run dev` (backend — `uv run uvicorn app.main:app`), http://localhost:5173, Chrome і Firefox. Потрібні локальні файли (не комітяться): mp3 з музикою, mp4 (H.264 + AAC) з музикою, webm з VP9/Opus, відео без звуку (наприклад, запис екрана без мікрофона), відео ≥ 500 МБ.
1. Завантажити mp3 тривалістю ≥ 3 хв (нот у проекті немає або вони лише в перших тактах) → waveform, Play: звучить mp3. Дочекатися позиції ≈ 1:30 і завантажити mp4 довший за 1:30: mp3 одразу замовкає, **транспорт не зупиняється, playhead не стрибає назад, ширина piano roll не змінюється**. У панелі аудіо `Loading the sound of …`, потім `Drawing the sound of …`, далі waveform звуку відео і назва `Video sound: …`. Відео, щойно готове, стає в позицію транспорту й грає; чути лише звук відео.
1a. Те саме, але mp4 коротший за поточну позицію (наприклад, 30 с): після готовності відео транспорт стає на паузу в кінці нового таймлайну (як після «Remove»). Текстовий файл, перейменований на `.mp4`, під час відтворення на 1:30: після `Could not play …` транспорт так само стає на паузу в кінці таймлайну без медіа.
2. Курсор waveform рухається разом з відео; Pause/Stop/клік по лінійці ставлять і кадр, і курсор waveform у позицію playhead.
3. Клік по waveform звуку відео (на паузі й під час відтворення) перемотує відео, playhead і позицію транспорту. Позиції «Audio position» і «Video position» однакові.
4. «Mute video»: звук зникає, waveform лишається. Зняти mute — звук повертається.
5. Завантажити mp3 (довший за поточну позицію) під час відтворення відео на ≈ 1:30: відео зникає з панелі (підказка порожньої панелі), звук відео замовкає, транспорт грає далі без стрибка playhead, а mp3, щойно готовий, підхоплює позицію.
5a. Завантажити інший mp3 у ту саму аудіодоріжку під час відтворення на ≈ 1:30: відтворення так само не зупиняється.
6. Відео без звуку: у панелі аудіо підказка `No sound to show…`, відео працює.
7. webm (VP9/Opus) у Chrome і Firefox: waveform звуку малюється.
8. Невдалий вибір: `.mov` або `.txt` у полі відео при завантаженому mp3 → повідомлення про непідтримуваний файл, mp3 лишається й грає. Текстовий файл, перейменований на `.mp4` → `Could not play …`, панель аудіо теж порожня (див. «Ризики»).
9. «Remove video» прибирає і відео, і waveform його звуку; «Remove audio» у режимі звуку відео вимкнена.
10. DevTools → Memory/Performance або вкладка Network: після кожної заміни файлу старий `blob:` більше не використовується; у консолі `document.querySelectorAll('video').length` ≤ 1.
11. Відео ≥ 500 МБ: waveform з'являється (або з'являється `No sound to show…`), вкладка не падає. Записати у звіт розмір файлу, час малювання і пікове споживання пам'яті вкладки (Диспетчер завдань Chrome).
12. Консоль без помилок і попереджень React (dev-режим зі StrictMode).

## Критерії готовності (Definition of Done)
- [ ] `cd frontend && npm test -- --run && npm run lint && npm run typecheck && npm run build && npx prettier --check .` — зелено.
- [ ] `cd frontend && npm run e2e` — зелено, включно з 6 тестами `e2e/single-media.spec.ts` і наявним `e2e/video-fit.spec.ts`.
- [ ] `cd backend && uv run pytest && uv run ruff check . && uv run ruff format --check . && uv run mypy app` — зелено; `git diff main --stat -- backend/` порожній.
- [ ] `git diff main -- frontend/package.json frontend/package-lock.json` порожній (нових залежностей немає).
- [ ] Усі тести з розділу «Тести» наявні й проходять. `keepSingleMediaSource`, `subscribeLoadStart`, `getLoadedMedia`, `getMediaElement` (обидва адаптери), `createWaveSurferView`, `useCreateWaveformView`, `SingleMediaSource`, `VideoSoundWaveform` і утримання тривалості в `MediaSync` мають щонайменше один тест.
- [ ] Змінені наявні тести — лише зі списку «Зміни наявних тестів» і файли з доповненнями: `git diff main --name-status -- frontend/src | grep -E '\.test\.tsx?$'` показує `M` лише для `App.test.tsx`, `AudioTrackProvider.test.tsx`, `MediaSyncBridge.test.tsx`, `AudioTrack.test.tsx`, `waveSurferPlayer.test.ts`, `htmlVideoPlayer.test.ts`, `MediaTrackController.test.ts`, `MediaSync.test.ts`, `TransportProvider.test.tsx`, решта — `A`. У `App.test.tsx`, `MediaSyncBridge.test.tsx`, `MediaTrackController.test.ts`, `htmlVideoPlayer.test.ts`, `AudioTrackProvider.test.tsx`, `MediaSync.test.ts`, `TransportProvider.test.tsx` видалених рядків немає, крім рядків `vi.mock` і імпорту; в `AudioTrack.test.tsx` змінено лише `vi.mock`, `setup()` і рядки імпорту.
- [ ] Тест «keeps playing while the media file is replaced» у `TransportProvider.test.tsx` і тест заміни під час відтворення в `SingleMediaSource.test.tsx` проходять; якщо тимчасово прибрати утримання тривалості в `updateMediaDuration()`, обидва падають (перевіряється локально, у звіті одне речення).
- [ ] У `MediaSync.ts` змінено лише `updateMediaDuration()`: `git diff main -- frontend/src/media/MediaSync.ts` зачіпає тільки цей метод (і, за потреби, його коментар).
- [ ] `grep -rl "from 'wavesurfer.js'" frontend/src` → лише `frontend/src/audio/waveSurferPlayer.ts` і `frontend/src/audio/waveSurferPlayer.test.ts`.
- [ ] `grep -n "<SingleMediaSource />" frontend/src/App.tsx` знаходить рядок.
- [ ] `grep -c "ws.load(" frontend/src/audio/waveSurferPlayer.ts` → `1` (виклик лише в `createWaveSurferPlayer`, у `createWaveSurferView` його немає).
- [ ] README описує одне джерело медіа і waveform звуку відео; пункти про одночасне відтворення аудіо й відео прибрано.
- [ ] Ручна перевірка (12 пунктів і 1a, 5a) пройдена в Chrome і Firefox; дані пункту 11 записано у звіт; `git status --porcelain` не показує медіафайлів, `test-results/` чи `playwright-report/`.
- [ ] У гілці до злиття (коміт `docs: mark task 012 as done`): у CLAUDE.md `[x]` для 2.7 «Одне джерело медіа» і 2.8 «Звук відео на аудіодоріжці», решта пунктів 2.7/2.8 лишаються `[ ]`; статус 012 у розділі 8 — «виконано»; статус плану — `виконано`.
- [ ] Гілку `fix/012-single-media-source` злито в `main` (`--no-ff`) і запушено; на `main` перевірки (включно з e2e) зелені.

## Ризики / відкриті питання
- **Пам'ять на великих відео.** Для waveform WaveSurfer читає весь файл у `ArrayBuffer` і декодує звук (8 кГц). Для кліпів до кількох сотень мегабайт це прийнятно, а відео на гігабайти тимчасово займе стільки ж пам'яті. Якщо виділити пам'ять не вдасться, `decodeAudioData`/`arrayBuffer()` відхиляються, і панель покаже `No sound to show…`, а відео працюватиме. Пункт 11 ручної перевірки фіксує реальну поведінку. Якщо вкладка падає або «зависає», implementer додає ліміт розміру файлу (наприклад, `MAX_WAVEFORM_SOURCE_BYTES = 1 GiB`, перевірка `file.size` у `MediaTrackController` з окремим повідомленням) як дрібне відхилення з тестом і звітом. Інакше це окрема задача.
- **Декодування звуку з відеоконтейнера.** `decodeAudioData` у Chrome і Firefox розбирає mp4 (AAC) і webm (Opus/Vorbis). Браузер без AAC (Chromium без пропрієтарних кодеків, Firefox на Linux без системного ffmpeg) не декодує звук mp4. Тоді панель покаже `No sound to show…`, хоча відео може грати, наприклад, без звуку. Текст повідомлення прямо згадує, що браузер може не вміти декодувати звук.
- **E2E з записом `MediaRecorder`.** WebM з `MediaRecorder` не має тривалості в заголовку (обхід уже є в `htmlVideoPlayer`, 007). Якщо headless Chromium не декодує Opus із такого файлу, сценарії 1, 3 і 5 падатимуть на очікуванні малювання. Тоді implementer спершу перевіряє вручну з реальним webm (пункт 7 ручної перевірки). Якщо застосунок працює, а проблема лише в записаному тестовому файлі, можна подовжити запис (`durationMs 3000`) або подавати в `MediaStreamAudioDestinationNode` гучніший сигнал (`AudioBufferSourceNode` із заздалегідь заповненим буфером шуму замість осцилятора). Це дрібне відхилення зі звітом. Якщо обійти не вдасться, план повертається до planner.
- **Утримання тривалості й повільне завантаження.** Поки новий файл у `loading`, таймлайн тримає довжину старого медіа. Якщо новий файл коротший, після `onReady` таймлайн коротшає, і транспорт за позиції поза ним стає на паузу в кінці таймлайну. Так само після помилки завантаження. Це свідомий компроміс: грати далі за межами нового медіа означало б показувати порожній таймлайн, якого вже немає. Поведінка описана в README і перевіряється тестом «pauses at the end when the new file is shorter» та ручною перевіркою 1a.
- **Подвійний seek при кліку по waveform звуку відео.** WaveSurfer сам ставить `video.currentTime = t`, а потім `controller.seek(t)` ставить те саме значення ще раз. Це нешкідливо (однакова позиція), але у Firefox може дати дві події `seeking`/`seeked`. На синхронізацію це не впливає: `MediaSync` не реагує на зміну лише позиції (008).
- **Файл пройшов перевірку формату, але не відкрився.** Інша доріжка вже очищена, і користувач лишається без обох файлів. Відкласти очищення до `onReady` нового файлу означало б кілька секунд двох медіа водночас (поки новий файл завантажується, старий грає), а це суперечить 2.7. Прийнятий дефолт: очищати одразу. Повторно вибрати старий файл просто.
- **Відкрите питання до власника (не блокує, прийнято дефолт): відео + окремий аудіозапис.** Сценарій «відео без звуку і окремий запис музики» за вимогою 2.7 неможливий: завантаження аудіо прибирає відео. Якщо він потрібен, пропонуємо окрему задачу, наприклад «аудіо замінює звук відео» (відео приглушене, звучить і малюється аудіофайл).
- **Відкрите питання до власника (не блокує): «Remove audio» у режимі звуку відео** вимкнена, щоб кнопка аудіопанелі не прибирала відео. Якщо зручніше, щоб вона прибирала поточне джерело, це зміна в одному рядку.
- **Обсяг.** Дві нові події/методи в контролері, одна чиста функція, один компонент-міст, адаптер вигляду WaveSurfer і один компонент UI, плюс тести й e2e. Нових залежностей немає. Задача вкладається в одну гілку. Запасний поділ, якщо implementer не вкладається: **012a** — кроки 2, 5 і 6 (одне джерело медіа й утримання тривалості, галочка 2.7); **012b** — кроки 3–4 (waveform звуку відео, галочка 2.8); e2e і README ділиться відповідно.

## Зміни після рев'ю (раунд 2)
Зауваження рев'ю раунду 1 (`012-single-media-source.review.md`, 2026-09-30):

1. **Блокуюче: заміна медіа під час відтворення зупиняла транспорт і відкидала playhead назад.** Обрано варіант (б).
   - Новий підрозділ «Утримання тривалості таймлайну під час заміни файлу»: `MediaSync.updateMediaDuration()` не зменшує тривалість медіа, поки хоч одна приєднана доріжка в `loading`. Після `ready` тривалість дорівнює тривалості нового файлу, після помилки — решті готових доріжок. «Remove» без завантаження, як і раніше, скорочує таймлайн одразу. Це заодно виправляє такий самий стрибок під час заміни файлу в одній доріжці.
   - Щоб правило бачило завантаження вже в момент очищення старої доріжки, змінено порядок у `MediaTrackController.load()`: власний `releaseTrack()` і snapshot `loading` (без сповіщення) іде **до** слухачів `subscribeLoadStart`, а `createPlayer` і `notify()` — після них. Тести порядку в `MediaTrackController.test.ts` оновлено.
   - Варіант «ставити транспорт на паузу» описано як відкинутий, з причиною.
   - Тести: 6 сценаріїв у `MediaSync.test.ts`; два тести в `TransportProvider.test.tsx` (відтворення триває під час заміни; пауза в кінці, якщо новий файл коротший); інтеграційний тест у `SingleMediaSource.test.tsx` з транспортом.
   - Твердження «`MediaSync` окремо нічого не потребує» замінено. Додано новий крок реалізації 5 (кроки перенумеровано). `MediaSync.test.ts` і `TransportProvider.test.tsx` внесено в «Зміни наявних тестів» і DoD. Додано DoD про межі змін у `MediaSync.ts` і про те, що нові тести падають без виправлення. Оновлено ручну перевірку (п. 1, 5, нові 1a і 5a), README (крок 8) і «Ризики».
2. **Рекомендація: імпорти в `AudioTrack.test.tsx`.** У DoD дописано «і рядки імпорту».
3. **Рекомендація: `ref.current === null` у `VideoSoundWaveform`.** Ефект явно нічого не робить, якщо контейнера немає; фаза не змінюється.
4. **Рекомендація: seek з waveform звуку відео пересуває транспорт.** Додано тест у `SingleMediaSource.test.tsx` (дерево з `TransportProvider` і `MediaSyncBridge`): `view.emitSeek(40)` → `Playback position` `0:40.000`. E2E-сценарій 5 перевіряє те саме в браузері.
5. **Рекомендація: закритий shadow root.** Я перевірив: WaveSurfer 8 використовує `attachShadow({ mode: 'open' })`. Помічник `mediaElements` обходить усі `shadowRoot` через `querySelectorAll('*')`. Для випадку закритого shadow root описано запасну поведінку зі звітом.
6. **Рекомендація: подвійний seek.** Додано до «Ризиків».
