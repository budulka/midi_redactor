# 017 — Імпорт `.mid` (backend на `mido`)

**Статус:** схвалено
**Гілка:** feature/017-midi-import

## Мета
Користувач натискає «Import .mid» у верхній панелі, обирає Standard MIDI File, і файл стає поточним проектом: ноти (pitch, velocity, час), педалі sustain / sostenuto / soft (CC64/66/67 → інтервали), темп і розмір такту. Файл розбирає backend на `mido` (симетрично до експорту 009), frontend показує підтвердження, якщо поточний проект не порожній, замінює проект однією дією undo і показує попередження та помилки зрозумілим текстом.

Пункт розділу 2 CLAUDE.md, який задача **закриває повністю** (після виконання ставимо `[x]`):
- 2.9 «**Імпорт `.mid`**», усі його частини:
  - SMF формати 0 і 1;
  - ноти (pitch, velocity, час), педалі (CC64/66/67 → інтервали), темп і розмір такту;
  - ноти поза 88 клавішами пропускаються з попередженням;
  - некоректний файл → зрозуміле повідомлення про помилку;
  - імпорт замінює поточний проект (з підтвердженням, якщо проект не порожній) і скасовується через undo.

Задачу виконуємо **поза чергою** на явне прохання власника: 011–016 і 018 ще не виконано, і ця задача від них не залежить і їх не робить (див. «Поза межами»). Пункт 2.9 «Кнопка Info» лишається `[ ]`.

Задача спирається на готове й не дублює його:
- `Project`, `Note`, `PedalEvent`, `TimeSignature`, `CamelModel`, `MIN_*`/`MAX_*` (`backend/app/models/project.py`). Результат імпорту будується через ці моделі, тож усі інваріанти (діапазони, унікальні id, заборона перетину однотипних педалей) перевіряє та сама валідація, що й для експорту;
- `TICKS_PER_QUARTER`, `bpm_to_midi_tempo`, `seconds_to_ticks`, `ticks_to_seconds` (`backend/app/services/timing.py`);
- `PEDAL_CONTROLLERS`, `export_midi` (`backend/app/services/midi_export.py`), потрібні для відображення CC → тип педалі і для round-trip-тестів;
- `tests/midi_readback.py`, `tests/fixtures/sample_project.json` (009/002);
- mypy-override для `mido` у `pyproject.toml` (009), тож нових залежностей і змін конфігурації немає;
- frontend: `historyReducer` / `ProjectProvider` / `useHistoryApi` (010), `parseProject` (`src/state/validation.ts`, 002), `FileLoadButton` (006), `clearSelection` (`src/state/editorState.ts`), `useTransportApi().stop()` (005), шаблон клієнта `exportMidi` / `MidiExportError` (009), `renderWithProviders` / `StateProbe` (`src/components/PianoRoll/testUtils.tsx`).

## Поза межами задачі
- Усе з 011–016 і 018: offset медіа, розрізи, перерахунок нот при зміні BPM, змінна ширина панелі, кнопка Info, одне джерело медіа. План не закладає під них ні коду, ні залежностей. Зокрема імпорт **не** використовує механізм «зміна BPM перераховує ноти» (013): BPM і секунди нот задаються одночасно, однією заміною проекту.
- **Tempo map у моделі проекту.** Модель має один `bpm` (розділ 7). Кілька темпів у файлі перетворюються так: секунди нот рахуються за повною tempo map (звучання збігається з оригіналом), `bpm` проекту = темп на початку файлу, користувач отримує попередження (див. «Темп»). Кілька розмірів такту так само: береться розмір на початку файлу й видається попередження.
- SMF format 2 (асинхронні послідовності), SMPTE-ділення часу (від'ємне `division`), RMID (RIFF-обгортка). Такі файли дають зрозумілу помилку «не підтримується».
- Імпорт інших подій: program change, pitch bend, aftertouch, інші CC, sysex, тексти, маркери, key signature. Вони ігноруються без попереджень.
- Вибір доріжок чи каналів для імпорту. Імпортуються всі доріжки й канали, крім ударних (канал 10), які пропускаються з попередженням.
- «Злиття» імпорту з поточним проектом (додати ноти до наявних). Імпорт завжди замінює проект, як вимагає 2.9.
- Drag&drop `.mid` на сторінку і гаряча клавіша імпорту (наприклад `Ctrl+O`). Кнопки достатньо. Нових гарячих клавіш немає, тож 018 (Info) нічого не додає з цієї задачі.
- Збереження / відкриття проекту у JSON і localStorage.
- Власний (не `window.confirm`) модальний діалог підтвердження.

## Технічні рішення

### Де розбирати файл: backend на `mido`
| Варіант | Плюси | Мінуси |
|---|---|---|
| **Backend, `mido`** | Так визначено в 2.9 і в дорожній карті; `mido` уже в залежностях (009) і вміє читати SMF; логіка тіків і темпу вже на backend; симетрично експорту; round-trip «експорт → імпорт» тестується в одній мові без мережі | Імпорт потребує запущеного backend (як і експорт) |
| Frontend (`@tonejs/midi`) | Працює без backend | Нова JS-залежність, дублювання логіки тіків/темпу на frontend, суперечить дорожній карті |

**Нових залежностей немає** ні на backend, ні на frontend.

### Передача файлу: сире тіло запиту, а не multipart
`UploadFile` / `File(...)` у FastAPI потребують пакета `python-multipart`, якого в проекті немає. Файл один і невеликий, тому frontend надсилає його як **сире тіло** `POST` з `Content-Type: audio/midi` (`fetch(url, { body: file })`), а backend читає його потоком через `Request.stream()`. Це прибирає нову залежність і дає просто обмежити розмір (див. нижче).

### Обмеження розміру
- `MAX_MIDI_UPLOAD_BYTES: Final = 4 * 1024 * 1024` (4 MiB) у `app/api/import_midi.py`; дзеркальна константа `MAX_MIDI_IMPORT_BYTES = 4 * 1024 * 1024` у `frontend/src/api/client.ts`. Типовий фортепіанний MIDI — десятки–сотні КБ; 4 MiB із запасом покриває навіть «чорні MIDI», а відсікає випадково обрані відео/аудіо.
- Backend: якщо заголовок `Content-Length` більший за ліміт → одразу **413**; інакше тіло читається по чанках, і щойно накопичено більше за ліміт → **413** (захист від chunked-запитів без `Content-Length`).
- Frontend: `file.size > MAX_MIDI_IMPORT_BYTES` → помилка `too_large` **без** запиту.
- `MAX_IMPORTED_NOTES: Final = 20_000` у `app/services/midi_import.py`: більше нот після розбору → помилка `too_many_notes` (422). Причина: 4 MiB SMF із running status може містити понад мільйон нот, а це сотні МБ JSON і непридатний piano roll. 20 000 нот із запасом покриває фортепіанну літературу (найщільніші віртуозні твори — порядку 10–15 тис. нот).

### Модуль розбору — `backend/app/services/midi_import.py`
Як і в експорті, весь код з `mido` (тип `Any`) зосереджено в одній функції `read_smf`, яка перетворює повідомлення в типізовані `RawEvent`. Решта логіки — чисті функції над `RawEvent`, які тестуються без `mido`.

```python
MAX_IMPORTED_NOTES: Final = 20_000
PEDAL_DOWN_THRESHOLD: Final = 64          # CC value >= 64 means pressed (MIDI spec for switch pedals)
PERCUSSION_CHANNEL: Final = 9             # GM channel 10, zero-based
SECONDS_DECIMALS: Final = 6               # rounding of imported seconds (1 µs)
BPM_DECIMALS: Final = 2
CONTROLLER_PEDALS: Final[dict[int, PedalType]] = {v: k for k, v in PEDAL_CONTROLLERS.items()}

RawKind = Literal["note_on", "note_off", "control_change", "set_tempo", "time_signature"]

@dataclass(frozen=True, slots=True)
class RawEvent:
    tick: int          # absolute tick
    kind: RawKind
    channel: int = 0   # 0–15 for channel messages
    number: int = 0    # note / controller / tempo (µs per quarter) / time signature numerator
    value: int = 0     # velocity / controller value / time signature denominator

@dataclass(frozen=True, slots=True)
class SmfContents:
    format: int
    ppq: int
    events: list[RawEvent]   # all tracks merged, sorted by (tick, track index, index in track)
    end_tick: int            # the largest absolute tick of any message (end_of_track included)

@dataclass(frozen=True, slots=True)
class NoteSpan:
    pitch: int
    on: int
    off: int
    velocity: int

@dataclass(frozen=True, slots=True)
class PedalSpan:
    type: PedalType
    on: int
    off: int

@dataclass(frozen=True, slots=True)
class NotePairing:
    spans: list[NoteSpan]
    out_of_range: int
    percussion: int
    unclosed: int

@dataclass(frozen=True, slots=True)
class PedalPairing:
    spans: list[PedalSpan]
    unclosed: int

class MidiImportError(Exception):
    def __init__(self, code: ImportErrorCode, message: str) -> None: ...
    code: ImportErrorCode
    message: str

def read_smf(data: bytes) -> SmfContents: ...
def pair_notes(events: Sequence[RawEvent], end_tick: int) -> NotePairing: ...
def pair_pedals(events: Sequence[RawEvent], end_tick: int) -> PedalPairing: ...
def resolve_tempo(events: Sequence[RawEvent], ppq: int) -> tuple[float, TempoMap, list[MidiImportWarning]]: ...
def resolve_time_signature(events: Sequence[RawEvent]) -> tuple[TimeSignature, list[MidiImportWarning]]: ...
def build_import_result(contents: SmfContents) -> MidiImportResult: ...
def import_midi(data: bytes) -> MidiImportResult: ...   # read_smf + build_import_result
```

#### `read_smf` — читання і перевірка формату
1. `data == b""` → `MidiImportError("empty_file", "The file is empty.")`.
2. `mido.MidiFile(file=io.BytesIO(data), clip=False)`. Будь-який виняток з набору `(OSError, EOFError, ValueError, KeyError, IndexError, TypeError, struct.error, KeySignatureError)` → `MidiImportError("invalid_file", "The file is not a valid MIDI file.")` (`from error`). `mido` кидає саме ці винятки для: відсутнього `MThd` (`OSError`), обрізаного файлу (`EOFError`), байтів даних > 127 (`OSError`), невідомого статус-байта (`OSError`), обрізаних meta-подій (`IndexError`), некоректної key signature (`KeySignatureError`, імпортується з `mido.midifiles.meta`). Точний список implementer звіряє з кодом `mido` 1.3; ловити голий `Exception` не можна.
3. `midi_file.type == 2` → `MidiImportError("unsupported_format", "MIDI format 2 is not supported; save the file as format 0 or 1.")`. Будь-який інший тип, крім 0 і 1 (заголовок `mido` не перевіряє), → `invalid_file`.
4. `ticks_per_beat <= 0` (`mido` читає `division` як знакове число, тож SMPTE-ділення від'ємне; 0 — зіпсований файл) → `MidiImportError("unsupported_division", "MIDI files with SMPTE time division are not supported.")` для від'ємного і `invalid_file` для 0.
5. Для кожної доріжки абсолютний тік = сума `msg.time`. Перетворення в `RawEvent`: `note_on` / `note_off` (`channel`, `note`, `velocity`), `control_change` (`channel`, `control`, `value`), meta `set_tempo` (`tempo`), meta `time_signature` (`numerator`, `denominator`). Решта повідомлень ігнорується, але їхній тік враховується в `end_tick`.
6. Злиття доріжок: стабільне сортування за `(tick, track_index, index_in_track)`. Так порядок подій **усередині** доріжки на одному тіку зберігається як у файлі (це важливо: `note_on` і `note_off` однієї клавіші на тому самому тіку — нота нульової довжини, а не нескінченна). Format 0 і format 1 обробляються однаково; для format 1 темп і розмір беруться з будь-якої доріжки (на практиці вони трапляються не лише в доріжці 0).

#### `pair_notes` — ноти
Стан: відкриті ноти `open: dict[(channel, pitch), (on_tick, velocity)]` і **очікувані відпускання** `pending_release: dict[(channel, pitch), int]` (тік повторного удару, на якому попередня нота вже закрита, а її note-off ще не прийшов). Події обробляються в порядку `events`:
- `note_on` з `velocity > 0`:
  - `channel == PERCUSSION_CHANNEL` → `percussion += 1`, подія пропускається;
  - `pitch` поза `21–108` → `out_of_range += 1`, пропускається;
  - якщо для `(channel, pitch)` уже є відкрита нота: коли її `on_tick == tick` — вона **відкидається** (дубль удару на тому самому тіку, лишається новий удар; `pending_release` не змінюється); інакше вона **закривається** на поточному тіку (повторний удар відпускає попередню клавішу — те саме правило, що в експорті 009, і так поводиться синтезатор на одному каналі) і записується `pending_release[key] = tick`;
  - нова нота відкривається.
- `note_off` **або `note_on` з `velocity == 0`** (стандартний еквівалент note-off, running status):
  1. `released_at = pending_release.pop(key, None)`;
  2. якщо `released_at == tick` → подія **поглинається**: це note-off попередньої ноти, яку вже закрив повторний удар на цьому ж тіку, тож нова нота лишається відкритою. Так обробляється поширений порядок секвенсорів і нотних редакторів `on(T)` нової ноти → `off(T)` старої, а також format 1, де note-off лежить у доріжці з більшим номером;
  3. інакше (очікування немає або воно з іншого тіку — застаріле, просто скидається) → закриває відкриту ноту `key`, якщо вона є; якщо немає — ігнорується (зайвий note-off).
  
  Поглинається рівно **один** note-off і лише на тому самому тіку. Нота без повторного удару (`[on(0), off(0)]`) поглинання не зачіпає і лишається нотою нульової довжини. Для ударного каналу й нот поза діапазоном відкритих нот немає, тож їхні note-off просто ігноруються.
  
  Альтернатива — черга відкритих нот на клавішу (note-off закриває найранішу ноту з `on < T`, перетини потім обрізаються). Вона складніша і дає той самий результат для реальних файлів; обрано прапорець поглинання.
- Наприкінці всі відкриті ноти закриваються на `end_tick`, `unclosed += кількість`.
- Ноти однієї висоти на **різних каналах** можуть перетинатися: модель проекту це дозволяє (002), експорт їх коректно обрізає (009).
- Результат: `NoteSpan` у порядку закриття; сортування — у `build_import_result`.

#### `pair_pedals` — педалі
CC на ударному каналі 10 (`PERCUSSION_CHANNEL`) **ігноруються** — узгоджено з нотами: канал 10 не імпортується взагалі (попередження `percussion_skipped` рахує лише ноти). Для кожного контролера з `CONTROLLER_PEDALS` (64 → sustain, 66 → sostenuto, 67 → soft) — один стан «натиснута з тіка X / відпущена», **спільний для решти каналів** (модель не має каналів і забороняє перетин однотипних педалей, тож один автомат гарантує відсутність перетинів):
- `value >= PEDAL_DOWN_THRESHOLD` (64) і педаль відпущена → натиснута з `tick`;
- `value < 64` і педаль натиснута → `PedalSpan(type, down_tick, tick)`, відпущена;
- інші випадки (повторне «натиснуто» — наприклад, плавні значення напівпедалі 70 → 100 → 127; «відпущено» без натискання) ігноруються;
- інші контролери ігноруються;
- наприкінці натиснута педаль закривається на `end_tick`, `unclosed += 1`.
Перепедалізація `CC64 0 → CC64 127` на одному тіку дає дві педалі, що торкаються (`a.end == b.start`), — це валідно в моделі й так само експортується (009).

#### Темп — tempo map (зміни в `backend/app/services/timing.py`)
Нові чисті функції поруч з наявними:
```python
DEFAULT_MIDI_TEMPO: Final = 500_000   # 120 BPM, SMF default before the first set_tempo

@dataclass(frozen=True, slots=True)
class TempoPoint:
    tick: int
    tempo: int        # microseconds per quarter note, >= 0
    seconds: float    # time of `tick` on the timeline

TempoMap = tuple[TempoPoint, ...]

def build_tempo_map(changes: Sequence[tuple[int, int]], ppq: int = TICKS_PER_QUARTER) -> TempoMap: ...
def tempo_map_seconds(tick: int, tempo_map: TempoMap, ppq: int = TICKS_PER_QUARTER) -> float: ...
def midi_tempo_to_bpm(tempo: int) -> float: ...   # 60_000_000 / tempo, tempo > 0
```
- `build_tempo_map`: `changes` — `(tick, tempo)` у порядку файлу. Перша точка завжди на тіку 0 з `DEFAULT_MIDI_TEMPO`; кілька змін на одному тіку → діє **остання**; зміна з тим самим темпом, що й попередня точка, точку не додає. `seconds` кожної точки = `seconds` попередньої + `(tick − prev.tick) · prev.tempo / 1e6 / ppq`. Від'ємний тік або темп, `ppq <= 0` → `ValueError`.
- `tempo_map_seconds`: `bisect` за `tick` → `point.seconds + (tick − point.tick) · point.tempo / 1e6 / ppq`. Від'ємний тік → `ValueError`.
- `midi_tempo_to_bpm(tempo)`: `tempo <= 0` → `ValueError`.

`resolve_tempo(events, ppq)` у `midi_import.py`:
1. `tempo_map = build_tempo_map([(e.tick, e.number) for e in events if e.kind == "set_tempo"], ppq)`.
2. **Секунди нот і педалей завжди рахуються за повною tempo map**, тобто так, як файл звучить у будь-якому програвачі. Єдине джерело правди — секунди (розділ 7), і для аранжування під відео важливо, щоб ноти лишилися в тих самих моментах часу.
3. `bpm` проекту — **темп на тіку 0** (`tempo_map[0].tempo`): `raw = midi_tempo_to_bpm(tempo)` (для `tempo == 0` — `inf`), `bpm = round(clamp(raw, 20, 300), 2)`. Округлення до 0.01: для будь-якого BPM з ≤ 2 знаками після коми в межах 20–300 похибка `bpm_to_midi_tempo` (≤ 0.5 мкс) змінює BPM не більше ніж на `300² · 0.5 / 6e7 = 0.00075 < 0.005`, тож експортований BPM повертається точно (`90 → 666667 → 90.0`, `97.5 → 615385 → 97.5`).
4. Попередження:
   - `tempo_changes` — у map більше однієї точки: `count = len(tempo_map) − 1`, текст `The file has {count} tempo change(s). Notes keep their original timing; the editor grid uses the starting tempo of {bpm} BPM.`;
   - `tempo_out_of_range` — `raw` поза 20–300: `The starting tempo of {raw:.2f} BPM is outside 20–300 BPM; the editor grid uses {bpm} BPM. Notes keep their original timing.` (`count = 1`); для `tempo == 0` замість числа — `The starting tempo in the file is invalid (0); the editor grid uses 300.0 BPM. Notes keep their original timing.`

**Альтернативи:** (а) рахувати секунди за одним першим темпом — зберігає позиції в тактах, але зсуває ноти в часі відносно оригіналу (для «під відео» гірше); (б) середній темп — ні такти, ні секунди не збігаються. Обрано повну tempo map + попередження.

Відмінність від експорту: після імпорту файлу з кількома темпами повторний експорт дасть один темп (`bpm` проекту), а ноти — у тих самих секундах. Звучання збережеться, а сітка тактів у сторонній програмі буде за одним темпом. Це описується в README.

#### Розмір такту — `resolve_time_signature(events)`
- Розмір на тіку 0: **останній** `time_signature` з `tick == 0`; якщо його немає — `4/4` без попередження (SMF default).
- Непідтримуваний розмір (чисельник поза 1–32 або знаменник не з `{1, 2, 4, 8, 16, 32}`) → `4/4` і попередження `time_signature_unsupported`: `Time signature {n}/{d} is not supported; 4/4 is used.`
- Пізніші `time_signature`, що **змінюють** розмір відносно попереднього, рахуються; `count > 0` → попередження `time_signature_changes`: `The file changes the time signature {count} time(s); only the starting {n}/{d} is used.`

#### `build_import_result(contents)` — збирання проекту
1. `bpm, tempo_map, tempo_warnings = resolve_tempo(...)`; `ts, ts_warnings = resolve_time_signature(...)`; `notes = pair_notes(...)`; `pedals = pair_pedals(...)`.
2. `len(notes.spans) > MAX_IMPORTED_NOTES` → `MidiImportError("too_many_notes", f"The file has {n} notes; at most {MAX_IMPORTED_NOTES} can be imported.")`. Ліміт читається з глобальної змінної модуля під час виклику (для тесту через `monkeypatch`).
3. Ноти: `start = round(sec(on), 6)`, `duration = max(MIN_NOTE_DURATION, round(sec(off) − sec(on), 6))`, де `sec = tempo_map_seconds(·, tempo_map, ppq)`. Нота нульової довжини (`on == off`: note-on і note-off на одному тіку, або незакрита нота на `end_tick`) отримує `MIN_NOTE_DURATION` (1 мс), а не відкидається: користувач бачить її і може видалити.
4. Педалі: `start = round(sec(on), 6)`, `end = round(sec(off), 6)`; якщо `end < start + MIN_PEDAL_DURATION` → педаль відкидається, `short_pedals += 1` (натискання коротше за 1 мс; подовжити його не можна без ризику перетину з наступною однотипною педаллю). `count > 0` → попередження `short_pedals`: `Skipped {count} pedal press(es) shorter than 1 ms.`
5. Порядок і id (детерміновано): ноти сортуються за `(start, pitch, duration, velocity)`, id `n1, n2, …`; педалі — за `(start, порядок типу sustain < sostenuto < soft)`, id `p1, p2, …`. Frontend ці id не змінює: імпорт замінює проект повністю, тож колізій з наявними id немає, а виділення очищується (див. Frontend).
6. `Project(bpm=..., time_signature=..., notes=[Note(...)], pedals=[PedalEvent(...)])` — **повна валідація Pydantic**. Помилка валідації тут означає баг імпорту, тож не перехоплюється (→ 500 і падіння тестів).
7. Попередження нот: `notes_out_of_range` (`Skipped {count} note(s) outside the piano range A0–C8.`), `percussion_skipped` (`Skipped {count} note(s) on the percussion channel 10.`), `unclosed_notes` (`{count} note(s) had no note-off and end at the end of the file.`), `unclosed_pedals` (`{count} pedal press(es) had no release and end at the end of the file.`), `no_notes` — у проекті 0 нот (`The file contains no notes.`, `count = 0`).
8. Порядок попереджень фіксований, як у переліку `ImportWarningCode` нижче; кожне попередження видається лише при `count > 0` (крім `no_notes`).

### Pydantic-моделі — `backend/app/models/midi_import.py` (новий)
```python
ImportWarningCode = Literal[
    "notes_out_of_range", "percussion_skipped", "unclosed_notes", "unclosed_pedals",
    "short_pedals", "tempo_changes", "tempo_out_of_range",
    "time_signature_unsupported", "time_signature_changes", "no_notes",
]
ImportErrorCode = Literal[
    "empty_file", "file_too_large", "invalid_file", "unsupported_format",
    "unsupported_division", "too_many_notes",
]

class MidiImportWarning(CamelModel):   # not `ImportWarning`: that is a Python builtin
    code: ImportWarningCode
    message: str
    count: int = Field(ge=0)

class MidiImportResult(CamelModel):
    project: Project
    warnings: list[MidiImportWarning]

class ImportErrorDetail(CamelModel):
    code: ImportErrorCode
    message: str

class ImportErrorResponse(CamelModel):
    detail: ImportErrorDetail
```
Тексти повідомлень — англійською, як увесь UI; frontend показує `message` як є.

### API — `backend/app/api/import_midi.py` (новий; `import` — ключове слово Python)
- `router = APIRouter(tags=["import"])`, підключається в `create_app()` з `prefix="/api"` після `export_router`.
- `POST /api/import/midi`:
  - тіло — байти файлу (будь-який `Content-Type`; frontend надсилає `audio/midi`). Для `/docs`: `openapi_extra={"requestBody": {"required": True, "content": {"audio/midi": {"schema": {"type": "string", "format": "binary"}}}}}`;
  - обробник `async def import_project_midi(request: Request) -> MidiImportResult`: перевірка `Content-Length` (невалідне число ігнорується, діє потокова перевірка) → читання `request.stream()` у `bytearray` з перевіркою ліміту → `await run_in_threadpool(import_midi, bytes(body))` (`starlette.concurrency`; розбір — CPU-робота, тож не блокує event loop);
  - **200** — `MidiImportResult` у JSON (camelCase: `project.timeSignature`), `response_model=MidiImportResult`, `response_model_by_alias=True` (за замовчуванням);
  - **413** — `HTTPException(413, detail={"code": "file_too_large", "message": "The file is larger than 4 MB."})`;
  - **422** — `MidiImportError` → `HTTPException(422, detail={"code": error.code, "message": error.message})`;
  - `responses={413: {"model": ImportErrorResponse}, 422: {"model": ImportErrorResponse}}` для документації.
- `MAX_MIDI_UPLOAD_BYTES` — константа цього модуля.

### Frontend

#### Дія заміни проекту з undo — `src/state/actions.ts`, `projectReducer.ts`
Наявна `project/load` (010) свідомо **скидає** історію, а 2.9 вимагає, щоб імпорт скасовувався через undo. Тому додається нова дія, а `project/load` не змінюється (вона не використовується в UI, її тести лишаються):
- `ProjectAction` += `{ readonly type: 'project/replace'; readonly project: Project }`, creator `replaceProject(project: Project): ProjectAction`;
- `projectReducer`: `case 'project/replace': return action.project === state ? state : action.project;`
- `historyReducer` не змінюється: дія потрапляє в гілку `default` і стає **одним** кроком undo (`past` += старий проект, `future = []`). Undo повертає попередній проект цілком, redo — імпортований.

#### Клієнт — `src/api/client.ts` (доповнення)
```ts
export const MIDI_IMPORT_URL = '/api/import/midi';
export const MAX_MIDI_IMPORT_BYTES = 4 * 1024 * 1024;
export interface ImportWarning { readonly code: string; readonly message: string; readonly count: number }
export interface MidiImportResult { readonly project: Project; readonly warnings: readonly ImportWarning[] }
export type MidiImportErrorKind = 'too_large' | 'invalid' | 'response' | 'server' | 'network';
export class MidiImportError extends Error {
  readonly kind: MidiImportErrorKind;
  readonly status: number | null;
  readonly detail: string | null;   // backend message for 'invalid'
}
export async function importMidi(file: Blob, signal?: AbortSignal): Promise<MidiImportResult>;
```
- `file.size > MAX_MIDI_IMPORT_BYTES` → `MidiImportError('too_large', null, null)` без `fetch`;
- `fetch(MIDI_IMPORT_URL, { method: 'POST', headers: { 'Content-Type': 'audio/midi' }, body: file, signal })`;
- мережева помилка → `network`; `AbortError` (`signal?.aborted`) прокидається як є (як у `exportMidi`);
- `413` → `too_large`; `422` → `invalid` з `detail = body.detail.message`, якщо тіло — JSON такої форми, інакше `detail = null`; інший не-ok → `server`;
- `200` → `parseImportResult(await response.json())`; будь-яка помилка розбору JSON чи структури → `MidiImportError('response', 200, null)`.
- **`src/api/importResult.ts`** (новий, чистий): `parseImportResult(data: unknown): MidiImportResult` — `project` через наявний `parseProject` (002: перевіряє форму й усі інваріанти), `warnings` — масив об'єктів `{ code: string, message: string, count: number }`; інакше кидає `Error`.

#### Чисті допоміжні функції — `src/utils/midiImport.ts` (новий)
```ts
export function isProjectEmpty(project: Project): boolean;               // no notes and no pedals
export function countLabel(count: number, noun: string): string;         // 1 note / 2 notes
export function importConfirmMessage(fileName: string, current: Project, imported: Project): string;
export function importSummary(fileName: string, imported: Project): string;
export function importErrorMessage(error: unknown): string;
```
- «Порожній» проект = немає нот і педалей. BPM і розмір такту самі по собі проект непорожнім не роблять: їх легко повернути, і undo працює.
- `importConfirmMessage('song.mid', current, imported)` → `Replace the current project (3 notes, 1 pedal) with "song.mid" (120 notes, 4 pedals)? You can undo this with Ctrl+Z.`
- `importSummary('song.mid', imported)` → `Imported "song.mid": 120 notes, 4 pedals, 90 BPM, 3/4.`
- `importErrorMessage`: `too_large` → `Could not import: the file is larger than 4 MB.`; `invalid` → `Could not import: {detail}` або `Could not import: the file is not a valid MIDI file.`; `response` → `Could not import: unexpected response from the backend.`; `server` → `Could not import: server error ({status}).`; `network` та інше → `Could not import: the backend is unavailable.`

#### `FileLoadButton` (зміна, сумісна з наявним використанням)
Новий необов'язковий проп `disabled?: boolean`: `<input disabled={disabled}>`, клас `file-load--disabled` на `<label>` (CSS: `opacity: 0.5; cursor: default`). Наявні виклики не змінюються.

#### `src/components/ImportButton.tsx` (новий), у `header` перед `<ExportButton />`
- `<div className="import-button">` з `<FileLoadButton text={importing ? 'Importing…' : 'Import .mid'} inputLabel="Import MIDI file" accept=".mid,.midi,audio/midi,audio/x-midi" disabled={importing} onFile={...} />`. `accept` лише підказка для діалогу; вміст перевіряє backend.
- Хуки на верхньому рівні: `useProject()` (зберігається в `projectRef` через `useLayoutEffect`, як у `ExportButton`), `useProjectDispatch()`, `useEditorDispatch()`, `useTransportApi()`.
- Обробник `onFile(file)`:
  1. `busyRef.current` → ігнор (повторний вибір під час запиту); `busyRef = true`, новий `AbortController` у `controllerRef`, `setImporting(true)`, `setError(null)`, `setResult(null)`.
  2. `const result = await importMidi(file, controller.signal)`; після `await` — якщо `signal.aborted`, вихід без `setState`.
  3. Якщо `!isProjectEmpty(projectRef.current)` і `!window.confirm(importConfirmMessage(file.name, projectRef.current, result.project))` → нічого не змінюється (без повідомлення). Підтвердження питається **після** успішного розбору: для некоректного файлу користувач одразу бачить помилку, а в тексті підтвердження є кількість нот, що буде імпортовано. Використовується актуальний проект на момент відповіді.
  4. Заміна: `transportApi.stop()` (відтворення старого проекту не продовжується з новими нотами), `editorDispatch(clearSelection())` (id `n1…` могли б збігтися з виділеними id попереднього імпорту), `dispatch(replaceProject(result.project))`, `setResult({ summary: importSummary(file.name, result.project), warnings: result.warnings })`.
  5. Помилка → `setError(importErrorMessage(caught))`; `finally` → `busyRef = false`, `setImporting(false)` (якщо не aborted).
- Unmount → `controllerRef.current?.abort()`.
- Рендер повідомлень:
  - успіх: `<span role="status" className="import-button__status">{summary}</span>`; якщо є попередження — `<details className="import-button__warnings"><summary>{countLabel(n, 'warning')}</summary><ul>{warnings.map(w => <li key={w.code}>{w.message}</li>)}</ul></details>`; кнопка `<button type="button" aria-label="Dismiss import message">×</button>` прибирає повідомлення;
  - помилка: `<span role="alert" className="import-button__error">`;
  - наступний імпорт прибирає попереднє повідомлення на старті.
- CSS у `src/App.css`: `.import-button` як `.export-button` (`inline-flex`, `gap: 8px`, `align-items: center`, плюс `position: relative`); `.import-button__error` — колір `var(--err)`, `font-size: 13px`; `.import-button__status` — `var(--muted)`, 13px, `max-width: 320px`, `overflow: hidden`, `text-overflow: ellipsis`, `white-space: nowrap`; `.import-button__warnings ul` — `position: absolute; top: 100%; z-index: 10; background: var(--panel); border: 1px solid var(--border); padding: 8px 8px 8px 24px; max-width: 480px; font-size: 13px`, щоб список не ламав висоту панелі.

## Кроки реалізації
1. Від актуального `main` створити гілку `feature/017-midi-import` (`git switch -c feature/017-midi-import`; незакомічені зміни CLAUDE.md від власника переносяться в гілку). **Першим комітом** закомітити лише ці зміни власника (нові розділи 2.7–2.9 і задачі 011–018), без правок з боку implementer: `git add CLAUDE.md && git commit -m "docs: add owner requirements 2.7–2.9 and tasks 011–018"`. Перевірити `git show --stat HEAD` — лише `CLAUDE.md`.
   **Другим комітом** додати план і всі файли його рев'ю (зараз untracked): `git add docs/plans/017-midi-import.md docs/plans/017-midi-import.review.md && git commit -m "docs: add plan 017 and its review"`. Статус плану в цьому коміті — той, що поставив оркестратор (`схвалено`); на `виконано` його змінює крок 12.
2. Backend, `app/services/timing.py`: `DEFAULT_MIDI_TEMPO`, `TempoPoint`, `TempoMap`, `build_tempo_map`, `tempo_map_seconds`, `midi_tempo_to_bpm` + тести в `tests/test_timing.py` (нові функції; наявні тести не змінюються). Коміт `feat: add tempo map conversion for MIDI import`.
3. Backend, `app/models/midi_import.py` (моделі, коди) + `app/services/midi_import.py`: константи, `RawEvent`, спани, `MidiImportError`, `pair_notes`, `pair_pedals`, `resolve_tempo`, `resolve_time_signature` + `tests/test_midi_import.py`, частина «події» (без `mido`). Коміт `feat: pair MIDI notes and pedal events for import`.
4. Backend: `read_smf`, `build_import_result`, `import_midi` + тестовий помічник `tests/midi_builder.py` + тести «файл», «помилки» і «round-trip». Коміт `feat: import a Standard MIDI File into a project`.
5. Backend: `app/api/import_midi.py`, підключення в `app/main.py` + `tests/test_import_api.py`. Коміт `feat: add POST /api/import/midi endpoint`.
6. Frontend: `project/replace` + `replaceProject` (`actions.ts`, `projectReducer.ts`) + тести в `projectReducer.test.ts` і `history.test.ts` (нові `it`). Коміт `feat: add an undoable project replace action`.
7. Frontend: `src/api/importResult.ts` + `importResult.test.ts`; `importMidi`, `MidiImportError`, константи в `client.ts` + нові `it` у `client.test.ts`; `src/utils/midiImport.ts` + `midiImport.test.ts`. Коміт `feat: add MIDI import client`.
8. Frontend: проп `disabled` у `FileLoadButton` + новий `it`; `ImportButton.tsx` + `ImportButton.test.tsx`; підключення в `App.tsx`, CSS, новий `it` в `App.test.tsx`. Коміт `feat: import a .mid file into the editor`.
9. E2E: `frontend/e2e/import.spec.ts`. Коміт `test: add end-to-end tests for MIDI import`.
10. README: новий розділ «Імпорт MIDI» після «Експорт у MIDI»: кнопка, формати 0/1, що імпортується, правила (tempo map і `bpm` = темп на початку, розмір на початку, поріг педалі 64, повторний удар відпускає попередню клавішу, а note-off старої ноти на тому самому тіку після нового удару поглинається (незалежно від порядку подій і доріжок), note-on з velocity 0, незакриті ноти/педалі до кінця файлу, ударний канал 10 — і ноти, і CC — пропускається), ліміти (4 MB, 20 000 нот), підтвердження і undo, потрібен backend, відмінність повторного експорту файлу з кількома темпами. Коміт `docs: describe MIDI import`.
11. Усі перевірки з DoD (включно з `npm run e2e`) і ручна перевірка в браузері.
12. У гілці (**до** злиття): у CLAUDE.md `[x]` лише для пункту 2.9 «Імпорт `.mid`» (пункт «Кнопка Info» лишається `[ ]`); статус 017 у розділі 8 — «виконано»; статус плану — `виконано`. Коміт `docs: mark task 017 as done`.
13. `git checkout main && git merge --no-ff feature/017-midi-import`, повторні перевірки на `main`, `git push origin main` і гілки.

## Тести
Наявні тести не змінюються й не видаляються; нові випадки додаються окремими `it`/функціями в наявні файли `tests/test_timing.py`, `projectReducer.test.ts`, `history.test.ts`, `client.test.ts`, `FileLoadButton.test.tsx`, `App.test.tsx`.

### Backend: `tests/test_timing.py` (нові тести)
- `build_tempo_map([])` → `(TempoPoint(0, 500000, 0.0),)`.
- `build_tempo_map([(0, 400000), (0, 600000)])` → одна точка `(0, 600000, 0.0)` (на одному тіку діє остання).
- `build_tempo_map([(960, 1_000_000)], 480)` → `(0, 500000, 0.0)`, `(960, 1000000, 1.0)`.
- `build_tempo_map([(0, 500000), (960, 500000)])` → одна точка (той самий темп не додає точку).
- `tempo_map_seconds(1920, map_above, 480) == 3.0`; `tempo_map_seconds(0, ...) == 0.0`; `tempo_map_seconds(480, ...) == 0.5`.
- `tempo_map_seconds(-1, ...)` → `ValueError`; `build_tempo_map([(0, 500000)], 0)` → `ValueError`.
- `midi_tempo_to_bpm(500000) == 120.0`; `midi_tempo_to_bpm(1_000_000) == 60.0`; `midi_tempo_to_bpm(0)` → `ValueError`.
- Узгодженість з експортом: для `bpm ∈ {20, 60, 97.5, 120, 300}` `tempo_map_seconds(t, build_tempo_map([(0, bpm_to_midi_tempo(bpm))]))` відрізняється від `ticks_to_seconds(t, bpm)` для `t = 96000` не більше ніж на `1e-4` с.

### Backend: `tests/test_midi_import.py` — події (без `mido`)
Позначення: `on(tick, pitch, vel=100, ch=0)`, `off(tick, pitch, ch=0)`, `cc(tick, ctrl, value, ch=0)` — конструктори `RawEvent`. Спан ноти записується `(pitch, on, off, velocity)`.
- Звичайна нота: `[on(0, 60), off(480, 60)]`, `end_tick 480` → `[(60, 0, 480, 100)]`, лічильники 0.
- **`note_on` з velocity 0 як note-off:** `[on(0, 60, 90), on(960, 60, vel=0)]` → `[(60, 0, 960, 90)]`.
- **Перекриття однакових нот (повторний удар):** `[on(0, 60, 80), on(480, 60, 90), off(960, 60), off(1440, 60)]` → `[(60, 0, 480, 80), (60, 480, 960, 90)]`; зайвий `off(1440)` ігнорується.
- **Повторний удар, note-on нової ноти перед note-off старої на тому самому тіку:** `[on(0, 60, 80), on(480, 60, 90), off(480, 60), off(960, 60)]` → `[(60, 0, 480, 80), (60, 480, 960, 90)]` (`off(480)` поглинається).
- Той самий порядок з `note_on` velocity 0 замість `off(480)` → той самий результат.
- Поглинається лише один note-off: `[on(0, 60), on(480, 60), off(480, 60), off(480, 60)]` → `(60, 0, 480)`, `(60, 480, 480)` (другий `off(480)` закриває нову ноту).
- Застаріле очікування не поглинає: `[on(0, 60), on(480, 60), off(960, 60), off(1440, 60)]` → `(60, 0, 480)`, `(60, 480, 960)`, `off(1440)` ігнорується.
- Інша клавіша не поглинається: `[on(0, 60), on(480, 60), off(480, 64), off(960, 60)]` → `(60, 0, 480)`, `(60, 480, 960)`; на іншому каналі (`off(480, 60, ch=1)`) — так само.
- **Дубль на тому самому тіку:** `[on(0, 60, 80), on(0, 60, 100), off(480, 60)]` → лише `[(60, 0, 480, 100)]`.
- Різні канали однієї висоти: `[on(0, 60, ch=0), on(240, 60, ch=1), off(480, 60, ch=0), off(960, 60, ch=1)]` → `(60, 0, 480)` і `(60, 240, 960)`, обидві лишаються.
- Note-off без note-on: `[off(100, 60)]` → `[]`.
- **Незакрита нота:** `[on(0, 60)]`, `end_tick 1920` → `[(60, 0, 1920, 100)]`, `unclosed == 1`.
- Нота нульової довжини: `[on(0, 60), off(0, 60)]` → `[(60, 0, 0, 100)]` (повторного удару не було, поглинання не спрацьовує; довжину 1 мс дає `build_import_result`, див. нижче).
- **Поза діапазоном:** `on` для pitch 20, 21, 108, 109 (кожна з `off` через 480) → спани лише 21 і 108, `out_of_range == 2`; note-off для 20/109 не падає.
- **Ударний канал:** `[on(0, 36, ch=9), off(480, 36, ch=9), on(0, 60), off(480, 60)]` → лише pitch 60, `percussion == 1`.
- CC на ударному каналі: `[cc(0, 64, 127, ch=9), cc(480, 64, 0, ch=9)]` → `pair_pedals` повертає `[]`.
- **Педалі:** `[cc(0, 64, 127), cc(960, 64, 0)]` → `[PedalSpan('sustain', 0, 960)]`; CC66 → `sostenuto`; CC67 → `soft`.
- **Поріг CC ≥ 64:** `[cc(0, 64, 64), cc(480, 64, 63)]` → `('sustain', 0, 480)`; `[cc(0, 64, 63)]` → `[]`.
- Напівпедаль / повтори: `[cc(0, 64, 70), cc(100, 64, 100), cc(200, 64, 127), cc(480, 64, 40), cc(500, 64, 10)]` → рівно `[('sustain', 0, 480)]`.
- Перепедалізація: `[cc(0, 64, 127), cc(960, 64, 0), cc(960, 64, 127), cc(1920, 64, 0)]` → `('sustain', 0, 960)`, `('sustain', 960, 1920)`.
- Спільний стан для каналів: `[cc(0, 64, 127, ch=0), cc(100, 64, 127, ch=1), cc(480, 64, 0, ch=1)]` → одна педаль `(0, 480)`.
- **Незакрита педаль:** `[cc(480, 64, 127)]`, `end_tick 1920` → `('sustain', 480, 1920)`, `unclosed == 1`.
- Інші контролери (`cc(0, 7, 100)`, `cc(0, 1, 127)`) ігноруються.
- `resolve_tempo`: без `set_tempo` → `bpm 120.0`, без попереджень; `set_tempo(0, 666667)` → `90.0`; `615385` → `97.5`; `[(0, 400000), (0, 600000)]` → `100.0`, без попереджень; `[(0, 500000), (960, 1_000_000)]` → `120.0` і `tempo_changes` з `count 1`; перший `set_tempo` на тіку 480 (`1_000_000`) → `bpm 120.0` (темп тіку 0 за замовчуванням) і `tempo_changes` `count 1`; `(0, 500000)` двічі (на 0 і 960) → без попереджень; `4_000_000` (15 BPM) → `20.0` і `tempo_out_of_range`; `100_000` (600 BPM) → `300.0` і `tempo_out_of_range`; `0` → `300.0` і `tempo_out_of_range`.
- `resolve_time_signature`: без подій → `4/4`, без попереджень; `3/4` на 0 → `3/4`; `4/4` і `6/8` на тіку 0 → `6/8` (остання); `6/8` на 0 і `4/4` на 1920 → `6/8` і `time_signature_changes` `count 1`; `6/8` на 0 і `6/8` на 1920 → без попереджень; `7/64` → `4/4` і `time_signature_unsupported`; `0/4` і `33/4` → `4/4` і `time_signature_unsupported`.

### Backend: `tests/test_midi_import.py` — файл
Помічник `tests/midi_builder.py` (лише для тестів): `build_smf(tracks: list[list[tuple[int, Any]]], type: int = 1, ppq: int = 480) -> bytes` — кожна подія `(абсолютний тік, mido-повідомлення)`, помічник переводить у дельти, додає `end_of_track` (або тік `end_of_track`, переданий явно параметром `end_ticks`) і зберігає через `mido`.
- **Format 0:** одна доріжка з `set_tempo 500000`, `time_signature 3/4`, нотою 60 `[0, 480)` v100, sustain `[0, 960)` → `project.bpm == 120.0`, `3/4`, нота `start 0.0`, `duration 0.5`, `velocity 100`, педаль `sustain [0.0, 1.0]`, `warnings == []`.
- **Format 1:** темп у доріжці 0, права рука в доріжці 1, ліва в доріжці 2 (різні канали), педаль у доріжці 2 → усі ноти й педаль імпортовано, id `n1…` у порядку `start`, потім `pitch`.
- Темп у доріжці 1, а не 0 (format 1) → враховується.
- **Повторний удар через доріжки (format 1):** канал 0, pitch 60; доріжка 1: `note_on` v80 на 0, `note_on` v90 на 480, `note_off` на 960; доріжка 2: `note_off` на 480 (note-off першої ноти лежить у доріжці з більшим номером, після злиття він іде після `note_on` на 480) → дві ноти: `start 0.0, duration 0.25, velocity 80` і `start 0.25, duration 0.25, velocity 90`, без попереджень.
- Той самий повтор в одній доріжці format 0 у порядку `on(480)` → `off(480)` → той самий результат.
- **Темп 0:** `set_tempo 0` на тіку 0, `set_tempo 500000` на 960, нота 60 `[0, 480)`, нота 64 `[960, 1440)`, sustain `[0, 480)` → імпорт не падає; `bpm == 300.0`; попередження `tempo_out_of_range` (текст про невалідний темп 0) і `tempo_changes`; нота 60 має `start 0.0`, `duration 0.001`; нота 64 — `start 0.0`, `duration 0.5`; sustain відкинуто з `short_pedals`.
- **Кілька темпів у файлі:** `set_tempo 500000` на 0, `1_000_000` на 960; нота 60 на `[1920, 2400)` → `start == 3.0`, `duration == 1.0`, `bpm == 120.0`, попередження `tempo_changes` з текстом, що містить `120.0 BPM`.
- Незакрита нота й педаль при `end_of_track` на тіку 1920 → `duration 2.0` / `end 2.0`, попередження `unclosed_notes` і `unclosed_pedals` з `count 1`.
- Незакрита нота на самому `end_tick` (нота на 960, `end_of_track` на 960) → `duration == 0.001`.
- Нота нульової довжини (on/off на одному тіку) → `duration == 0.001`.
- Коротка педаль: `ppq 960`, 120 BPM, sustain `[0, 1)` тік (0.52 мс) → педаль відкинута, `short_pedals` `count 1`; `[0, 0)` → теж відкинута.
- Ноти поза діапазоном (20, 109) і на каналі 10 → попередження `notes_out_of_range` (`count 2`, текст містить `2`) і `percussion_skipped` (`count 1`).
- Файл без нот (лише темп) → порожні `notes`/`pedals`, попередження `no_notes`.
- Порядок попереджень: файл, що породжує `notes_out_of_range`, `unclosed_notes` і `tempo_changes`, → коди в порядку оголошення `ImportWarningCode`.
- `import_midi` детермінований: той самий вхід → рівні результати (`==`).
- Результат — валідний `Project` (`MidiImportResult.model_validate(result.model_dump(by_alias=True))` не кидає).
- Ліміт нот: `monkeypatch.setattr(midi_import, "MAX_IMPORTED_NOTES", 3)`; файл із 3 нотами → OK; з 4 → `MidiImportError`, `code == "too_many_notes"`. Окремо: `MAX_IMPORTED_NOTES == 20_000`.

### Backend: `tests/test_midi_import.py` — помилки
Кожен випадок → `pytest.raises(MidiImportError)` з перевіркою `code` і непорожнього `message`:
- `b""` → `empty_file`;
- `b"nope"` → `invalid_file`; байти `RIFF…` → `invalid_file`;
- валідний файл, обрізаний на 5 байтів → `invalid_file`;
- лише `MThd` без доріжок, заявлено 1 доріжку → `invalid_file`;
- `note_on` з байтом даних `0x90 0x3C 0xC8` (> 127), зібраний вручну через `struct` → `invalid_file`;
- невідомий статус-байт (`0xF4`) → `invalid_file`;
- обрізана meta `set_tempo` (довжина 1 замість 3) → `invalid_file`;
- некоректна key signature (`FF 59 02 0F 05`) → `invalid_file`;
- заголовок з `format 2` (через `mido.MidiFile(type=2)`) → `unsupported_format`; заголовок з `format 5` (через `struct`) → `invalid_file`;
- `division = 0xE728` (SMPTE, через `struct`) → `unsupported_division`; `division = 0` → `invalid_file`.

### Backend: round-trip «експорт → імпорт»
- **Фікстур 002** `sample_project.json` → `import_midi(export_midi(project)).project == project` (точна рівність: при 120 BPM усі часи фікстуру кратні тіку, id і порядок збігаються), `warnings == []`.
- **Псевдовипадковий проект** (як у 009): `bpm 97.5`, `6/8`, 20 нот `random.Random(1)` без перетинів однакових висот, по одній педалі кожного типу → після імпорту: `bpm == 97.5`, `timeSignature == 6/8`, кількість нот і педалей та сама; після сортування за `(start, pitch)` у кожної ноти збігаються `pitch`, `velocity`, а `start`, кінець ноти і межі педалей відрізняються від оригіналу не більше ніж на `half_tick + 5e-5` с (`half_tick = 60 / 97.5 / 480 / 2`; `5e-5` покриває дрейф від округлення tempo до мкс на 30 с і округлення до 1 мкс), `warnings == []`.
- `bpm ∈ {20, 60, 90, 120, 133.33, 300}` (порожній проект) → `import_midi(export_midi(p)).project.bpm == p.bpm`.
- Розміри `5/16` і `4/1` → повертаються без змін.
- Порожній проект → порожній проект з тим самим BPM і розміром, попередження лише `no_notes`.

### Backend: `tests/test_import_api.py`
`URL = "/api/import/midi"`, `TestClient(app)`.
- `export_midi(fixture)` як тіло з `Content-Type: audio/midi` → 200, `content-type` `application/json`, `response.json()["project"] == fixture_json()` (camelCase `timeSignature`), `warnings == []`.
- `content=b"nope"` → 422, `detail == {"code": "invalid_file", "message": ...}` з непорожнім `message`.
- Порожнє тіло → 422, `detail.code == "empty_file"`.
- Файл format 2 → 422, `unsupported_format`.
- `MAX_MIDI_UPLOAD_BYTES + 1` байт → 413, `detail.code == "file_too_large"`.
- Chunked-тіло без `Content-Length` (`content=iter([b"x" * MAX_MIDI_UPLOAD_BYTES, b"x"])`) → 413.
- Рівно `MAX_MIDI_UPLOAD_BYTES` байт сміття → 422 `invalid_file` (ліміт не спрацьовує на межі).
- `MAX_MIDI_UPLOAD_BYTES == 4 * 1024 * 1024`.
- `GET /api/import/midi` → 405.
- `/openapi.json`: шлях `/api/import/midi` з `post`, `requestBody.content` містить `audio/midi`, відповіді `200`, `413`, `422` описані.

### Frontend: `src/state/projectReducer.test.ts`, `history.test.ts` (нові `it`)
- `projectReducer(state, replaceProject(other))` → повертає `other`; `replaceProject(state)` → той самий `state`.
- `historyReducer`: після `addNote` і `replaceProject(imported)` → `present === imported`, `past.length == 2`, `future == []`; `undo` → `present` — проект з доданою нотою; `redo` → знову `imported`. Після `undo`, `replaceProject` очищує `future`.
- Наявний тест «starts a new history when a project is loaded» не змінюється (`project/load` лишається).

### Frontend: `src/api/importResult.test.ts` (новий)
- Коректний об'єкт (проект фікстуру + одне попередження) → повертається без змін.
- `project` з `pitch 200` → кидає; `warnings` не масив → кидає; попередження без `count` → кидає; `null` → кидає.

### Frontend: `src/api/client.test.ts` (нові `it`)
`fetch` підмінено через `vi.stubGlobal`.
- Успіх: `fetch` повертає `{ ok: true, status: 200, json: async () => validResult }` → `importMidi(file)` повертає результат; `fetch` викликано з `'/api/import/midi'` і `{ method: 'POST', headers: { 'Content-Type': 'audio/midi' }, body: file, signal: undefined }`.
- `new Blob([new Uint8Array(MAX_MIDI_IMPORT_BYTES + 1)])` → `MidiImportError` `too_large`, `fetch` не викликано; `MAX_MIDI_IMPORT_BYTES === 4194304`.
- `{ ok: false, status: 413 }` → `too_large`.
- `{ ok: false, status: 422, json: async () => ({ detail: { code: 'invalid_file', message: 'The file is not a valid MIDI file.' } }) }` → `invalid`, `detail` — цей текст; 422 з `json`, що кидає → `invalid`, `detail null`.
- `{ ok: false, status: 500 }` → `server`, `status 500`.
- `TypeError('Failed to fetch')` → `network`; `AbortError` при `controller.abort()` → відхиляється саме `DOMException`.
- 200 з невалідним проектом → `response`; 200, де `json()` кидає → `response`.

### Frontend: `src/utils/midiImport.test.ts` (новий)
- `isProjectEmpty(createEmptyProject()) === true`; з однією нотою → `false`; лише з педаллю → `false`; `bpm 90` без нот → `true`.
- `countLabel(1, 'note') === '1 note'`, `countLabel(0, 'note') === '0 notes'`, `countLabel(2, 'pedal') === '2 pedals'`.
- `importConfirmMessage('song.mid', current(3 ноти, 1 педаль), imported(120, 4))` → точний рядок з розділу «Технічні рішення».
- `importSummary('song.mid', imported(120 нот, 4 педалі, 90 BPM, 3/4))` → `Imported "song.mid": 120 notes, 4 pedals, 90 BPM, 3/4.`
- `importErrorMessage` для кожного `kind` (включно з `invalid` з `detail` і без) і для довільної `Error` → очікувані тексти.

### Frontend: `src/components/FileLoadButton.test.tsx` (новий `it`)
- `disabled` → `input` має атрибут `disabled`, `label` має клас `file-load--disabled`; без пропа — не має.

### Frontend: `src/components/ImportButton.test.tsx` (новий)
Рендер через `renderWithProviders(<><ImportButton /><TestControls /></>, notes, editor, pedals)` (реальні `ProjectProvider`, `EditorProvider`, `TransportProvider` з `FakePianoEngine`, `StateProbe`); `TestControls` — тестовий компонент у файлі тесту: кнопки «Undo»/«Redo» (`useHistoryApi()`, `disabled={!canUndo}` / `!canRedo` з `useHistoryState()`), кнопка «Play» (`useTransportApi().togglePlay`), кнопка «Add note» (`useProjectDispatch()` + `addNotes`) і `<output data-testid="transport-status">{useTransportState().status}</output>`; `fetch` — відкладені promise (як у `ExportButton.test.tsx`); `vi.spyOn(window, 'confirm')`. Файл — `new File([bytes], 'song.mid', { type: 'audio/midi' })`, вибір — `fireEvent.change(screen.getByLabelText('Import MIDI file'), { target: { files: [file] } })`. Відповідь backend — проект з 2 нотами, 1 педаллю, 90 BPM, 3/4.
- **Порожній проект:** вибір файлу → `fetch` викликано з `'/api/import/midi'` і `body === file`; після відповіді `confirm` **не** викликано, `readNotes` — 2 імпортовані ноти, `readPedals` — 1, `status` містить `Imported "song.mid": 2 notes, 1 pedal, 90 BPM, 3/4.`
- **Непорожній проект, відмова:** початково 1 нота; `confirm → false` → `confirm` викликано з рядком, що містить `"song.mid"` і `2 notes`; проект не змінився (`readNotes` — початкова нота), немає ні `status`, ні `alert`.
- **Непорожній проект, згода:** `confirm → true` → проект замінено.
- **Undo/redo:** після імпорту в непорожній проект клік «Undo» → повертається початкова нота (і лише вона); «Redo» → знову імпортовані ноти. Імпорт — рівно один крок: після одного «Undo» кнопка «Undo» (на `canUndo`) вимкнена.
- **Виділення і транспорт:** `editor` з `selectedNoteIds: ['n1']` і нотою `n1`; імпорт проекту, де теж є `n1` → `readEditor(...).selectedNoteIds` порожній. Перед імпортом клік «Play» і очікування `transport-status` = `playing` (двигун фейковий) → після імпорту `transport-status` = `stopped`.
- **Попередження:** відповідь з двома попередженнями → `<details>` із `summary` `2 warnings` і двома `li` з текстами `message`; кнопка «Dismiss import message» прибирає повідомлення.
- **Помилки:** 422 з `detail.message` `The file is not a valid MIDI file.` → `alert` `Could not import: The file is not a valid MIDI file.`, проект не змінився, `confirm` не викликано; `TypeError` → `Could not import: the backend is unavailable.`; файл більший за ліміт (`Object.defineProperty(file, 'size', { value: MAX_MIDI_IMPORT_BYTES + 1 })`) → `Could not import: the file is larger than 4 MB.`, `fetch` не викликано.
- **Під час запиту:** текст кнопки `Importing…`, `input` вимкнений; другий `fireEvent.change` (React викликає обробник і на `disabled` input, тож тест перевіряє саме захист `busyRef`) не викликає `fetch` вдруге; після відповіді знову `Import .mid`.
- Новий імпорт прибирає попередню помилку на старті.
- Зміна проекту під час запиту (клік «Add note», коли проект був порожній) → `confirm` викликано (використано актуальний проект).
- **Unmount під час запиту** → `signal.aborted === true`; після відхилення `AbortError` немає попереджень React (`vi.spyOn(console, 'error')` не викликано).

### Frontend: `src/App.test.tsx` (новий `it`)
- У `banner` «Transport» є текст «Import .mid» і поле `Import MIDI file` (`input[type=file]`, `accept` містить `.mid`); під час рендеру `fetch` викликано лише з `'/api/health'`.

### E2E: `frontend/e2e/import.spec.ts` (новий)
- **Round-trip:** створити дві ноти (`clickGrid`), експортувати (`Export .mid`, `waitForEvent('download')`, `download.path()`), `Ctrl+A` + `Delete` у сітці → 0 нот; `setInputFiles` поля `Import MIDI file` шляхом до завантаженого файлу → 2 ноти на тих самих місцях (перевірити `aria-label` нот), статус `Imported "arrangement.mid": 2 notes…`; `Ctrl+Z` → 0 нот.
- **Підтвердження:** при наявних нотах імпорт того самого файлу: `page.once('dialog', d => d.dismiss())` → нот стільки ж, як до імпорту; `d.accept()` → ноти замінено.
- **Некоректний файл:** `setInputFiles({ name: 'bad.mid', mimeType: 'audio/midi', buffer: Buffer.from('nope') })` → `alert` `Could not import: The file is not a valid MIDI file.`

### Ручна перевірка в браузері
`cd backend && uv run uvicorn app.main:app --reload`, `cd frontend && npm run dev`, http://localhost:5173, Chrome і Firefox.
1. Додати кілька нот і педалей, «Export .mid», очистити проект, «Import .mid» з цим файлом → ноти, педалі, BPM і розмір як до експорту; підтвердження не з'являється (проект порожній).
2. При непорожньому проекті імпорт → діалог з кількістю нот; «Cancel» — нічого не змінилося; «OK» — проект замінено; `Ctrl+Z` повертає попередній проект цілком, `Ctrl+Shift+Z` — знову імпортований.
3. Імпорт стороннього фортепіанного MIDI (наприклад, експорт з MuseScore 4 або файл з відкритої колекції на кшталт piano-midi.de), format 0 і format 1 → ноти на місцях, Play звучить так само, як у сторонній програмі. Записати у звіт, які файли перевірено.
4. Файл з кількома темпами → попередження `tempo change(s)` у списку, ноти звучать з оригінальним таймінгом, BPM = початковий.
5. Файл з нотами поза A0–C8 або з ударними (GM-файл з барабанами) → попередження з кількістю.
6. Перейменований `.txt`/`.mp3` у `.mid` → зрозуміла помилка; файл > 4 MB → помилка без запиту (DevTools → Network порожній).
7. Імпорт під час відтворення → відтворення зупиняється, новий проект не звучить сам.
8. Зупинити backend → «Import .mid» → `Could not import: the backend is unavailable.`
9. Консоль без помилок і попереджень React; `git status --porcelain` не показує `.mid`.
10. Для найбільшого перевіреного файлу записати у звіт розмір, кількість нот і час від вибору файлу до появи нот (DevTools → Network, час запиту `/api/import/midi`).

## Критерії готовності (Definition of Done)
- [ ] `cd backend && uv run pytest && uv run ruff check . && uv run ruff format --check . && uv run mypy app` — зелено.
- [ ] `cd frontend && npm test -- --run && npm run lint && npm run typecheck && npm run build && npx prettier --check .` — зелено.
- [ ] `cd frontend && npm run e2e` — зелено (включно з `e2e/import.spec.ts`).
- [ ] Усі тести з розділу «Тести» наявні й проходять. `cd backend && uv run pytest --cov=app --cov-report=term-missing` показує 100 % покриття рядків для `app/services/midi_import.py`, `app/api/import_midi.py`, `app/models/midi_import.py` і нових функцій `app/services/timing.py`.
- [ ] `git diff main -- backend/pyproject.toml backend/uv.lock frontend/package.json frontend/package-lock.json` порожній (нових залежностей немає).
- [ ] `grep -rlE 'from typing import .*\bAny\b|: Any\b|-> Any\b|\[Any\]' backend/app --include='*.py'` показує лише `app/services/midi_export.py` і `app/services/midi_import.py` (слово «Any» у docstring не рахується).
- [ ] Другий коміт гілки — `docs: add plan 017 and its review` з файлами `docs/plans/017-midi-import.md` і `docs/plans/017-midi-import.review.md`.
- [ ] Наявні тести не змінено: `git diff main --name-status -- backend/tests frontend/src frontend/e2e | grep -E '\.test\.tsx?$|/test_.*\.py$|\.spec\.ts$'` показує `M` лише для `tests/test_timing.py`, `projectReducer.test.ts`, `history.test.ts`, `client.test.ts`, `FileLoadButton.test.tsx`, `App.test.tsx`, і в їхньому `git diff main` немає видалених рядків (крім імпортів); решта — `A`.
- [ ] Перший коміт гілки — `docs: add owner requirements 2.7–2.9 and tasks 011–018`, що змінює лише `CLAUDE.md` (`git show --stat <commit>`).
- [ ] При запущеному backend: `curl -s -X POST localhost:8000/api/export/midi -H 'Content-Type: application/json' --data @backend/tests/fixtures/sample_project.json -o /tmp/a.mid && curl -s -X POST localhost:8000/api/import/midi -H 'Content-Type: audio/midi' --data-binary @/tmp/a.mid` → JSON з 3 нотами, `"bpm":120.0`, `"warnings":[]`; `curl -s -o /dev/null -w '%{http_code}' -X POST localhost:8000/api/import/midi --data-binary 'nope'` → `422`.
- [ ] README має розділ «Імпорт MIDI».
- [ ] Ручна перевірка (пп. 1–10) пройдена в Chrome і Firefox; у звіті вказано сторонні файли, на яких перевірено.
- [ ] У гілці до злиття (коміт `docs: mark task 017 as done`): у CLAUDE.md `[x]` лише для 2.9 «Імпорт `.mid`», «Кнопка Info» лишається `[ ]`; статус 017 — «виконано»; статус плану — `виконано`.
- [ ] Гілку `feature/017-midi-import` злито в `main` (`--no-ff`) і запушено; на `main` перевірки зелені.

## Ризики / відкриті питання
- **Задача поза чергою.** Розділ 8 дозволяє змінювати порядок лише за погодженням з власником; тут власник попросив прямо. 011–016 і 018 лишаються «не розпочато». Конфліктів із ними не очікується: 013 (BPM перераховує ноти) змінить `project/setBpm`, а імпорт використовує окрему дію `project/replace`; 015 (offset) додасть поле до `Project`, і тоді імпорт має задавати offset = 0 — це дрібна правка в 015, а не тут.
- **Кілька темпів → один BPM.** Звучання зберігається (секунди за tempo map), але сітка тактів редактора йде за початковим темпом, і повторний експорт запише один темп. Користувач бачить попередження; це прямо випливає з моделі з одним `bpm` (розділ 7).
- **Суворість `mido`.** Деякі «майже коректні» файли (некоректна key signature, сторонні чанки між `MTrk`, неправильна довжина доріжки) `mido` не читає взагалі, і користувач отримає `invalid_file`. Власний толерантний парсер SMF — окрема задача, якщо це стане проблемою на практиці.
- **Повторний удар замість накладання однакових нот.** Дві однакові ноти на одному каналі, що перетинаються, імпортуються як «перша обривається на початку другої». Так поводиться синтезатор і так пише експорт (009), але якщо файл розраховано на інший програвач (FIFO-накладання), тривалість першої ноти буде коротшою.
- **Порядок note-on / note-off на одному тіку.** Повторний удар, у якому note-on нової ноти стоїть перед note-off старої (в одній доріжці або в format 1, де note-off лежить у доріжці з більшим номером), обробляється правилом поглинання: note-off старої ноти на тіку повторного удару ігнорується, нова нота звучить до свого note-off. Лишається неоднозначним лише випадок, коли на тому самому тіку після повторного удару йдуть **два** note-off однієї клавіші: другий закриває нову ноту, і вона отримує 1 мс. Такий файл сам суперечливий (нова нота одночасно натиснута й відпущена); README описує правило.
- **Педалі на каналі 10 ігноруються** разом з нотами цього каналу. Якщо файл записав педаль саме туди, її не буде, і окремого попередження про це немає (попередження `percussion_skipped` рахує ноти).
- **Темп 0 у файлі** (формально допустимий у SMF) стискає відповідний відрізок до нуля секунд: ноти в ньому отримують 1 мс, педалі відкидаються. Імпорт не падає, користувач бачить `tempo_out_of_range`.
- **Швидкість `mido` на великих файлах.** Розбір файлу близько 4 МБ може тривати секунди; кнопка в цей час показує `Importing…`. Час на найбільшому перевіреному файлі фіксується у звіті ручної перевірки (п. 10).
- **Ударний канал пропускається завжди** (ноти й CC). Якщо хтось записав фортепіано на канал 10, ноти не імпортуються, але попередження `percussion_skipped` пояснює, чому.
- **`window.confirm`** блокує сторінку і має системний вигляд. Для однієї дії з можливістю undo це прийнятно; власний діалог — окрема дрібна задача.
- **Продуктивність.** 20 000 нот — межа, яку piano roll має витримати; якщо ручна перевірка на великому файлі (~10–20 тис. нот) покаже лаги, це фіксується у звіті як окрема задача (віртуалізація відмальовування), а не послаблює ліміт у цій задачі.
- **Відкрите питання до власника (не блокує): ліміти** 4 MB і 20 000 нот — дефолти; змінюються однією константою на кожному боці.
- **Відкрите питання до власника (не блокує): ударні.** Зараз канал 10 пропускається. Альтернатива — імпортувати все без винятків.
- **Обсяг.** Сервіс (~200 рядків), ендпоінт, дія reducer'а, клієнт, кнопка, тести, e2e. Одна гілка. Запасний поділ, якщо implementer не вкладається: **017a** — backend (кроки 2–5, без галочки), **017b** — frontend, e2e і README (кроки 6–10); галочка 2.9 «Імпорт `.mid`» ставиться лише після 017b.

## Зміни після рев'ю (раунд 1)
Зауваження рев'ю раунду 1 (`017-midi-import.review.md`, 2026-09-29):

1. **Блокуюче: повторний удар, коли note-on нової ноти стоїть перед note-off старої на тому самому тіку.** У `pair_notes` додано стан `pending_release`. Коли повторний удар закриває попередню ноту на тіку T, записується очікування. Перший note-off або `note_on vel 0` цієї клавіші на тому самому T **поглинається**, тож нова нота лишається відкритою. Очікування з іншого тіку застаріле: воно скидається і нічого не поглинає. Правило поширюється і на format 1, де note-off лежить у доріжці з більшим номером. Альтернативу (черга відкритих нот) описано і відхилено з поясненням. Додано тести:
   - подієві: `[on(0,60,80), on(480,60,90), off(480,60), off(960,60)]` → `(0,480,80)`, `(480,960,90)`; варіант з `vel 0`; поглинається лише один note-off; застаріле очікування; інша клавіша та інший канал не поглинаються. Тест `[on(0), off(0)]` → нота нульової довжини лишився, з поясненням, чому поглинання там не спрацьовує; тест «перекриття однакових нот» не змінено;
   - файлові: format 1 з повтором у доріжці 1 і note-off у доріжці 2 на тому самому тіку та каналі; format 0 з тим самим порядком в одній доріжці.
   
   Ризик «Порядок подій різних доріжок» переписано на «Порядок note-on / note-off на одному тіку». Опис правила для README (крок 10) доповнено.
2. **Рекомендація: коміт плану й рев'ю.** У крок 1 додано другий коміт `docs: add plan 017 and its review` (план і файл рев'ю), у DoD — відповідний пункт.
3. **Рекомендація: педалі на каналі 10.** Рішення узгоджено з нотами: CC на каналі 10 ігноруються (опис у `pair_pedals`). Додано тест `cc(..., ch=9)` → `[]`, ризик і згадку в README.
4. **Рекомендація: темп 0.** Додано файловий тест: `set_tempo 0` на 0 і `500000` на 960. Очікується: імпорт не падає, `bpm 300.0`, попередження `tempo_out_of_range` і `tempo_changes`, нота на відрізку з нульовим темпом має 1 мс, педаль відкидається (`short_pedals`). Додано ризик «Темп 0 у файлі».
5. **Рекомендація: grep на `Any`.** У DoD команду замінено на `grep -rlE 'from typing import .*\bAny\b|: Any\b|-> Any\b|\[Any\]'`: слово «Any» у docstring більше не спрацьовує.
6. **Рекомендація: `fireEvent.change` на `disabled` input.** У тесті «Під час запиту» явно записано, що React викликає обробник і на `disabled` input, тож тест перевіряє саме захист `busyRef`.
7. **Рекомендація: час розбору великих файлів.** Додано п. 10 ручної перевірки: розмір файлу, кількість нот і час запиту для найбільшого перевіреного файлу. Додано ризик «Швидкість `mido` на великих файлах».
