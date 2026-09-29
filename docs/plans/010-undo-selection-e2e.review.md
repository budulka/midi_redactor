# Рев'ю плану 010 — Undo/redo, мультивиділення, гарячі клавіші, e2e-тести (Playwright)

## Раунд 1 — 2026-09-29

**ВЕРДИКТ: ПРИЙНЯТО**

План звірено з CLAUDE.md і кодом у `frontend/src`: `ProjectProvider.tsx`, `projectContext.ts`, `projectReducer.ts`, `actions.ts`, `editorState.ts`, `editorReducer.ts`, `useDragGesture.ts`, `useNoteDrag.ts`, `usePedalDrag.ts`, `NoteGrid.tsx`, `PedalLane.tsx`, `PianoRoll.tsx`, `ExportButton.tsx` (+ тест), `TransportControls.tsx`, `App.tsx`, `testUtils.tsx`, `noteEditing.ts`, `quantize.ts`, `pianoRollGeometry.ts`, `pedalEditing.ts`, а також з конфігами `package.json`, `tsconfig*.json`, `vite.config.ts`, `eslint.config.js`, `.gitignore`, і з backend-роутами `/api/health` та `/api/export/midi`.

Що перевірено і збігається з кодом:
- `projectReducer` повертає той самий об'єкт для дії без змін (зокрема відхилений перетин педалей, `setBpm` з тим самим значенням, невідомий id), тому правило «`next === present` → той самий `state`» у `historyReducer` коректне. `updateNotes` / `NoteChange` уже є в `actions.ts`, а `projectReducer.ts` справді змінювати не потрібно.
- `Dispatch<ProjectAction | HistoryAction>` можна присвоїти контексту `Dispatch<ProjectAction>` (контраваріантність параметра), тож споживачі `useProjectDispatch()` не змінюються.
- React-обробники `onKeyDown` спрацьовують раніше за слухач на `window`, тому схема з `defaultPrevented` працює. Escape під час жесту обробляє слухач `useDragGesture` на `window`, а `NoteGrid` бачить подію раніше, тож перевірка `isGestureActive()` потрібна і в плані вона є.
- Числа в unit-тестах перераховано: `applyDrag` (move — snap `nearest`, resize — `nearest` для кінця), `snapToGrid` обмежує результат знизу нулем, `hitTestNotes` має зону resize `min(6, width/3)`. Приклади `0.73 → 0.75`, `1.33 → 1.375`, `delta ±0.375`, обмеження групи до `−0.25` і до `+8` півтонів, ліміт історії (205 дій → `past[0].notes.length === 5`) правильні.
- E2E-геометрія узгоджена з кодом. Нова нота має довжину один крок (0.125 с = 12.5 px), зона resize починається з x ≥ 58.3, тож клік на 0.56 с потрапляє в тіло ноти. Рамка x 40–140 захоплює C4 (50–62.5) і E4 (100–112.5), але не G4 (150–162.5). `ArrowRight` → `left: 62.5px`. `PianoRoll` на старті прокручує сітку до C4, тож рядки C4–G4 видно у viewport 1440×900. Формат назв `C#4` відповідає `pitchName`.
- Від Vitest e2e-файли відокремлено правильно: стандартний `include` підхопив би `*.spec.ts`, а `exclude: [...configDefaults.exclude, 'e2e/**']` цьому запобігає. `tsconfig.app.json` має обмежений `types`, тож `@types/node` не потрапить у `src`. `.gitignore` уже містить `test-results/` і `playwright-report/`.

**Здійсненність Playwright на Arch без sudo.** Реалістично. `npx playwright install chromium` пише лише в `~/.cache/ms-playwright`. На цій машині вже є системні бібліотеки, потрібні Chromium: `libnss3`, `libnspr4`, `libgbm`, `libasound`, `libxkbcommon`, `libatk-bridge`, `libgtk-3`, `libcups`, `libdrm`, `libXcomposite`, `libXdamage`, `libXrandr`, `libpango`, `libcairo`. Отже, Ubuntu-збірка (fallback) майже напевно запуститься, а попередження «OS not officially supported» ні на що не впливає. `--with-deps` у плані свідомо не використовується, і зупинку за правилом 5.3 передбачено. Семпли лежать локально, а Chromium декодує mp3 і без пропрієтарних кодеків.

**Обсяг.** Задача велика (17 кроків, близько 8 нових модулів, 2 нові тестові набори компонентів, налаштування e2e), але її так визначає дорожня карта (одна задача 010). Частини незалежні, у кожної свій коміт, а запасний поділ описано. На одну гілку це прийнятно.

### Блокуючі зауваження
Немає.

### Рекомендації (необов'язково)
- [Ризики, Chromium на Arch] У системі немає `/usr/bin/chromium` і `google-chrome-stable`, зате є `/usr/bin/brave` (на основі Chromium). Якщо завантажений Chromium не стартує, як запасний варіант можна використати `E2E_CHROMIUM_PATH=/usr/bin/brave`. Варто згадати це в README або звіті як приклад.
- [Технічні рішення 2.1] Явно вказати, що `Delete`, `Backspace`, `Escape` і стрілки зіставляються за `event.key`, а за `event.code` — лише буквені клавіші й `Space`. Наявні тести `NoteGrid.test.tsx` і `PedalLane.test.tsx` передають лише `{ key: 'Delete' }` без `code`, і їх заборонено змінювати.
- [Технічні рішення 3.2] Для групи, у якій спрацювало обмеження, прямо написати, що якір отримує `anchor.start + dt'` і `anchor.pitch + dp'` (обмежені значення), а точне значення з `applyDrag` бере лише тоді, коли обмеження не спрацювало. Тест «не якір стоїть раніше» це вже перевіряє, але текст можна прочитати двозначно.
- [Ризики, Обсяг] Поділ на 010a/b/c змінює дорожню карту. За розділом 8 CLAUDE.md на це потрібна згода власника, або план має повернутися до planner. Implementer не повинен ділити задачу самостійно, тож варто так і записати.
- [Технічні рішення 2.2] `Ctrl+S` у полі `CommitNumberInput` з незастосованим значенням експортує старе значення. Можна перед експортом викликати `blur()` на активному елементі (тоді поле зафіксує значення) або описати цю поведінку в README.
- [Ризики, Undo під час перетягування] Дешевий захист: глобальні `undo`/`redo` не спрацьовують, поки жест активний. Це не обов'язково, бо стан у будь-якому разі лишається валідним.
- [E2E editing, п. 5] Уточнити, куди саме клікати по педалях (середина тіла, наприклад 0.375 с і 1.375 с), щоб не потрапити на ручки `start`/`end`.
- [DoD, ручна перевірка] Агент не може реально пройти ручну перевірку в Chrome і Firefox. У звіті треба чесно вказати, що перевірено автоматично (e2e у Chromium), а що лишається власнику.
