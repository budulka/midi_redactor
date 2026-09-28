# 002 — Модель даних проекту, стан на frontend, чисті функції часу й квантизації

**Статус:** схвалено
**Гілка:** feature/002-project-model-state

## Мета
Закласти спільну модель даних і музичну логіку, на яких будуть побудовані piano roll (003), педалі (004), відтворення (005), експорт (009) та undo/redo з мультивиділенням (010):

1. **Модель даних** з розділу 7 CLAUDE.md (`Note`, `PedalEvent`, `Project`, плюс `TimeSignature`) у двох місцях:
   Pydantic v2 на backend і TypeScript-типи на frontend, з однаковим JSON-форматом (camelCase). Узгодженість перевіряє контрактний тест на спільному JSON-фікстурі.
2. **Стан проекту на frontend.** Чистий reducer, React Context-провайдер і хуки доступу.
3. **Чисті функції:**
   - frontend: секунди ↔ чверті/долі ↔ такти, крок сітки, квантизація, валідація й нормалізація нот і педалей;
   - backend: секунди ↔ MIDI-тіки та BPM → MIDI tempo (для експорту в 009).

Жоден пункт розділу 2 ця задача **не закриває повністю**, тож галочки в розділі 2 не ставляться. Вона готує дані й логіку для таких вимог:
- 2.2: «Прив'язка до сітки (quantize) з вибором кроку; темп (BPM) і розмір такту» (дані та функції, без UI) і «Зміна нот» (операції над станом, без UI);
- 2.3: модель інтервалів педалей sustain/sostenuto/soft;
- 2.6: тіки та темп для `.mid`.

## Поза межами задачі
- Будь-який UI редагування: сітка, клавіатура, миша, drag. Це задача 003. Педальна доріжка — 004.
- Стан виділення (selection), undo/redo, гарячі клавіші — 010 (дизайн reducer'а це враховує, див. нижче). Стан виділення, який знадобиться в 003, 003 і додасть окремо від `Project`.
- Стан транспорту (playhead, play/pause) — 005. Він не зберігається в `Project`.
- Зміна темпу всередині твору (tempo map), кілька розмірів такту. Поки що один BPM і один розмір на проект.
- Політика розв'язання перетинів педалей одного типу під час редагування (злиття чи обрізання) — 004. Тут лише валідація повідомляє про перетин.
- Перетини нот однакової висоти **дозволені** в моделі. Як з ними поводитися в MIDI-файлі, вирішує 009.
- Збереження/завантаження проекту (localStorage, файл, backend-ендпоінт). Нових ендпоінтів у цій задачі немає.
- Залежність `mido` (додається в 009) і тіки на frontend (не потрібні: тіки використовуються лише під час експорту на backend).
- Зсув сітки відносно початку медіа (grid offset) — за потреби в 008. Сітка поки прив'язана до 0 с таймлайну.

## Технічні рішення

### Формат даних (JSON, спільний для frontend і backend)
```json
{
  "bpm": 120,
  "timeSignature": { "numerator": 4, "denominator": 4 },
  "notes": [
    { "id": "n1", "pitch": 60, "start": 0.5, "duration": 0.25, "velocity": 100 }
  ],
  "pedals": [
    { "id": "p1", "type": "sustain", "start": 0.0, "end": 1.5 }
  ]
}
```
Обмеження (однакові на обох сторонах; константи мають однакові імена в `SCREAMING_SNAKE_CASE`):

| Поле | Обмеження |
|---|---|
| `Note.id`, `PedalEvent.id` | непорожній рядок, унікальний у межах `notes` / `pedals` |
| `Note.pitch` | ціле, `MIN_PITCH = 21` … `MAX_PITCH = 108` |
| `Note.start`, `PedalEvent.start` | скінченне число ≥ 0 (секунди) |
| `Note.duration` | скінченне, ≥ `MIN_NOTE_DURATION = 0.001` с |
| `Note.velocity` | ціле, `MIN_VELOCITY = 1` … `MAX_VELOCITY = 127` |
| `PedalEvent.type` | `"sustain" \| "sostenuto" \| "soft"` (CC64 / CC66 / CC67) |
| `PedalEvent.end` | `end - start ≥ MIN_PEDAL_DURATION = 0.001` с |
| Педалі одного типу | інтервали `[start, end)` не перетинаються; дотик (`a.end == b.start`) дозволено |
| `bpm` | число `MIN_BPM = 20` … `MAX_BPM = 300`; означає **чверті за хвилину** (так само, як MIDI tempo) |
| `timeSignature.numerator` | ціле 1…32 |
| `timeSignature.denominator` | одне з 1, 2, 4, 8, 16, 32 |

Час в усіх полях — секунди на спільному таймлайні (розділ 7). **Зміна BPM чи розміру не зсуває ноти в секундах.** Ноти прив'язані до медіа, а змінюються лише сітка й такти. Тіки обчислюються лише під час експорту.

### Backend
- `backend/app/models/project.py`:
  - константи з таблиці вище;
  - `PedalType = Literal["sustain", "sostenuto", "soft"]`;
  - базовий клас `CamelModel(BaseModel)` з `model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="forbid")`. `to_camel` береться з `pydantic.alias_generators`. На виході `model_dump(by_alias=True)` дає `timeSignature`;
  - `Note`, `PedalEvent`, `TimeSignature`, `Project(CamelModel)`. Прості межі задаються через `Field(ge=..., le=...)`, `allow_inf_nan=False`. `Note.id` / `PedalEvent.id` мають тип `str` з `min_length=1`. `TimeSignature.denominator` — `Literal[1, 2, 4, 8, 16, 32]`;
  - `PedalEvent`: `@model_validator(mode="after")` перевіряє `end - start >= MIN_PEDAL_DURATION`;
  - `Project`: `@model_validator(mode="after")` перевіряє унікальність id нот, унікальність id педалей і відсутність перетинів педалей одного типу (сортування за `start`, порівняння сусідів).
  - Значення за замовчуванням: `bpm=120`, `timeSignature=4/4`, `notes=[]`, `pedals=[]`.
- `backend/app/services/timing.py` — чисті функції для 009:
  - `TICKS_PER_QUARTER: Final = 480` (стандартний PPQ, його підтримують усі DAW);
  - `seconds_to_ticks(seconds: float, bpm: float, ppq: int = TICKS_PER_QUARTER) -> int`. Формула `seconds * bpm / 60 * ppq` з округленням half-up (`math.floor(x + 0.5)`), а не банківським `round`, щоб результат був детермінованим. `ValueError` при `seconds < 0` або `bpm <= 0`;
  - `ticks_to_seconds(ticks: int, bpm: float, ppq: int = TICKS_PER_QUARTER) -> float`;
  - `bpm_to_midi_tempo(bpm: float) -> int` — мікросекунди на чверть, `floor(60_000_000 / bpm + 0.5)` (відповідає `mido.bpm2tempo`).
- Нових ендпоінтів немає. Моделі поки використовуються лише тестами, а в 009 їх прийме `POST /api/export`.

### Frontend: типи, константи, чисті функції
- `src/state/types.ts` — `Note`, `PedalType`, `PedalEvent`, `TimeSignature`, `Project`, усі з `readonly`-полями (`readonly Note[]` тощо), щоб компілятор ловив мутації. Там же `NotePatch = Partial<Omit<Note, 'id'>>` і `PedalPatch = Partial<Omit<PedalEvent, 'id'>>`.
- `src/state/constants.ts` — константи з таблиці, `PEDAL_TYPES`, `ALLOWED_DENOMINATORS`, `DEFAULT_BPM = 120`, `DEFAULT_TIME_SIGNATURE`, `createEmptyProject(): Project`.
- `src/utils/time.ts` (чисті функції; `bpm` означає чверті за хвилину):
  - `secondsPerQuarter(bpm)` = `60 / bpm`;
  - `secondsToQuarters(seconds, bpm)` / `quartersToSeconds(quarters, bpm)`;
  - `beatDurationSeconds(bpm, ts)` = `60 / bpm * 4 / ts.denominator` (доля — одиниця знаменника: у 6/8 це восьма);
  - `barDurationSeconds(bpm, ts)` = `beatDurationSeconds * ts.numerator`;
  - `secondsToBarPosition(seconds, bpm, ts): BarPosition`, де `BarPosition = { bar: number; beat: number; fraction: number }`. `bar` і `beat` рахуються з 1, `fraction ∈ [0, 1)` — частка долі. Для від'ємного часу кидає `RangeError`. Щоб 2.9999999 не стало 2, при обчисленні `floor` додається `TIME_EPSILON = 1e-9`;
  - `barPositionToSeconds(pos, bpm, ts)` — обернена функція.
- `src/utils/quantize.ts`:
  - `type GridDivision = '1/1' | '1/2' | '1/4' | '1/8' | '1/16' | '1/32' | '1/4T' | '1/8T' | '1/16T'` і масив `GRID_DIVISIONS` для майбутнього селектора в 003;
  - `gridStepSeconds(division, bpm)` = `(4 / denom) * (triplet ? 2/3 : 1) * 60 / bpm`, тобто частка цілої ноти;
  - `snapToGrid(time, step, mode: 'nearest' | 'floor' | 'ceil' = 'nearest')`. Результат ≥ 0. Для `floor`/`ceil` використовується `TIME_EPSILON`: `floor(0.3 / 0.1)` має дати 3, а не 2. `RangeError`, якщо `step <= 0`;
  - `quantizeNote(note, step): Note`. `start` округлюється до найближчої лінії сітки, кінець (`start + duration`) теж до найближчої. Якщо тривалість стала < `step`, вона дорівнює `step`. Решта полів (id, pitch, velocity) не змінюється;
  - Режим `floor` потрібен для 003 (клік у клітинку ставить ноту на її початок), `nearest` — для перетягування й команди Quantize.
- `src/state/validation.ts`:
  - `interface ValidationIssue { path: string; message: string }`, де `path` має вигляд `notes[2].pitch`, `pedals[0].end`, `bpm`;
  - `validateNote(note, path?)`, `validatePedal(pedal, path?)`, `validateTimeSignature(ts)`, `validateProject(project)`. Усі повертають `ValidationIssue[]` (порожній масив означає валідний об'єкт). `validateProject` додатково перевіряє унікальність id і перетини педалей одного типу. Правила ті самі, що в Pydantic;
  - `parseProject(data: unknown): Project`. Структурна перевірка невідомого JSON (типи полів, відсутність зайвих полів), потім `validateProject`. У разі проблем кидає `ProjectParseError` (містить `issues: ValidationIssue[]`). Використовується в контрактному тесті, а надалі для `loadProject` з файлу. Пишеться вручну, без `zod`: схема мала, а нова залежність заради ~60 рядків не виправдана.
- `src/state/normalize.ts` — приведення значень у допустимі межі, щоб перетягування за межі не ламало стан:
  - `clampPitch` (округлення + межі 21–108), `clampVelocity` (округлення + 1–127), `normalizeNote(note): Note` (start ≥ 0, duration ≥ `MIN_NOTE_DURATION`, pitch і velocity у межах), `normalizePedal(pedal): PedalEvent` (start ≥ 0, end ≥ start + `MIN_PEDAL_DURATION`), `clampBpm`.
  - Нескінченні значення та NaN reducer відкидає (дія ігнорується), а не «лікує».
- `src/utils/id.ts` — `createId(): string`, обгортка над `crypto.randomUUID()`. Reducer id **не генерує**: вони приходять у payload, тому reducer детермінований і тестується з явними id.

### Frontend: стан
**Вибір підходу:** чистий reducer `projectReducer(project, action) => Project`, React `useReducer` у провайдері й два контексти (окремо стан і окремо dispatch). Нових залежностей немає.

Причини:
- чистий reducer тестується без React. Undo/redo в 010 робиться як обгортка над ним (`withHistory(reducer)` з `past/present/future`), а сам reducer при цьому не змінюється;
- кожна дія, що стосується кількох об'єктів, приймає **масив** (`addNotes`, `updateNotes`, `removeNotes`). Операції над мультивиділенням у 010 (перемістити, видалити, вставити) — це одна дія і, відповідно, один крок undo;
- дія, яка нічого не змінює (невідомий id, некоректне значення, той самий BPM), повертає **той самий об'єкт** (`===`). React пропускає ререндер, а history в 010 не створює порожнього кроку;
- розділений dispatch-контекст не змушує ререндеритися компоненти, які лише надсилають дії.

Альтернативи:
- **Zustand** (~1 KB) дає селективні підписки, корисні для великого piano roll. Зараз цього не потрібно. Якщо в 003/005 з'явиться проблема продуктивності, той самий `projectReducer` можна перенести в Zustand-store (`create(redux(projectReducer, initial))`) без переписування логіки.
- **Redux Toolkit** для одного reducer'а занадто важкий.
- **Immer** не потрібен: оновлення масивів нот прості (`map`/`filter`).

Файли:
- `src/state/actions.ts` — discriminated union `ProjectAction`:
  - `{ type: 'notes/add'; notes: Note[] }`
  - `{ type: 'notes/update'; changes: { id: string; patch: NotePatch }[] }`
  - `{ type: 'notes/remove'; ids: string[] }`
  - `{ type: 'pedals/add'; pedals: PedalEvent[] }`
  - `{ type: 'pedals/update'; changes: { id: string; patch: PedalPatch }[] }`
  - `{ type: 'pedals/remove'; ids: string[] }`
  - `{ type: 'project/setBpm'; bpm: number }`
  - `{ type: 'project/setTimeSignature'; timeSignature: TimeSignature }`
  - `{ type: 'project/load'; project: Project }` (вже провалідований через `parseProject`)

  Там же action creators: `addNote(input: Omit<Note, 'id'>)`, який генерує id через `createId()`, `addNotes`, `updateNote(id, patch)`, `updateNotes`, `removeNotes`, аналогічні для педалей, `setBpm`, `setTimeSignature`, `loadProject`.
- `src/state/projectReducer.ts` — `projectReducer(state: Project, action: ProjectAction): Project`. Правила:
  - `notes/add`: кожну ноту пропускає через `normalizeNote`. Ноти з id, що вже існує, ігноруються. Порядок — порядок додавання (сортування за часом — справа селекторів у 003);
  - `notes/update`: застосовує patch і `normalizeNote`. Невідомі id ігноруються. Якщо жодна нота не змінилася, повертає той самий `state`;
  - `notes/remove`: відсутні id ігноруються; якщо нічого не видалено, повертає той самий `state`;
  - педалі — аналогічно, через `normalizePedal`. Перетини однотипних педалей reducer **не** виправляє, це політика 004;
  - `project/setBpm`: `clampBpm`; NaN/Infinity ігноруються; нове значення, що дорівнює поточному, повертає той самий `state`. Ноти не змінюються;
  - `project/setTimeSignature`: некоректний розмір (за `validateTimeSignature`) ігнорується;
  - `project/load`: повністю замінює стан;
  - exhaustive `switch` з перевіркою `never`.
- `src/state/projectContext.ts` — `ProjectStateContext`, `ProjectDispatchContext`, хуки `useProject(): Project` і `useProjectDispatch(): Dispatch<ProjectAction>`. Поза провайдером хуки кидають `Error('useProject must be used within ProjectProvider')`. Контексти та хуки винесено в окремий `.ts`-файл, бо правило `react-refresh/only-export-components` забороняє експортувати їх разом із компонентом.
- `src/state/ProjectProvider.tsx` — `ProjectProvider({ children, initialProject? })`. `initialProject` потрібен для тестів, за замовчуванням використовується `createEmptyProject()`.
- `src/components/ProjectInfo.tsx` — мінімальний read-only індикатор у транспортній панелі: `120 BPM · 4/4 · 0 notes`. Це вхідна точка для ручної перевірки, що провайдер підключено. Редагування BPM/розміру в UI — у 003.
- `App.tsx` обгортається в `ProjectProvider`, а `ProjectInfo` додається в `header`.
- `tsconfig.app.json`: додати `"resolveJsonModule": true` для імпорту спільного JSON-фікстура в контрактному тесті.

### Контракт frontend ↔ backend
- Спільний фікстур `backend/tests/fixtures/sample_project.json`: 120 BPM, 3/4, 3 ноти (зокрема з pitch 21 і 108), 3 педалі (по одній кожного типу, sustain і soft перетинаються в часі, що дозволено).
- Backend-тест: `Project.model_validate_json(...)` проходить, а `model_dump(by_alias=True, mode="json")` дорівнює вихідному JSON.
- Frontend-тест: `import sample from '../../../backend/tests/fixtures/sample_project.json'` → `parseProject(sample)` не кидає помилки й повертає об'єкт, що глибоко дорівнює `sample`.
- Якщо одна сторона змінить назву поля, впаде тест на відповідній стороні.

## Кроки реалізації
1. Від актуального `main` створити гілку `feature/002-project-model-state`.
2. Backend: `app/models/project.py` (константи, `CamelModel`, `Note`, `PedalEvent`, `TimeSignature`, `Project` з валідаторами).
3. Backend: `tests/fixtures/sample_project.json` і `tests/test_project_models.py` (див. «Тести»). Запустити `uv run pytest`, ruff, mypy. Коміт `feat: add project data models (Note, PedalEvent, Project)`.
4. Backend: `app/services/timing.py` і `tests/test_timing.py`. Перевірки й коміт `feat: add seconds/ticks timing helpers`.
5. Frontend: `src/state/types.ts`, `src/state/constants.ts`, `src/utils/id.ts`.
6. Frontend: `src/utils/time.ts` + `time.test.ts`. Коміт `feat: add time conversion helpers`.
7. Frontend: `src/utils/quantize.ts` + `quantize.test.ts`. Коміт `feat: add grid quantization helpers`.
8. Frontend: `src/state/validation.ts`, `src/state/normalize.ts` + тести. Додати `resolveJsonModule` у `tsconfig.app.json`. Контрактний тест `parseProject` з фікстуром. Коміт `feat: add project validation and normalization`.
9. Frontend: `src/state/actions.ts`, `src/state/projectReducer.ts` + `projectReducer.test.ts`. Коміт `feat: add project reducer and actions`.
10. Frontend: `src/state/projectContext.ts`, `src/state/ProjectProvider.tsx`, `src/components/ProjectInfo.tsx`, підключення в `App.tsx`, тести. Коміт `feat: provide project state to the app`.
11. Запустити всі перевірки (розділ 7 CLAUDE.md + `npm run build`), ручну перевірку, злиття `--no-ff` у `main`, повторні перевірки на `main`, push.
12. Оновити CLAUDE.md: статус 002 у розділі 8 — «виконано». Галочки в розділі 2 не ставляться (див. «Мета»). Статус плану — `виконано`. Коміт `docs: mark task 002 as done`.

## Тести

### Backend
`tests/test_project_models.py`:
- фікстур `sample_project.json` валідується, а `model_dump(by_alias=True, mode="json")` дорівнює вихідному JSON (round-trip, camelCase `timeSignature`);
- `Project()` без аргументів → `bpm == 120`, `4/4`, порожні списки;
- вхід у snake_case (`time_signature`) теж приймається (`populate_by_name`);
- `Note`: pitch 21 і 108 приймаються; 20, 109 і `60.5` → `ValidationError`; velocity 1 і 127 приймаються, 0 і 128 → помилка; duration `0` і `-0.1` → помилка, `0.001` приймається; start `-0.01` → помилка; `start = inf`/`nan` → помилка; порожній `id` → помилка;
- `PedalEvent`: type `"expression"` → помилка; `end == start` і `end < start` → помилка; `end = start + 0.001` приймається;
- `TimeSignature`: denominator 3 → помилка; numerator 0 і 33 → помилка; `6/8` приймається;
- `Project`: bpm 19 і 301 → помилка, 20 і 300 приймаються; дубльований id ноти → помилка; дубльований id педалі → помилка; дві sustain `[0,2)` і `[1,3)` → помилка; sustain `[0,1)` і `[1,2)` (дотик) приймаються; sustain `[0,2)` і soft `[1,3)` приймаються; невідоме поле (`"foo": 1`) → помилка (`extra="forbid"`).

`tests/test_timing.py`:
- `seconds_to_ticks(0.5, 120) == 480`; `(1.0, 60) == 480`; `(0, 120) == 0`; `(2.0, 120) == 1920`; `(1.0, 90) == 720`;
- округлення: `seconds_to_ticks(0.0005, 120) == 0` (0.48 тіка), `seconds_to_ticks(0.0006, 120) == 1` (0.576 тіка);
- кастомний ppq: `seconds_to_ticks(0.5, 120, ppq=96) == 96`;
- `ticks_to_seconds(480, 120) == 0.5`; round-trip `ticks_to_seconds(seconds_to_ticks(t, bpm), bpm)` відрізняється від `t` не більше ніж на `60 / bpm / ppq / 2` для набору значень (`pytest.mark.parametrize`);
- `bpm_to_midi_tempo(120) == 500000`, `(60) == 1000000`, `(90) == 666667`;
- `seconds_to_ticks(-1, 120)` → `ValueError`; `seconds_to_ticks(1, 0)` → `ValueError`.

### Frontend
`src/utils/time.test.ts`:
- `secondsPerQuarter(120) === 0.5`; `secondsToQuarters(1.5, 120) === 3`; `quartersToSeconds(3, 120) === 1.5`;
- `beatDurationSeconds(120, 4/4) === 0.5`, `(120, 6/8) === 0.25`, `(120, 2/2) === 1`;
- `barDurationSeconds(120, 4/4) === 2`, `(120, 3/4) === 1.5`, `(120, 6/8) === 1.5`;
- `secondsToBarPosition(0, 120, 4/4)` → `{bar: 1, beat: 1, fraction: 0}`; `(2.75, 120, 4/4)` → `{bar: 2, beat: 2, fraction: 0.5}`; `(1.5, 120, 3/4)` → `{bar: 2, beat: 1, fraction: 0}`; `(0.3 * 10, 60, 4/4)` (3 с, похибка float) → `{bar: 1, beat: 4, fraction: 0}` (перевірка epsilon);
- `barPositionToSeconds` є оберненою до `secondsToBarPosition` для набору значень (`toBeCloseTo`);
- від'ємний час → `RangeError`.

`src/utils/quantize.test.ts`:
- `gridStepSeconds('1/4', 120) === 0.5`, `('1/16', 120) === 0.125`, `('1/1', 60) === 4`, `('1/8T', 120) ≈ 1/6`;
- `GRID_DIVISIONS` містить усі 9 значень, кожне дає додатний крок;
- `snapToGrid(0.26, 0.125)` ≈ 0.25; `snapToGrid(0.19, 0.125)` ≈ 0.25; `snapToGrid(0.26, 0.125, 'floor')` ≈ 0.25; `snapToGrid(0.26, 0.125, 'ceil')` ≈ 0.375; `snapToGrid(0.3, 0.1, 'floor')` ≈ 0.3 (epsilon); `snapToGrid(0.05, 0.125)` → 0; результат ніколи не від'ємний; `step = 0` → `RangeError`;
- `quantizeNote({start: 0.26, duration: 0.2, ...}, 0.125)` → `start 0.25, duration 0.25` (кінець 0.46 → 0.5); коротка нота (`duration 0.01`) → `duration === step`; id, pitch і velocity не змінюються; вхідний об'єкт не мутується.

`src/state/validation.test.ts`:
- валідні нота, педаль і проект → `[]`;
- кожне порушення з таблиці обмежень дає issue з очікуваним `path` (напр. pitch 109 → `notes[0].pitch`, дубль id → `notes[1].id`, перетин sustain → `pedals[1]`, denominator 3 → `timeSignature.denominator`);
- дотик педалей і перетин різних типів → `[]`;
- `parseProject`: фікстур `sample_project.json` → повертає об'єкт, що глибоко дорівнює фікстуру (контракт з backend); `null`, рядок, об'єкт без `notes`, нота з `pitch: "60"`, зайве поле → `ProjectParseError` з непорожнім `issues`.

`src/state/normalize.test.ts`:
- `clampPitch(10) === 21`, `(200) === 108`, `(60.6) === 61`; `clampVelocity(0) === 1`, `(300) === 127`;
- `normalizeNote({start: -1, duration: 0, pitch: 120, velocity: 0})` → `start 0, duration 0.001, pitch 108, velocity 1`;
- `normalizePedal({start: 2, end: 1})` → `end === 2.001`; `clampBpm(5) === 20`, `(1000) === 300`;
- валідний вхід повертається без змін.

`src/state/projectReducer.test.ts` (вхідний стан глибоко заморожений через допоміжну `deepFreeze`, тож будь-яка мутація впаде):
- `notes/add` двох нот → обидві в стані; нота з pitch 200 → додана з pitch 108; дубль id → ігнорується;
- `notes/update` → змінено лише вказані поля вказаних нот; решта нот зберігає ідентичність (`toBe`); невідомий id → повертається **той самий** state (`toBe`);
- `notes/update` кількох нот однією дією (зсув start усіх виділених) → усі оновлені;
- `notes/remove` → ноти видалено; невідомий id → той самий state;
- педалі: add/update/remove аналогічно; `pedals/update` з `end < start` → нормалізовано до `start + 0.001`;
- `project/setBpm(90)` → bpm 90, `notes` той самий масив (`toBe`), тобто секунди нот не змінюються; `setBpm(NaN)` → той самий state; `setBpm(1000)` → 300; поточне значення → той самий state;
- `project/setTimeSignature(6/8)` → застосовано; `{numerator: 4, denominator: 3}` → той самий state;
- `project/load` → стан дорівнює переданому проекту;
- action creators: `addNote({...})` повертає дію з непорожнім id (`createId` замоканий через `vi.spyOn`), дві послідовні дії мають різні id.

`src/state/ProjectProvider.test.tsx`:
- тестовий компонент з `useProject()` / `useProjectDispatch()` у провайдері з `initialProject`: показує кількість нот; після кліку, що диспатчить `addNote`, кількість збільшується на 1;
- `useProject()` поза провайдером кидає помилку з очікуваним повідомленням.

`src/components/ProjectInfo.test.tsx`: у провайдері з дефолтним проектом рендерить `120 BPM`, `4/4`, `0 notes`. З `initialProject` (90 BPM, 6/8, 2 ноти) рендерить `90 BPM`, `6/8`, `2 notes`.

`src/App.test.tsx` (наявний): і далі проходить, додатково перевіряє наявність тексту `120 BPM` у транспортній панелі.

### Ручна перевірка
- `cd backend && uv run uvicorn app.main:app --reload` і `cd frontend && npm run dev`, відкрити http://localhost:5173: layout як раніше, статус backend `online`, у транспортній панелі `120 BPM · 4/4 · 0 notes`. У консолі браузера немає помилок чи попереджень React.

## Критерії готовності (Definition of Done)
- [ ] `cd backend && uv run pytest && uv run ruff check . && uv run ruff format --check . && uv run mypy app` — зелено.
- [ ] `cd frontend && npm test -- --run && npm run lint && npm run typecheck && npm run build` — зелено.
- [ ] Усі тести з розділу «Тести» наявні й проходять. `uv run pytest --cov=app` показує 100 % покриття рядків для `app/models/project.py` і `app/services/timing.py`.
- [ ] Контрактний фікстур `backend/tests/fixtures/sample_project.json` читається тестами обох сторін.
- [ ] `package.json` і `pyproject.toml` не отримали нових залежностей.
- [ ] Ручна перевірка: у транспортній панелі видно `120 BPM · 4/4 · 0 notes`.
- [ ] Гілку `feature/002-project-model-state` злито в `main` (`--no-ff`) і запушено, на `main` перевірки зелені.
- [ ] У CLAUDE.md статус 002 — «виконано»; статус цього плану — `виконано`.

## Ризики / відкриті питання
- **Імпорт JSON поза `src/` у тесті frontend.** Vitest це підтримує, а для `tsc` потрібен `resolveJsonModule`. Якщо `tsc -b` чи ESLint не приймуть шлях поза `include`, запасний варіант — додати `backend/tests/fixtures/*.json` до `include` у `tsconfig.app.json`. Копіювати фікстур не можна: так втрачається сенс контракту.
- **Продуктивність Context.** Будь-яка зміна `Project` ререндерить усіх споживачів `useProject()`. Для 003 (сотні нот) цього достатньо. Якщо стане проблемою, `projectReducer` без змін переноситься в Zustand (див. «Альтернативи»); це вирішуватиметься в 003 або 005 з обґрунтуванням у плані.
- **BPM означає чверті за хвилину незалежно від знаменника** (у 6/8 при 120 BPM доля-восьма триває 0.25 с). Так прийнято в MIDI і більшості DAW. Якщо власник хоче, щоб BPM рахувався в долях розміру, це треба вирішити зараз, до 003.
- **Межі BPM 20–300** обрано як практичні для фортепіанних аранжувань; їх легко змінити через константи на обох сторонах.
- `crypto.randomUUID` доступний у сучасних браузерах і Node ≥ 19. У тестах `createId` мокається, тож від jsdom це не залежить.
