# 009 — Експорт у `.mid` (backend на `mido`) + завантаження файлу

**Статус:** схвалено
**Гілка:** feature/009-midi-export

## Мета
Користувач натискає «Export .mid» у верхній панелі й отримує файл `arrangement.mid` (Standard MIDI File). Файл містить ноти з velocity, педалі sustain / sostenuto / soft як CC-події, темп і розмір такту. Файл будує backend на `mido`: frontend надсилає поточний `Project` у JSON, backend валідує його наявною Pydantic-моделлю (002), конвертує секунди в тіки (`app/services/timing.py`, 002) і повертає байти файлу.

Пункти розділу 2 CLAUDE.md, які задача **закриває повністю** (після виконання ставимо `[x]`):
- 2.6 «Завантаження (download) результату роботи у форматі `.mid` (Standard MIDI File), включно з нотами, velocity, педалями (CC-події) і темпом».
- 2.6 «Експортований файл коректно відкривається у сторонніх програмах (перевіряється тестом повторного читання файлу)».

Після задачі невиконаним лишається лише 2.2 «Виділення кількох нот, undo/redo» (010).

Задача спирається на готове й не дублює його:
- `Project`, `Note`, `PedalEvent`, `TimeSignature`, `CamelModel` (`backend/app/models/project.py`) — модель запиту з усіма обмеженнями (зокрема заборона перетину однотипних педалей);
- `seconds_to_ticks`, `ticks_to_seconds`, `bpm_to_midi_tempo`, `TICKS_PER_QUARTER = 480` (`backend/app/services/timing.py`);
- контрактний фікстур `backend/tests/fixtures/sample_project.json`;
- стан проекту на frontend (`useProject()`), який reducer завжди тримає валідним: ноти й педалі нормалізовані, однотипні педалі не перетинаються (004). Тож коректний стан редактора backend ніколи не відхиляє;
- Vite-проксі `/api` → `http://localhost:8000` (001).

## Поза межами задачі
- **Імпорт `.mid`** у редактор, збереження / відкриття проекту (JSON, localStorage). Функція повторного читання в тестах — лише тестовий помічник, а не фіча.
- Зміна темпу всередині твору (tempo map), кілька розмірів такту. У проекті один BPM і один розмір (002), тож у файлі одна подія `set_tempo` і одна `time_signature` на тіку 0.
- Зсув медіа (offset) — його немає в моделі (008). Час 0 таймлайну — тік 0 файлу.
- Кілька доріжок / каналів, вибір інструмента. Усе фортепіано — одна доріжка, канал 1 (індекс 0), програма 0 (Acoustic Grand Piano).
- Експорт «звучних» тривалостей з урахуванням педалей (`noteSoundingEnds`). У файл пишеться момент **відпускання клавіші** (`start + duration`), а педалі — окремими CC-подіями. Подовження звуку робить програвач, що читає файл, так само як на справжньому фортепіано.
- Діалог вибору імені файлу чи його формування з імені медіа. Ім'я фіксоване: `arrangement.mid` (див. «Ризики / відкриті питання»).
- Гаряча клавіша експорту — 010.
- Експорт аудіо (WAV/MP3) з нот.

## Технічні рішення

### Де будувати файл: backend на `mido`
| Варіант | Плюси | Мінуси |
|---|---|---|
| **Backend, `mido`** | Так визначено в стеку (розділ 3) і в дорожній карті. `mido` — зріла чиста Python-бібліотека (MIT, лише залежність `packaging`), вміє і писати, і читати SMF, тож тест повторного читання — у тій самій мові. Функції тіків уже є на backend (002) | Експорт потребує запущеного backend |
| Frontend (`@tonejs/midi` або ручний запис) | Працює без backend | Нова JS-залежність, суперечить стеку й дорожній карті; тіки довелося б дублювати на frontend |
| Backend, `pretty_midi` / `MIDIUtil` | — | `pretty_midi` тягне `numpy`; `MIDIUtil` лише пише, тож для тесту читання все одно потрібна інша бібліотека |

**Нова залежність:** `mido>=1.3` (остання 1.3.3, жовтень 2024) у `[project].dependencies` через `uv add mido`. Інших нових залежностей немає ні на backend, ні на frontend.

`mido` не постачає анотацій типів (`py.typed` немає). Для `mypy --strict` у `pyproject.toml` додається:
```toml
[[tool.mypy.overrides]]
module = ["mido", "mido.*"]
ignore_missing_imports = true
```
Об'єкти `mido` тоді мають тип `Any`. Щоб `Any` не розповзався, увесь код з `mido` зосереджено в `app/services/midi_export.py`, а назовні виходять лише типізовані значення (`bytes`, `list[MidiEvent]`). Власні stub-файли для `mido` не пишемо: використовується лише 4 класи/функції, а stub довелося б підтримувати.

### Структура файлу (SMF format 1)
- `MidiFile(type=1, ticks_per_beat=TICKS_PER_QUARTER)` (480 PPQ). Format 1 з окремою «conductor»-доріжкою — те, що очікують DAW і нотні редактори (MuseScore, Reaper, Logic): темп і розмір на доріжці 0, ноти — на доріжці 1. Format 0 теж коректний, але частина програм тоді імпортує темп як частину доріжки інструмента.
- **Доріжка 0 (conductor)**, усі події на тіку 0:
  1. `MetaMessage('track_name', name='MIDI Redactor')`;
  2. `MetaMessage('set_tempo', tempo=bpm_to_midi_tempo(project.bpm))`;
  3. `MetaMessage('time_signature', numerator=ts.numerator, denominator=ts.denominator, clocks_per_click=24, notated_32nd_notes_per_beat=8)`;
  4. `MetaMessage('end_of_track')`.
- **Доріжка 1 (piano)**:
  1. `MetaMessage('track_name', name='Piano')`, тік 0;
  2. `Message('program_change', channel=0, program=0)`, тік 0;
  3. події нот і педалей у порядку сортування (нижче), `time` — дельта від попередньої події;
  4. `MetaMessage('end_of_track')` з дельтою 0 після останньої події.
  
  `end_of_track` додається явно, а не покладаючись на поведінку `mido.save`, щоб структура файлу була повністю визначена кодом і тестами.
- Ноти: `note_on` з `velocity = note.velocity`; відпускання — окреме повідомлення `note_off` з `velocity = 64` (`NOTE_OFF_VELOCITY`, стандартне значення «release velocity не підтримується»), а не `note_on` з velocity 0: так файл однозначніший для читання і тестів.
- Педалі: `control_change` з `control = 64 / 66 / 67` для `sustain / sostenuto / soft`, `value = 127` при натисканні й `0` при відпусканні.
- Порожній проект (без нот і педалей) — валідний файл: conductor-доріжка і доріжка piano з `track_name`, `program_change`, `end_of_track`. Кнопку експорту для нього не блокуємо.

### Секунди → тіки (чисті функції) — `backend/app/services/midi_export.py`
Єдине джерело правди — секунди (розділ 7). Тіки рахуються лише тут, через наявний `seconds_to_ticks(seconds, project.bpm)` (округлення half-up).

```python
PEDAL_CONTROLLERS: Final[dict[PedalType, int]] = {"sustain": 64, "sostenuto": 66, "soft": 67}
PEDAL_DOWN: Final = 127
PEDAL_UP: Final = 0
PIANO_CHANNEL: Final = 0
PIANO_PROGRAM: Final = 0
NOTE_OFF_VELOCITY: Final = 64
CONDUCTOR_TRACK_NAME: Final = "MIDI Redactor"
PIANO_TRACK_NAME: Final = "Piano"

EventKind = Literal["note_on", "note_off", "control_change"]

class EventOrder(IntEnum):
    """Order of events that fall on the same tick."""
    PEDAL_UP = 0          # any pedal released
    PEDAL_DOWN = 1        # sustain or soft pressed
    NOTE_OFF = 2
    NOTE_ON = 3
    SOSTENUTO_DOWN = 4    # after note_on: sostenuto catches keys struck on the same tick

@dataclass(frozen=True, slots=True)
class MidiEvent:
    tick: int
    order: EventOrder
    kind: EventKind
    number: int   # note number or controller number
    value: int    # velocity or controller value

@dataclass(frozen=True, slots=True)
class TickSpan:
    on: int
    off: int

def note_events(notes: Sequence[Note], bpm: float, ppq: int = TICKS_PER_QUARTER) -> list[MidiEvent]: ...
def pedal_events(pedals: Sequence[PedalEvent], bpm: float, ppq: int = TICKS_PER_QUARTER) -> list[MidiEvent]: ...
def sort_events(events: Iterable[MidiEvent]) -> list[MidiEvent]: ...   # key (tick, order, number)
def build_midi_file(project: Project, ppq: int = TICKS_PER_QUARTER) -> Any: ...  # mido.MidiFile
def export_midi(project: Project) -> bytes: ...
```

**Ноти — `note_events`:**
1. Для кожної ноти `on = seconds_to_ticks(start, bpm, ppq)`, `off = max(on + 1, seconds_to_ticks(start + duration, bpm, ppq))`. Нота завжди має хоча б 1 тік: `duration = 0.001` с при 20 BPM дає 0.16 тіка, і без цього правила `note_on` і `note_off` стали б на один тік, а деякі програми таку ноту пропускають або «застрягають».
2. Ноти групуються за `pitch`. У групі сортуються за `(on, -off, -velocity, id)`.
3. Модель дозволяє перетин нот однієї висоти (002 залишив рішення для 009), а в MIDI дві одночасно «натиснуті» однакові клавіші на одному каналі дають невизначену поведінку (програма може зняти обидві ноти першим `note_off`). Правило, як у більшості DAW: повторний удар відпускає попередню клавішу. Група проходиться по порядку, і кожна нота `next` порівнюється з **останньою залишеною** нотою групи `prev` (відкинуті ноти в порівнянні не беруть участі):
   - `next.on == prev.on` → `next` відкидається (лишається перша після сортування: найдовша, далі з більшою velocity, далі з меншим `id`);
   - інакше, якщо `prev.off > next.on` → `prev.off = next.on` (попередня нота обрізається до початку наступної). Оскільки `next.on > prev.on`, обрізана нота має щонайменше 1 тік. Далі `next` стає `prev`.
   
   **Відмінність від програвання в редакторі** (свідомий компроміс): у редакторі (правило 4 `noteSoundingEnds`) повторний удар зупиняє звук попередньої ноти, але не раніше за її `keyUp`, тобто дві перетнуті однакові ноти звучать одночасно до своїх відпускань. В одному MIDI-каналі так записати не можна без невизначеної поведінки, тому у файлі перша нота обривається на початку другої. Це описується в README і в «Ризиках».
4. Кожна нота дає `MidiEvent(on, NOTE_ON, "note_on", pitch, velocity)` і `MidiEvent(off, NOTE_OFF, "note_off", pitch, NOTE_OFF_VELOCITY)`.

**Педалі — `pedal_events`:**
1. Для кожної педалі `on = seconds_to_ticks(start)`, `off = seconds_to_ticks(end)`; якщо `off <= on` → `off = on + 1`.
2. Педалі групуються за типом, сортуються за `(on, off, id)`. У секундах однотипні педалі не перетинаються (гарантує модель), але після округлення й правила «мінімум 1 тік» дуже короткі педалі можуть зачепити сусіда. Тоді `prev.off = next.on`, а якщо після цього `prev.off <= prev.on` — педаль `prev` відкидається (вона коротша за 1 тік і злилася з наступною). Дотик (`a.end == b.start`) у тіках лишається дотиком.
3. Кожна педаль дає `MidiEvent(on, order, "control_change", controller, PEDAL_DOWN)` з `order = SOSTENUTO_DOWN` для sostenuto і `PEDAL_DOWN` для sustain / soft, та `MidiEvent(off, PEDAL_UP, "control_change", controller, PEDAL_UP)`.

**Порядок подій на одному тіку — `sort_events`**, ключ `(tick, order, number)`. Порядок узгоджено з семантикою програвання в редакторі (`noteSoundingEnds`, 004/005), щоб файл звучав у сторонньому програвачі так само:
- відпускання педалі перед натисканням → дотик двох sustain (`a.end == b.start`) дає «перепедалізацію» `CC64 0` → `CC64 127`, а не застряглу або зняту педаль;
- натискання sustain / soft перед `note_off` → нота, відпущена рівно в момент натискання sustain, утримується (у редакторі інтервал педалі включає `start`);
- `note_off` перед `note_on` → повторний удар тієї ж клавіші на тому самому тіку коректний;
- натискання sostenuto після `note_on` і після `note_off` → sostenuto ловить клавішу, натиснуту на тому самому тіку (`note.start <= pedal.start`), і не ловить відпущену в цей момент (`pedal.start < keyUp`), як у редакторі;
- однаковий `order` → за зростанням `number` (детермінований вивід).

**`build_midi_file`** будує дві доріжки (див. «Структура файлу»), переводячи абсолютні тіки відсортованих подій у дельти. **`export_midi`** викликає `build_midi_file(project)` і `midi_file.save(file=buffer)` у `io.BytesIO`, повертає `buffer.getvalue()`.

### API — `backend/app/api/export.py`
- `router = APIRouter(tags=["export"])`, підключається в `create_app()` з `prefix="/api"`.
- `POST /api/export/midi`
  - тіло: `Project` у JSON (camelCase, як у фікстурі 002). Валідацію робить FastAPI/Pydantic: невалідний проект (pitch 109, перетин однотипних педалей, зайве поле тощо) → **422** зі стандартним `detail`;
  - відповідь **200**: `Response(content=export_midi(project), media_type="audio/midi", headers={"Content-Disposition": 'attachment; filename="arrangement.mid"'})`;
  - у декораторі `responses={200: {"content": {"audio/midi": {}}, "description": "Standard MIDI File"}}` і `response_class=Response`, щоб `/docs` показував бінарну відповідь;
  - обробник синхронний (`def`), як `health`: генерація файлу — чиста CPU-робота на мілісекунди, FastAPI виконає її в threadpool.
- Ім'я файлу — константа `MIDI_FILENAME: Final = "arrangement.mid"` у `app/api/export.py`.
- CORS не змінюється: frontend ходить через Vite-проксі (same-origin), а `Content-Disposition` frontend не читає (ім'я задає сам).
- Нова Pydantic-модель не потрібна: запит — наявний `Project`, відповідь — байти.

### Frontend
- **`src/api/client.ts`** (доповнення):
  ```ts
  export const MIDI_EXPORT_URL = '/api/export/midi';
  export const MIDI_EXPORT_FILENAME = 'arrangement.mid';
  export type MidiExportErrorKind = 'invalid' | 'server' | 'network';
  export class MidiExportError extends Error {
    readonly kind: MidiExportErrorKind;
    readonly status: number | null;
  }
  export async function exportMidi(project: Project, signal?: AbortSignal): Promise<Blob>;
  ```
  - `fetch(MIDI_EXPORT_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(project), signal })`;
  - `response.ok` → `await response.blob()`;
  - `422` → `MidiExportError('invalid', 422)`; інший не-ok статус → `MidiExportError('server', status)`;
  - `fetch` кинув помилку: якщо це `AbortError` (`signal?.aborted`) — прокидається як є; інакше → `MidiExportError('network', null)`.
  - `Project` із `src/state/types.ts` серіалізується напряму: поля й camelCase збігаються з backend (контракт 002).
- **`src/utils/download.ts`** (новий):
  ```ts
  export const REVOKE_DELAY_MS = 1000;
  export function downloadBlob(blob: Blob, filename: string): void;
  ```
  `URL.createObjectURL(blob)` → тимчасовий `<a href download={filename} hidden>` у `document.body` → `click()` → `remove()` → `setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS)`. Відкладене звільнення URL — бо Firefox може ще не почати читати blob у момент `click()`. Бібліотеку `file-saver` не беремо: це ~10 рядків.
- **`src/components/ExportButton.tsx`** (новий), у `header` після `<ProjectInfo />`, перед `<BackendStatus />`:
  - `<button type="button" onClick={...} disabled={exporting}>{exporting ? 'Exporting…' : 'Export .mid'}</button>`, `aria-label` збігається з текстом;
  - компонент викликає `const project = useProject()` на верхньому рівні (як і всі хуки), а обробник кліку замикає значення з останнього рендеру, тобто актуальний проект → `exportMidi(project, controller.signal)` → `downloadBlob(blob, MIDI_EXPORT_FILENAME)`; поки запит триває, кнопка вимкнена (без повторних запитів);
  - помилка → `<span role="alert" className="export-button__error">` з текстом:
    - `invalid` → `Could not export: the project is invalid.`
    - `server` → `Could not export: server error (500).` (зі статусом)
    - `network` → `Could not export: the backend is unavailable.`
    
    Наступна спроба прибирає повідомлення на старті запиту;
  - `AbortController` зберігається в `useRef`; unmount → `abort()`; `AbortError` ігнорується (без `setState` після unmount і без завантаження);
  - обгортка — `<div className="export-button">`. CSS у `src/App.css`: `.export-button { display: inline-flex; gap: 8px; align-items: center; }`, `.export-button__error` — той самий колір, що в `.transport-controls__error`.
- Стан експорту локальний (`useState` у компоненті): він не є частиною `Project` і не потрібен іншим компонентам.

## Кроки реалізації
1. Від актуального `main` створити гілку `feature/009-midi-export`.
2. Backend: `cd backend && uv add mido` (оновлює `pyproject.toml` і `uv.lock`); додати mypy-override для `mido` у `pyproject.toml`. Перевірити, що `uv run pytest` і `uv run mypy app` зелені. Коміт `chore: add mido dependency`.
3. Backend: `app/services/midi_export.py` — константи, `EventOrder`, `MidiEvent`, `TickSpan`, `note_events`, `pedal_events`, `sort_events` + `tests/test_midi_export.py` (розділ «Тести», частина «події»). Коміт `feat: convert notes and pedals to MIDI events`.
4. Backend: `build_midi_file`, `export_midi` + тестовий помічник `tests/midi_readback.py` + тести файлу (частина «файл» і «повторне читання»). Коміт `feat: build a Standard MIDI File from the project`.
5. Backend: `app/api/export.py`, підключення в `app/main.py` + `tests/test_export_api.py`. Коміт `feat: add POST /api/export/midi endpoint`.
6. Frontend: `exportMidi`, `MidiExportError` у `src/api/client.ts` + новий `src/api/client.test.ts`; `src/utils/download.ts` + `download.test.ts`. Коміт `feat: add MIDI export client and file download helper`.
7. Frontend: `src/components/ExportButton.tsx` + `ExportButton.test.tsx`, підключення в `App.tsx`, CSS, доповнення `App.test.tsx`. Коміт `feat: export the project as a .mid file`.
8. README: новий розділ «Експорт у MIDI» після «Синхронізації»: кнопка «Export .mid», що саме потрапляє у файл (format 1, 480 PPQ, conductor-доріжка з темпом і розміром, доріжка «Piano» на каналі 1, CC64/66/67), правила перетину однакових нот (зокрема відмінність від програвання в редакторі: у файлі перша з перетнутих однакових нот обривається на початку другої) і мінімум 1 тік, експорт потребує запущеного backend. Коміт `docs: describe MIDI export`.
9. Усі перевірки з DoD і ручна перевірка в браузері (у гілці).
10. У гілці (**до** злиття): у CLAUDE.md `[x]` для обох пунктів 2.6; статус 009 у розділі 8 — «виконано»; статус плану — `виконано`. Коміт `docs: mark task 009 as done`.
11. `git checkout main && git merge --no-ff feature/009-midi-export`, повторні перевірки на `main`, push `main` і гілки.

## Тести
Наявні тести не змінюються, крім доповнення `frontend/src/App.test.tsx` (новий `it`, наявні рядки не видаляються).

### Backend: `tests/test_midi_export.py` — події (без `mido`)
Позначення: `note(id, pitch, start, duration, velocity=100)`, `pedal(id, type, start, end)`; `bpm = 120`, 480 PPQ, тобто 1 с = 960 тіків. Подія записується як `(tick, kind, number, value)`. Запис `C4 [s, e)` означає ноту з `start = s` і **кінцем** `e`, тобто `duration = e − s` (наприклад, `C4 [0.004, 1)` → `note(..., 60, 0.004, 0.996)`); у викликах `note(...)` четвертий аргумент — саме тривалість.
- `note_events([note('a', 60, 0.5, 1.125, 64)], 120)` → `[(480, note_on, 60, 64), (1560, note_off, 60, 64)]`.
- Мінімум 1 тік: `note('a', 60, 0, 0.001)` при `bpm 20` → `on 0`, `off 1`.
- Перетин однакових нот: `a = C4 [0, 1)`, `b = C4 [0.5, 1)` → `a` відпускається на 480, `b` — `on 480`, `off 960`.
- Однаковий старт: `a = C4 [0, 0.5) v80`, `b = C4 [0, 1) v100` → лишається лише `b` (`on 0`, `off 960`); `a = C4 [0, 1) v90`, `b = C4 [0, 1) v100` → лишається `b`; однакові тривалість і velocity, id `'x'` і `'y'` → лишається `'x'`.
- Різна висота не обрізає: `C4 [0, 1)`, `E4 [0.5, 1)` → `C4 off 960`.
- Обрізання після правила «мінімум 1 тік»: `bpm 20`, `a = C4 [0, 0.001)`, `b = C4 [0.004, 1)` (`a.on 0`, `a.off 0 → 1`, `b.on = floor(0.64 + 0.5) = 1`) → `a.off 1`, `b.on 1`, `b.off 160`; на тіку 1 `note_off 60` іде перед `note_on 60`.
- Обрізання, коли `a` після мінімуму «налазить» на `b`: `bpm 20`, `a = C4 [0, 0.001)`, `b = C4 [0.002, 1)` (`b.on = floor(0.32 + 0.5) = 0`) → однаковий `on 0`, лишається лише `b` (довша): `(0, note_on)`, `(160, note_off)`.
- Вхідні ноти не мутуються (Pydantic-моделі до і після рівні).
- `pedal_events([pedal('p', 'sustain', 0, 1.5)], 120)` → `[(0, control_change, 64, 127), (1440, control_change, 64, 0)]`; sostenuto → контролер 66 з `order SOSTENUTO_DOWN`; soft → 67 з `order PEDAL_DOWN`.
- Дотик: sustain `[0, 1)` і `[1, 2)` → на тіку 960 спершу `CC64 0`, потім `CC64 127` (після `sort_events`).
- Коротка педаль зливається: `bpm 20`, sustain `[0, 0.001)` і `[0.001, 1)` → лише `(0, CC64 127)` і `(160, CC64 0)`.
- Мінімум 1 тік педалі: `bpm 20`, sustain `[0, 0.001)` (`on 0`, `off = floor(0.16 + 0.5) = 0 → 1`) → `[(0, control_change, 64, 127), (1, control_change, 64, 0)]`. Педаль створюється звичайним конструктором `PedalEvent(...)` (валідна: `end − start = MIN_PEDAL_DURATION`), без `model_construct`. При 120 BPM ця гілка недосяжна (будь-яка валідна педаль ≥ 0.96 тіка → ≥ 1 тік), тому тест саме з 20 BPM.
- `sort_events` — порядок на одному тіку: ноти `a = C4 [0, 0.5)`, `b = C4 [0.5, 1)`, `c = E4 [0.5, 1)`; педалі sustain `[0, 0.5)`, sustain `[0.5, 1.5)`, sostenuto `[0.5, 1)`. Події на тіку 480 → рівно `CC64 0`, `CC64 127`, `note_off 60`, `note_on 60`, `note_on 64`, `CC66 127`.
- `sort_events` детермінований: перемішаний вхід (`random.Random(0).shuffle`) дає той самий результат.

### Backend: `tests/test_midi_export.py` — файл і повторне читання
Помічник `tests/midi_readback.py` (лише для тестів, типізований):
```python
@dataclass(frozen=True)
class ReadBack:
    type: int
    ticks_per_beat: int
    track_names: list[str]
    tempos: list[tuple[int, int]]                    # (abs tick, microseconds per quarter)
    time_signatures: list[tuple[int, int, int]]       # (abs tick, numerator, denominator)
    programs: list[tuple[int, int, int]]              # (abs tick, channel, program)
    notes: list[tuple[int, int, int, int]]            # (pitch, on tick, off tick, velocity), paired on/off
    controls: list[tuple[int, int, int]]              # (abs tick, controller, value)
    track_ends: list[int]                             # abs tick of end_of_track per track

def read_midi(data: bytes) -> ReadBack  # mido.MidiFile(file=io.BytesIO(data)), abs ticks per track
```
- **Фікстур 002** `sample_project.json` → `read_midi(export_midi(project))`:
  - `type == 1`, `ticks_per_beat == 480`, `track_names == ['MIDI Redactor', 'Piano']`;
  - `tempos == [(0, 500000)]`, `time_signatures == [(0, 3, 4)]`, `programs == [(0, 0, 0)]`;
  - `notes == [(21, 0, 240, 64), (60, 480, 1560, 100), (108, 1680, 2040, 127)]`;
  - `controls == [(0, 64, 127), (480, 66, 127), (1080, 67, 127), (1440, 64, 0), (1920, 67, 0), (2160, 66, 0)]`;
  - `track_ends == [0, 2160]`.
- **Round-trip у секундах:** проект `bpm 97.5`, `6/8`, 20 нот із псевдовипадковими (`random.Random(1)`) `start ∈ [0, 30)`, `duration ∈ [0.05, 2)`, pitch 21–108, velocity 1–127; ноти, що перетнулися б з іншою нотою тієї ж висоти, генератор пропускає (тоді правило обрізання не спрацьовує, і допуск чесний) і по одній педалі кожного типу. Після `read_midi` для кожної ноти: `pitch` і `velocity` збігаються; `ticks_to_seconds(on, 97.5)` (за **точним** BPM проекту, функція з `timing.py`) відрізняється від `start` не більше ніж на `half_tick + 1e-9` с, де `half_tick = 60 / 97.5 / 480 / 2`; те саме для кінця ноти й меж педалей. Так тест перевіряє лише квантування до тіка. Похибку округлення tempo до мікросекунди, яка накопичується з часом, тест навмисно не змішує з квантуванням: tempo перевіряється окремо точною рівністю `tempos == [(0, bpm_to_midi_tempo(97.5))]`, а `bpm_to_midi_tempo` уже покрито тестами 002. `time_signatures == [(0, 6, 8)]`, `tempos == [(0, bpm_to_midi_tempo(97.5))]`.
- Темп: `bpm 60` → `tempos == [(0, 1000000)]`; `bpm 90` → `666667`.
- Розмір `5/16` і `4/1` читаються назад без змін (крайні знаменники).
- Порожній проект → `notes == []`, `controls == []`, `track_names == ['MIDI Redactor', 'Piano']`, `programs == [(0, 0, 0)]`, `track_ends == [0, 0]`.
- Крайні висоти: `pitch 21` і `108`, `velocity 1` і `127` читаються без змін.
- Кожна доріжка закінчується рівно одним `end_of_track`, і він останній (перевірка на `mido`-об'єктах).
- **Незалежна перевірка структури SMF** (без `mido`, через `struct`): байти починаються з `b'MThd'`, довжина заголовка 6, `format 1`, `ntrks 2`, `division 480`; далі рівно два чанки `b'MTrk'`, сума `8 + len` усіх чанків дорівнює довжині файлу; кожен `MTrk` закінчується байтами `FF 2F 00`. Це підтверджує, що файл — коректний SMF, а не лише те, що `mido` читає свій же вивід.
- `export_midi` детермінований: той самий проект → однакові байти.

### Backend: `tests/test_export_api.py`
- `POST /api/export/midi` з фікстуром `sample_project.json` → 200, `content-type` починається з `audio/midi`, `content-disposition == 'attachment; filename="arrangement.mid"'`, тіло дорівнює `export_midi(Project.model_validate(fixture))`, а `read_midi(body).notes` має 3 ноти.
- Порожнє тіло `{}` → 200 (значення за замовчуванням: 120 BPM, 4/4), `read_midi(...).tempos == [(0, 500000)]`.
- `pitch 109` → 422, `detail` непорожній; дві sustain `[0, 2)` і `[1, 3)` → 422; зайве поле `"foo": 1` → 422; тіло не-JSON (`content="nope"`) → 422.
- `GET /api/export/midi` → 405.
- `/openapi.json` містить шлях `/api/export/midi` з `post` і `audio/midi` у відповіді 200.

### Frontend: `src/api/client.test.ts` (новий)
`fetch` підмінено через `vi.stubGlobal`.
- Успіх: `fetch` повертає `{ ok: true, status: 200, blob: async () => new Blob(['MThd'], { type: 'audio/midi' }) }` → `exportMidi(project)` повертає цей blob; `fetch` викликано з `'/api/export/midi'` і `{ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(project), signal: undefined }`.
- `{ ok: false, status: 422 }` → відхиляється з `MidiExportError`, `kind 'invalid'`, `status 422`.
- `{ ok: false, status: 503 }` → `kind 'server'`, `status 503`.
- `fetch` відхиляє `new TypeError('Failed to fetch')` → `kind 'network'`, `status null`.
- Скасування: `controller.abort()` до відповіді, `fetch` відхиляє `DOMException('aborted', 'AbortError')` → `exportMidi` відхиляється саме цим `DOMException` (не `MidiExportError`).

### Frontend: `src/utils/download.test.ts` (новий)
`URL.createObjectURL` → `'blob:test'`, `URL.revokeObjectURL` — шпигуни (`vi.stubGlobal` або `Object.defineProperty`, jsdom їх не має); `vi.spyOn(HTMLAnchorElement.prototype, 'click')` запам'ятовує `this`; `vi.useFakeTimers()`.
- `downloadBlob(blob, 'arrangement.mid')` → `createObjectURL` викликано з `blob`; `click` викликано один раз на `<a>` з `href 'blob:test'` і `download 'arrangement.mid'`; після виклику в `document.body` немає `<a>`.
- `revokeObjectURL` не викликано до `vi.advanceTimersByTime(REVOKE_DELAY_MS - 1)`; після ще 1 мс — викликано з `'blob:test'`.

### Frontend: `src/components/ExportButton.test.tsx` (новий)
Рендер у `ProjectProvider` з `initialProject` (100 BPM, 3/4, нота `n1` C4, sustain `p1`); `vi.mock('../utils/download.ts', ...)` з `downloadBlob: vi.fn()`; `fetch` підмінено.
- Кнопка «Export .mid» увімкнена; alert відсутній.
- Клік → `fetch` викликано з `'/api/export/midi'`, `JSON.parse(body)` глибоко дорівнює `initialProject`; після розв'язання `downloadBlob` викликано з blob-відповіддю і `'arrangement.mid'`.
- Поки `fetch` не розв'язано (відкладений promise): кнопка «Exporting…» вимкнена; другий клік не викликає `fetch` вдруге; після розв'язання знову «Export .mid» і увімкнена.
- Після додавання ноти (dispatch через тестовий компонент із `useProjectDispatch`) новий клік надсилає проект із двома нотами (експорт бере актуальний стан).
- `422` → `role="alert"` з `Could not export: the project is invalid.`, `downloadBlob` не викликано; `500` → `Could not export: server error (500).`; `TypeError` → `Could not export: the backend is unavailable.`
- Після помилки новий вдалий клік прибирає alert і викликає `downloadBlob`.
- Unmount під час запиту → `signal.aborted === true`; після відхилення `AbortError` `downloadBlob` не викликано, у консолі немає попереджень React (`vi.spyOn(console, 'error')` не викликано).

### Frontend: `src/App.test.tsx` (доповнення)
- «shows the export button»: у `banner` «Transport» є кнопка «Export .mid»; `fetch` викликано лише з `'/api/health'` (під час рендеру експорт не запускається).

### Ручна перевірка в браузері
`cd backend && uv run uvicorn app.main:app --reload` і `cd frontend && npm run dev`, http://localhost:5173, Chrome і Firefox.
1. BPM 90, розмір 3/4. Додати 5–10 нот різної висоти й velocity (зокрема A0 і C8), дві однакові ноти, що перетинаються, sustain з дотиком двох інтервалів, sostenuto і soft.
2. «Export .mid»: кнопка на мить стає «Exporting…», браузер завантажує `arrangement.mid` без діалогів і помилок у консолі.
3. `cd backend && uv run python -c "import mido, sys; m = mido.MidiFile(sys.argv[1]); print(m.type, m.ticks_per_beat); [print(t.name, len(t)) for t in m.tracks]; m.print_tracks()" ~/Downloads/arrangement.mid` → format 1, 480, доріжки «MIDI Redactor» і «Piano», `set_tempo 666667`, `time_signature 3/4`, ноти й CC 64/66/67.
4. Відкрити файл у сторонній програмі: MuseScore 4 (якщо встановлено) або онлайн-секвенсері (наприклад https://signal.vercel.app — лише локальне відкриття файлу, без акаунта). Ноти на місцях, темп 90, розмір 3/4, педаль sustain видно/чутно. Записати у звіт, у якій програмі перевірено.
5. Порівняти на слух фрагмент у редакторі (Play) і у сторонній програмі: ноти й дія sustain збігаються (тембр може відрізнятися).
6. Зупинити backend → «Export .mid» → повідомлення `Could not export: the backend is unavailable.`; запустити backend → повторний експорт працює, повідомлення зникає.
7. Порожній проект → експорт дає файл, який читає крок 3 (без нот).
8. Консоль без помилок і попереджень React; `git status --porcelain` не показує `.mid` чи медіафайлів.

## Критерії готовності (Definition of Done)
- [ ] `cd backend && uv run pytest && uv run ruff check . && uv run ruff format --check . && uv run mypy app` — зелено.
- [ ] `cd frontend && npm test -- --run && npm run lint && npm run typecheck && npm run build && npx prettier --check .` — зелено.
- [ ] Усі тести з розділу «Тести» наявні й проходять. `cd backend && uv run pytest --cov=app --cov-report=term-missing` показує 100 % покриття рядків для `app/services/midi_export.py` і `app/api/export.py`.
- [ ] `git diff main -- backend/pyproject.toml` показує лише `mido>=1.3` у `dependencies` і mypy-override для `mido`; `git diff main -- frontend/package.json frontend/package-lock.json` порожній.
- [ ] `grep -rn "Any" backend/app --include='*.py'` знаходить `Any` лише в `app/services/midi_export.py`.
- [ ] Наявні тести не змінено: `git diff main --name-status -- backend/tests frontend/src | grep -E '\.test\.tsx?$|/test_.*\.py$'` показує `M` лише для `frontend/src/App.test.tsx` (без видалених рядків, крім імпортів), решта — `A`.
- [ ] При запущеному backend: `curl -s -X POST localhost:8000/api/export/midi -H 'Content-Type: application/json' --data @backend/tests/fixtures/sample_project.json -o /dev/null -w '%{http_code} %{content_type}\n'` → `200 audio/midi`; та сама команда без `-o`/`-w`, з `| head -c 4` → `MThd`.
- [ ] README має розділ «Експорт у MIDI».
- [ ] Ручна перевірка (пп. 1–8) пройдена в Chrome і Firefox; у звіті вказано сторонню програму, у якій відкрито файл.
- [ ] У гілці до злиття (коміт `docs: mark task 009 as done`) у CLAUDE.md відмічено `[x]` обидва пункти 2.6; статус 009 — «виконано»; статус плану — `виконано`.
- [ ] Гілку `feature/009-midi-export` злито в `main` (`--no-ff`) і запушено; на `main` перевірки зелені.

## Ризики / відкриті питання
- **Експорт потребує запущеного backend.** Так вимагає стек (розділ 3). Якщо backend недоступний, користувач бачить зрозуміле повідомлення, а індикатор `backend: offline` уже є в панелі (001).
- **Точність часу.** Ноти квантуються до 1 тіка (480 PPQ: при 120 BPM це ≈1.04 мс, при 20 BPM ≈6.25 мс). Для аранжувань це непомітно. `bpm_to_midi_tempo` округлює tempo до мікросекунди, тож для дробового BPM сторонній програвач накопичує розбіжність: відносна похибка ≤ 0.5 мкс / tempo (для 97.5 BPM ≈ 6.25·10⁻⁷, тобто ≈ 0.4 мс за 10 хв) — нижче порогу чутності. Тест round-trip цю похибку свідомо не враховує: він порівнює тіки з секундами за точним BPM (перевірка квантування), а tempo перевіряє окремою точною рівністю.
- **Перетин однакових нот звучить у файлі інакше, ніж у редакторі.** У редакторі обидві перетнуті ноти однієї висоти звучать до своїх `keyUp`, а у файлі перша обривається на початку другої (див. «Ноти — `note_events`», п. 3). Причина — обмеження MIDI (один стан клавіші на канал). Різниця описана в README.
- **Втрата даних у крайніх випадках** (свідомо): однакові ноти з тим самим стартовим тіком зливаються в одну; педаль, коротша за 1 тік після зіткнення з наступною однотипною, відкидається. Ці випадки виникають лише для нот/педалей тривалістю в одиниці мілісекунд. Правила описано в README.
- **`mido` без типів.** Код з `Any` ізольовано в одному модулі; якщо `mypy` усе ж скаржиться на `warn_return_any` у `export_midi`, повертати `bytes(buffer.getvalue())` чи явно анотувати проміжні змінні, а не додавати `# type: ignore` без коментаря.
- **`Content-Disposition` у CORS.** Frontend працює через Vite-проксі, тож заголовок не потрібен для `expose_headers`. Якщо в майбутньому frontend звертатиметься до backend напряму з іншого origin, ім'я файлу однаково задає frontend.
- **Розмір запиту.** Навіть 10 000 нот — це ~1 МБ JSON і десятки мілісекунд на backend. Обмеження розміру тіла не додаємо.
- **Відкрите питання до власника (не блокує): ім'я файлу.** Дефолт — `arrangement.mid`. Альтернатива — ім'я від завантаженого відео/аудіо (`clip.mp4` → `clip.mid`) або поле для назви проекту; це дрібна окрема задача.
- **Відкрите питання до власника (не блокує): format 1 чи 0.** Обрано format 1 (conductor + piano). Якщо потрібна сумісність зі старими апаратними секвенсерами, що читають лише format 0, це одна зміна в `build_midi_file` і тестах.
- **Обсяг.** Сервіс (~150 рядків), ендпоінт, клієнт, кнопка, тести. Одна гілка. Запасний поділ, якщо implementer не вкладається: **009a** — backend (кроки 2–5), **009b** — frontend і README (кроки 6–8); галочки 2.6 ставляться лише після 009b.

## Зміни після рев'ю (раунд 1)
Зауваження рев'ю раунду 1 (`009-midi-export.review.md`, 2026-09-29):

1. **Блокуюче 1: тест «Мінімум 1 тік педалі» з невалідною педаллю.** Sustain `[0, 0.0004)` при 120 BPM замінено на валідну sustain `[0, 0.001)` при `bpm 20`: `on 0`, `off 0 → 1`, очікування `(0, CC64 127)`, `(1, CC64 0)`. Явно записано, що педаль створюється звичайним конструктором `PedalEvent(...)` без `model_construct` і чому при 120 BPM ця гілка недосяжна. Тепер гілка `off <= on → off = on + 1` покрита, і вимога 100 % покриття досяжна.
2. **Блокуюче 2: хибний допуск round-trip-тесту.** Обрано варіант (а): кінці нот і межі педалей порівнюються з `ticks_to_seconds(tick, 97.5)` за точним BPM проекту з допуском `half_tick + 1e-9`. Tempo перевіряється окремо точною рівністю `tempos == [(0, bpm_to_midi_tempo(97.5))]`. У «Ризиках → Точність часу» опис похибки tempo виправлено: вона накопичується (≈ 6.25·10⁻⁷ відносно, ≈ 0.4 мс за 10 хв) і свідомо не входить у тест квантування.
3. **Рекомендація: нотація `[start, end)` проти `duration`.** У «Позначеннях» тестів подій пояснено, що `C4 [s, e)` означає кінець `e` і `duration = e − s`, з прикладом `C4 [0.004, 1)` → `note(..., 60, 0.004, 0.996)`.
4. **Рекомендація: порівняння з останньою залишеною нотою.** У `note_events`, п. 3, прямо записано, що `next` порівнюється з останньою **залишеною** нотою групи, а відкинуті ноти в порівнянні не беруть участі. Правила викладено по черзі: однаковий `on` → відкинути; інакше обрізати `prev`, і `next` стає `prev`.
5. **Рекомендація: `useProject()` в обробнику.** Формулювання в `ExportButton` виправлено: хук викликається на верхньому рівні компонента, а обробник кліку замикає значення з останнього рендеру.
6. **Рекомендація: відмінність від `noteSoundingEnds`.** Фразу «як у програванні редактора» прибрано. Додано абзац «Відмінність від програвання в редакторі» в `note_events`, окремий ризик «Перетин однакових нот звучить у файлі інакше, ніж у редакторі» і відповідну вимогу до README (крок 8).
