# 015 — Зміщення (offset) медіа відносно першого такту

**Статус:** виконано
**Гілка:** feature/015-media-offset

## Мета
Закрити пункт розділу 2.8 CLAUDE.md **«Зміщення медіа відносно нот (offset)»** (після виконання ставимо `[x]`):
- користувач задає, яка секунда відео чи аудіо збігається з початком першого такту (наприклад, 3.2 с відео = такт 1);
- зміщення задається **числом** з точністю до мілісекунди і **перетягуванням** позначки «такт 1» на waveform. Додатково є кнопка «Bar 1 here», яка ставить такт 1 у поточний кадр;
- зміщення зберігається в проекті (`Project.mediaOffset` на frontend і backend) і скасовується через undo/redo;
- зміщення враховується в синхронізації (`MediaSync`), відтворенні (`Transport`, довжина таймлайну), експорті `.mid` (такт 1 у файлі = початок першого такту) та імпорті `.mid`.

Задача реалізує правило розділу 7: «Зміщення медіа (offset) … — це відображення між часом медіафайлу і часом таймлайну; ноти завжди зберігаються в часі таймлайну. Відображення реалізується чистими функціями з unit-тестами». Відображення спроектоване так, щоб задача 016 додала до нього вирізані проміжки, не змінюючи місць, де його використовують.

Інші пункти 2.8 («Таймлайн відео над piano roll», «Вирізання проміжків», «Розріз можна поправити») лишаються `[ ]`.

### Поточний стан (перевірено в коді)
- **Модель.** `Project { bpm, timeSignature, notes, pedals }` (`frontend/src/state/types.ts`, `backend/app/models/project.py`). Backend-модель має `extra="forbid"`, тож нове поле з frontend без зміни backend дало б 422 під час експорту.
- **Синхронізація (008).** `MediaSync.syncTrack` передає в `planMediaSync` значення `target: clock.getPosition()`, тобто позиція медіа дорівнює позиції таймлайну. `onTrackSeek(seconds)` викликає `clock.seek(seconds)`. `updateMediaDuration` бере найбільшу `duration` готових доріжок, і через `MediaDurationContext` та `transport.setMediaDuration` це подовжує таймлайн. План 008 прямо передбачав, що зсув додасться однією формулою для `target`.
- **Темп (013).** `utils/tempoRescale.ts`: `FIRST_BAR_START_SECONDS = 0`, функції перерахунку приймають `origin`, а reducer передає типове значення 0.
- **Експорт (009).** `midi_export.py`: тік 0 = 0 с таймлайну. **Імпорт (017)** повертає `Project`, а `ImportButton` застосовує його через `replaceProject`.
- **Медіапанель (012, 014).** Одночасно завантажений лише один медіафайл. `AudioTrack` показує waveform аудіофайлу або звуку відео (`VideoSoundWaveform`) на всю ширину `.audio-track__stage`: WaveSurfer без `minPxPerSec` вписує весь файл у ширину. Клік по waveform, повзунок «Seek video» і кнопки ±5 с викликають `controller.seek(mediaSeconds)`, а далі через `subscribeSeek` → `MediaSync.onTrackSeek` перемотують транспорт.
- `useDragGesture` (`components/PianoRoll/useDragGesture.ts`) — один жест мишею з порогом, попереднім переглядом і скасуванням через Escape. Його вже повторно використовує `AppLayout` (014).

## Поза межами задачі
- **016:** таймлайн над piano roll, вирізані проміжки й розрізи, прибирання повзунка «Seek video» з панелі. Тут лише закладається тип `MediaTimeMap`, який 016 розширить (див. «Розширення для 016»).
- **Pre-roll (від'ємний час таймлайну).** Таймлайн, як і раніше, починається з 0 с = такт 1. Якщо offset > 0, частина медіа до такту 1 (вступ) на таймлайні не відтворюється. Її видно на waveform (затінена), і такт 1 можна пересунути в неї перетягуванням або числом. Клік по waveform у затіненій області перемотує на такт 1. Ноти до такту 1 (затакт) неможливі, як і зараз. Див. «Відкриті питання».
- **Режим «перенести ноти разом з медіа».** Зміна offset не рухає ноти й педалі: вони лишаються на своїх тактах, а під ними зсувається медіа. Див. «Відкриті питання».
- **Збереження offset у `.mid`-файлі** (meta-подія або маркер). Файл не знає про медіа; при імпорті offset береться з поточного проекту (див. «Імпорт»).
- **Точний старт медіа при від'ємному offset.** Медіа запускається на першій перевірці синхронізації після того, як таймлайн дійшов до його початку. Це запізнення до `SYNC_INTERVAL_MS` = 100 мс, яке далі виправляє наявна корекція дрейфу. Окремий таймер під момент старту не робимо.
- Кілька медіадоріжок з різними offset (у проекті одне джерело медіа, 012). Offset — властивість проекту, а не файлу: після заміни файлу він лишається тим самим.
- Нові залежності не додаються.

## Технічні рішення

### Головне рішення: такт 1 = 0 с таймлайну, offset зсуває медіа
```
timeline = media − offset        media = timeline + offset
```
- Таймлайн (ноти, педалі, сітка, лінійка, playhead, транспорт, експорт) як і раніше починається з 0 с, і 0 с — це початок першого такту. Offset — це **секунда медіафайлу, що припадає на такт 1**.
- Ноти й педалі зберігаються в часі таймлайну й від offset не залежать (розділ 7). Зміна offset пересуває медіа під нотами, а ноти лишаються на своїх тактах.
- **Взаємодія з 013.** `FIRST_BAR_START_SECONDS` лишається 0, і reducer не змінюється: перерахунок BPM іде навколо такту 1 (0 с таймлайну), а такт 1 завжди відповідає секунді `offset` медіа. Тому після зміни BPM такт 1 лишається на тому самому кадрі відео, а решта нот розтягується чи стискається від нього. `rescaleProjectTempo` копіює `mediaOffset` без змін (`...project`). У коді змінюється лише doc-коментар константи.
- **Експорт.** Тік 0 = 0 с таймлайну = такт 1, тож вимога «такт 1 у файлі = початок першого такту» виконується без зміни `midi_export.py`: offset у файл не потрапляє, і перед нотами немає тиші довжиною зі вступ медіа. Backend лише приймає нове поле.

**Відкинуті альтернативи:**

| Варіант | Чому ні |
|---|---|
| Таймлайн = час медіа, а такт 1 починається в `offset` секунд таймлайну (зсувається сітка, `origin = offset` для 013, експорт віднімає offset) | Суперечить розділу 7: там offset — відображення медіа ↔ таймлайн, а не зсув сітки. Про offset мусили б знати сітка, квантизація, лінійка, `formatBarBeat`, перерахунок BPM, експорт та імпорт. Ноти до такту 1 дали б від'ємні тіки. У 016 таймлайн і так перестане дорівнювати часу медіа, бо розрізи його стискають. Єдина перевага цього варіанта — зміна offset не рухає ноти відносно медіа (див. «Відкриті питання») |
| Offset як налаштування інтерфейсу (`localStorage`), поза `Project` | Вимога 2.8 прямо каже «зберігається в проекті», і без нього експортований/імпортований проект втрачав би вирівнювання |
| Offset поза історією undo | Offset визначає, під яким кадром звучить кожна нота, тобто це редагування аранжування, як і BPM. Помилкове перетягування має скасовуватися Ctrl+Z |

### Відображення медіа ↔ таймлайн — чисті функції `frontend/src/utils/mediaTimeMap.ts` (новий)
```ts
import type { Project } from '../state/types.ts';

/**
 * How media seconds map onto timeline seconds. Today only the offset; task 016 adds the cut
 * ranges here, and every conversion goes through the functions below.
 */
export interface MediaTimeMap {
  /** Media second at the start of bar 1 (timeline 0 s); negative: the media starts after bar 1. */
  readonly offset: number;
}

export const IDENTITY_MEDIA_TIME_MAP: MediaTimeMap = { offset: 0 };

export function mediaTimeMapOf(project: Pick<Project, 'mediaOffset'>): MediaTimeMap;
/** Timeline seconds of a media second: media − offset (may be negative: before bar 1). */
export function mediaToTimeline(mediaSeconds: number, map: MediaTimeMap): number;
/** Media seconds at a timeline second: timeline + offset (may be negative or past the end). */
export function timelineToMedia(timelineSeconds: number, map: MediaTimeMap): number;
/** Timeline second where a media of this duration ends; never below 0. */
export function mediaTimelineEnd(duration: number, map: MediaTimeMap): number;
/** True when both maps convert every time the same way. */
export function sameMediaTimeMap(a: MediaTimeMap, b: MediaTimeMap): boolean;
```
- `mediaTimelineEnd = Math.max(0, mediaToTimeline(duration, map))`.
- `sameMediaTimeMap` порівнює `offset` через `===`. 016 додасть порівняння розрізів.
- Файл лежить в `utils/`, як і `time.ts` і `tempoRescale.ts`: це музично-часова логіка (розділ 7), а не робота з плеєрами.

### Модель даних
**Frontend** (`state/types.ts`): `Project` отримує `readonly mediaOffset: number` з doc-коментарем «Media second at the start of bar 1, seconds, rounded to 1 ms; see utils/mediaTimeMap.ts». Поле обов'язкове: так TypeScript знайде кожне місце, що будує `Project`.

**Константи** (`state/constants.ts`): `MIN_MEDIA_OFFSET = -3600`, `MAX_MEDIA_OFFSET = 3600`, `MEDIA_OFFSET_STEP = 0.001`. `createEmptyProject()` додає `mediaOffset: 0`. Межа ±1 година дає запас для будь-якого реального відео і не дає ввести безглузде число (наприклад, 1e12), яке зламало б довжину таймлайну.

**Нормалізація** (`state/normalize.ts`):
```ts
/** Rounds to 1 ms and clamps to MIN/MAX_MEDIA_OFFSET; -0 becomes 0. Expects a finite number. */
export function normalizeMediaOffset(offset: number): number;
```
`Math.round(offset * 1000) / 1000`, потім clamp, потім `result === 0 ? 0 : result` (прибирає `-0`).

**Валідація** (`state/validation.ts`):
- `validateMediaOffset(offset): ValidationIssue[]`: скінченне число в межах → `[]`, інакше `{ path: 'mediaOffset', message: 'must be a number from -3600 to 3600' }`;
- `PROJECT_SHAPE` отримує `mediaOffset: 'number'`, тож відсутнє поле → `is required`;
- `parseProject` переносить поле, `validateProject` викликає `validateMediaOffset`.

Кратність 1 мс не перевіряється: число з backend проходить як є, а округлює лише reducer.

**Backend** (`app/models/project.py`):
```python
MIN_MEDIA_OFFSET: Final = -3600.0
MAX_MEDIA_OFFSET: Final = 3600.0

class Project(CamelModel):
    ...
    media_offset: float = Field(default=0.0, ge=MIN_MEDIA_OFFSET, le=MAX_MEDIA_OFFSET, allow_inf_nan=False)
```
- JSON-ім'я `mediaOffset` (наявний `alias_generator=to_camel`).
- Типове значення 0 потрібне, щоб `import_midi` (який будує `Project(...)` без цього поля) і старі JSON без поля лишалися валідними.
- `midi_export.py` і `midi_import.py` не змінюються.

**Контрактний фікстур** `backend/tests/fixtures/sample_project.json` отримує `"mediaOffset": 0`. Значення саме 0, бо на фікстурі тримаються round-trip тести експорт → імпорт (017), а імпорт повертає 0.

**CLAUDE.md, розділ 7** (крок «позначити виконаним»): модель — `Project { bpm, timeSignature, mediaOffset (с медіа = такт 1), notes[], pedals[] }`.

### Дія і reducer
- `state/actions.ts`: новий варіант `{ readonly type: 'project/setMediaOffset'; readonly offset: number }` і action creator `setMediaOffset(offset: number)`.
- `state/projectReducer.ts`:
  ```ts
  case 'project/setMediaOffset': {
    if (!Number.isFinite(action.offset)) return state;
    const mediaOffset = normalizeMediaOffset(action.offset);
    return mediaOffset === state.mediaOffset ? state : { ...state, mediaOffset };
  }
  ```
- Одна дія — один крок історії (`historyReducer` не змінюється). Та сама величина після округлення повертає той самий `state`, тож крок не додається. Ноти й педалі — ті самі масиви.
- `project/setBpm` не змінюється (див. «Взаємодія з 013»).

### Синхронізація — `frontend/src/media/MediaSync.ts`
Новий стан `private timeMap: MediaTimeMap = IDENTITY_MEDIA_TIME_MAP` і такі методи:
```ts
/** Maps media time onto the timeline; paused media moves to the new frame, playing media is corrected at once. */
setTimeMap(map: MediaTimeMap): void;
getTimeMap(): MediaTimeMap;
/** Runs `update` (e.g. setTimeMap and a clock seek) and then one sync pass, so no intermediate position reaches the media. */
batch(update: () => void): void;
```
- **`setTimeMap(map)`**: якщо `sameMediaTimeMap(map, this.timeMap)`, нічого не робить. Інакше зберігає `map`, для кожної доріжки виконує `entry.sync = afterTransportCommand(entry.sync)` (нове відображення — як нова команда транспорту: корекційний seek виконується одразу, без cooldown), потім `updateMediaDuration()` і `syncAll()`.
- **`batch(update)`**: `this.runSync(() => { update(); this.resyncRequested = true; })`. Усі `syncAll`, викликані всередині `update` (зі `setTimeMap` чи зі слухача годинника після `clock.seek`), лише ставлять прапорець. Після `update` виконується рівно один прохід з кінцевим станом. Це вже наявний механізм повторного входу `runSync`.
- **`syncTrack`**: `target: timelineToMedia(this.clock.getPosition(), this.timeMap)`. Решта без змін: `startDelay` — секунди таймлайну, а відображення лише зсуває час без масштабу, тож секунда таймлайну дорівнює секунді медіа.
- **`onTrackSeek(entry, seconds)`** (секунди медіа): `const timeline = Math.max(0, mediaToTimeline(seconds, this.timeMap))`. Захист «seek у кінець медіа, яке таймлайн уже пройшов» порівнює `this.clock.getPosition() >= timeline`. Далі:
  ```ts
  // The clock may not notify when its position does not change (Transport.seek to the same
  // paused position), but the media has already moved to `seconds`: one sync pass always follows.
  this.runSync(() => {
    this.clock.seek(timeline);
    this.resyncRequested = true;
  });
  ```
  - `Math.max(0, …)` явний, бо `SyncClock.seek` не зобов'язаний обмежувати (так поводиться `FakeSyncClock`).
  - **Чому обов'язковий прохід синхронізації (зауваження рев'ю, раунд 1).** `MediaTrackController.seek` уже поставив медіа на `seconds`. `Transport.seek` на паузі чи в стопі з тією самою позицією нічого не робить і слухачів не сповіщає (`if (target === this.snapshot.position) return;`). Зміна лише `position` доріжки синхронізацію не запускає (`onTrackChange`). Приклад: offset 3.2, транспорт на паузі в 0, клік по вступу на 1 с. Тоді `clock.seek(0)` нічого не робить, і без примусового проходу відео лишилося б на 1 с, а playhead — на такті 1. З проходом `syncTrack` бачить `target = 3.2` і повертає медіа на 3.2 с. Тобто клік у вступ до такту 1 справді перемотує на такт 1.
  - Якщо годинник сповістив (позиція змінилась), його слухач усередині `runSync` лише ставить прапорець, тож прохід один, як і раніше. Коли позиція медіа вже збігається з target (offset 0, звичайний seek), прохід нічого не робить: для паузи `|mediaTime − target| ≤ SEEK_EPSILON_SECONDS`, а для відтворення транспорт після `seek` і так перезапускається.
  - Той самий шлях покриває кнопку «−5 s» і повзунок «Seek video» у вступ.
- **`updateMediaDuration`**: `ready = Math.max(ready, mediaTimelineEnd(snapshot.duration, this.timeMap))`. `getMediaDuration()` тепер повертає **секунду таймлайну, де закінчується медіа**. Doc-коментарі `getMediaDuration`, `MediaDurationContext` і `useMediaDuration` оновлюються, а назви лишаються, щоб не чіпати `PianoRoll`, `NoteGrid`, `PedalLane` і `Transport.setMediaDuration`. Приклад: відео 30 с з offset 3.2 займає таймлайн до 26.8 с, а з offset −2 — до 32 с.

### Правила синхронізації — `frontend/src/media/mediaSyncRules.ts`
`planMediaSync` отримує нове правило **між правилом 1 (транспорт не грає) і правилом 2 (`target ≥ duration`)**:
- **Медіа ще не почалося** (`transportPlaying && target < 0`, лише при від'ємному offset) → `{ seekTo: mediaTime > SEEK_EPSILON_SECONDS ? 0 : null, play: false, pause: mediaPlaying, nudge: 1 }`, у стані `playRequested: false`. Медіа стоїть на першому кадрі й чекає. Коли `target` стає ≥ 0, наявне правило 4 перемотує медіа на `target` (якщо дрейф > 30 мс) і запускає його.
- Правило 1 для `target < 0` уже дає `clampedTarget = 0`, тобто на паузі видно перший кадр. Воно не змінюється.
- `MediaSyncInput.target` у doc-коментарі: «where the media should be: media seconds of the timeline position (may be negative: the media has not started yet; it starts on the first check after target reaches 0, up to SYNC_INTERVAL_MS late, and the drift correction catches up)».

### Транспорт і React
- **`Transport`** (`audio/Transport.ts`) грає ноти в часі таймлайну й про offset не знає. Offset впливає на нього лише через довжину таймлайну (`setMediaDuration` отримує кінець медіа на таймлайні). `EMPTY_PROJECT` отримує `mediaOffset: 0`.
- **`TransportProvider`**:
  - `const { mediaOffset } = project;` + `useEffect(() => mediaSync.setTimeMap({ offset: mediaOffset }), [mediaSync, mediaOffset])`. Проект — джерело правди, тож undo/redo, імпорт і будь-яка зміна проекту доходять до синхронізації;
  - `TransportApi` (`transportContext.ts`) отримує метод:
    ```ts
    /**
     * Applies a media offset to the synchronization at once, before the project change reaches it
     * (drag preview, "Bar 1 here"); with `seekTo` the transport seeks in the same sync pass.
     */
    applyMediaOffset(offset: number, seekTo?: number): void;
    ```
    Реалізація: `mediaSync.batch(() => { mediaSync.setTimeMap({ offset: normalizeMediaOffset(offset) }); if (seekTo !== undefined) transport.seek(seekTo); })`. Нескінченне `offset` ігнорується.
- **Чому потрібен `applyMediaOffset`, а не лише dispatch.** Проект оновлюється в React асинхронно, а `transport.seek` — синхронно. Для «Bar 1 here» послідовність «dispatch + seek(0)» спершу перемотала б медіа на старий offset, а потім (після ефекту) на новий. Відео блимнуло б двома seek-ами. `batch` робить один seek одразу в кінцеву позицію. Для перетягування той самий метод дає попередній перегляд кадру без зміни проекту (і без кроків історії).

### Імпорт `.mid`
`ImportButton` застосовує `replaceProject({ ...result.project, mediaOffset: current.mediaOffset })`, де `current = projectRef.current`. Причини:
- `.mid` не містить даних про медіа (backend повертає 0);
- медіафайл під час імпорту лишається завантаженим, а offset описує саме його;
- тік 0 імпортованого файлу = такт 1 = 0 с таймлайну. Разом з поточним offset це відновлює вирівнювання для сценарію «експорт → імпорт під те саме відео».

Undo імпорту повертає попередній проект цілком, з тим самим offset. Діалог підтвердження й `isProjectEmpty` offset не враховують: проект без нот і педалей, але з offset, як і раніше вважається порожнім. Вирівнювання при цьому не губиться, бо offset зберігається.

### Інтерфейс
Усе нове — в секції «Audio track» правої панелі, бо там завжди видно waveform поточного медіа (аудіофайлу або звуку відео, 012).

**1. `components/useShownMedia.ts` (новий хук, винесено з `AudioTrack`)**
```ts
export interface ShownMedia {
  readonly showsVideo: boolean;
  readonly state: MediaTrackSnapshot & { readonly fileName: string | null };
  readonly getCurrentTime: () => number;
}
/** The media drawn on the audio track: the audio file, or the video's sound when a video is loaded instead. */
export function useShownMedia(): ShownMedia;
```
Логіка та сама, що зараз у `AudioTrack` (`showsVideo = audio.status === 'empty' && video.status !== 'empty'`). `AudioTrack` переходить на хук без зміни поведінки (точний тип `state` implementer бере з наявних `useAudioTrackState`/`useVideoState`).

**2. `AudioTrack` — новий необов'язковий prop `overlay?: ReactNode`**, який рендериться останнім дочірнім елементом `.audio-track__stage`. Так `AudioTrack` не залежить від `ProjectProvider`/`TransportProvider`, і наявні тести `AudioTrack.test.tsx` не змінюються.

**3. `components/MediaOffsetMarker.tsx` (новий)** передається в `overlay` з `App.tsx`. Він рендериться, лише коли показане медіа в `ready` і `duration > 0`:
```tsx
<div className="media-offset-overlay" ref={overlayRef}>
  {percent !== null && (
    <>
      <div className="media-offset-overlay__before" style={{ width: `${percent}%` }} />
      <div
        role="slider"
        tabIndex={0}
        className="media-offset-overlay__marker"
        style={{ left: `${percent}%` }}
        aria-label="Bar 1 position in the media"
        aria-valuemin={0}
        aria-valuemax={duration}
        aria-valuenow={shownOffset}
        aria-valuetext={`Bar 1 at ${formatClock(shownOffset)}`}
        title="Drag to move bar 1 in the media"
        onMouseDown={...}
        onKeyDown={...}
      >
        <span className="media-offset-overlay__label">1</span>
      </div>
    </>
  )}
</div>
```
- `shownOffset = drag.preview ?? project.mediaOffset`, а `percent = markerPercent(shownOffset, duration)`. Для offset < 0 або > duration позначки немає (затінення теж), а offset видно в полі нижче.
- **Перетягування** — через `useDragGesture<number>`. Локальна точка: `{ x: clientX − rect.left, y: clientY − rect.top }` від `overlayRef.getBoundingClientRect()` у момент події.
  - `onMouseDown` (лише ліва кнопка): `preventDefault()`, `stopPropagation()`, `focusFromPointer(marker)`, `begin({ startPoint, initialPreview: null, update: (p) => offsetFromPointer(p.x, rect.width, duration), commit: (result, moved) => { if (moved && result !== null) dispatch(setMediaOffset(result)); } })`. `duration` і ширина читаються через ref, як вимагає doc-коментар `useDragGesture`;
  - попередній перегляд — лише під час жесту (рекомендація рев'ю): `update` повертає нове значення і сам викликає `api.applyMediaOffset(value)`. Під час руху кадр відео і курсор waveform показують медіа в позиції таймлайну з новим offset (на такті 1 це саме той кадр, де стоїть позначка). Після жесту синхронізація отримує значення з проекту:
    - `commit` з рухом: `api.applyMediaOffset(result)`, потім `dispatch(setMediaOffset(result))`. Ефект `TransportProvider` потім застосує те саме значення, і `setTimeMap` нічого не зробить;
    - `commit` без руху або Escape: `api.applyMediaOffset(projectOffsetRef.current)`, тобто повернути значення з проекту. Для Escape `useDragGesture` не викликає `commit`, тому додається `useEffect` на перехід `drag.preview` з `number` у `null` без commit: прапорець `committedRef` виставляє `commit`, і якщо його немає, ефект повертає offset з проекту.

    Коли жесту немає, `MediaOffsetMarker` синхронізацію не чіпає. Джерело правди — лише ефект `TransportProvider`;
  - один жест — одна дія `setMediaOffset`, тобто один крок undo. Простий клік без руху (поріг 3 px) нічого не змінює.
- **Клавіатура** (`onKeyDown` на позначці): `offsetForKey(offset, key, shiftKey, duration)`. `ArrowLeft`/`ArrowRight` = ∓/±0.01 с, з `Shift` = ∓/±0.1 с, `Home` = 0, `End` = duration; результат обмежено до `[0, duration]`. Якщо результат не `null`: `preventDefault()` і `dispatch(setMediaOffset(value))`, тобто одне натискання — один крок undo. Глобальні скорочення стрілок не обробляють (лише сфокусована сітка), а для Space `role="slider"` уже є винятком (`isActivationTarget`).
- Оверлей має `pointer-events: none`, а позначка — `pointer-events: auto`. Тому клік по waveform поза позначкою, як і раніше, перемотує. Позначка не є нащадком контейнера WaveSurfer, тож її `mousedown` до WaveSurfer не доходить.

**4. `components/MediaOffsetControls.tsx` (новий)** — у `App.tsx` одразу після `<AudioTrack overlay={<MediaOffsetMarker />} />` у секції «Audio track»:
```tsx
<div className="media-offset" role="group" aria-label="Media offset">
  <label className="media-offset__field">
    Bar 1 at{' '}
    <CommitNumberInput
      className="media-offset__input"
      label="Media offset (seconds)"
      value={mediaOffset}
      min={MIN_MEDIA_OFFSET}
      max={MAX_MEDIA_OFFSET}
      step={MEDIA_OFFSET_STEP}
      onCommit={(value) => dispatch(setMediaOffset(value))}
    />{' '}
    s
  </label>
  <button type="button" aria-label="Set bar 1 to the current media position" disabled={!ready} onClick={setHere}>
    Bar 1 here
  </button>
  <span className="media-offset__hint">{mediaOffsetDescription(mediaOffset)}</span>
</div>
```
- Поле доступне й без медіа, бо offset — дані проекту. Одне редагування (Enter або blur) — одна дія.
- `setHere`: `const offset = normalizeMediaOffset(shown.getCurrentTime()); transportApi.applyMediaOffset(offset, 0); dispatch(setMediaOffset(offset));`. Поточний кадр стає тактом 1, а playhead переходить на такт 1 без стрибка медіа. Undo скасовує лише offset (seek не входить в історію, як і будь-яке перемотування), і тоді медіа стрибає назад.
- `ready` — показане медіа (`useShownMedia`) у стані `ready`.

**5. Чисті функції UI — `frontend/src/utils/mediaOffset.ts` (новий)**
```ts
export const OFFSET_KEY_STEP_SECONDS = 0.01;
export const OFFSET_KEY_BIG_STEP_SECONDS = 0.1;
/** Left edge of the bar 1 marker in % of the waveform width; null when the offset lies outside [0, duration] or duration <= 0. */
export function markerPercent(offset: number, duration: number): number | null;
/** Offset for a pointer x inside a waveform of this width: clamp(x / width, 0, 1) * duration, rounded to 1 ms; 0 when width <= 0. */
export function offsetFromPointer(x: number, width: number, duration: number): number;
/** New offset for a key on the marker, clamped to [0, duration] and rounded to 1 ms; null for other keys. */
export function offsetForKey(offset: number, key: string, shiftKey: boolean, duration: number): number | null;
/** "Bar 1 is at the start of the media." / "Bar 1 is at 0:03.200 of the media." / "The media starts 0:01.500 after bar 1." */
export function mediaOffsetDescription(offset: number): string;
```
Округлення — через `normalizeMediaOffset`. Час форматує наявний `formatClock`.

**6. CSS (`App.css`):**
- `.media-offset-overlay { position: absolute; inset: 0; overflow: hidden; pointer-events: none; z-index: 3 }`. `overflow: hidden` обрізає половину ручки на краях, тож горизонтальної прокрутки немає (вимога 011);
- `__before { position: absolute; top: 0; bottom: 0; left: 0; background: rgb(0 0 0 / 35%) }`;
- `__marker { position: absolute; top: 0; bottom: 0; width: 12px; margin-left: -6px; cursor: ew-resize; pointer-events: auto }` і лінія 2 px по центру (`::before`) кольору нової змінної `--bar-one: #ffc94d` (відрізняється від червоного `--playhead`);
- `__label` — «1» у верхньому куті;
- `:focus-visible` — обведення, як в інших елементах;
- `.media-offset` — `display: flex; flex-wrap: wrap; align-items: center; gap: 8px; min-width: 0`;
- `.media-offset__input` — ширина 7em;
- `.media-offset__hint` — `color: var(--muted); font-size: 13px`.

### Розширення для 016 (вирізані проміжки)
- `MediaTimeMap` отримає `cuts: readonly { start: number; end: number }[]` у секундах медіа. Offset лишиться «секундою медіа (сирого файлу) на такті 1».
- `mediaToTimeline(t) = edited(t) − edited(offset)`, де `edited(x) = x − (сумарна довжина вирізаного до x)`. Точка всередині розрізу відображається на його початок. `timelineToMedia` — обернена функція (з розрізом на межі — на кінець розрізу). `mediaTimelineEnd` і `sameMediaTimeMap` розширюються там само.
- Усі місця, що переводять час, уже йдуть через ці функції: `MediaSync.syncTrack`, `onTrackSeek`, `updateMediaDuration`, а також `markerPercent` через значення offset. Тому 016 змінює лише `mediaTimeMap.ts` і додає правило стрибка через розріз у `planMediaSync`. Зараз медіа доганяє такий стрибок через корекційний seek з cooldown, а 016 має зробити його точним.
- **Розривність відображення (нотатка рев'ю для 016).** З розрізами `timelineToMedia` перестає бути неперервною: на межі розрізу час медіа стрибає вперед. Тоді:
  - `planMediaSync` потрібне окреме правило стрибка;
  - твердження «секунда таймлайну = секунда медіа», на яке зараз спираються `startDelay` і `seekLead` (обидва додаються до target у секундах медіа), справджується лише в межах одного сегмента між розрізами. 016 має обмежувати `target + seekLead` кінцем поточного сегмента і скидати `seekLead`/cooldown на стрибку.

  015 цього не потребує, бо зсув неперервний.
- Таймлайн над piano roll (016) зможе показувати позначку такту 1 й затінений вступ у масштабі piano roll. Для цього знадобляться `markerPercent`/`mediaToTimeline`.

## Кроки реалізації
1. Від актуального `main` створити гілку `feature/015-media-offset`.
2. **Backend.** `app/models/project.py`: `MIN_MEDIA_OFFSET`, `MAX_MEDIA_OFFSET`, поле `media_offset`. `tests/fixtures/sample_project.json`: `"mediaOffset": 0`. Тести з розділу «Тести → Backend». `uv run pytest`, ruff, mypy. Коміт `feat: store the media offset in the project model`.
3. **Модель frontend.** `types.ts` (`mediaOffset`), `constants.ts` (межі, крок, `createEmptyProject`), `normalize.ts` (`normalizeMediaOffset`), `validation.ts` (`validateMediaOffset`, `PROJECT_SHAPE`, `parseProject`, `validateProject`), `Transport.ts` (`EMPTY_PROJECT`). У кожному тестовому фікстурі, де `tsc` вимагає нове поле, додати рядок `mediaOffset: 0` без інших змін. Орієнтовний список: `TransportProvider.test.tsx`, `ProjectProvider.test.tsx`, `SelectionSync.test.tsx`, `projectReducer.test.ts`, `validation.test.ts`, `TransportControls.test.tsx`, `PianoRoll/testUtils.tsx`, `NoteGrid.selection.test.tsx`, `NoteGrid.test.tsx`, `PedalLane.test.tsx`, `ImportButton.test.tsx`, `ProjectInfo.test.tsx`, `TempoControls.test.tsx`, `ExportButton.test.tsx`, `api/client.test.ts`, `api/importResult.test.ts`, `audio/Transport.test.ts`, `utils/midiImport.test.ts`, `utils/tempoRescale.test.ts`. Точний список дасть `npm run typecheck`. Нові тести для нормалізації й валідації. Коміт `feat: add the media offset to the frontend project model`.
4. **Дія.** `actions.ts` (`project/setMediaOffset`, `setMediaOffset`), `projectReducer.ts`. У `tempoRescale.ts` оновити doc-коментар `FIRST_BAR_START_SECONDS`: «Timeline seconds of the start of the first bar. Bar 1 is always at 0 s of the timeline; the media offset (utils/mediaTimeMap.ts) maps media time onto the timeline and does not move bar 1.» Тести reducer, history, tempoRescale. Коміт `feat: set the media offset as one undoable action`.
5. **Відображення.** `utils/mediaTimeMap.ts` + `mediaTimeMap.test.ts`. Коміт `feat: add pure functions that map media time onto the timeline`.
6. **Синхронізація.** Зміни:
   - `mediaSyncRules.ts`: правило «медіа ще не почалося»;
   - `MediaSync.ts`: `timeMap`, `setTimeMap`, `getTimeMap`, `batch`, `syncTrack`, `onTrackSeek` з обов'язковим проходом синхронізації, `updateMediaDuration`;
   - doc-коментар `timelineContext.ts`;
   - `media/testing/FakeSyncClock.ts`: опція `notifyUnchangedSeek`.

   Тести. Коміт `feat: keep the media in sync with bar 1 at its offset`.
7. **Транспорт у React.** `transportContext.ts` (`applyMediaOffset`), `TransportProvider.tsx` (ефект `setTimeMap`, реалізація `applyMediaOffset`). Тести. Коміт `feat: apply the project media offset to the synchronization`.
8. **Імпорт.** `ImportButton.tsx`: імпортований проект отримує поточний `mediaOffset`. Тест. Коміт `feat: keep the media offset when a MIDI file is imported`.
9. **UI.** `utils/mediaOffset.ts` + тести; `useShownMedia.ts` і перехід `AudioTrack` на нього; prop `overlay` в `AudioTrack`; `MediaOffsetMarker.tsx`, `MediaOffsetControls.tsx`; `App.tsx`; CSS. Тести компонентів. Коміт `feat: set bar 1 in the media by number, button or drag`.
10. **E2E.** `frontend/e2e/media-offset.spec.ts`. Коміт `test: check the media offset in the browser`.
11. **README.** Новий підрозділ «Зміщення медіа (такт 1)» у розділі про синхронізацію:
    - що таке offset (секунда медіа на такті 1);
    - три способи його задати (поле «Bar 1 at … s», кнопка «Bar 1 here», перетягування жовтої позначки на waveform, стрілки на позначці);
    - від'ємне значення: медіа починається пізніше за такт 1 і до того стоїть на першому кадрі; стартує із запізненням до ~0.1 с, яке потім вирівнюється;
    - вступ до такту 1 затінено й не відтворюється;
    - зміна offset не рухає ноти;
    - offset — крок undo, зберігається в проекті, при імпорті `.mid` лишається поточним;
    - в експорті такт 1 = початок файлу.

    У розділі про синхронізацію замінити речення «медіа починається в 0 с таймлайну». Коміт `docs: describe the media offset`.
12. Усі перевірки з DoD і ручна перевірка в браузері.
13. У гілці до злиття:
    - у CLAUDE.md `[x]` для 2.8 «Зміщення медіа відносно нот (offset)»;
    - у розділі 7 модель `Project { bpm, timeSignature, mediaOffset, notes[], pedals[] }` з поясненням «mediaOffset — секунда медіа, що припадає на такт 1»;
    - статус 015 у розділі 8 — «виконано»;
    - статус плану — `виконано`.

    Коміт `docs: mark task 015 as done`.
14. `git checkout main && git merge --no-ff feature/015-media-offset`, повторні перевірки на `main` (включно з e2e), `git push origin main` і гілки.

## Тести

### Backend
`tests/test_project_models.py` (доповнення):
- `Project.model_validate({... без mediaOffset})` → `media_offset == 0.0`;
- `{"mediaOffset": 3.2}` → `3.2`, `model_dump(by_alias=True, mode="json")["mediaOffset"] == 3.2`;
- `-3600` і `3600` приймаються; `3600.5`, `-3600.5`, `float("nan")`, `float("inf")` → `ValidationError`;
- `{"media_offset": 1}` (ім'я поля) приймається (`populate_by_name`);
- наявний round-trip фікстуру проходить із `"mediaOffset": 0`.

`tests/test_midi_export.py` (доповнення): `test_media_offset_does_not_change_the_file`. Для фікстуру з `media_offset=3.2` і `media_offset=-1.5` `export_midi(...)` байт у байт дорівнює `export_midi(sample_project())`. Тобто такт 1 = тік 0 незалежно від offset.

`tests/test_export_api.py` (доповнення): `POST /api/export/midi` з фікстуром і `"mediaOffset": 3.2` → 200, тіло дорівнює відповіді для фікстуру з 0. `"mediaOffset": 5000` → 422.

`tests/test_import_api.py`: наявний `body["project"] == fixture_json()` тепер перевіряє і `"mediaOffset": 0` (фікстур оновлено, тест не змінюється). Новий `test_import_returns_zero_media_offset`: `body["project"]["mediaOffset"] == 0`.

### Frontend — чисті функції
`utils/mediaTimeMap.test.ts` (новий):
- `mediaToTimeline(5, { offset: 3.2 })` ≈ 1.8 (`toBeCloseTo(x, 9)`); `mediaToTimeline(3.2, { offset: 3.2 }) === 0`; `mediaToTimeline(1, { offset: 3.2 })` ≈ −2.2; `mediaToTimeline(0, { offset: -1.5 }) === 1.5`;
- `timelineToMedia(0, { offset: 3.2 }) === 3.2`; `timelineToMedia(1, { offset: -1.5 }) === -0.5`; для `IDENTITY_MEDIA_TIME_MAP` обидві функції повертають вхід;
- туди й назад: для `t ∈ {0, 0.001, 1.5, 100}` і `offset ∈ {-2.5, 0, 3.2}` → `mediaToTimeline(timelineToMedia(t, m), m) ≈ t`;
- `mediaTimelineEnd(30, { offset: 3.2 })` ≈ 26.8; `(30, { offset: -2 }) === 32`; `(2, { offset: 5 }) === 0`; `(30, IDENTITY) === 30`;
- `sameMediaTimeMap({ offset: 1 }, { offset: 1 }) === true`, `({ offset: 1 }, { offset: 1.001 }) === false`;
- `mediaTimeMapOf({ mediaOffset: 1.25 })` → `{ offset: 1.25 }`.

`state/normalize.test.ts` (доповнення) — `normalizeMediaOffset`:
- `3.2004` → `3.2`; `3.2006` → `3.201`; `-1.5` → `-1.5`;
- `-0.0004` → `0` і `Object.is(result, 0)`;
- `5000` → `3600`; `-5000` → `-3600`.

`state/validation.test.ts` (доповнення):
- `validateMediaOffset(0)`, `(-3600)`, `(3600)` → `[]`; `(NaN)`, `(Infinity)`, `(3600.5)` → одна помилка з `path: 'mediaOffset'`;
- `parseProject` для об'єкта без `mediaOffset` → `ProjectParseError` з `{ path: 'mediaOffset', message: 'is required' }`; з `mediaOffset: '3'` → помилка типу; з `mediaOffset: 4000` → помилка діапазону;
- наявний тест фікстуру `sample_project.json` проходить (фікстур має поле).

`utils/mediaOffset.test.ts` (новий):
- `markerPercent(3, 30) === 10`; `(0, 30) === 0`; `(30, 30) === 100`; `(-1, 30) === null`; `(31, 30) === null`; `(1, 0) === null`;
- `offsetFromPointer(150, 300, 30) === 15`; `(-10, 300, 30) === 0`; `(400, 300, 30) === 30`; `(100, 300, 10)` → `3.333` (округлено до мс); `(10, 0, 30) === 0`;
- `offsetForKey(3.2, 'ArrowRight', false, 30)` → `3.21`; `('ArrowLeft', true)` → `3.1`; `(0.005, 'ArrowLeft', false, 30)` → `0`; `(29.995, 'ArrowRight', false, 30)` → `30`; `'Home'` → `0`; `'End'` → `30`; `'a'` → `null`;
- `mediaOffsetDescription(0)` → `'Bar 1 is at the start of the media.'`; `(3.2)` → `'Bar 1 is at 0:03.200 of the media.'`; `(-1.5)` → `'The media starts 0:01.500 after bar 1.'`.

`media/mediaSyncRules.test.ts` (доповнення; база `I`, `S` з наявного тесту):
- `planMediaSync({ ...I, target: -0.5, mediaTime: 0, mediaPlaying: false }, S)` → `action = { seekTo: null, play: false, pause: false, nudge: 1 }`, `state.playRequested === false`;
- `({ ...I, target: -0.5, mediaTime: 0.3, mediaPlaying: true }, S)` → `{ seekTo: 0, play: false, pause: true, nudge: 1 }`;
- `({ ...I, target: -0.5, mediaTime: 0, mediaPlaying: false }, { ...S, playRequested: true })` → `state.playRequested === false`, `play: false`;
- `({ ...I, target: 0.07, mediaTime: 0, mediaPlaying: false }, S)` → `{ seekTo: 0.07, play: true }` (старт після очікування, наявне правило 4);
- `({ ...I, transportPlaying: false, target: -0.5, mediaTime: 0.3, mediaPlaying: false }, S)` → `seekTo: 0` (правило 1, регресія).

### Frontend — стан
`state/projectReducer.test.ts` (доповнення, `describe('project/setMediaOffset')`):
- `setMediaOffset(3.2)` → `mediaOffset === 3.2`, `notes` і `pedals` — ті самі масиви (`toBe`), `bpm` той самий;
- `setMediaOffset(3.2004)` → `3.2`; `setMediaOffset(10000)` → `3600`; `setMediaOffset(-2)` → `-2`;
- `setMediaOffset(NaN)`, `(Infinity)`, `(0)` на стані з 0 → той самий `state` (`toBe`); стан з 3.2 і `setMediaOffset(3.2001)` → той самий `state`;
- стан з `mediaOffset: 3.2` + `setBpm(60)` → `mediaOffset === 3.2`, `n3.start === 2` (перерахунок навколо 0 с, а не навколо offset).

`state/history.test.ts` (доповнення): «records a media offset change as one undo step». `setMediaOffset(3.2)` → `past.length + 1`. `undo()` → `present.mediaOffset === 0`, об'єкт той самий, що до зміни (`toBe`). `redo()` → `3.2`.

`utils/tempoRescale.test.ts` (доповнення): `rescaleProjectTempo({ ...project, mediaOffset: 3.2 }, 60).mediaOffset === 3.2`.

### Frontend — синхронізація
`media/MediaSync.test.ts` (доповнення; `setup()`, `readyTrack()`, `setTimes()` з наявного файлу):
- **Пауза з offset.** `sync.setTimeMap({ offset: 2 })`, `attach` готової доріжки 30 с, годинник `stopped` у 0 → `setTimes(player)` закінчується на `'setTime:2'`. `clock.set({ position: 5 })` → `'setTime:7'`.
- **Зміна відображення.** Доріжку приєднано, годинник на паузі в 5, медіа в 5. `sync.setTimeMap({ offset: 1.5 })` → `'setTime:6.5'`. Повторний `setTimeMap({ offset: 1.5 })` → нових викликів немає. `getTimeMap()` → `{ offset: 1.5 }`.
- **Корекція під час відтворення одразу.** Годинник `playing` у 5, медіа грає в 5, `env.clockNow` одразу після корекційного seek (cooldown ще активний, `seekLead` 0). `setTimeMap({ offset: 3 })` → одразу `'setTime:8'`, без очікування кінця cooldown (бо `afterTransportCommand` скидає `lastSeekAt`).
- **Тривалість на таймлайні.** Доріжка 30 с: `offset 2` → `getMediaDuration() === 28`; `offset -3` → `33`; `offset 40` → `0`. Слухач `subscribe` викликається при кожній зміні й не викликається при однаковому значенні.
- **Seek користувачем.** `offset 2`: `controller.seek(10)` → `clock.seeks` закінчується на `8`; `controller.seek(1)` → на `0` (не `-1`).
- **Seek у вступ, коли годинник уже на такті 1 (регресія зауваження рев'ю).** `FakeSyncClock` отримує необов'язковий параметр конструктора `{ notifyUnchangedSeek?: boolean }` (типово `true`, тож наявні тести не змінюються). Коли він `false`, `seek` до тієї самої позиції за статусу не `playing` записується в `seeks`, але слухачів не сповіщає, як `Transport.seek`. Тест створює годинник з `false` (`setup` отримує необов'язковий параметр для годинника). `offset 2`, доріжка 30 с, годинник `paused` **у 0**, медіа в 2. `player.calls.length = 0`, `controller.seek(1)` → `clock.seeks` закінчується на `0`, останній `setTime` плеєра — `'setTime:2'` (перший — `'setTime:1'` від самого seek). Те саме для годинника `stopped` у 0 і `controller.seek(0)` (кнопка «−5 s» на початку) → останній `setTime` — `'setTime:2'`.
- **Прохід без зайвих дій.** `offset 0`, годинник на паузі в 0, `controller.seek(5)` → `clock.seeks` закінчується на `5`, після `'setTime:5'` немає інших `setTime` (прохід бачить узгоджений стан).
- **Захист кінця з offset.** `offset 2`, доріжка 30 с, годинник у 40: seek медіа в 30 (кінець) → `clock.seeks` не змінюється. Годинник у 20: seek медіа в 30 → `clock.seeks` закінчується на `28`.
- **Від'ємний offset.** `offset -2`, годинник `playing` у 1 → жодного `'play'` у `player.calls`, медіа в 0. `clock.position = 2.1`, `fireTimer()` → `'setTime:0.1'`, потім `'play'`.
- **`batch`.** Годинник на паузі в 5, `offset 0`, медіа в 5, `player.calls.length = 0`. `sync.batch(() => { sync.setTimeMap({ offset: 3 }); clock.seek(0); })` → `setTimes(player)` дорівнює `['setTime:3']` (жодного проміжного `setTime:8` чи `setTime:0`).

`state/TransportProvider.test.tsx` (доповнення в `describe('TransportProvider media synchronization')`; до `MediaProbe` додаються кнопки `offset2` → `dispatch(setMediaOffset(2))` і `apply3` → `api.applyMediaOffset(3, 0)`; `setupMedia` отримує необов'язковий `initialProject`):
- «applies the project media offset to the media»: `attach`, `loadReady(30)`, `click('offset2')` → `player.calls` містить `'setTime:2'`; `media duration` → `'28'`.
- «applies an offset and a seek in one pass»: `attach`, `loadReady(30)`, `click('offset2')`, `player.calls.length = 0`, `click('apply3')` → `player.calls.filter(setTime)` дорівнює `['setTime:3']`, `readState().position === 0`.
- «extends the timeline for a negative offset»: `ProjectProvider initialProject={{ ...createEmptyProject(), mediaOffset: -40 }}`, `attach`, `loadReady(30)` → `media duration` `'70'`. Play, `engine.time = 64.06`, `tick` → транспорт ще грає (раніше автопауза була б у 60).

### Frontend — компоненти
`components/MediaOffsetControls.test.tsx` (новий). Обгортка: `ProjectProvider > EditorProvider > TransportProvider (fake engine) > AudioTrackProvider (fakes, як в AudioTrack.test) > VideoProvider (fakes) > MediaSyncBridge`, а також `AudioTrack overlay={<MediaOffsetMarker />}`, `MediaOffsetControls` і проба, що виводить `mediaOffset` проекту й `useTransportState().position`, + кнопки Undo/Redo з `useHistoryApi()` (історію дає `ProjectProvider`).
- Без медіа: поле `Media offset (seconds)` показує `0`, кнопка «Set bar 1 to the current media position» вимкнена, підказка `Bar 1 is at the start of the media.`, слайдера `Bar 1 position in the media` немає.
- Ввести `3.2` + Enter → проба `3.2`, підказка `Bar 1 is at 0:03.200 of the media.`. Undo → `0`; Redo → `3.2`. Ввести `-1.5` + blur → `-1.5`, підказка `The media starts 0:01.500 after bar 1.`
- Завантажити аудіо (fake, 30 с) → кнопка активна; `player.currentTime = 4.5678`; клік «Bar 1 here» → проба `4.568`, позиція транспорту в пробі `0`, а виклики `setTime` плеєра після кліку — лише `setTime:4.568` (без стрибка на 0).
- Слайдер: після `ready` з offset 3 → `role="slider"` з `aria-valuenow="3"`, `aria-valuetext="Bar 1 at 0:03.000"`, `style.left === '10%'`. Затінення має `width: 10%`. `ArrowRight` → проба `3.01`; `Shift+ArrowLeft` → `2.91`; `Home` → `0`; дві дії Undo повертають `3`.
- Перетягування: `getBoundingClientRect` оверлею замокано (`left 0, width 300`). `mouseDown` на слайдері (`clientX 30`), `mouseMove` на `window` до `clientX 150` → проба ще `3`, а плеєр отримав `setTime:15` (попередній перегляд). `mouseUp` → проба `15`. Один Undo → `3`.
- Скасування: той самий жест, але `keyDown Escape` замість `mouseUp` → проба `3`, а останній `setTime` плеєра — `setTime:3` (медіа повернулось).
- Клік (без руху, `mouseDown` + `mouseUp` у тій самій точці) → проба не змінилась, кроку історії немає.
- Offset `-2` → слайдера й затінення немає.
- **Клік по вступу при транспорті на такті 1 (зауваження рев'ю).** Аудіо (fake, 30 с) `ready`, offset `1` (через поле), позиція транспорту `0`, медіа стоїть в 1. `player.calls.length = 0`. Клік по waveform у затіненій області — подія плеєра `act(() => player.emitSeek(0.4))` (так фейк відтворює `interaction` WaveSurfer). Очікування: позиція транспорту в пробі `0`, останній `setTime` плеєра — `'setTime:1'` (медіа повернулося на такт 1, а не лишилось на 0.4).

`components/AudioTrack.test.tsx` (доповнення, наявні тести не змінюються): `overlay={<div data-testid="overlay" />}` рендериться всередині `.audio-track__stage`.

`components/useShownMedia.test.tsx` (новий, короткий): без медіа `showsVideo === false`; після завантаження відео (fake) `showsVideo === true`, `state.duration` відео; після завантаження аудіо — стан аудіо.

`components/ImportButton.test.tsx` (доповнення): проект з `mediaOffset: 2.5` і однією нотою, імпорт (backend повертає проект з `mediaOffset: 0`), підтвердження → `mediaOffset` проекту `2.5`, ноти — з файлу. Undo → попередній проект.

`components/ExportButton.test.tsx` (доповнення): проект з `mediaOffset: 1.25` → тіло запиту містить `"mediaOffset":1.25`.

`App.test.tsx` (доповнення): у регіоні «Audio track» є група `Media offset` з полем `Media offset (seconds)` і кнопкою «Set bar 1 to the current media position».

### E2E — `frontend/e2e/media-offset.spec.ts` (новий, Playwright)
Помічники з `e2e/media.ts` (`recordTestVideo`, `loadVideo`) і `e2e/helpers.ts`. `field = page.getByLabel('Media offset (seconds)')`, `videoTime = () => video.evaluate((v: HTMLVideoElement) => v.currentTime)`.
1. **Число зсуває відео під такт 1.** Відео 2 с без звуку. `field.fill('1')`, Enter → `expect.poll(videoTime)` ≈ 1 (±0.05). `Playback position` відповідає `/^0:00\.000/`. Кнопка «Undo» у регіоні «Piano roll» → ≈ 0, поле `0`. «Redo» → ≈ 1.
2. **Bar 1 here.** Відео 2 с зі звуком, клік по waveform (`video-waveform`) на 60 % ширини → `videoTime()` = m (> 1). Клік «Set bar 1 to the current media position» → значення поля ≈ m (±0.002), `Playback position` `/^0:00\.000/`, `videoTime()` ≈ m (±0.02).
3. **Перетягування позначки.** Відео 2 с зі звуком, waveform намальовано. Слайдер «Bar 1 position in the media» біля лівого краю. Перетягнути його (`dragBetween`) до 50 % ширини `.audio-track__stage` → поле ≈ 1 (±0.05), `videoTime()` ≈ 1 (±0.05), на waveform видно затінення (`.media-offset-overlay__before` ширина > 0). Одне «Undo» → поле `0`.
4. **Від'ємний offset тримає медіа до його старту.** Відео 2 с. Поле `-3` + Enter (запас 3 с навіть для повільного CI, рекомендація рев'ю). Play (очікування «Pause» до 20 с, як у `single-media.spec.ts`). Далі одним `page.evaluate` зчитати разом `video.paused`, `video.currentTime` і текст `Playback position`. Якщо позиція таймлайну < 2.5 с, то `paused === true` і `currentTime === 0`. Для надійності перевірка крутиться в `expect.poll`, доки не отримано хоча б один такий знімок. Потім `expect.poll(() => video.paused)` стає `false` за 8 с, і в цей момент позиція таймлайну ≥ 3 с. Pause.
5. **Клік по вступу повертає медіа на такт 1 (зауваження рев'ю).** Відео 2 с зі звуком, waveform намальовано. Поле `1` + Enter → `videoTime()` ≈ 1, `Playback position` `/^0:00\.000/`. Клік по `video-waveform` на 20 % ширини (≈ 0.4 с, у затіненій області) → `expect.poll(videoTime)` ≈ 1 (±0.05), `Playback position` і далі `/^0:00\.000/`.

### Ручна перевірка в браузері
`cd backend && uv run uvicorn app.main:app`, `cd frontend && npm run dev`, http://localhost:5173.
1. Завантажити відео з музикою, що починається не з нуля. Знайти перший сильний такт (клік по waveform, Play/Pause), натиснути «Bar 1 here» → playhead на такті 1, кадр не змінився, поле показує секунду, на waveform жовта позначка «1», а вступ затінено.
2. Play → ноти, поставлені на такті 1, звучать на цьому кадрі; сітка тактів збігається з долями музики (після підбору BPM).
3. Перетягнути позначку → під час руху відео показує кадр під позначкою; після відпускання поле оновилось. Ctrl+Z (фокус поза полем) повертає попереднє значення одним кроком.
4. Offset `3.2`, Stop (playhead на такті 1). Клік по затіненому вступу на waveform, потім «−5 s» і повзунок «Seek video» у вступ → щоразу відео повертається на кадр 3.2 с, а playhead лишається на такті 1.
5. Ввести `3.2` і Enter, потім `-1.5` → при Play медіа стоїть на першому кадрі 1.5 с і лише потім запускається; таймлайн довший на 1.5 с.
5. Змінити BPM → ноти на такті 1 лишаються на тому самому кадрі, решта розтягується від нього.
6. Експорт `.mid` → у сторонній програмі (MuseScore/DAW) перша нота такту 1 на початку такту 1, без тиші довжиною зі вступ відео.
7. Імпорт `.mid` при завантаженому відео й offset 3.2 → offset лишається 3.2, імпортовані ноти від такту 1 звучать з 3.2 с відео.
8. Замінити відео на аудіо (012) → offset лишається, позначка на waveform аудіо в тій самій секунді.
9. Клавіатура: Tab до позначки, ←/→ і Shift+←/→ змінюють offset, Space не запускає відтворення на позначці.
10. Змінити ширину панелі (014) → позначка лишається на тій самій секунді waveform; горизонтальної прокрутки немає.
11. Консоль без помилок і попереджень React.

## Критерії готовності (Definition of Done)
- [ ] `cd backend && uv run pytest && uv run ruff check . && uv run ruff format --check . && uv run mypy app` — зелено; `git diff main --stat -- backend/app/services` порожній (експорт та імпорт не змінювались).
- [ ] `cd frontend && npm test -- --run && npm run lint && npm run typecheck && npm run build && npx prettier --check .` — зелено.
- [ ] `cd frontend && npm run e2e` — зелено, включно з 5 тестами `e2e/media-offset.spec.ts`.
- [ ] `git diff main -- frontend/package.json frontend/package-lock.json backend/pyproject.toml` порожній.
- [ ] Усі тести з розділу «Тести» наявні й проходять; `mediaToTimeline`, `timelineToMedia`, `mediaTimelineEnd`, `sameMediaTimeMap`, `mediaTimeMapOf`, `normalizeMediaOffset`, `validateMediaOffset`, `markerPercent`, `offsetFromPointer`, `offsetForKey`, `mediaOffsetDescription` мають unit-тести.
- [ ] Наявні тести не послаблено: `git diff main --numstat -- 'frontend/src/**/*.test.ts' 'frontend/src/**/*.test.tsx' frontend/src/components/PianoRoll/testUtils.tsx backend/tests` показує для змінених наявних файлів лише додані рядки (другий стовпчик — 0), крім рядків імпорту.
- [ ] `grep -n "timelineToMedia" frontend/src/media/MediaSync.ts` і `grep -n "mediaToTimeline" frontend/src/media/MediaSync.ts` знаходять використання; `grep -n "FIRST_BAR_START_SECONDS = 0" frontend/src/utils/tempoRescale.ts` знаходить незмінну константу. Тест «Seek у вступ, коли годинник уже на такті 1» проходить, а без примусового проходу в `onTrackSeek` падає: implementer перевіряє це вручну, тимчасово прибравши рядок `resyncRequested = true`, і згадує результат у звіті.
- [ ] `git diff main --stat -- frontend/src/state/history.ts frontend/src/audio/scheduler.ts frontend/src/audio/playbackEvents.ts` порожній.
- [ ] README описує offset (три способи, від'ємне значення, затінений вступ, undo, імпорт, експорт).
- [ ] Ручна перевірка (12 пунктів) пройдена; `git status --porcelain` не показує медіафайлів, `test-results/` чи `playwright-report/`.
- [ ] У гілці до злиття: у CLAUDE.md `[x]` для 2.8 «Зміщення медіа відносно нот (offset)», модель `Project` у розділі 7 з `mediaOffset`, статус 015 у розділі 8 — «виконано», статус плану — `виконано`.
- [ ] Гілку `feature/015-media-offset` злито в `main` (`--no-ff`) і запушено; на `main` перевірки (включно з e2e) зелені.

## Ризики / відкриті питання
- **Відкрите питання до власника (не блокує, прийнято дефолт): зміна offset не рухає ноти.** Прийнято: ноти тримаються тактів, а медіа ковзає під ними (розділ 7: ноти в часі таймлайну). Типовий порядок роботи — спершу вирівняти такт 1, потім писати ноти. Якщо ноти вже записані на слух при offset 0, а потім такт 1 переносять на 3.2 с, ноти зсунуться відносно відео на 3.2 с. Помилку скасовує undo. Можливе майбутнє рішення — перемикач «Move notes with the media» (зсув усіх нот і педалей на −Δoffset однією дією).
- **Відкрите питання до власника (не блокує): pre-roll.** Вступ медіа до такту 1 не відтворюється, а клік у затінену область перемотує на такт 1. Позначку можна перетягнути у вступ, і тоді під час руху видно відповідний кадр. Якщо треба слухати вступ разом з нотами, потрібен від'ємний час таймлайну (зміни транспорту, лінійки, playhead, формату позиції). Пропонуємо розглянути разом з 016, де над piano roll з'явиться таймлайн медіа.
- **Імпорт зберігає поточний offset.** Це відхилення від передбачення в плані 017 («імпорт має задавати offset = 0»). Обґрунтування — у «Технічні рішення → Імпорт»: файл не знає про медіа, а медіа лишається завантаженим.
- **Запізнення старту при від'ємному offset** до 100 мс (період перевірки) плюс затримка `play()`. Далі наявна корекція (seek з `seekLead`, nudge) зводить дрейф до < 30 мс приблизно за секунду. Для вступу, що починається з тиші, це непомітно. Точний старт — див. «Поза межами».
- **Багато частих seek-ів під час перетягування** (кожен `mousemove` → `setTimeMap` → `syncTo`). Браузери скасовують незавершений seek новим, тож відео показує останній кадр із затримкою декодування. Під час відтворення кожен `setTimeMap` ще й скидає cooldown (`afterTransportCommand`), тож на кожен рух припадає жорсткий seek граючого медіа. Якщо на важких H.264 чи під час відтворення в ручній перевірці (пункт 3) буде помітне заїкання, implementer обмежує частоту попереднього перегляду до одного разу на `requestAnimationFrame`. Це дрібне відхилення, його треба описати у звіті. Поки не робимо, бо жест короткий.
- **`-0` і похибка float.** `normalizeMediaOffset` округлює до 1 мс і прибирає `-0`, тож поле ніколи не показує `-0` чи `3.2000000000000006`. `mediaToTimeline(timelineToMedia(t))` може відрізнятися від `t` на ~1e-15 с; синхронізація має допуск 5 мс.
- **Узгодження з 016.** Див. «Розширення для 016». Ризик — чи зберігати offset у сирих секундах медіа, коли розріз проходить через такт 1. Рекомендація для 016: offset усередині розрізу переноситься на кінець розрізу.
- **Обсяг.** Модель (frontend + backend), одна дія, чисті функції відображення, зміни `MediaSync` у кількох місцях, два нових компоненти, e2e і README. Це більше за 013, але все стосується однієї вимоги й не має сенсу окремо: offset без UI не можна задати, а UI без синхронізації нічого не робить. Вкладається в одну гілку; рев'ю (раунд 1) підтвердило, що ділити не треба.

## Зміни після рев'ю (раунд 2)
Відповідь на вердикт раунду 1 (`015-media-offset.review.md`).

**Блокуюче 1 — seek медіа у вступ, коли транспорт уже на такті 1.**
- «Технічні рішення → Синхронізація», `onTrackSeek`: виклик `clock.seek(timeline)` тепер обгорнуто в `this.runSync(() => { this.clock.seek(timeline); this.resyncRequested = true; })`. Це той самий механізм, що й у `batch`. Прохід синхронізації виконується завжди, навіть коли `Transport.seek` не сповістив (та сама позиція на паузі). Якщо годинник сповістив, прохід лишається один. Описано, чому інакше медіа лишалося на кадрі вступу, і що той самий шлях покриває «−5 s» та «Seek video».
- `FakeSyncClock` отримує опцію `notifyUnchangedSeek` (типово `true`), щоб у тесті відтворити поведінку `Transport.seek`. Це додано в крок 6.
- `MediaSync.test.ts`, нові тести:
  - offset 2, годинник на паузі **в 0**, `controller.seek(1)` → `clock.seeks` закінчується на 0, останній `setTime` — `'setTime:2'`;
  - той самий сценарій для `stopped` і `controller.seek(0)` («−5 s»);
  - контрольний тест, що з offset 0 зайвих `setTime` немає.
- `MediaOffsetControls.test.tsx`: offset 1, позиція 0, `player.emitSeek(0.4)` (клік по затіненому вступу) → останній `setTime:1`, позиція транспорту 0.
- E2E, новий сценарій 5: offset 1, клік по waveform на 20 % → `videoTime()` ≈ 1, `Playback position` `0:00.000`.
- Ручна перевірка, новий пункт 4: клік по вступу, «−5 s» і «Seek video» при playhead на такті 1.
- У DoD додано перевірку, що тест падає без примусового проходу.

**Рекомендації:**
- **E2E-тест 4 (від'ємний offset):** offset −3 замість −1. Стан «медіа на паузі в 0» перевіряється через `expect.poll` на узгодженому знімку (`paused`, `currentTime` і позиція таймлайну < 2.5 с), а не одразу після появи Pause.
- **Попередній перегляд під час відтворення:** ризик доповнено (скидання cooldown → жорсткий seek на кожен рух). Задано запасний варіант — обмеження через `requestAnimationFrame`, якщо ручна перевірка покаже заїкання.
- **Ефект попереднього перегляду в `MediaOffsetMarker`:** прибрано. `applyMediaOffset` викликається лише під час жесту (у `update`) і в його кінці: `commit` застосовує нове значення, а Escape чи клік без руху повертають значення з проекту (через `committedRef`). Коли жесту немає, синхронізацією керує лише ефект `TransportProvider`.
- **Запізнення старту при від'ємному offset:** згадано в doc-коментарі `MediaSyncInput.target` і в README (крок 11).

**Питання оркестратора:**
- **Обсяг:** задачу не ділимо, варіант 015a/015b з плану прибрано.
- **Нотатка для 016:** у «Розширення для 016» додано пункт про розривність `timelineToMedia` з розрізами. Потрібне правило стрибка в `planMediaSync`, а `startDelay` і `seekLead` коректні лише в межах одного сегмента.
