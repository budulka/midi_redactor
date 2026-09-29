# 010 — Undo/redo, мультивиділення, гарячі клавіші, e2e-тести (Playwright)

**Статус:** виконано
**Гілка:** feature/010-undo-selection-e2e

## Мета
Закрити останній невиконаний пункт розділу 2 CLAUDE.md і додати e2e-тести, заплановані в стеку (розділ 3):

- **2.2 «Виділення кількох нот, undo/redo»** закривається повністю (після виконання ставимо `[x]`):
  - **undo/redo** для всіх змін документа `Project`: ноти, педалі, BPM, розмір такту. Керування через `Ctrl/⌘+Z`, `Ctrl/⌘+Shift+Z` / `Ctrl+Y` і кнопки «Undo» / «Redo» на панелі piano roll;
  - **мультивиділення нот**: `Shift`/`Ctrl`/`⌘`-клік, рамка (`Shift`/`Ctrl`/`⌘` + протягування по порожньому місцю), `Ctrl/⌘+A`, `Escape`. Групові дії: переміщення й зміна тривалості мишею, зсув стрілками, видалення, velocity і Quantize (останні два вже працюють з масивом, 003);
  - **мультивиділення педалей** (заявлено в 004 як частина 010): `Shift`/`Ctrl`/`⌘`-клік, `Ctrl/⌘+A`, `Escape`, групове видалення.
- **Гарячі клавіші**, відкладені попередніми задачами: `Space` = Play/Pause (005, 006, 007, 008), `Ctrl/⌘+S` = експорт `.mid` (009), стрілки для зсуву нот, `Ctrl/⌘+A`, `Escape`.
- **E2E-тести на Playwright**: реальний браузер (Chromium), реальний frontend (Vite) і backend (uvicorn). Покривають сценарії, які unit-тести в jsdom перевірити не можуть: справжні події миші та клавіатури, фокус, завантаження `.mid`, запуск звуку.

Задача спирається на готове й не дублює його:
- `projectReducer` (002/004) чистий, повертає **той самий об'єкт** для дії без змін і приймає масиви (`updateNotes`, `removeNotes`...). Отже, undo робиться обгорткою над ним, а сам reducer не змінюється (рішення 002);
- кожен жест мишею — рівно одна дія reducer'а на `mouseup` (003, `useDragGesture`), тож один жест — один крок undo;
- виділення вже зберігається масивами `selectedNoteIds` / `selectedPedalIds`, ноти й педалі виділяються взаємовиключно (003/004); `NoteInspector`, `Quantize` і `Delete` працюють з масивом;
- `TransportApi.togglePlay()` (005), `ExportButton` з `exportMidi` / `downloadBlob` (009);
- `.gitignore` уже містить `test-results/` і `playwright-report/`; семпли фортепіано лежать у репозиторії (`frontend/public/samples/salamander/`), тож звук в e2e працює без мережі.

## Поза межами задачі
- Копіювання / вставка / дублювання нот (`Ctrl+C/V/D`). Цього немає у вимогах; окрема дрібна задача за бажанням власника (див. «Відкриті питання»).
- Групове переміщення й зміна меж **кількох педалей** мишею чи стрілками, а також рамка на доріжці педалей. Однотипні педалі не можуть перетинатися (004), і групове переміщення потребує окремих правил зупинки біля сусідів. Для педалей лише мультивиділення, групове видалення, `Ctrl+A` та `Escape`.
- Змішане виділення нот і педалей одночасно. Лишається взаємовиключним (004).
- Історія **стану редактора**: зум, крок сітки, Snap, Follow, виділення не потрапляють в undo. Undo змінює лише документ `Project`.
- Об'єднання кількох дій в один крок undo (coalescing). Не потрібне: кожне поле (`CommitNumberInput`) і кожен жест вже дають одну дію.
- Збереження історії між перезавантаженнями сторінки, збереження / відкриття проекту.
- Налаштування гарячих клавіш користувачем, вікно-довідка з клавішами (перелік — у README і в `title` кнопок).
- Гарячі клавіші для Stop, перемотування, зуму.
- E2E у Firefox / WebKit і CI (GitHub Actions у репозиторії немає). Лише Chromium локально; розширення — окремою задачею.
- Зміна переліку обов'язкових команд перевірки в розділі 7 CLAUDE.md (див. «Відкриті питання»).

## Технічні рішення

### 1. Undo/redo — `src/state/history.ts` (новий)
Обгортка `past / present / future` над незмінним `projectReducer`, як і заплановано в 002.

```ts
export const HISTORY_LIMIT = 200;

export interface History {
  readonly past: readonly Project[];     // oldest first
  readonly present: Project;
  readonly future: readonly Project[];   // next redo first
}

export type HistoryAction = { readonly type: 'history/undo' } | { readonly type: 'history/redo' };

export function createHistory(project: Project): History;          // { past: [], present: project, future: [] }
export function undo(): HistoryAction;
export function redo(): HistoryAction;
export function historyReducer(state: History, action: ProjectAction | HistoryAction): History;
```

Правила `historyReducer`:
1. `history/undo`: `past` порожній → той самий `state`. Інакше `present = past.at(-1)`, `past` без останнього, `future = [старий present, ...future]`.
2. `history/redo`: симетрично; `future` порожній → той самий `state`.
3. `project/load`: `{ past: [], present: projectReducer(present, action), future: [] }`. Завантаження — це новий документ, і відкат до попереднього документа не потрібен. Зараз UI цю дію не використовує, але правило фіксуємо, щоб майбутній імпорт не створював дивного кроку undo.
4. Решта дій: `next = projectReducer(present, action)`. Якщо `next === present` (дія без змін: невідомий id, той самий BPM, відхилений перетин педалей) → повертається **той самий `state`**, порожнього кроку немає. Інакше `past = [...past, present].slice(-HISTORY_LIMIT)`, `present = next`, `future = []`.

Снапшоти — це самі об'єкти `Project`. Reducer зберігає незмінені ноти й масиви за посиланням (structural sharing), тож 200 кроків навіть для тисяч нот займають мало пам'яті. Альтернатива «зберігати інверсні дії (patches)» складніша й крихкіша: кожна дія потребувала б власної інверсії, а виграш у пам'яті тут не потрібен.

**`ProjectProvider`** (зміна): `useReducer(historyReducer, initialProject, (initial) => createHistory(initial ?? createEmptyProject()))`.
- `ProjectStateContext` отримує `history.present`. Усі наявні споживачі `useProject()` не змінюються.
- `ProjectDispatchContext` отримує той самий `dispatch`. Тип `Dispatch<ProjectAction | HistoryAction>` сумісний з `Dispatch<ProjectAction>`, тож тип контексту й `useProjectDispatch()` не змінюються.
- **Новий `src/state/historyContext.ts`**:
  ```ts
  export interface HistoryState { readonly canUndo: boolean; readonly canRedo: boolean }
  export interface HistoryApi { undo(): void; redo(): void }   // stable for the provider lifetime
  export const HistoryStateContext: Context<HistoryState | null>;
  export const HistoryApiContext: Context<HistoryApi | null>;
  export function useHistoryState(): HistoryState;   // throws 'useHistoryState must be used within ProjectProvider'
  export function useHistoryApi(): HistoryApi;       // throws 'useHistoryApi must be used within ProjectProvider'
  ```
  `HistoryApi` створюється в `useMemo(..., [dispatch])` (тобто один раз), `HistoryState` — у `useMemo` від `past.length > 0` і `future.length > 0`.

**Кнопки «Undo» / «Redo»** у `PianoRollToolbar` (перед «Grid»): `<button type="button" aria-label="Undo" title="Undo (Ctrl+Z)" disabled={!canUndo} onClick={undo}>Undo</button>` і так само «Redo» (`title="Redo (Ctrl+Shift+Z)"`).

**Виділення після undo — `src/state/SelectionSync.tsx`** (новий, міст на кшталт `MediaSyncBridge`). Undo може прибрати ноту, яка виділена (наприклад, скасування створення). Щоб у виділенні не лишалися id неіснуючих об'єктів:
- нова дія редактора `{ type: 'editor/retainSelection'; noteIds: readonly string[]; pedalIds: readonly string[] }` і creator `retainSelection(noteIds, pedalIds)` в `editorState.ts`. Reducer лишає у `selectedNoteIds` / `selectedPedalIds` лише id з переданих списків, зберігаючи порядок. Якщо нічого не прибрано → той самий `state`;
- `SelectionSync` у `useEffect` на `[notes, pedals, dispatch]` диспатчить `retainSelection(notes.map(id), pedals.map(id))`, повертає `null`. Монтується в `App` поруч із `MediaSyncBridge` (у `EditorProvider` не можна: він не має доступу до `ProjectProvider` у своїх тестах).
- Undo **не відновлює** виділення: після скасування видалення нота повертається невиділеною. Це звичайна поведінка простих редакторів і не потребує зберігати стан редактора в історії.

### 2. Гарячі клавіші

#### 2.1 Чисте зіставлення — `src/utils/shortcuts.ts` (новий)
```ts
export type GlobalShortcutId = 'undo' | 'redo' | 'playPause' | 'export';
export type EditorShortcutId =
  | 'selectAll' | 'delete' | 'clearSelection'
  | 'nudgeLeft' | 'nudgeRight' | 'nudgeUp' | 'nudgeDown' | 'octaveUp' | 'octaveDown';

export interface KeyLike {
  readonly key: string; readonly code: string;
  readonly ctrlKey: boolean; readonly metaKey: boolean; readonly shiftKey: boolean; readonly altKey: boolean;
  readonly repeat: boolean;
}

export const SHORTCUT_HINTS: Readonly<Record<'undo' | 'redo' | 'export' | 'playPause', string>>;
// { undo: 'Ctrl+Z', redo: 'Ctrl+Shift+Z', export: 'Ctrl+S', playPause: 'Space' }

export function isTextEntryTarget(target: EventTarget | null): boolean;
export function isActivationTarget(target: EventTarget | null): boolean;
export function globalShortcutFor(event: KeyLike, target: EventTarget | null): GlobalShortcutId | null;
export function editorShortcutFor(event: KeyLike): EditorShortcutId | null;
```

Правила:
- `mod = ctrlKey || metaKey` (Ctrl на Windows/Linux, ⌘ на macOS).
- **Буквені клавіші зіставляються за `event.code`** (`KeyZ`, `KeyY`, `KeyS`, `KeyA`), а не за `event.key`. На українській розкладці `key` для клавіші Z — `'я'`, а `code` лишається `KeyZ`, тож скорочення працюють незалежно від розкладки.
- Будь-яке поєднання з `altKey` → `null`. На Windows AltGr надсилає `Ctrl+Alt`, і без цього правила набір символів з AltGr спрацьовував би як скорочення.
- `isTextEntryTarget`: `textarea`; `input`, чий `type` **не** входить до `NON_TEXT_INPUT_TYPES = ['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'file', 'color', 'image']` (тобто `text`, `number` тощо); елемент усередині `[contenteditable=""]` / `[contenteditable="true"]` (через `closest`, бо jsdom не реалізує `isContentEditable`).
- `isActivationTarget`: `button`, `a[href]`, `summary`, `select`, `input` з типом із `NON_TEXT_INPUT_TYPES`, елементи з `role` `button` / `checkbox` / `slider` / `switch`. На таких елементах `Space` має нативну дію (натиснути, перемкнути, відкрити список).

`globalShortcutFor(event, target)`:

| Подія | Результат | Коли ігнорується (`null`) |
|---|---|---|
| `mod` + `KeyZ`, без Shift | `'undo'` | ціль — поле введення тексту (там працює нативний undo тексту) |
| `mod` + Shift + `KeyZ`; `mod` + `KeyY` без Shift | `'redo'` | так само |
| `code === 'Space'` без модифікаторів | `'playPause'` | `repeat`; ціль — поле тексту або елемент з нативною дією `Space` |
| `mod` + `KeyS`, без Shift | `'export'` | ніколи (скорочення перехоплюється і в полях, щоб браузер не відкривав діалог «Зберегти сторінку») |

`Ctrl/⌘+S` обрано для експорту замість `Ctrl+E` чи `Ctrl+Shift+E`: `Ctrl+E` у Chrome і Firefox фокусує пошук в адресному рядку, `Ctrl+Shift+E` у Firefox відкриває панель Network DevTools. `Ctrl+S` сторінка гарантовано може перехопити (`preventDefault`), і за змістом це «зберегти результат».

`editorShortcutFor(event)` (без перевірки цілі: викликається лише з `onKeyDown` сітки / доріжки педалей). `altKey` → `null`:

| Подія | Результат |
|---|---|
| `mod` + `KeyA`, без Shift | `'selectAll'` |
| `Delete` / `Backspace` без модифікаторів | `'delete'` |
| `Escape` без модифікаторів | `'clearSelection'` |
| `ArrowLeft` / `ArrowRight` без модифікаторів | `'nudgeLeft'` / `'nudgeRight'` |
| `ArrowUp` / `ArrowDown` без модифікаторів | `'nudgeUp'` / `'nudgeDown'` |
| Shift + `ArrowUp` / `ArrowDown` | `'octaveUp'` / `'octaveDown'` |
| інше (зокрема `mod` + стрілки) | `null` |

#### 2.2 Глобальні скорочення — `src/components/useGlobalShortcuts.ts` і `src/components/KeyboardShortcuts.tsx` (нові)
```ts
export function useGlobalShortcuts(
  handlers: Partial<Record<GlobalShortcutId, () => void>>,
): void;
```
- Один слухач `keydown` на `window`, додається в `useEffect([])` і знімається при unmount. Актуальні `handlers` читаються через ref, оновлюваний у `useLayoutEffect` (той самий патерн, що в `useNoteDrag`).
- Обробник: `event.defaultPrevented` → нічого (подію вже обробила сітка або інше поле). Далі `id = globalShortcutFor(event, event.target)`; якщо для `id` немає обробника → нічого; інакше `event.preventDefault()` і виклик обробника.
- React-обробники `onKeyDown` сітки й доріжки спрацьовують раніше за слухача на `window` (React слухає на корені застосунку, а `window` вище в ланцюжку спливання), тож `defaultPrevented` надійно відсікає вже оброблені клавіші.

`KeyboardShortcuts` (повертає `null`, монтується в `App` поруч із `MediaSyncBridge` і `SelectionSync`):
`useGlobalShortcuts({ undo: history.undo, redo: history.redo, playPause: transportApi.togglePlay })`.

`ExportButton` (зміна): `useGlobalShortcuts({ export: startExport })`. Обробник кліку перейменовується на `startExport`. Додається `busyRef = useRef(false)`: встановлюється на старті експорту й скидається після завершення. `startExport` при `busyRef.current === true` нічого не робить, тож повторний `Ctrl+S` під час запиту не шле другий запит (кнопка в цей час вимкнена, а клавіатура — ні). Кнопка отримує `title="Export .mid (Ctrl+S)"`, а `aria-label` не змінюється.

#### 2.3 Клавіші сітки й доріжки педалей
`NoteGrid.handleKeyDown` і `PedalLane.handleKeyDown` переходять на `editorShortcutFor(event)` (див. розділ 3 нижче). `Delete` / `Backspace` поводяться як раніше.

### 3. Мультивиділення

#### 3.1 Чисті функції — `src/utils/selection.ts` (новий)
```ts
/** Shift, Ctrl or ⌘ held: the click adds to / removes from the selection. */
export function isAdditive(event: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }): boolean;
/** Removes the id when present, appends it otherwise. */
export function toggleId(ids: readonly string[], id: string): readonly string[];
/** `base` followed by the ids of `added` that are not in `base`. */
export function unionIds(base: readonly string[], added: readonly string[]): readonly string[];
/** Normalized rectangle between two points (any corner order). */
export function rectFromPoints(a: Point, b: Point): Rect;
/** Ids (in project order) of the notes whose rectangle intersects `rect` with non-zero area; touching is not intersecting. */
export function notesInRect(notes: readonly Note[], rect: Rect, g: ViewGeometry): readonly string[];
```
`notesInRect` використовує `noteRect` з `pianoRollGeometry.ts`: нота потрапляє, якщо `rect.x < n.x + n.width && n.x < rect.x + rect.width` і те саме по y.

#### 3.2 Групове редагування — `src/utils/groupEditing.ts` (новий)
```ts
export interface GroupDragState {
  readonly kind: 'move' | 'resize';
  /** The note under the mouse; the grid snaps this note. */
  readonly anchor: Note;
  /** All notes that change (the anchor included), as they were when the gesture started. */
  readonly originals: readonly Note[];
  readonly originTime: number;
  readonly originPitch: number;
}

/** Offset clamped so that no note starts before 0 s or leaves the 21–108 pitch range. */
export function clampGroupOffset(notes: readonly Note[], dt: number, dp: number): { dt: number; dp: number };
/** Notes shifted by a clamped offset (new objects, same ids). */
export function translateNotes(notes: readonly Note[], dt: number, dp: number): readonly Note[];
/** Preview of all dragged notes for the current mouse time and pitch. */
export function applyGroupDrag(drag: GroupDragState, time: number, pitch: number, opts: DragOptions): readonly Note[];
/** Replaces items with the same id and appends new ones; returns `items` when `previews` is empty. */
export function withPreviews<T extends { readonly id: string }>(items: readonly T[], previews: readonly T[]): readonly T[];
```
- `clampGroupOffset`: `dt' = max(dt, −min(start))`; `dp' = min(max(dp, MIN_PITCH − min(pitch)), MAX_PITCH − max(pitch))`. Група зберігає форму: біля краю зупиняється вся група, а не окремі ноти.
- `applyGroupDrag`, **move**: нова позиція якоря рахується так само, як в `applyDrag` (snap `'nearest'` або `max(0, …)` без snap). Далі `dt = newAnchorStart − anchor.start`, `dp = pitch − originPitch`, `clampGroupOffset(originals, dt, dp)`. Решта нот зсуваються на той самий `dt`/`dp`, тож їхні відносні позиції не змінюються (прив'язується лише якір, як у більшості DAW).
- **resize**: нова тривалість якоря рахується як в `applyDrag` (`max(minDragDuration, end − start)`), `delta = newDuration − anchor.duration`. Кожна інша нота отримує `max(minDragDuration(opts), duration + delta)`.
- **Точний паритет з однією нотою:** якір отримує саме обчислене значення (`start` / `duration` / `pitch`), а не `anchor.start + dt`. Для однієї ноти обмеження групи ніколи не спрацьовує (`newAnchorStart ≥ 0`, `pitch` уже в межах), тож результат дорівнює `applyDrag` без похибок округлення. Наявні тести `NoteGrid` для однієї ноти лишаються зеленими без змін.
- `applyDrag` / `withPreview` з `noteEditing.ts` не змінюються: створення ноти використовує `applyDrag`, а доріжка педалей — `withPreview`.

#### 3.3 Жести мишею на сітці — `useNoteDrag` (зміна)
Нові типи й опції:
```ts
export type NoteGesturePreview =
  | { readonly kind: 'notes'; readonly notes: readonly Note[] }                               // create / move / resize
  | { readonly kind: 'marquee'; readonly rect: Rect; readonly ids: readonly string[] };       // ids = union(base, inside)

export interface UseNoteDragOptions {
  notes: readonly Note[];
  selectedIds: readonly string[];                          // new
  geometry: ViewGeometry;
  dragOptions: DragOptions;
  getLocalPoint: (event: PointerLike) => Point;
  onCommitCreate: (note: Note) => void;
  onCommitUpdate: (changes: readonly NoteChange[]) => void; // was (id, patch)
  onSelect: (ids: readonly string[]) => void;
}

export interface UseNoteDragResult {
  preview: NoteGesturePreview | null;
  onMouseDown: (event: ReactMouseEvent<HTMLElement>) => void;
  isGestureActive: () => boolean;                          // new, stable
}
```
Поведінка `mousedown` лівою кнопкою (`additive = isAdditive(event)`, `hit = hitTestNotes(...)`):

| Випадок | Дія |
|---|---|
| `hit`, `additive` | `onSelect(toggleId(selectedIds, hit.noteId))`, жест не починається |
| `hit`, нота **не** виділена | `onSelect([id])`, жест move/resize для `[нота]` (як зараз) |
| `hit`, нота виділена | виділення не змінюється; жест move/resize для **всіх виділених нот** (`selectedNotes(notes, selectedIds)`), якір — нота під мишею |
| порожнє місце, без `additive` | створення ноти, як зараз |
| порожнє місце, `additive` | рамка: `initialPreview = null`; після порогу `update` дає `{ kind: 'marquee', rect: rectFromPoints(start, local), ids: unionIds(baseSelection, notesInRect(...)) }` |

`commit`:
- create → `onCommitCreate(note)` (як зараз);
- move / resize, `moved` → **один** виклик `onCommitUpdate(result.map(n => ({ id, patch: { start, duration, pitch } })))`, тобто одна дія `updateNotes` і один крок undo;
- move / resize без руху → якщо в групі більше однієї ноти, `onSelect([anchor.id])` (клік без протягування по виділеній ноті лишає виділеною лише її, як у DAW);
- рамка, `moved` → `onSelect(preview.ids)`; рамка без руху → нічого (виділення не змінюється, нота не створюється);
- `Escape` під час жесту → скасування без змін (наявна поведінка `useDragGesture`).

`useDragGesture` (зміна): у результат додається стабільна `isActive(): boolean` (`detachRef.current !== null`). `useNoteDrag` / `usePedalDrag` прокидають її як `isGestureActive`.

#### 3.4 `NoteGrid` (зміна)
- `useNoteDrag` отримує `selectedIds: selectedNoteIds` і `onCommitUpdate: (changes) => projectDispatch(updateNotes(changes))`.
- `displayed = preview?.kind === 'notes' ? withPreviews(notes, preview.notes) : notes`.
- Підсвічування: `selected = selectedIds.has(id) || marqueeIds.has(id)`, де `marqueeIds` — з `preview.ids` під час рамки. Тобто під час протягування видно, що саме буде виділено.
- Рамка: `<div className="note-grid__marquee" data-testid="marquee" style={{ left, top, width, height }} />` поверх нот, лише поки `preview.kind === 'marquee'`.
- `handleKeyDown` через `editorShortcutFor(event)`:
  - `selectAll` → `preventDefault()`, `selectNotes(notes.map(id))` (виділення тексту сторінки не спрацьовує);
  - `delete` → як зараз;
  - `clearSelection` → якщо `isGestureActive()`, нічого не робити (жест скасує слухач `useDragGesture` на `window`, а виділення лишиться); інакше, якщо є виділені ноти, `preventDefault()` і `clearSelection()`;
  - `nudge*` / `octave*` → якщо виділених нот немає, нічого не робити (стрілки прокручують контейнер нативно). Інакше `preventDefault()`. Зсув: `nudgeLeft/Right` = ∓/± `gridStepSeconds(gridDivision, bpm)` (незалежно від Snap), `nudgeUp/Down` = ±1 півтон, `octaveUp/Down` = ±12. Потім `translateNotes(selected, dt, dp)` → `updateNotes(...)`, одна дія на натискання. Якщо зсув обмежено до нуля, reducer повертає той самий стан, і кроку undo немає.
- Для правого кліку поведінка не змінюється.

#### 3.5 Доріжка педалей — `usePedalDrag`, `PedalLane` (зміна)
- `usePedalDrag` отримує `selectedIds` і повертає `isGestureActive`. На `mousedown` з `additive`: по педалі → `onSelect(toggleId(selectedIds, id))` без жесту; по порожньому місцю → нічого (педаль не створюється). Без модифікаторів — усе як зараз (клік по педалі виділяє лише її, переміщення однієї педалі).
- `PedalLane.handleKeyDown` через `editorShortcutFor`: `selectAll` → `preventDefault()` + `selectPedals(pedals.map(id))`; `delete` → як зараз (вже видаляє масив однією дією); `clearSelection` → як у `NoteGrid`; стрілки ігноруються (поза межами задачі).

#### 3.6 CSS — `PianoRoll.css`
`.note-grid__marquee { position: absolute; border: 1px dashed var(--accent, #4a90e2); background: rgba(74, 144, 226, 0.12); pointer-events: none; z-index: 3; }`. Z-index вищий за ноти (перевірити фактичні значення в `PianoRoll.css` і взяти на 1 більше).

### 4. E2E — Playwright

**Нові dev-залежності:**
- `@playwright/test` (актуальна 1.63.x, фіксується в `package-lock.json`). Причини: стек у CLAUDE.md (розділ 3) прямо називає Playwright для e2e. Він сам керує браузером і вміє запускати dev-сервери (`webServer`), чекати на елементи (auto-waiting), перехоплювати завантаження файлу (`page.waitForEvent('download')`) і натискати справжні клавіші та мишу. Альтернативи: Cypress важчий і гірше працює з кількома вкладками чи завантаженнями, а його клавіатура — синтетичні події, тоді як нам важливі реальні `keydown` і user activation для аудіо. Vitest browser mode не піднімає backend і не дає e2e від кнопки до файлу.
- `@types/node` (`^20`, мінімальна версія Node з README). Типи `@playwright/test` посилаються на модулі Node (`child_process`, `events`), а `playwright.config.ts` і тести використовують `process.env` та `node:fs/promises`. Без `@types/node` `tsc -b` падає.

**Браузери без sudo:** `npx playwright install chromium` завантажує Chromium і `chromium-headless-shell` у `~/.cache/ms-playwright` (домашня тека, права адміністратора не потрібні). Команду `npx playwright install --with-deps` (ставить системні бібліотеки через `apt` / `sudo`) **не використовуємо**. Скрипт: `"e2e:install": "playwright install chromium"`.

**Скрипти `package.json`:** `"e2e": "playwright test"`, `"e2e:install": "playwright install chromium"`.

**`frontend/playwright.config.ts`:**
```ts
import { defineConfig, devices } from '@playwright/test';

const chromiumPath = process.env.E2E_CHROMIUM_PATH;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: 'list',
  timeout: 30_000,
  use: { baseURL: 'http://localhost:5173', trace: 'retain-on-failure' },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
        launchOptions: {
          args: ['--autoplay-policy=no-user-gesture-required'],
          ...(chromiumPath ? { executablePath: chromiumPath } : {}),
        },
      },
    },
  ],
  webServer: [
    {
      command: 'uv run uvicorn app.main:app --port 8000',
      cwd: '../backend',
      url: 'http://localhost:8000/api/health',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: 'npm run dev -- --strictPort',
      url: 'http://localhost:5173',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
});
```
- Порти 8000 і 5173 — ті самі, що в README і у Vite-проксі `/api`. Якщо dev-сервери вже запущені, Playwright їх перевикористовує.
- `workers: 1`: тести короткі (~12), а спільний backend і завантаження семплів простіше тримати послідовними й детермінованими.
- `E2E_CHROMIUM_PATH` — запасний шлях без sudo, якщо завантажений Chromium не запускається через відсутні системні бібліотеки: тоді можна вказати вже встановлений системний Chrome/Chromium.
- `--autoplay-policy=no-user-gesture-required` страхує від того, що `AudioContext` не стартує в headless-режимі. Натискання клавіш Playwright і так є довіреним жестом.

**Відокремлення від Vitest:** e2e-файли називаються `e2e/*.spec.ts`, а стандартний `include` Vitest підхопив би їх. У `vite.config.ts` в `test` додається `exclude: [...configDefaults.exclude, 'e2e/**']` (`configDefaults` з `vitest/config`).

**TypeScript:** новий `tsconfig.e2e.json` (посилання додається в `tsconfig.json` → `references`):
```json
{
  "compilerOptions": {
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.e2e.tsbuildinfo",
    "target": "ES2022", "lib": ["ES2023", "DOM"], "module": "ESNext",
    "moduleResolution": "bundler", "allowImportingTsExtensions": true,
    "isolatedModules": true, "moduleDetection": "force", "noEmit": true,
    "strict": true, "noUnusedLocals": true, "noUnusedParameters": true,
    "skipLibCheck": true, "types": ["node"]
  },
  "include": ["e2e", "playwright.config.ts"]
}
```
`DOM` потрібен для колбеків `page.evaluate` / `locator.evaluate`. `npm run typecheck` і `npm run build` (`tsc -b`) перевірятимуть і e2e.

**ESLint** (`eslint.config.js`): новий блок для `['e2e/**/*.ts', 'playwright.config.ts']` з `languageOptions.globals: globals.node` і вимкненими правилами `react-hooks/*`. Правило `rules-of-hooks` вважає функцію `use(...)` (фікстури Playwright) хуком React, а це не React-код. `ignores` доповнюється `'test-results'` і `'playwright-report'`.

**Prettier:** `.prettierignore` доповнюється `test-results` і `playwright-report`.

**Структура e2e:**
- `e2e/helpers.ts`: константи геометрії з коментарем про джерело (`ROW_HEIGHT = 14`, `PX_PER_SECOND = 100` за замовчуванням, `MAX_PITCH = 108`, `PEDAL_ROW_HEIGHT = 20`). Навмисно не імпортуються з `src`: e2e перевіряє UI як чорну скриньку і не тягне модулі застосунку в завантажувач Playwright. Функції:
  - `grid(page)` → `page.getByRole('application', { name: 'Note grid' })`;
  - `gridPoint(page, time, pitch)` → абсолютні координати `{ x: box.x + time * 100, y: box.y + (108 − pitch) * 14 + 7 }` за `boundingBox()` сітки;
  - `clickGrid(page, time, pitch, modifiers?)`, `dragGrid(page, from, to, modifiers?)` через `page.mouse` (`steps: 5`), модифікатори через `page.keyboard.down/up`;
  - `pedalLane(page)`, `lanePoint(page, time, row)`;
  - `noteByLabel(page, label)` → `page.locator('[data-testid="note"][aria-label="…"]')`;
  - `selectedNotes(page)` → `page.locator('[data-testid="note"][data-selected="true"]')`.
- `e2e/editing.spec.ts`, `e2e/transport.spec.ts`, `e2e/export.spec.ts` (сценарії — у розділі «Тести»).
- Імпорти всередині `e2e/` — з розширенням `.ts`, як у решті проекту. Якщо завантажувач Playwright їх не прийме, можна без розширення (дрібне відхилення, пояснити у звіті).

### 5. Файли, які змінюються
Нові: `src/state/history.ts`, `src/state/historyContext.ts`, `src/state/SelectionSync.tsx`, `src/utils/shortcuts.ts`, `src/utils/selection.ts`, `src/utils/groupEditing.ts`, `src/components/useGlobalShortcuts.ts`, `src/components/KeyboardShortcuts.tsx`, `playwright.config.ts`, `tsconfig.e2e.json`, `e2e/*.ts` і unit-тести з розділу «Тести».
Змінені: `ProjectProvider.tsx`, `editorState.ts`, `editorReducer.ts`, `useDragGesture.ts`, `useNoteDrag.ts`, `usePedalDrag.ts`, `NoteGrid.tsx`, `PedalLane.tsx`, `PianoRollToolbar.tsx`, `ExportButton.tsx`, `App.tsx`, `PianoRoll.css`, `vite.config.ts`, `tsconfig.json`, `eslint.config.js`, `.prettierignore`, `package.json`, `package-lock.json`, `README.md`.
Backend не змінюється.

## Кроки реалізації
1. Від актуального `main` створити гілку `feature/010-undo-selection-e2e`.
2. **History.** `src/state/history.ts` + `history.test.ts`. Коміт `feat: add undo/redo history over the project reducer`.
3. `src/state/historyContext.ts`; `ProjectProvider` на `historyReducer` з двома новими контекстами + `historyContext.test.tsx`. Перевірити, що всі наявні тести зелені без змін. Коміт `feat: provide undo/redo through ProjectProvider`.
4. Дія `editor/retainSelection` (`editorState.ts`, `editorReducer.ts`) + тести (доповнення `editorReducer.test.ts`); `SelectionSync.tsx` + `SelectionSync.test.tsx`. Коміт `feat: drop selected ids of removed notes and pedals`.
5. Кнопки «Undo» / «Redo» у `PianoRollToolbar` + тести (доповнення `PianoRollToolbar.test.tsx`). Коміт `feat: add undo and redo buttons`.
6. **Гарячі клавіші.** `src/utils/shortcuts.ts` + `shortcuts.test.ts`. Коміт `feat: add keyboard shortcut matching`.
7. `useGlobalShortcuts.ts`, `KeyboardShortcuts.tsx`, підключення `KeyboardShortcuts` і `SelectionSync` в `App.tsx` + `KeyboardShortcuts.test.tsx` і доповнення `App.test.tsx`. Коміт `feat: undo, redo and play/pause from the keyboard`.
8. `ExportButton`: `startExport`, `busyRef`, `useGlobalShortcuts({ export })`, `title` + доповнення `ExportButton.test.tsx`. Коміт `feat: export with Ctrl+S`.
9. **Мультивиділення.** `src/utils/selection.ts` + `selection.test.ts`; `src/utils/groupEditing.ts` + `groupEditing.test.ts`. Коміт `feat: add pure selection and group editing helpers`.
10. `useDragGesture.isActive`; `useNoteDrag` (нова таблиця поведінки), `NoteGrid` (групові жести, рамка, клавіші), CSS рамки + `NoteGrid.selection.test.tsx`. Прогнати наявний `NoteGrid.test.tsx` без змін. Коміт `feat: select several notes and edit them together`.
11. `usePedalDrag`, `PedalLane` (додавання до виділення, `Ctrl+A`, `Escape`) + `PedalLane.selection.test.tsx`. Коміт `feat: select several pedals`.
12. **E2E.** `npm install -D @playwright/test @types/node@^20`; `npm run e2e:install`; `playwright.config.ts`, `tsconfig.e2e.json` і посилання в `tsconfig.json`, `vite.config.ts` (`exclude`), `eslint.config.js`, `.prettierignore`, скрипти. Перевірити, що `npm test -- --run` не бачить `e2e/`. Коміт `chore: set up Playwright for end-to-end tests`.
13. `e2e/helpers.ts` і три spec-файли; `npm run e2e` зелений. Коміт `test: add end-to-end tests for editing, transport and export`.
14. README: новий розділ «Виділення, undo/redo і гарячі клавіші» після «Керування педалями» (таблиця клавіш, правила рамки й групових дій, `⌘` замість `Ctrl` на macOS, історія на 200 кроків, undo не зачіпає зум/сітку/виділення); у «Тести та перевірки» — `npm run e2e:install` (один раз, без sudo), `npm run e2e`, `E2E_CHROMIUM_PATH`, те, що e2e самі запускають backend і frontend або перевикористовують запущені. Пункт «Видалити» в розділах про ноти й педалі доповнити згадкою про кілька виділених. Коміт `docs: describe selection, undo/redo, shortcuts and e2e tests`.
15. Усі перевірки з DoD і ручна перевірка в браузері (у гілці).
16. У гілці (**до** злиття): у CLAUDE.md `[x]` для 2.2 «Виділення кількох нот, undo/redo»; статус 010 у розділі 8 — «виконано»; статус плану — `виконано`. Коміт `docs: mark task 010 as done`.
17. `git checkout main && git merge --no-ff feature/010-undo-selection-e2e`, повторні перевірки на `main` (включно з `npm run e2e`), push `main` і гілки.

## Тести
Наявні тести не змінюються. Єдиний виняток: **доповнення** (нові `it`, без видалення чи зміни рядків, крім імпортів) у `App.test.tsx`, `ExportButton.test.tsx`, `PianoRollToolbar.test.tsx`, `editorReducer.test.ts`. Зокрема весь `NoteGrid.test.tsx` і `PedalLane.test.tsx` мають проходити без змін. Це перевіряє, що поведінку однієї ноти / педалі збережено.

Позначення: 120 BPM, 4/4, крок `1/16` = 0.125 с, 100 px/с, рядок ноти 14 px. Отже, рядок C4 (60) — y 672–686 (центр 679), E4 (64) — 616–630 (623), G4 (67) — 574–588 (581). Нота `a = { id: 'a', pitch: 60, start: 0.5, duration: 0.5, velocity: 100 }` займає x 50–100, зона resize — x ≥ 94.

### Frontend unit: `src/state/history.test.ts` (новий)
- `createHistory(p)` → `{ past: [], present: p, future: [] }`.
- `addNote` (id через `vi.spyOn(idModule, 'createId')`) → `past == [p0]`, `present.notes` має ноту, `future == []`.
- Дія без змін (`updateNote('missing', { pitch: 70 })`, `setBpm(120)` при 120) → повертається **той самий** об'єкт історії (`toBe`).
- Перетин педалей, відхилений reducer'ом (`updatePedal` на перетин двох sustain), → той самий об'єкт.
- Undo → `present === p0`, `past == []`, `future[0] === p1`. Redo → `present === p1` (той самий об'єкт), `future == []`.
- Undo з порожнім `past` і redo з порожнім `future` → той самий об'єкт.
- Нова дія після undo очищує `future`.
- Ліміт: 205 дій `addNotes([{ id: 'n' + i, pitch: 60, start: i, duration: 0.5, velocity: 100 }])` → `past.length === 200`, `past[0].notes.length === 5`. Після 200 undo → `present.notes.length === 5`, `canUndo` false (`past == []`), 201-й undo → той самий об'єкт.
- `project/load` після кількох дій і undo → `past == []`, `future == []`, `present` — завантажений проект.

### Frontend unit: `src/state/historyContext.test.tsx` (новий)
Споживач з кнопками «add» (`addNote`), «undo», «redo» (з `useHistoryApi`) і виводом `canUndo`/`canRedo`/кількості нот:
- спершу `0`, `canUndo false`, `canRedo false`;
- «add» → `1`, `canUndo true`; «undo» → `0`, `canRedo true`; «redo» → `1`, `canRedo false`;
- об'єкт `useHistoryApi()` однаковий між рендерами (зберегти в ref і порівняти `toBe` після кліку);
- `useHistoryState` / `useHistoryApi` поза `ProjectProvider` кидають помилки з текстами з «Технічних рішень».

### Frontend unit: `editorReducer.test.ts` (доповнення)
- `selectedNoteIds ['a', 'x', 'b']`, `retainSelection(['a', 'b'], [])` → `['a', 'b']`.
- `selectedPedalIds ['p', 'q']`, `retainSelection([], ['q'])` → `['q']`.
- Нічого не прибрано → той самий об'єкт стану (`toBe`).

### Frontend unit: `src/state/SelectionSync.test.tsx` (новий)
`ProjectProvider` (ноти `a`, `b`, педаль `p`) + `EditorProvider` (`selectedNoteIds: ['a', 'x']`) + `SelectionSync` + `StateProbe`:
- після рендеру `selectedNoteIds == ['a']`;
- `removeNotes(['a'])` через тестову кнопку → `selectedNoteIds == []`;
- `selectedPedalIds: ['p', 'gone']` → `['p']`.

### Frontend unit: `PianoRollToolbar.test.tsx` (доповнення)
`renderWithProviders(<PianoRollToolbar />, [{ ...a, start: 0.52 }], { selectedNoteIds: ['a'] })`:
- «Undo» і «Redo» вимкнені; `title` — `Undo (Ctrl+Z)` / `Redo (Ctrl+Shift+Z)`;
- «Quantize» → `start 0.5`; «Undo» увімкнена → клік → `start 0.52` (`readNotes`), «Redo» увімкнена → клік → `0.5`, «Redo» знову вимкнена.

### Frontend unit: `src/utils/shortcuts.test.ts` (новий)
Помічник `key(partial)` заповнює `KeyLike` значеннями за замовчуванням (`false`, `repeat: false`). Цілі — реальні елементи jsdom.
- `Ctrl+KeyZ` на `document.body` → `'undo'`; `Meta+KeyZ` → `'undo'`; `{ key: 'я', code: 'KeyZ', ctrlKey }` → `'undo'`; `Ctrl+Shift+KeyZ` → `'redo'`; `Ctrl+KeyY` → `'redo'`; `Ctrl+Alt+KeyZ` → `null`; `KeyZ` без модифікаторів → `null`.
- `Ctrl+KeyZ` з ціллю `<input type="text">` / `<input type="number">` / `<textarea>` / `<div contenteditable="true"><span/></div>` (ціль — `span`) → `null`; з ціллю `<button>`, `<select>`, `<input type="checkbox">` → `'undo'`.
- `Space` (`code: 'Space'`, `key: ' '`) на `body` → `'playPause'`; на `<div role="application" tabindex="0">` → `'playPause'`; `repeat: true` → `null`; з `ctrlKey` → `null`; ціль `<button>`, `<a href="#">`, `<select>`, `<input type="checkbox">`, `<input type="range">`, `<input type="number">`, `<div role="slider">` → `null`.
- `Ctrl+KeyS` на `body` → `'export'`; з ціллю `<input type="number">` → `'export'`; `Ctrl+Shift+KeyS` → `null`; `Ctrl+Alt+KeyS` → `null`.
- `isTextEntryTarget(null)` → `false`; `isActivationTarget(document.body)` → `false`.
- `editorShortcutFor`: `Ctrl+KeyA` → `'selectAll'`, `Meta+KeyA` → `'selectAll'`; `KeyA` без модифікаторів → `null`; `Delete` / `Backspace` → `'delete'`; `Escape` → `'clearSelection'`; `ArrowLeft` / `ArrowRight` / `ArrowUp` / `ArrowDown` → відповідні `nudge*`; `Shift+ArrowUp` / `Shift+ArrowDown` → `'octaveUp'` / `'octaveDown'`; `Ctrl+ArrowUp` → `null`; `Alt+ArrowUp` → `null`; `Shift+ArrowLeft` → `null`.

### Frontend unit: `src/components/KeyboardShortcuts.test.tsx` (новий)
`renderWithProviders(<><KeyboardShortcuts /><TransportControls /><AddButton /><input aria-label="text" /></>)`, де `AddButton` диспатчить `addNote` (id замокано).
- «add» → 1 нота; `fireEvent.keyDown(document.body, { key: 'z', code: 'KeyZ', ctrlKey: true })` повертає `false` (подію скасовано) → 0 нот; `{ ..., shiftKey: true }` → 1 нота; ще undo, потім `Ctrl+KeyY` → 1 нота.
- Той самий `Ctrl+Z` на полі «text» → повертає `true`, кількість нот не змінюється.
- `Space` на `body` → `await findByRole('button', { name: 'Pause' })` (FakePianoEngine); ще `Space` → «Play».
- `Space` з `repeat: true` → лишається «Play»; `Space` на кнопці «Stop» → обробник не спрацьовує (`fireEvent` повертає `true`, «Play» лишається; нативний клік jsdom для `keydown` не емулюється, тож перевіряємо саме відсутність нашої реакції).
- Подія, у якої дочірній обробник уже викликав `preventDefault()` (обгортка `<div onKeyDown={(e) => e.preventDefault()}>` з кнопкою-ціллю й `Ctrl+Z`), → undo не відбувається.
- Unmount → `removeEventListener('keydown', …)` викликано (шпигун на `window`), після unmount `Ctrl+Z` нічого не робить.

### Frontend unit: `ExportButton.test.tsx` (доповнення)
- `Ctrl+KeyS` на `document.body` → `fireEvent` повертає `false`, `fetch` викликано один раз з `'/api/export/midi'`, після розв'язання `downloadBlob` викликано з `'arrangement.mid'`.
- Поки `fetch` не розв'язано (відкладений promise), другий `Ctrl+S` не викликає `fetch` вдруге.
- `Ctrl+S` на `<input type="number">` теж запускає експорт.
- Кнопка має `title="Export .mid (Ctrl+S)"`, доступне ім'я лишається «Export .mid».

### Frontend unit: `src/utils/selection.test.ts` (новий)
- `isAdditive`: лише `shiftKey` / лише `ctrlKey` / лише `metaKey` → `true`; жодного → `false`.
- `toggleId(['a', 'b'], 'a')` → `['b']`; `toggleId(['a'], 'c')` → `['a', 'c']`.
- `unionIds(['e'], ['a', 'e', 'b'])` → `['e', 'a', 'b']`.
- `rectFromPoints({ x: 120, y: 690 }, { x: 40, y: 600 })` → `{ x: 40, y: 600, width: 80, height: 90 }`.
- `notesInRect`: ноти `a` (x 50–100, C4), `b = { id: 'b', pitch: 64, start: 1, duration: 0.5 }` (x 100–150, y 616–630), `e = { id: 'e', pitch: 72, start: 3, duration: 0.5 }` (x 300–350, y 504–518); рамка `{ x: 40, y: 600, width: 80, height: 90 }` → `['a', 'b']`; рамка `{ x: 150, y: 600, width: 50, height: 90 }` (торкається правого краю `b`) → `[]`; рамка нульової ширини → `[]`; порядок результату — порядок нот у проекті, а не в рамці.

### Frontend unit: `src/utils/groupEditing.test.ts` (новий)
Ноти: `a` (див. вище), `b = { id: 'b', pitch: 64, start: 1, duration: 0.5, velocity: 100 }`; `opts = { step: 0.125, snap: true }`.
- `translateNotes([a, b], 0.25, 2)` → `a { start 0.75, pitch 62 }`, `b { start 1.25, pitch 66 }`, id і тривалості без змін, вхідні об'єкти не змінено.
- `translateNotes([a, b], -1, 0)` → `dt` обмежено до −0.5: `a.start 0`, `b.start 0.5`.
- Висоти 100 і 60, `dp +20` → обмежено до `+8`: 108 і 68. Висоти 21 і 60, `dp −5` → `0`: висоти без змін.
- `clampGroupOffset([a, b], -1, 50)` → `{ dt: -0.5, dp: 44 }`.
- `applyGroupDrag` move: `{ kind: 'move', anchor: a, originals: [a, b], originTime: 0.6, originPitch: 60 }`, `time 0.83`, `pitch 62` → сире `0.73` прив'язується до `0.75`, тож `a { 0.75, 62 }`, `b { 1.25, 66 }`. Те саме без snap → `a.start ≈ 0.73`, `b.start ≈ 1.23` (`toBeCloseTo(…, 10)`).
- move з групою, де не якір стоїть раніше: `c = { …b, id: 'c', start: 0.25 }`, якір `a`, `time 0` (сире −0.1 → 0, `dt −0.5` → обмежено до −0.25) → `a.start 0.25`, `c.start 0`.
- resize: якір `a`, `originals [a, b′]` (`b′.duration 0.25`), `originTime 0.97`, `time 1.3` → кінець `1.33` → `1.375`, `a.duration 0.875`, `delta 0.375`, `b′.duration 0.625`. Зменшення: `time 0.4` → кінець `0.43` → `0.375`, `a.duration = max(0.125, −0.125) = 0.125`, `delta −0.375`, `b′.duration = max(0.125, −0.125) = 0.125`.
- **Паритет з `applyDrag`** для `originals = [a]` (`toEqual`, точна рівність): move `(0.83, 62)` зі snap і без; move `(0, 60)` (до нуля); move `(0.6, 108)` (верхній край); resize `(1.3)` і `(0.4)` зі snap і без.
- `withPreviews([a, b], [])` → той самий масив (`toBe`); `withPreviews([a, b], [b″])` → `[a, b″]`; нова нота `n` → `[a, b, n]`.

### Frontend unit: `src/components/PianoRoll/NoteGrid.selection.test.tsx` (новий)
Рендер як у `NoteGrid.test.tsx` (`ProjectProvider` + `EditorProvider` + `NoteGrid` + проби нот / виділення) плюс `HistoryProbe` з кнопкою «undo» (`useHistoryApi`). Ноти `a`, `b` (E4, start 1, 0.5).
- `Shift+mousedown/mouseup` по `b` (106, 623) при виділеній `a` → виділені обидві (`data-selected="true"`), проект той самий (`toBe`). `Ctrl`-клік по `a` → лишається лише `b`. `Meta`-клік по `b` → нічого не виділено.
- Групове переміщення: виділено `['a', 'b']`, протягування `a` з (60, 679) до (82, 651) → `a { 0.75, 62 }`, `b { 1.25, 66 }`. Одне «undo» → обидві ноти на старих місцях (тобто один крок історії).
- Під час групового протягування (після `mouseMove`, до `mouseUp`) обидві ноти на екрані вже зсунуті (`style.left` `75px` і `125px`), а проект ще не змінено.
- Обмеження групи до нуля: `a` і `c = { …b, id: 'c', start: 0.25 }` виділені, протягування `a` з (60, 679) до (−500, 679) → `a.start 0.25`, `c.start 0`.
- Обмеження висоти: `a` і `d = { id: 'd', pitch: 100, start: 1, duration: 0.5, velocity: 100 }`, протягування `a` з (60, 679) до (60, −100) → `a.pitch 68`, `d.pitch 108`.
- Групова зміна тривалості: `a` і `b′ (duration 0.25)` виділені, протягування з (97, 679) до (130, 679) → `a.duration 0.875`, `b′.duration 0.625`.
- Клік без руху по `a` при виділених `['a', 'b']` → виділено лише `a`, проект той самий.
- Рамка: ноти `a`, `b`, `e` (C5 = 72, start 3, як у `selection.test.ts`), нічого не виділено. `Shift+mouseDown` (40, 600) → `mouseMove` (120, 690): `getByTestId('marquee')` має стиль `left 40px, top 600px, width 80px, height 90px`; `a`, `b` мають `data-selected="true"`, `e` — ні; сховище виділення ще порожнє. `mouseUp` → `selectedNoteIds == ['a', 'b']`, рамки немає, нот так само 3 (нова не створена).
- Рамка додає до наявного: виділено `['e']`, `Ctrl`-рамка навколо `a` → `['e', 'a']`.
- `Shift`-клік по порожньому місці без руху → нот не додано, виділення без змін.
- `Escape` під час рамки → рамка зникає, виділення без змін, після `mouseUp` теж без змін.
- `Ctrl+KeyA` на сітці → усі три ноти виділені, `fireEvent.keyDown` повертає `false`.
- `Escape` без жесту при виділеній `a` → виділення порожнє. `Escape` під час переміщення `a` (після `mouseMove`) → переміщення скасовано, а `a` **лишається виділеною**.
- Стрілки з виділеними `['a', 'b']`: `ArrowRight` → `a.start 0.625`, `b.start 1.125`; `ArrowLeft` → назад; `ArrowUp` → 61 і 65; `Shift+ArrowUp` → 73 і 77 (від 61 і 65); `Shift+ArrowDown` → 61 і 65; `ArrowDown` → знову 60 і 64. Кожне натискання — один крок: після `ArrowRight` одне «undo» повертає `0.5` / `1`.
- `ArrowLeft` з виділеною нотою на `start 0` → проект той самий (`toBe`), undo недоступне (крок не створено).
- Стрілки без виділення → `fireEvent.keyDown` повертає `true` (не скасовано), проект той самий.

### Frontend unit: `src/components/PianoRoll/PedalLane.selection.test.tsx` (новий)
Рендер як у `PedalLane.test.tsx` плюс `HistoryProbe`. Педалі `p1 = sustain [0.5, 1)`, `p2 = sustain [2, 2.5)`, `p3 = soft [0.5, 1)`.
- Клік по `p1`, `Shift`-клік по `p2` → обидві виділені, проект той самий. `Ctrl`-клік по `p1` → лишається `p2`.
- `Shift+mouseDown/mouseUp` по порожньому місцю рядка sustain → нової педалі немає.
- Виділено `p1`, `p2`, `Delete` → лишається `p3`; одне «undo» → знову три педалі.
- `Ctrl+KeyA` на доріжці → виділені всі три, `selectedNoteIds == []` (якщо до цього була виділена нота); `fireEvent` повертає `false`.
- `Escape` → виділення педалей порожнє.
- `ArrowRight` при виділеній `p1` → педаль не змінилася, `fireEvent` повертає `true`.

### Frontend unit: `App.test.tsx` (доповнення)
- «shows undo and redo»: у регіоні «Piano roll» є кнопки «Undo» і «Redo», обидві вимкнені.
- «keeps Space in the tempo field»: фокус у полі «Tempo (quarter notes per minute)», `fireEvent.keyDown(поле, { key: ' ', code: 'Space' })` → `loadPianoEngine` не викликано.

### E2E: `e2e/editing.spec.ts` (Playwright, Chromium)
Перед кожним тестом `page.goto('/')` і очікування `backend: online`. Кожен тест у новій сторінці, тобто з порожнім проектом.
1. **Undo/redo з клавіатури й кнопками:** клік по сітці в `(0.52 с, C4)`, `(1.02 с, E4)`, `(1.52 с, G4)` → 3 ноти. `ControlOrMeta+z` → 2; `ControlOrMeta+Shift+z` → 3; кнопка «Undo» → 2; «Redo» → 3; «Redo» вимкнена.
2. **Мультивиділення і групове переміщення:** 3 ноти як у п. 1. Клік по C4 `(0.56 с)`, `Shift`-клік по E4 `(1.06 с)` → інспектор «2 notes selected». Протягування C4 з `0.56 с` на `1.06 с` (та сама висота) → нота `C4, velocity 100` має `left: 100px`, `E4…` — `150px`, `G4…` — `150px` (без змін). `ControlOrMeta+z` → `50px` і `100px` (один крок).
3. **Рамка і групове видалення:** 3 ноти. `Shift` + протягування по порожньому місцю від `(0.40 с, y рядка G4 − 11 px)` до `(1.40 с, y рядка C4 + 11 px)` → під час руху видно `[data-testid="marquee"]`, після відпускання «2 notes selected» (C4, E4). `Delete` → лишається 1 нота (G4). `ControlOrMeta+z` → 3 ноти.
4. **Ctrl+A, стрілки, Escape:** 3 ноти; клік по ноті (фокус на сітці); `ControlOrMeta+a` → «3 notes selected»; `ArrowUp` → є ноти `C#4…`, `F4…`, `G#4…`; `Shift+ArrowUp` → `C#5…`, `F5…`, `G#5…`; `ArrowRight` → `C#5` має `left: 62.5px`; `Escape` → «No note selected».
5. **Педалі:** клік по доріжці в рядку Sustain у `0.2 с` і `1.2 с` → 2 педалі. Клік по першій, `Shift`-клік по другій → обидві `data-selected="true"`. `Delete` → 0 педалей; `ControlOrMeta+z` → 2.

### E2E: `e2e/transport.spec.ts`
1. **Space = Play/Pause:** фокус на `body` (без кліків по кнопках), `page.keyboard.press('Space')` → кнопка «Pause» з'являється (таймаут 20 с на завантаження семплів); ще `Space` → «Play».
2. **Space у полі темпу не запускає відтворення:** клік у поле темпу, `Space` → кнопка «Play» (не «Loading piano…» і не «Pause») протягом 1 с.
3. **Ctrl+Z у полі темпу — нативний undo тексту:** створити ноту, клік у поле темпу, `ControlOrMeta+z` → нота лишається.

### E2E: `e2e/export.spec.ts`
1. **Ctrl+S завантажує `.mid`:** створити 2 ноти; `Promise.all([page.waitForEvent('download'), page.keyboard.press('ControlOrMeta+s')])` → `download.suggestedFilename() === 'arrangement.mid'`; перші 4 байти файлу (`readFile(await download.path())`) — `MThd`.
2. **Кнопка «Export .mid»** → те саме завантаження (наскрізна перевірка frontend → backend → файл).

### Ручна перевірка в браузері
`cd backend && uv run uvicorn app.main:app --reload`, `cd frontend && npm run dev`, http://localhost:5173, Chrome і Firefox, українська розкладка клавіатури в одному з браузерів.
1. Створити 6–8 нот. `Shift`-, `Ctrl`-клік і рамка (`Shift` + протягування) виділяють кілька нот, рамка видна під час протягування.
2. Протягнути одну з виділених нот: рухається вся група, прив'язка до сітки за нотою під мишею, група зупиняється біля 0 с і на краях клавіатури. Зміна тривалості групи за правий край.
3. Стрілки зсувають виділені ноти (←/→ на крок сітки, ↑/↓ на півтон, `Shift+↑/↓` на октаву), сторінка при цьому не прокручується. Без виділення стрілки прокручують сітку.
4. `Ctrl+Z` / `Ctrl+Shift+Z` / `Ctrl+Y` / кнопки «Undo»/«Redo» відкочують і повертають: створення, видалення, переміщення групи, velocity, Quantize, BPM, розмір такту, педалі. Кожен жест — один крок. Зміна зуму чи кроку сітки кроку не створює.
5. З українською розкладкою `Ctrl+Z` (`Ctrl+Я`) і `Ctrl+A` працюють.
6. `Space` — Play/Pause, коли фокус на сітці або на сторінці; у полі BPM `Space` не запускає відтворення. Після кліку мишею по «Play» натискання `Space` не перемикає двічі.
7. `Ctrl+S` завантажує `arrangement.mid`, а діалог браузера «Зберегти сторінку» не з'являється.
8. `Ctrl+Z`, поки фокус у полі BPM з незастосованим значенням, — нативний undo тексту, історія проекту не змінюється.
9. Педалі: `Shift`-клік виділяє кілька, `Delete` видаляє всі, undo повертає.
10. Консоль без помилок і попереджень React.

## Критерії готовності (Definition of Done)
- [ ] `cd frontend && npm test -- --run && npm run lint && npm run typecheck && npm run build && npx prettier --check .` — зелено.
- [ ] `cd frontend && npm run e2e:install && npm run e2e` — зелено (усі 10 e2e-тестів), без `sudo`.
- [ ] `cd backend && uv run pytest && uv run ruff check . && uv run ruff format --check . && uv run mypy app` — зелено (backend не змінювався: `git diff main --stat -- backend` порожній).
- [ ] `npm test -- --run` не запускає файли з `e2e/` (у звіті Vitest немає `*.spec.ts`).
- [ ] Усі unit-тести з розділу «Тести» наявні й проходять.
- [ ] Наявні тести не змінено: `git diff main --name-status -- frontend/src | grep -E '\.test\.tsx?$'` показує `M` лише для `App.test.tsx`, `ExportButton.test.tsx`, `PianoRollToolbar.test.tsx`, `editorReducer.test.ts`, решта — `A`; `git diff main -- <ці файли> | grep '^-[^-]'` показує лише рядки імпортів.
- [ ] `git diff main -- frontend/package.json` показує лише `@playwright/test` і `@types/node` у `devDependencies` та скрипти `e2e`, `e2e:install`. Backend-залежності не змінено.
- [ ] `projectReducer.ts` не змінено: `git diff main -- frontend/src/state/projectReducer.ts` порожній.
- [ ] `grep -rn "console.log\|\.only(" frontend/src frontend/e2e` нічого не знаходить.
- [ ] `git status --porcelain` після `npm run e2e` не показує `test-results/`, `playwright-report/` чи `.mid`.
- [ ] README має розділ «Виділення, undo/redo і гарячі клавіші» і опис `npm run e2e:install` / `npm run e2e`.
- [ ] Ручна перевірка (пп. 1–10) пройдена в Chrome і Firefox.
- [ ] У гілці до злиття (коміт `docs: mark task 010 as done`) у CLAUDE.md відмічено `[x]` пункт 2.2 «Виділення кількох нот, undo/redo»; статус 010 — «виконано»; статус плану — `виконано`.
- [ ] Гілку `feature/010-undo-selection-e2e` злито в `main` (`--no-ff`) і запушено; на `main` перевірки (включно з e2e) зелені.

## Ризики / відкриті питання
- **Chromium Playwright на Arch Linux.** Playwright офіційно підтримує Ubuntu/Debian. На інших дистрибутивах він попереджає «OS not officially supported» і завантажує збірку для Ubuntu. На десктопному Arch потрібні бібліотеки (nss, alsa-lib, libxkbcommon, gtk3 тощо) зазвичай уже встановлені, і headless-оболонка запускається. Якщо ні, **без sudo** є два шляхи: (1) `E2E_CHROMIUM_PATH=/usr/bin/chromium` (або `google-chrome-stable`), якщо браузер уже встановлено; (2) зупинитися й попросити власника встановити відсутні пакети (`sudo pacman -S …`, агенту заборонено, розділ 5.3). `npx playwright install --with-deps` не використовується, бо він викликає `sudo`.
- **Версія Node.** Свіжі версії `@playwright/test` потребують Node 20+ (як і вимога README). Якщо локальний Node старіший, `npm run e2e` повідомить про це. Це збігається з наявною вимогою, нових вимог немає.
- **Порти 8000 / 5173 зайняті іншим процесом.** Локально `reuseExistingServer: true`, тож якщо там уже запущено цей проект, його перевикористають. Якщо порт тримає чужий процес, тест упаде з таймаутом `webServer`. Рішення — звільнити порт; змінювати порти в конфігурації не будемо, бо Vite-проксі захардкоджено на 8000.
- **Звук у headless.** Відтворення в e2e перевіряється лише через стан кнопки («Pause»), а не через вихід звуку. Якщо `AudioContext` у headless-оболонці все ж не стартує, прапорець `--autoplay-policy=no-user-gesture-required` це страхує; інакше тест `Space` запускати з `channel`/`E2E_CHROMIUM_PATH` на повному Chromium.
- **Undo під час перетягування.** `Ctrl+Z` посеред жесту відкотить попередню дію, а `mouseup` потім зафіксує жест поверх (невідомі id reducer ігнорує). Це безпечно, бо стан завжди валідний. Блокувати клавіші під час жесту не будемо.
- **Undo не відновлює виділення** (свідомо, див. «Технічні рішення»). Якщо власнику потрібне відновлення виділення разом з undo, історію можна розширити снапшотом виділення окремою задачею.
- **`Ctrl+S` замість браузерного «Зберегти сторінку»** — свідомий вибір (див. таблицю в розділі 2.1). На macOS це `⌘+S`.
- **`Space` на фокусованій кнопці** виконує нативний клік кнопки, а наше скорочення в цей момент мовчить. Тому `Space` після кліку по «Stop» натисне «Stop», а не Play/Pause. Це стандартна поведінка доступних інтерфейсів; описано в README.
- **Обсяг.** Задача велика, але складається з трьох незалежних частин з окремими комітами. Запасний поділ, якщо implementer не вкладається в одну гілку: **010a** — undo/redo і гарячі клавіші (кроки 2–8); **010b** — мультивиділення (кроки 9–11); **010c** — Playwright і e2e (кроки 12–13). README ділиться відповідно. Галочка 2.2 ставиться лише після 010b (undo і мультивиділення разом), а статус 010 «виконано» — після 010c.
- **Відкрите питання до власника (не блокує): e2e в обов'язкових перевірках.** Пропонуємо додати `npm run e2e` до «Команд перевірки» в розділі 7 CLAUDE.md. Змінювати правила проекту агенту не можна без власника, тому в цій задачі e2e обов'язкові лише через DoD, а в README їх описано.
- **Відкрите питання до власника (не блокує): копіювання / вставка / дублювання нот** (`Ctrl+C/V/D`). Цього немає у вимогах 2.2. Якщо потрібно, це окрема невелика задача на основі `translateNotes` і `addNotes`, один крок undo.
