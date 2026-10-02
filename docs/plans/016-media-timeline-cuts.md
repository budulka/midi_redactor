# 016 — Таймлайн медіа над piano roll, вирізання проміжків і редагування розрізів

**Статус:** схвалено
**Гілка:** етап 1 — `feature/016a-media-timeline`; етап 2 — `feature/016b-media-cuts` (від `main` після злиття етапу 1)

## Мета
Закрити три пункти розділу 2.8 CLAUDE.md, які лишилися `[ ]`:
- **«Таймлайн відео над piano roll»** (етап 1). Над нотною сіткою з'являється смуга таймлайну медіа в тому самому масштабі й з тією самою горизонтальною прокруткою, що й piano roll. Клік по ній перемотує. Повзунок «Seek video» з правої панелі прибирається.
- **«Вирізання проміжків»** (етап 2). На смузі можна протягуванням виділити проміжок, натиснути на ньому ПКМ і в контекстному меню обрати «Delete range». Вирізаний фрагмент медіа пропускається під час відтворення, таймлайн стискається, медіафайл не змінюється.
- **«Розріз можна поправити»** (етап 2). На місці розрізу лишається позначка. Її межі можна перетягнути або змінити клавішами, а розріз можна прибрати через ПКМ («Remove cut»). Усе це — кроки undo/redo.

Задача продовжує правило розділу 7: «Зміщення медіа (offset) і вирізані проміжки — це відображення між часом медіафайлу і часом таймлайну; ноти завжди зберігаються в часі таймлайну. Відображення реалізується чистими функціями з unit-тестами». Розрізи додаються в наявний `MediaTimeMap` (`utils/mediaTimeMap.ts`, 015) і **комбінуються з offset**: offset лишається «секундою сирого медіафайлу на такті 1», а розрізи задаються теж у сирих секундах медіа.

### Поточний стан (перевірено в коді)
- **`utils/mediaTimeMap.ts`** (015): `MediaTimeMap { offset }`, функції `mediaTimeMapOf`, `mediaToTimeline` (`media − offset`), `timelineToMedia` (`timeline + offset`), `mediaTimelineEnd`, `sameMediaTimeMap`. Doc-коментар прямо каже, що 016 додасть сюди розрізи.
- **`media/MediaSync.ts`**: усі перетворення часу проходять через ці функції: `syncTrack` (`target: timelineToMedia(position)`), `onTrackSeek` (`mediaToTimeline` + обов'язковий прохід синхронізації), `updateMediaDuration` (`mediaTimelineEnd`). Є `setTimeMap`, `getTimeMap` і `batch`.
- **`media/mediaSyncRules.ts`**: `planMediaSync` припускає, що секунда таймлайну дорівнює секунді медіа. На цьому тримаються `seekLead` і `startDelay` у корекційному seek (`clamp(target + lead, 0, duration − END_GUARD)`). Рев'ю 015 прямо попередило, що з розрізами це правда лише в межах одного сегмента і потрібне окреме правило стрибка.
- **`state/TransportProvider.tsx`**: ефект `mediaSync.setTimeMap({ offset: mediaOffset })`. `TransportApi.applyMediaOffset(offset, seekTo?)` використовує `MediaOffsetMarker` для попереднього перегляду під час перетягування.
- **`PianoRoll.tsx`**: один scroll-контейнер з CSS grid (`KEYBOARD_WIDTH_PX` + `max-content`). Рядки: лінійка (`RULER_HEIGHT_PX`, sticky top), сітка, педалі (sticky bottom). Ширина часової колонки — `timelineDurationSeconds(...) * pixelsPerSecond`. `Playhead` займає `grid-row: 1 / -1`. `PianoRoll` не залежить від медіапровайдерів: `PianoRoll.test.tsx` і `testUtils.tsx` рендерять його без `AudioTrackProvider`/`VideoProvider`.
- **`VideoPlayer.tsx`**: повзунок `Seek video` (`utils/seekSlider.ts` використовується лише тут), кнопки ±5 с, позиція, Mute. Тести повзунка: `VideoPlayer.test.tsx`, `App.test.tsx` (рядки 75, 94), `MediaSyncBridge.test.tsx` («seeks the whole timeline with the video slider»). E2E повзунок не використовують.
- **Контекстного меню в застосунку немає.** ПКМ по ноті чи педалі видаляє її (`NoteGrid`/`PedalLane.handleContextMenu`).
- **Модель**: `Project { bpm, timeSignature, mediaOffset, notes, pedals }`. Backend `Project` має `extra="forbid"`. `ImportButton` зберігає поточний `mediaOffset` при імпорті.
- `useDragGesture` (поріг, preview, Escape) уже повторно використовують `AppLayout` і `MediaOffsetMarker`.

## Розбиття на етапи
Задача завелика для однієї гілки: смуга таймлайну — це новий рядок piano roll і прибирання повзунка, а розрізи — це модель (frontend + backend), розширене відображення, нове правило синхронізації з таймером, контекстне меню, перетягування меж і два e2e-набори. Тому вона ділиться на **два етапи з окремими гілками**. Кожен етап сам по собі завершений, проходить усі перевірки і зливається в `main` окремо:

| Етап | Гілка | Закриває | Залежить від |
|---|---|---|---|
| 1 | `feature/016a-media-timeline` | «Таймлайн відео над piano roll» | — |
| 2 | `feature/016b-media-cuts` | «Вирізання проміжків», «Розріз можна поправити» | етап 1 (смуга, на якій виділяють проміжок) |

**Порядок виконання (обов'язковий для оркестратора та implementer):**
1. Оркестратор запускає implementer **двічі**, щоразу явно вказуючи етап: спершу «виконай лише етап 1 плану 016», потім, після звіту, «виконай лише етап 2 плану 016». Implementer виконує лише кроки й DoD названого етапу.
2. **Після етапу 1 статус плану лишається `схвалено`.** Implementer етапу 1 не ставить плану `виконано`, а в CLAUDE.md позначає лише пункт «Таймлайн відео над piano roll» і ставить 016 у розділі 8 статус «в роботі (етап 1 виконано)».
3. **Перевірка між етапами.** Якщо у звіті етапу 1 є відхилення від плану, що зачіпають етап 2 (API `MediaTimeline`, `MediaTimelineGeometry`, `useMediaTimeMap`, `utils/mediaTimeline.ts`, розмітка `.media-timeline__track`, CSS-класи чи e2e-хелпери), оркестратор **перед етапом 2 повертає план planner-у**. Planner узгоджує розділи етапу 2 з фактичним кодом, і план знову проходить рев'ю. Якщо відхилень немає або вони не стосуються етапу 2, етап 2 запускається одразу.
4. Лише implementer етапу 2 ставить 016 у розділі 8 статус «виконано», а плану — `виконано`.

## Поза межами задачі
- **Waveform або кадри відео на смузі таймлайну.** Смуга показує, де на таймлайні лежить медіа (смуга-«доріжка»), розрізи, виділення і playhead. Waveform лишається у правій панелі. Малювати пікові значення в масштабі piano roll з урахуванням розрізів — окрема задача (див. «Відкриті питання»).
- **Pre-roll (вступ до такту 1 на таймлайні).** Як і в 015, таймлайн починається з 0 с = такт 1. На смузі прихований вступ лише підписано («0:03.200 before bar 1»).
- **Зсув нот при вирізанні.** Ноти й педалі не рухаються: вони зберігаються в часі таймлайну (розділ 7), а розріз змінює лише те, яке медіа під ними звучить. Див. «Відкриті питання».
- **Розрізи в `.mid`.** Експорт не змінюється: такт 1 = тік 0, ноти — в часі таймлайну. Розрізи, як і offset, описують медіа, а не музику.
- **Об'єднання розрізів перетягуванням межі.** Межу не можна протягнути через сусідній розріз: вона упирається в нього (див. `cutEdgeLimits`). Розрізи, що перетинаються чи торкаються, об'єднуються лише при додаванні нового.
- **Контекстне меню з клавіатури (Shift+F10 / клавіша Menu).** Клавіатурні замінники є: `Delete` на сфокусованій смузі з виділенням вирізає його, а `Delete` на сфокусованій межі розрізу прибирає розріз.
- **Редагування розрізів на waveform правої панелі.** Там розрізи лише відображаються (заштриховані), без взаємодії.
- Нові залежності не додаються: контекстне меню — власний невеликий компонент на `createPortal` з React.

## Технічні рішення

### Етап 1. Смуга таймлайну медіа над piano roll

#### Розміщення: новий sticky-рядок усередині scroll-контейнера piano roll
Смуга стоїть у тому самому CSS grid, що лінійка й сітка, тому масштаб (`pixelsPerSecond`) і горизонтальна прокрутка в неї збігаються з piano roll автоматично, без синхронізації `scrollLeft`.

- `PianoRoll` отримує необов'язковий render-prop:
  ```ts
  export interface MediaTimelineGeometry {
    /** Timeline length in seconds, the same as the ruler's. */
    readonly durationSeconds: number;
    readonly pixelsPerSecond: number;
  }
  interface PianoRollProps {
    /** Renders the media timeline row above the ruler; without it the row is absent. */
    mediaTimeline?: (geometry: MediaTimelineGeometry) => ReactNode;
  }
  ```
  Через render-prop `PianoRoll` і далі не залежить від медіапровайдерів, тож наявні тести `PianoRoll`, `NoteGrid`, `PedalLane` і `testUtils.tsx` не змінюються.
- Коли prop передано:
  - `gridTemplateRows: ${MEDIA_TIMELINE_HEIGHT_PX}px ${RULER_HEIGHT_PX}px max-content ${PEDAL_LANE_HEIGHT_PX}px`;
  - першими дочірніми елементами йдуть `<div className="piano-roll__corner piano-roll__corner--media">Media</div>` і `<div className="piano-roll__media">{mediaTimeline({ durationSeconds, pixelsPerSecond })}</div>`. Решта комірок (кут лінійки, лінійка, клавіатура, сітка, педалі) розставляється автоматично, як і зараз;
  - кут лінійки й `.piano-roll__ruler` отримують inline `style={{ top: MEDIA_TIMELINE_HEIGHT_PX }}`, щоб лінійка прилипала під смугою, а не під неї.
- Без prop розмітка та стилі такі самі, як зараз.
- Нова константа `MEDIA_TIMELINE_HEIGHT_PX = 28` у `utils/pianoRollGeometry.ts`.
- `Playhead` (`grid-row: 1 / -1`) сам проходить і через смугу: окремий курсор не потрібен.
- CSS (`PianoRoll.css`): `.piano-roll__media { position: sticky; top: 0; z-index: 2; background: var(--panel); border-bottom: 1px solid var(--border) }`; `.piano-roll__corner--media` — підпис `font-size: 11px; color: var(--muted); display: flex; align-items: center; padding: 0 6px`.
- `App.tsx`: `editor={<PianoRoll mediaTimeline={(geometry) => <MediaTimeline {...geometry} />} />}`.

**Відкинуті альтернативи:**

| Варіант | Чому ні |
|---|---|
| Окремий елемент над `.piano-roll__scroll` з власною прокруткою, синхронізованою через `scroll`-події | Подвійна прокрутка, затримка на кадр, відступ на ширину клавіатури доведеться підтримувати вручну. Grid-рядок дає вирівнювання безкоштовно |
| Смуга всередині `TimeRuler` | `TimeRuler` — чистий компонент лінійки без медіа. Змішування ускладнило б його тести, а смузі потрібні медіапровайдери |
| `PianoRoll` сам рендерить `MediaTimeline` | Тоді `PianoRoll` залежав би від `AudioTrackProvider`/`VideoProvider`, і треба було б переписати обгортки всіх наявних тестів piano roll |

#### Компонент `components/MediaTimeline.tsx` (новий) і `components/MediaTimeline.css`
```tsx
<div className="media-timeline" role="group" aria-label="Media timeline" style={{ width }}>
  <div
    ref={trackRef}
    className="media-timeline__track"
    role="slider"
    tabIndex={ready ? 0 : -1}
    aria-label="Media position"
    aria-disabled={!ready}
    aria-valuemin={0}
    aria-valuemax={extent?.end ?? 0}
    aria-valuenow={position}
    aria-valuetext={positionText}
    onMouseDown={...}
    onKeyDown={...}
  >
    {extent !== null && (
      <div className="media-timeline__media" style={{ left: x(extent.start), width: x(extent.end) - x(extent.start) }} title={fileName ?? undefined} />
    )}
    {introSeconds > 0 && <span className="media-timeline__intro">{formatClock(introSeconds)} before bar 1</span>}
    {!ready && <span className="media-timeline__placeholder">Load audio or video to see its timeline here</span>}
  </div>
</div>
```
- `width = durationSeconds * pixelsPerSecond` (як у `TimeRuler`), `x(t) = timeToX(t, { pixelsPerSecond, rowHeight: 0 })`.
- Дані:
  - `useShownMedia()` (015) дає `status`, `duration`, `fileName` медіа, яке зараз завантажене (аудіо або відео);
  - `useMediaTimeMap()` (новий хук, див. нижче);
  - `useTransportState().position` (позиція-cue; змінюється на seek і зміні статусу, тож під час відтворення компонент не перерендерюється);
  - `useTransportApi().seek`.
- `ready = status === 'ready' && duration > 0`, `extent = ready ? mediaTimelineExtent(duration, map) : null`, `introSeconds = ready ? hiddenIntroSeconds(map) : 0`.
- `positionText = mediaPositionText(position, map)`, наприклад `"0:01.500 (media 0:04.700)"`.
- **Миша.** `onMouseDown`: лише ліва кнопка і лише коли `ready`. Робить `preventDefault()`, `focusFromPointer(track)` і `api.seek(xToTime(clientX − rect.left))`, де `rect = trackRef.current.getBoundingClientRect()`. Як у `TimeRuler`, клік по будь-якому місцю смуги (і поза медіа) перемотує таймлайн. Протягування на етапі 1 нічого не робить; на етапі 2 воно виділяє проміжок.
- **Клавіатура** (`onKeyDown`, коли `ready`): `timelineSeekForKey(position, key, shiftKey, extent.end)`. `ArrowLeft`/`ArrowRight` ∓/±0.1 с, з `Shift` ∓/±1 с, `Home` → 0, `End` → кінець медіа на таймлайні. Якщо результат не `null`: `preventDefault()` і `api.seek(value)`. Глобальні скорочення стрілок не перехоплюють, а Space на `role="slider"` уже виняток (`isActivationTarget`), тож Play/Pause з фокусом на смузі не спрацьовує, як і на позначці такту 1.
- CSS:
  - `.media-timeline { position: relative; height: 100% }`;
  - `__track { position: absolute; inset: 0; cursor: pointer; outline: none }`, `:focus-visible` — обведення `var(--note-selected)`;
  - `__media { position: absolute; top: 6px; bottom: 6px; border-radius: 3px; background: var(--media-band, #3b6ea5); pointer-events: none }`;
  - `__intro`, `__placeholder` — `position: sticky; left: 0; font-size: 11px; color: var(--muted); pointer-events: none; white-space: nowrap`.

#### Хук `state/useMediaTimeMap.ts` (новий)
```ts
/** The project's media time map; the same object until the offset (and, from stage 2, the cuts) change. */
export function useMediaTimeMap(): MediaTimeMap;
```
`useMemo(() => mediaTimeMapOf(project), [project.mediaOffset])`. На етапі 2 залежності розширюються на `project.mediaCuts`, і хук використовує також `TransportProvider`.

#### Чисті функції `utils/mediaTimeline.ts` (новий)
```ts
export const TIMELINE_KEY_STEP_SECONDS = 0.1;
export const TIMELINE_KEY_BIG_STEP_SECONDS = 1;
/** Where the media lies on the timeline: [max(0, mediaToTimeline(0)), mediaTimelineEnd(duration)]; null when duration <= 0 or the range is empty. */
export function mediaTimelineExtent(duration: number, map: MediaTimeMap): { start: number; end: number } | null;
/** Media seconds before bar 1 that the timeline does not show: max(0, −mediaToTimeline(0, map)). */
export function hiddenIntroSeconds(map: MediaTimeMap): number;
/** New timeline position for a key on the media timeline, clamped to [0, end] and rounded to 1 ms; null for other keys or end <= 0. */
export function timelineSeekForKey(position: number, key: string, shiftKey: boolean, end: number): number | null;
/** "0:01.500 (media 0:04.700)"; the media part is omitted when the media time is negative. */
export function mediaPositionText(position: number, map: MediaTimeMap): string;
```
Час форматує наявний `formatClock`. Етап 2 змінює лише `mediaTimeMap.ts`, і ці функції автоматично враховують розрізи. Наприклад, `hiddenIntroSeconds` з розрізом у вступі показує вже відредагований вступ.

#### Прибирання повзунка «Seek video»
- `VideoPlayer.tsx`: прибрати `<input type="range" aria-label="Seek video">`, `seekRef`, `sliderMax`, імпорт `seekSlider`, константу `SEEK_STEP_SECONDS` і запис значення повзунка в `showPosition`. Кнопки «−5 s»/«+5 s», позиція й Mute лишаються. Doc-коментар компонента: «… seeking happens on the media timeline above the piano roll, the waveform and the ±5 s buttons».
- `utils/seekSlider.ts` і `utils/seekSlider.test.ts` видаляються: інших користувачів немає (перевіряється `grep`). Видалення тесту тут — наслідок прибирання функції за вимогою 2.8, а не послаблення перевірок.
- `App.css`: прибрати `.video-player__seek`.
- Наявні тести, які перевіряли повзунок, змінюються так (і лише так):
  - `VideoPlayer.test.tsx`:
    - прибрати хелпер `slider`;
    - у «shows the empty panel» і «shows the ready video» рядки про повзунок замінити на `expect(screen.queryByRole('slider', { name: 'Seek video' })).toBeNull()`;
    - тести «lets the slider reach the end…» і «seeks with the slider» видалити (функції більше немає; seek медіа покривають «skips back and forward» і `MediaSyncBridge.test`);
    - у «follows the position while the video plays» прибрати рядок `slider().value`;
  - `App.test.tsx` (рядки 75, 94): `getByRole('slider', { name: 'Seek video' })` → `queryByRole(...)` і `toBeNull()`;
  - `MediaSyncBridge.test.tsx`: тест «seeks the whole timeline with the video slider» переписати на «seeks the whole timeline with the video skip buttons»: `clearCalls()`, клік «Forward 5 seconds» → позиція транспорту `0:05.000`, `setTime` відео й аудіо — рівно `['setTime:5']`.

### Етап 2. Вирізані проміжки

#### Головне рішення: розріз — це проміжок сирого медіафайлу, який відображення пропускає
```
edited(m) = m − (сумарна довжина вирізаного до m)
mediaToTimeline(m) = edited(m) − edited(offset)
timelineToMedia(t) = raw(t + edited(offset)),   raw — обернена до edited; на межі розрізу бере його кінець
```
- Розрізи зберігаються **в секундах сирого медіафайлу**, як і offset. Тому вони не залежать ні від offset, ні від інших розрізів, ні від BPM (013 копіює їх через `...project`). Зміна offset не зсуває розрізи у файлі.
- Точка всередині розрізу відображається на «точку розрізу» на таймлайні. Таймлайн → медіа на точці розрізу дає **кінець** розрізу, тобто медіа, що грає після нього.
- **Комбінація з offset** відбувається через `edited(offset)`:
  - offset до розрізу: такт 1 там, де й був, а розріз стискає таймлайн після нього;
  - offset усередині розрізу: `edited(offset) = edited(cut.start)`, тож такт 1 = кінець розрізу (рекомендація з плану 015). Значення offset у проекті не змінюється, тож якщо прибрати розріз, такт 1 повернеться на свій кадр;
  - розріз цілком у вступі (до offset): він скорочує лише прихований вступ, на таймлайні не видно ні його, ні його позначки (див. «Ризики»).
- **Ноти й педалі не змінюються** (розділ 7). Таймлайн стискається, тобто кінець медіа на таймлайні (`mediaTimelineEnd`) і довжина транспорту зменшуються. Під нотами після розрізу тепер звучить пізніше медіа.
- **Експорт** не змінюється. Тік 0 = такт 1, а розрізи, як і offset, у файл не потрапляють.
- **Транспорт** не змінюється. Він грає неперервний таймлайн, а розрив (стрибок медіа через розріз) повністю на боці `MediaSync`.

**Відкинуті альтернативи:**

| Варіант | Чому ні |
|---|---|
| Розрізи в секундах таймлайну | Залежали б від offset і від порядку розрізів: зміна offset чи прибирання одного розрізу пересувала б інші у файлі. Сирий час медіа — стабільна система координат, у якій уже живе offset |
| Список «сегментів, що грають» замість розрізів | Еквівалентно, але вимога оперує саме розрізами (помітка, межі, прибрати). Розрізи напряму відповідають UI й undo |
| Вирізати ноти разом з медіа (зсув нот після розрізу) | Суперечить розділу 7 («ноти завжди в часі таймлайну») і рішенню 015 для offset. Додає руйнівну зміну нот у вирізаному проміжку. Див. «Відкриті питання» |

#### Модель даних
**Frontend** (`state/types.ts`):
```ts
/** A range of the media file skipped on the timeline; seconds of the raw media file. */
export interface MediaCut {
  readonly id: string;
  readonly start: number;
  readonly end: number;
}
export interface Project {
  ...
  /** Cut media ranges, sorted by start, not overlapping; see utils/mediaTimeMap.ts. */
  readonly mediaCuts: readonly MediaCut[];
}
```
Поле обов'язкове, щоб TypeScript знайшов кожне місце, що будує `Project`.

**Константи** (`state/constants.ts`):
- `MIN_MEDIA_CUT_SECONDS = 0.01`;
- `MAX_MEDIA_CUT_END = 86400` (доба: безпечна межа для будь-якого файлу, щоб безглузде число не потрапило в модель);
- `MAX_MEDIA_CUTS = 1000`;
- `createEmptyProject()` додає `mediaCuts: []`.

**Інваріант списку:**
- відсортований за `start`;
- кожен розріз має `0 ≤ start`, `end ≤ MAX_MEDIA_CUT_END`, `end − start ≥ MIN_MEDIA_CUT_SECONDS`, межі округлені до 1 мс;
- сусідні розрізи не перетинаються: `next.start ≥ prev.end`. Reducer ще й об'єднує ті, що торкаються, тож у стані, створеному через UI, завжди `next.start > prev.end`.

**Валідація** (`state/validation.ts`):
- `MEDIA_CUT_SHAPE = { id: 'string', start: 'number', end: 'number' }`, `PROJECT_SHAPE.mediaCuts = 'array'`;
- `parseMediaCut` за зразком `parsePedal`;
- `validateMediaCut(cut, path)`: непорожній `id`; `start` скінченне ≥ 0; `end` скінченне ≤ `MAX_MEDIA_CUT_END`; `end ≥ start + MIN_MEDIA_CUT_SECONDS` (повідомлення `must be at least 0.01 s after start`);
- `validateProject`:
  - `duplicateIdIssues(project.mediaCuts, 'mediaCuts')`;
  - `mediaCutOrderIssues`: `mediaCuts[i]` з `start < mediaCuts[i−1].end` → `overlaps or precedes cut "<id>"`;
  - більше `MAX_MEDIA_CUTS` → `{ path: 'mediaCuts', message: 'must have at most 1000 cuts' }`.

**Backend** (`app/models/project.py`):
```python
MIN_MEDIA_CUT_SECONDS: Final = 0.01
MAX_MEDIA_CUT_END: Final = 86400.0
MAX_MEDIA_CUTS: Final = 1000

class MediaCut(CamelModel):
    id: str = Field(min_length=1)
    start: float = Field(ge=0, allow_inf_nan=False)
    end: float = Field(le=MAX_MEDIA_CUT_END, allow_inf_nan=False)

    @model_validator(mode="after")
    def check_range(self) -> Self: ...  # end >= start + MIN_MEDIA_CUT_SECONDS

class Project(CamelModel):
    ...
    # Cut ranges of the media file (raw media seconds); the MIDI file ignores them.
    media_cuts: list[MediaCut] = Field(default_factory=list, max_length=MAX_MEDIA_CUTS)
```
У `check_consistency` додаються `_check_unique_ids("media cut", ...)` і `_check_media_cut_order(cuts)`: розрізи відсортовані за `start`, і `current.start >= previous.end`, інакше `ValueError`. Типове значення `[]` тримає `import_midi` і старі JSON валідними. `midi_export.py` і `midi_import.py` не змінюються. Фікстур `backend/tests/fixtures/sample_project.json` отримує `"mediaCuts": []` (на ньому тримаються round-trip тести 017).

**CLAUDE.md, розділ 7** (при позначенні етапу 2 виконаним): `Project { bpm, timeSignature, mediaOffset, mediaCuts[], notes[], pedals[] }`, де `MediaCut { id, start (с медіа), end (с медіа) }` — вирізаний проміжок сирого медіафайлу.

#### Чисті функції розрізів — `utils/mediaCuts.ts` (новий)
```ts
export interface TimeRange { readonly start: number; readonly end: number; }
export type CutEdge = 'start' | 'end';
/** Arrow keys on a cut edge move it by this much; Shift + arrows by the big step, seconds. */
export const CUT_KEY_STEP_SECONDS = 0.01;
export const CUT_KEY_BIG_STEP_SECONDS = 0.1;
/** Gap a dragged edge keeps from a neighbour cut, seconds (touching cuts would merge). */
export const CUT_EDGE_GAP_SECONDS = 0.001;

/** Rounds both ends to 1 ms, clamps to [0, MAX_MEDIA_CUT_END]; null when shorter than MIN_MEDIA_CUT_SECONDS or not finite. */
export function normalizeCutRange(range: TimeRange): TimeRange | null;
/**
 * Adds a cut and merges it with every cut it overlaps or touches; the merged cut keeps the id of
 * the added one. Returns the same array when an existing cut already covers the range, or when
 * the list would grow past MAX_MEDIA_CUTS. Expects a normalized range.
 */
export function addCut(cuts: readonly MediaCut[], cut: MediaCut): readonly MediaCut[];
/** Moves the edges of one cut; null when the id is unknown, the range is invalid or it would overlap or touch another cut; the same array when nothing changes. */
export function updateCut(cuts: readonly MediaCut[], id: string, range: TimeRange): readonly MediaCut[] | null;
/** The list without the cut; the same array for an unknown id. */
export function removeCut(cuts: readonly MediaCut[], id: string): readonly MediaCut[];
/**
 * Allowed values of one edge, so that dragging never moves bar 1 across the cut:
 * - a cut at or after bar 1 (start >= offset): start in [max(previous end + gap, 0, offset), end − MIN],
 *   end in [start + MIN, min(next start − gap, mediaDuration)];
 * - a cut that contains bar 1 (start < offset <= end): start in [max(previous end + gap, 0), min(end − MIN, offset)],
 *   end in [max(start + MIN, offset), min(next start − gap, mediaDuration)];
 * - a cut wholly before bar 1 (end < offset): the first rule without the offset bound.
 * mediaDuration <= 0 means unknown (MAX_MEDIA_CUT_END).
 */
export function cutEdgeLimits(cuts: readonly MediaCut[], id: string, edge: CutEdge, mediaDuration: number, offset: number): TimeRange;
/** New value of an edge dragged by delta timeline seconds (= media seconds inside one segment), clamped to the limits, rounded to 1 ms. */
export function draggedCutEdge(value: number, delta: number, limits: TimeRange): number;
/** New value of an edge for a key (ArrowLeft/Right, Shift for the big step), clamped and rounded; null for other keys. */
export function cutEdgeForKey(value: number, key: string, shiftKey: boolean, limits: TimeRange): number | null;
/** Media range cut by a timeline selection: [timelineToMedia(start), timelineToMedia(end)] clamped to [0, mediaDuration] and normalized; null when empty. */
export function cutRangeForSelection(selection: TimeRange, map: MediaTimeMap, mediaDuration: number): TimeRange | null;
/** "Cut 0:05.000–0:08.000 (3.000 s)". */
export function cutDescription(range: TimeRange): string;
```
**Чому межі зупиняються на offset.** Перетягування межі ніколи не переносить такт 1 через розріз:
- розріз після такту 1 не може межею `start` «з'їсти» такт 1. Інакше такт 1 перескочив би на кінець розрізу, і вся смуга зсунулась би під курсором;
- розріз, що містить такт 1 (позначка в точці 0, такт 1 = кінець розрізу), не може його «відпустити». Межа `end` не йде лівіше offset, бо інакше розріз став би цілком вступним: його позначка зникла б посеред жесту, а такт 1 перескочив би з кадру `end` на кадр `offset`. Межа `start` не йде правіше offset, бо інакше позначка перескочила б з 0 на `start − offset`.

Щоб вирізати вступ разом із тактом 1, достатньо виділити проміжок від початку смуги. Щоб прибрати такт 1 з розрізу, розріз прибирають («Remove cut») або змінюють offset.

#### Дії і reducer
- `state/actions.ts`:
  - `{ type: 'project/addMediaCut'; cut: MediaCut }`, creator `addMediaCut(range: TimeRange)` (id з `createId()`);
  - `{ type: 'project/updateMediaCut'; id: string; range: TimeRange }`, creator `updateMediaCut(id, range)`;
  - `{ type: 'project/removeMediaCut'; id: string }`, creator `removeMediaCut(id)`.
- `state/projectReducer.ts`:
  - `addMediaCut`: `normalizeCutRange(action.cut)`. Якщо `null`, повернути `state`. Інакше `addCut(state.mediaCuts, { ...normalized, id })`; той самий масив → `state`;
  - `updateMediaCut`: `normalizeCutRange(action.range)`, потім `updateCut(...)`. `null` або той самий масив → `state`;
  - `removeMediaCut`: `removeCut`, той самий масив → `state`;
  - в усіх трьох випадках `notes`, `pedals` і `mediaOffset` — ті самі об'єкти.
- Кожна дія — один крок історії. `history.ts` не змінюється: дія без змін повертає той самий стан, і крок не записується.

#### Відображення — `utils/mediaTimeMap.ts` (розширення)
```ts
export interface MediaTimeMap {
  readonly offset: number;
  /** Cut media ranges, raw media seconds, sorted and not overlapping. */
  readonly cuts: readonly TimeRange[];
}
export const IDENTITY_MEDIA_TIME_MAP: MediaTimeMap = { offset: 0, cuts: [] };
export function mediaTimeMapOf(project: Pick<Project, 'mediaOffset' | 'mediaCuts'>): MediaTimeMap;
/** Media time with the cuts removed: m − Σ clamp(m − c.start, 0, c.end − c.start). */
export function editedMediaTime(mediaSeconds: number, cuts: readonly TimeRange[]): number;
/** Inverse of editedMediaTime; at a cut point returns the end of the cut. */
export function rawMediaTime(editedSeconds: number, cuts: readonly TimeRange[]): number;
export function mediaToTimeline(mediaSeconds: number, map: MediaTimeMap): number;   // edited(m) − edited(offset)
export function timelineToMedia(timelineSeconds: number, map: MediaTimeMap): number; // raw(t + edited(offset))
export function mediaTimelineEnd(duration: number, map: MediaTimeMap): number;       // без змін: max(0, mediaToTimeline(duration))
/** Compares the offset and every cut by start and end. */
export function sameMediaTimeMap(a: MediaTimeMap, b: MediaTimeMap): boolean;
/** The segment of the media that plays around a media second (a target, never inside a cut): from the end of the previous cut (−Infinity) to the start of the next cut (Infinity), and where playback continues after that cut (Infinity). */
export function mediaSegmentAt(mediaSeconds: number, cuts: readonly TimeRange[]): { start: number; end: number; nextStart: number };
/** Timeline seconds of every cut point (mediaToTimeline(cut.start)), in order. */
export function cutPoints(map: MediaTimeMap): number[];
/** The first cut point strictly after a timeline second, or null. */
export function nextCutPoint(timelineSeconds: number, map: MediaTimeMap): number | null;
```
- `rawMediaTime(e, cuts)`: `let x = e; for (const c of cuts) { if (x >= c.start) x += c.end − c.start; else break; } return x`. Цикл по відсортованих розрізах: кожен розріз, що лежить не пізніше поточної сирої точки, зсуває її далі на свою довжину.
- `mediaSegmentAt(m)`:
  - `start` — найбільший `c.end` серед `c.end ≤ m`;
  - `end` — найменший `c.start` серед `c.start > m`;
  - `nextStart` — `c.end` того самого розрізу.
- `MediaCut` структурно задовольняє `TimeRange`, тож `mediaTimeMapOf` передає `project.mediaCuts` без копіювання. Тому `useMediaTimeMap` повертає той самий об'єкт, доки не змінились offset чи масив розрізів.
- Усі використання 015 (`MediaSync`, `markerPercent` через значення offset) працюють без змін виклику.

#### Синхронізація: правило стрибка — `media/mediaSyncRules.ts`
`MediaSyncInput` отримує необов'язкові поля (типові значення відтворюють поведінку без розрізів):
```ts
/** Media second where the playing segment that contains target starts (end of the previous cut); default -Infinity. */
readonly segmentStart?: number;
/** Media second where that segment ends (start of the next cut); default Infinity. */
readonly segmentEnd?: number;
/** Media second where playback continues after that cut (its end); default Infinity. */
readonly nextSegmentStart?: number;
```
Допоміжна чиста функція (експортується для тестів):
```ts
/** Media second `lead` timeline seconds after target, crossing at most the next cut; clamped to [segmentStart, duration − END_GUARD_SECONDS]. */
export function mediaAhead(target: number, lead: number, input: MediaSyncInput): number;
```
Тобто `t = target + lead`. Якщо `t < segmentEnd`, результат `t`, інакше `nextSegmentStart + (t − segmentEnd)`. Далі `clamp(..., max(0, segmentStart), duration − END_GUARD_SECONDS)`. Негативний `lead` (через `startDelay`) не переходить назад через розріз завдяки нижній межі `segmentStart`.

**Нове правило «розріз до кінця файлу»** (`tailCut`) стоїть одразу після правила `target ≥ duration` (правило 2), тобто **до** `inTail` і блоку `!mediaPlaying`:
- умова: `nextSegmentStart ≥ duration − END_GUARD_SECONDS` (за поточним сегментом іде розріз, що тягнеться до кінця файлу) **і** `target` біля межі розрізу:
  - `target ≥ segmentEnd − END_GUARD_SECONDS` (таймлайн у останніх 0.1 с перед розрізом), **або**
  - `mediaTime ≥ segmentEnd − SEEK_EPSILON_SECONDS` **і** `target ≥ segmentEnd − HARD_SEEK_DRIFT_SECONDS` (медіа трохи випередило таймлайн і вже дійшло до межі, а таймлайн щонайбільше на 0.25 с позаду);
- дія: `{ seekTo: null, play: false, pause: mediaPlaying, nudge: 1 }`, стан `{ ...state, playRequested: false }`. Медіа зупиняється на межі розрізу і не грає ані останніх 0.1 с вирізаного фрагмента (seek у `duration − END_GUARD_SECONDS`), ані повторного `play()` з блоку `!mediaPlaying`. Коли таймлайн проходить точку розрізу, `target = nextSegmentStart ≥ duration − END_GUARD`, і далі медіа тримає наявне правило 2 або `inTail`.
- **Чому обидві гілки умови перевіряють `target`.** Якщо медіа стоїть за межею (наприклад, на 30 с після того, як транспорт дограв до кінця й став на паузу), а `target` далеко перед нею (Play з 0 або seek під час відтворення), правило **не діє**. Виконання йде звичайним шляхом:
  - медіа на паузі → блок `!mediaPlaying`: seek на `target` і `play()`;
  - медіа грає → правило стрибка (його випадок 2 теж вимагає, щоб target був біля межі, див. нижче) → cooldown → hard drift: seek на `mediaAhead(target, lead)`.

  Без цього медіа лишалося б на паузі все відтворення: `tailCut` спрацьовував би на кожній перевірці, і блок `!mediaPlaying` не досягався б ніколи.

**Нове правило «стрибок через розріз»** стоїть після блоку `!mediaPlaying` (тобто медіа грає) і **перед** перевіркою cooldown. Воно розрізняє три положення медіа відносно сегмента, що містить `target`:
1. **Медіа перед пройденим розрізом:** `mediaTime < segmentStart − SEEK_EPSILON_SECONDS`. Таймлайн уже пройшов точку розрізу, а медіа ще перед ним. Дія: стрибок, `seekTo = mediaAhead(target, state.seekLead)`.
2. **Медіа всередині наступного розрізу, таймлайн біля нього:** `segmentEnd − SEEK_EPSILON_SECONDS ≤ mediaTime < nextSegmentStart` **і** `target ≥ segmentEnd − HARD_SEEK_DRIFT_SECONDS`. Медіа трохи випередило таймлайн і зайшло у вирізаний проміжок. Якщо `target` далеко перед розрізом (медіа опинилось у розрізі з іншої причини, наприклад після Play з 0, коли медіа стояло на межі хвостового розрізу), це не стрибок: правило не діє, а звичайна корекція з `drift = mediaTime − target` робить seek на `mediaAhead(target, lead)`, тобто назад до target. Дія: стрибок, `seekTo = min(nextSegmentStart + max(0, mediaTime − segmentEnd), duration − END_GUARD_SECONDS)`. Медіа перестрибує розріз саме, зберігаючи своє випередження. Розріз до кінця файлу сюди не доходить: його вже обробило правило `tailCut`.
3. **Медіа вже за наступним розрізом, а target ще перед ним:** `mediaTime ≥ nextSegmentStart`. Це стан одразу після стрибку з випадку 2, поки таймер точки розрізу не перевів `target` у новий сегмент. Дрейф рахується в часі таймлайну: `editedDrift = (mediaTime − nextSegmentStart) + (segmentEnd − target)`, тобто наскільки медіа випереджає таймлайн без урахування вирізаного.
   - Якщо `editedDrift ≤ HARD_SEEK_DRIFT_SECONDS`: `NO_ACTION` (без стрибка, без корекційного seek-а назад, без nudge), стан без змін.
   - Інакше (медіа набагато попереду, наприклад після зовнішньої зміни) правило не діє, і виконання йде наявним шляхом cooldown → hard seek, де `drift = editedDrift`, а seek виконується на `mediaAhead(target, lead, input)`, тобто перед розрізом.

   Без цього випадку повторна перевірка в той самий момент бачила б `mediaTime ≥ segmentEnd` і робила б другий стрибок (`5 + (5 − 2) = 8`), а звичайний `drift = mediaTime − target ≈ 3` дав би корекційний seek назад.

   Додатковий запобіжник: шлях з `editedDrift > HARD_SEEK_DRIFT_SECONDS` проходить через cooldown. Одразу після стрибка з випадку 2 cooldown активний, тож навіть хибно великий дрейф (наприклад, через затримку `currentTime` після seek-а) не дасть seek-а назад протягом `SEEK_COOLDOWN_SECONDS`.

Для випадків 1 і 2 дія — `{ seekTo, play: false, pause: false, nudge: 1 }`, а стан — `{ ...next, lastSeekAt: now, checkAfterSeek: false }`.
- `seekStreak` не змінюється: стрибки не рахуються в `MAX_CORRECTION_SEEKS` і не блокуються ним.
- `checkAfterSeek: false`, бо у випадку 2 медіа свідомо лишається попереду target, і цей дрейф не є затримкою seek-а. `seekLead` зберігається: це властивість декодера, а не сегмента.
- Cooldown правило ігнорує, бо стрибок — не корекція дрейфу, а обов'язкова зміна позиції. Після стрибка cooldown діє як після будь-якого seek-а. Повторного стрибка в межах того самого розрізу бути не може: після стрибка медіа опиняється у випадку 3 (або вже в тому самому сегменті, що й `target`).

Корекційний seek (правило hard drift) замість `clamp(target + lead, …)` використовує `mediaAhead(target, lead, input)`. Без розрізів результат той самий, бо `segmentStart = −∞`, `segmentEnd = ∞` і `nextSegmentStart = ∞` (це регресійний тест). Без розрізів випадки 2 і 3 та `tailCut` не спрацьовують ніколи (`mediaTime < ∞`).

#### Синхронізація — `media/MediaSync.ts`
- **`syncTrack`**: `const target = timelineToMedia(position, map); const segment = mediaSegmentAt(target, map.cuts);` У `planMediaSync` передаються `segmentStart: segment.start`, `segmentEnd: segment.end`, `nextSegmentStart: segment.nextStart`.
- **Таймер точки розрізу.** Періодична перевірка (100 мс) запізнилась би на стрибок до 100 мс, і стільки вирізаного звуку було б чути. Тому:
  - `MediaSyncOptions.startTimeout?: (callback: () => void, delayMs: number) => () => void` (типово `window.setTimeout`/`clearTimeout`), поле `private stopCutTimer: (() => void) | null`;
  - `private scheduleCutCheck()` викликається в кінці кожного `runSync` (у `finally`, після скидання прапорців) і в `onClockChange`. Спершу скасовує попередній таймер. Якщо годинник `playing` і є доріжки: `p = clock.getPosition()`, `next = nextCutPoint(p, map)`. Якщо `next !== null`: `delayMs = ((clock.getStartDelay?.() ?? 0) + next − p) / rate * 1000 + CUT_CHECK_DELAY_MS`, і `stopCutTimer = startTimeout(syncAll, max(0, delayMs))`;
  - `CUT_CHECK_DELAY_MS = 2`: перевірка відбувається трохи після точки розрізу, коли `target` уже за розрізом;
  - таймер переплановується на кожному проході (кожні 100 мс під час відтворення), тож зміни швидкості, seek і нові розрізи враховуються. `disconnectClock` і `detach` останньої доріжки його скасовують.
- **`onTrackSeek`** не змінюється. Клік по waveform правої панелі всередині розрізу дає `mediaToTimeline` = точка розрізу, а обов'язковий прохід 015 ставить медіа на кінець розрізу (так само, як клік у вступ ставить на такт 1).
- **`updateMediaDuration`** не змінюється: `mediaTimelineEnd` уже враховує розрізи.
- **`setTimeMap`** не змінюється: `sameMediaTimeMap` тепер порівнює й розрізи.

#### Транспорт у React
- `TransportProvider`: `const timeMap = useMediaTimeMap();` + `useEffect(() => mediaSync.setTimeMap(timeMap), [mediaSync, timeMap])` замість ефекту лише з offset.
- `TransportApi` (`transportContext.ts`):
  ```ts
  /** Applies a whole media time map at once (cut edge preview); with `seekTo` the transport seeks in the same sync pass. */
  applyMediaTimeMap(map: MediaTimeMap, seekTo?: number): void;
  ```
  Реалізація: `mediaSync.batch(() => { mediaSync.setTimeMap(map); if (seekTo !== undefined) transport.seek(seekTo); })`.
- `applyMediaOffset(offset, seekTo)` тепер зберігає поточні розрізи: `{ offset: normalizeMediaOffset(offset), cuts: mediaSync.getTimeMap().cuts }`. Інакше перетягування позначки такту 1 тимчасово «скасовувало» б розрізи.
- `ImportButton`: `replaceProject({ ...result.project, mediaOffset: current.mediaOffset, mediaCuts: current.mediaCuts })`. Причина та сама, що для offset (015): файл не знає про медіа, а медіа лишається завантаженим. Undo повертає попередній проект цілком.

#### UI розрізів на смузі (`MediaTimeline`)
Етап 2 додає в `.media-timeline` (поряд із `__track`, не всередину нього) позначки розрізів, а всередину `__track` — виділення. Нові локальні стани: `selection: TimeRange | null` (секунди таймлайну), `menu: { x, y, items } | null`, жест виділення та жест межі (`useDragGesture`).

**1. Виділення протягуванням.** У `onMouseDown` смуги (ліва кнопка, `ready`):
- спершу seek у точку натискання, як на етапі 1;
- потім `selectionDrag.begin({ startPoint, initialPreview: null, update: (p) => clampSelection(t0, xToTime(p.x), extent), commit })`, де `clampSelection` — чиста функція в `utils/mediaTimeline.ts`: `{ start: min, end: max }`, обмежене до `extent`, або `null`, якщо після обмеження довжина < `MIN_MEDIA_CUT_SECONDS`;
- `commit(result, moved)`: з рухом — `setSelection(result)`, без руху (простий клік) — `setSelection(null)`.

Виділення малюється як `div.media-timeline__selection` (`left`/`width` у px, `pointer-events: none`) з `aria-label`, наприклад «Selected 0:05.000–0:08.000». Під час жесту показується `drag.preview`. Виділення скидається клавішею `Escape` на смузі, простим кліком, після вирізання і коли змінюється відображення проекту (`useEffect` на `timeMap`).

**2. Контекстне меню.** Меню рендериться компонентом `ContextMenu` з `label="Media timeline actions"`. `onContextMenu` на `__track`:
- точка `t` у виділенні → `preventDefault()` і меню з одним пунктом **«Delete range»**;
- інакше власного меню немає й `preventDefault` не викликається.

`onContextMenu` на позначці розрізу (з `stopPropagation()`): меню з пунктом **«Remove cut»**.

Дії пунктів:
- «Delete range»: `range = cutRangeForSelection(selection, timeMap, duration)`; якщо не `null`, то `dispatch(addMediaCut(range))` і `setSelection(null)`;
- «Remove cut»: `dispatch(removeMediaCut(id))`.

**Фокус після дії.** Після «Delete range» і «Remove cut» (з меню чи клавішею `Delete`) фокус переходить на слайдер смуги `Media position` (`trackRef.current.focus()`), а не повертається на елемент, що мав його до меню. Межа, яка мала фокус, могла зникнути: розріз прибрано або поглинуто новим, з новим id. `ContextMenu` повертає фокус лише при закритті без вибору (Escape, клік поза меню).

**3. Компонент `components/ContextMenu.tsx` (новий)**
```ts
export interface ContextMenuItem { readonly label: string; readonly onSelect: () => void; }
interface ContextMenuProps {
  /** Viewport coordinates of the pointer. */
  readonly x: number;
  readonly y: number;
  readonly label: string;
  readonly items: readonly ContextMenuItem[];
  /** Called after an item is chosen and on Escape, a mousedown outside, scroll, resize or window blur. */
  readonly onClose: () => void;
}
```
- Рендериться через `createPortal(…, document.body)` як `<ul role="menu" aria-label={label} className="context-menu" style={{ left, top }}>` з `<li role="none"><button type="button" role="menuitem">…</button></li>`. Через портал меню не обрізається `overflow` scroll-контейнера.
- Позиція — `position: fixed`. У `useLayoutEffect` її обмежує чиста функція `fitMenuPosition(x, y, menuWidth, menuHeight, viewportWidth, viewportHeight)` у `utils/contextMenu.ts`: меню не виходить за вікно, з відступом 4 px.
- **Фокус:** при відкритті — на першому пункті. `ArrowDown`/`ArrowUp` циклічно переводять фокус між пунктами, `Home`/`End` — на перший/останній. `Enter`/`Space` — нативна кнопка. `Escape` закриває меню (з `preventDefault`, щоб не спрацювали інші обробники) і повертає фокус на елемент, який мав фокус до відкриття.
- Вибір пункту: `onClose()`, потім `onSelect()`.
- Закриття ззовні — слухачі на `window`: `mousedown` поза меню, `resize`, `blur` і `scroll` (у фазі capture, щоб спрацювало й на прокрутку piano roll). Під час відкритого меню `MediaTimeline` не починає нових жестів, бо `mousedown` поза меню лише закриває його.
- CSS (`App.css`): `.context-menu { position: fixed; z-index: 100; margin: 0; padding: 4px 0; list-style: none; background: var(--panel); border: 1px solid var(--border); border-radius: 4px; box-shadow: 0 4px 12px rgb(0 0 0 / 40%); min-width: 140px }`, пункти на всю ширину, `:hover`/`:focus` — підсвітка.

**4. Позначки розрізів.** Для кожного розрізу, у якого точка `p = mediaToTimeline(cut.start, shownMap)` лежить у `[0, durationSeconds]`:
```tsx
<div className="media-timeline__cut" data-cut-id={cut.id} style={{ left: x(p) }} title={`${cutDescription(cut)}. Notes stay on the timeline and do not move with the media.`} onContextMenu={...}>
  <div role="slider" tabIndex={0} className="media-timeline__cut-edge media-timeline__cut-edge--start"
       aria-label={`Start of cut ${n}`} aria-valuemin={limits.start} aria-valuemax={limits.end}
       aria-valuenow={cut.start} aria-valuetext={cutDescription(cut)} onMouseDown={...} onKeyDown={...} />
  <div role="slider" … --end aria-label={`End of cut ${n}`} aria-valuenow={cut.end} … />
  {dragging this cut && <span className="media-timeline__cut-label">{cutDescription(previewCut)}</span>}
</div>
```
- `n` — порядковий номер розрізу (від 1) у відсортованому списку.
- `shownMap` — відображення з попереднім переглядом: під час жесту межі в ньому розріз з `drag.preview`, інакше `timeMap` проекту. Від `shownMap` рахуються і смуга медіа, і всі позначки, тож під час перетягування вони рухаються узгоджено.
- Розміри: позначка 12 px (`margin-left: −6px`), ліва половина — межа `start`, права — `end`, `cursor: ew-resize`. Вертикальна лінія кольору нової змінної `--cut: #ff6b6b`, «ножиці»-трикутник угорі (CSS `::before`). Позначка лежить над `__track` (`z-index: 1`), а `mousedown` на ній не доходить до смуги (`stopPropagation`).

**5. Перетягування межі** — `edgeDrag = useDragGesture<MediaCut>`. На `mousedown` межі (ліва кнопка):
- `preventDefault()`, `stopPropagation()`, `focusFromPointer(edge)`;
- `limits = cutEdgeLimits(cuts, id, edge, duration, offset)`, `committedRef.current = false`;
- `begin({ startPoint, initialPreview: null, update, commit })`:
  - `update(p)`: `value = draggedCutEdge(cut[edge], (p.x − startPoint.x) / pixelsPerSecond, limits)`, `preview = { ...cut, [edge]: value }`, `previewMap = { offset, cuts: cuts.map(c => c.id === id ? preview : c) }`. Потім попередній перегляд у синхронізації: `{ previewMap, seekTo }` записується в `pendingPreviewRef`, і якщо кадр ще не заплановано, `requestAnimationFrame(flushPreview)`. `flushPreview` викликає `transportApi.applyMediaTimeMap(previewMap, seekTo)` для останнього значення. Так синхронізація отримує не більше однієї мапи за кадр, а не жорсткий seek граючого медіа на кожен `mousemove`. Коли транспорт не грає, `seekTo` — це точка розрізу в `previewMap` для межі `end` (кадр, що піде одразу після розрізу) або `max(0, точка − 0.001)` для межі `start` (останній кадр перед розрізом). Під час відтворення `seekTo` не передається. Повертає `preview` (смуга й позначки оновлюються одразу, без чекання кадру);
  - `commit(result, moved)`: `committedRef.current = true`, скасувати запланований кадр (`cancelAnimationFrame`, `pendingPreviewRef.current = null`). Якщо `moved && result`: синхронно `applyMediaTimeMap(previewMap)` і `dispatch(updateMediaCut(id, result))`. Інакше `applyMediaTimeMap(timeMap проекту)`. Ефект на Escape так само спершу скасовує запланований кадр. Розмонтування компонента теж скасовує кадр;
  - Escape (без commit) повертає відображення проекту через ефект на перехід `edgeDrag.preview` з об'єкта в `null` без `committedRef`. Це той самий підхід, що в `MediaOffsetMarker` (015).

Один жест — одна дія, тобто один крок undo. Простий клік без руху нічого не змінює.

**Семантика межі на таймлайні.** Межа `start`: зсув курсора на Δ с переносить початок розрізу на Δ с медіа, і позначка рухається разом з курсором. Межа `end`: зсув на Δ подовжує (Δ > 0) або вкорочує розріз з кінця. Позначка лишається на місці, а смуга медіа праворуч від неї стискається чи розтягується, і підпис показує новий проміжок. Обидва випадки — один сегмент, тож секунда таймлайну дорівнює секунді медіа (межі обмежені сусідами).

**6. Клавіатура.**
- Межа у фокусі: `cutEdgeForKey(cut[edge], key, shiftKey, limits)`. `ArrowLeft`/`ArrowRight` ∓/±0.01 с, з `Shift` — 0.1 с. Результат → `dispatch(updateMediaCut(...))`, одне натискання — один крок undo. `Delete`/`Backspace` → `dispatch(removeMediaCut(id))`. Обидва випадки з `preventDefault()`.
- Смуга (`__track`) у фокусі, є виділення: `Delete`/`Backspace` → «Delete range», `Escape` → скинути виділення. Обидва з `preventDefault()`. Глобальні скорочення ці клавіші не обробляють (`editorShortcutFor` діє лише на сфокусованих сітці й доріжці педалей).

**7. Розрізи на waveform правої панелі — `components/MediaCutsShade.tsx` (новий).** Він лише відображає розрізи, щоб було видно, яку частину файлу вирізано. Рендериться в `overlay` `AudioTrack` разом із позначкою такту 1: `App.tsx` передає `overlay={<><MediaCutsShade /><MediaOffsetMarker /></>}`.
- Розмітка: `<div className="media-cuts-overlay">` (`position: absolute; inset: 0; pointer-events: none; z-index: 2`), а в ньому для кожного розрізу `div.media-cuts-overlay__cut` з `left: start/duration·100%` і `width: (min(end, duration) − start)/duration·100%`, з косою штриховкою (`repeating-linear-gradient` кольору `--cut` з прозорістю) і `title={cutDescription(cut)}`.
- Розрізи з `start ≥ duration` не рендеряться. Без готового медіа компонент повертає `null`.
- Чиста функція `cutShadePercent(cut, duration): { left: number; width: number } | null` лежить в `utils/mediaCuts.ts`.

## Кроки реалізації

### Етап 1 — `feature/016a-media-timeline`
1. Від актуального `main` створити гілку `feature/016a-media-timeline`.
2. **Чисті функції.** `utils/mediaTimeline.ts` (`mediaTimelineExtent`, `hiddenIntroSeconds`, `timelineSeekForKey`, `mediaPositionText`, константи кроків) + `mediaTimeline.test.ts`. `MEDIA_TIMELINE_HEIGHT_PX` у `pianoRollGeometry.ts`. Коміт `feat: add pure functions for the media timeline`.
3. **Хук.** `state/useMediaTimeMap.ts` + `useMediaTimeMap.test.tsx`. Коміт `feat: share the project media time map through a hook`.
4. **Рядок у piano roll.** `PianoRoll.tsx`: prop `mediaTimeline` і тип `MediaTimelineGeometry`, нові комірки, `top` лінійки. CSS у `PianoRoll.css`. Тести в `PianoRoll.test.tsx` (доповнення). Коміт `feat: add a media timeline row above the piano roll ruler`.
5. **Компонент.** `components/MediaTimeline.tsx`, `MediaTimeline.css`, `MediaTimeline.test.tsx`. `App.tsx` передає `mediaTimeline`. `App.test.tsx`: доповнення. Коміт `feat: show and seek the media on a timeline above the piano roll`.
6. **Прибрати повзунок.** `VideoPlayer.tsx`, `App.css`, видалити `utils/seekSlider.ts` і його тест, зміни тестів з розділу «Прибирання повзунка». Коміт `refactor: remove the video seek slider from the media panel`.
7. **E2E.** `frontend/e2e/media-timeline.spec.ts`. Коміт `test: check the media timeline in the browser`.
8. **README.** У «Синхронізація» новий підрозділ «Таймлайн медіа»: смуга над лінійкою, клік і клавіші перемотують, масштаб і прокрутка як у piano roll, вступ до такту 1 підписано. У «Відео» замінити згадку про повзунок на «перемотування — смуга таймлайну, waveform або ±5 s». Коміт `docs: describe the media timeline`.
9. Усі перевірки з DoD етапу 1 і ручна перевірка етапу 1.
10. У гілці до злиття: у CLAUDE.md `[x]` для 2.8 «Таймлайн відео над piano roll», статус 016 у розділі 8 — «в роботі (етап 1 виконано)». Коміт `docs: mark stage 1 of task 016 as done`.
11. `git checkout main && git merge --no-ff feature/016a-media-timeline`, повторні перевірки на `main` (включно з e2e), `git push origin main` і гілки.

### Етап 2 — `feature/016b-media-cuts`
1. Від актуального `main` (з етапом 1) створити гілку `feature/016b-media-cuts`.
2. **Backend.** `MediaCut`, константи, `media_cuts`, перевірки порядку й id. Фікстур: `"mediaCuts": []`. Тести з розділу «Етап 2 → Backend». `uv run pytest`, ruff, mypy. Коміт `feat: store media cuts in the project model`.
3. **Модель frontend.**
   - `types.ts` (`MediaCut`, `mediaCuts`), `constants.ts`, `validation.ts` (форма, `validateMediaCut`, порядок, дублікати, ліміт), `Transport.ts` (`EMPTY_PROJECT.mediaCuts: []`);
   - у кожному тестовому фікстурі, де `tsc` вимагає поле, додати лише рядок `mediaCuts: []`. Орієнтовно це ті самі файли, що в кроці 3 плану 015, точний список дасть `npm run typecheck`;
   - тести валідації.

   Коміт `feat: add media cuts to the frontend project model`.
4. **Розрізи.** `utils/mediaCuts.ts` + `mediaCuts.test.ts`. Коміт `feat: add pure functions that add, merge and edit media cuts`.
5. **Дії.** `actions.ts`, `projectReducer.ts`; тести reducer, history і `tempoRescale` (розрізи копіюються). Коміт `feat: add, change and remove media cuts as undoable actions`.
6. **Відображення.** `utils/mediaTimeMap.ts` (розрізи, `editedMediaTime`, `rawMediaTime`, `mediaSegmentAt`, `cutPoints`, `nextCutPoint`, `sameMediaTimeMap`) + тести. Наявні тести 015 у `mediaTimeMap.test.ts` будують мапи як `{ offset }`. Там, де `tsc` цього вимагає, додається лише `cuts: []`, очікування не змінюються. Doc-коментар `MediaTimeMap` оновити (прибрати «task 016 adds»). `useMediaTimeMap` — залежність від `mediaCuts`. Коміт `feat: skip cut media ranges when mapping media time onto the timeline`.
7. **Правила синхронізації.** `mediaSyncRules.ts`: поля сегмента, `mediaAhead`, правило стрибка, корекційний seek через `mediaAhead`. Тести. Коміт `feat: jump the media over cut ranges while playing`.
8. **MediaSync.** Поля сегмента в `syncTrack`, `startTimeout` і таймер точки розрізу. Тести (до `setup()` у `MediaSync.test.ts` додається фейковий `startTimeout`, що записує `{ callback, delayMs, cancelled }`). Коміт `feat: check the media exactly at cut points`.
9. **Транспорт у React.** `TransportProvider` (ефект з `useMediaTimeMap`, `applyMediaTimeMap`, `applyMediaOffset` з розрізами), `transportContext.ts`. Тести. Коміт `feat: apply project media cuts to the synchronization`.
10. **Імпорт.** `ImportButton`: розрізи зберігаються. Тест. `ExportButton.test`: доповнення. Коміт `feat: keep media cuts when a MIDI file is imported`.
11. **Контекстне меню.** `components/ContextMenu.tsx`, `utils/contextMenu.ts` (`fitMenuPosition`), CSS, тести. Коміт `feat: add a keyboard accessible context menu`.
12. **UI розрізів.** У `MediaTimeline`: виділення, меню, позначки, перетягування меж, клавіатура. У `utils/mediaTimeline.ts` — `clampSelection`. Компонент `MediaCutsShade.tsx`, `App.tsx` (overlay), CSS. Тести. Коміт `feat: cut media ranges on the media timeline and edit the cuts`.
13. **E2E.** `frontend/e2e/media-cuts.spec.ts`. Коміт `test: check media cuts in the browser`.
14. **README.** Новий підрозділ «Вирізання проміжків»:
    - виділення протягуванням, ПКМ → «Delete range» або `Delete`;
    - позначка розрізу, перетягування меж, стрілки на межі, ПКМ → «Remove cut» або `Delete` на межі;
    - undo/redo;
    - медіафайл не змінюється, на waveform розрізи заштриховано;
    - ноти не рухаються разом з медіа: якщо ноти вже записані, ноти після розрізу опиняться під пізнішим фрагментом медіа (тому спершу варто вирізати, а потім писати ноти; помилку скасовує Ctrl+Z);
    - розріз комбінується з offset (такт 1 усередині розрізу = кінець розрізу; межі такого розрізу не переходять через такт 1);
    - при імпорті `.mid` розрізи лишаються, в експорт не потрапляють.

    Коміт `docs: describe media cuts`.
15. Усі перевірки з DoD етапу 2 і ручна перевірка етапу 2.
16. У гілці до злиття:
    - у CLAUDE.md `[x]` для «Вирізання проміжків» і «Розріз можна поправити»;
    - модель `Project` у розділі 7 з `mediaCuts`;
    - статус 016 у розділі 8 — «виконано»;
    - статус плану — `виконано`.

    Коміт `docs: mark task 016 as done`.
17. `git checkout main && git merge --no-ff feature/016b-media-cuts`, повторні перевірки на `main` (включно з e2e), `git push origin main` і гілки.

## Тести

### Етап 1

**`utils/mediaTimeline.test.ts` (новий):**
- `mediaTimelineExtent(30, { offset: 0 })` → `{ start: 0, end: 30 }`; `(30, { offset: 3.2 })` → `{ start: 0, end: ≈26.8 }`; `(30, { offset: -2 })` → `{ start: 2, end: 32 }`; `(2, { offset: 5 })` → `null`; `(0, { offset: 0 })` → `null`.
- `hiddenIntroSeconds({ offset: 3.2 }) === 3.2`; `({ offset: -1 }) === 0`; `({ offset: 0 }) === 0`.
- `timelineSeekForKey(1, 'ArrowRight', false, 30) === 1.1`; `(1, 'ArrowLeft', true, 30) === 0`; `(29.95, 'ArrowRight', false, 30) === 30`; `(5, 'Home', false, 30) === 0`; `(5, 'End', false, 30) === 30`; `(5, 'a', false, 30) === null`; `(0, 'ArrowRight', false, 0) === null`; `(1.0000001, 'ArrowRight', false, 30) === 1.1` (округлення до мс).
- `mediaPositionText(1.5, { offset: 3.2 })` → `'0:01.500 (media 0:04.700)'`; `(1, { offset: -2 })` → `'0:01.000'` (медіа ще не почалось).

**`state/useMediaTimeMap.test.tsx` (новий):** `renderHook` у `ProjectProvider` з `mediaOffset: 1.5` → `{ offset: 1.5 }`. Після dispatch нової ноти — **той самий** об'єкт (`toBe`). Після `setMediaOffset(2)` — новий об'єкт з `offset: 2`.

**`components/PianoRoll/PianoRoll.test.tsx` (доповнення, наявні тести не змінюються):**
- «renders the media timeline row when asked»: `<PianoRoll mediaTimeline={(g) => <div data-testid="mt">{`${g.durationSeconds}/${g.pixelsPerSecond}`}</div>} />` → `mt` має текст `60/100`. Батьківський елемент — `.piano-roll__media`. Є кут з текстом `Media`. `.piano-roll__ruler` має `style.top === '28px'`.
- «has no media timeline row by default»: без prop немає `.piano-roll__media`, а `style.top` лінійки порожній.

**`components/MediaTimeline.test.tsx` (новий).** Обгортка як у `MediaOffsetControls.test.tsx`: `ProjectProvider (initialProject) > EditorProvider > TransportProvider (fake engine) > AudioTrackProvider (fakes) > VideoProvider (fakes) > MediaSyncBridge`, потім `<MediaTimeline durationSeconds={60} pixelsPerSecond={100} />`, `AudioTrack` (щоб завантажити файл через `Audio file`) і проба `useTransportState().position`. `getBoundingClientRect` у `.media-timeline__track` замокано: `left 0, width 6000`.
- Без медіа: слайдер `Media position` має `aria-disabled="true"` і `tabIndex -1`, видно текст `Load audio or video to see its timeline here`, `.media-timeline__media` немає. `mouseDown` (`clientX 250`) → позиція транспорту лишається `0`.
- `.media-timeline` має `style.width === '6000px'`.
- Аудіо 30 с `ready` → `.media-timeline__media` має `left: 0px; width: 3000px`, підказки немає.
- `initialProject.mediaOffset = 3.2` → ширина смуги `2680px`, текст `0:03.200 before bar 1`.
- `mediaOffset = -2` → `left: 200px; width: 3000px`.
- `mouseDown` ПКМ (`button: 2`) → позиція не змінилась.
- `mouseDown` лівою (`clientX 250`) → позиція `2.5`, у викликах плеєра є `setTime:2.5`, слайдер у фокусі.
- Клавіші на слайдері: `ArrowRight` → `2.6`; `Shift+ArrowRight` → `3.6`; `End` → `30`; `Home` → `0`. `aria-valuetext` після `Home` — `0:00.000 (media 0:00.000)`.
- Space на слайдері не запускає відтворення: `KeyboardShortcuts` разом з компонентом, `keyDown(' ', code 'Space')` → статус транспорту не `playing`.

**`components/VideoPlayer.test.tsx`, `App.test.tsx`, `MediaSyncBridge.test.tsx`:** зміни з розділу «Прибирання повзунка». Плюс у `App.test.tsx` нове: регіон «Piano roll» містить групу `Media timeline` і слайдер `Media position`, а регіон «Video» не містить слайдера `Seek video`.

**E2E — `frontend/e2e/media-timeline.spec.ts` (новий).** Помічники `recordTestVideo`, `loadVideo` (`e2e/media.ts`), `grid` і `openApp` (`e2e/helpers.ts`). `band = page.locator('.media-timeline__media')`, `track = page.getByRole('slider', { name: 'Media position' })`.
1. **Смуга вирівняна з сіткою.** Відео 2 с без звуку. `band` видно. `band.x` ≈ `grid.x` (±1 px), `band.width` ≈ 200 (±2). Слайдера `Seek video` немає (`toHaveCount(0)`).
2. **Клік перемотує.** Клік по `track` у точці `grid.x + 100` → `Playback position` `/^0:01\.0/`, `videoTime()` ≈ 1 (±0.05).
3. **Offset зсуває смугу.** Поле `Media offset (seconds)` = `0.5` + Enter → ширина `band` ≈ 150 (±2), `x` ≈ `grid.x`, видно `0:00.500 before bar 1`. Потім `-0.5` → `band.x` ≈ `grid.x + 50` (±2).
4. **Прокрутка спільна.** `page.locator('.piano-roll__scroll').evaluate(e => { e.scrollLeft = 60 })` → `band.x − grid.x` лишається ≈ 0 (±1), і обидва зсунулися ліворуч на 60 px відносно кроку 1.
5. **Немає горизонтального переповнення сторінки** (`expectNoHorizontalOverflow` з `e2e/media.ts`) після завантаження відео.

**Ручна перевірка етапу 1** (`cd backend && uv run uvicorn app.main:app`, `cd frontend && npm run dev`):
1. Без медіа смуга над лінійкою показує підказку, клік нічого не робить.
2. Завантажити відео → смуга займає рівно ту частину таймлайну, де лежить відео. Зум (Ctrl+колесо або кнопки зуму) і прокрутка зберігають вирівнювання з лінійкою.
3. Клік по смузі перемотує відео й playhead. Tab до смуги, стрілки та Shift+стрілки перемотують, Space на смузі не запускає відтворення.
4. Offset 3.2 → смуга коротшає на 3.2 с, з'являється підпис вступу. Offset −1.5 → смуга починається з 1.5 с.
5. У правій панелі немає повзунка «Seek video», а ±5 s і клік по waveform працюють.
6. Змінити ширину панелі (014) → смуга і сітка лишаються вирівняні, горизонтальної прокрутки сторінки немає.
7. Консоль без помилок і попереджень React.

### Етап 2

**Backend:**
- `tests/test_project_models.py` (доповнення):
  - без `mediaCuts` → `media_cuts == []`;
  - `{"mediaCuts": [{"id": "c1", "start": 2, "end": 5}]}` приймається, `model_dump(by_alias=True)["mediaCuts"] == [{"id": "c1", "start": 2.0, "end": 5.0}]`;
  - відхиляються (`ValidationError`): `end − start = 0.005`, `start = -1`, `end = 90000`, `nan`, дублікати id, порядок `[{5,8},{2,3}]`, перетин `[{2,5},{4,6}]`;
  - дотик `[{2,5},{5,6}]` приймається;
  - 1001 розріз → `ValidationError`.
- `tests/test_midi_export.py`: `test_media_cuts_do_not_change_the_file`. Фікстур з `media_cuts=[MediaCut(id="c", start=1, end=3)]` дає байт у байт той самий файл, що й без розрізів.
- `tests/test_export_api.py`: фікстур з `"mediaCuts": [{"id":"c","start":1,"end":3}]` → 200 і те саме тіло. З перетином → 422.
- `tests/test_import_api.py`: `body["project"]["mediaCuts"] == []`. Наявний round-trip тест фікстуру проходить з оновленим фікстуром.

**`utils/mediaTimeMap.test.ts` (доповнення; `C = [{ start: 2, end: 5 }]`, `CC = [{ start: 2, end: 5 }, { start: 6, end: 8 }]`):**
- `editedMediaTime`: `(1, C) === 1`, `(2, C) === 2`, `(3, C) === 2`, `(5, C) === 2`, `(6, C) === 3`, `(9, CC) === 4`.
- `rawMediaTime`: `(1.9, C) === 1.9`, `(2, C) === 5`, `(3, C) === 6`, `(3, CC) === 8`, `(2.5, CC) === 5.5`.
- Offset 0 і `C`: `mediaToTimeline(6) === 3`; `timelineToMedia(2) === 5`; `timelineToMedia(1.999)` ≈ 1.999.
- Offset 1 і `C`: `mediaToTimeline(6) === 2`; `timelineToMedia(1) === 5`; `timelineToMedia(0.5) === 1.5`.
- Offset 3 (усередині `C`): `timelineToMedia(0) === 5`; `mediaToTimeline(5) === 0`; `mediaToTimeline(1) === -1`.
- Offset −2 і `C`: `mediaToTimeline(0) === 2`; `mediaToTimeline(6) === 5`; `timelineToMedia(4) === 5`.
- `mediaTimelineEnd(10, { offset: 0, cuts: CC }) === 5`; `(30, { offset: 3.2, cuts: [{ start: 10, end: 15 }] })` ≈ 21.8.
- Туди й назад: `t ∈ {0, 0.5, 1.999, 2, 3.5, 10}`, `offset ∈ {-2, 0, 1, 3}`, `cuts ∈ {[], C, CC}` → `mediaToTimeline(timelineToMedia(t)) ≈ t` (`toBeCloseTo(t, 9)`).
- `sameMediaTimeMap({ offset: 0, cuts: [{ start: 2, end: 5 }] }, { offset: 0, cuts: [{ start: 2, end: 5 }] }) === true` (різні масиви); з `end: 5.001` → `false`; `[]` проти `C` → `false`.
- `mediaSegmentAt(1, CC)` → `{ start: -Infinity, end: 2, nextStart: 5 }`; `(5, CC)` → `{ start: 5, end: 6, nextStart: 8 }`; `(8.5, CC)` → `{ start: 8, end: Infinity, nextStart: Infinity }`.
- `cutPoints({ offset: 0, cuts: CC })` → `[2, 3]`; з offset 1 → `[1, 2]`.
- `nextCutPoint(0, { offset: 0, cuts: CC }) === 2`; `(2, …) === 3`; `(2.5, …) === 3`; `(3, …) === null`. Offset 3 і `C` (точка 0) → `nextCutPoint(0) === null`.
- `mediaTimeMapOf({ mediaOffset: 1, mediaCuts: [{ id: 'a', start: 2, end: 5 }] }).cuts` — той самий масив (`toBe`).

**`utils/mediaCuts.test.ts` (новий):**
- `normalizeCutRange({ start: 2.0004, end: 5.0006 })` → `{ 2, 5.001 }`; `({ start: -1, end: 3 })` → `{ 0, 3 }`; `({ start: 2, end: 2.005 })` → `null`; `({ start: NaN, end: 3 })` → `null`; `({ start: 5, end: 2 })` → `null`.
- `addCut([], a{2,5})` → `[a]`; `addCut([a{2,5}], b{6,8})` → `[a, b]` за порядком; `addCut([b{6,8}], a{2,5})` → `[a, b]`; `addCut([a{2,5}, b{6,8}], c{4,7})` → `[{ id: 'c', start: 2, end: 8 }]`; `addCut([a{2,5}], c{5,6})` (дотик) → `[{ id: 'c', 2, 6 }]`; `addCut([a{2,5}], c{3,4})` → той самий масив (`toBe`); переповнення `MAX_MEDIA_CUTS` → той самий масив.
- `updateCut([a{2,5}, b{6,8}], 'a', { 2, 5.5 })` → `a.end === 5.5`, `b` той самий об'єкт; `(…, 'a', { 2, 6 })` (дотик до `b`) → `null`; `(…, 'x', …)` → `null`; `(…, 'a', { 2, 5 })` → той самий масив.
- `removeCut([a, b], 'a')` → `[b]`; `removeCut([a], 'x')` → той самий масив.
- `cutEdgeLimits([a{2,5}, b{6,8}], 'b', 'start', 30, 0)` → `{ start: 5.001, end: 7.99 }`; `('b', 'end', 30, 0)` → `{ start: 6.01, end: 30 }`; `('a', 'end', 30, 0)` → `{ start: 2.01, end: 5.999 }`; `('a', 'start', 30, 1)` → `{ start: 1, end: 4.99 }` (зупинка на offset).
  - Розріз містить offset (`[a{2,5}]`, offset 3): `cutEdgeLimits([a], 'a', 'end', 30, 3)` → `{ start: 3, end: 30 }`; `(…, 'a', 'start', 30, 3)` → `{ start: 0, end: 3 }`.
  - Offset на межі розрізу: `([a{2,5}], 'a', 'end', 30, 5)` → `{ start: 5, end: 30 }`; `([a{2,5}], 'a', 'start', 30, 2)` (start = offset, перше правило) → `{ start: 2, end: 4.99 }`.
  - Offset дуже близько до `start`: `([a{2,5}], 'a', 'end', 30, 2.001)` → `start: 2.01` (`start + MIN` більше за offset).
  - Розріз цілком у вступі: `([a{2,5}], 'a', 'end', 30, 8)` → `{ start: 2.01, end: 30 }` (обмеження offset немає).
  - `('b', 'end', 0, 0)` → `end: MAX_MEDIA_CUT_END`.
- `draggedCutEdge(5, 0.5, { 2.01, 30 }) === 5.5`; `(5, -10, { 2.01, 30 }) === 2.01`; `(5, 0.00049, …) === 5`.
- `cutEdgeForKey(5, 'ArrowRight', false, L) === 5.01`; `('ArrowLeft', true)` → `4.9`; `'a'` → `null`; обмеження межами.
- `cutRangeForSelection({ 5, 8 }, { offset: 0, cuts: [] }, 30)` → `{ 5, 8 }`. З `{ offset: 1, cuts: [] }` → `{ 6, 9 }`. З `{ offset: 0, cuts: [{ 2, 5 }] }` і вибором `{ 1, 3 }` → `{ 1, 6 }` (перекриває наявний розріз; reducer його об'єднає). `({ 25, 40 }, …, 30)` → `{ 25, 30 }`. `({ 31, 40 }, …, 30)` → `null`.
- `cutDescription({ start: 5, end: 8 })` → `'Cut 0:05.000–0:08.000 (3.000 s)'`.
- `cutShadePercent({ start: 3, end: 6 }, 30)` → `{ left: 10, width: 10 }`; `({ 25, 40 }, 30)` → `{ left: ≈83.33, width: ≈16.67 }`; `({ 31, 40 }, 30)` → `null`; `(…, 0)` → `null`.

**`state/projectReducer.test.ts` (доповнення, `describe('media cuts')`):**
- `addMediaCut({ 2, 5 })` → `mediaCuts` з одним розрізом `{ 2, 5 }`; `notes`, `pedals`, `mediaOffset` ті самі (`toBe`).
- Додати `{ 2, 5 }`, потім `{ 4, 7 }` → один розріз `{ 2, 7 }`.
- `addMediaCut({ 2, 2.005 })`, `({ NaN, 3 })`, і `{ 3, 4 }` всередині наявного → той самий `state`.
- `updateMediaCut(id, { 2, 6 })` → `end 6`. Перетин із сусідом → той самий `state`. Невідомий id → той самий `state`.
- `removeMediaCut(id)` → `[]`; невідомий id → той самий `state`.
- `setBpm(60)` на стані з розрізами → `mediaCuts` той самий масив.

**`state/history.test.ts` (доповнення):** додати розріз, змінити його межу, прибрати → `past.length + 3`. Три `undo()` повертають `mediaCuts` у стан `[]` (на кожному кроці попередній об'єкт `toBe`), а `redo()` повторює.

**`state/validation.test.ts` (доповнення):**
- `parseProject` без `mediaCuts` → `{ path: 'mediaCuts', message: 'is required' }`;
- розріз із зайвим полем → `mediaCuts[0].foo: is not allowed`;
- `end − start < 0.01` → `mediaCuts[0].end`;
- непосортовані чи перетин → `mediaCuts[1]`;
- дублікати id → `mediaCuts[1].id`;
- фікстур `sample_project.json` проходить.

**`utils/tempoRescale.test.ts` (доповнення):** `rescaleProjectTempo({ ...project, mediaCuts: C }, 60).mediaCuts` — той самий масив (`toBe`).

**`media/mediaSyncRules.test.ts` (доповнення).** База: `I` грає (`transportPlaying: true, mediaPlaying: true, duration: 30, now: 100`), `S` з `lastSeekAt: 99.5` (cooldown активний).
- **Стрибок через пройдений розріз.** `{ target: 5.1, segmentStart: 5, mediaTime: 1.95 }`, `seekLead 0` → `seekTo: 5.1`, `play: false`, `pause: false`, стан `lastSeekAt: 100`, `checkAfterSeek: false`, `seekStreak` той самий. З `seekLead 0.2` → `5.3`. З `segmentEnd: 5.2, nextSegmentStart: 8` і `seekLead 0.2` → `8.1`.
- **Медіа зайшло в розріз раніше.** `{ target: 1.98, segmentEnd: 2, nextSegmentStart: 5, mediaTime: 2.01 }` → `seekTo: 5.01`.
- **Медіа вже за розрізом, target ще перед ним (немає другого стрибка).** `{ target: 1.98, segmentEnd: 2, nextSegmentStart: 5, mediaTime: 5.02 }` → `seekTo === null`, `pause: false`, `nudge: 1`, стан без змін (`toEqual(S)`). Те саме **без** cooldown (`lastSeekAt: -Infinity`) → теж `seekTo === null` (корекційного seek-а назад немає, бо `editedDrift = 0.04 ≤ 0.25`).
- **Медіа далеко за розрізом.** Без cooldown, `{ target: 1, segmentEnd: 2, nextSegmentStart: 5, mediaTime: 9 }` (`editedDrift = 5`) → корекційний seek `seekTo: 1` (`seekLead 0`), тобто перед розрізом, а `seekStreak + 1`.
- **Розріз до кінця файлу, медіа грає.** `{ target: 24.97, segmentEnd: 25, nextSegmentStart: 30, duration: 30, mediaTime: 25.0, mediaPlaying: true }` → `{ seekTo: null, play: false, pause: true, nudge: 1 }`. Те саме з `mediaTime: 24.96` (target уже в межах `END_GUARD` до розрізу) → `pause: true`, `seekTo: null`.
- **Розріз до кінця файлу, медіа на паузі.** `{ target: 24.97, segmentEnd: 25, nextSegmentStart: 30, duration: 30, mediaTime: 25.0, mediaPlaying: false }` і `S.playRequested: true` → `play: false`, `seekTo: null`, `state.playRequested === false` (блок `!mediaPlaying` не запускає медіа знову).
- **Розріз до кінця, ще далеко.** `{ target: 20, segmentEnd: 25, nextSegmentStart: 30, duration: 30, mediaTime: 20, mediaPlaying: true }` → `NO_ACTION` (правило `tailCut` не діє).
- **Play з 0 після паузи в кінці (зауваження рев'ю, раунд 2).** `{ target: 0, segmentEnd: 25, nextSegmentStart: 30, duration: 30, mediaTime: 30, mediaPlaying: false }`, стан `INITIAL_TRACK_SYNC_STATE` → `seekTo: 0`, `play: true`, `pause: false`, `state.playRequested === true` (блок `!mediaPlaying`, а не `tailCut`).
- **Медіа грає на межі хвостового розрізу, target на початку.** `{ target: 0, segmentEnd: 25, nextSegmentStart: 30, duration: 30, mediaTime: 25.0, mediaPlaying: true }`, `lastSeekAt: -Infinity`, `seekLead 0` → `seekTo: 0`, `pause: false` (корекційний seek на target; ні `tailCut`, ні стрибок випадку 2), `seekStreak + 1`, `checkAfterSeek: true`.
- **Те саме для звичайного розрізу.** `{ target: 0, segmentEnd: 2, nextSegmentStart: 5, mediaTime: 2.5, mediaPlaying: true }` без cooldown → `seekTo: 0` (випадок 2 не діє, бо target далеко), а не `5.5`.
- **Межа умови `tailCut` за `HARD_SEEK_DRIFT_SECONDS`.** `{ target: 24.8, segmentEnd: 25, nextSegmentStart: 30, duration: 30, mediaTime: 25.0, mediaPlaying: true }` → `pause: true`, `seekTo: null` (target у межах 0.25 с). Із `target: 24.7` → `tailCut` не діє: без cooldown дрейф 0.3 > 0.25 → корекційний seek `seekTo: 24.7`.
- **Стрибок і `seekStreak`.** `S.seekStreak = MAX_CORRECTION_SEEKS` → стрибок все одно виконується.
- **Без стрибка в межах сегмента (регресія).** `{ target: 3, segmentStart: -Infinity, segmentEnd: 10, mediaTime: 3.02 }` у cooldown → `NO_ACTION`.
- **Корекційний seek через розріз.** Без cooldown (`lastSeekAt: -Infinity`), `{ target: 3, mediaTime: 2, segmentEnd: 3.1, nextSegmentStart: 6 }`, `seekLead 0.3` → `seekTo` ≈ 6.2.
- **Без полів сегмента (регресія).** Наявний тест корекційного seek-а дає той самий `seekTo`, що й раніше.
- `mediaAhead(3, 0.3, { …, segmentEnd: 3.1, nextSegmentStart: 6 })` ≈ 6.2; `mediaAhead(5.05, -0.2, { …, segmentStart: 5 })` === 5; `mediaAhead(29.95, 0.5, { duration: 30 })` === 29.9.

**`media/MediaSync.test.ts` (доповнення).** `setup()` отримує фейковий `startTimeout`, що повертає функцію скасування і записує виклики в `timeouts: { callback, delayMs, cancelled }[]`.
- **Пауза на точці розрізу.** Годинник `paused` у 2, доріжка 30 с, `setTimeMap({ offset: 0, cuts: [{ start: 2, end: 5 }] })` → останній `setTime` — `'setTime:5'`.
- **Тривалість.** Доріжка 30 с, `{ offset: 3.2, cuts: [{ 10, 15 }] }` → `getMediaDuration()` ≈ 21.8.
- **Seek у розріз з waveform.** `FakeSyncClock({ notifyUnchangedSeek: false })`, годинник `paused` у 0, `cuts [{2,5}]`. `controller.seek(3)` → `clock.seeks` закінчується на `2`, останній `setTime` — `'setTime:5'`.
- **Таймер точки розрізу.** Годинник `playing` у 1.9, `rate 1`, `startDelay 0`, медіа грає в 1.9, `cuts [{2,5}]` → останній запис `timeouts` має `delayMs` ≈ 102 (`toBeCloseTo(102, 6)`). `clock.position = 2.002`, `player.currentTime = 2.002`, виклик `callback` → у викликах плеєра є `'setTime:5.002'`.
- **Медіа випереджає таймлайн і проходить точку розрізу до таймера (регресія до зауваження рев'ю 1).** `cuts [{2,5}]`, годинник `playing` у 1.98, медіа грає в 2.01. `player.calls.length = 0`, `fireTimer()` → рівно один `'setTime:5.01'`. Далі `player.currentTime = 5.03`, `clock.position = 1.99`, `fireTimer()` → нових `setTime` немає. Потім `clock.position = 2.03`, `player.currentTime = 5.04`, виклик `callback` останнього `timeouts` → нових `setTime` немає. Разом за розріз — рівно один `setTime`.
- **Розріз до кінця файлу.** Доріжка 30 с, `cuts [{25,30}]`, годинник `playing` у 24.95, медіа грає в 24.95. `fireTimer()` → `'pause'` у викликах плеєра і жодного `setTime` у `[25, 30)`.
- **Пауза в кінці, потім Play з 0 (регресія до зауваження рев'ю, раунд 2).** Доріжка 30 с, `cuts [{25,30}]`. Годинник `paused` у 40 (кінець таймлайну): медіа отримує `'setTime:30'`. `player.calls.length = 0`, потім `clock.set({ status: 'playing', position: 0 })` → у викликах плеєра є `'setTime:0'` і після нього `'play'`, а `'pause'` після `'play'` немає. Після `player.emitPlay()` і `fireTimer()` (годинник у 0.1, медіа в 0.1) нових `pause`/`setTime` немає.
- **Швидкість.** Те саме з `rate: 2` → `delayMs` ≈ 52. Зі `startDelay 0.05` при `rate 1` → ≈ 152.
- **Немає таймера**, коли розрізів попереду немає (годинник у 3 з `cuts [{2,5}]`) або годинник на паузі: `timeouts` без нових записів, а попередній `cancelled === true`.
- **Скасування.** Після `detachAll()` останній таймер `cancelled === true`.
- **Стрибок під час cooldown.** Годинник грає в 1.5, медіа в 1.5. Через дрейф виконано корекційний seek (cooldown активний). `clock.position = 2.01`, `player.currentTime = 1.99`, `fireTimer()` → `'setTime:5.01'` (стрибок не чекав cooldown).

**`state/TransportProvider.test.tsx` (доповнення).** `MediaProbe` отримує кнопки `cut` → `dispatch(addMediaCut({ start: 2, end: 5 }))` і `previewMap` → `api.applyMediaTimeMap({ offset: 0, cuts: [{ start: 2, end: 6 }] }, 2)`.
- «applies project cuts to the media»: `attach`, `loadReady(30)`, seek на 2, `click('cut')` → останній `setTime` — `'setTime:5'`, `media duration` → `'27'`.
- «applies a preview map and a seek in one pass»: `player.calls.length = 0`, `click('previewMap')` → `setTime` рівно `['setTime:6']`, позиція `2`.
- «keeps the cuts when the offset is applied»: після `cut` → `api.applyMediaOffset(1)` → `mediaSync.getTimeMap().cuts` має `{ 2, 5 }`. Перевіряється через `media duration` `'26'`.

**`components/ContextMenu.test.tsx` (новий):**
- рендер з двома пунктами → `role="menu"` з `aria-label`, два `menuitem`, перший у фокусі, `style.left/top` — передані координати (у jsdom розміри 0);
- `ArrowDown` → фокус на другому; `ArrowDown` → знову на першому; `End`/`Home`;
- клік по пункту → `onClose` і `onSelect` по одному разу, `onClose` раніше;
- `Escape` → `onClose`, фокус повернувся на кнопку, що мала його до відкриття;
- `mouseDown` на `document.body` → `onClose`; `mouseDown` усередині меню → ні;
- `scroll`/`resize`/`blur` на `window` → `onClose`.

`utils/contextMenu.test.ts`: `fitMenuPosition(10, 10, 100, 50, 800, 600)` → `{ 10, 10 }`; `(780, 590, 100, 50, 800, 600)` → `{ 696, 546 }`; `(-5, -5, …)` → `{ 4, 4 }`.

**`components/MediaTimeline.test.tsx` (доповнення для етапу 2).** Обгортка етапу 1 + проба `mediaCuts` (JSON) і кнопки Undo/Redo з `useHistoryApi()`. Аудіо 30 с `ready`, rect смуги `left 0, width 6000`.
- **Виділення.** `mouseDown` (`clientX 500`), `mouseMove` на `window` до `800`, `mouseUp` → `.media-timeline__selection` має `left: 500px; width: 300px`, `aria-label` `Selected 0:05.000–0:08.000`; позиція транспорту `5`.
- **Delete range.** `contextMenu` на смузі в `clientX 600` → меню `Media timeline actions` з пунктом `Delete range`. Клік → проба `[{ start: 5, end: 8 }]`, ширина `.media-timeline__media` `2700px`, позначка `.media-timeline__cut` з `left: 500px`, виділення й меню зникли. Останній `setTime` плеєра — `'setTime:8'` (playhead на точці розрізу показує медіа після розрізу).
- **ПКМ поза виділенням** (`clientX 1000`) → меню немає, `defaultPrevented === false`.
- **Undo/Redo.** Undo → `[]`, позначки немає. Redo → знову `{5, 8}`.
- **Клавіатура на смузі.** Виділити 5→8, фокус на `Media position`, `Delete` → розріз додано. `Escape` з виділенням → виділення зникло, розрізів не додано.
- **Об'єднання.** Розріз `{5, 8}`. Виділення 400→600 (таймлайн 4–6, тобто медіа 4–9) + «Delete range» → один розріз `{ 4, 9 }`.
- **З offset.** `initialProject.mediaOffset = 1`. Виділення 200→300 + «Delete range» → `{ start: 3, end: 4 }`. Позиція транспорту `2`, останній `setTime` — `'setTime:4'`.
- **Remove cut.** `contextMenu` на позначці → пункт `Remove cut`, клік → `[]`.
- **Перетягування межі `end`.** Розріз `{5, 8}`. `mouseDown` на `End of cut 1` (`clientX 503`), `mouseMove` на `window` до `553` → підпис `Cut 0:05.000–0:08.500 (3.500 s)` одразу, а плеєр **ще не** отримав `setTime:8.5`. Після `frames.flushFrame()` (`stubAnimationFrames`) плеєр отримав `setTime:8.5` (попередній перегляд на паузі). Два `mouseMove` (`553`, `563`) до одного `flushFrame()` дають рівно один новий `setTime` — `setTime:8.6`. `mouseUp` → проба `{ 5, 8.6 }`, запланований кадр скасовано (`cancelAnimationFrame` викликано або наступний `flushFrame()` не додає `setTime`). Один Undo → `{ 5, 8 }`.
- **Перетягування межі `start`.** `mouseDown` на `Start of cut 1` (`clientX 497`), рух до `397` → позначка `left: 400px` під час руху; `mouseUp` → `{ 4, 8 }`.
- **Обмеження.** Межу `end` тягнути до `clientX 5000` → `end === 30` (кінець медіа).
- **Розріз, що містить такт 1, його не відпускає.** `initialProject`: `mediaOffset: 3`, `mediaCuts: [{ id: 'c', start: 2, end: 5 }]`. Позначка має `left: 0px`. `mouseDown` на `End of cut 1` (`clientX 3`), `mouseMove` на `window` до `clientX -297` (Δ −3 с) → під час руху позначка лишається з `left: 0px` (не зникає), підпис `Cut 0:02.000–0:03.000 (1.000 s)`. `mouseUp` → проба `{ 2, 3 }`. Те саме для `Start of cut 1` (`mouseDown` у `clientX -3`, ліва половина позначки): рух на +300 px → `start === 3`, позначка лишається на `left: 0px`.
- **Escape.** Жест межі (з `flushFrame()` після руху) + `keyDown Escape` → проба `{ 5, 8 }`, а останній `setTime` плеєра — `'setTime:8'` (відображення проекту повернулось).
- **Фокус після дії.** Після «Delete range» з меню і після «Remove cut» клавішею `Delete` на межі фокус на слайдері `Media position`.
- **Клавіатура на межі.** Фокус `End of cut 1`, `ArrowRight` → `8.01`; `Shift+ArrowLeft` → `7.91`; `Delete` → `[]`. Кожна дія — окремий крок undo (три Undo повертають `{5, 8}`).

**`components/MediaCutsShade.test.tsx` (новий):** без медіа нічого не рендерить. Аудіо 30 с і `mediaCuts [{3,6}]` → `.media-cuts-overlay__cut` з `left: 10%; width: 10%` і `title` `Cut 0:03.000–0:06.000 (3.000 s)`. Розріз `{31, 40}` не рендериться.

**`components/ImportButton.test.tsx` (доповнення):** проект з `mediaCuts [{c,2,5}]`, імпорт → розрізи лишаються, ноти з файлу. Undo → попередній проект.

**`components/ExportButton.test.tsx` (доповнення):** тіло запиту містить `"mediaCuts":[{"id":"c","start":2,"end":5}]`.

**`App.test.tsx` (доповнення):** в overlay аудіодоріжки є `.media-cuts-overlay`, коли медіа готове (fake), а розрізів немає — порожній.

**E2E — `frontend/e2e/media-cuts.spec.ts` (новий).** Відео 4 с без звуку (`recordTestVideo`, `durationMs: 4000`), стандартний зум 100 px/с. `track`, `band` — як в етапі 1. `cutMark = page.locator('.media-timeline__cut')`.
1. **Вирізати проміжок.** `dragBetween` від `grid.x + 100` до `grid.x + 200` по смузі → видно виділення. ПКМ (`page.mouse.click(..., { button: 'right' })`) у `grid.x + 150` → меню з `Delete range` → клік. Ширина `band` ≈ 300 (±2), `cutMark` один, `x` центру ≈ `grid.x + 100` (±2). Клік по смузі в `grid.x + 150` (1.5 с) → `videoTime()` ≈ 2.5 (±0.05).
2. **Відтворення пропускає проміжок.** Розріз 1–2 с (як у 1). Клік по смузі в `grid.x + 50`, Play (очікування «Pause» до 20 с). `expect.poll` одним `page.evaluate` бере знімок `{ timeline, currentTime }` і чекає знімка з `timeline ∈ [1.3, 2.5]`. У ньому `|currentTime − (timeline + 1)| ≤ 0.15`. Pause.
3. **Undo/Redo.** Після розрізу кнопка `Undo` у piano roll → ширина `band` ≈ 400, `cutMark` 0. `Redo` → 300 і 1.
4. **Перетягнути межу.** Після розрізу 1–2 с: `dragBetween` від правої половини позначки (`End of cut 1`) на +50 px → ширина `band` ≈ 250 (±3). Одне `Undo` → ≈ 300.
5. **Прибрати розріз.** ПКМ по позначці → `Remove cut` → `cutMark` 0, ширина ≈ 400.
6. **Розріз з offset.** Поле offset `1` + Enter. Виділення 0.5→1.0 с таймлайну (`grid.x + 50` → `grid.x + 100`), `Delete range`. Клік по смузі в `grid.x + 50` → `videoTime()` ≈ 2.0 (±0.05), тобто медіа 1.5–2.0 вирізано, а такт 1 лишився на 1 с.
7. **Waveform показує розріз.** Відео зі звуком 4 с. Після розрізу в регіоні «Audio track» видно `.media-cuts-overlay__cut` шириною > 0.

**Ручна перевірка етапу 2:**
1. Відео з музикою. Виділити на смузі нудний фрагмент, ПКМ → «Delete range» → смуга коротшає, на місці фрагмента позначка, на waveform праворуч фрагмент заштриховано.
2. Play через розріз → відео й звук стрибають без чутного шматка вирізаного звуку (допустима мить «заморозки» кадру на seek), ноти грають рівно.
3. Перетягнути межу `start` позначки (курсор ew-resize) → позначка йде за мишею, кадр показує останній кадр перед розрізом. Перетягнути межу `end` → кадр показує перший кадр після розрізу, підпис показує проміжок. Ctrl+Z скасовує кожен жест одним кроком.
4. ПКМ по позначці → «Remove cut» → фрагмент повернувся. Ctrl+Z / Ctrl+Shift+Z.
5. Tab до межі розрізу, стрілки змінюють межу, `Delete` прибирає. Tab до смуги з виділенням, `Delete` вирізає.
6. Offset 3.2 і розріз після такту 1 → такт 1 на тому самому кадрі. Розріз, що захоплює такт 1 → такт 1 стає кадром після розрізу. Прибрати розріз → такт 1 повертається.
7. Розріз під час відтворення (виділення й меню, поки грає) → медіа одразу переходить у правильне місце.
8. Змінити BPM → розрізи на місці (у медіа), ноти перераховані як у 013.
9. Експорт `.mid` → файл такий самий, як без розрізів. Імпорт `.mid` → розрізи лишаються.
10. Замінити відео на аудіо → розрізи лишаються (вони в проекті), відображаються на новому waveform.
11. Меню закривається кліком поза ним, Escape, прокруткою piano roll. Горизонтальної прокрутки сторінки немає.
12. Розріз до кінця файлу (виділення до кінця смуги) → Play: на точці розрізу медіа замовкає, вирізане не звучить. Дограти до кінця таймлайну, натиснути Play ще раз → медіа звучить з початку. Seek під час відтворення з останніх 0.1 с перед розрізом на початок → медіа знову грає.
13. Консоль без помилок і попереджень React.

## Критерії готовності (Definition of Done)

### Етап 1
- [ ] `cd frontend && npm test -- --run && npm run lint && npm run typecheck && npm run build && npx prettier --check .` — зелено.
- [ ] `cd backend && uv run pytest && uv run ruff check . && uv run ruff format --check . && uv run mypy app` — зелено; `git diff main --stat -- backend` порожній.
- [ ] `cd frontend && npm run e2e` — зелено, включно з 5 тестами `e2e/media-timeline.spec.ts` і всіма наявними e2e без змін.
- [ ] `grep -rn "Seek video\|seekSlider" frontend/src frontend/e2e` знаходить лише перевірки відсутності (`queryByRole(... 'Seek video')` / `toHaveCount(0)`).
- [ ] `git diff main --stat -- frontend/package.json frontend/package-lock.json` порожній.
- [ ] Наявні тести не послаблено. `git diff main --numstat -- 'frontend/src/**/*.test.ts' 'frontend/src/**/*.test.tsx' frontend/e2e` показує видалені рядки лише в `VideoPlayer.test.tsx`, `App.test.tsx`, `MediaSyncBridge.test.tsx` і видаленому `seekSlider.test.ts`, як описано в розділі «Прибирання повзунка». Звіт implementer перелічує ці зміни.
- [ ] Ручна перевірка етапу 1 (7 пунктів) пройдена.
- [ ] У гілці: CLAUDE.md `[x]` для «Таймлайн відео над piano roll», статус 016 — «в роботі (етап 1 виконано)». Статус плану **лишається `схвалено`** (`grep -n "^\*\*Статус:\*\* схвалено" docs/plans/016-media-timeline-cuts.md` знаходить рядок). Гілку злито в `main` (`--no-ff`) і запушено, на `main` перевірки зелені.
- [ ] Звіт етапу 1 окремо перелічує відхилення від плану, що зачіпають етап 2 (або явно каже, що їх немає), щоб оркестратор вирішив, чи повертати план planner-у перед етапом 2.

### Етап 2
- [ ] Backend-перевірки зелені; `git diff main --stat -- backend/app/services` порожній (експорт та імпорт не змінювались).
- [ ] Frontend-перевірки (тести, lint, typecheck, build, prettier) зелені.
- [ ] `cd frontend && npm run e2e` — зелено, включно з 7 тестами `e2e/media-cuts.spec.ts`.
- [ ] `git diff main --stat -- frontend/package.json frontend/package-lock.json backend/pyproject.toml frontend/src/audio/Transport.ts frontend/src/state/history.ts frontend/src/audio/scheduler.ts` показує зміни лише в `Transport.ts`, і там лише один рядок `mediaCuts: []` в `EMPTY_PROJECT`.
- [ ] Усі тести з розділу «Тести → Етап 2» наявні й проходять. Unit-тести мають: `editedMediaTime`, `rawMediaTime`, `mediaToTimeline`/`timelineToMedia` з розрізами, `mediaSegmentAt`, `cutPoints`, `nextCutPoint`, `sameMediaTimeMap`, `normalizeCutRange`, `addCut`, `updateCut`, `removeCut`, `cutEdgeLimits`, `draggedCutEdge`, `cutEdgeForKey`, `cutRangeForSelection`, `cutDescription`, `cutShadePercent`, `mediaAhead`, `clampSelection`, `fitMenuPosition`, `validateMediaCut`.
- [ ] Наявні тести не послаблено. `git diff main --numstat -- 'frontend/src/**/*.test.ts' 'frontend/src/**/*.test.tsx' frontend/src/components/PianoRoll/testUtils.tsx backend/tests` для змінених наявних файлів показує лише додані рядки (другий стовпчик 0), крім рядків імпорту і рядків побудови мап `{ offset }` → `{ offset, cuts: [] }` у `mediaTimeMap.test.ts`/`MediaSync.test.ts` (у них змінюється лише літерал, не очікування).
- [ ] `grep -n "mediaSegmentAt\|nextCutPoint" frontend/src/media/MediaSync.ts` знаходить використання. Тест «Таймер точки розрізу» падає, якщо прибрати виклик `scheduleCutCheck` (implementer перевіряє це вручну і згадує у звіті).
- [ ] README описує таймлайн медіа й розрізи (виділення, меню, межі, клавіші, undo, offset, імпорт/експорт, неруйнівність).
- [ ] Ручна перевірка етапу 2 (13 пунктів) пройдена; `git status --porcelain` не показує медіафайлів, `test-results/` чи `playwright-report/`.
- [ ] У гілці до злиття:
  - CLAUDE.md `[x]` для «Вирізання проміжків» і «Розріз можна поправити»;
  - модель `Project` у розділі 7 з `mediaCuts`;
  - статус 016 — «виконано»;
  - статус плану — `виконано`.
- [ ] Гілку `feature/016b-media-cuts` злито в `main` (`--no-ff`) і запушено, на `main` перевірки (включно з e2e) зелені.

## Ризики / відкриті питання
- **Відкрите питання до власника (не блокує, прийнято дефолт): ноти не рухаються при вирізанні.** Вимогу «таймлайн редактора стискається (ноти прив'язані до відредагованого таймлайну)» прочитано так: ноти живуть у часі відредагованого таймлайну і зберігають свої секунди, а розріз змінює медіа під ними. Так само поводиться offset (015) і так вимагає розділ 7.
  - Наслідок: якщо ноти вже записані під відео, а потім посередині вирізати фрагмент, ноти після розрізу зсунуться відносно відео на довжину розрізу. Undo це скасовує.
  - Типовий порядок роботи — спершу вирізати зайве, потім писати ноти.
  - Можливе майбутнє рішення — перемикач «Move notes with the media»: зсув нот і педалей після розрізу на −довжина і видалення нот усередині, однією дією.
- **Відкрите питання (не блокує): waveform на смузі таймлайну.** Зараз смуга — лише «доріжка» без звуку й кадрів. Якщо власнику потрібен waveform у масштабі piano roll (з розрізами), це окрема задача. Вона потребує пікових значень з WaveSurfer (`exportPeaks`) і власного малювання на canvas з урахуванням `MediaTimeMap`.
- **Розбиття на два етапи** відхиляється від звичного «одна задача — одна гілка», але правила планера це дозволяють для завеликої задачі. Обидва етапи в одному плані, щоб рішення про відображення часу були узгоджені. Процес описано в «Розбиття на етапи → Порядок виконання»: implementer запускається двічі, після етапу 1 план лишається `схвалено`, а відхилення етапу 1, що зачіпають етап 2, повертають план planner-у. Якщо оркестратор віддає перевагу окремим планам 016a/016b, розділи «Етап 1» і «Етап 2» переносяться в них без змін.
- **Мить «заморозки» кадру на стрибку.** Seek медіаелемента декодує від ключового кадру, тож на розрізі можлива пауза картинки на десятки мілісекунд, а на важкому H.264 і довша. Звук вирізаного фрагмента не грає: таймер спрацьовує через ~2 мс після точки розрізу, а seek перериває відтворення. Якщо ручна перевірка покаже чутний шматок, допустиме дрібне відхилення: перенести таймер на `seekLead` раніше точки і стрибати на `mediaAhead`. Його треба описати у звіті.
- **Розрізи у вступі** (до такту 1) не мають позначки на смузі. Їх видно як штриховку на waveform, і вони впливають лише на те, скільки вступу приховано. Прибрати такий розріз можна через undo або тимчасово змінивши offset так, щоб розріз опинився після такту 1. Позначку на 0 с не робимо, бо кілька таких розрізів злилися б в одну точку.
- **Межі розрізу не переходять через такт 1** (див. `cutEdgeLimits` і «Чому межі зупиняються на offset»). Для розрізу після такту 1 межа `start` зупиняється на offset. Для розрізу, що містить такт 1, межа `end` не йде лівіше offset, а межа `start` — правіше. Без цього під час жесту такт 1 перескакував би на інший кадр, смуга стрибала б під курсором, а позначка могла б зникнути. Ціна: «вивільнити» такт 1 з розрізу перетягуванням не можна, лише через «Remove cut», нове виділення або зміну offset.
- **Правило стрибка в трьох положеннях медіа.** Випадок 3 («медіа вже за розрізом, target ще перед ним») може тривати до `SYNC_INTERVAL_MS` + 2 мс, поки таймер точки розрізу не переведе target у новий сегмент. Весь цей час медіа грає без корекцій, що безпечно: дрейф у часі таймлайну ≤ 0.25 с, і далі його виправляє звичайна корекція.
- **Попередній перегляд межі під час відтворення** застосовує мапу без seek-а транспорту. Кожна застосована мапа викликає `setTimeMap` → `afterTransportCommand` → жорсткий seek граючого медіа (той самий ризик, що в 015). Частоту одразу обмежено одним застосуванням за `requestAnimationFrame`. Якщо заїкання все одно помітне, допустиме дрібне відхилення: під час відтворення застосовувати мапу лише на `mouseup`, з описом у звіті.
- **Перетягування межі на паузі переміщує playhead** у точку розрізу: так видно кадр біля межі. Після жесту playhead лишається там. Це свідома поведінка «редагую тут», її описано в README.
- **Sticky-рядок займає 28 px висоти piano roll.** Наявні e2e рахують координати від `grid.boundingBox()`, тож зсув сітки на них не впливає. Початкова прокрутка до C4 лишається по центру видимої частини.
- **Float на межі розрізу.** `timelineToMedia` у точці розрізу дає кінець розрізу лише за точного збігу. Обчислена позиція `2 − 1e-15` дасть медіа перед розрізом, і стрибок відбудеться на наступній перевірці (таймер +2 мс). Синхронізація має допуск 5 мс, розрізи округлено до 1 мс.
- **Обсяг етапу 2** великий (модель, відображення, синхронізація, меню, UI, e2e), але ділити далі немає сенсу: розріз без UI не створити, а UI без синхронізації нічого не робить.

## Зміни після рев'ю (раунд 1)
Відповідь на вердикт раунду 1 (`016-media-timeline-cuts.review.md`).

**Блокуюче 1 — правило стрибка без верхньої межі; розріз до кінця файлу.**
- «Етап 2 → Синхронізація: правило стрибка» переписано на три положення медіа:
  - випадок 1 (медіа перед пройденим розрізом) без змін;
  - випадок 2 тепер діє лише для медіа **всередині** розрізу: `segmentEnd − ε ≤ mediaTime < nextSegmentStart`;
  - новий випадок 3: медіа вже за розрізом, а target ще перед ним (`mediaTime ≥ nextSegmentStart`). Дрейф рахується в часі таймлайну (`editedDrift`). Якщо він ≤ `HARD_SEEK_DRIFT_SECONDS`, дія `NO_ACTION`: без другого стрибка і без корекційного seek-а назад. Інакше звичайна корекція з `drift = editedDrift` на `mediaAhead(target, lead)`.
- Нове правило `tailCut` (одразу після правила `target ≥ duration`, до `inTail` і `!mediaPlaying`). Якщо наступний розріз тягнеться до кінця файлу (`nextSegmentStart ≥ duration − END_GUARD`), медіа ставиться на паузу без seek-а і не запускається знову. Так не грають останні 0.1 с вирізаного фрагмента.
- `mediaSyncRules.test.ts`, нові тести:
  - обидва випадки з рев'ю: `mediaTime 5.02` → `seekTo === null` у cooldown і без нього; `target 24.97 / segmentEnd 25 / nextSegmentStart 30 / mediaTime 25.0` → `pause: true`, `seekTo: null`;
  - «медіа далеко за розрізом» → корекційний seek перед розрізом;
  - `tailCut` для медіа на паузі (не запускається) і контрольний випадок, коли розріз ще далеко.
- `MediaSync.test.ts` (рекомендація рев'ю): медіа випереджає таймлайн і проходить точку розрізу до таймера → рівно один `setTime` за розріз. Плюс тест розрізу до кінця файлу (`'pause'` без `setTime` у вирізане).
- У «Ризиках» додано пункт про тривалість випадку 3.

**Блокуюче 2 — `cutEdgeLimits` для розрізу, що містить offset.**
- Контракт `cutEdgeLimits` розширено. Для `start < offset ≤ end`: `end ∈ [max(start + MIN, offset), …]`, `start ∈ […, min(end − MIN, offset)]`. Doc-коментар описує три випадки: розріз після такту 1, розріз, що містить такт 1, і розріз цілком у вступі.
- Пояснення «Чому межі зупиняються на offset» і пункт «Ризиків» оновлено: перетягування ніколи не переносить такт 1 через розріз.
- `mediaCuts.test.ts`: тести з рев'ю (`'end', 30, 3` → `start: 3`; `'start', 30, 3` → `end: 3`), offset на межах розрізу, offset біля `start` (`start + MIN` переважає), розріз цілком у вступі.
- `MediaTimeline.test.tsx`: розріз `{2, 5}` з offset 3. Межа `end` упирається в 3, межа `start` — теж у 3, позначка весь час лишається на `left: 0px`.

**Рекомендації:**
- **Процес двох етапів.** У «Розбиття на етапи» додано обов'язковий «Порядок виконання»:
  - implementer запускається двічі з явним етапом;
  - після етапу 1 статус плану лишається `схвалено`;
  - відхилення етапу 1, що зачіпають етап 2, повертають план planner-у перед етапом 2;
  - `виконано` ставить лише етап 2.

  У DoD етапу 1 додано перевірку статусу плану і вимогу перелічити у звіті відхилення, що стосуються етапу 2.
- **Фокус після «Delete range» / «Remove cut»** переходить на слайдер `Media position`. Є тест.
- **`requestAnimationFrame` для попереднього перегляду межі** закладено одразу: не більше однієї мапи за кадр, `commit`/Escape/розмонтування скасовують кадр. Тест на перетягування межі доповнено перевіркою `flushFrame()`. Ризик оновлено.
- **Ноти не рухаються разом з медіа:** це пояснюють `title` позначки розрізу і README (крок 14).

## Зміни після рев'ю (раунд 2)
Відповідь на вердикт раунду 2 (`016-media-timeline-cuts.review.md`, розділ «Раунд 2»).

**Блокуюче 1 — `tailCut` спрацьовував за `mediaTime`, не дивлячись на `target`.**
- «Етап 2 → Синхронізація», правило `tailCut`: обидві гілки умови тепер вимагають, щоб `target` був біля межі розрізу:
  - або `target ≥ segmentEnd − END_GUARD_SECONDS`;
  - або `mediaTime ≥ segmentEnd − ε` **і** `target ≥ segmentEnd − HARD_SEEK_DRIFT_SECONDS`.

  Якщо `target` далеко (Play з 0 після паузи в кінці, seek під час відтворення), правило не діє. Тоді медіа на паузі запускає блок `!mediaPlaying` (seek на target і `play()`), а граюче медіа виправляє hard drift. Додано пояснення, чому так.
- **Та сама вада в правилі стрибка, випадок 2.** Перевіряючи інші гілки, я знайшов її і там. Медіа на межі хвостового чи звичайного розрізу, яке вже грає, при `target = 0` потрапляло у випадок 2 і стрибало вперед (на `29.9` чи `5.5`), а не поверталося до target. Тепер випадок 2 теж вимагає `target ≥ segmentEnd − HARD_SEEK_DRIFT_SECONDS`, а інакше спрацьовує звичайна корекція на `mediaAhead(target, lead)`. Твердження «розріз до кінця файлу у випадок 2 не доходить» лишається правдою: за цієї умови медіа на межі хвостового розрізу завжди перехоплює `tailCut`.
- **Перевірка інших гілок.** Порядок правил (`!transportPlaying` → `target < 0` → `target ≥ duration` → `tailCut` → `inTail` → `!mediaPlaying` → стрибок (випадки 1–3) → cooldown → hard drift → nudge) пройдено вручну для всіх нових тестових входів:
  - `inTail` для медіа на 30 с і target 0 не спрацьовує, бо `ended`, але target < 29.75;
  - випадки 1 і 3 від нової умови не залежать;
  - без розрізів жодне нове правило не діє.
- `mediaSyncRules.test.ts`, нові тести:
  - обидва тести з рев'ю: `target 0 / mediaTime 30 / не грає` → `seekTo 0`, `play: true`; `mediaTime 25.0 / грає` → корекційний seek на 0 без cooldown, не `pause`;
  - той самий сценарій для звичайного розрізу (`seekTo 0`, а не `5.5`);
  - межа умови: `target 24.8` → `pause`, `target 24.7` → корекційний seek на `24.7`.
- `MediaSync.test.ts`, регресійний тест: годинник на паузі в кінці (медіа на 30), потім `playing` з 0 → є `'setTime:0'` і `'play'`, без `pause` після нього.

**Рекомендації:**
- До випадку 3 правила стрибка додано пояснення, що шлях з `editedDrift > HARD_SEEK_DRIFT_SECONDS` проходить через cooldown. Це додатковий запобіжник від seek-а назад одразу після стрибка.
- Ручна перевірка етапу 2, новий пункт 12: розріз до кінця файлу → дограти → Play ще раз → медіа звучить з початку; seek з хвоста на початок під час відтворення. У DoD тепер 13 пунктів.
