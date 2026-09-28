# 003 — Piano roll: сітка, клавіатура, додавання/видалення/зміна нот

**Статус:** схвалено
**Гілка:** feature/003-piano-roll-editing

## Мета
Перший робочий UI редактора: piano roll у центрі екрану, побудований на моделі, reducer'і та чистих функціях із задачі 002 (`projectReducer`, `normalizeNote`, `snapToGrid`, `gridStepSeconds`, `quantizeNote`, `beatDurationSeconds`, `barDurationSeconds`, `secondsToBarPosition`, `clampPitch`, `createId`). Ці функції не дублюються.

Пункти розділу 2.2 CLAUDE.md, які задача **закриває повністю** (після виконання ставимо `[x]`):
- «Piano roll розміщений у центрі екрану: вертикально — клавіатура фортепіано (88 клавіш, A0–C8), горизонтально — час».
- «**Додавання** нот (клік/протягування на сітці)».
- «**Видалення** нот».
- «**Зміна** нот: переміщення по часу й висоті, зміна тривалості, зміна velocity».
- «Прив'язка до сітки (quantize) з вибором кроку; темп (BPM) і розмір такту».

Пункти 2.2, які задача закриває **частково** (галочку НЕ ставимо):
- «Натискання на клавішу віртуальної клавіатури програє відповідну ноту». Зараз робимо лише візуальну реакцію клавіші (стан «натиснута») і подієві хуки `onNoteOn(pitch)` / `onNoteOff(pitch)` у компоненті `PianoKeyboard`. Звук фортепіано (Tone.js Sampler) підключається до цих хуків у задачі 005, і тоді ставиться галочка.
- «Виділення кількох нот, undo/redo» — задача 010. Тут є лише виділення однієї ноти, але стан виділення вже зберігається як масив id, а кожен жест редагування — рівно одна дія reducer'а (див. «Заділ для 010»).

## Поза межами задачі
- Звук (клавіатура, прослуховування ноти під час додавання/перетягування) — 005.
- Playhead, транспорт, клік по лінійці для позиції відтворення — 005.
- Доріжка педалей — 004 (але стан масштабу вже лежить у спільному `EditorProvider`, щоб доріжка педалей мала той самий горизонтальний масштаб).
- Мультивиділення (Shift/Ctrl-клік, рамка), копіювання/вставка, undo/redo, система гарячих клавіш — 010. Тут є лише дві клавіші: `Delete`/`Backspace` (видалити виділену ноту) і `Escape` (скасувати поточне перетягування).
- Окрема доріжка velocity (стовпчики під piano roll). Velocity у 003 змінюється через інспектор ноти (числове поле).
- Зміна тривалості за лівий край ноти (лише за правий), автопрокрутка під час перетягування, масштаб колесом миші, вертикальний масштаб.
- Touch/pen-введення. Використовуються mouse-події (див. «Технічні рішення»).
- Віртуалізація (рендер лише видимих нот). Для сотень–кількох тисяч нот не потрібна (див. «Ризики»).
- Політика перетинів нот однакової висоти: перетини дозволені моделлю (002), редактор їх не виправляє.
- Прив'язка довжини таймлайну до тривалості медіа — 006–008. Зараз довжина таймлайну обчислюється з нот.

## Технічні рішення

### Рендеринг: DOM (div) + CSS-градієнти для сітки
Варіанти:
| Варіант | Плюси | Мінуси |
|---|---|---|
| **DOM** (абсолютно позиціоновані `div` для нот, CSS `repeating-linear-gradient` для вертикальних ліній) | Тестується React Testing Library в jsdom; стилі й курсори через CSS; React.memo на ноті дає ререндер лише зміненої; 0 DOM-вузлів на лінії сітки незалежно від довжини | На >5–10 тис. нот знадобиться віртуалізація |
| SVG | Те саме, що DOM, плюс зручні лінії | Лінії сітки — окремі вузли (тисячі на довгому треку); переваг перед DOM для прямокутників немає |
| Canvas | Найшвидший на десятках тисяч об'єктів | jsdom не має canvas (потрібна нативна залежність `canvas` або моки), ручний hi-DPI, ручна перемальовка, гірша доступність; для фортепіанної аранжировки (сотні–тисячі нот) виграш не потрібен |

**Обрано DOM.** Уся геометрія й hit-testing — у чистих функціях (`pianoRollGeometry.ts`), тож компонент лише відображає результат, а взаємодія тестується без реальної розкладки (у jsdom `getBoundingClientRect()` повертає нулі, отже локальна координата = `clientX`/`clientY` події, що робить тести детермінованими).

Сітка:
- **Вертикальні лінії** (такти, долі, крок сітки) — до 3 шарів `repeating-linear-gradient(to right, …)` на фоні елемента сітки. Сітка прив'язана до 0 с і має постійний темп/розмір (002), тож лінії строго періодичні. Періоди в пікселях рахує чиста функція `gridLayers`.
- **Горизонтальні смуги рядків** — 88 `div`-рядків (темніші для чорних клавіш) з нижньою рамкою, `pointer-events: none`. 88 вузлів — прийнятно і простіше за 12-ступеневий градієнт октави.
- Щільні лінії приховуються: шар кроку/долі не малюється, якщо відстань між лініями < `MIN_GRID_LINE_SPACING_PX = 4`.

### Mouse-події, а не pointer-події
Застосунок настільний. `MouseEvent` з `clientX/clientY` повністю підтримується jsdom і `fireEvent`, тоді як підтримка `PointerEvent` і `setPointerCapture` у jsdom неповна. Замість pointer capture під час перетягування ставляться слухачі `mousemove`/`mouseup` на `window` (знімаються по `mouseup`, `Escape` і при unmount). Нових залежностей і поліфілів не потрібно.

### Нові залежності
Немає. Усе робиться на React + CSS. `package.json` не змінюється.

### Одиниці й геометрія
- Рядок 0 — C8 (pitch 108) зверху, рядок 87 — A0 (21) знизу.
- Константи (`src/utils/pianoRollGeometry.ts`): `ROW_HEIGHT_PX = 14`, `KEYBOARD_WIDTH_PX = 72`, `RULER_HEIGHT_PX = 24`, `DEFAULT_PIXELS_PER_SECOND = 100`, `MIN_PIXELS_PER_SECOND = 20`, `MAX_PIXELS_PER_SECOND = 1000`, `ZOOM_FACTOR = 1.25`, `RESIZE_HANDLE_PX = 6`, `MIN_GRID_LINE_SPACING_PX = 4`, `MIN_TIMELINE_SECONDS = 60`, `MIN_BAR_LABEL_SPACING_PX = 40`.
- `interface ViewGeometry { readonly pixelsPerSecond: number; readonly rowHeight: number }`, `interface Point { readonly x: number; readonly y: number }`, `interface Rect { x; y; width; height }`.

### Чисті функції

`src/utils/pitch.ts`:
- `KEY_COUNT = 88`; `KEYBOARD_PITCHES: readonly number[]` — від 108 до 21 (порядок зверху вниз).
- `isBlackKey(pitch): boolean` — клас висоти `pitch % 12 ∈ {1, 3, 6, 8, 10}`.
- `pitchName(pitch): string` — наукова нотація з дієзами, `60 → 'C4'`, `61 → 'C#4'`, `21 → 'A0'`, `108 → 'C8'` (октава `Math.floor(pitch / 12) - 1`).

`src/utils/pianoRollGeometry.ts`:
- `pitchToY(pitch, g)` = `(MAX_PITCH - pitch) * g.rowHeight`.
- `yToPitch(y, g)` = `clampPitch(MAX_PITCH - Math.floor(y / g.rowHeight))` (рядок напіввідкритий `[top, top + rowHeight)`; вище/нижче області — крайні клавіші).
- `timeToX(t, g)` = `t * g.pixelsPerSecond`; `xToTime(x, g)` = `Math.max(0, x / g.pixelsPerSecond)`.
- `noteRect(note, g): Rect` = `{ x: timeToX(start), y: pitchToY(pitch), width: duration * pps, height: rowHeight }`.
- `hitTestNotes(notes, point, g, handlePx = RESIZE_HANDLE_PX): { noteId: string; zone: 'body' | 'resize' } | null`. Перебір з кінця масиву (остання нота рендериться зверху — вона й «виграє» при перетині). Прямокутник напіввідкритий `[x, x + width) × [y, y + height)`. Зона `resize`, якщо `point.x >= x + width - Math.min(handlePx, width / 3)` (у вузьких нот ручка не займає всю ноту).
- `timelineDurationSeconds(notes, bpm, ts)`: `max(MIN_TIMELINE_SECONDS, lastNoteEnd + 2 * barDuration)`, округлене вгору до цілого такту (`Math.ceil(d / bar - TIME_EPSILON) * bar`).
- `gridContentSize(durationSeconds, g): { width; height }` = `{ durationSeconds * pps, KEY_COUNT * rowHeight }`.
- `gridLayers(bpm, ts, division, pps, minSpacingPx = MIN_GRID_LINE_SPACING_PX): { barPx: number; beatPx: number | null; stepPx: number | null }`:
  - `barPx = barDurationSeconds(bpm, ts) * pps`;
  - `beatPx = beatDurationSeconds * pps`, але `null`, якщо `ts.numerator === 1` або `beatPx < minSpacingPx`;
  - `stepPx = gridStepSeconds(division, bpm) * pps`, але `null`, якщо крок ≥ долі (з `TIME_EPSILON`) — тоді його лінії збігаються з долями або не вирівняні з тактами й лише плутають — або `stepPx < minSpacingPx`.
- `gridBackgroundImage(layers): string` — рядок CSS із шарами `repeating-linear-gradient(to right, var(--grid-bar) 0 1px, transparent 1px <barPx>px)` (такти першими, далі долі `--grid-beat`, крок `--grid-step`), через кому. `null`-шари пропускаються.
- `barLabelStep(barPx, minPx = MIN_BAR_LABEL_SPACING_PX): number` — найменший степінь двійки `k`, для якого `k * barPx >= minPx` (для підписів тактів на лінійці).
- `clampZoom(pps)` — у межах `MIN/MAX_PIXELS_PER_SECOND`.
- `velocityToOpacity(v)` = `0.35 + 0.65 * (v - 1) / 126` (візуалізація velocity яскравістю ноти).

`src/utils/noteEditing.ts` (логіка жестів, без DOM):
- `DRAG_THRESHOLD_PX = 3`, `DEFAULT_NOTE_VELOCITY = 100`, `MIN_FREE_DURATION = 0.01` (мінімальна тривалість при вимкненій прив'язці, щоб нота лишалась видимою).
- `interface DragOptions { readonly step: number; readonly snap: boolean }`; `minDragDuration(opts)` = `opts.snap ? opts.step : MIN_FREE_DURATION`.
- `type DragKind = 'create' | 'move' | 'resize'`; `interface DragState { readonly kind: DragKind; readonly original: Note; readonly originTime: number; readonly originPitch: number }`.
- `createNoteAt(id, time, pitch, velocity, opts): Note` — `start = opts.snap ? snapToGrid(time, step, 'floor') : time`, `duration = step` (крок сітки — довжина ноти за замовчуванням в обох режимах).
- `applyDrag(drag, time, pitch, opts): Note` — попередній вигляд ноти для поточної позиції миші:
  - `create`: `start` не змінюється; `end = snap ? snapToGrid(time, step, 'ceil') : time`; `duration = max(minDragDuration, end - start)` (протягування лише вправо; вліво — мінімальна тривалість);
  - `move`: `dt = time - originTime`; `start = snap ? snapToGrid(original.start + dt, step, 'nearest') : max(0, original.start + dt)`; `pitch = clampPitch(original.pitch + (pitch - originPitch))`; тривалість і velocity не змінюються;
  - `resize`: `end = original.start + original.duration + dt`, при `snap` — `snapToGrid(end, step, 'nearest')`; `duration = max(minDragDuration, end - original.start)`.
- `exceedsDragThreshold(dx, dy)` = `Math.hypot(dx, dy) >= DRAG_THRESHOLD_PX`.
- `withPreview(notes, preview: Note | null): readonly Note[]` — якщо `preview.id` є в `notes`, замінює ту ноту (решта зберігає ідентичність), інакше додає в кінець; `null` → той самий масив.

### Стан редактора (не частина `Project`)
`Project` лишається моделлю документа (002). UI-стан редактора — окремий reducer і контекст, за тим самим шаблоном, що `ProjectProvider`:
- `src/state/editorState.ts`:
  - `interface EditorState { readonly gridDivision: GridDivision; readonly snapEnabled: boolean; readonly pixelsPerSecond: number; readonly selectedNoteIds: readonly string[] }`;
  - `DEFAULT_EDITOR_STATE`: `'1/16'`, `true`, `DEFAULT_PIXELS_PER_SECOND`, `[]`;
  - `EditorAction`: `editor/setGridDivision`, `editor/setSnap`, `editor/setZoom` (`pixelsPerSecond`), `editor/selectNotes` (`ids: readonly string[]`, замінює виділення), `editor/clearSelection`; action creators з тими самими назвами без префікса.
- `src/state/editorReducer.ts` — чистий `editorReducer`; `setZoom` через `clampZoom`, NaN/Infinity ігнорується; дія без змін повертає той самий об'єкт (як у 002). Exhaustive switch з `never`.
- `src/state/editorContext.ts` — `EditorStateContext`, `EditorDispatchContext`, `useEditor()`, `useEditorDispatch()` (помилка поза провайдером).
- `src/state/EditorProvider.tsx` — `EditorProvider({ children, initialState? })`.
- Селектор `selectedNotes(notes, selectedIds): readonly Note[]` у `editorState.ts` — ноти в порядку `notes`, неіснуючі id ігноруються (тож після видалення/`project/load` «висячі» id нічого не ламають).

Чому контекст, а не локальний стан `PianoRoll`: масштаб і сітка потрібні доріжці педалей (004), playhead (005) і синхронізації (008); вибір з 010 теж ляже сюди.

### Заділ для 010 (мультивиділення, undo/redo)
- `selectedNoteIds` — масив; інспектор, `Delete` і «Quantize» працюють з `selectedNotes(...)`, тобто вже з кількома нотами. 010 додасть лише дії `toggleSelection`/`addToSelection` і рамку.
- Один жест = одна дія `projectReducer`: під час перетягування нота рендериться з локального preview (`withPreview`), а в стан проекту йде одна дія на `mouseup` (`addNotes` або `updateNote`). Проміжних `notes/update` на кожен `mousemove` немає, тож history-обгортка з 010 отримає рівно один крок на жест.
- id нової ноти генерується (`createId()`) на `mousedown` і передається в `addNotes([...])` явно, тож дію можна повторити при redo з тим самим id.
- Поле введення (`CommitNumberInput`) фіксує значення по Enter/blur, а не на кожен символ — теж один крок undo на редагування.

### Взаємодія мишею (усе на елементі сітки `NoteGrid`)
Локальна точка: `x = e.clientX - rect.left`, `y = e.clientY - rect.top`, де `rect` — `getBoundingClientRect()` самого вмісту сітки (він прокручується разом зі scroll-контейнером, тож `scrollLeft` додавати не треба).
- **ЛКМ по порожньому місцю** → жест `create`: нова нота (`createNoteAt` з id `createId()`, pitch рядка, `DEFAULT_NOTE_VELOCITY`) одразу видна як preview; протягування вправо змінює тривалість; `mouseup` → `addNotes([preview])` і `selectNotes([id])`. Клік без руху додає ноту довжиною в крок сітки.
- **ЛКМ по тілу ноти** → `selectNotes([id])` і жест `move`; **по правому краю** (зона `resize`) → жест `resize`. Поки зсув < `DRAG_THRESHOLD_PX`, нічого не змінюється (простий клік лише виділяє). `mouseup` після руху → `updateNote(id, { start, duration, pitch })` (reducer сам поверне той самий state, якщо нічого не змінилось).
- **ПКМ по ноті** (`contextmenu`) → `removeNotes([id])`, прибрати її з виділення; `preventDefault()` для контекстного меню браузера лише над нотою.
- **`Delete`/`Backspace`**, коли фокус на сітці (scroll-контейнер має `tabIndex={0}`; на `mousedown` викликається `focus({ preventScroll: true })`) → `removeNotes(selectedIds)` + `clearSelection()`.
- **`Escape`** під час жесту → скасувати (preview зникає, дій не надсилається).
- `mousedown` викликає `preventDefault()` (без виділення тексту); кнопки, крім лівої, не починають жест.
- Курсор: над ручкою ресайзу — `ew-resize` (CSS на `.note__handle`), над тілом — `grab`.
- Реалізація в хуку `src/components/PianoRoll/useNoteDrag.ts`: `useNoteDrag({ notes, geometry, dragOptions, getLocalPoint, onCommitCreate, onCommitUpdate, onSelect }) → { preview: Note | null, onMouseDown }`. Поточний жест зберігається в `useRef`, preview — у `useState`; слухачі `window` додаються в `useEffect`, поки жест активний, і знімаються в cleanup.

### Компоненти
Папка `src/components/PianoRoll/` (стилі в `PianoRoll.css`, CSS-змінні `--grid-bar/--grid-beat/--grid-step/--note/--note-selected/--key-white/--key-black` додаються в `:root` у `App.css`):
- `PianoRoll.tsx` — `<section aria-label="Piano roll">`: `PianoRollToolbar` зверху і один scroll-контейнер (`overflow: auto`) з CSS grid 2×2: кут, `TimeRuler` (`position: sticky; top: 0`), `PianoKeyboard` (`sticky; left: 0`), `NoteGrid`. Один контейнер → клавіатура й сітка прокручуються вертикально синхронно без JS. При монтуванні `scrollTop` ставиться так, щоб у центрі була C4 (`pitchToY(60) - clientHeight / 2`, не менше 0).
- `PianoRollToolbar.tsx` — `<select aria-label="Grid">` з `GRID_DIVISIONS` (підписи `1/16`, `1/8T` → «1/8 triplet»), чекбокс «Snap», кнопки «Zoom out» / «Zoom in» (`clampZoom(pps / ZOOM_FACTOR)` / `* ZOOM_FACTOR`, disabled на межах), кнопка «Quantize» (disabled без виділення) → `updateNotes(selected.map(n => ({ id, patch: { start, duration } з quantizeNote(n, step) })))`, і `NoteInspector`.
- `NoteInspector.tsx` — без виділення: «No note selected». Для однієї виділеної ноти: назва (`pitchName`), позиція `bar N, beat M` (через `secondsToBarPosition`), тривалість у секундах (3 знаки), поле «Velocity» (`CommitNumberInput`, 1–127 → `updateNote(id, { velocity })`, reducer клампить) і кнопка «Delete note». Для кількох (після 010): «N notes selected», velocity застосовується до всіх через `updateNotes` (логіка пишеться одразу для масиву).
- `PianoKeyboard.tsx` — 88 `<button type="button" aria-label="C4" data-pitch="60" aria-pressed>` висотою `rowHeight`, білі/чорні за `isBlackKey`, на клавішах C — видимий підпис (`C4`). Props: `rowHeight`, `onNoteOn?: (pitch) => void`, `onNoteOff?: (pitch) => void`. `mousedown` → стан «натиснута» + `onNoteOn`; `mouseup` на `window` або `mouseleave` → `onNoteOff` і скидання. У 003 `PianoRoll` колбеки не передає (лише візуальна реакція); 005 передасть семплер.
- `TimeRuler.tsx` — підписи номерів тактів 1, 2, 3… кожні `barLabelStep(barPx)` тактів, позиція `timeToX(bar * barDuration)`.
- `NoteGrid.tsx` — фон з `gridBackgroundImage(gridLayers(...))`, 88 рядків, ноти `withPreview(project.notes, preview)` через `React.memo`-компонент `NoteView` (`data-testid="note"`, `data-note-id`, `data-selected`, `aria-label="C4, velocity 100"`, `opacity` з `velocityToOpacity`, `div.note__handle` справа). Ширина/висота — `gridContentSize(timelineDurationSeconds(...))`.
- `src/components/CommitNumberInput.tsx` — перевикористовуване числове поле: props `value`, `onCommit(n)`, `label` (aria-label), `min`, `max`, `step`. Локальна чернетка; фіксує по Enter/blur, якщо текст — скінченне число; Escape або некоректний текст → повернення до `value`. Після фіксації показує `value` з props (тобто вже клампнуте reducer'ом значення).
- `src/components/TempoControls.tsx` — у транспортній панелі: `<label>♩ = <CommitNumberInput label="Tempo (quarter notes per minute)" min=20 max=300 step=1 /></label>` → `setBpm`; розмір: `CommitNumberInput` «Time signature numerator» (1–32) і `<select aria-label="Time signature denominator">` з `ALLOWED_DENOMINATORS` → `setTimeSignature`. Некоректне значення reducer ігнорує, і поле повертається до поточного.
- `ProjectInfo.tsx` — тепер показує лише кількість нот (`0 notes`), бо темп і розмір показує `TempoControls` (без дублювання «120 BPM» поряд із «♩ = 120»).
- `App.tsx` — обгортка `ProjectProvider > EditorProvider`; у `header` — `TempoControls` і `ProjectInfo`; у `main` замість заглушки — `PianoRoll`. `.app__editor` у `App.css`: `display: flex; flex-direction: column; min-width: 0; min-height: 0; overflow: hidden`, без центрування.

## Кроки реалізації
1. Від актуального `main` створити гілку `feature/003-piano-roll-editing`.
2. `src/utils/pitch.ts` + `pitch.test.ts`. Коміт `feat: add pitch name and key color helpers`.
3. `src/utils/pianoRollGeometry.ts` + `pianoRollGeometry.test.ts` (усі функції з розділу «Чисті функції»). Коміт `feat: add piano roll geometry and hit testing`.
4. `src/utils/noteEditing.ts` + `noteEditing.test.ts`. Коміт `feat: add note drag editing logic`.
5. `src/state/editorState.ts`, `editorReducer.ts`, `editorContext.ts`, `EditorProvider.tsx` + `editorReducer.test.ts`, `EditorProvider.test.tsx`. Коміт `feat: add editor state (grid, snap, zoom, selection)`.
6. `src/components/CommitNumberInput.tsx` + тест; `TempoControls.tsx` + тест; зміна `ProjectInfo.tsx` і його тесту (перевірки BPM/розміру переносяться в `TempoControls.test.tsx`, див. «Тести»). Коміт `feat: add tempo and time signature controls`.
7. `PianoKeyboard.tsx`, `TimeRuler.tsx` + тести. Коміт `feat: add piano keyboard and time ruler`.
8. `useNoteDrag.ts`, `NoteGrid.tsx` (рендер + миша + Delete/ПКМ) + `NoteGrid.test.tsx`. Коміт `feat: add note grid with create, move, resize and delete`.
9. `NoteInspector.tsx`, `PianoRollToolbar.tsx`, `PianoRoll.tsx`, `PianoRoll.css`, CSS-змінні в `App.css` + тести. Коміт `feat: add piano roll toolbar and note inspector`.
10. Підключити в `App.tsx` (`EditorProvider`, `TempoControls`, `PianoRoll`), оновити `App.css` і `App.test.tsx`. Коміт `feat: show piano roll in the editor area`.
11. README: короткий розділ «Керування piano roll» (клік/протягування — додати, перетягування — рух, правий край — тривалість, ПКМ/Delete — видалити, Escape — скасувати). Коміт `docs: describe piano roll controls`.
12. Усі перевірки (DoD), ручна перевірка в браузері, злиття `--no-ff` у `main`, перевірки на `main`, push.
13. CLAUDE.md: `[x]` для п'яти пунктів 2.2 з розділу «Мета» (без пункту про звук клавіатури та undo/redo), статус 003 у розділі 8 — «виконано»; статус плану — `виконано`. Коміт `docs: mark task 003 as done`.

## Тести
Backend не змінюється; наявні тести мають і далі проходити.

У тестах компонентів: `ViewGeometry` за замовчуванням (`pps = 100`, `rowHeight = 14`), проект 120 BPM 4/4, сітка `1/16` → крок 0.125 с = 12.5 px. Рядок pitch 60 займає y ∈ [672, 686), тому точки беруться з `y = 679`. `createId` мокається через `vi.spyOn` (повертає `'new-1'`). Події — `fireEvent.mouseDown(grid, { clientX, clientY })`, `fireEvent.mouseMove(window, …)`, `fireEvent.mouseUp(window, …)`; у jsdom `rect` = 0, тож `clientX` = локальний x.

### `src/utils/pitch.test.ts`
- `pitchName`: 21 → `A0`, 60 → `C4`, 61 → `C#4`, 69 → `A4`, 108 → `C8`.
- `isBlackKey`: 60 → false, 61 → true, 22 (A#0) → true, 108 → false.
- `KEYBOARD_PITCHES`: довжина 88, перший 108, останній 21; чорних 36, білих 52.

### `src/utils/pianoRollGeometry.test.ts`
- `pitchToY(108) === 0`, `pitchToY(21) === 1218`; `yToPitch(0) === 108`, `(13.9) === 108`, `(14) === 107`, `(1231) === 21`, `(5000) === 21`, `(-5) === 108`; `yToPitch(pitchToY(p) + 1) === p` для всіх 88.
- `timeToX(1.5) === 150`; `xToTime(250) === 2.5`; `xToTime(-10) === 0`.
- `noteRect({pitch 60, start 0.5, duration 0.5})` → `{x 50, y 672, width 50, height 14}`.
- `hitTestNotes` з нотою a (60, 0.5–1.0): `(60, 679)` → `{a, body}`; `(95, 679)` → `{a, resize}` (зона з x ≥ 94); `(93, 679)` → body; `(100, 679)` → `null` (правий край не включно); `(60, 686)` → `null` (рядок 59); вузька нота `duration 0.09` (w = 9) у точці `x + 5` → body, `x + 6` → resize; дві перетинні ноти → повертається остання в масиві; порожній масив → `null`.
- `timelineDurationSeconds([], 120, 4/4) === 60`; нота з кінцем 70.5 с → 76 (70.5 + 4 = 74.5 → 38 тактів); `([], 120, 3/4) === 60`.
- `gridContentSize(60)` → `{width 6000, height 1232}`.
- `gridLayers(120, 4/4, '1/16', 100)` → `{barPx 200, beatPx 50, stepPx 12.5}`; `(120, 4/4, '1/4', 100)` → `stepPx null` (крок = долі); `(120, 4/4, '1/2', 100)` → `stepPx null`; `(120, 4/4, '1/32', 20)` → `stepPx null` (1.25 px < 4), `beatPx 10`, `barPx 40`; `(120, 6/8, '1/16', 100)` → `{150, 25, 12.5}`; `(120, 1/4, '1/16', 100)` → `beatPx null`; `(300, 4/4, '1/1', 20)` → `beatPx 4` (рівно межа — лишається).
- `gridBackgroundImage({200, 50, null})` → рядок з двома `repeating-linear-gradient`, містить `200px` і `50px` і `var(--grid-bar)` першим; `({200, null, null})` → один шар.
- `barLabelStep(200) === 1`, `(25) === 2`, `(5) === 8`.
- `clampZoom(5) === 20`, `(5000) === 1000`, `(150) === 150`.
- `velocityToOpacity(1)` ≈ 0.35, `(127)` ≈ 1 (`toBeCloseTo`), функція монотонно зростає.

### `src/utils/noteEditing.test.ts`
Опції `{ step: 0.125, snap: true }`, якщо не сказано інше.
- `createNoteAt('n', 0.3, 60, 100, opts)` → `{id 'n', start 0.25, duration 0.125, pitch 60, velocity 100}`; зі `snap: false` → `start 0.3, duration 0.125`.
- `applyDrag` create (start 0.25): time 0.8 → duration 0.625 (кінець ceil 0.875); time 0.1 (ліворуч від початку) → 0.125; `snap: false`, time 0.8 → 0.55; `snap: false`, time 0.2 → 0.01.
- move (original 60 / 0.5 / 0.5, origin time 0.6, pitch 60): time 0.82, pitch 62 → `start 0.75, pitch 62, duration 0.5`; time 0.0, pitch 60 → `start 0.0` (не від'ємно); pitch 200 → 108; pitch 0 → 21; `snap: false`, time 0.83 → `start ≈ 0.73`; velocity і id не змінюються.
- resize (та сама нота, origin time 0.97): time 1.3 → duration 0.875 (кінець 1.33 → 1.375); time 0 → 0.125 (мінімум — крок); `snap: false`, time 0 → 0.01.
- `exceedsDragThreshold(2, 0) === false`, `(3, 0) === true`, `(2, 2.3) === true`.
- `withPreview(notes, null)` повертає той самий масив (`toBe`); preview з наявним id замінює ноту, інші зберігають ідентичність; новий id → доданий у кінець; вхідний масив не мутується.

### `src/state/editorReducer.test.ts`
- Стан за замовчуванням: `'1/16'`, snap true, 100 px/с, виділення порожнє.
- `setGridDivision('1/8T')` застосовується; те саме значення → той самий об'єкт.
- `setSnap(false)` застосовується.
- `setZoom(5)` → 20, `setZoom(5000)` → 1000, `setZoom(NaN)` → той самий об'єкт.
- `selectNotes(['a'])` → `['a']`; `clearSelection()` на порожньому → той самий об'єкт.
- `selectedNotes(notes, ['b', 'zzz'])` → лише нота b; порядок як у `notes`.
- Вхідний стан заморожений (`Object.freeze`), мутації немає.

### `src/state/EditorProvider.test.tsx`
- Споживач у провайдері бачить стан за замовчуванням і після dispatch `setGridDivision` — нове значення; `useEditor()` поза провайдером кидає помилку з очікуваним текстом.

### `src/components/CommitNumberInput.test.tsx`
- Показує `value`; ввести `90` + Enter → `onCommit(90)` один раз; ввести `abc` + blur → `onCommit` не викликано, показ повертається до `value`; ввести `50` + Escape → не викликано, повернення; зміна `value` у props (без редагування) оновлює показ.

### `src/components/TempoControls.test.tsx` (у `ProjectProvider` + допоміжний споживач, що виводить `bpm` і розмір)
- Видно текст `♩ =` і поле «Tempo (quarter notes per minute)» зі значенням `120`.
- `90` + Enter → стан 90; `1000` + Enter → стан 300 і поле показує `300`.
- Чисельник `3` + Enter → `3/4`; знаменник `8` → `3/8`; чисельник `0` + Enter → розмір не змінився, поле знову `4`.
- З `initialProject` (90 BPM, 6/8) поля показують `90`, `6`, `8` (перенесено з колишнього `ProjectInfo.test`).

### `src/components/ProjectInfo.test.tsx` (оновлюється)
- Дефолт → `0 notes`; 2 ноти → `2 notes`; одна → `1 note`. Перевірки `120 BPM`/`6/8` видаляються **лише** тому, що компонент більше їх не показує; відповідні перевірки перенесено в `TempoControls.test.tsx`.

### `src/components/PianoRoll/PianoKeyboard.test.tsx`
- 88 кнопок; перша за DOM — `C8`, остання — `A0`; кнопка `C4` має видимий підпис `C4`; `C#4` — клас чорної клавіші.
- `mouseDown` на `C4` → `onNoteOn(60)`, `aria-pressed="true"`; `mouseUp` на `window` → `onNoteOff(60)`, `aria-pressed="false"`.
- Без колбеків натискання не кидає помилок і дає візуальний стан.

### `src/components/PianoRoll/TimeRuler.test.tsx`
- 60 с, 120 BPM 4/4, 100 px/с → 30 підписів `1`…`30`; при 20 px/с (такт 40 px) → підписи кожен такт (крок 1); 20 px/с і 3/4 (такт 1.5 с = 30 px, 40 тактів) → лише непарні такти `1, 3, 5, …, 39` (крок 2).

### `src/components/PianoRoll/NoteGrid.test.tsx` (у `ProjectProvider` + `EditorProvider`, допоміжний споживач показує ноти JSON-ом)
- **Створення кліком:** `mouseDown (30, 679)` + `mouseUp (30, 679)` → у проекті одна нота `{id 'new-1', pitch 60, start 0.25, duration 0.125, velocity 100}`, вона виділена (`data-selected="true"`).
- **Створення протягуванням:** `mouseDown (30, 679)`, `mouseMove (80, 679)` → preview має ширину 62.5 px; до `mouseUp` у проекті нот 0 (одна дія на жест); після `mouseUp` → `duration 0.625`.
- **Snap вимкнено** (`initialState.snapEnabled = false`): клік у `(30, 679)` → `start 0.3`.
- **Переміщення:** нота a (60, 0.5, 0.5); `mouseDown (60, 679)`, `mouseMove (82, 651)`, `mouseUp` → `start 0.75, pitch 62, duration 0.5`.
- **Переміщення за межі:** `mouseMove (60, -100)` → pitch 108; `mouseMove (-500, 679)` → start 0.
- **Ресайз:** `mouseDown (97, 679)`, `mouseMove (130, 679)`, `mouseUp` → `duration 0.875`, start і pitch без змін.
- **Клік без руху по ноті:** нота виділена, об'єкт проекту той самий (порівняння через ref, отриманий споживачем).
- **Рух < порогу** (`mouseMove (62, 679)`) + `mouseUp` → нота не змінилась.
- **Escape під час створення** → після `mouseUp` нот 0.
- **ПКМ** (`fireEvent.contextMenu (60, 679)`) → нота видалена; ПКМ по порожньому місцю → нічого.
- **Delete:** виділити a кліком, `keyDown Delete` на сітці → нота видалена, виділення порожнє; `Backspace` — так само; `Delete` без виділення → проект той самий.
- **Права кнопка миші** (`mouseDown` з `button: 2`) не створює ноту.
- Велика velocity → вища `opacity` ноти (порівняння двох нот 1 і 127).

### `src/components/PianoRoll/NoteInspector.test.tsx`
- Без виділення → «No note selected».
- Виділена нота (60, start 2.75, 120 BPM 4/4) → `C4`, `bar 2, beat 2`, поле Velocity `100`; `64` + Enter → velocity 64; `200` + Enter → 127; кнопка «Delete note» → нота видалена, «No note selected».

### `src/components/PianoRoll/PianoRollToolbar.test.tsx`
- Select «Grid» → `1/8` змінює стан редактора; чекбокс Snap перемикає `snapEnabled`.
- «Zoom in» → 125 px/с; «Zoom out» при 20 px/с — disabled.
- «Quantize» disabled без виділення; з виділеною нотою (start 0.26, duration 0.2) і сіткою `1/16` → `start 0.25, duration 0.25`.

### `src/components/PianoRoll/PianoRoll.test.tsx`
- Рендерить регіон «Piano roll», 88 клавіш, лінійку, сітку і тулбар; після кліку по сітці `ProjectInfo` поряд показує `1 note` (інтеграція провайдерів).

### `src/App.test.tsx` (оновлюється)
- Три області layout як раніше; у транспортній панелі поле «Tempo (quarter notes per minute)» зі значенням `120` і текст `♩ =` (замість `120 BPM`); у редакторі — регіон «Piano roll»; `backend: online`.

### Ручна перевірка в браузері
`cd backend && uv run uvicorn app.main:app --reload` і `cd frontend && npm run dev`, http://localhost:5173:
1. Piano roll займає центр: зліва 88 клавіш (C8 зверху, A0 знизу, підписи C1…C8), зверху номери тактів, у видимій області приблизно C4. Вертикальна прокрутка рухає клавіатуру разом із сіткою; горизонтальна — лінійку разом із сіткою, клавіатура лишається зліва.
2. Лінії тактів яскравіші за лінії долей, ті — за лінії кроку; при зміні Grid на `1/8T` лінії кроку перебудовуються; при «Zoom out» до мінімуму дрібні лінії зникають, такти лишаються.
3. Клік по сітці додає ноту довжиною в крок на початку клітинки; протягування вправо подовжує її; перетягування ноти рухає її по часу й висоті з прив'язкою; правий край — змінює тривалість; ПКМ і Delete видаляють; Escape під час перетягування скасовує.
4. Зняти Snap → нота ставиться точно під курсор.
5. Інспектор показує виділену ноту; зміна Velocity змінює яскравість ноти; Quantize вирівнює ноту, поставлену без прив'язки.
6. «♩ = 90» + Enter → лінії сітки розширюються, ноти лишаються на місці в секундах (не рухаються відносно тактів-секунд); розмір `3/4` → лінії тактів кожні 3 долі; `6/8` → доля — восьма.
7. Натискання клавіші віртуальної клавіатури підсвічує її, поки кнопка миші натиснута; звуку немає (005).
8. Створити ~200 нот: перетягування лишається плавним. У консолі немає помилок чи попереджень React.

## Критерії готовності (Definition of Done)
- [ ] `cd frontend && npm test -- --run && npm run lint && npm run typecheck && npm run build` — зелено.
- [ ] `cd backend && uv run pytest && uv run ruff check . && uv run mypy app` — зелено (код backend не змінювався).
- [ ] Усі тести з розділу «Тести» наявні й проходять; `npx vitest run --coverage` не обов'язковий, але кожна експортована функція з `pitch.ts`, `pianoRollGeometry.ts`, `noteEditing.ts`, `editorReducer.ts` має щонайменше один тест.
- [ ] `git diff main -- frontend/package.json backend/pyproject.toml` порожній (нових залежностей немає).
- [ ] Ручна перевірка (8 пунктів) пройдена.
- [ ] README містить розділ «Керування piano roll».
- [ ] Гілку `feature/003-piano-roll-editing` злито в `main` (`--no-ff`) і запушено; на `main` перевірки зелені.
- [ ] У CLAUDE.md відмічено `[x]` п'ять пунктів 2.2 з розділу «Мета»; пункти про звук клавіатури й undo/redo лишаються `[ ]`; статус 003 — «виконано»; статус плану — `виконано`.

## Ризики / відкриті питання
- **Обсяг.** Задача найбільша з досі виконаних (~10 нових модулів і компонентів), але цілісна: розділення на «відображення» і «редагування» дало б проміжний стан, у якому 2.2 не закривається жодним пунктом. Лишаємо одну гілку з 10 невеликими комітами. Якщо implementer побачить, що не вкладається, запасний поділ: **003a** — кроки 2–7 + відображення нот у `NoteGrid` і додавання/видалення (без move/resize/інспектора); **003b** — `move`/`resize`, `NoteInspector`, Quantize.
- **Точність CSS-градієнтів на довгих таймлайнах.** Дробовий період (наприклад, 12.5 px) на ширині в десятки тисяч пікселів може давати субпіксельне розмиття чи дрейф ліній відносно нот у деяких браузерах. Перевіряється вручну (пункт 2) на таймлайні 5+ хвилин. Запасний варіант без зміни чистих функцій: окремий компонент, що малює SVG-лінії лише для видимого діапазону (`scrollLeft`…`scrollLeft + clientWidth`), використовуючи ті самі `gridLayers`.
- **Продуктивність Context.** Кожна зміна проекту ререндерить `NoteGrid`; `NoteView` під `React.memo` і збереження ідентичності незмінених нот reducer'ом (002) роблять це дешевим. Під час перетягування змінюється лише локальний preview. Якщо на кількох тисячах нот буде відчутна затримка — віртуалізація за видимим діапазоном часу (окрема задача) або перехід на Zustand, як описано в 002.
- **Mouse-події замість pointer-подій** — touch/pen не підтримуються. Для настільного редактора це прийнятно; перехід на pointer-події пізніше зачепить лише `useNoteDrag` і `PianoKeyboard`.
- **Знаки альтерації:** назви лише з дієзами (`C#4`), без бемолів — стандарт більшості DAW. Нумерація октав: C4 = 60 (узгоджено з A0 = 21, C8 = 108 у CLAUDE.md).
- **Відкрите питання до власника (не блокує, дефолт у плані):** velocity редагується числовим полем в інспекторі; окрема velocity-доріжка під piano roll (як у DAW) може бути додана пізніше, але місце під piano roll займе доріжка педалей (004).
