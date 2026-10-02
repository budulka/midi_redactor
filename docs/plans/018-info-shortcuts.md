# 018 — Кнопка Info зі списком гарячих клавіш

**Статус:** виконано
**Гілка:** feature/018-info-shortcuts

## Мета
Закрити останній пункт розділу 2.9 CLAUDE.md, **«Кнопка Info»**: кнопка в інтерфейсі відкриває вікно з переліком усіх гарячих клавіш і дій мишею. Список формується з того самого джерела, що й обробники клавіш, тож не може розійтися з реальною поведінкою.

Для цього всі клавіші застосунку описуються в одному **реєстрі**. Кожен обробник клавіш (сторінка, нотна сітка, доріжка педалей, таймлайн медіа, межі розрізів, позначка такту 1, роздільник панелей, контекстне меню, числові поля, перетягування, саме вікно Info) розпізнає клавішу **лише через реєстр**, а вікно Info **рендерить той самий реєстр**. Відповідність перевіряють тести в обидва боки: кожна клавіша з реєстру справді обробляється, а клавіша поза реєстром — ні.

### Поточний стан (перевірено в коді)
- **`utils/shortcuts.ts`** — частковий реєстр:
  - `globalShortcutFor(event, target)` → `'undo' | 'redo' | 'playPause' | 'export'`: літери за `code`, будь-яка комбінація з Alt ігнорується, Space — не в текстових полях, не на кнопках/списках/прапорцях/повзунках (`isActivationTarget`), без `repeat`; `Ctrl+S` працює й у полях;
  - `editorShortcutFor(event)` → `selectAll | delete | clearSelection | nudge* | octave*` (мапи `PLAIN_KEYS`, `SHIFT_KEYS`);
  - `SHORTCUT_HINTS` — підписи `Ctrl+Z`, `Ctrl+Shift+Z`, `Ctrl+S`, `Space` для `title` кнопок (`PianoRollToolbar`, `ExportButton`).
- **Клавіші, що обробляються поза `shortcuts.ts`** (кожна зі своєю перевіркою `event.key`):
  - `MediaTimeline.tsx` — смуга: `Delete`/`Backspace` (вирізати виділення), `Escape` (зняти виділення), стрілки/Home/End через `timelineSeekForKey` (`utils/mediaTimeline.ts`); межа розрізу: `Delete`/`Backspace` (прибрати розріз), стрілки через `cutEdgeForKey` (`utils/mediaCuts.ts`). **Модифікатори Ctrl/⌘/Alt не перевіряються**: `Alt+←` на смузі перемотує і блокує «Назад» браузера;
  - `MediaOffsetMarker.tsx` — `offsetForKey` (`utils/mediaOffset.ts`), так само без перевірки модифікаторів;
  - `AppLayout.tsx` — роздільник: `keyboardMediaPanelWidth` + `SPLITTER_KEYS` (`utils/mediaPanelWidth.ts`). Doc-коментар `SPLITTER_KEYS` прямо каже, що це джерело для задачі 018 (план 014, «Ризики»);
  - `ContextMenu.tsx` — `switch (event.key)`: ↑/↓/Home/End/Escape;
  - `CommitNumberInput.tsx` — Enter (застосувати), Escape (відновити), без `preventDefault`;
  - `PianoRoll/useDragGesture.ts` — `Escape` на `window` скасовує будь-який жест (нотна сітка, педалі, смуга медіа, межа розрізу, позначка такту 1, роздільник), з будь-якими модифікаторами.
- **Дії мишею** розкидані по `useNoteDrag.ts` (створити/перемістити/змінити довжину/додати до виділення/рамка), `NoteGrid.handleContextMenu` (видалити ноту), `usePedalDrag.ts` і `PedalLane.handleContextMenu`, `PianoKeyboard`, `TimeRuler` (клік → seek), `MediaTimeline` (клік, протягування, ПКМ, межі розрізів), waveform (`waveSurferPlayer.ts`, `interaction` → seek), `MediaOffsetMarker` (перетягування), `AppLayout` (перетягування, подвійний клік), `useFileDrop` (drop файлу на аудіодоріжку і відеопанель).
- **Модальних вікон у застосунку немає**: є лише `ContextMenu` (`createPortal` у `document.body`) і `window.confirm` в імпорті. `@testing-library/user-event` не встановлено, тести використовують `fireEvent`.
- README, розділ «Виділення, undo/redo і гарячі клавіші», містить ручну таблицю клавіш.

## Поза межами задачі
- **Гаряча клавіша для відкриття Info** (`?`, `F1`). Вимога каже про кнопку. Див. «Відкриті питання».
- **Визначення платформи** і показ `⌘` замість `Ctrl` на macOS. Вікно пише одну примітку «On macOS use ⌘ instead of Ctrl», як README. Обробники й так приймають і Ctrl, і ⌘.
- **Переналаштування клавіш** користувачем і локалізація вікна (інтерфейс застосунку англійською, як і досі).
- **Нативна поведінка браузера**: Tab між елементами, Space/Enter на кнопках, стрілки в числовому полі чи списку. Це не обробники застосунку, тому в реєстр вони не потрапляють.
- **Підказки (`title`) окремих елементів з реєстру**, окрім уже наявних `SHORTCUT_HINTS`. Текст `title` роздільника, позначки такту 1 і позначки розрізу не змінюється.
- Backend не змінюється, нових залежностей немає.

## Технічні рішення

### 1. Реєстр клавіш: одне джерело для обробників і для вікна
**Принцип.** Жоден компонент більше не порівнює `event.key`/`event.code` сам. Він викликає `handleShortcut(scope, event, handlers)` (або `shortcutFor` для window-слухачів), а ті шукають клавішу в реєстрі. Вікно Info будує свої рядки з того самого об'єкта `KEY_SCOPES`. Додати клавішу можна лише в реєстр. Якщо в компонента немає обробника для дії реєстру, це **помилка компіляції** (вичерпний mapped type). Обробник для клавіші, якої немає в реєстрі, написати неможливо, бо компонент отримує вже розпізнану дію.

**Відкинуті альтернативи:**

| Варіант | Чому ні |
|---|---|
| Окремий статичний список для вікна + тест, що порівнює його з обробниками | Два джерела; тест мусить знати внутрішню логіку кожного обробника. Вимога прямо просить спільне джерело |
| Генерувати список, «програючи» всі клавіші по компонентах у рантаймі | Вікно мусило б монтувати чужі компоненти зі станом; крихко й повільно |
| Бібліотека гарячих клавіш (`react-hotkeys-hook`, `tinykeys`) | Нова залежність. Вона не вміє правил «не в текстовому полі / не на кнопці», які вже є, і не дає даних для вікна. Власний реєстр — ~200 рядків чистого коду з unit-тестами |

#### `src/utils/keyChord.ts` (новий) — опис і зіставлення одного сполучення клавіш
```ts
/** The fields of a keydown that shortcuts look at (KeyboardEvent and React's KeyboardEvent fit). */
export interface KeyLike {          // переноситься з shortcuts.ts без змін
  readonly key: string; readonly code: string;
  readonly ctrlKey: boolean; readonly metaKey: boolean;
  readonly shiftKey: boolean; readonly altKey: boolean; readonly repeat: boolean;
}

export type ModifierRule = boolean | 'any';

/** One key combination. Letters and Space are matched by `code` (any keyboard layout), named keys by `key`. */
export type KeyChord = (
  | { readonly code: string; readonly key?: never }
  | { readonly key: string; readonly code?: never }
) & {
  /** Ctrl or ⌘ held; default false. */
  readonly mod?: ModifierRule;
  /** Default false. */
  readonly shift?: ModifierRule;
  /** Default false: Alt (AltGr on Windows) combinations are never shortcuts unless allowed. */
  readonly alt?: ModifierRule;
};

export function chordMatches(chord: KeyChord, event: KeyLike): boolean;
/** "Ctrl+Shift+Z", "Shift+↑", "Space", "Esc", "Home". Modifiers with 'any' are not shown. */
export function formatChord(chord: KeyChord): string;
```
- `chordMatches`:
  - `mod`: `(ctrlKey || metaKey) === mod`, якщо `mod !== 'any'`;
  - так само `shift` проти `shiftKey` і `alt` проти `altKey`;
  - далі `event.code === chord.code` або `event.key === chord.key`.
- `formatChord`:
  - назви кодів: `KeyA`…`KeyZ` → `A`…`Z`, `Space` → `Space`;
  - назви клавіш: `ArrowLeft/Right/Up/Down` → `←/→/↑/↓`, `Escape` → `Esc`, решта як є (`Delete`, `Backspace`, `Home`, `End`, `Enter`, `Tab`);
  - префікси в порядку `Ctrl+`, `Alt+`, `Shift+`, лише для значення `true`.

#### `src/utils/keyTargets.ts` (новий) — де клавіша натиснута
Сюди **переносяться без змін** `isTextEntryTarget`, `isActivationTarget` і їхні константи з `shortcuts.ts`. Додається:
```ts
/** True inside an open modal dialog ([aria-modal="true"]). */
export function isInsideModal(target: EventTarget | null): boolean;
```

#### `src/utils/keyActions.ts` (новий) — спільні типи дій без імпортів
```ts
export type StepAction = 'stepBack' | 'stepForward' | 'bigStepBack' | 'bigStepForward';
export type SeekAction = StepAction | 'toStart' | 'toEnd';
export type SplitterAction = 'widen' | 'narrow' | 'widenMore' | 'narrowMore' | 'narrowest' | 'widest';
/** −1 for the back actions, 1 for the forward ones; big for the Shift variants. */
export function stepOf(action: StepAction): { readonly sign: -1 | 1; readonly big: boolean };
```
Окремий модуль без імпортів потрібен, щоб `mediaTimeline.ts`, `mediaCuts.ts`, `mediaOffset.ts` і `mediaPanelWidth.ts` могли брати типи дій, а реєстр — їхні константи кроків, без циклічних імпортів.

#### `src/utils/shortcutRegistry.ts` (новий) — реєстр і зіставлення
```ts
interface ScopeActionMap {
  global: 'undo' | 'redo' | 'playPause' | 'export';
  noteGrid: 'selectAll' | 'delete' | 'clearSelection' | 'nudgeLeft' | 'nudgeRight' | 'nudgeUp' | 'nudgeDown' | 'octaveUp' | 'octaveDown';
  pedalLane: 'selectAll' | 'delete' | 'clearSelection';
  dragGesture: 'cancel';
  mediaTimeline: SeekAction | 'cutSelection' | 'clearSelection';
  cutEdge: StepAction | 'removeCut';
  barOneMarker: SeekAction;
  splitter: SplitterAction;
  contextMenu: 'next' | 'previous' | 'first' | 'last' | 'close';
  numberField: 'apply' | 'revert';
  infoDialog: 'close' | 'focusNext' | 'focusPrevious';
}
export type ShortcutScope = keyof ScopeActionMap;
export type ScopeAction<S extends ShortcutScope> = ScopeActionMap[S];

/** Where a page-wide shortcut works. */
export type TargetRule = 'everywhere' | 'notInTextFields' | 'notInTextFieldsOrControls';

export interface KeyBinding {
  readonly chords: readonly KeyChord[];   // at least one; the first one is the hint
  readonly description: string;           // English, shown in the Info window
  /** Only for the global scope; default 'everywhere'. */
  readonly target?: TargetRule;
  /** Auto-repeated keydowns trigger the action; default true. */
  readonly repeat?: boolean;
}

/** Keyed by action, so TypeScript requires a binding for every action of a scope. */
export const KEY_SCOPES: { readonly [S in ShortcutScope]: { readonly [A in ScopeAction<S>]: KeyBinding } };
export const SHORTCUT_SCOPES: readonly ShortcutScope[];   // Object.keys(KEY_SCOPES), in order

/** The action of a scope for a keydown, or null. `target` matters only for the global scope. */
export function shortcutFor<S extends ShortcutScope>(scope: S, event: KeyLike, target?: EventTarget | null): ScopeAction<S> | null;

export type ShortcutHandlers<S extends ShortcutScope> = {
  readonly [A in ScopeAction<S>]: (action: A) => boolean | void;
};
/**
 * Runs the handler of the scope's action for a keydown. A handler returns false when the action
 * does not apply now (e.g. nothing is selected); then the event keeps its default action.
 * Otherwise the default is prevented and the function returns true.
 */
export function handleShortcut<S extends ShortcutScope>(
  scope: S,
  event: KeyLike & { readonly target: EventTarget | null; preventDefault(): void },
  handlers: ShortcutHandlers<S>,
): boolean;

/** formatChord of the first chord of an action: shortcutHint('global', 'redo') === 'Ctrl+Shift+Z'. */
export function shortcutHint<S extends ShortcutScope>(scope: S, action: ScopeAction<S>): string;
/** "not in text fields" etc.; '' for 'everywhere' in scopes other than global. */
export function targetRuleNote(rule: TargetRule): string;
```
**Типізація всередині `handleShortcut`.** Для узагальненого `S` TypeScript не зводить виклик `handlers[action](action)`: це кореляція юніону. Тому всередині функції (і лише там) дозволено одне вузьке приведення без `any`, з коментарем:
```ts
// TypeScript cannot correlate the action with its handler for a generic scope.
const handler = handlers[action] as (action: ScopeAction<S>) => boolean | void;
```
Так само дозволено одне приведення `Object.entries(KEY_SCOPES[scope]) as [ScopeAction<S>, KeyBinding][]` у `shortcutFor`. Зовнішні сигнатури лишаються строгими.

**Правила `shortcutFor`.** Прив'язки переглядаються в порядку ключів об'єкта, повертається перша, для якої:
1. збігся один з `chords`;
2. `repeat !== false || !event.repeat`;
3. для `global` виконується правило `target`:
   - `everywhere` — завжди;
   - `notInTextFields` — `!isTextEntryTarget(target) && !isInsideModal(target)`;
   - `notInTextFieldsOrControls` — те саме і `!isActivationTarget(target)`.

`isInsideModal` — нове правило: поки відкрито вікно Info, Undo/Redo/Play не діють. Export (`everywhere`) діє далі, щоб `Ctrl+S` не відкривав діалог браузера «Зберегти сторінку».

**Вміст реєстру** (описи англійською; числа кроків беруться з наявних констант, а не пишуться вручну):

| scope | дія | сполучення | опис (рядок у вікні) |
|---|---|---|---|
| global | undo | `{code:'KeyZ', mod:true}` | `Undo`, target `notInTextFields` |
| | redo | `{code:'KeyZ', mod:true, shift:true}`, `{code:'KeyY', mod:true}` | `Redo`, `notInTextFields` |
| | playPause | `{code:'Space'}`, `repeat: false` | `Play / Pause`, `notInTextFieldsOrControls` |
| | export | `{code:'KeyS', mod:true}` | `Export .mid`, `everywhere` |
| noteGrid | selectAll | `{code:'KeyA', mod:true}` | `Select all notes` |
| | delete | `{key:'Delete'}`, `{key:'Backspace'}` | `Delete the selected notes` |
| | clearSelection | `{key:'Escape'}` | `Clear the selection` |
| | nudgeLeft / nudgeRight | `{key:'ArrowLeft'}` / `{key:'ArrowRight'}` | `Move the selected notes one grid step earlier` / `later` |
| | nudgeUp / nudgeDown | `{key:'ArrowUp'}` / `{key:'ArrowDown'}` | `Move the selected notes a semitone up` / `down` |
| | octaveUp / octaveDown | `{key:'ArrowUp', shift:true}` / `{key:'ArrowDown', shift:true}` | `Move the selected notes an octave up` / `down` |
| pedalLane | selectAll / delete / clearSelection | як у noteGrid | `Select all pedal presses` / `Delete the selected pedal presses` / `Clear the selection` |
| dragGesture | cancel | `{key:'Escape', mod:'any', shift:'any', alt:'any'}` | `Cancel the drag (nothing changes)` |
| mediaTimeline | stepBack / stepForward | `{key:'ArrowLeft'}` / `{key:'ArrowRight'}` | `` `Move the playhead ${TIMELINE_KEY_STEP_SECONDS} s back` `` / `forward` |
| | bigStepBack / bigStepForward | ті самі з `shift:true` | ті самі з `TIMELINE_KEY_BIG_STEP_SECONDS` |
| | toStart / toEnd | `{key:'Home', shift:'any'}` / `{key:'End', shift:'any'}` | `Go to bar 1` / `Go to the end of the media` |
| | cutSelection | `{key:'Delete'}`, `{key:'Backspace'}` | `Cut the selected range from the media` |
| | clearSelection | `{key:'Escape'}` | `Clear the selected range` |
| cutEdge | step* (4) | стрілки ←/→, з Shift — великий крок | `` `Move the edge ${ms(CUT_KEY_STEP_SECONDS)} earlier` `` / `later`, великий — `CUT_KEY_BIG_STEP_SECONDS` |
| | removeCut | `{key:'Delete'}`, `{key:'Backspace'}` | `Remove the cut (bring the range back)` |
| barOneMarker | step* (4) | як cutEdge | `` `Move bar 1 ${ms(OFFSET_KEY_STEP_SECONDS)} earlier in the media` `` / `later`, великий — `OFFSET_KEY_BIG_STEP_SECONDS` |
| | toStart / toEnd | `{key:'Home', shift:'any'}` / `{key:'End', shift:'any'}` | `Put bar 1 at the start of the media` / `at the end of the media` |
| splitter | widen / narrow | `{key:'ArrowLeft'}` / `{key:'ArrowRight'}` | `` `Widen the media panel by ${SPLITTER_KEY_STEP_PX} px` `` / `Narrow …` |
| | widenMore / narrowMore | ті самі з `shift:true` | ті самі з `SPLITTER_LARGE_KEY_STEP_PX` |
| | narrowest / widest | `{key:'Home', shift:'any'}` / `{key:'End', shift:'any'}` | `Make the media panel as narrow as possible` / `as wide as possible` |
| contextMenu | next / previous / first / last / close | `↓` / `↑` / `Home` / `End` / `Esc` | `Next item` / `Previous item` / `First item` / `Last item` / `Close the menu` |
| numberField | apply / revert | `{key:'Enter'}` / `{key:'Escape'}` | `Apply the value (leaving the field applies it too)` / `Restore the current value` |
| infoDialog | close / focusNext / focusPrevious | `{key:'Escape'}` / `{key:'Tab'}` / `{key:'Tab', shift:true}` | `Close this window` / `Next control in this window` / `Previous control in this window` |

`ms(seconds)` → `` `${Math.round(seconds * 1000)} ms` `` — допоміжна функція реєстру. `shift:'any'` для Home/End зберігає поточну поведінку (`Shift+Home` зараз теж спрацьовує, бо Shift для Home/End ігнорується). `dragGesture` приймає Escape з будь-якими модифікаторами, як і зараз: рамку виділення тягнуть із затиснутим Shift/Ctrl, і Escape має її скасовувати.

**Зміни поведінки** (свідомі, через однакове правило «модифікатори мусять збігтися»):
1. Смуга медіа, межа розрізу, позначка такту 1: стрілки, Home і End з Ctrl/⌘/Alt більше не діють. Зараз `Alt+←` перемотує і блокує «Назад» браузера, а `Ctrl+→` перемотує так само, як `→`. `Shift+стрілки` (великий крок) і `Shift+Home/End` діють, як і зараз.
2. Смуга медіа і межа розрізу: `Delete`, `Backspace` і `Escape` з **будь-яким** модифікатором (Shift, Ctrl/⌘, Alt) більше не діють. Зараз `MediaTimeline.tsx:200,205,276` модифікатори не перевіряє, тож `Shift+Delete` вирізає виділення, `Shift+Escape` знімає його, а `Shift+Backspace` прибирає розріз.
3. Контекстне меню: навігація й Escape з модифікаторами не діють.
4. Числові поля (`CommitNumberInput`): `Ctrl/⌘+Enter`, `Shift+Enter` і `Shift+Escape` більше не застосовують і не відновлюють значення. Діють лише `Enter` і `Escape` без модифікаторів, а також вихід з поля, який застосовує значення. Крім того, `Enter`/`Escape` тепер викликають `preventDefault()` (видимої різниці немає: поля не в `<form>`).
5. Поки відкрито вікно Info, Undo/Redo/Play не діють, Export діє.

Інших змін поведінки немає. Наявні тести `shortcuts.test.ts` для `globalShortcutFor` проходять без змін. Усі п'ять змін описуються в README (крок 9).

#### `src/utils/shortcuts.ts` — фасад для наявних імпортів
- Реекспортує `KeyLike`, `isTextEntryTarget`, `isActivationTarget`, тож імпорти в `ExportButton`, `PianoRollToolbar` і тестах не змінюються.
- `export type GlobalShortcutId = ScopeAction<'global'>`.
- `globalShortcutFor(event, target) = shortcutFor('global', event, target)`. Використовують `useGlobalShortcuts`, `NoteGrid`, `PedalLane` (блокування undo/redo під час жесту, без змін).
- `SHORTCUT_HINTS` обчислюється: `{ undo: shortcutHint('global','undo'), redo: …, export: …, playPause: … }`. Значення ті самі (`Ctrl+Z`, `Ctrl+Shift+Z`, `Ctrl+S`, `Space`), тест `has hints for button titles` не змінюється.
- `editorShortcutFor` і `EditorShortcutId` **видаляються**: `NoteGrid`/`PedalLane` переходять на `handleShortcut`. Блок тестів `describe('editorShortcutFor')` переноситься в `shortcutRegistry.test.ts` як `shortcutFor('noteGrid', …)` з тими самими очікуваннями.

### 2. Чисті функції кроків приймають дію, а не клавішу
Щоб клавіші знав лише реєстр, функції, які зараз розбирають `key`/`shiftKey`, приймають дію. Значення кроків і округлення не змінюються:

| було | стало |
|---|---|
| `timelineSeekForKey(position, key, shiftKey, end): number \| null` (`mediaTimeline.ts`) | `timelineSeekForAction(position, action: SeekAction, end): number \| null` — `null` лише при `end <= 0` |
| `offsetForKey(offset, key, shiftKey, duration): number \| null` (`mediaOffset.ts`) | `offsetForAction(offset, action: SeekAction, duration): number` |
| `cutEdgeForKey(value, key, shiftKey, limits): number \| null` (`mediaCuts.ts`) | `cutEdgeForAction(value, action: StepAction, limits): number` |
| `keyboardMediaPanelWidth(event, width, viewport): number \| null`, `SPLITTER_KEYS`, `SplitterKey`, `isSplitterKeyName` (`mediaPanelWidth.ts`) | `splitterWidthForAction(action: SplitterAction, width, viewport): number`; `SPLITTER_KEYS`, `SplitterKey`, `isSplitterKeyName` видаляються (їхню роль виконує реєстр) |

Перевірка «чужа клавіша → `null`» переходить у тести реєстру (`shortcutFor(scope, 'a') === null`).

### 3. Обробники переходять на реєстр
Логіка кожного обробника лишається тією самою. Змінюється лише спосіб розпізнати клавішу:
- **`NoteGrid.handleKeyDown`**:
  - блок «під час жесту блокувати undo/redo» лишається як є;
  - далі `handleShortcut('noteGrid', event, { selectAll, delete, clearSelection, nudgeLeft: nudge, … octaveDown: nudge })`;
  - `clearSelection` повертає `false` під час жесту або без виділення; `nudge` повертає `false` без виділення (тоді стрілки прокручують сітку, як зараз); `delete` завжди обробляється (як зараз);
  - зсув рахується з `PITCH_NUDGES` і кроку сітки, як зараз.
- **`PedalLane.handleKeyDown`** — так само з `'pedalLane'` (три дії).
- **`useDragGesture.handleKeyDown`** (window, під час жесту): `if (shortcutFor('dragGesture', event) === null) return;` далі `preventDefault()` і `finish()`.
- **`MediaTimeline`**:
  - смуга: `if (!ready) return; handleShortcut('mediaTimeline', event, { cutSelection, clearSelection, stepBack: seek, … toEnd: seek })`;
    - `cutSelection`/`clearSelection` повертають `false` без виділення;
    - `seek(action)` = `timelineSeekForAction(position, action, extent?.end ?? 0)`; `null` → `false`, інакше `api.seek(value)`;
  - межа розрізу: `handleShortcut('cutEdge', event, { removeCut: () => removeCut(cut.id), stepBack: move, … })`, де `move(action)` рахує `cutEdgeForAction(cut[edge], action, limits)` і диспатчить `updateMediaCut`.
- **`MediaOffsetMarker`**: `handleShortcut('barOneMarker', event, …)` з `offsetForAction`.
- **`AppLayout`** (роздільник): `handleShortcut('splitter', event, …)` з `splitterWidthForAction(action, committed, viewportWidth)` → `commit`.
- **`ContextMenu`**: `handleShortcut('contextMenu', event, { next, previous, first, last, close })`. Навігація повертає `false`, якщо пунктів немає. Якщо обробка відбулась, `event.stopPropagation()`, як і зараз.
- **`CommitNumberInput`**: `handleShortcut('numberField', event, { apply: commit, revert: () => setDraft(null) })`.
- **`useGlobalShortcuts`** — без змін логіки, `globalShortcutFor` уже йде через реєстр. Обробники глобальних дій розподілені між `KeyboardShortcuts` (undo/redo/playPause) і `ExportButton` (export), тож тип лишається `Partial`, а повноту перевіряє контрактний тест (розділ «Тести»).

### 4. Дії мишею: каталог у тому самому модулі довідки і класифікатори
Жест миші залежить від hit-test, тому один спільний «матчер» для всіх жестів неможливий. Рішення:
- **`src/utils/mouseActions.ts` (новий)** — каталог `MOUSE_ACTIONS` і чисті класифікатори для двох областей із розгалуженою логікою (сітка нот і доріжка педалей). Обробники цих областей вирішують, що робити, **через класифікатор**. Так для них діє та сама гарантія, що й для клавіш: класифікатор повертає лише дії з каталогу, а кожна дія каталогу досяжна (unit-тест перебирає всі входи).
- Для областей з однією дією на елемент (лінійка, клавіатура, смуга медіа, позначки розрізів, waveform, роздільник, drop файлу) каталог — єдиний опис. Його склад зафіксовано тестом з явним списком id, тож додати чи прибрати жест без оновлення каталогу не вийде непомітно.

```ts
export type MouseArea = 'noteGrid' | 'pianoKeyboard' | 'pedalLane' | 'timeRuler' | 'mediaTimeline' | 'cutMarks' | 'waveform' | 'splitter' | 'mediaFiles';
export type GestureKind = 'click' | 'drag' | 'rightClick' | 'doubleClick' | 'pressHold' | 'drop';
export interface MouseAction {
  readonly id: MouseActionId;
  readonly area: MouseArea;
  readonly gesture: GestureKind;
  /** Shift, Ctrl or ⌘ held (see isAdditive). */
  readonly additive?: true;
  /** What the gesture is made on: "a note", "an empty place". */
  readonly on: string;
  readonly description: string;
}
export const MOUSE_ACTIONS: readonly MouseAction[];
/** "Click", "Shift/Ctrl/⌘+drag", "Right-click", "Double-click", "Press and hold", "Drop". */
export function gestureLabel(action: Pick<MouseAction, 'gesture' | 'additive'>): string;
/** gestureLabel + " " + on: "Right-click a note". */
export function mouseActionLabel(action: MouseAction): string;

export type MouseButtonName = 'left' | 'right';
export function noteGridMouseAction(button: MouseButtonName, additive: boolean, hit: HitZone | null): NoteGridMouseAction | null;
export function pedalLaneMouseAction(button: MouseButtonName, additive: boolean, hit: PedalHitZone | null): PedalLaneMouseAction | null;
```
- `utils/selection.ts` отримує `export const ADDITIVE_MODIFIERS_LABEL = 'Shift/Ctrl/⌘'` поруч з `isAdditive`. `gestureLabel` бере підпис звідти.
- **Класифікатор сітки:**
  - `right` → `hit ? 'deleteNote' : null`;
  - `left`, `hit === null` → `additive ? 'selectRect' : 'createNote'`;
  - `left`, є hit → `additive ? 'toggleNote' : hit === 'resize' ? 'resizeNotes' : 'moveNotes'`.
- **Класифікатор педалей:**
  - `right` → `hit ? 'deletePedal' : null`;
  - `left` + `additive` → `hit ? 'togglePedal' : null`;
  - `left`, без hit → `'createPedal'`;
  - `left`, hit `body`/`start`/`end` → `'movePedal'`/`'resizePedalStart'`/`'resizePedalEnd'`.
- `useNoteDrag.onMouseDown`: `if (event.button !== 0) return;` лишається. Далі `switch (noteGridMouseAction('left', isAdditive(event), hit?.zone ?? null))` замість вкладених `if`. Гілки ті самі: `selectRect` → marquee, `createNote` → create, `toggleNote` → `onSelect(toggleId…)`, `moveNotes`/`resizeNotes` → group drag з `kind` `move`/`resize`. Так само `usePedalDrag` з `pedalLaneMouseAction`. `NoteGrid.handleContextMenu` і `PedalLane.handleContextMenu`: `if (classifier('right', false, hit?.zone ?? null) === null) return;` далі як зараз.

**Каталог (26 дій):**

| area | id | gesture | on | description |
|---|---|---|---|---|
| noteGrid | createNote | click | an empty place | Add a note one grid step long; drag right to set its length |
| | moveNotes | drag | a note | Move the note (or all selected notes) in time and pitch |
| | resizeNotes | drag | the right edge of a note | Change the length of the note (or all selected notes) |
| | toggleNote | click, additive | a note | Add the note to the selection or remove it |
| | selectRect | drag, additive | an empty place | Select the notes in a rectangle (adds to the selection) |
| | deleteNote | rightClick | a note | Delete the note |
| pianoKeyboard | playKey | pressHold | a key | Play the note while the button is held |
| pedalLane | createPedal | click | an empty place of a row | Add a press of that pedal one beat long; drag right to set its end |
| | movePedal | drag | a pedal press | Move it in time |
| | resizePedalStart | drag | the left edge of a pedal press | Change when the pedal goes down |
| | resizePedalEnd | drag | the right edge of a pedal press | Change when the pedal goes up |
| | togglePedal | click, additive | a pedal press | Add it to the selection or remove it |
| | deletePedal | rightClick | a pedal press | Delete it |
| timeRuler | seekRuler | click | the ruler | Move the playhead there (during playback, jump there and keep playing) |
| mediaTimeline | seekTimeline | click | the media timeline | Move the playhead there |
| | selectRange | drag | along the media timeline | Select a range |
| | rangeMenu | rightClick | the selected range | Open the menu with "Delete range" (cut the range from the media) |
| cutMarks | dragCutStart | drag | the left half of a cut mark | Move the start of the cut |
| | dragCutEnd | drag | the right half of a cut mark | Move the end of the cut |
| | cutMenu | rightClick | a cut mark | Open the menu with "Remove cut" (bring the range back) |
| waveform | seekWaveform | click | the waveform | Move the playhead there |
| | dragBarOne | drag | the yellow "1" marker | Choose the media second where bar 1 starts |
| splitter | resizePanel | drag | the splitter | Change the width of the media panel (kept after a reload) |
| | resetPanel | doubleClick | the splitter | Reset the width |
| mediaFiles | dropAudio | drop | an audio file on the audio track | Load it instead of the current media |
| | dropVideo | drop | a video file on the video panel | Load it instead of the current media |

### 5. Розділи довідки — `src/utils/helpSections.ts` (новий)
```ts
export type HelpSectionId = 'page' | 'noteGrid' | 'pianoKeyboard' | 'pedalLane' | 'dragging' | 'timeRuler' | 'mediaTimeline' | 'cutMarks' | 'waveform' | 'splitter' | 'mediaFiles' | 'contextMenu' | 'numberFields' | 'infoWindow';
export interface HelpSectionSpec {
  readonly id: HelpSectionId;
  readonly title: string;
  readonly where: string;           // may be ''
  readonly keyScope?: ShortcutScope;
  readonly mouseArea?: MouseArea;
}
export const HELP_SECTION_SPECS: readonly HelpSectionSpec[];
export interface HelpRow {
  readonly id: string;              // "noteGrid.delete", "mouse.deleteNote"
  readonly kind: 'key' | 'mouse';
  readonly inputs: readonly string[];   // ["Delete", "Backspace"] or ["Right-click a note"]
  readonly description: string;
}
export interface HelpSection { readonly id: HelpSectionId; readonly title: string; readonly where: string; readonly rows: readonly HelpRow[]; }
/** Key rows (in registry order) then mouse rows (in catalog order) of every section. */
export function buildHelpSections(): readonly HelpSection[];
export const HELP_NOTE = 'On macOS use ⌘ instead of Ctrl. Letter shortcuts work with any keyboard layout. Undo, Redo and Play / Pause are off while this window is open.';
```
- Опис рядка клавіші: `description`. Для `global` до нього додається примітка правила: `Undo (not in text fields)`, `Play / Pause (not in text fields, buttons, lists, checkboxes or sliders)`, `Export .mid (works in text fields too)`.
- Порядок і тексти розділів:

| id | title | where | keyScope | mouseArea |
|---|---|---|---|---|
| page | Whole page | Works anywhere on the page. | global | — |
| noteGrid | Note grid | Keys work when the note grid has the focus (click it or use Tab). | noteGrid | noteGrid |
| pianoKeyboard | Piano keyboard | The keys to the left of the note grid. | — | pianoKeyboard |
| pedalLane | Pedal lane | The rows under the note grid: Sustain, Sostenuto, Soft. Keys work when the lane has the focus. | pedalLane | pedalLane |
| dragging | While dragging | Any drag in the editor, on the media timeline, on the bar 1 marker or on the splitter. Undo and Redo do not work during a drag of notes or pedal presses. | dragGesture | — |
| timeRuler | Time ruler | The bar numbers above the note grid. | — | timeRuler |
| mediaTimeline | Media timeline | The "Media" row above the ruler. Keys work when it has the focus. | mediaTimeline | mediaTimeline |
| cutMarks | Cut marks | The red marks on the media timeline. Keys work on a focused edge of a mark. | cutEdge | cutMarks |
| waveform | Waveform and bar 1 marker | The audio track in the media panel. Keys work when the "1" marker has the focus. | barOneMarker | waveform |
| splitter | Media panel splitter | The bar between the editor and the media panel. Keys work when it has the focus. | splitter | splitter |
| mediaFiles | Media files | Only one media file is loaded at a time. | — | mediaFiles |
| contextMenu | Context menu | The menu of the media timeline. | contextMenu | — |
| numberFields | Number fields | Tempo, time signature, velocity and media offset. | numberField | — |
| infoWindow | This window | '' | infoDialog | — |

### 6. Вікно і кнопка
**`src/components/InfoButton.tsx` (новий)** — у `header` після `<ExportButton />`, перед `<BackendStatus />`:
```tsx
<button ref={buttonRef} type="button" className="info-button" aria-haspopup="dialog" aria-expanded={open}
  title="Keyboard shortcuts and mouse actions" onClick={() => setOpen(true)}>Info</button>
{open && <ShortcutsDialog onClose={close} />}
```
`close = () => { setOpen(false); buttonRef.current?.focus(); }` — фокус повертається на кнопку.

**`src/components/ShortcutsDialog.tsx` (новий) + `ShortcutsDialog.css`.** Власний модальний компонент через `createPortal(…, document.body)`, як `ContextMenu`. Нативний `<dialog>.showModal()` не беремо, бо jsdom 25 його не реалізує, а тестувати поведінку вікна потрібно в Vitest.
```tsx
<div className="shortcuts-dialog__backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
  <div ref={dialogRef} className="shortcuts-dialog" role="dialog" aria-modal="true" tabIndex={-1}
       aria-labelledby={titleId} aria-describedby={noteId} onKeyDown={handleKeyDown}>
    <div className="shortcuts-dialog__header">
      <h2 id={titleId}>Keyboard shortcuts and mouse actions</h2>
      <button ref={closeRef} type="button" onClick={onClose}>Close</button>
    </div>
    <p id={noteId} className="shortcuts-dialog__note">{HELP_NOTE}</p>
    <div ref={bodyRef} className="shortcuts-dialog__body" role="region" aria-label="Shortcut list" tabIndex={0}>
      {sections.map((section) => (
        <section key={section.id} aria-labelledby={`${baseId}-${section.id}`}>
          <h3 id={`${baseId}-${section.id}`}>{section.title}</h3>
          {section.where !== '' && <p className="shortcuts-dialog__where">{section.where}</p>}
          <table className="shortcuts-dialog__table"><tbody>
            {section.rows.map((row) => (
              <tr key={row.id} data-kind={row.kind}>
                <th scope="row">{/* key: <kbd> per input, joined by ", "; mouse: <span className="shortcuts-dialog__gesture"> */}</th>
                <td>{row.description}</td>
              </tr>))}
          </tbody></table>
        </section>))}
    </div>
  </div>
</div>
```
- `sections = useMemo(buildHelpSections, [])`; id через `useId()` (React 18).
- При монтуванні фокус на Close (`useEffect`).
- `handleKeyDown` → `handleShortcut('infoDialog', event, { close: onClose, focusNext, focusPrevious })`. Пастка фокусу циклічно переводить фокус між `[closeRef, bodyRef]`. Якщо фокус не на жодному з них (зокрема на самому корені діалогу), `focusNext` ставить його на перший елемент (Close), `focusPrevious` — на останній (регіон).
- **Фокус ніколи не залишає вікно (рішення до зауваження рев'ю 1).** Без додаткових заходів клік мишею по нефокусованій частині вікна (заголовок `h2`, примітка, відступи кореня) переводив би фокус на `document.body`. Тоді `isInsideModal(body) === false` (Space і Ctrl+Z знову діяли б), а Tab з `body` вів би на кнопки під тлом. Захист має два рівні:
  1. **Корінь фокусований:** `tabIndex={-1}` на `.shortcuts-dialog`. Браузер на mousedown фокусує найближчого фокусованого предка, тож клік по `h2`, примітці чи відступу фокусує корінь. Корінь лежить усередині `[aria-modal="true"]`, тож `isInsideModal` спрацьовує, а `onKeyDown` пастки отримує Tab. У Tab-порядок корінь не входить (`-1`). CSS: `.shortcuts-dialog:focus { outline: none }`.
  2. **Страховка на рівні документа:** поки вікно змонтоване, `useEffect` додає `document.addEventListener('focusin', guard)`. Якщо `event.target` не всередині `dialogRef.current`, `guard` повертає фокус на корінь (`dialogRef.current.focus()`). Так закривається будь-який інший шлях фокусу за вікно (програмний `focus()`, автофокус). При розмонтуванні слухач знімається, і фокус спокійно переходить на «Info».

  Альтернативу «перевіряти, чи є відкритий `[aria-modal="true"]` у документі» в `shortcutFor` не беремо: вона не вирішує втечі Tab за вікно і робить правило залежним від глобального стану DOM, а не від цілі події.
- Тло (`backdrop`) перекриває сторінку, тож мишею за межами вікна нічого не натиснеш. Клік по тлу закриває вікно.
- CSS:
  - `__backdrop { position: fixed; inset: 0; z-index: 200; background: rgb(0 0 0 / 45%); display: flex; align-items: center; justify-content: center; padding: 16px; box-sizing: border-box }`. 200 — вище за `.context-menu` (`z-index: 100` в `App.css`);
  - `.shortcuts-dialog { display: flex; flex-direction: column; width: min(760px, 100%); max-height: 100%; background: var(--panel); border: 1px solid var(--border); border-radius: 6px; min-width: 0 }`;
  - `__body { overflow-y: auto; overflow-x: hidden; min-height: 0 }`;
  - таблиця `width: 100%; table-layout: fixed`, перша колонка `width: 40%`, `overflow-wrap: anywhere`. Так у вузькому вікні немає горизонтальної прокрутки;
  - `kbd` — рамка й моноширинний шрифт.

## Кроки реалізації
1. Від актуального `main`: `git switch -c feature/018-info-shortcuts`.
2. **Реєстр клавіш.**
   - Створити `utils/keyChord.ts` (з `KeyLike`, перенесеним із `shortcuts.ts`), `utils/keyTargets.ts` (перенести `isTextEntryTarget`, `isActivationTarget` і константи; додати `isInsideModal`), `utils/keyActions.ts`, `utils/shortcutRegistry.ts` з таблицею з розділу 1.
   - Описи з кроками імпортують константи з `mediaTimeline.ts`, `mediaCuts.ts`, `mediaOffset.ts`, `mediaPanelWidth.ts`.
   - `shortcuts.ts` перетворити на фасад (розділ 1), прибрати `editorShortcutFor`, `EditorShortcutId`, `PLAIN_KEYS`, `SHIFT_KEYS`.
   - Тести: `keyChord.test.ts`, `keyTargets.test.ts`, `keyActions.test.ts`, `shortcutRegistry.test.ts` (з перенесеним блоком `editorShortcutFor`), `utils/testing/keyUniverse.ts`.
   - Перевірки зелені. Коміт `refactor: describe keyboard shortcuts in one registry`.
3. **Клавіші редактора через реєстр.** `NoteGrid`, `PedalLane`, `useDragGesture`, `ContextMenu`, `CommitNumberInput` → `handleShortcut`/`shortcutFor` (розділ 3). Наявні тести цих компонентів проходять без змін. Коміт `refactor: handle editor keys through the shortcut registry`.
4. **Клавіші медіа через реєстр.**
   - Перейменувати й змінити функції з розділу 2, оновити `MediaTimeline`, `MediaOffsetMarker`, `AppLayout`.
   - Видалити `SPLITTER_KEYS`/`SplitterKey`/`isSplitterKeyName`.
   - Оновити `mediaTimeline.test.ts`, `mediaOffset.test.ts`, `mediaCuts.test.ts`, `mediaPanelWidth.test.ts` за відповідністю з розділу «Тести → Змінені тести».
   - Перед комітом: `grep -rn "ctrlKey\|altKey\|metaKey\|shiftKey" frontend/src/components/MediaTimeline.test.tsx frontend/src/components/MediaOffsetControls.test.tsx frontend/src/components/AppLayout.test.tsx frontend/src/components/ContextMenu.test.tsx frontend/src/components/CommitNumberInput.test.tsx`. Допустимі збіги — лише `shiftKey` зі стрілками (великий крок зберігається). Якщо якийсь наявний тест покладається на дію `Delete`/`Backspace`/`Escape`/`Enter` чи стрілок з модифікатором, який прибирається (зміни 1–4), зупинитись і описати проблему. За аналізом таких тестів немає.
   - Коміт `refactor: handle media keys through the shortcut registry`.
5. **Класифікатори миші.** `utils/selection.ts` (+`ADDITIVE_MODIFIERS_LABEL`), `utils/mouseActions.ts`, перехід `useNoteDrag`, `usePedalDrag`, `NoteGrid`/`PedalLane.handleContextMenu` на класифікатори. Тест `mouseActions.test.ts`. Наявні тести сітки й педалей проходять без змін. Коміт `refactor: classify note grid and pedal lane mouse actions`.
6. **Контрактні тести клавіш.** `components/testing/keyContract.ts` і `components/keyContract.test.tsx` (розділ «Тести»). Коміт `test: check that the registry keys and only they are handled`.
7. **Вікно Info.**
   - `utils/helpSections.ts` + тест;
   - `ShortcutsDialog.tsx` + `.css` + тест;
   - `InfoButton.tsx` + тест;
   - підключення в `App.tsx`, доповнення `App.test.tsx`;
   - правило `isInsideModal` у `shortcutFor` для `global` (тести в `shortcutRegistry.test.ts`, `ShortcutsDialog.test.tsx`).
   - Коміт `feat: show keyboard shortcuts and mouse actions in an Info window`.
8. **E2E.** `frontend/e2e/info.spec.ts`. Коміт `test: check the Info window in the browser`.
9. **README.**
   - У розділі «Виділення, undo/redo і гарячі клавіші» перший абзац: повний список — кнопка **Info** у верхній панелі. Список будується з реєстру `frontend/src/utils/shortcutRegistry.ts` і каталогу `mouseActions.ts`, тож нову клавішу додають туди.
   - Таблицю лишити.
   - Додати абзац про всі п'ять змін поведінки з розділу 1:
     - стрілки/Home/End з Ctrl/⌘/Alt на смузі, межах і позначці;
     - `Delete`/`Backspace`/`Escape` лише без модифікаторів на смузі й межах;
     - меню;
     - `Enter`/`Escape` у числових полях лише без модифікаторів;
     - Undo/Redo/Play вимкнені, поки відкрито Info.
   - У підрозділах «Таймлайн медіа» і «Вирізання проміжків» README нічого про модифікатори не стверджує, тож їх не змінювати. Перевірити grep-ом `Shift+Delete\|Shift+Esc` у README: якщо такі формулювання є, виправити.
   - Коміт `docs: describe the Info window`.
10. Повні перевірки (backend, frontend, e2e), ручна перевірка.
11. У гілці (до злиття): CLAUDE.md — `[x]` для 2.9 «Кнопка Info», статус 018 у розділі 8 — «виконано», статус плану — `виконано`. Коміт `docs: mark task 018 as done`.
12. `git checkout main && git merge --no-ff feature/018-info-shortcuts`, повторні перевірки на `main`, `git push origin main feature/018-info-shortcuts`.

## Тести

### Backend
Не змінюється. Наявні тести проходять, `git diff main --stat -- backend` порожній.

### Frontend — unit (чисті функції)
**`utils/keyChord.test.ts` (новий):**
- `chordMatches({code:'KeyZ', mod:true}, …)`:
  - `true` для `{key:'z', code:'KeyZ', ctrlKey}`, для `metaKey` і для `key:'я'`;
  - `false` з `altKey`, без модифікатора, з `shiftKey`.
- `{key:'Home', shift:'any'}` → `true` для `Home` і `Shift+Home`, `false` для `Ctrl+Home` і `Alt+Home`.
- `{key:'Escape', mod:'any', shift:'any', alt:'any'}` → `true` для `Escape`, `Ctrl+Escape`, `Shift+Alt+Escape`; `false` для `Enter`.
- `{key:'ArrowUp', shift:true}` → `true` лише для `Shift+ArrowUp`.
- `formatChord`:
  - `{code:'KeyZ', mod:true, shift:true}` → `'Ctrl+Shift+Z'`; `{code:'Space'}` → `'Space'`;
  - `{key:'ArrowLeft'}` → `'←'`; `{key:'ArrowDown', shift:true}` → `'Shift+↓'`; `{key:'Escape'}` → `'Esc'`;
  - `{key:'Home', shift:'any'}` → `'Home'`; `{key:'Tab', shift:true}` → `'Shift+Tab'`; `{key:'Delete'}` → `'Delete'`; `{key:'Escape', mod:'any', shift:'any', alt:'any'}` → `'Esc'`.

**`utils/keyTargets.test.ts` (новий):** `isInsideModal`:
- кнопка всередині `<div role="dialog" aria-modal="true">` → `true`;
- кнопка в `<div role="dialog">` без `aria-modal` → `false`;
- `document.body` → `false`; `null` → `false`.

(Тести `isTextEntryTarget`/`isActivationTarget` лишаються в `shortcuts.test.ts` через фасад.)

**`utils/keyActions.test.ts` (новий):** `stepOf('stepBack')` → `{ sign: -1, big: false }`, `stepOf('stepForward')` → `{ 1, false }`, `stepOf('bigStepBack')` → `{ -1, true }`, `stepOf('bigStepForward')` → `{ 1, true }`.

**`utils/shortcutRegistry.test.ts` (новий).** Хелпер `key(partial)` як у `shortcuts.test.ts`.
- **noteGrid** — перенесений блок `editorShortcutFor` з тими самими очікуваннями (`Ctrl/⌘+A` за code, `ф`; Delete/Backspace/Escape/стрілки; `Shift+↑/↓`; `Ctrl+↑`, `Alt+↑`, `Shift+←`, `'constructor'` → `null`).
- **pedalLane**:
  - `Ctrl+A` → `selectAll`; `Delete`, `Backspace` → `delete`; `Escape` → `clearSelection`;
  - `ArrowUp`, `ArrowLeft` → `null` (педалі не зсуваються стрілками).
- **mediaTimeline**:
  - `ArrowLeft` → `stepBack`; `Shift+ArrowRight` → `bigStepForward`;
  - `Home`, `Shift+Home` → `toStart`; `End` → `toEnd`;
  - `Delete`, `Backspace` → `cutSelection`; `Escape` → `clearSelection`;
  - `'a'`, `Ctrl+ArrowLeft`, `Alt+ArrowLeft`, `Meta+ArrowRight` → `null`.
- **cutEdge**: `ArrowRight` → `stepForward`; `Shift+ArrowLeft` → `bigStepBack`; `Delete` → `removeCut`; `Home`, `'a'` → `null`.
- **barOneMarker**: як `mediaTimeline` для стрілок/Home/End; `Delete`, `Escape`, `'a'` → `null`.
- **splitter**:
  - `ArrowLeft` → `widen`, `Shift+ArrowLeft` → `widenMore`, `ArrowRight` → `narrow`, `Shift+ArrowRight` → `narrowMore`, `Home` → `narrowest`, `End` → `widest`;
  - `ArrowUp`, `ArrowDown`, `'a'`, `Enter`, `Tab` → `null`; `ArrowLeft` з `ctrlKey`/`metaKey`/`altKey` → `null` (перенесено з `mediaPanelWidth.test.ts`).
- **contextMenu**: `ArrowDown` → `next`, `ArrowUp` → `previous`, `Home` → `first`, `End` → `last`, `Escape` → `close`, `Shift+ArrowDown` → `null`.
- **numberField**: `Enter` → `apply`, `Escape` → `revert`, `Tab` → `null`; `Ctrl+Enter`, `Shift+Enter`, `Shift+Escape` → `null` (зміна 4).
- **mediaTimeline/cutEdge, зміна 2**: `Shift+Delete`, `Ctrl+Backspace`, `Shift+Escape` → `null` для `mediaTimeline`; `Shift+Delete` → `null` для `cutEdge`.
- **dragGesture**: `Escape`, `Shift+Escape`, `Ctrl+Escape` → `cancel`; `Enter` → `null`.
- **infoDialog**: `Escape` → `close`, `Tab` → `focusNext`, `Shift+Tab` → `focusPrevious`.
- **global і модальне вікно**:
  - ціль — кнопка всередині `aria-modal="true"`: `Ctrl+Z`, `Ctrl+Y`, `Space` → `null`, `Ctrl+S` → `export`;
  - кнопка в `role="dialog"` без `aria-modal` → як зараз (`Ctrl+Z` → `undo`).
- **Структура реєстру:**
  - у кожної дії кожної області ≥ 1 сполучення і непорожній опис;
  - **немає конфліктів:** для кожної області й кожної події з `KEY_UNIVERSE` збігається не більше однієї дії (без урахування `target`);
  - **елементи не перекривають сторінку:** жодна подія з `KEY_UNIVERSE`, яку розпізнає `global` (без `target`), не розпізнається іншою областю;
  - `KEY_UNIVERSE` містить подію `chordEvent(chord)` для кожного сполучення реєстру (інакше негативна перевірка контракту була б неповною).
- **`handleShortcut`** (фейкова подія з `preventDefault = vi.fn()`):
  - збіг, обробник повертає `undefined` → `preventDefault` один раз, результат `true`, обробник отримав дію;
  - обробник повертає `false` → без `preventDefault`, результат `false`;
  - немає збігу → обробник не викликано, `false`.
- `shortcutHint('global', 'redo') === 'Ctrl+Shift+Z'`; `shortcutHint('splitter', 'narrowest') === 'Home'`.
- Описи беруть числа з констант: опис `mediaTimeline.stepBack` містить `0.1 s`, `cutEdge.bigStepForward` — `100 ms`, `splitter.widenMore` — `64 px`.

**`utils/testing/keyUniverse.ts` (тестовий помічник, без власного тесту, перевіряється через тест вище):**
- `KEY_UNIVERSE: readonly KeyLike[]` — клавіші × набори модифікаторів, `repeat: false`:
  - клавіші: `a`–`z` (`code` `KeyA`…), `0`–`9` (`Digit0`…), Space (`' '`/`Space`), `ArrowLeft/Right/Up/Down`, `Home`, `End`, `PageUp`, `PageDown`, `Delete`, `Backspace`, `Escape`, `Enter`, `Tab`, `Insert`, `F1`, `F5`, `ContextMenu`, `?`, `/`, `+`, `-`;
  - модифікатори: `{}`, Shift, Ctrl, Meta, Alt, Ctrl+Shift, Meta+Shift, Ctrl+Alt, Shift+Alt.
- `chordEvent(chord): KeyLike` — подія, що відповідає сполученню (для `code` → `key` з таблиці `KeyZ`→`z`, `Space`→`' '`; для `key` → `code = key`; модифікатор `'any'` → `false`).

**`utils/mouseActions.test.ts` (новий):**
- `noteGridMouseAction` — повна таблиця 2×2×3:
  - `('left', false, null)` → `createNote`; `('left', true, null)` → `selectRect`;
  - `('left', false, 'body')` → `moveNotes`; `('left', false, 'resize')` → `resizeNotes`;
  - `('left', true, 'body'|'resize')` → `toggleNote`;
  - `('right', *, null)` → `null`; `('right', *, 'body'|'resize')` → `deleteNote`.
- `pedalLaneMouseAction` — таблиця 2×2×4:
  - `('left', false, null)` → `createPedal`; `('left', true, null)` → `null`;
  - `body`/`start`/`end` без additive → `movePedal`/`resizePedalStart`/`resizePedalEnd`; з additive → `togglePedal`;
  - `('right', *, hit)` → `deletePedal`; `('right', *, null)` → `null`.
- **Контракт класифікаторів:** множина всіх ненульових результатів по всіх входах дорівнює множині id з `MOUSE_ACTIONS` для `area` `noteGrid` (відповідно `pedalLane`).
- **Склад каталогу:** id по областях дорівнюють явному списку з таблиці розділу 4 (26 дій). id унікальні, `description` і `on` непорожні.
- `gestureLabel`: `{gesture:'click', additive:true}` → `'Shift/Ctrl/⌘+click'`; `'drag'` + additive → `'Shift/Ctrl/⌘+drag'`; `'rightClick'` → `'Right-click'`; `'doubleClick'` → `'Double-click'`; `'pressHold'` → `'Press and hold'`; `'drop'` → `'Drop'`. `mouseActionLabel(deleteNote)` → `'Right-click a note'`.

**`utils/helpSections.test.ts` (новий):**
- кожна `ShortcutScope` з `SHORTCUT_SCOPES` трапляється рівно в одному розділі; кожна `MouseArea` — рівно в одному;
- `buildHelpSections()`:
  - перший розділ `Whole page`. Рядки: `{inputs:['Ctrl+Z'], description:'Undo (not in text fields)'}`, `{inputs:['Ctrl+Shift+Z','Ctrl+Y'], description:'Redo (not in text fields)'}`, `Play / Pause (not in text fields, buttons, lists, checkboxes or sliders)` з `['Space']`, `Export .mid (works in text fields too)` з `['Ctrl+S']`;
  - `Note grid` містить `{kind:'key', inputs:['Delete','Backspace'], description:'Delete the selected notes'}` і `{kind:'mouse', inputs:['Right-click a note'], description:'Delete the note'}`, причому рядки клавіш ідуть перед рядками миші;
  - **нічого не загублено:** кількість рядків `key` = сумі дій усіх областей реєстру, рядків `mouse` = `MOUSE_ACTIONS.length` (26), id рядків унікальні.

### Змінені наявні тести (відповідність «було → стало», очікувані значення ті самі)
- `utils/shortcuts.test.ts`: блок `describe('editorShortcutFor')` (3 тести) переноситься в `shortcutRegistry.test.ts` з викликом `shortcutFor('noteGrid', …)`. Решта файлу без змін.
- `utils/mediaTimeline.test.ts`, блок `timelineSeekForKey` → `timelineSeekForAction`:
  - `(1,'ArrowRight',false,30)` → `(1,'stepForward',30)` = `1.1`; `(1,'ArrowLeft',true,30)` → `(1,'bigStepBack',30)` = `0`;
  - `(29.95,'ArrowRight',false,30)` → `(29.95,'stepForward',30)` = `30`;
  - `Home` → `toStart` = `0`; `End` → `toEnd` = `30`;
  - `(0,'ArrowRight',false,0)` → `(0,'stepForward',0)` = `null`; `(1.0000001,'ArrowRight')` → `stepForward` = `1.1`;
  - `(5,'a')` → `shortcutFor('mediaTimeline', 'a') === null` у `shortcutRegistry.test.ts`.
- `utils/mediaOffset.test.ts`, блок `offsetForKey` → `offsetForAction`:
  - `(3.2,'stepForward',30)` = `3.21`; `(3.2,'bigStepBack',30)` = `3.1`;
  - `(0.005,'stepBack',30)` = `0`; `(29.995,'stepForward',30)` = `30`;
  - `toStart` = `0`; `toEnd` = `30`;
  - `'a'` → тест реєстру `barOneMarker`.
- `utils/mediaCuts.test.ts`, блок `cutEdgeForKey` → `cutEdgeForAction`:
  - `(5,'stepForward',L)` = `5.01`; `(5,'bigStepBack',L)` = `4.9`;
  - межі `(2.01,'stepBack')` = `2.01`, `(29.95,'bigStepForward')` = `30`;
  - `'a'` → тест реєстру `cutEdge`.
- `utils/mediaPanelWidth.test.ts`:
  - `keyboardMediaPanelWidth` → `splitterWidthForAction`: `widen` → 376, `narrow` → 344, `widenMore` → 424, `narrowMore` → 296, `narrowest` → 240, `widest` → 960; `widest` при 1024 → 544; межі 960/240;
  - «ignores …» і «ignores ArrowLeft with modifiers» → тести реєстру `splitter`;
  - блок `SPLITTER_KEYS` → тести реєстру `splitter` і контракт `splitter` у `keyContract.test.tsx` (він перевіряє саме «matches the keys the handler reacts to», тепер на рівні компонента).

### Frontend — контракт «реєстр ⇔ обробники» (`components/keyContract.test.tsx`, новий)
**Помічник `components/testing/keyContract.ts`:**
```ts
/**
 * For a scope: (1) every KEY_UNIVERSE event that the scope does not bind leaves the default
 * action alone (fireEvent.keyDown returns true) — nothing outside the registry is handled;
 * (2) every chord of every action, fired on a fresh setup, is handled (returns false).
 */
export async function expectKeyContract(
  scope: ShortcutScope,
  setup: () => EventTarget,
  /** Awaited after a handled chord, before cleanup(): lets async effects finish (no act() warnings). */
  settle?: (chord: KeyChord) => Promise<void>,
): Promise<void>;
```
- Для `global` `settle` чекає завершення асинхронного `togglePlay`: після `Space` — `await screen.findByRole('button', { name: 'Pause' })` (`FakePianoEngine` завантажується через проміс). Для інших сполучень `global` і інших областей `settle` не потрібен. Тест не має виводити попереджень `act(...)`: це перевіряється спостереженням виводу `npm test`, а за потреби — `vi.spyOn(console, 'error')` з `expect(...).not.toHaveBeenCalled()` у цьому файлі.
- Для (1) — один `setup()` на область. Для (2) — свіжий `setup()` на кожне сполучення, `cleanup()` між ними.
- Повідомлення про помилку містить `formatChord`/опис події.
- `setup` рендерить компонент **у стані, де діє кожна дія області**, і **без** `KeyboardShortcuts`/`ExportButton` (крім області `global`), щоб глобальний слухач не підміняв результат.

**Файл тестів.** `const SETUPS: { readonly [S in ShortcutScope]: () => EventTarget } = { … }` — вичерпний тип, тож нова область без контрактного тесту не компілюється. Далі `for (const scope of SHORTCUT_SCOPES) it(scope, () => expectKeyContract(scope, SETUPS[scope], SETTLES[scope]))`, де `SETTLES: Partial<Record<ShortcutScope, …>>` має лише `global`.

| scope | setup (повертає ціль подій) |
|---|---|
| global | `renderWithProviders(<><KeyboardShortcuts /><TransportControls /><ExportButton /></>)` з `fetch`, що ніколи не завершується (`new Promise(() => {})`), `stubAnimationFrames`; ціль `document.body` |
| noteGrid | `renderWithProviders(<PianoRoll />, [n1, n2], { selectedNoteIds: ['n1', 'n2'] })` — сигнатура `(ui, notes, editor?, pedals?, options?)` з `PianoRoll/testUtils.tsx`, виділення задається через `editor`, без кліків і незавершених жестів; ціль — сітка (`getByRole('application', { name: 'Note grid' })`) |
| pedalLane | `renderWithProviders(<PianoRoll />, [], { selectedPedalIds: ['p1', 'p2'] }, [p1, p2])`; ціль — доріжка `Pedal lane` |
| dragGesture | `renderWithProviders(<PianoRoll />)`, `mouseDown` (ліва кнопка) у порожньому місці сітки — жест створення активний; ціль `window` |
| mediaTimeline | дерево провайдерів як у `MediaTimeline.test.tsx` (`setup`), але **без** `KeyboardShortcuts`; аудіо 30 с `ready`, виділення 5→8 с (mouseDown/mouseMove на `window`/mouseUp); ціль — слайдер `Media position` |
| cutEdge | те саме з `mediaCuts [{c,5,8}]`; ціль — `End of cut 1` |
| barOneMarker | провайдери + `AudioTrack overlay={<MediaOffsetMarker />}`, аудіо 30 с `ready`, offset 3; ціль — слайдер `Bar 1 position in the media` |
| splitter | `<AppLayout header editor media storage={null} />`; ціль — `separator` `Resize media panel` |
| contextMenu | `<ContextMenu x={10} y={10} label="Menu" items={[a, b]} onClose={vi.fn()} />`; ціль — перший `menuitem` |
| numberField | `<CommitNumberInput value={120} label="Tempo" onCommit={vi.fn()} />`; ціль — поле |
| infoDialog | `<ShortcutsDialog onClose={vi.fn()} />`; ціль — кнопка Close |

Цей тест і є перевіркою з постановки: **кожна клавіша з реєстру справді обробляється** (частина 2) і **навпаки** — обробники не реагують на жодну клавішу поза реєстром (частина 1). Компіляція додатково гарантує обробник для кожної дії (`ShortcutHandlers`) і контрактний setup для кожної області (`SETUPS`).

### Frontend — компоненти
**`components/ShortcutsDialog.test.tsx` (новий):**
- рендер → є `getByRole('dialog', { name: 'Keyboard shortcuts and mouse actions' })` з `aria-modal="true"` і `aria-describedby`, що вказує на текст `HELP_NOTE`;
- `getByRole('button', { name: 'Close' })` у фокусі одразу після монтування;
- заголовки рівня 3 — рівно `HELP_SECTION_SPECS.map(s => s.title)` у тому самому порядку; кількість `tbody tr` = сумі рядків `buildHelpSections()`;
- рядок з `Ctrl+Shift+Z` має дві `kbd` (`Ctrl+Shift+Z`, `Ctrl+Y`) і текст `Redo (not in text fields)`; рядок `Right-click a note` не має `kbd`, має `.shortcuts-dialog__gesture`;
- `keyDown Escape` на Close → `onClose` один раз, `fireEvent` повертає `false`;
- клік Close → `onClose`;
- `mouseDown` на тлі (`.shortcuts-dialog__backdrop`) → `onClose`; `mouseDown` на заголовку всередині вікна → ні;
- пастка фокусу: `Tab` з Close → фокус на регіоні `Shortcut list`; ще `Tab` → Close; `Shift+Tab` з Close → регіон;
- **корінь діалогу:** має `tabIndex="-1"`. `dialog.focus()`, потім `Tab` на корені → фокус на Close, `fireEvent` повертає `false`. `dialog.focus()`, потім `Shift+Tab` → фокус на регіоні;
- **страховка `focusin`:** поза діалогом рендериться `<button>outside</button>`. `outside.focus()`, поки вікно відкрите → `document.activeElement` — корінь діалогу. Після розмонтування `outside.focus()` → фокус на `outside` (слухач знято);
- **клавіші з фокусом на корені:** разом з `KeyboardShortcuts`/`TransportControls`/`add` (див. нижче) `dialog.focus()`, `Ctrl+Z` на корені → нота лишається; `Space` на корені → кнопка `Play` лишається `Play`;
- **сторінкові клавіші вимкнені всередині:** разом з `KeyboardShortcuts`, `TransportControls` і кнопкою `add` (як у `KeyboardShortcuts.test.tsx`) у `renderWithProviders`: додати ноту, відкрити вікно, `Ctrl+Z` на Close → нота лишається, `fireEvent` повертає `true`; `Space` на регіоні → кнопка `Play` лишається `Play`.

**`components/InfoButton.test.tsx` (новий):**
- кнопка `Info` з `aria-haspopup="dialog"`, `aria-expanded="false"`, діалогу немає;
- клік → діалог є, `aria-expanded="true"`;
- `Escape` → діалогу немає, фокус на `Info`, `aria-expanded="false"`;
- відкрити, клік Close → те саме.

**`App.test.tsx` (доповнення):** у банері `Transport` є кнопка `Info`; клік → діалог із заголовком `Whole page`; кнопка Close закриває.

### E2E — `frontend/e2e/info.spec.ts` (новий)
Помічники `openApp`, `createThreeNotes`, `notes`, `clickGrid`, `C4` (`e2e/helpers.ts`), `expectNoHorizontalOverflow` (`e2e/media.ts`). `dialog = page.getByRole('dialog', { name: 'Keyboard shortcuts and mouse actions' })`.
1. **Відкрити й закрити.** Клік `Info` → `dialog` видно, Close у фокусі, `Info` має `aria-expanded="true"`. Видно заголовки `Whole page`, `Note grid`, `Pedal lane`, `While dragging`, `Media timeline`, `Cut marks`, `Media panel splitter`, `This window`. Рядки (`dialog.locator('tr', { hasText })`):
   - `Ctrl+Shift+Z` містить `Ctrl+Y` і `Redo`;
   - `Shift+↑` містить `octave up`;
   - `Right-click a note` містить `Delete the note`;
   - `Double-click the splitter` містить `Reset the width`.

   `Escape` → `dialog` `toHaveCount(0)`, `Info` у фокусі.
2. **Сторінкові клавіші вимкнені, поки вікно відкрите.** `createThreeNotes`, відкрити Info. `ControlOrMeta+z` → нот 3. `Tab` → фокус на регіоні `Shortcut list`; `Space` → кнопка `Play` лишається (`getByRole('button', { name: 'Play' })` видно). `Tab` → Close у фокусі (пастка). Клік по тлу в точці `(5, 5)` → вікно закрите. `ControlOrMeta+z` → нот 2.
3. **Клік по нефокусованій частині вікна не випускає фокус (зауваження рев'ю 1).** `createThreeNotes`, відкрити Info. Клік мишею по заголовку `h2` (`dialog.getByRole('heading', { level: 2 })`), потім:
   - `await expect(dialog).toBeFocused()` — фокус на корені, а не на `body`;
   - `Space` → кнопка `Play` лишається (відтворення не стартувало);
   - `ControlOrMeta+z` → нот 3;
   - `Tab` → `expect(dialog.locator(':focus')).toHaveCount(1)` (фокус на Close, усередині вікна). Ще раз `Tab` і `Shift+Tab` → `:focus` усередині вікна;
   - те саме після кліку по примітці `HELP_NOTE` (`dialog.getByText('On macOS use ⌘')`).

   Esc → вікно закрите, `ControlOrMeta+z` → нот 2.
4. **Список відповідає поведінці.** Відкрити Info. Текст першої клітинки рядка `Select all notes` у розділі `Note grid` — `Ctrl+A`. Закрити, `createThreeNotes`, клік по ноті C4, `ControlOrMeta+a` → видно `3 notes selected`.
5. **Вміщується в мале вікно.** `page.setViewportSize({ width: 900, height: 500 })`, відкрити Info:
   - `boundingBox` вікна в межах `[0, 900] × [0, 500]`;
   - у регіону `Shortcut list` `scrollHeight > clientHeight` (прокручується);
   - `expectNoHorizontalOverflow(page)`;
   - клік Close → закрито.

### Ручна перевірка (`cd backend && uv run uvicorn app.main:app`, `cd frontend && npm run dev`)
1. У верхній панелі є кнопка «Info»; клік відкриває вікно поверх сторінки з затемненням, фокус на «Close».
2. Розділи йдуть у порядку з плану, кожен рядок читається, у вузькому вікні (≈ 800 px) немає горизонтальної прокрутки, список прокручується колесом і з клавіатури (Tab на список, стрілки/PageDown).
3. Esc, «Close» і клік по тлу закривають вікно, фокус повертається на «Info». Tab/Shift+Tab не виводять фокус за межі вікна, зокрема після кліку мишею по заголовку, примітці чи порожньому місцю вікна: після такого кліку Space не запускає відтворення, Ctrl+Z нічого не скасовує, а обведення фокусу на корені не видно.
4. Поки вікно відкрите: Ctrl+Z нічого не скасовує, Space не запускає відтворення; Ctrl+S експортує (діалог браузера «Зберегти сторінку» не з'являється).
5. Вибірково перевірити рядки з вікна в редакторі: Ctrl+A, ←/→/↑/↓, Shift+↑ на сітці; Delete на доріжці педалей; ←/Shift+←/Home/End на смузі медіа; Delete на смузі з виділенням; стрілки й Delete на межі розрізу; стрілки на позначці «1»; Home/End на роздільнику; Esc під час перетягування; ↑/↓/Esc у контекстному меню; Enter/Esc у полі темпу. Усе поводиться як описано.
6. Зміни поведінки: Alt+← на смузі медіа у фокусі тепер повертає браузер «Назад» (не перемотує); Ctrl+→ на смузі не перемотує; Shift+Delete на смузі з виділенням не вирізає; Shift+Enter у полі темпу не застосовує значення (Enter застосовує). Esc скасовує рамку виділення із затиснутим Shift.
7. Консоль без помилок і попереджень React.

## Критерії готовності (Definition of Done)
- [ ] `cd frontend && npm test -- --run && npm run lint && npm run typecheck && npm run build && npx prettier --check .` — зелено.
- [ ] `cd backend && uv run pytest && uv run ruff check . && uv run ruff format --check . && uv run mypy app` — зелено; `git diff main --stat -- backend` порожній.
- [ ] `cd frontend && npm run e2e` — зелено, включно з 5 тестами `e2e/info.spec.ts`; наявні e2e не змінені (`git diff main --stat -- frontend/e2e` показує лише новий `info.spec.ts`).
- [ ] Усі тести з розділу «Тести» наявні й проходять. Є unit-тести для `chordMatches`, `formatChord`, `isInsideModal`, `shortcutFor` (усі 11 областей), `handleShortcut`, `shortcutHint`, `stepOf`, `timelineSeekForAction`, `offsetForAction`, `cutEdgeForAction`, `splitterWidthForAction`, `noteGridMouseAction`, `pedalLaneMouseAction`, `gestureLabel`, `mouseActionLabel`, `buildHelpSections`.
- [ ] Контракт: `components/keyContract.test.tsx` проходить для всіх `SHORTCUT_SCOPES`. Implementer перевіряє його чутливість вручну двома тимчасовими правками (без коміту) і згадує результат у звіті:
  - додати в реєстр `noteGrid` фіктивну дію з `{key:'F2'}` і обробник, що повертає `false`, → контракт `noteGrid` падає (частина 2);
  - додати в `MediaOffsetMarker.handleKeyDown` обробку `PageUp` повз реєстр → контракт `barOneMarker` падає (частина 1).
- [ ] Клавіші розпізнаються лише через реєстр:
  - `grep -rnE "\.(key|code) (===|!==)|switch \((event|e)\.key\)" frontend/src --include=*.ts --include=*.tsx | grep -v "\.test\.\|/testing/\|utils/keyChord.ts"` нічого не знаходить;
  - `grep -rn "timelineSeekForKey\|offsetForKey\|cutEdgeForKey\|keyboardMediaPanelWidth\|SPLITTER_KEYS\|editorShortcutFor" frontend/src` нічого не знаходить.
- [ ] `git diff main --stat -- frontend/package.json frontend/package-lock.json` порожній.
- [ ] Наявні тести не послаблено. `git diff main --numstat -- 'frontend/src/**/*.test.ts' 'frontend/src/**/*.test.tsx'` показує видалені рядки лише в `shortcuts.test.ts`, `mediaTimeline.test.ts`, `mediaOffset.test.ts`, `mediaCuts.test.ts`, `mediaPanelWidth.test.ts`, і лише в межах «Змінені наявні тести» (кожне видалене очікування має відповідник). Звіт implementer перелічує ці відповідності. Решта змінених тестових файлів (`App.test.tsx`) — лише додані рядки.
- [ ] README описує кнопку Info, джерело списку і зміни поведінки.
- [ ] Ручна перевірка (7 пунктів) пройдена.
- [ ] У гілці до злиття: CLAUDE.md `[x]` для 2.9 «Кнопка Info», статус 018 — «виконано», статус плану — `виконано`. Гілку злито в `main` (`--no-ff`) і запушено, на `main` перевірки (включно з e2e) зелені.

## Ризики / відкриті питання
- **Відкрите питання до власника (не блокує, прийнято дефолт): гаряча клавіша для Info.** Вимога каже про кнопку, тож клавіші немає. Якщо потрібна (`?` або `F1`), це одна дія в області `global` (`notInTextFieldsOrControls`) і обробник у `KeyboardShortcuts`: реєстр і контракт підхоплять її автоматично.
- **Відкрите питання (не блокує): зміни поведінки через строгі модифікатори** (розділ 1). Дефолт — одне правило для всіх областей: модифікатори мусять збігтися. Це прибирає перехоплення `Alt+←` («Назад» браузера) на смузі медіа, позначці такту 1 і межах розрізів. Якщо власник хоче лишити `Ctrl+стрілки` як синонім, досить додати сполучення в реєстр, і вікно його покаже.
- **Миша гарантована слабше, ніж клавіатура.** Для сітки нот і доріжки педалей рішення приймає класифікатор із каталогу (обидва напрямки перевіряє тест). Для решти областей каталог — єдиний опис, а склад зафіксовано явним списком у тесті. Повний автоматичний зв'язок для кожного жесту вимагав би класифікаторів для кожного hit-test (waveform належить wavesurfer.js), а це непропорційно до вимоги. Ризик розходження — лише при майбутніх змінах жестів, і тест складу каталогу змусить оновити каталог свідомо.
- **Обсяг рефакторингу.** Зачіпаються обробники в 10 файлах, але логіка дій не змінюється, змінюється лише розпізнавання клавіші. Наявні тести компонентів (`NoteGrid*`, `PedalLane*`, `MediaTimeline`, `MediaOffsetControls`, `AppLayout`, `ContextMenu`, `CommitNumberInput`, `KeyboardShortcuts`) лишаються без змін і ловлять регресії. Коміти розбиті так, щоб кожен проходив перевірки окремо. Ділити задачу на дві гілки немає сенсу: вікно без реєстру не виконує ключову вимогу, а реєстр без вікна нічого не дає користувачеві.
- **Класифікатори миші (крок 5)** — найменш обов'язкова частина обсягу. Якщо перехід `useNoteDrag`/`usePedalDrag` на класифікатори почне ламати наявні тести, допустиме відхилення: лишити каталог `MOUSE_ACTIONS`, класифікатори з їхніми unit-тестами і тест складу каталогу, але не переводити на них обробники. Це треба описати у звіті.
- **Власна модалка замість `<dialog>`.** Нативний `showModal()` дав би `inert` для решти сторінки безкоштовно, але jsdom 25 його не реалізує. Власна реалізація закриває потрібне: `role="dialog"`, `aria-modal`, фокусований корінь (`tabIndex={-1}`) і страховку `focusin`, щоб фокус не потрапив на `body` чи під тло, пастку Tab, тло, що перехоплює мишу, і вимкнення сторінкових клавіш через `isInsideModal`. jsdom не фокусує елементи на mousedown, тому клік по нефокусованій частині вікна перевіряє e2e (сценарій 3), а unit-тести — корінь і страховку. Екранні читачі з віртуальним курсором можуть вийти за межі вікна (сторінка не `inert`). Для цього застосунку це прийнятно, а за потреби `inert` можна додати пізніше.
- **Продуктивність контрактного тесту.** `KEY_UNIVERSE` ≈ 50 клавіш × 9 наборів модифікаторів ≈ 450 подій на область, плюс свіжий рендер на кожне сполучення (≈ 60 рендерів). `fireEvent` у jsdom займає частки мілісекунди, тож очікувано кілька секунд. Якщо файл триватиме понад 20 с, допустиме дрібне відхилення: зменшити набори модифікаторів до `{}`, Shift, Ctrl, Alt, Ctrl+Shift, з описом у звіті.
- **`fetch` в області `global`.** `Ctrl+S` запускає експорт. `fetch`, що ніколи не завершується, не дає асинхронних оновлень стану після тесту, а розмонтування скасовує запит (`AbortController` в `ExportButton`).

## Зміни після рев'ю (раунд 1)
Відповідь на вердикт раунду 1 (`018-info-shortcuts.review.md`).

**Блокуюче 1 — клік по нефокусованій частині вікна виводив фокус на `body`.**
- §6 «Вікно і кнопка»:
  - корінь `.shortcuts-dialog` отримує `tabIndex={-1}` і `:focus { outline: none }`. Клік по `h2`, примітці чи відступу фокусує корінь, тож `isInsideModal` спрацьовує, а пастка Tab отримує події;
  - `focusNext`/`focusPrevious` трактують фокус на корені як «поза списком»: Tab веде на Close, Shift+Tab — на регіон;
  - додано другий рівень захисту: слухач `focusin` на `document`, поки вікно змонтоване, повертає фокус на корінь, якщо той вийшов за межі вікна;
  - альтернативу з перевіркою «є відкритий `aria-modal` у документі» описано й відкинуто з причиною.
- Тести:
  - `ShortcutsDialog.test.tsx`: корінь має `tabIndex="-1"`; Tab і Shift+Tab з кореня; страховка `focusin` (фокус на кнопці поза вікном повертається на корінь, після розмонтування — ні); Ctrl+Z і Space з фокусом на корені не діють;
  - e2e, новий сценарій 3 в `info.spec.ts`: клік по заголовку → корінь у фокусі, Space не запускає відтворення, Ctrl+Z не змінює кількість нот, Tab/Shift+Tab лишають `:focus` усередині вікна; те саме після кліку по примітці. Тестів у файлі тепер 5, DoD оновлено.
- Ручна перевірка №3 і ризик «Власна модалка» доповнено.

**Рекомендації:**
- **Перелік змін поведінки** (розділ 1) доповнено:
  - зміна 2: `Delete`/`Backspace`/`Escape` з будь-якими модифікаторами на смузі медіа й межі розрізу;
  - зміна 4: `Ctrl/⌘/Shift+Enter` і `Shift+Escape` у `CommitNumberInput`.

  Під них додано тести реєстру. Крок 9 (README) тепер перелічує всі п'ять змін. Grep у кроці 4 розширено на `shiftKey` і на тести `ContextMenu` та `CommitNumberInput`. Ручна перевірка №6 доповнена.
- **Сигнатура `renderWithProviders`:** setup-и `noteGrid`, `pedalLane` і `dragGesture` використовують реальну сигнатуру `(ui, notes, editor?, pedals?, options?)`, а виділення задається через `editor` (`selectedNoteIds`/`selectedPedalIds`), без кліків.
- **Типізація `handleShortcut`:** прямо дозволено одне вузьке приведення обробника (і одне — для `Object.entries` у `shortcutFor`), без `any` і з коментарем.
- **Класифікатори миші:** у «Ризики» додано допустиме відхилення — лишити каталог і класифікатори з тестами без переведення обробників, якщо перехід ламає наявні тести.
- **Контракт `global`:** `expectKeyContract` став асинхронним і має параметр `settle`. Для `Space` він чекає `findByRole('button', { name: 'Pause' })` перед `cleanup()`, щоб не було попереджень `act(...)`.
- **Блокування Undo/Redo під час перетягування** згадано в описі розділу довідки `dragging` («While dragging»).
