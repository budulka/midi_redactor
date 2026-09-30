# 014 — Змінний розмір правої медіапанелі

**Статус:** виконано
**Гілка:** feature/014-resizable-media-panel

## Мета
Закрити пункт розділу 2.8 CLAUDE.md **«Змінний розмір панелі»** (після виконання ставимо `[x]`):
- ширину правої панелі з відео й аудіодоріжкою (`aside.app__media`) змінюють перетягуванням роздільника між нею і piano roll;
- ширина обмежена мінімумом і максимумом;
- вибрана ширина зберігається в `localStorage` і відновлюється після перезавантаження сторінки.

Додатково, бо без цього роздільник був би недоступний і незручний:
- **доступність:** роздільник фокусується клавішею Tab і керується з клавіатури (стрілки, Home/End). Розмітка відповідає патерну WAI-ARIA «Window Splitter»: `role="separator"`, `aria-orientation`, `aria-valuenow/min/max`, `aria-controls`;
- подвійний клік по роздільнику повертає типову ширину 360 px;
- зміна ширини не ламає результатів 011 і 012: відео вписується в панель (`object-fit: contain`) без горизонтальної прокрутки сторінки, waveform (аудіофайлу і звуку відео) перемальовується на нову ширину, piano roll займає решту місця й коректно працює (клік по сітці, прокрутка, playhead).

Інші пункти 2.8 лишаються `[ ]`.

## Поза межами задачі
- **015:** offset медіа. **016:** таймлайн над piano roll (повзунок «Seek video» лишається в панелі), вирізання проміжків. **018:** кнопка Info (див. «Ризики» про клавіші роздільника).
- Згортання панелі до нуля (клавіша Enter у патерні WAI-ARIA необов'язкова), зміна висоти секцій «Video» / «Audio track» всередині панелі, перенесення панелі ліворуч.
- Жести на сенсорних екранах. Роздільник працює з мишею (як і решта редактора, що побудований на `mouse*`-подіях) і з клавіатурою.
- Синхронізація ширини між відкритими вкладками (подія `storage`). Кожна вкладка читає значення під час завантаження, а останнє збережене значення перемагає.
- Збереження ширини в проекті або на backend. Це налаштування інтерфейсу, а не частина `Project`, тому backend і модель даних не змінюються.
- Вікна вужчі за 1024 px: як і в 011, гарантуємо відсутність горизонтальної прокрутки сторінки для вікон від 1024 px.

## Технічні рішення

### Поточний стан (що вже є)
- `frontend/src/App.css`, `.app`: `grid-template-columns: minmax(0, 1fr) 360px`, області `'transport transport' 'editor media'`. Після 011 кожен рівень вкладеності медіапанелі має нульовий мінімум, тож верстка працює за будь-якої ширини колонки. Це перевіряє e2e-сценарій 5 у `e2e/video-fit.spec.ts` (ширина задається inline-стилем `gridTemplateColumns`).
- `App.tsx` рендерить `div.app` з `header.app__transport`, `main.app__editor` і `aside.app__media` прямо всередині provider'ів. `App` не має власного стану й після монтування не перерендерюється.
- **Piano roll не обчислює своєї ширини в JS.** `.app__editor` має `min-width: 0`, `.piano-roll__scroll` — `overflow: auto`, `.note-grid` і `.pedal-lane` — `min-width: 100%`. Єдине місце, що читає ширину, — `Playhead` (`followScrollLeft(x, scrollLeft, clientWidth)`), і він читає `scroller.clientWidth` на кожному кадрі. Координати кліків (`NoteGrid`, `PedalLane`, `TimeRuler`) рахуються від `getBoundingClientRect()` у момент події. Отже, зміна ширини колонки `editor` автоматично й коректно перераховує piano roll, і нового коду для цього не треба. Задача це **перевіряє** тестами (e2e-сценарії 2 і 7).
- **WaveSurfer 8** сам перемальовує waveform після зміни розміру контейнера: `renderer.js` створює `ResizeObserver` на своєму контейнері й через 100 мс викликає `onContainerResize()`. Це стосується і `createWaveSurferPlayer` (аудіофайл), і `createWaveSurferView` (звук відео, 012). Нового коду не треба, перевіряє e2e-сценарій 5.
- `useDragGesture` (`src/components/PianoRoll/useDragGesture.ts`) уже реалізує один жест мишею: слухачі `mousemove`/`mouseup`/`keydown` на `window`, поріг `DRAG_THRESHOLD_PX = 3`, попередній перегляд (`preview`) у локальному стані, `commit` на `mouseup`, скасування клавішею Escape, прибирання слухачів на unmount. Роздільник використовує його повторно.

### Обмеження ширини і клавіші — чисті функції `src/utils/mediaPanelWidth.ts` (новий)
```ts
export const MEDIA_PANEL_DEFAULT_WIDTH_PX = 360;
export const MEDIA_PANEL_MIN_WIDTH_PX = 240;
export const MEDIA_PANEL_MAX_WIDTH_PX = 960;
/** The editor column never gets narrower than this (keyboard + a usable part of the grid). */
export const EDITOR_MIN_WIDTH_PX = 480;
export const SPLITTER_WIDTH_PX = 6;
export const SPLITTER_KEY_STEP_PX = 16;
export const SPLITTER_LARGE_KEY_STEP_PX = 64;
export const MEDIA_PANEL_WIDTH_STORAGE_KEY = 'midiRedactor.mediaPanelWidth';

/** Largest panel width for a window: min(960, viewport − 480), never below 240. */
export function maxMediaPanelWidth(viewportWidth: number): number;

/** Rounds to whole pixels and clamps to [240, maxMediaPanelWidth(viewport)]; NaN → 360. */
export function clampMediaPanelWidth(width: number, viewportWidth: number): number;

/**
 * Width while dragging: the panel is on the right, so moving the splitter left widens it.
 * clampMediaPanelWidth(startWidth + (startX − x), viewportWidth).
 */
export function dragMediaPanelWidth(
  startWidth: number,
  startX: number,
  x: number,
  viewportWidth: number,
): number;

/**
 * Keys of the focused splitter; the single source for keyboardMediaPanelWidth and, later, for
 * the shortcut list of task 018.
 */
export const SPLITTER_KEYS: readonly {
  readonly key: 'ArrowLeft' | 'ArrowRight' | 'Home' | 'End';
  readonly description: string; // e.g. 'Widen the media panel by 16 px (Shift: 64 px)'
}[];

export interface SplitterKey {
  readonly key: string;
  readonly shiftKey: boolean;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly altKey: boolean;
}

/**
 * New width for a key on the focused splitter, or null when the key is not ours.
 * ArrowLeft → +16 (Shift: +64), ArrowRight → −16 (Shift: −64), Home → min, End → max.
 * Any key with Ctrl, ⌘ or Alt → null. The result is clamped.
 */
export function keyboardMediaPanelWidth(
  event: SplitterKey,
  width: number,
  viewportWidth: number,
): number | null;

/** A stored value: a finite positive number (rounded) or null. */
export function parseStoredMediaPanelWidth(raw: string | null): number | null;

export type WidthStorage = Pick<Storage, 'getItem' | 'setItem'>;
/** window.localStorage, or null when the browser refuses access (privacy mode, sandbox). */
export function browserStorage(): WidthStorage | null;
/** Stored width or null; never throws. */
export function loadMediaPanelWidth(storage: WidthStorage | null): number | null;
/** Stores the width as an integer string; storage errors (quota, privacy mode) are ignored. */
export function saveMediaPanelWidth(storage: WidthStorage | null, width: number): void;
```

Чому такі межі:
- **240 px** — найменша ширина, за якої панель інструментів відео й аудіо лишається читабельною (011 уже перевіряв 240 px).
- **960 px** — на вікні 1440 px редактору лишається 480 px. Більша панель на звичайних моніторах зробила б piano roll непридатним. На широких моніторах (2560 px) 960 px досить для відео.
- **Редактор ≥ 480 px** — на вузькому вікні максимум зменшується: для 1024 px це 544 px. Так роздільник не може «виштовхнути» редактор за межі вікна чи створити горизонтальну прокрутку сторінки.
- Напрям клавіш за WAI-ARIA: стрілка ліворуч рухає роздільник ліворуч, тобто **розширює** праву панель. `aria-valuenow` — ширина панелі в пікселях, тож Home/End дають мінімум/максимум панелі, на яку вказує `aria-controls`.

### Бажана і фактична ширина
- **Бажана ширина** (`preferred`) — те, що вибрав користувач і що лежить у `localStorage`.
- **Фактична ширина** = `clampMediaPanelWidth(preferred, viewportWidth)`. Якщо вікно звузилося, панель тимчасово вужча, але бажане значення не перезаписується. Коли вікно знову широке, панель повертається до вибраної ширини.
- Зберігається лише дія користувача: кінець перетягування (`mouseup` після порогу), клавіша, подвійний клік. Під час руху миші `localStorage` не пишеться. Зчитане зі сховища значення поза межами (наприклад, `2000`) не перезаписується, а лише обмежується на екрані.
- Нова дія користувача зберігає вже обмежене значення. Наприклад, на вікні 1024 px клавіша End збереже 544.

### Розмітка — `src/components/AppLayout.tsx` (новий) і `App.tsx`
```tsx
export interface AppLayoutProps {
  readonly header: ReactNode;
  readonly editor: ReactNode;
  readonly media: ReactNode;
  /** Where the width is kept; defaults to browserStorage(). Tests pass a fake. */
  readonly storage?: WidthStorage | null;
}
export default function AppLayout(props: AppLayoutProps): JSX.Element;
```
Рендерить:
```tsx
<div className={resizing ? 'app app--resizing' : 'app'} style={{ '--media-panel-width': `${width}px` } as CSSProperties}>
  <header className="app__transport" aria-label="Transport">{header}</header>
  <main className="app__editor" aria-label="MIDI editor">{editor}</main>
  <div
    className="app__splitter"
    role="separator"
    aria-orientation="vertical"
    aria-label="Resize media panel"
    aria-controls="media-panel"
    aria-valuenow={width}
    aria-valuemin={MEDIA_PANEL_MIN_WIDTH_PX}
    aria-valuemax={maxWidth}
    aria-valuetext={`${width} pixels`}
    tabIndex={0}
    title="Drag to resize the media panel, double-click to reset"
    onMouseDown={…} onKeyDown={…} onDoubleClick={…}
  />
  <aside id="media-panel" className="app__media" aria-label="Media">{media}</aside>
</div>
```
- Приведення `as CSSProperties` потрібне, бо тип React не знає кастомних властивостей. Це не `any`: `CSSProperties` імпортується з `react`.
- `header`/`main`/`aside` з тими ж класами й `aria-label`, що зараз. Наявні запити в `App.test.tsx` і e2e (`aside[aria-label="Media"]`, `section[aria-label="Video"]`) не змінюються.
- **`App.tsx`** передає вміст трьох областей як props: `header={<><h1 className="app__title">MIDI Redactor</h1><TempoControls />…<BackendStatus /></>}`, `editor={<PianoRoll />}`, `media={<><section className="app__video" aria-label="Video"><VideoPlayer /></section><section className="app__audio" aria-label="Audio track"><AudioTrack /></section></>}`. Порядок і склад елементів той самий.
- **Продуктивність перетягування.** Під час руху миші перерендерюється лише `AppLayout`. Елементи `header`/`editor`/`media` створені в `App`, який не перерендерюється, тому React отримує ті самі об'єкти елементів і не перерендерює `PianoRoll`, `VideoPlayer` і `AudioTrack`. Змінюється тільки CSS-змінна, а розкладку перераховує браузер. Це фіксує тест «does not re-render the areas while dragging» у `AppLayout.test.tsx`.

Стан і обробники всередині `AppLayout`:
- `const storage = props.storage === undefined ? browserStorage() : props.storage` (обчислюється один раз через `useState(() => …)`);
- `const [preferred, setPreferred] = useState(() => loadMediaPanelWidth(storage) ?? MEDIA_PANEL_DEFAULT_WIDTH_PX)`;
- `const viewportWidth = useViewportWidth()`;
- `const drag = useDragGesture<number>((event) => ({ x: event.clientX, y: event.clientY }))`;
- `const committed = clampMediaPanelWidth(preferred, viewportWidth)`; `const width = drag.preview ?? committed`; `const maxWidth = maxMediaPanelWidth(viewportWidth)`; `const resizing = drag.preview !== null`;
- `commit(next: number)`: `setPreferred(next)`, `saveMediaPanelWidth(storage, next)`;
- **`onMouseDown`**: лише `event.button === 0`, інакше нічого. `event.preventDefault()` (без виділення тексту), `focusFromPointer(event.currentTarget)` (фокус без кільця, як у сітці нот), `drag.begin({ startPoint: { x: event.clientX, y: event.clientY }, initialPreview: null, update: (p) => dragMediaPanelWidth(committed, event.clientX, p.x, viewportRef.current), commit: (result, moved) => { if (moved && result !== null) commit(result); } })`. `viewportRef` оновлюється в `useLayoutEffect`, як радить коментар `GestureSpec.update`. Escape під час перетягування скасовує жест (`useDragGesture`), і ширина повертається до `committed`;
- **`onKeyDown`**: `next = keyboardMediaPanelWidth(event, committed, viewportWidth)`; якщо `null`, подія не чіпається (Tab, Space тощо працюють як зазвичай). Інакше `event.preventDefault()` і `commit(next)`;
- **`onDoubleClick`**: `commit(clampMediaPanelWidth(MEDIA_PANEL_DEFAULT_WIDTH_PX, viewportWidth))`.

**`src/components/useViewportWidth.ts`** (новий): `useState(() => window.innerWidth)`, слухач `resize` на `window` у `useEffect` з прибиранням. Ширина вікна, а не `.app`, бо `.app` займає все вікно (`body { margin: 0 }`), а слухати `resize` простіше й надійніше за `ResizeObserver` на власному контейнері.

**Відкинуті альтернативи:**
| Варіант | Чому ні |
|---|---|
| Бібліотека (`react-resizable-panels`, `allotment`, `split.js`) | Нова залежність заради одного роздільника. Бібліотеки панелей керують усією розкладкою (flex замість нинішнього grid з областями й правилами 011), тож довелося б переписати верстку й тести 011 |
| Pointer Events з `setPointerCapture` | jsdom їх не реалізує, а решта редактора побудована на `mouse*` + слухачах на `window` (`useDragGesture`). Повторне використання дає Escape, поріг і прибирання слухачів без нового коду |
| Роздільник усередині `aside` (абсолютно позиціонований на лівому краї) | `aside.app__media` має `overflow: hidden` (011), тож роздільник обрізався б або його довелося б винести за межі, ламаючи правило «ніщо не вилазить». Окрема колонка grid простіша й не зачіпає правил 011 |
| Ширина у відсотках від вікна | Зміна розміру вікна тоді змінювала б і панель відео, хоча користувач вибирав саме розмір кадру. Пікселі + обмеження за вікном дають передбачувану поведінку |
| Писати `localStorage` на кожен `mousemove` | Зайві синхронні записи під час руху. Достатньо зберегти результат жесту |
| Зберігати ширину в `Project` / на backend | Це налаштування інтерфейсу конкретного браузера, а не частина аранжування. Модель даних з розділу 7 не змінюється |

### CSS (`frontend/src/App.css`)
Змінюються лише наведені властивості `.app`, решта правил (включно з усіма правилами 011) лишається:
```css
.app {
  grid-template-columns: minmax(0, 1fr) 6px var(--media-panel-width, 360px);
  grid-template-areas:
    'transport transport transport'
    'editor splitter media';
}

.app__splitter {
  grid-area: splitter;
  cursor: col-resize;
  background: var(--border); /* overrides `.app > *` */
  outline: none;
}

.app__splitter:hover,
.app__splitter:focus-visible:not([data-pointer-focus]),
.app--resizing .app__splitter {
  background: var(--note);
}

/* While dragging, the page keeps the resize cursor and nothing under the mouse reacts. */
.app--resizing {
  cursor: col-resize;
  user-select: none;
}

.app--resizing .app__editor,
.app--resizing .app__media {
  pointer-events: none;
}
```
- Колонка роздільника — 6 px (`SPLITTER_WIDTH_PX`), плюс два проміжки grid по 1 px, які вже є.
- `pointer-events: none` на областях під час жесту: `<video>`, waveform (WaveSurfer у shadow DOM), сітка нот і лінійка не отримують наведення й кліків, а курсор лишається `col-resize` над будь-якою областю. Події миші все одно доходять до `window`, де їх слухає `useDragGesture`.
- Фолбек `360px` у `var()` збігається з `MEDIA_PANEL_DEFAULT_WIDTH_PX`. Це перевіряє `appLayout.test.ts`.

### Що не змінюється
- `PianoRoll` і його підкомпоненти, `VideoPlayer`, `AudioTrack`, `VideoSoundWaveform`, адаптери WaveSurfer і `<video>`, `useDragGesture`, `useGlobalShortcuts`, `shortcuts.ts`, транспорт і синхронізація. Backend. Нових залежностей немає.
- Space на роздільнику, як і на сітці, перемикає Play/Pause (глобальна клавіша): у роздільника немає власної дії на Space, тож конфлікту немає.

## Кроки реалізації
1. Від актуального `main` створити гілку `feature/014-resizable-media-panel`.
2. `src/utils/mediaPanelWidth.ts` і `src/utils/mediaPanelWidth.test.ts` (розділ «Тести»). Коміт `feat: add pure rules for the media panel width`.
3. `src/components/useViewportWidth.ts` + `useViewportWidth.test.tsx`; `src/components/AppLayout.tsx` + `AppLayout.test.tsx`. Коміт `feat: add a layout with a resizable media panel`.
4. `App.tsx` переходить на `AppLayout` (вміст областей — props). Зміни CSS з розділу «CSS». Доповнення `App.test.tsx` і `appLayout.test.ts` (нові `it`, наявні не змінюються). Запустити `npm test -- --run` і `npm run e2e` (наявні e2e мають лишатися зеленими, крім сценарію 5 у `video-fit.spec.ts`, див. крок 5). Коміт `feat: resize the media panel with a splitter`.
5. `e2e/video-fit.spec.ts`, сценарій «the video fits a media panel of any width»: замість `app.style.gridTemplateColumns = …` (після зміни на три колонки це рядок з двома треками, що ламає області) ставити `app.style.setProperty('--media-panel-width', \`${w}px\`)`; ширини `[240, 360, 720, 960]`. Решта перевірок сценарію не змінюється. У `e2e/media.ts` новий помічник `splitter(page)` і `dragSplitterBy(page, dx)` (розділ «Тести»). Новий `e2e/media-panel-resize.spec.ts`. Коміт `test: check the resizable media panel in the browser`.
6. README: новий розділ «Медіапанель» перед розділом «Відео». Коміт `docs: describe the resizable media panel`.
   Зміст розділу: панель праворуч можна розширити або звузити, перетягнувши вертикальний роздільник між нею і piano roll; межі 240–960 px, а редактору завжди лишається щонайменше 480 px (на вузькому вікні максимум менший); подвійний клік повертає 360 px; з клавіатури: Tab до роздільника, `←`/`→` — крок 16 px (`Shift` — 64 px), `Home`/`End` — мінімум/максимум; Escape під час перетягування скасовує зміну; ширина запам'ятовується в браузері (`localStorage`) і відновлюється після перезавантаження, а тимчасово вузьке вікно не змінює збереженого значення.
7. Усі перевірки з DoD (включно з `npm run e2e`) і ручна перевірка в браузері.
8. У гілці до злиття: у CLAUDE.md `[x]` для 2.8 «Змінний розмір панелі» (інші пункти 2.8 лишаються як є), статус 014 у розділі 8 — «виконано», статус плану — `виконано`. Коміт `docs: mark task 014 as done`.
9. `git checkout main && git merge --no-ff feature/014-resizable-media-panel`, повторні перевірки на `main` (включно з e2e), `git push origin main` і гілки.

## Тести
Backend не змінюється, наявні тести мають і далі проходити.

### Unit — `src/utils/mediaPanelWidth.test.ts` (новий)
- `maxMediaPanelWidth`: `1440 → 960`, `1920 → 960`, `1024 → 544`, `600 → 240` (не менше мінімуму).
- `clampMediaPanelWidth`: `(500, 1440) → 500`; `(100, 1440) → 240`; `(2000, 1440) → 960`; `(800, 1024) → 544`; `(300, 600) → 240`; `(360.6, 1440) → 361`; `(NaN, 1440) → 360`.
- `dragMediaPanelWidth(360, 1000, x, 1440)`: `x = 900 → 460`; `x = 1100 → 260`; `x = 1200 → 240`; `x = 0 → 960`; `x = 1000 → 360`.
- `keyboardMediaPanelWidth` (ширина 360, вікно 1440, модифікатори `false`, якщо не сказано інше): `ArrowLeft → 376`; `ArrowRight → 344`; `ArrowLeft` + Shift → `424`; `ArrowRight` + Shift → `296`; `Home → 240`; `End → 960`; `End` при вікні 1024 → `544`; `ArrowLeft` при ширині 960 → `960`; `ArrowRight` при ширині 240 → `240`; `ArrowUp`, `ArrowDown`, `a`, `Enter`, `Tab` → `null`; `ArrowLeft` з `ctrlKey`, з `metaKey`, з `altKey` → `null`.
- `SPLITTER_KEYS` містить рівно `ArrowLeft`, `ArrowRight`, `Home`, `End` з непорожнім `description`; для кожного `key` з цього списку `keyboardMediaPanelWidth` повертає число, а не `null` (список і обробник не розходяться).
- `parseStoredMediaPanelWidth`: `'480' → 480`; `'480.4' → 480`; `null`, `''`, `'abc'`, `'0'`, `'-5'`, `'Infinity'`, `'NaN'` → `null`.
- `loadMediaPanelWidth`: сховище з `getItem → '500'` → `500`, `getItem` викликано з `'midiRedactor.mediaPanelWidth'`; `getItem → 'abc'` → `null`; `getItem` кидає `DOMException` → `null`; `storage = null` → `null`.
- `saveMediaPanelWidth(storage, 480)` → `setItem('midiRedactor.mediaPanelWidth', '480')`; `setItem` кидає (`QuotaExceededError`) → функція не кидає; `storage = null` → нічого не кидає.
- `browserStorage()`: у jsdom повертає `window.localStorage`; якщо геттер `window.localStorage` кидає (`vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => { throw new DOMException('denied', 'SecurityError'); })`) → `null`.

### Unit — `src/components/useViewportWidth.test.tsx` (новий)
- Проба з хуком показує `window.innerWidth` (jsdom: 1024).
- `window.innerWidth = 1440` (через `Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1440 })`), `act(() => window.dispatchEvent(new Event('resize')))` → проба показує `1440`.
- Після unmount `removeEventListener('resize', …)` викликано з тим самим обробником (`vi.spyOn(window, 'removeEventListener')`).
- `afterEach` повертає `innerWidth` = 1024.

### Компонентні — `src/components/AppLayout.test.tsx` (новий)
Рендер `<AppLayout header={<span>H</span>} editor={<Probe />} media={<section aria-label="Video" />} storage={storage} />`, де `storage = { getItem: vi.fn(() => stored), setItem: vi.fn() }`, `Probe` викликає `vi.fn()` `editorRenders` і рендерить `null`. `innerWidth` = 1024 (типове jsdom), якщо не сказано інше. `separator = getByRole('separator', { name: 'Resize media panel' })`, `app = container.querySelector('.app')`.
1. **Розмітка й ARIA.** Є `banner` «Transport», `main` «MIDI editor», `complementary` «Media» з `id="media-panel"`. У роздільника: `aria-orientation="vertical"`, `aria-controls="media-panel"`, `aria-valuenow="360"`, `aria-valuemin="240"`, `aria-valuemax="544"`, `aria-valuetext="360 pixels"`, `tabIndex === 0`. Роздільник стоїть у DOM між `main` і `aside`. `app.style.getPropertyValue('--media-panel-width') === '360px'`.
2. **Збережене значення.** `stored = '480'` → `aria-valuenow="480"`, CSS-змінна `480px`. `stored = 'abc'` → `360`. `stored = '2000'` → `544`, і `setItem` не викликано.
3. **Сховище недоступне.** `storage={null}` → `360`; клавіша `ArrowLeft` → `376`, нічого не кидає.
4. **Перетягування.** `fireEvent.mouseDown(separator, { button: 0, clientX: 700, clientY: 300 })`, `fireEvent.mouseMove(window, { clientX: 600, clientY: 300 })` → `aria-valuenow="460"`, CSS-змінна `460px`, `app` має клас `app--resizing`, `setItem` ще не викликано. `fireEvent.mouseUp(window, { clientX: 600, clientY: 300 })` → `460`, класу `app--resizing` немає, `setItem` викликано рівно раз з `('midiRedactor.mediaPanelWidth', '460')`. Роздільник у фокусі (`document.activeElement`) і має `data-pointer-focus="true"`.
5. **Межі під час перетягування.** Рух до `clientX: -1000` → `544` (максимум для 1024); рух до `clientX: 5000` → `240`.
6. **Рух менший за поріг.** `mouseDown` на 700, `mouseMove` на 702, `mouseUp` на 702 → `360`, `setItem` не викликано, класу `app--resizing` не було.
7. **Escape скасовує.** `mouseDown` 700 → `mouseMove` 600 (`460`) → `fireEvent.keyDown(window, { key: 'Escape' })` → `360`, класу немає; наступні `mouseMove`/`mouseUp` нічого не змінюють; `setItem` не викликано.
8. **Інша кнопка миші.** `mouseDown` з `button: 2`, `mouseMove` 600 → `360`.
9. **Клавіатура.** `ArrowLeft` → `376` і `setItem(…, '376')`; `fireEvent.keyDown` повертає `false` (подію скасовано). `ArrowRight` двічі → `344`. `Shift+ArrowLeft` → `408`. `Home` → `240`. `End` → `544`. `keyDown` з `a` повертає `true`, ширина й кількість викликів `setItem` не змінюються.
10. **Подвійний клік.** `stored = '500'`, `fireEvent.doubleClick(separator)` → `360`, `setItem(…, '360')`.
11. **Зміна розміру вікна.** `stored = '900'`, `innerWidth = 1440` до рендера → `900`, `aria-valuemax="960"`. `innerWidth = 1024` + подія `resize` → `544`, `aria-valuemax="544"`. `innerWidth = 1440` + `resize` → знову `900`. `setItem` жодного разу не викликано.
12. **Області не перерендерюються під час перетягування.** Після рендера `editorRenders` викликано 1 раз. Перетягування (`mouseDown` → три `mouseMove` → `mouseUp`) → `editorRenders` усе ще 1 раз.
13. **Unmount під час перетягування.** `mouseDown` → `unmount()` → `fireEvent.mouseMove(window, …)` і `mouseUp` не кидають і не викликають `setItem` (слухачі прибрано `useDragGesture`).

Якщо CSSStyleDeclaration у jsdom не збереже кастомну властивість (`getPropertyValue('--media-panel-width') === ''`), implementer перевіряє CSS-змінну через `app.getAttribute('style')` (містить `--media-panel-width: 360px`). Це дрібне відхилення зі звітом. Перевірки `aria-valuenow` лишаються основними.

### `src/App.test.tsx` (доповнення, наявні `it` не змінюються)
- «has a splitter that controls the media panel»: `getByRole('separator', { name: 'Resize media panel' })` має `aria-controls`, що дорівнює `id` елемента `complementary` «Media»; `aria-valuenow="360"`. На початку цього `it` викликається `localStorage.clear()`, щоб значення з інших тестів не впливало.

### `src/appLayout.test.ts` (доповнення, наявні `it` не змінюються)
Наявна перевірка `grid-template-columns` (`/^minmax\(0, 1fr\)/`) лишається чинною. Нові `it`:
- `.app` → `grid-template-columns` === `minmax(0, 1fr) 6px var(--media-panel-width, 360px)`; `grid-template-areas` містить `editor splitter media` (після нормалізації пробілів і лапок). Число `6` і `360` у рядку порівнюються з `SPLITTER_WIDTH_PX` і `MEDIA_PANEL_DEFAULT_WIDTH_PX` (імпорт з `utils/mediaPanelWidth.ts`), щоб CSS і константи не розійшлися.
- `.app__splitter` → `grid-area: splitter`, `cursor: col-resize`.
- `.app--resizing` → `cursor: col-resize`, `user-select: none`.
- `.app--resizing .app__editor` і `.app--resizing .app__media` → `pointer-events: none`.
- Правила 011 (`.app__media`, `.app__media > section`, `.video-player__*`) не змінюються — це перевіряють наявні `it`.
Якщо CSSOM jsdom відкине `var()` у `grid-template-columns` або `user-select`, діє запасний варіант із розбором тексту CSS, описаний у плані 011 (звіт).

### E2E — `frontend/e2e/media-panel-resize.spec.ts` (новий; Playwright, Chromium, 1440×900)
Помічники в `frontend/e2e/media.ts`:
- `splitter(page)` → `page.getByRole('separator', { name: 'Resize media panel' })`;
- `mediaPanelWidth(page)` → ширина `boundingBox()` `aside[aria-label="Media"]`;
- `dragSplitterBy(page, dx)` → центр `boundingBox()` роздільника, `dragBetween(page, from, { x: from.x + dx, y: from.y })` з `helpers.ts`;
- `editorScrollWidth(page)` → `clientWidth` `.piano-roll__scroll` через `evaluate`.

Кожен тест у Playwright має новий контекст браузера, тож `localStorage` порожній і інші spec-файли бачать типові 360 px. `beforeEach`: `openApp(page)`.
1. **Типовий стан.** Ширина панелі 360 (±1), `aria-valuenow="360"`, `expectNoHorizontalOverflow`.
2. **Перетягування змінює ширину, piano roll займає решту.** `w0 = editorScrollWidth`; `dragSplitterBy(page, -200)` → панель 560 (±1), `aria-valuenow="560"`, `editorScrollWidth` = `w0 − 200` (±2), `expectNoHorizontalOverflow`, `localStorage.getItem('midiRedactor.mediaPanelWidth') === '560'`.
3. **Збереження між перезавантаженнями.** Після сценарію 2: `page.reload()`, `openApp` → панель 560 (±1), `aria-valuenow="560"`.
4. **Межі.** `dragSplitterBy(page, +1000)` → 240; `dragSplitterBy(page, -2000)` → 960, ширина `main[aria-label="MIDI editor"]` ≥ 472 (480 мінус роздільник і проміжки), `expectNoHorizontalOverflow` в обох станах.
5. **Відео й waveform за будь-якої ширини (011, 012).** `loadVideo(page, 'with-sound.webm', recordTestVideo({ width: 3840, height: 240, durationMs: 2000, withSound: true }))`, дочекатися, поки зникнуть `Drawing the sound` і `No sound to show` (до 10 с, як у `single-media.spec.ts`). Для кожної дії (`Home` на роздільнику → 240, `End` → 960, подвійний клік → 360):
   - `expectNoHorizontalOverflow`, `expectVideoInsidePanel`;
   - ширина `[data-testid="video-waveform"]` дорівнює ширині `[data-testid="waveform"]` (±1), а та — ширині вмісту секції «Audio track» (ширина секції мінус 16 px відступів, ±1);
   - `expect.poll` (до 2 с): ширина `canvas` у shadow root WaveSurfer усередині `[data-testid="video-waveform"]` (обхід як у `mediaElements`) у CSS-пікселях відрізняється від ширини контейнера не більше ніж на 2 px, тобто waveform перемальовано під нову ширину.
   Якщо структура shadow DOM WaveSurfer не дає знайти `canvas`, implementer лишає перевірку ширини контейнерів і пише у звіт, що перемальовування перевірено вручну (пункт 5 ручної перевірки).
6. **Клавіатура.** `splitter.focus()`; `ArrowLeft` → `aria-valuenow="376"`, панель 376 (±1); `Shift+ArrowRight` → `312`; `Home` → `240`; `End` → `960`; `localStorage` містить `'960'`. Фокус лишається на роздільнику; `Tab` переводить фокус на перший фокусований елемент панелі (поле/кнопку «Load video…»), тобто роздільник у природному порядку Tab між редактором і панеллю.
7. **Piano roll після зміни ширини.** `dragSplitterBy(page, -300)`, потім `clickGrid(page, 1.02, C4)` → 1 нота (`notes(page)` має 1 елемент), її `boundingBox().x` ≈ `grid.x + 1.0 * PX_PER_SECOND` (±2). Прокрутити `.piano-roll__scroll` до кінця по горизонталі (`scrollLeft = scrollWidth`) → `scrollLeft + clientWidth === scrollWidth` (±1), `expectNoHorizontalOverflow`.
8. **Перетягування не редагує проект і не перемотує.** Жест від роздільника до точки над сіткою нот (`dx = -400`, відпустити над сіткою) → нот 0, `Playback position` починається з `0:00.000`.
9. **Зміна розміру вікна.** `End` → 960; `page.setViewportSize({ width: 1024, height: 768 })` → панель 544 (±1), `aria-valuemax="544"`, `expectNoHorizontalOverflow`; `page.setViewportSize({ width: 1440, height: 900 })` → знову 960; `localStorage` і далі `'960'`.

### E2E — `frontend/e2e/video-fit.spec.ts` (зміна одного сценарію)
- «the video fits a media panel of any width»: ширина задається `app.style.setProperty('--media-panel-width', \`${w}px\`)` замість `gridTemplateColumns`, ширини `[240, 360, 720, 960]`. Перевірки (`videoSectionWidth ≈ w`, `expectNoHorizontalOverflow`, `expectVideoInsidePanel`) не змінюються. Причина: `.app` тепер має три колонки, і старий рядок з двома треками зламав би області grid.
- Інші сценарії файлу не змінюються.

### Ручна перевірка в браузері
`cd frontend && npm run dev` (backend — `uv run uvicorn app.main:app`), http://localhost:5173, Chrome і Firefox, вікно 1440×900. Потрібні локальні файли: 16:9 mp4 зі звуком, вертикальне відео, mp3 (не комітяться).
1. Між piano roll і панеллю видно вузький роздільник; при наведенні він підсвічується, курсор `col-resize`.
2. Перетягнути роздільник ліворуч і праворуч: панель плавно змінює ширину, piano roll займає решту; межі 240 і 960 px; сторінка ніколи не прокручується горизонтально; текст не виділяється під час перетягування.
3. Відпустити мишу над відео, над waveform і над сіткою нот: відео не ставиться на паузу/відтворення, waveform не перемотує, нота не створюється.
4. Escape під час перетягування повертає попередню ширину. Подвійний клік повертає 360 px.
5. З завантаженим відео 16:9 і вертикальним відео: кадр вписується в панель будь-якої ширини (чорні поля), waveform звуку відео перемальовується на нову ширину (приблизно за 0.1 с). Те саме для mp3 (waveform аудіофайлу).
6. Під час відтворення з увімкненим «Follow» змінити ширину: playhead і автопрокрутка piano roll працюють коректно, відтворення не переривається.
7. Клавіатура: Tab до роздільника (видно кільце фокусу), `←`/`→`, `Shift+←/→`, `Home`/`End` змінюють ширину. Space перемикає відтворення, як і деінде.
8. Перезавантажити сторінку — ширина та сама. Звузити вікно до 1024 px — панель зменшується до 544 px, горизонтальної прокрутки немає; розширити назад — ширина повертається.
9. Екранний читач (Orca/NVDA, якщо доступний, або Chrome DevTools → Accessibility): роздільник оголошується як «Resize media panel, separator, 360 pixels».
10. DevTools → Performance: запис під час перетягування не показує перерендерів `PianoRoll` (React DevTools Profiler, «Highlight updates»).
11. Консоль без помилок і попереджень React.

## Критерії готовності (Definition of Done)
- [ ] `cd frontend && npm test -- --run && npm run lint && npm run typecheck && npm run build && npx prettier --check .` — зелено.
- [ ] `cd frontend && npm run e2e` — зелено, включно з 9 тестами `e2e/media-panel-resize.spec.ts`, оновленим `e2e/video-fit.spec.ts` і наявним `e2e/single-media.spec.ts`.
- [ ] `cd backend && uv run pytest && uv run ruff check . && uv run ruff format --check . && uv run mypy app` — зелено; `git diff main --stat -- backend/` порожній.
- [ ] `git diff main -- frontend/package.json frontend/package-lock.json` порожній (нових залежностей немає).
- [ ] Усі тести з розділу «Тести» наявні й проходять; кожна експортована функція `mediaPanelWidth.ts`, `useViewportWidth` і `AppLayout` мають щонайменше один тест.
- [ ] Змінені наявні тести: `git diff main --name-status -- frontend/src frontend/e2e | grep -E '\.(test|spec)\.tsx?$'` показує `M` лише для `App.test.tsx`, `appLayout.test.ts`, `video-fit.spec.ts`, решта — `A`. У `App.test.tsx` і `appLayout.test.ts` видалених рядків немає (крім рядків імпорту); у `video-fit.spec.ts` змінено лише сценарій «the video fits a media panel of any width».
- [ ] `git diff main --name-only -- frontend/src` містить лише `App.tsx`, `App.css`, `App.test.tsx`, `appLayout.test.ts`, `components/AppLayout.tsx`, `components/AppLayout.test.tsx`, `components/useViewportWidth.ts`, `components/useViewportWidth.test.tsx`, `utils/mediaPanelWidth.ts`, `utils/mediaPanelWidth.test.ts`.
- [ ] `grep -n "role=\"separator\"" frontend/src/components/AppLayout.tsx` і `grep -n "aria-valuenow" frontend/src/components/AppLayout.tsx` знаходять рядки; `grep -rn "localStorage" frontend/src --include=*.ts --include=*.tsx | grep -v test` знаходить лише `utils/mediaPanelWidth.ts`.
- [ ] `grep -n "var(--media-panel-width, 360px)" frontend/src/App.css` знаходить правило `.app`; правила `.app__media`, `.app__media > section`, `.video-player__*` не змінено (`git diff main -- frontend/src/App.css` їх не зачіпає).
- [ ] README має розділ «Медіапанель» з описом миші, клавіш, меж і збереження.
- [ ] Ручна перевірка (11 пунктів) пройдена в Chrome і Firefox; `git status --porcelain` не показує медіафайлів, `test-results/` чи `playwright-report/`.
- [ ] У гілці до злиття (коміт `docs: mark task 014 as done`): у CLAUDE.md `[x]` для 2.8 «Змінний розмір панелі», інші пункти 2.8 не змінено; статус 014 у розділі 8 — «виконано»; статус плану — `виконано`.
- [ ] Гілку `feature/014-resizable-media-panel` злито в `main` (`--no-ff`) і запушено; на `main` перевірки (включно з e2e) зелені.

## Ризики / відкриті питання
- **Кастомна CSS-властивість у jsdom.** React ставить `--media-panel-width` через `style.setProperty`. Якщо jsdom (cssstyle) її не збереже, компонентні тести перевіряють атрибут `style` (див. `AppLayout.test.tsx`), а реальну ширину перевіряє e2e.
- **Затримка перемальовування waveform.** WaveSurfer перемальовує waveform через 100 мс після останньої зміни розміру контейнера, тож під час перетягування waveform ненадовго розтягнутий/стиснутий. Це косметика: після зупинки миші малюнок точний. Якщо в Firefox перемальовування не спрацює (немає `ResizeObserver` на shadow-контейнері), implementer додає виклик перемальовування з `AudioTrack` після зміни ширини як дрібне відхилення з тестом і звітом; якщо цього недостатньо, план повертається до planner.
- **Межі 240 / 960 / 480 px** — вибрані за здоровим глуздом. Відкрите питання до власника (не блокує): чи потрібна ширша панель (наприклад, до 70 % вікна) для великих моніторів. Зміна — лише константи.
- **Клавіші роздільника і задача 018.** Клавіші роздільника локальні (діють лише у фокусі роздільника) і не входять у `shortcuts.ts`. Щоб 018 показала їх з того самого джерела, `keyboardMediaPanelWidth` будується на експортованому з `mediaPanelWidth.ts` описі клавіш (`SPLITTER_KEYS`: `ArrowLeft`/`ArrowRight`/`Home`/`End` з кроком), який 018 зможе імпортувати. Дія мишею (перетягування, подвійний клік) 018 додасть у свій список.
- **Space на роздільнику** перемикає відтворення (глобальна клавіша). Роль `separator` не має власної дії на Space, тож це узгоджується з рештою сторінки. Якщо власник вважатиме інакше, достатньо додати `separator` до `ACTIVATION_ROLES` у `shortcuts.ts` (окрема дрібна правка).
- **`localStorage` недоступний** (приватний режим Safari, заборона cookies): ширина працює в межах сесії й не зберігається, помилок немає (`browserStorage` і `save/load` ловлять винятки; тести 3 і unit-тести сховища).
- **Обсяг.** Одна чиста утиліта, один хук, один компонент розкладки, зміна `App.tsx` і кількох правил CSS, тести й README. Задача вкладається в одну гілку; поділ не потрібен.
