# 013 — fix: зміна BPM впливає на відтворення (перерахунок нот і педалей)

**Статус:** схвалено
**Гілка:** fix/013-bpm-rescale

## Мета
Закрити пункт розділу 2.7 CLAUDE.md **«Темп впливає на відтворення»** (після виконання ставимо `[x]`):
- зміна BPM змінює швидкість програвання нот і педалей;
- ноти й педалі зберігають позицію в тактах і долях, а їхні секунди перераховуються (розтягуються чи стискаються) відносно початку першого такту;
- зміна BPM — одна дія для undo/redo.

Задача також реалізує правило розділу 7: «Зміна BPM перераховує секунди нот і педалей так, щоб зберегти їхню позицію в тактах». Секунди на спільному таймлайні лишаються єдиним джерелом правди. Модель даних (`Project`, `Note`, `PedalEvent`) не змінюється.

**Поточний стан (перевірено в коді).** `projectReducer` для `project/setBpm` (`frontend/src/state/projectReducer.ts`, рядки 158–162) змінює лише `bpm`, а `notes` і `pedals` лишаються тими самими масивами. Тест `projectReducer.test.ts` «changes bpm without moving notes in seconds» фіксує саме цю поведінку (рішення задачі 002). Сітка (`gridLayers`, `TimeRuler`), квантизація (`gridStepSeconds`) і експорт (`seconds_to_ticks` на backend) рахуються від `bpm`, а `Transport` і `buildPlaybackEvents` грають секунди. Тому 20 і 300 BPM звучать однаково, а змінюється лише сітка під нотами.

Готове, на що спирається задача і що вона не змінює:
- `historyReducer` (`state/history.ts`, 010): будь-яка дія, що змінює `present`, — рівно один крок історії. Undo повертає попередній об'єкт `Project` без перерахунків, тож відновлення точне (без похибки округлення).
- `CommitNumberInput` (003): поле темпу надсилає значення лише на Enter або blur, тобто одне редагування поля — одна дія `setBpm`.
- `Transport.setProject` + `resyncSchedule` (005): зміну проекту під час відтворення вже підхоплено, нові часи подій плануються без зупинки.
- `SelectionSync` (010): виділення лишає лише наявні id.
- Імпорт `.mid` (017) застосовує проект дією `project/replace`, а не `setBpm`, тож перерахунок його не зачіпає.
- Експорт (009): тіки = `seconds · bpm / 60 · 480`. Перерахунок зберігає добуток `seconds · bpm`, тож тіки нот і педалей після зміни BPM ті самі, а в файлі змінюється лише tempo.

## Поза межами задачі
- **015 — зміщення медіа (offset).** Поки його немає, початок першого такту — це 0 с таймлайну. Функції перерахунку вже приймають параметр `origin` (типово `FIRST_BAR_START_SECONDS = 0`), а reducer поки передає 0. Як саме 015 визначить «початок першого такту» (0 с таймлайну чи зміщення), вирішує план 015. Див. «Ризики».
- **016 — вирізані проміжки.** Не існують; перерахунок працює в часі таймлайну.
- **Tempo map (кілька темпів у проекті).** У проекті один BPM. Файл, імпортований зі зміною темпу (017), після зміни BPM стискається чи розтягується пропорційно весь.
- **Зміна розміру такту не перераховує ноти.** BPM — це чверті на хвилину, тож зміна `timeSignature` не змінює тривалості чверті. Ноти зберігають позицію в чвертях і секундах, а змінюється лише поділ на такти. Це поточна поведінка, вимога 2.7 її не стосується.
- **Позиція playhead (cue) у секундах не перераховується.** Playhead — це позиція спільного таймлайну, тобто й позиція медіа. Якщо перерахувати її, відео чи аудіо стрибнуло б. Тому після зміни BPM playhead лишається на тій самій секунді (і тому ж кадрі відео), а його номер такту в транспорті змінюється. Див. «Відкриті питання».
- **Зум (`pixelsPerSecond`) не змінюється.** Після сповільнення ноти стають ширшими на екрані, бо займають більше секунд.
- **Режим «змінити BPM без перерахунку нот»** (наприклад, щоб підігнати сітку під уже записані на слух ноти). Вимога 2.7 прямо вимагає перерахунку. Помилкову зміну скасовує undo. Див. «Відкриті питання».
- Backend-код не змінюється (додається лише один регресійний тест, див. «Тести»).
- Нові залежності не додаються.

## Технічні рішення

### Формула
`factor = oldBpm / newBpm` (скільки нових секунд припадає на одну стару для тієї самої позиції в долях).

`rescaleTime(t, factor, origin) = origin + (t − origin) · factor`.

Чому це зберігає позицію в тактах: позиція в чвертях від початку першого такту — `(t − origin) · bpm / 60`. Після перерахунку `(t' − origin) · newBpm / 60 = (t − origin) · (oldBpm / newBpm) · newBpm / 60 = (t − origin) · oldBpm / 60`. Такт і доля (`secondsToBarPosition`) залежать лише від кількості чвертей і розміру такту, тож лишаються тими самими (з точністю до похибки float).

- Нота: `start' = rescaleTime(start)`, `duration' = duration · factor`. Тривалість множиться окремо, а не рахується як різниця кінців, щоб співвідношення тривалостей було точним.
- Педаль: `start' = rescaleTime(start)`, `end' = rescaleTime(end)`. Обидва кінці рахуються однаково, тож педалі, що торкалися (`a.end === b.start`), торкаються й далі (однаковий вхід дає однаковий результат). Множення на додатний `factor` монотонне, тож порядок і відношення «раніше/пізніше/одночасно» між нотами й педалями зберігаються, отже й дія педалей на звучання (`noteSoundingEnds`, soft pedal) лишається тою самою.
- Велосіті, висота й id не змінюються. Виділення зберігається, бо id ті самі.

### Мінімальні тривалості
Після стиснення (наприклад, 20 → 300 BPM, `factor = 1/15`) дуже короткі елементи можуть стати коротшими за `MIN_NOTE_DURATION` / `MIN_PEDAL_DURATION` (0.001 с). Це можливо лише для елементів, коротших за 15 мс.
- **Ноти:** результат проходить через наявний `normalizeNote`, тож тривалість стає 0.001 с. Ноти не мають обмеження на перетин, тож нічого більше не потрібно.
- **Педалі:** результат проходить через `normalizePedal` (`end ≥ start + 0.001`). Подовження може зробити педаль такою, що перетинає наступну того самого типу, а reducer не допускає перетинів педалей одного типу. Правило: **педаль, яка після нормалізації перетинає попередню прийняту педаль того самого типу, зливається з нею** — попередня отримує `end = max(prev.end, cur.end)`, а поточна зникає з проекту. Це той самий підхід, що й у backend-експорті (`test_short_pedal_merges_into_the_next_one`, 009): відпускання педалі на < 1 мс нечутне. Злиття відбувається лише в цьому граничному випадку; undo повертає обидві педалі.

### Нові чисті функції — `frontend/src/utils/tempoRescale.ts` (новий файл)
```ts
import type { Note, PedalEvent, Project } from '../state/types.ts';

/**
 * Timeline seconds of the start of the first bar. Until the media offset (task 015) exists,
 * bar 1 starts at 0 s.
 */
export const FIRST_BAR_START_SECONDS = 0;

/**
 * How many seconds at `toBpm` correspond to one second at `fromBpm` for the same position in
 * beats: fromBpm / toBpm. Throws RangeError for a non-positive or non-finite bpm.
 */
export function tempoScaleFactor(fromBpm: number, toBpm: number): number;

/** origin + (time - origin) * factor. */
export function rescaleTime(time: number, factor: number, origin?: number): number;

/**
 * Notes moved and stretched by the factor around the origin, normalized (normalizeNote).
 * Order and ids are kept. Returns the same array when it is empty or factor === 1.
 */
export function rescaleNotes(
  notes: readonly Note[],
  factor: number,
  origin?: number,
): readonly Note[];

/**
 * Pedals with both ends rescaled around the origin and normalized (normalizePedal). A pedal that
 * then overlaps an earlier pedal of its type is merged into it (the earlier one keeps its id and
 * gets the later end). Order of the kept pedals is the input order. Returns the same array when it
 * is empty or factor === 1.
 */
export function rescalePedals(
  pedals: readonly PedalEvent[],
  factor: number,
  origin?: number,
): readonly PedalEvent[];

/**
 * The project at another tempo: bpm is replaced, notes and pedals keep their position in bars and
 * beats (their seconds are rescaled around `origin`). Expects a finite bpm already clamped to the
 * allowed range. Returns the same project when bpm equals project.bpm.
 */
export function rescaleProjectTempo(project: Project, bpm: number, origin?: number): Project;
```
Деталі реалізації:
- `tempoScaleFactor` перевіряє обидва BPM так само, як `assertPositiveBpm` у `utils/time.ts` (щоб не дублювати, `assertPositiveBpm` експортується з `time.ts`; сама функція не змінюється).
- `rescalePedals`, алгоритм злиття: 1) масштабувати й нормалізувати кожну педаль; 2) для кожного типу відсортувати копію за `start'` (стабільно) і пройти один раз, тримаючи останню прийняту педаль: якщо `cur.start < last.end` — `last = { ...last, end: Math.max(last.end, cur.end) }`, id `cur` додається до множини видалених; 3) зібрати результат у порядку вхідного масиву: пропустити видалені, для злитих взяти оновлений об'єкт. Складність O(n log n).
- `origin` за замовчуванням `FIRST_BAR_START_SECONDS`. Для `origin > 0` і `t < origin` результат може стати від'ємним, і нормалізація обріже його до 0; зараз це недосяжно (origin = 0), поведінку з `origin > 0` визначить 015 (див. «Ризики»). Тест з `origin > 0` для самої формули все одно є.
- `rescaleProjectTempo`: `bpm === project.bpm` → той самий об'єкт; інакше `factor = tempoScaleFactor(project.bpm, bpm)`, результат `{ ...project, bpm, notes: rescaleNotes(...), pedals: rescalePedals(...) }`. `timeSignature` той самий об'єкт.
- Файл лежить в `utils/`, як і `time.ts`, `quantize.ts`, `pedalIntervals.ts` (музична логіка в чистих функціях, розділ 7). Імпорт `normalizeNote`/`normalizePedal` з `state/normalize.ts` — так само, як `pedalEditing.ts` імпортує з `state/constants.ts`.

### Зміна reducer
`frontend/src/state/projectReducer.ts`, гілка `project/setBpm`:
```ts
case 'project/setBpm': {
  if (!Number.isFinite(action.bpm)) return state;
  const bpm = clampBpm(action.bpm);
  return bpm === state.bpm ? state : rescaleProjectTempo(state, bpm);
}
```
- Одна дія → один новий `Project` → один крок історії (`historyReducer` не змінюється). Undo повертає попередній об'єкт точно, redo — перерахований.
- Та сама кількість BPM (включно з тим, що дало те саме значення після `clampBpm`) → той самий `state`, крок історії не додається (як і зараз).
- `project/load` і `project/replace` (імпорт `.mid`) не перераховують: імпортований проект уже має узгоджені секунди й BPM.
- `ProjectAction`, action creator `setBpm`, `TempoControls.tsx` не змінюються: поле вже надсилає `setBpm`, а новий зміст дії повністю в reducer.

### Відтворення
Змін у `Transport`, `scheduler`, `playbackEvents` немає. `TransportProvider` передає новий проект у `transport.setProject`, який перебудовує події й оновлює `endTime` (довжина таймлайну залежить від `bpm` і нот). Під час відтворення `resyncSchedule` переносить курсор на першу подію після поточної позиції: ноти далі грають уже в новому темпі. Нота, що звучала і чия атака після перерахунку опинилась після поточної позиції, відпускається і зазвучить знову у свій новий час (поведінка 005 для будь-якої зміни проекту під час відтворення).

### Відкинуті альтернативи
| Варіант | Чому ні |
|---|---|
| Зберігати ноти в тактах/тіках, а секунди рахувати з BPM | Суперечить розділу 7 (секунди — єдине джерело правди), зачіпає всю модель, редактор, транспорт, backend і синхронізацію з медіа |
| Перераховувати в `TempoControls` окремими діями `updateNotes` + `updatePedals` + `setBpm` | Три кроки історії замість одного (порушує 2.7), або потрібна нова «групова» дія в історії. `updatePedals` ще й відхилить усю дію при граничному перетині |
| Нова дія `project/setTempo` поряд зі старою `setBpm` | Стара дія лишилася б із застарілою поведінкою, і нею легко скористатися помилково. Єдиний користувач `setBpm` у UI — поле темпу, якому потрібна саме нова поведінка |
| Масштабувати швидкість відтворення (`rate`) замість секунд нот | Ламає синхронізацію з медіа (2.4, 2.5): відео мусило б грати з іншою швидкістю, а експорт і сітка розходилися б із тим, що звучить |
| Відкидати занадто короткі педалі замість злиття | Мовчки втрачаються дані; злиття зберігає натиснуту педаль і збігається з поведінкою експорту |

## Кроки реалізації
1. Від актуального `main` створити гілку `fix/013-bpm-rescale`.
2. `frontend/src/utils/time.ts`: додати `export` до `assertPositiveBpm` (без інших змін).
3. Новий `frontend/src/utils/tempoRescale.ts` (API і алгоритм — вище) і `frontend/src/utils/tempoRescale.test.ts` (див. «Тести»). Коміт `feat: add pure functions that rescale notes and pedals to a new tempo`.
4. `frontend/src/state/projectReducer.ts`: гілка `project/setBpm` викликає `rescaleProjectTempo`. У `projectReducer.test.ts` замінити тест «changes bpm without moving notes in seconds» на нові (див. «Тести»). Доповнити `history.test.ts`. Коміт `fix: rescale notes and pedals when the tempo changes`.
5. Інтеграційні тести: доповнення `TempoControls.test.tsx` і `TransportProvider.test.tsx`. Коміт `test: check that the tempo changes playback and is one undo step`.
6. Backend: регресійний тест у `backend/tests/test_midi_export.py` (див. «Тести»). Коміт `test: check that the same beats export to the same ticks at another tempo`.
7. E2E: новий `frontend/e2e/tempo.spec.ts`. Коміт `test: check the tempo rescale in the browser`.
8. README: у розділі про темп (рядок з «**Темп і розмір такту:**») дописати: зміна BPM перераховує ноти й педалі — вони лишаються на тих самих тактах і долях, а звучать швидше чи повільніше; відлік — від початку першого такту (0 с); playhead і медіа лишаються на тій самій секунді; зміна розміру такту ноти не рухає; зміна BPM — один крок undo. Коміт `docs: describe how the tempo rescales notes and pedals`.
9. Усі перевірки з DoD і ручна перевірка в браузері.
10. У гілці до злиття: у CLAUDE.md `[x]` для 2.7 «Темп впливає на відтворення» (пункт «Одне джерело медіа» вже `[x]`, решта 2.8 лишається `[ ]`); статус 013 у розділі 8 — «виконано»; статус плану — `виконано`. Коміт `docs: mark task 013 as done`.
11. `git checkout main && git merge --no-ff fix/013-bpm-rescale`, повторні перевірки на `main` (включно з e2e), `git push origin main` і гілки.

## Тести

### `frontend/src/utils/tempoRescale.test.ts` (новий)
Порівняння чисел з дробовим множником — `toBeCloseTo(x, 9)`; для множників 2 і 0.5 — точна рівність.
- `tempoScaleFactor(120, 60) === 2`; `(120, 240) === 0.5`; `(90, 120) ≈ 0.75`; `(120, 0)`, `(0, 120)`, `(120, NaN)`, `(120, Infinity)`, `(-5, 120)` → `RangeError`.
- `rescaleTime(1.5, 2) === 3`; `rescaleTime(0, 3) === 0`; `rescaleTime(5, 2, 1) === 9` (origin 1: `1 + 4·2`); `rescaleTime(1, 2, 1) === 1` (точка origin нерухома).
- `rescaleNotes`:
  - `[{ id: 'a', pitch: 60, start: 1, duration: 0.5, velocity: 90 }]`, factor 2 → `[{ id: 'a', pitch: 60, start: 2, duration: 1, velocity: 90 }]`;
  - factor 0.5 → `start 0.5, duration 0.25`;
  - порядок і id зберігаються для трьох нот у «перемішаному» порядку (`start` 2, 0, 1);
  - `[]` → той самий масив (`toBe`); factor 1 → той самий масив;
  - нота `duration 0.01`, factor `1/15` → `duration === MIN_NOTE_DURATION` (0.001);
  - вхідний масив і об'єкти не змінено (заморожені через `Object.freeze`, тест не кидає і вхід `toEqual` копії).
- `rescalePedals`:
  - `{ sustain 1–2 }`, factor 2 → `2–4`; factor 0.5 → `0.5–1`;
  - педалі, що торкаються (`a: 0–1`, `b: 1–2`, sustain), factor `120/90` → `a.end === b.start` (строга рівність);
  - педалі різних типів з однаковими інтервалами масштабуються незалежно, жодна не зливається;
  - **злиття:** sustain `a: 0–0.01`, `b: 0.0101–1`, factor `1/15`. Після масштабування `a` = `0–0.000667`, нормалізація дає `0–0.001`; `b` починається з `0.000673` < `0.001` → результат `[{ id: 'a', type: 'sustain', start: 0, end: 1/15 }]` (`toBeCloseTo`), `b` видалено. Педаль `soft` `c: 0.0101–1` у тому самому вхідному масиві не зливається ні з чим (`start ≈ 0.000673`, `end ≈ 1/15`);
  - злиття ланцюжком: sustain `0–0.01`, `0.0101–0.0201`, `0.0202–1`, factor `1/15` → одна педаль з id першої, `start 0`, `end ≈ 1/15` (друга після нормалізації закінчується в `0.001673`, третя починається в `0.001347`, тож теж зливається);
  - без граничних випадків (`0–1`, `1–2`, `3–4`, factor `1/15`) злиття немає: три педалі;
  - порядок результату — вхідний (педалі подано у порядку `start` 2, 0);
  - `[]` → той самий масив; factor 1 → той самий масив;
  - жодні дві педалі одного типу в результаті не перетинаються (перевірка `pedalsOverlap` для всіх пар) — для випадкового набору з 50 неперетинних педалей (детермінований генератор з фіксованим seed) при factor `20/300` і `300/20`.
- `rescaleProjectTempo`:
  - проект `bpm 120`, `4/4`, нота `start 2` (такт 2, доля 1), нота `start 2.75` (такт 2, доля 2.5), sustain `2–3` → `bpm 60`: `bpm === 60`, ноти `start 4` і `5.5`, педаль `4–6`; `secondsToBarPosition` для кожної ноти до й після дає однакові `bar`, `beat` і `fraction` (`toBeCloseTo`);
  - те саме для `bpm 90` і `6/8` (позиція в тактах/долях однакова, `toBeCloseTo`);
  - **20 і 300 BPM звучать по-різному:** нота на такті 2 (`start 2` при 120, 4/4) → при 20 BPM `start 12`, при 300 BPM `start 0.8`;
  - `bpm` дорівнює поточному → той самий об'єкт (`toBe`);
  - `timeSignature` — той самий об'єкт; порожній проект → нові `bpm`, `notes`/`pedals` ті самі масиви;
  - шлях туди й назад `120 → 97.5 → 120` повертає секунди з точністю `toBeCloseTo(x, 9)`.

### `frontend/src/state/projectReducer.test.ts` (зміна одного тесту + доповнення)
Тест «changes bpm without moving notes in seconds» фіксував стару поведінку, яку вимога 2.7 прямо скасовує. Він **замінюється** (це не послаблення, а нова вимога) тестом «rescales notes and pedals to keep their bars and beats»: `makeState()` (bpm 120; `n1 0/0.5`, `n2 0.5/0.5`, `n3 1/1`; sustain `0–1`, soft `0.5–2`) → `setBpm(60)` → `bpm 60`; ноти `0/1`, `1/1`, `2/2`; педалі `0–2`, `1–4`; id і порядок ті самі.
Нові тести в `describe('project/setBpm')`:
- `setBpm(240)` → ноти `0/0.25`, `0.25/0.25`, `0.5/0.5`.
- `setBpm(1000)` → bpm 300, ноти масштабовано з factor `120/300` (`n3.start ≈ 0.4`); `setBpm(1)` → bpm 20, `n3.start === 6`.
- `setBpm(NaN)`, `setBpm(Infinity)`, `setBpm(120)` → той самий `state` (як і зараз).
- Стан з bpm 300 і `setBpm(1000)` (після clamp те саме значення) → той самий `state`.
- `replaceProject(other)` і `loadProject(other)` з іншим bpm → результат `toBe`/`toEqual` `other`, секунди нот не перераховано (явний тест, що імпорт не зачеплено).
- `setTimeSignature({ numerator: 3, denominator: 8 })` → `notes` і `pedals` ті самі масиви (`toBe`) — зміна розміру такту ноти не рухає.

### `frontend/src/state/history.test.ts` (доповнення)
- «records a tempo change as one undo step»: `addFirstNote()` (нота `start 0, duration 0.5`) + `addNotes([{ id: 'n2', pitch: 64, start: 1, duration: 0.5, velocity: 90 }])` → `setBpm(60)` → `past.length` зросла на 1, `present.bpm 60`, `n2.start 2`, `n2.duration 1`. `undo()` → `present` — той самий об'єкт, що до зміни (`toBe`), `n2.start 1`. `redo()` → `bpm 60`, `n2.start 2`.
- Наявні тести не змінюються: «clears the redo stack…» і «starts a new history…» перевіряють лише `bpm` і не залежать від секунд нот.

### `frontend/src/components/TempoControls.test.tsx` (доповнення)
Новий тест із власною пробою: `ProjectProvider initialProject={{ bpm 120, 4/4, notes: [{ id 'a', pitch 60, start 1, duration 0.5, velocity 100 }], pedals: [{ id 'p', type 'sustain', start 1, end 2 }] }}` > `TempoControls` + проба, що виводить `a.start/a.duration p.start-p.end`, і кнопки «undo»/«redo» з `useHistoryApi()`.
- `commit(tempo, '60')` → проба `2/1 2-4`, поле `60`.
- Клік «undo» → проба `1/0.5 1-2`, поле `120`. Клік «redo» → `2/1 2-4`, поле `60`.
- Зміна значення поля без Enter/blur (лише `change`) → проба не змінилась (одна дія лише на commit).
Наявні тести не змінюються (у них проект без нот).

### `frontend/src/state/TransportProvider.test.tsx` (доповнення)
- `Probe` отримує ще одну кнопку `tempo60` (`dispatch(setBpm(60))`); наявні кнопки й тести не змінюються.
- «plays notes at the rescaled time after a tempo change»: `setup([a, c])`, де `c = { id: 'c', pitch: 67, start: 1, duration: 0.5, velocity: 70 }`. `click('tempo60')`, `click('toggle')`, `resolveWith(engine)`. `engine.time = 1.0`, `tick` → атаки `pitch 67` ще немає (раніше вона була б у `1.05`). `engine.time = 1.9`, `tick` → є `{ op: 'attack', channel: 'playback', pitch: 67, velocity: 70, time: 2.05 }`. Атака `a` — як і раніше в `0.05`.
- «applies a tempo change during playback»: `setup([a, c])`, `toggle`, `resolveWith`, `engine.time = 0.3`, `tick`; `click('tempo60')`; `engine.time = 1.9`, `tick` → атака `pitch 67` з `time 2.05`, і жодної атаки `pitch 67` з `time 1.05` у `engine.calls`.

### Backend — `backend/tests/test_midi_export.py` (доповнення, код не змінюється)
- `test_same_beats_at_another_tempo_give_the_same_ticks`: `simple(note_events([note("a", 60, 0.5, 1.125, 64)], 120)) == simple(note_events([note("a", 60, 1.0, 2.25, 64)], 60))` (обидва `[(480, …), (1560, …)]`); `simple(pedal_events([pedal("p", "sustain", 0.5, 1.5)], 120)) == simple(pedal_events([pedal("p", "sustain", 1.0, 3.0)], 60))`. Фіксує, що перераховані на frontend секунди дають у файлі ті самі тіки.

### E2E — `frontend/e2e/tempo.spec.ts` (новий, Playwright)
Помічники з `e2e/helpers.ts` (`openApp`, `clickGrid`, `grid`, `notes`, `PX_PER_SECOND`); поле «Tempo (quarter notes per minute)»; кнопки «Undo»/«Redo» у регіоні «Piano roll».
1. **Нота переміщується за темпом.** `clickGrid(page, 1.02, C4)` (нота з 1.0 с, довжина кроку сітки 0.125 с). Лівий край ноти відносно `grid` ≈ 100 px (±1), ширина ≈ 12.5 px (±1). `tempo.fill('60')`, `tempo.press('Enter')` → лівий край ≈ 200 px, ширина ≈ 25 px. Поле показує `60`.
2. **Undo/redo одним кроком.** Нота з 1.0 с, `tempo 60` + Enter. Клік «Undo» → лівий край ≈ 100 px, поле `120`, нота є. Ще один клік «Undo» → нот 0, кнопка «Undo» вимкнена (у історії було рівно два кроки: нота і темп). Клік «Redo» двічі → нота на ≈ 200 px, поле `60`.
3. **Швидший темп стискає.** Нота з 1.0 с, `tempo 240` → лівий край ≈ 50 px.

### Ручна перевірка в браузері
`cd backend && uv run uvicorn app.main:app`, `cd frontend && npm run dev`, http://localhost:5173.
1. Кілька нот на різних тактах і sustain-педаль. BPM 120 → Play: запам'ятати звучання. BPM 20 → ноти й педаль розтягнулися, лишились на тих самих лініях тактів і доль; Play — звучить значно повільніше. BPM 300 → стиснулось, звучить швидко. (Раніше 20 і 300 звучали однаково.)
2. Виділити ноту: інспектор показує `bar N, beat M` — однаково до й після зміни BPM, а тривалість у секундах змінилась пропорційно.
3. Ctrl+Z (фокус поза полем) → повертаються і BPM, і положення нот одним кроком; Ctrl+Y/Ctrl+Shift+Z — знову перераховано.
4. Змінити BPM під час відтворення → ноти після playhead грають у новому темпі без зупинки; playhead не стрибає.
5. Завантажити відео, розставити ноти, змінити BPM → відео лишається на тому ж кадрі (playhead на тій самій секунді), ноти змістились відносно відео.
6. Змінити розмір такту 4/4 → 3/4 → ноти не рухаються.
7. Експорт `.mid` після зміни BPM і відкриття в сторонній програмі (MuseScore/DAW): ноти на тих самих тактах, темп — новий.
8. Імпорт `.mid` → BPM і ноти з файлу, без перерахунку; потім зміна BPM перераховує імпортовані ноти.
9. Консоль без помилок і попереджень React.

## Критерії готовності (Definition of Done)
- [ ] `cd frontend && npm test -- --run && npm run lint && npm run typecheck && npm run build && npx prettier --check .` — зелено.
- [ ] `cd frontend && npm run e2e` — зелено, включно з 3 тестами `e2e/tempo.spec.ts`.
- [ ] `cd backend && uv run pytest && uv run ruff check . && uv run ruff format --check . && uv run mypy app` — зелено; `git diff main --stat -- backend/app` порожній (змінено лише `backend/tests/test_midi_export.py`).
- [ ] `git diff main -- frontend/package.json frontend/package-lock.json backend/pyproject.toml` порожній (нових залежностей немає).
- [ ] Усі тести з розділу «Тести» наявні й проходять; `tempoScaleFactor`, `rescaleTime`, `rescaleNotes`, `rescalePedals`, `rescaleProjectTempo` мають тести.
- [ ] Змінені наявні тести: `git diff main --name-status -- frontend/src | grep -E '\.test\.tsx?$'` показує `M` лише для `projectReducer.test.ts`, `history.test.ts`, `TempoControls.test.tsx`, `TransportProvider.test.tsx`, і `A` для `tempoRescale.test.ts`. У `projectReducer.test.ts` видалено лише тест «changes bpm without moving notes in seconds» (замінено); в інших — видалених рядків немає, крім рядків імпорту.
- [ ] `grep -n "rescaleProjectTempo" frontend/src/state/projectReducer.ts` знаходить виклик у гілці `project/setBpm`.
- [ ] `git diff main --stat -- frontend/src/audio frontend/src/components/TempoControls.tsx frontend/src/state/history.ts frontend/src/state/actions.ts frontend/src/state/types.ts` порожній (транспорт, UI поля, історія й модель не змінювались).
- [ ] README описує перерахунок нот при зміні BPM (такти/долі зберігаються, відлік від 0 с, playhead на місці, один крок undo).
- [ ] Ручна перевірка (9 пунктів) пройдена; `git status --porcelain` не показує медіафайлів, `test-results/` чи `playwright-report/`.
- [ ] У гілці до злиття: у CLAUDE.md `[x]` для 2.7 «Темп впливає на відтворення»; статус 013 у розділі 8 — «виконано»; статус плану — `виконано`.
- [ ] Гілку `fix/013-bpm-rescale` злито в `main` (`--no-ff`) і запушено; на `main` перевірки (включно з e2e) зелені.

## Ризики / відкриті питання
- **Узгодження з 015 (offset).** Зараз перший такт починається в 0 с таймлайну, і `rescaleProjectTempo` викликається з `origin = FIRST_BAR_START_SECONDS = 0`. Розділ 7 каже, що offset — відображення між часом медіа й часом таймлайну, а ноти зберігаються в часі таймлайну. Якщо 015 лишить такт 1 у 0 с таймлайну (а зміщення застосує до медіа), reducer не зміниться. Якщо ж 015 вирішить, що такт 1 починається в `offset` секунд таймлайну, reducer передасть `origin = offset`. Тоді 015 має визначити, що робити з нотами до такту 1 (зараз формула з нормалізацією притисне їх до 0 с). Параметр `origin` уже покритий тестами формули, тож 015 не доведеться змінювати самі функції.
- **Похибка float.** Секунди після кількох змін BPM можуть відрізнятися від «ідеальних» на ~1e-15 с. Сітка, квантизація й експорт (округлення до тіка ≈ 1 мс) цього не помічають. Undo повертає точні попередні значення (історія зберігає об'єкти, а не перераховує назад).
- **Злиття коротких педалей** відбувається лише для педалей коротших за 15 мс при сильному стисненні (до 300 BPM з 20 BPM) і лише якщо наступна педаль того самого типу починається впритул. Результат чутно не відрізняється; undo повертає обидві.
- **Ноти, що звучать під час зміни BPM** (атака до playhead, кінець після): якщо після перерахунку атака опиняється після playhead, нота обривається і звучить знову у свій новий час; якщо лишається до playhead — звучить далі, а відпускається в новий час. Це наявна поведінка `resyncSchedule` для будь-якої зміни проекту під час відтворення.
- **Відкрите питання до власника (не блокує, прийнято дефолт): playhead при зміні BPM.** Прийнято: playhead лишається на тій самій секунді (разом з кадром відео), тож його такт змінюється. Альтернатива — перераховувати й позицію playhead, коли медіа не завантажене. Це інша поведінка залежно від наявності медіа, тому поки не робимо.
- **Відкрите питання до власника (не блокує): «змінити BPM без перерахунку нот».** Коли ноти вже записані на слух під відео, а BPM треба підібрати під музику, перерахунок заважає. Можливе майбутнє рішення — окремий перемикач або модифікатор (наприклад, Alt+Enter у полі темпу). Зараз помилкову зміну скасовує undo.
- **Обсяг.** Одна чиста функція з тестами, зміна одного рядка reducer, тести, e2e і README. Вкладається в одну гілку; ділити не потрібно.
