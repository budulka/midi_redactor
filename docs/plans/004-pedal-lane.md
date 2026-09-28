# 004 — Доріжка педалей (sustain, sostenuto, soft)

**Статус:** виконано
**Гілка:** feature/004-pedal-lane

## Мета
Додати під piano roll доріжку педалей, у якій інтервали натискання (`PedalEvent`) додаються, видаляються, переміщуються й змінюють початок і кінець. Доріжка має ту саму горизонтальну шкалу, прокрутку й сітку, що й `NoteGrid`. Задача спирається на вже наявне: модель і reducer педалей із 002 (`PedalEvent`, `pedals/add|update|remove`, `normalizePedal`, `MIN_PEDAL_DURATION`, `PEDAL_TYPES`), а також на геометрію, прив'язку й жести з 003 (`timeToX`/`xToTime`, `snapToGrid`, `gridStepSeconds`, `gridLayers`/`gridBackgroundImage`, `DragOptions`/`minDragDuration`/`exceedsDragThreshold`/`withPreview`, патерн «один жест — одна дія reducer'а», спільний scroll-контейнер `PianoRoll`). Ці функції не дублюються.

Пункти розділу 2.3 CLAUDE.md, які задача **закриває повністю** (після виконання ставимо `[x]`):
- «Окрема доріжка (lane) під piano roll для педалей».
- «Педаль **sustain** (MIDI CC64) — обов'язково; **sostenuto** (CC66) і **soft/una corda** (CC67) — бажано». Реалізуються всі три типи.
- «Додавання, видалення та зміна інтервалів натискання педалі (натиснута від–до)».

Пункт 2.3, який задача закриває **частково** (галочку НЕ ставимо):
- «Педаль впливає на програвання (sustain подовжує звучання нот)». Звуку ще немає, він з'явиться в задачі 005. Зараз закладаємо чисту функцію `noteSoundingEnds(notes, pedals)`: вона обчислює фактичний кінець звучання кожної ноти з урахуванням sustain і sostenuto. У piano roll вона одразу показує «хвіст» подовження ноти (тонка смуга після ноти до кінця звучання). У 005 семплер використає ту саму функцію для моменту `triggerRelease`, і тоді галочку буде поставлено.

Попутно виправляється дрібниця з ручної перевірки 003: помаранчевий контур `:focus-visible` на сітці, який з'являється, коли фокус ставиться програмно по кліку миші.

## Поза межами задачі
- Звук і вплив педалей на відтворення (sustain/sostenuto у семплері, soft як зменшення гучності чи зміна тембру) — 005. Для soft ефект визначить 005, тут `noteSoundingEnds` його не враховує.
- Експорт педалей у CC-події `.mid`, зокрема порядок подій у разі дотику інтервалів (`a.end == b.start`), — 009.
- Undo/redo, мультивиділення педалей (Shift/рамка), копіювання й вставка — 010. Стан виділення педалей уже зберігається як масив id.
- Перенесення інтервалу між рядками (зміна типу педалі перетягуванням по вертикалі). Тип задається рядком, у якому інтервал створено. Щоб змінити тип, інтервал видаляють і створюють заново.
- Часткове натискання (half-pedal, значення CC між 0 і 127). Модель бінарна: натиснута або ні.
- Числове редагування початку й кінця педалі в інспекторі. Точні значення видно в `aria-label`/`title` інтервалу.
- Команда Quantize для педалей. Прив'язка до сітки працює під час редагування.
- Автопрокрутка під час перетягування, touch/pen-введення — як у 003.
- Backend не змінюється: Pydantic-модель 002 уже відхиляє перетини однотипних педалей.

## Технічні рішення

### Нові залежності
Немає. `package.json` і `pyproject.toml` не змінюються.

### Розміщення: третій рядок того самого scroll-контейнера
Варіанти:
| Варіант | Плюси | Мінуси |
|---|---|---|
| **Третій рядок CSS grid у `.piano-roll__scroll`** з `position: sticky; bottom: 0` | Горизонтальна прокрутка синхронна без JS (як лінійка й клавіатура в 003); одна ширина колонки для сітки й доріжки; доріжка завжди видна знизу | Коли сітку прокручено не до кінця, доріжка перекриває найнижчі рядки нот (так само, як лінійка перекриває верхні); щоб побачити A0, треба прокрутити донизу |
| Окремий scroll-контейнер під piano roll із синхронізацією `scrollLeft` через JS | Доріжка не перекриває сітку | Код синхронізації в обидва боки, мерехтіння під час прокрутки, дві горизонтальні смуги прокрутки |

**Обрано третій рядок.** `gridTemplateRows` стає `${RULER_HEIGHT_PX}px max-content ${PEDAL_LANE_HEIGHT_PX}px`. Нові комірки (у порядку DOM після `NoteGrid`):
- `div.piano-roll__pedal-labels` (`position: sticky; left: 0; bottom: 0; z-index: 3`, фон `--panel`) з компонентом `PedalLabels`;
- `div.piano-roll__pedals` (`position: sticky; bottom: 0; z-index: 2`, верхня рамка `--border`) з компонентом `PedalLane`.

Доріжка складається з трьох рядків висотою `PEDAL_ROW_HEIGHT_PX = 20`. Порядок збігається з `PEDAL_TYPES`: 0 — sustain, 1 — sostenuto, 2 — soft. `PEDAL_LANE_HEIGHT_PX = 60`.

Ширина: `NoteGrid` і `PedalLane` задають `width` з однієї функції `timelineDurationSeconds(notes, bpm, ts, pedals)` (див. нижче), а в CSS обидва мають `min-width: 100%`. Під час перетягування за кінець таймлайну кожен компонент бачить лише власний preview, тож його ширина може на мить перевищувати ширину сусіда. Колонка `max-content` розтягується до більшої, а `min-width: 100%` розтягує меншого до ширини колонки, тому «дірки» у фоні не буде.

### Політика перетинів однотипних інтервалів: обмеження (clamp), а не злиття
Модель (002) забороняє перетин педалей одного типу (дотик `a.end == b.start` дозволено). Варіанти UX:
| Варіант | Поведінка | Чому ні / чому так |
|---|---|---|
| Злиття (merge) | Новий чи пересунутий інтервал, що зачепив сусіда, об'єднується з ним в один | Непомітно видаляє інтервал користувача (сусід «зникає»). Одна дія змінює кілька педалей, тому preview складніший. Для фортепіано це ще й неправильно музично: окремі натискання («перепедалізація») — навмисний прийом, щоб прибрати гул попередньої гармонії |
| Відмова (reject) | Жест, що дає перетин, скасовується | Користувач тягне інтервал, а на `mouseup` той повертається назад без пояснень |
| **Обмеження (clamp)** | Інтервал упирається в сусіда й може лише торкнутися його | Передбачувано (так поводяться кліпи в більшості DAW), нічого не видаляється, preview завжди показує той результат, який буде збережено |

**Обрано обмеження.** Точні правила:
- **Створення.** Клік у рядку в порожньому місці з часом `t` визначає «проміжок» `gapAt(...) = [min, max)` між сусідніми однотипними інтервалами. Початок нового інтервалу обчислюється як `snap ? snapToGrid(t, step, 'floor') : t` і клампиться до `≥ min`. Кінець за замовчуванням дорівнює `start + defaultPedalLength` і клампиться до `≤ max`. Протягування вправо змінює кінець у межах `[start + minDragDuration, max]`. Якщо місця менше за `MIN_PEDAL_DURATION`, інтервал не створюється, і жест нічого не робить.
- **Переміщення.** Інтервал зберігає довжину, а його початок клампиться до `[bounds.min, bounds.max - length]`, де `bounds = neighborBounds(...)`. Перескочити через сусіда не можна.
- **Зміна початку чи кінця.** Край клампиться до сусіда (`bounds.min` / `bounds.max`) і до мінімальної довжини (`minDragDuration`) відносно протилежного краю.

**Захист у reducer'і** (другий рубіж для будь-якого джерела дій: інспектор, вставка в 010, імпорт). Це закриває рішення 002 «політика перетинів — 004»:
- `pedals/add`: після `normalizePedal` педаль, що перетинається з уже наявною однотипною або з раніше прийнятою в тій самій дії, **відкидається**. Так само вже зараз відкидаються дублікати id. Решта педалей додається.
- `pedals/update`: якщо після застосування всіх патчів хоч одна **змінена** педаль перетинається з іншою однотипною, дія відхиляється **повністю** (повертається той самий `state`). Перевірка йде по кінцевому стану, тож атомарний обмін місцями двох педалей однією дією дозволено.
- UI завжди надсилає вже обмежені значення, тому в нормальній роботі ця гілка не спрацьовує.

### Чисті функції

`src/state/constants.ts` (доповнення):
- `PEDAL_CC: Readonly<Record<PedalType, number>> = { sustain: 64, sostenuto: 66, soft: 67 }`;
- `PEDAL_LABELS: Readonly<Record<PedalType, string>> = { sustain: 'Sustain', sostenuto: 'Sostenuto', soft: 'Soft' }`.

`src/utils/pedalIntervals.ts` — операції над інтервалами (без геометрії й UI):
- `interface TimeBounds { readonly min: number; readonly max: number }` (`max` може бути `Infinity`).
- `pedalsOverlap(a, b): boolean` = `a.type === b.type && a.start < b.end && b.start < a.end`. Дотик — не перетин.
- `pedalsOfType(pedals, type): readonly PedalEvent[]` — педалі типу, відсортовані за `start`, без мутації входу.
- `pedalAt(pedals, type, time): PedalEvent | null` — педаль типу, для якої `start <= time < end`. Шукає бінарним пошуком по `pedalsOfType`. Знадобиться і в 005 (чи натиснута педаль у момент старту відтворення).
- `gapAt(pedals, type, time): TimeBounds | null` — `null`, якщо `time` усередині однотипної педалі. Інакше `min` = найбільший `end ≤ time` (або 0), `max` = найменший `start > time` (або `Infinity`).
- `neighborBounds(pedals, pedal): TimeBounds` — межі для редагування наявної педалі серед однотипних, без неї самої: `min` = найбільший `end` серед тих, у кого `start < pedal.start` (або 0); `max` = найменший `start` серед тих, у кого `start >= pedal.start` (або `Infinity`).

`src/utils/pedalEffects.ts` — вплив педалей на тривалість звучання:
- `noteSoundingEnds(notes, pedals): ReadonlyMap<string, number>` — для кожної ноти повертає момент, коли вона перестає звучати. Для кожної ноти:
  1. `keyUp = start + duration`, `release = keyUp`.
  2. **Sostenuto** утримує ноти, клавіші яких натиснуті в момент натискання педалі. Якщо є педалі sostenuto з `note.start <= p.start < keyUp`, то `release = max(release, max(p.end))`.
  3. **Sustain**: якщо `pedalAt(pedals, 'sustain', release)` не `null` (педаль натиснута в момент відпускання, `start` включно, `end` не включно), то `release = pedal.end`. Ланцюжок через дотичну наступну педаль не продовжується: перепедалізація глушить звук.
  4. **Повторний удар тієї самої клавіші** глушить попереднє звучання. `release = max(keyUp, min(release, nextSamePitchStart))`, де `nextSamePitchStart` — найменший `start > note.start` серед нот тієї самої висоти. Ноту ніколи не скорочуємо нижче її власної тривалості.
  5. Soft не впливає (див. «Поза межами»).
  Складність — O((n + m) log(n + m)): групування нот за висотою, сортування педалей і бінарний пошук.

`src/utils/noteEditing.ts` (зміна):
- `withPreview` стає узагальненою: `withPreview<T extends { readonly id: string }>(items: readonly T[], preview: T | null): readonly T[]`. Поведінка й наявні виклики для `Note` не змінюються, а доріжка педалей використовує ту саму функцію.

`src/utils/pianoRollGeometry.ts` (зміни):
- `timelineDurationSeconds(notes, bpm, ts, pedals: readonly PedalEvent[] = [])` — `lastEnd` враховує і `pedal.end`. Наявні виклики з трьома аргументами не змінюються.
- `NOTE_TAIL_HEIGHT_PX = 4`; `noteTailRect(note, soundingEnd, g): Rect | null` — `null`, якщо `soundingEnd <= start + duration + TIME_EPSILON`. Інакше `{ x: timeToX(start + duration), y: pitchToY(pitch) + (rowHeight - 4) / 2, width: (soundingEnd - start - duration) * pps, height: 4 }`.

`src/utils/pedalGeometry.ts`:
- `PEDAL_ROW_HEIGHT_PX = 20`, `PEDAL_LANE_HEIGHT_PX = PEDAL_TYPES.length * PEDAL_ROW_HEIGHT_PX` (60).
- `pedalRowY(type, rowHeight)` = `PEDAL_TYPES.indexOf(type) * rowHeight`.
- `pedalTypeAtY(y, rowHeight): PedalType` — рядок `Math.floor(y / rowHeight)`, клампнутий до `0…2`.
- `pedalRect(pedal, g): Rect` = `{ x: timeToX(start), y: pedalRowY(type, g.rowHeight), width: (end - start) * pps, height: g.rowHeight }`. `g` — той самий `ViewGeometry`, де `rowHeight = PEDAL_ROW_HEIGHT_PX`.
- `type PedalHitZone = 'body' | 'start' | 'end'`; `hitTestPedals(pedals, point, g, handlePx = RESIZE_HANDLE_PX): { pedalId; zone } | null`. Прямокутник напіввідкритий, як у `hitTestNotes`. Ручка з кожного боку має ширину `min(handlePx, width / 3)`: `x < rect.x + handle` → `start`, `x >= rect.x + width - handle` → `end`, інакше `body`. Перебір іде з кінця масиву.

`src/utils/pedalEditing.ts` — логіка жестів (аналог `noteEditing.ts`, перевикористовує `DragOptions`, `minDragDuration`, `snapToGrid`):
- `defaultPedalLength(bpm, ts, opts)` = `max(beatDurationSeconds(bpm, ts), minDragDuration(opts))`. Одна доля: на 120 BPM 4/4 це 0.5 с, тобто за замовчуванням педаль тримається долю, а не крок 1/16.
- `type PedalDragKind = 'create' | 'move' | 'resize-start' | 'resize-end'`; `interface PedalDragState { kind; original: PedalEvent; originTime: number; bounds: TimeBounds }`.
- `createPedalAt(id, type, time, length, opts, gap: TimeBounds): PedalEvent | null`: `start = max(gap.min, snap ? snapToGrid(time, step, 'floor') : time)`, `end = min(gap.max, start + length)`; якщо `end - start < MIN_PEDAL_DURATION`, повертає `null`.
- `applyPedalDrag(drag, time, opts): PedalEvent`, де `dt = time - originTime`, `minLen = minDragDuration(opts)`, `snapN(x) = snap ? snapToGrid(x, step, 'nearest') : x`:
  - `create`: `end = snap ? snapToGrid(time, step, 'ceil') : time`; результат `min(bounds.max, max(original.start + minLen, end))`. Протягування лише вправо, як у нот. Для create `bounds = { min: original.start, max: gap.max }`.
  - `move`: `L = end - start`; `start = snapN(original.start + dt)`, клампиться до `[bounds.min, bounds.max - L]`; `end = start + L`.
  - `resize-start`: `start = max(bounds.min, min(snapN(original.start + dt), original.end - minLen))`, `end` не змінюється.
  - `resize-end`: `end = min(bounds.max, max(snapN(original.end + dt), original.start + minLen))`, `start` не змінюється.
  - `id` і `type` не змінюються ніколи. Результат завжди ≥ 0 і має довжину ≥ `MIN_PEDAL_DURATION`, бо `original` уже валідна.

`src/utils/focus.ts` — виправлення контуру фокусу (DOM-утиліта, не музична логіка):
- `focusFromPointer(element: HTMLElement | null): void` ставить `element.dataset.pointerFocus = 'true'`, один раз додає слухач `blur` (`{ once: true }`), який видаляє атрибут, і викликає `element.focus({ preventScroll: true })`. Якщо атрибут уже стоїть (елемент уже у фокусі від миші), повторний слухач не додається.
- CSS: `.note-grid:focus-visible:not([data-pointer-focus])` і `.pedal-lane:focus-visible:not([data-pointer-focus])` отримують контур, а фокус від миші — ні. Якщо дістатися до сітки клавішею Tab, атрибута немає, і контур видно, тобто доступність із клавіатури не страждає.
- Чому не `focus({ focusVisible: false })`: цей параметр `FocusOptions` підтримують не всі браузери (зокрема Chromium на момент написання), а тип може бути відсутній у `lib.dom` TypeScript. Атрибут працює скрізь, і його можна перевірити в jsdom.

### Стан редактора
`src/state/editorState.ts`:
- `EditorState` отримує поле `selectedPedalIds: readonly string[]` (за замовчуванням `[]`).
- Нова дія `editor/selectPedals` (`ids`) з creator'ом `selectPedals(ids)`. Вона замінює виділення педалей і **очищає** виділення нот. Симетрично, `editor/selectNotes` тепер очищає `selectedPedalIds`. `clearSelection` очищає обидва масиви. Виділення нот і педалей взаємовиключні, тому `Delete` у фокусованій області завжди видаляє те, що підсвічено.
- Селектор `selectedPedals(pedals, ids)` працює так само, як `selectedNotes`: порядок проекту, невідомі id ігноруються.
- Дія без змін повертає той самий об'єкт. `selectNotes` з тими самими id при порожньому `selectedPedalIds` повертає той самий `state`.

### Спільний хук жестів (рефакторинг 003 без зміни поведінки)
Логіку керування жестом (слухачі `window` для `mousemove`/`mouseup`/`keydown(Escape)`, поріг `exceedsDragThreshold`, preview у `useState`, прибирання слухачів на `mouseup`, `Escape` і unmount, актуальні опції через ref) виносимо з `useNoteDrag` у `src/components/PianoRoll/useDragGesture.ts`, щоб не копіювати ~80 рядків у доріжку педалей:
```ts
interface GestureSpec<T> {
  startPoint: Point;
  initialPreview: T | null;          // create: new item; move/resize: null until the threshold
  update: (local: Point) => T;       // called only after the threshold is exceeded
  commit: (result: T | null, moved: boolean) => void; // called once on mouseup, after cleanup
}
function useDragGesture<T>(getLocalPoint: (e: PointerLike) => Point): {
  preview: T | null;
  begin: (spec: GestureSpec<T>) => void;
}
```
`useNoteDrag` зберігає свій публічний інтерфейс (`{ preview, onMouseDown }`) і лише формує `GestureSpec<Note>` через `applyDrag`. Наявні тести `NoteGrid.test.tsx` не змінюються й мають проходити: це й підтверджує, що рефакторинг не змінив поведінки. Клік без руху, як і після виправлення 8357677, зберігає довжину за замовчуванням: `update` не викликається, доки не перейдено поріг.

`src/components/PianoRoll/usePedalDrag.ts`: `usePedalDrag({ pedals, geometry, dragOptions, defaultLength, getLocalPoint, onCommitCreate, onCommitUpdate, onSelect }) → { preview: PedalEvent | null, onMouseDown }`. Логіка `onMouseDown`:
1. Не ліва кнопка → вихід; `preventDefault()`.
2. `point`, `time = xToTime`, `type = pedalTypeAtY(point.y, rowHeight)`, `hit = hitTestPedals(...)`.
3. Немає влучання: `gap = gapAt(pedals, type, time)`; `null` → вихід. `pedal = createPedalAt(createId(), type, time, defaultLength, dragOptions, gap)`; `null` → вихід. Жест `create` з `bounds = { min: pedal.start, max: gap.max }` і `initialPreview = pedal`. На commit викликається `onCommitCreate(result)`.
4. Є влучання: `onSelect([id])`. Жест `move`/`resize-start`/`resize-end` за зоною, `bounds = neighborBounds(pedals, original)`, `initialPreview = null`. На commit, якщо `moved`, викликається `onCommitUpdate(id, { start, end })`.

### Компоненти
- `src/components/PianoRoll/PedalLane.tsx` — `<div role="application" aria-label="Pedal lane" tabIndex={0} className="pedal-lane">`, ширина `timelineDurationSeconds(project.notes, bpm, ts, withPreview(project.pedals, preview)) * pps`, висота `PEDAL_LANE_HEIGHT_PX`, фон `gridBackgroundImage(gridLayers(...))`, тобто ті самі лінії, що в сітці. Усередині:
  - 3 `div.pedal-lane__row` (`data-pedal-type`, нижня рамка, `pointer-events: none`);
  - інтервали через `React.memo`-компонент `PedalView`: `data-testid="pedal"`, `data-pedal-id`, `data-pedal-type`, `data-selected`, `aria-label` і `title` у форматі `Sustain from 0.25 s to 0.75 s` (`PEDAL_LABELS`, `toFixed(2)`), клас `pedal pedal--sustain|sostenuto|soft` (+ `pedal--selected`), дочірні `div.pedal__handle.pedal__handle--start` і `--end` (`cursor: ew-resize`);
  - `onMouseDown` викликає `focusFromPointer(laneRef.current)` і потім `onMouseDown` хука; `onContextMenu` по інтервалу викликає `removePedals([id])` і прибирає його з виділення, `preventDefault` робиться лише над інтервалом; `onKeyDown` на `Delete`/`Backspace` викликає `removePedals(selectedPedals(...).map(id))` і `clearSelection()`;
  - commit створення: `addPedals([pedal])` + `selectPedals([id])`; commit зміни: `updatePedal(id, { start, end })`. **Одна дія `projectReducer` на жест**, preview до `mouseup` живе лише локально.
  - `geometry` мемоізується (`{ pixelsPerSecond, rowHeight: PEDAL_ROW_HEIGHT_PX }`), `dragOptions` береться з того самого `gridStepSeconds(gridDivision, bpm)` і `snapEnabled`, що в `NoteGrid`, `defaultLength` = `defaultPedalLength(bpm, ts, dragOptions)`.
- `src/components/PianoRoll/PedalLabels.tsx` — три підписи висотою `PEDAL_ROW_HEIGHT_PX` («Sustain», «Sostenuto», «Soft») з `title="MIDI CC64"` (з `PEDAL_CC`), `aria-hidden` не ставиться.
- `NoteGrid.tsx` (зміни): `focusFromPointer` замість прямого `focus(...)`; `timelineDurationSeconds(displayed, bpm, ts, project.pedals)`; `soundingEnds = useMemo(() => noteSoundingEnds(displayed, project.pedals), [displayed, project.pedals])`. «Хвости» рендеряться **перед** нотами (під ними) memo-компонентом `NoteTailView` (`div.note-tail`, `data-testid="note-tail"`, `data-note-id`, `pointer-events: none`, фон `--note` з `opacity: 0.45`) за `noteTailRect`. Hit-testing не змінюється: хвіст не є частиною ноти, тож клік по ньому створює нову ноту, як і по порожньому місцю.
- `PianoRoll.tsx` (зміни): третій рядок grid, дві нові комірки, `timelineDurationSeconds(notes, bpm, ts, pedals)` для лінійки.
- `PianoRoll.css`: `.piano-roll__pedal-labels`, `.piano-roll__pedals`, `.pedal-lane` (`position: relative; min-width: 100%; cursor: crosshair; outline: none`), `.pedal-lane__row`, `.pedal`, `.pedal--selected`, `.pedal__handle--start/--end`, `.note-tail`, `.note-grid { min-width: 100% }`, змінений селектор `:focus-visible`. `App.css` `:root`: `--pedal-sustain: #5fbf8a`, `--pedal-sostenuto: #a98bf0`, `--pedal-soft: #5bbbe0`; виділений інтервал використовує `--note-selected`.
- `testUtils.tsx` / `StateProbe.tsx` (тестові помічники): `renderWithProviders(ui, notes = [], editor?, pedals = [])`; `StateProbe` додатково виводить `<pre data-testid="pedals">`; нова функція `readPedals(container)`.

## Кроки реалізації
1. Від актуального `main` створити гілку `feature/004-pedal-lane`.
2. `src/utils/focus.ts` + `focus.test.ts`; `NoteGrid.tsx` використовує `focusFromPointer`; змінити селектор `:focus-visible` у `PianoRoll.css`; тест атрибута в `NoteGrid.test.tsx`. Коміт `fix: hide grid focus ring when focused by mouse`.
3. `PEDAL_CC`, `PEDAL_LABELS` у `constants.ts`; `src/utils/pedalIntervals.ts` + `pedalIntervals.test.ts`. Коміт `feat: add pedal interval helpers`.
4. `projectReducer.ts`: необов'язковий параметр `canAdd?: (item, current) => boolean` у `addItems` і перевірка змінених педалей після `updateItems` у `pedals/update` (через `pedalsOverlap`). Нові тести в `projectReducer.test.ts`. Коміт `feat: reject overlapping pedals of the same type`.
5. `src/utils/pedalEffects.ts` + `pedalEffects.test.ts`. Коміт `feat: compute note sounding ends with sustain and sostenuto`.
6. `pianoRollGeometry.ts`: параметр `pedals` у `timelineDurationSeconds`, `NOTE_TAIL_HEIGHT_PX`, `noteTailRect`. `src/utils/pedalGeometry.ts` + тести. `withPreview` стає узагальненою (`noteEditing.ts`, наявні тести без змін). Коміт `feat: add pedal lane geometry and hit testing`.
7. `src/utils/pedalEditing.ts` + `pedalEditing.test.ts`. Коміт `feat: add pedal drag editing logic`.
8. `editorState.ts` / `editorReducer.ts`: `selectedPedalIds`, `selectPedals`, `selectedPedals`, взаємовиключне виділення + тести. Коміт `feat: add pedal selection to editor state`.
9. `useDragGesture.ts`; `useNoteDrag.ts` переписати поверх нього без зміни інтерфейсу. Запустити `NoteGrid.test.tsx` і `PianoRoll.test.tsx` без змін, усе має бути зелено. Коміт `refactor: extract shared drag gesture hook`.
10. `usePedalDrag.ts`, `PedalLane.tsx`, `PedalLabels.tsx`, доповнення `testUtils.tsx`/`StateProbe.tsx`, `PedalLane.test.tsx`, `PedalLabels.test.tsx`. Коміт `feat: add pedal lane with create, move, resize and delete`.
11. `NoteGrid.tsx`: хвости звучання й `pedals` у тривалості таймлайну; `renderGrid` у `NoteGrid.test.tsx` отримує необов'язковий параметр `pedals`; нові тести. Коміт `feat: show sustained note tails in the piano roll`.
12. `PianoRoll.tsx` (третій рядок, комірки), `PianoRoll.css`, CSS-змінні в `App.css`, `PianoRoll.test.tsx`. Коміт `feat: show pedal lane under the piano roll`.
13. README: розділ «Керування педалями». Коміт `docs: describe pedal lane controls`.
14. Усі перевірки з DoD, ручна перевірка в браузері, злиття `--no-ff` у `main`, перевірки на `main`, push.
15. CLAUDE.md: `[x]` для трьох пунктів 2.3 з розділу «Мета» (пункт «Педаль впливає на програвання» лишається `[ ]`), статус 004 у розділі 8 — «виконано»; статус плану — `виконано`. Коміт `docs: mark task 004 as done`.

## Тести
Backend не змінюється, наявні тести мають і далі проходити.

Спільні умови для тестів доріжки: 120 BPM 4/4, `pps = 100`, сітка `1/16` (крок 0.125 с = 12.5 px), доля 0.5 с. Рядки доріжки: sustain `y ∈ [0, 20)` (у тестах y = 10), sostenuto `[20, 40)` (y = 30), soft `[40, 60)` (y = 50). `createId` мокається через `vi.spyOn` і повертає `'new-1'`. У jsdom `rect` = 0, тому `clientX` дорівнює локальному x.

### `src/utils/focus.test.ts`
- `div` з `tabIndex = 0` у `document.body`: `focusFromPointer(div)` → `document.activeElement === div`, `div.dataset.pointerFocus === 'true'`; `div.blur()` → атрибута немає.
- Два виклики поспіль, потім `blur()` → атрибута немає, помилок немає. `focusFromPointer(null)` нічого не робить.

### `src/utils/pedalIntervals.test.ts`
Набір (навмисно невідсортований): `s2 = sustain [2, 3)`, `so = sostenuto [0.5, 2.5)`, `s1 = sustain [0, 1)`.
- `pedalsOverlap`: sustain `[0,1)` і sustain `[0.5,1.5)` → true; `[0,1)` і `[1,2)` → false (дотик); sustain `[0,1)` і soft `[0.5,1.5)` → false.
- `pedalsOfType(set, 'sustain')` → `[s1, s2]`; вхідний масив не змінився.
- `pedalAt(set, 'sustain', 0.99)` → s1; `(…, 1)` → null; `(…, 2)` → s2; `(set, 'soft', 1)` → null.
- `gapAt(set, 'sustain', 1.5)` → `{1, 2}`; `(…, 1)` → `{1, 2}`; `(…, 0.5)` → null; `(…, 3.5)` → `{3, Infinity}`; `([s2], 'sustain', 1)` → `{0, 2}`; `(set, 'soft', 5)` → `{0, Infinity}`.
- `neighborBounds(set, s1)` → `{0, 2}`; `(set, s2)` → `{1, Infinity}`; `(set, so)` → `{0, Infinity}`.

### `src/state/projectReducer.test.ts` (нові тести, наявні не змінюються)
Стан з `sustain p1 [0, 1)` і `soft p2 [0.5, 2)`:
- `addPedals([sustain [0.5, 1.5)])` → той самий `state`; `addPedals([sustain [1, 2)])` → додано (дотик); `addPedals([soft [2, 3)])`, `addPedals([sostenuto [0.5, 1.5)])` → додано.
- Одна дія з двома новими однотипними, що перетинаються між собою (`sustain [3, 4)`, `sustain [3.5, 5)`) → додано лише перший.
- Нормалізація перед перевіркою: `addPedals([sustain start -1, end -0.5])` при наявній `sustain [0, 1)` → після нормалізації `[0, 0.001)` перетинається з p1, тож повертається той самий `state`.
- `updatePedal('p1', { end: 3 })` при `sustain p3 [2, 3)` → той самий `state`; `updatePedal('p1', { end: 2 })` → застосовано (дотик).
- Атомарний обмін: `p1 [0,1)` і `p3 sustain [1,2)`; `updatePedals([{p1 → start 1, end 2}, {p3 → start 0, end 1}])` → обидві оновлені.
- Зміна типу на зайнятий: `updatePedal('p2', { type: 'sustain' })` → той самий `state`.

### `src/utils/pedalEffects.test.ts`
Нота C4 `n = [0, 0.5)`, якщо не сказано інше.
- Без педалей: кінець кожної ноти дорівнює `start + duration`; порожній масив нот → порожня `Map`.
- Sustain `[0.25, 2)` → 2; sustain `[0.5, 2)` → 2 (натиснута в момент відпускання); sustain `[0, 0.5)` → 0.5 (відпущена разом із клавішею); sustain `[1, 2)` → 0.5 (натиснута після відпускання).
- Дотичні sustain `[0.25, 1)` і `[1, 3)` → 1 (без ланцюжка).
- Повторний удар: C4 `a [0, 0.5)`, C4 `b [1, 1.5)`, D4 `d [0.8, 1)`, sustain `[0, 3)` → a → 1, b → 3, d → 3 (інша висота не обрізає).
- Перекриті ноти однієї висоти без педалей: C4 `[0, 1)` і C4 `[0.5, 1)` → перша → 1 (не коротша за власну тривалість).
- Sostenuto: нота `[0, 1)` + sostenuto `[0.5, 3)` → 3; нота `[0.6, 0.8)` з тією самою педаллю → 0.8 (натиснута після педалі); нота `[0, 0.4)` → 0.4 (відпущена до педалі); нота `[0.5, 1)` → 3 (одночасно — утримується).
- Sostenuto + sustain: нота `[0, 1)`, sostenuto `[0.5, 2)`, sustain `[1.5, 4)` → 4.
- Soft `[0, 5)` → 0.5 (без впливу).

### `src/utils/pianoRollGeometry.test.ts` (доповнення)
- `timelineDurationSeconds([], 120, 4/4, [sustain [0, 70.5)])` → 76; з трьома аргументами, як раніше, → 60.
- `noteTailRect(C4 [0.5, 1.0), 2.0, g)` → `{x 100, y 677, width 100, height 4}`; `soundingEnd = 1.0` → null; `1.0 + 1e-12` → null.

### `src/utils/pedalGeometry.test.ts`
- `PEDAL_LANE_HEIGHT_PX === 60`; `pedalRowY('sustain', 20) === 0`, `('soft', 20) === 40`.
- `pedalTypeAtY(10, 20)` → sustain, `(30)` → sostenuto, `(50)` → soft, `(-5)` → sustain, `(500)` → soft.
- `pedalRect(soft [0.5, 1.5))` → `{x 50, y 40, width 100, height 20}`.
- `hitTestPedals` з `a = sustain [0.5, 1.5)` (x 50–150, ручки по 6 px): `(52, 10)` → start; `(56, 10)` → body; `(100, 10)` → body; `(143, 10)` → body; `(144, 10)` → end; `(150, 10)` → null; `(100, 30)` → null (інший рядок). Вузький інтервал шириною 9 px: ручки по 3 px (`x + 2` → start, `x + 4` → body, `x + 6` → end). Два інтервали в різних рядках з однаковим часом → влучає той, чий рядок. Порожній масив → null.

### `src/utils/pedalEditing.test.ts`
Опції `{ step: 0.125, snap: true }`, якщо не сказано інше; `inf = { min: 0, max: Infinity }`.
- `defaultPedalLength(120, 4/4, opts)` → 0.5; зі `step 2` (сітка `1/1`) → 2; `snap: false` → 0.5.
- `createPedalAt('p', 'sustain', 0.3, 0.5, opts, inf)` → `{id 'p', type sustain, start 0.25, end 0.75}`; `snap: false` → `start 0.3, end 0.8`; `gap {0.3, 0.6}`, time 0.35 → `{0.3, 0.6}`; `gap {0.5, 0.5005}`, time 0.5 → null.
- `create` (original `[0.25, 0.75)`, `bounds {0.25, ∞}`): time 1.3 → end 1.375; time 0.1 → end 0.375; `bounds.max = 1`, time 1.3 → end 1. `snap: false`, original `[0.3, 0.8)`: time 1.33 → end 1.33; time 0.2 → end 0.31.
- `move` (original sustain `[0.5, 1.5)`, originTime 0.6): `inf`, time 0.82 → `[0.75, 1.75)`; `inf`, time 0 → `[0, 1)`; `bounds {0.25, 2}`, time 0 → `[0.25, 1.25)`; `bounds {0.25, 2}`, time 2 → `[1, 2)`; `snap: false`, `inf`, time 0.83 → start ≈ 0.73; `id` і `type` не змінюються.
- `resize-start` (той самий original, originTime 0.5, `inf`): time 0.2 → start 0.25, end 1.5; time 1.6 → start 1.375; `bounds {0.4, ∞}`, time 0.2 → start 0.4; `snap: false`, time 1.6 → start 1.49.
- `resize-end` (originTime 1.5, `inf`): time 1.9 → end 1.875; time 0 → end 0.625; `bounds {0, 1.7}`, time 2.5 → end 1.7.
- Вхідні об'єкти не мутуються (заморожені через `Object.freeze`).

### `src/utils/noteEditing.test.ts` (доповнення)
- `withPreview` з масивом педалей: preview з наявним id замінює, новий id додається в кінець. Наявні тести для нот не змінюються.

### `src/state/editorReducer.test.ts`
- Тест дефолтів **розширюється** очікуванням `selectedPedalIds: []`. Це нове поле, а не послаблення: решта очікувань лишається.
- `selectPedals(['p1'])` → `selectedPedalIds ['p1']`; зі стану з `selectedNoteIds ['a']` → ноти очищено; ті самі id → той самий об'єкт.
- `selectNotes(['a'])` зі стану з `selectedPedalIds ['p1']` → педалі очищено; наявний тест «ті самі id → той самий об'єкт» лишається.
- `clearSelection()` очищає обидва масиви; при обох порожніх → той самий об'єкт.
- `selectedPedals(pedals, ['p2', 'zzz'])` → лише p2 у порядку проекту.

### `src/components/PianoRoll/PedalLane.test.tsx` (через `renderWithProviders` з педалями)
- **Рендер:** `a = sustain [0.5, 1.5)` → елемент `pedal` зі стилем `left 50px, width 100px, top 0px` і `aria-label="Sustain from 0.50 s to 1.50 s"`; `soft [0, 1)` → `top 40px`. Ширина доріжки 6000px.
- **Створення кліком:** `mouseDown (30, 10)` + `mouseUp (30, 10)` → `pedals = [{id 'new-1', type 'sustain', start 0.25, end 0.75}]`, `selectedPedalIds ['new-1']`, `data-selected="true"`.
- **Тип за рядком:** клік у `(30, 30)` → sostenuto; `(30, 50)` → soft.
- **Протягування:** `mouseDown (30, 10)`, `mouseMove (130, 10)` → preview шириною 112.5px, у проекті 0 педалей (одна дія на жест); `mouseUp` → `end 1.375`.
- **Обмеження сусідом при створенні:** наявна `b = sustain [1, 2)`; клік `(80, 10)` → нова `[0.75, 1)`; протягування `(80, 10) → (300, 10)` → теж `[0.75, 1)`.
- **Дотик до попередньої:** наявна `sustain [0, 0.3)`; клік `(35, 10)` → нова `[0.3, 0.8)` (початок `floor` 0.25 клампиться до 0.3, кінець = 0.3 + доля 0.5).
- **Клік усередині іншого типу:** наявна `sustain [0, 1)`; клік `(50, 30)` → створено sostenuto `[0.5, 1)` (рядки незалежні).
- **Переміщення:** `a`; `mouseDown (60, 10)`, `mouseMove (82, 10)`, `mouseUp` → `[0.75, 1.75)`, тип sustain; рух у рядок soft `mouseMove (82, 50)` → тип лишається sustain.
- **Переміщення з упором:** `a` і `b = sustain [2, 3)`; drag `(60, 10) → (200, 10)` → `a = [1, 2)`, `b` без змін.
- **Зміна початку:** `mouseDown (52, 10)`, `mouseMove (27, 10)`, `mouseUp` → `a = [0.25, 1.5)`.
- **Зміна кінця:** `mouseDown (147, 10)`, `mouseMove (190, 10)`, `mouseUp` → `a = [0.5, 1.875)`.
- **Клік без руху по інтервалу:** інтервал виділено, `pedals` без змін; якщо до цього була виділена нота (`initial selectedNoteIds ['n1']`) → `selectedNoteIds []`.
- **Рух < порогу** (`mouseMove (62, 10)`) + `mouseUp` → без змін.
- **Escape під час створення** → після `mouseUp` педалей 0.
- **ПКМ** по `a` (`contextMenu (100, 10)`) → видалено; ПКМ по порожньому місцю → без змін.
- **Delete / Backspace** після виділення кліком → видалено, `selectedPedalIds []`; `Delete` без виділення → без змін.
- **Права кнопка** `mouseDown button 2` → нічого не створено.
- **Фокус:** після `mouseDown` доріжка у фокусі й має `data-pointer-focus="true"`.
- **Прибирання слухачів:** unmount під час жесту → `window.removeEventListener` викликано для `mousemove`, `mouseup`, `keydown` (як у `NoteGrid.test.tsx`).

### `src/components/PianoRoll/PedalLabels.test.tsx`
- Три підписи в порядку `Sustain`, `Sostenuto`, `Soft`; `title` відповідно `MIDI CC64`, `MIDI CC66`, `MIDI CC67`.

### `src/components/PianoRoll/NoteGrid.test.tsx` (доповнення; наявні тести не змінюються, `renderGrid` отримує необов'язковий третій параметр `pedals`)
- Нота `a` (C4 `[0.5, 1)`) + `sustain [0.75, 2)` → `note-tail` зі стилем `left 100px, width 100px, top 677px, height 4px`; без педалей хвоста немає.
- Під час перетягування `a` вправо хвіст перераховується з preview: `mouseDown (60, 679)`, `mouseMove (72, 679)` (start 0.625, кінець 1.125 у межах педалі) → хвіст `left 112.5px, width 87.5px`.
- Сітка з педаллю `sustain [0, 70.5)` має ширину 7600px.
- Після `mouseDown` сітка має `data-pointer-focus="true"`, після `blur` атрибута немає.

### `src/components/PianoRoll/PianoRoll.test.tsx` (доповнення)
- Регіон містить `application` «Pedal lane» і підписи Sustain / Sostenuto / Soft.
- Клік по доріжці `(30, 10)` → з'являється інтервал з `aria-label="Sustain from 0.25 s to 0.75 s"`; `keyDown Delete` на активному елементі видаляє педаль, а ноти не чіпає (наперед додана кліком нота лишається, `1 note`).

### Ручна перевірка в браузері
`cd backend && uv run uvicorn app.main:app --reload` і `cd frontend && npm run dev`, http://localhost:5173:
1. Під сіткою нот видно доріжку з трьох рядків, зліва підписи Sustain / Sostenuto / Soft (підказка з CC при наведенні). Вертикальна прокрутка нот не зсуває доріжку, а горизонтальна рухає доріжку, лінійку й сітку разом. Лінії тактів і долей на доріжці збігаються з лініями сітки при будь-якому Zoom і Grid.
2. Клік у рядку Sustain створює інтервал довжиною в долю від початку клітинки; протягування вправо подовжує його. Перетягування рухає інтервал, краї змінюють початок і кінець з прив'язкою. Без Snap усе ставиться точно під курсор.
3. Інтервал, який тягнуть на сусідній того самого типу, зупиняється впритул і не заходить на нього; у рядок іншого типу перетягнути не можна; інтервали різних типів можуть перекриватися в часі.
4. ПКМ і `Delete` (фокус на доріжці) видаляють інтервал; `Escape` під час перетягування скасовує жест. Виділення педалі знімає виділення ноти і навпаки; `Delete` на сітці видаляє лише ноту.
5. Нота, відпущена при натиснутому sustain, показує тонкий «хвіст» до кінця педалі; при переміщенні педалі чи ноти хвіст одразу оновлюється. Sostenuto подовжує лише ноти, що звучали в момент натискання.
6. Клік мишею по сітці чи доріжці не дає помаранчевого контуру; перехід на них клавішею `Tab` контур показує.
7. Педаль, протягнута за кінець таймлайну, розширює таймлайн (лінійка, сітка й доріжка однакової ширини після `mouseup`).
8. У консолі немає помилок чи попереджень React; із ~200 нотами й ~50 педалями перетягування лишається плавним.

## Критерії готовності (Definition of Done)
- [ ] `cd frontend && npm test -- --run && npm run lint && npm run typecheck && npm run build` — зелено.
- [ ] `cd backend && uv run pytest && uv run ruff check . && uv run ruff format --check . && uv run mypy app` — зелено (код backend не змінювався).
- [ ] Усі тести з розділу «Тести» наявні й проходять; кожна експортована функція з `pedalIntervals.ts`, `pedalEffects.ts`, `pedalGeometry.ts`, `pedalEditing.ts`, `focus.ts` і нові/змінені функції `pianoRollGeometry.ts`, `editorReducer.ts`, `projectReducer.ts` мають щонайменше один тест.
- [ ] Наявні тести 002–003 не видалені й не послаблені; `git diff main -- frontend/src/components/PianoRoll/NoteGrid.test.tsx` містить лише додані тести та необов'язковий параметр `pedals` у `renderGrid`.
- [ ] `git diff main -- frontend/package.json frontend/package-lock.json backend/pyproject.toml` порожній.
- [ ] Ручна перевірка (8 пунктів) пройдена.
- [ ] README містить розділ «Керування педалями».
- [ ] Гілку `feature/004-pedal-lane` злито в `main` (`--no-ff`) і запушено; на `main` перевірки зелені.
- [ ] У CLAUDE.md відмічено `[x]` три пункти 2.3 з розділу «Мета»; пункт «Педаль впливає на програвання» лишається `[ ]`; статус 004 — «виконано»; статус плану — `виконано`.

## Ризики / відкриті питання
- **Рефакторинг `useNoteDrag`.** Перенесення керування жестом у `useDragGesture` зачіпає код 003. Страховка: тести `NoteGrid`/`PianoRoll` не змінюються й мають лишитися зеленими. Якщо рефакторинг несподівано затягнеться, запасний варіант — `usePedalDrag` без спільного хука (дублювання ~80 рядків) з поясненням у звіті. Це дрібне відхилення, план не змінюється.
- **Sticky-рядок знизу в grid-контейнері з прокруткою.** Підтримується сучасними браузерами. Якщо в якомусь браузері доріжка не «прилипне», запасний варіант — окремий контейнер із синхронізацією `scrollLeft` (див. таблицю варіантів); чисті функції від цього не змінюються.
- **Продуктивність.** `noteSoundingEnds` перераховується на кожен кадр перетягування ноти (O((n + m) log(n + m))). На тисячах нот це мілісекунди. Якщо стане помітно, можна рахувати хвости від `project.notes`, а для preview-ноти окремо.
- **Дотик інтервалів і MIDI.** `a.end == b.start` дозволено моделлю. В експорті (009) CC=0 має йти перед CC=127 на тому самому тіку, інакше педаль «залипне». Це відзначено для 009.
- **Відкрите питання до власника (не блокує, дефолт у плані):** політика перетинів — обмеження (упор у сусіда). Альтернатива — злиття з сусідом. Якщо власник віддає перевагу злиттю, воно додається як окрема дрібна задача, не змінюючи reducer-захисту.
- **Відкрите питання до власника (не блокує):** довжина педалі за замовчуванням — одна доля (але не менше кроку сітки). Можна зробити один такт.
- **Відкрите питання до власника (не блокує):** «хвости» звучання в piano roll показуються завжди. Якщо вони заважатимуть, у 005 можна додати перемикач.
- **Обсяг.** Задача менша за 003 (5 чистих модулів і 3 компоненти), тому лишається однією гілкою. Запасний поділ, якщо implementer не вкладається: **004a** — кроки 2–8 (чисті функції, reducer-захист, стан виділення, виправлення фокусу, без UI доріжки); **004b** — кроки 9–13 (хук, компоненти, layout, README). Галочки 2.3 ставляться лише після 004b.
