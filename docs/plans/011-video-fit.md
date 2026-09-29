# 011 — fix: відео влізає в плеєр, без горизонтальної прокрутки

**Статус:** схвалено
**Гілка:** fix/011-video-fit

## Мета
Закрити пункт розділу 2.7 CLAUDE.md **«Відео влізає в плеєр»**: кадр масштабується під розмір панелі «Video» зі збереженням пропорцій (`object-fit: contain`). Ні сторінка, ні медіапанель не отримують горизонтальної прокрутки за будь-якого розміру й пропорцій відео, а також за довгої назви файлу чи довгого повідомлення про помилку.

Рішення не залежить від конкретної ширини правої панелі (зараз фіксовані 360 px). Задача 014 зробить ширину змінною, і верстка має працювати за будь-якої ширини колонки. Це перевіряє e2e-тест із шириною панелі 240, 360 і 720 px.

Після виконання в CLAUDE.md відмічається `[x]` лише перший пункт 2.7. Решта пунктів 2.7 («Темп впливає на відтворення», «Одне джерело медіа») лишаються `[ ]`.

## Поза межами задачі
- **012:** одне джерело медіа і waveform звуку відео на аудіодоріжці.
- **013:** вплив BPM на відтворення.
- **014:** роздільник для зміни ширини панелі й збереження ширини в `localStorage`. Тут ширина лишається 360 px, лише розмітка стає «гумовою».
- **015 і 016:** offset медіа, таймлайн над piano roll (зокрема прибирання повзунка «Seek video» з панелі), вирізання проміжків. Повзунок поки лишається на місці.
- **018:** кнопка Info.
- Повноекранний режим, збільшення відео, зміна пропорцій панелі.
- Горизонтальна прокрутка **всередині piano roll** (`.piano-roll` зі своїм `overflow: auto`). Вона потрібна, щоб гортати таймлайн, і це не прокрутка сторінки чи медіапанелі.
- Вузькі вікна, де не влазить сам редактор (менше приблизно 900 px завширшки). Гарантуємо відсутність горизонтальної прокрутки сторінки для вікон від 1024 px.
- Backend не змінюється.

## Технічні рішення

### Причина проблеми (аналіз поточного коду)
Сам `<video>` уже має `width: 100%; height: 100%; object-fit: contain` (`.video-player__video` в `frontend/src/App.css`) і лежить в абсолютно позиціонованому `.video-player__screen`. Тому розмір кадру сам по собі розмітку не розпирає. Панель «ламається» на рівні контейнерів grid:

1. **`.app__media` не має `grid-template-columns`.** Його єдина неявна колонка має розмір `auto`, а колонка `auto` не буває вужчою за min-content своїх секцій. Min-content секції «Video» зростає через:
   - `span.video-player__name` з `white-space: nowrap`. Для внутрішнього розміру flex-рядка `.video-player__toolbar` `min-width: 0` і `overflow: hidden` не діють: min-content-внесок назви дорівнює повній ширині тексту;
   - `p.video-player__error`. Назва файлу без пробілів у `Could not play "…"` — одне «слово», яке не переноситься.

   Через це колонка `auto` виходить за межі 360 px. Секція, `.video-player__stage` і кадр стають ширшими за видиму панель, `aside` вилазить за правий край вікна, і сторінка отримує горизонтальну прокрутку. Кадр при цьому виглядає обрізаним, бо `object-fit: contain` вписує його у сцену, яка сама ширша за панель. Відеофайли часто мають довгі назви (`VID_20240101_123456789…mp4`), тому проблема з'являється саме після завантаження відео. Аудіосекція в тій самій колонці має той самий ризик (`.audio-track__name`, `.audio-track__error`).
2. **`.app` має `grid-template-columns: 1fr 360px` і `grid-template-rows: auto 1fr`.** `1fr` означає `minmax(auto, 1fr)`: автоматичний мінімум дозволяє вмісту розпирати трек, зокрема рядок заголовка `.app__transport`, що охоплює обидві колонки й не переноситься.
3. **`.app__media` має `grid-template-rows: 1fr 1fr`.** Мінімум `auto` дозволяє вмісту однієї секції розпирати рядок по висоті, тож сцена відео не завжди отримує рівно свою половину.

Першим кроком реалізації e2e-тест відтворює проблему на поточному CSS (див. «Кроки реалізації», крок 2). Якщо жоден сценарій тесту не падає до виправлення, implementer відтворює проблему вручну (реальне відео, Chrome/Firefox, 1440×900), доповнює тест сценарієм, що падає, і описує причину у звіті. Захисні зміни нижче застосовуються в будь-якому разі.

### Принцип виправлення
Кожен рівень вкладеності від `.app` до `<video>` отримує **явний нульовий мінімум** (`minmax(0, …)` для треків grid, `min-width: 0` для flex- і grid-елементів). Розмір панелі тоді визначає лише зовнішня колонка `.app`, а вміст підлаштовується під неї: текст обрізається трикрапкою або переноситься, відео масштабується. Рішення працює за будь-якої ширини колонки, тож 014 достатньо змінити значення колонки (наприклад, на `var(--media-width)`).

**Відкинуті альтернативи:**
- `overflow: hidden` на `.app` чи `body`. Це приховало б прокрутку сторінки, але не виправило б панель: вміст так само вилазив би за край і обрізався, кадр був би обрізаний. Крім того, тоді перевірка `document.documentElement.scrollWidth` в e2e перестала б щось перевіряти. Цього **не робимо**.
- Обчислення розміру `<video>` у JS (`ResizeObserver` + пропорції `videoWidth/videoHeight`). Це зайвий код: `object-fit: contain` робить те саме в браузері, якщо розмір контейнера визначений.
- Нові залежності не потрібні.

### Зміни CSS (`frontend/src/App.css`)
Змінюються лише наведені властивості, решта правил лишається як є.

```css
.app {
  grid-template-columns: minmax(0, 1fr) 360px;   /* було: 1fr 360px */
  grid-template-rows: auto minmax(0, 1fr);       /* було: auto 1fr */
}

.app__transport {
  flex-wrap: wrap;   /* the header wraps instead of widening the page */
  row-gap: 8px;
  min-width: 0;
}

.app__media {
  grid-template-columns: minmax(0, 1fr);                 /* new: the column never grows past the panel */
  grid-template-rows: minmax(0, 1fr) minmax(0, 1fr);     /* було: 1fr 1fr */
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.app__media > section {
  min-width: 0;
  overflow-x: hidden;
  overflow-y: auto;   /* a panel that is too short scrolls vertically, never horizontally */
}

.video-player__stage {
  flex: 1 1 0;        /* було: flex: 1 */
  min-width: 0;
  overflow: hidden;
}

.video-player__screen {
  overflow: hidden;
}

.video-player__video {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;       /* вже є */
  object-position: center;
}

.video-player__error,
.audio-track__error {
  overflow-wrap: anywhere;   /* long file names without spaces wrap */
}
```

Пояснення:
- `overflow: hidden` на `.app__media` і `overflow-x: hidden` на секціях — лише страховка від субпіксельних залишків. Тести перевіряють `scrollWidth`, а він враховує і прихований вміст, тож страховка тестів не «обманює» (див. «Тести»).
- `overflow-y: auto` на секціях замість `hidden`: якщо вікно низьке, вміст секції прокручується вертикально, а кнопки не обрізаються.
- `min-height: 120px` у `.video-player__stage` лишається: у нормальних вікнах сцена отримує висоту, що лишилась у секції після панелей інструментів.
- `flex-wrap: wrap` у `.app__transport` не змінює вигляд на ширині 1440 px, якщо заголовок і так влазить. На вужчих вікнах група елементів переходить на другий рядок, а не розширює сторінку. Рядок заголовка має розмір `auto`, тож він просто стане вищим.

### Зміни компонентів
- **`VideoPlayer.tsx`:** `span.video-player__name` отримує `title={fileName}`, щоб повну назву, обрізану трикрапкою, було видно в підказці. Інших змін розмітки немає.
- **`AudioTrack.tsx`:** те саме для `span.audio-track__name` (`title={fileName}`). Це та сама колонка й той самий ризик, зміна в один рядок.
- **`htmlVideoPlayer.ts` не змінюється.** Розмір `<video>` задає лише CSS-клас. Тест фіксує, що адаптер не ставить атрибутів `width`/`height` і inline-стилів (див. «Тести»).

### Допоміжний модуль для e2e: згенероване відео
Щоб не комітити медіафайли (`*.mp4` і `*.webm` у `.gitignore`) і не залежати від `ffmpeg`, e2e-тест генерує відео в самому Chromium: `canvas` потрібного розміру → `canvas.captureStream(30)` → `MediaRecorder` (`video/webm;codecs=vp8`) → `Blob`. Повертається base64-рядок, з якого робиться `Buffer` для `setInputFiles`.

Новий файл **`frontend/e2e/media.ts`**:
```ts
export interface TestVideoOptions {
  readonly width: number;
  readonly height: number;
  readonly durationMs?: number; // default 800
}
/** Records a WebM clip of a moving pattern in the page (canvas + MediaRecorder). */
export async function recordTestVideo(page: Page, options: TestVideoOptions): Promise<Buffer>;
/** Loads a file into the video panel and waits until the <video> has its first frame. */
export async function loadVideo(page: Page, name: string, buffer: Buffer): Promise<Locator>; // returns the <video> locator
/** Throws with a readable message if anything overflows horizontally. */
export async function expectNoHorizontalOverflow(page: Page): Promise<void>;
/** Checks that the <video> box lies inside the stage and that the stage lies inside the Video section. */
export async function expectVideoInsidePanel(page: Page): Promise<void>;
```
- `recordTestVideo` у `page.evaluate`: `canvas.width/height = options`; кожні 33 мс (`setInterval`) малює кольоровий фон, діагональ і рамку по краю кадру, щоб у ручному налагодженні було видно, чи кадр обрізано; `recorder.start()`, через `durationMs` викликає `recorder.stop()`, збирає `dataavailable` у `Blob` і перетворює на base64 через `FileReader.readAsDataURL`.
- `loadVideo`: `page.getByLabel('Video file').setInputFiles({ name, mimeType: 'video/webm', buffer })`. Потім `page.waitForFunction` чекає, поки `document.querySelector('.video-player__video')` матиме `readyState >= 2` і `videoWidth > 0`, і стан «Loading …» зникне з панелі. WebM з `MediaRecorder` має `duration === Infinity`, тож це заразом проходить наявний у адаптері шлях визначення тривалості.
- `expectNoHorizontalOverflow` у `page.evaluate` збирає пари `[назва, scrollWidth, clientWidth]` для `document.documentElement`, `aside[aria-label="Media"]`, `section[aria-label="Video"]`, `section[aria-label="Audio track"]`, `.video-player`, `.video-player__stage`. Далі `expect(overflowing).toEqual([])`, де `overflowing` — елементи з `scrollWidth > clientWidth`. Так у повідомленні про помилку одразу видно, що саме вилазить. Окремо перевіряється `aside.getBoundingClientRect().right <= window.innerWidth`.
- `expectVideoInsidePanel`: через `boundingBox()` відео лежить у межах `.video-player__stage`, а сцена в межах `section[aria-label="Video"]`, з допуском 1 px на округлення. `getComputedStyle(video).objectFit === 'contain'`. Відео займає сцену повністю (`|video.width − stage.width| <= 1` і так само для висоти): елемент заповнює сцену, а кадр вписується в нього завдяки `contain`.

## Кроки реалізації
1. Від актуального `main` створити гілку `fix/011-video-fit`.
2. **Спершу тест, що відтворює проблему.** Створити `frontend/e2e/media.ts` і `frontend/e2e/video-fit.spec.ts` (сценарії в розділі «Тести»). Запустити `npm run e2e -- video-fit` на **незміненому** CSS і переконатися, що щонайменше сценарій із довгою назвою файлу падає. Якщо не падає жоден сценарій, діяти за абзацом у «Причина проблеми». Результат (що падало до виправлення) записати у звіт. На цьому кроці не комітити: тест на `main`-стані червоний.
3. Внести зміни CSS з розділу «Зміни CSS» у `frontend/src/App.css`. Додати `title={fileName}` у `VideoPlayer.tsx` і `AudioTrack.tsx`. Перевірити, що `npm run e2e -- video-fit` зелений. Коміт `fix: keep the video and the media panel within the window`.
4. Коміт e2e-тестів: `test: check that videos of any size fit the media panel`. Порядок комітів (фікс, потім тест) гарантує, що кожен коміт у гілці зелений.
5. Unit/компонентні тести: `frontend/src/appLayout.test.ts` (новий), доповнення `VideoPlayer.test.tsx`, `AudioTrack.test.tsx`, `htmlVideoPlayer.test.ts`. Коміт `test: guard the media panel layout rules`.
6. README, розділ «Відео»: додати пункт «**Розмір кадру:** відео будь-яких пропорцій вписується в панель зі збереженням пропорцій (чорні поля по краях), довга назва файлу обрізається трикрапкою (повна — у підказці)». Коміт `docs: describe how the video fits the panel`.
7. Усі перевірки з DoD (включно з `npm run e2e`) і ручна перевірка в браузері.
8. У гілці до злиття: у CLAUDE.md `[x]` для пункту 2.7 «Відео влізає в плеєр», статус 011 у розділі 8 «виконано», статус плану `виконано`. Коміт `docs: mark task 011 as done`.
9. `git checkout main && git merge --no-ff fix/011-video-fit`, повторні перевірки на `main` (включно з `npm run e2e`), `git push origin main` і гілки.

## Тести
Backend не змінюється, наявні тести мають і далі проходити.

### E2E — `frontend/e2e/video-fit.spec.ts` (Playwright, Chromium, 1440×900 з конфігу)
`beforeEach`: `openApp(page)`. Тести 2–6 генерують відео через `recordTestVideo` і завантажують його через `loadVideo`. Тест 1 працює без відео, тест 7 — з некоректним файлом.

1. **Базовий стан без відео:** `expectNoHorizontalOverflow(page)` проходить.
2. **Дуже широкий кадр 3840×240 з довгою назвою** (`'wide-' + 'x'.repeat(150) + '.webm'`):
   - `expectNoHorizontalOverflow` і `expectVideoInsidePanel` проходять;
   - `videoWidth / videoHeight` ≈ 16 (±1 %): тест справді перевіряє широкий кадр, а не зменшений енкодером;
   - `.video-player__name` має `title` з повною назвою, а його `scrollWidth > clientWidth`: назва справді обрізана трикрапкою, а не розширила панель.
3. **Дуже високий кадр 240×1920** (`tall.webm`): `expectNoHorizontalOverflow`, `expectVideoInsidePanel`; відео не вище за сцену (перевірка вже входить у `expectVideoInsidePanel`); `document.documentElement.scrollHeight <= clientHeight`, тобто сторінка не прокручується й вертикально.
4. **Маленький кадр 64×36** (`small.webm`): `expectVideoInsidePanel` (елемент займає всю сцену, тобто кадр масштабується вгору під панель), `expectNoHorizontalOverflow`.
5. **Будь-яка ширина панелі (підготовка до 014):** після завантаження 3840×240 з довгою назвою для кожної ширини `[240, 360, 720]` через `page.evaluate` ставиться `document.querySelector('.app').style.gridTemplateColumns = \`minmax(0, 1fr) ${w}px\``. Потім перевіряється: `section[aria-label="Video"]` має ширину `w` (±1 px), `expectNoHorizontalOverflow`, `expectVideoInsidePanel`.
6. **Вузьке вікно:** `page.setViewportSize({ width: 1024, height: 768 })`, завантажити 3840×240 з довгою назвою → `expectNoHorizontalOverflow`, `expectVideoInsidePanel`.
7. **Довге повідомлення про помилку:** `setInputFiles` з `{ name: 'y'.repeat(200) + '.mp4', mimeType: 'video/mp4', buffer: Buffer.from('nope') }` → видно `role="alert"` з `Could not play "yyy…`, і `expectNoHorizontalOverflow` проходить.

Чому `scrollWidth <= clientWidth` не «обманюється» страховкою `overflow: hidden`: `scrollWidth` елемента враховує вміст, що вилазить за його межі, навіть коли він прихований. `document.documentElement` перевіряється окремо, а `.app` і `body` прихованого переповнення не мають.

### Unit — `frontend/src/appLayout.test.ts` (новий, Vitest + jsdom)
jsdom не рахує розкладку, тому тут фіксуються самі правила CSS, від яких залежить розкладка (захист від регресії під час 014–016). Тест імпортує `App.css?raw` (Vite підтримує `?raw`, типи дає `vite/client`) і вставляє текст у `<style>` у `document.head`. Допоміжна функція `declarations(selector: string): Record<string, string>` проходить `style.sheet.cssRules` (`CSSStyleRule`), розбиває `selectorText` за комою, нормалізує пробіли і збирає `getPropertyValue` для всіх властивостей правил з точним збігом селектора (пізніші правила перекривають ранні). Якщо CSSOM jsdom відкидає якусь властивість (наприклад, `object-fit`), implementer може замінити реалізацію `declarations` простим розбором тексту CSS (прибрати коментарі, знайти блоки `selector { … }`). Це дрібне відхилення, яке треба описати у звіті.
- `declarations('.app')['grid-template-columns']` починається з `minmax(0, 1fr)`; `grid-template-rows` === `auto minmax(0, 1fr)`.
- `.app__transport` → `flex-wrap: wrap`.
- `.app__media` → `grid-template-columns: minmax(0, 1fr)`, `grid-template-rows: minmax(0, 1fr) minmax(0, 1fr)`, `min-width: 0`, `overflow: hidden`.
- `.app__media > section` → `min-width: 0`, `overflow-x: hidden`.
- `.video-player__stage` → `min-width: 0`, `overflow: hidden`, `position: relative`.
- `.video-player__screen` → `position: absolute`.
- `.video-player__video` → `object-fit: contain`, `width: 100%`, `height: 100%`, `max-width: 100%`, `max-height: 100%`.
- `.video-player__name` і `.audio-track__name` → `min-width: 0`, `overflow: hidden`, `text-overflow: ellipsis`.
- `.video-player__error` і `.audio-track__error` → `overflow-wrap: anywhere`.

### Компонентні тести (доповнення, наявні перевірки не змінюються)
- **`VideoPlayer.test.tsx`**, новий тест «keeps the screen inside the clipping stage»: `getByTestId('video-screen')` має клас `video-player__screen`, а його `parentElement` — клас `video-player__stage`. Після `loadReady` з файлом `'v'.repeat(120) + '.mp4'` елемент `.video-player__name` має текст і `title`, що дорівнюють цій назві.
- **`AudioTrack.test.tsx`**, новий тест: після завантаження `'a'.repeat(120) + '.mp3'` і `emitReady` елемент `.audio-track__name` має `title` з повною назвою.
- **`htmlVideoPlayer.test.ts`**, новий тест «sizes the video only through CSS»: після `createHtmlVideoPlayer` у `video` немає атрибутів `width`, `height` і `style` (`video.hasAttribute('style') === false`), а `className === 'video-player__video'`.

### Ручна перевірка в браузері
`cd frontend && npm run dev` (backend — `uv run uvicorn app.main:app`), http://localhost:5173, Chrome і Firefox, вікно 1440×900. Потрібні локальні файли: звичайне 16:9 mp4, вертикальне відео з телефона (9:16), дуже широке або 4K-відео, файл з довгою назвою без пробілів. У репозиторій вони не комітяться.
1. До завантаження сторінка без горизонтальної прокрутки, панель «Video» праворуч шириною 360 px.
2. 16:9 mp4: кадр повністю видно, пропорції збережено, чорні поля зверху й знизу; горизонтальної прокрутки немає ні в сторінки, ні в панелі.
3. Вертикальне відео: кадр по висоті сцени, чорні поля з боків, нічого не обрізано.
4. 4K/широке відео: кадр зменшено до ширини панелі, сторінка не прокручується горизонтально.
5. Файл з довгою назвою: назва обрізана трикрапкою, повна видна в підказці при наведенні; панель не розширилась.
6. Текстовий файл із довгою назвою, перейменований на `.mp4`: повідомлення `Could not play …` переноситься в межах панелі.
7. Зміна розміру вікна (від 1024 px до повного екрана і висоти близько 600 px): кадр плавно масштабується, горизонтальної прокрутки немає. Якщо вікно низьке, панель прокручується вертикально, а кнопки лишаються доступними.
8. У DevTools тимчасово змінити `grid-template-columns` у `.app` на `minmax(0, 1fr) 240px` і `minmax(0, 1fr) 720px`: відео й елементи керування підлаштовуються під ширину.
9. Аудіодоріжка, piano roll (власна горизонтальна прокрутка таймлайну), транспорт, імпорт і експорт працюють як раніше; заголовок на ширині 1440 px виглядає як до змін.
10. Консоль без помилок і попереджень React.

## Критерії готовності (Definition of Done)
- [ ] `cd frontend && npm test -- --run && npm run lint && npm run typecheck && npm run build && npx prettier --check .` — зелено.
- [ ] `cd frontend && npm run e2e` — зелено, включно з 7 тестами `e2e/video-fit.spec.ts`.
- [ ] У звіті зазначено, які сценарії `video-fit.spec.ts` падали на CSS до виправлення (крок 2).
- [ ] `cd backend && uv run pytest && uv run ruff check . && uv run ruff format --check . && uv run mypy app` — зелено; `git diff main --stat -- backend/` порожній.
- [ ] `git diff main -- frontend/package.json frontend/package-lock.json` порожній (нових залежностей немає).
- [ ] `git diff main --name-only` містить лише: `frontend/src/App.css`, `frontend/src/components/VideoPlayer.tsx`, `frontend/src/components/AudioTrack.tsx`, тестові файли з розділу «Тести», `frontend/e2e/media.ts`, `frontend/e2e/video-fit.spec.ts`, `README.md`, `CLAUDE.md`, `docs/plans/011-video-fit.md`.
- [ ] `grep -n "minmax(0, 1fr)" frontend/src/App.css` знаходить правила `.app` і `.app__media`; `grep -n "overflow: hidden" frontend/src/App.css` не знаходить його в правилах `.app` і `body`.
- [ ] `git status --porcelain` після `npm run e2e` і ручної перевірки не показує медіафайлів, `test-results/` чи `playwright-report/`.
- [ ] Ручна перевірка (10 пунктів) пройдена в Chrome і Firefox.
- [ ] У гілці до злиття (коміт `docs: mark task 011 as done`): у CLAUDE.md `[x]` для пункту 2.7 «Відео влізає в плеєр», інші пункти 2.7 лишаються `[ ]`; статус 011 у розділі 8 «виконано»; статус плану `виконано`.
- [ ] Гілку `fix/011-video-fit` злито в `main` (`--no-ff`) і запушено; на `main` перевірки (включно з e2e) зелені.

## Ризики / відкриті питання
- **Проблему не вдалося відтворити тестом.** Аналіз причин зроблено за кодом, без запуску браузера. Якщо в власника кадр вилазив з іншої причини (наприклад, особливість конкретного файлу чи браузера), крок 2 цього не покаже. Тоді implementer відтворює проблему вручну, додає e2e-сценарій, що падає, і описує причину у звіті. Якщо причина потребує змін поза CSS панелі, план повертається до planner.
- **`MediaRecorder` у headless Chromium.** Запис canvas у WebM (VP8) підтримується і в headless-режимі. Якщо енкодер не прийме розмір 3840 px, можна зменшити кадр до 2560×160 (ті самі пропорції 16:1): це дрібне відхилення зі звітом. Якщо `MediaRecorder` недоступний зовсім, запасний варіант — `E2E_CHROMIUM_PATH` на повний Chromium/Brave (як описано в README).
- **Тривалість e2e.** Кожен запис займає близько 1 с плюс завантаження, тож 7 тестів додають приблизно 10–15 с. Це прийнятно.
- **Перенесення заголовка.** `flex-wrap` у `.app__transport` на вузьких вікнах переносить частину елементів на другий рядок, і piano roll стає трохи нижчим. Це краще за горизонтальну прокрутку сторінки. На 1440 px вигляд не змінюється (пункт 9 ручної перевірки).
- **CSSOM у jsdom.** Якщо `style.sheet.cssRules` не зберігає якусь властивість, діє запасний варіант з розбором тексту (див. `appLayout.test.ts`).
- **Узгодження з 014.** 014 змінить `grid-template-columns` у `.app` (наприклад, на `minmax(0, 1fr) var(--media-width)`). Тоді перевірку в `appLayout.test.ts` («починається з `minmax(0, 1fr)`») і e2e-сценарій 5 треба буде оновити, це очікувано. Внутрішні правила `.app__media` 014 змінювати не потрібно.
- **Обсяг.** Зміни CSS у кількох правилах, два атрибути `title`, один e2e-файл з допоміжним модулем і кілька unit-тестів. Задача вкладається в одну гілку.
