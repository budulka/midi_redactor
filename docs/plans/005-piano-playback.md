# 005 — Відтворення нот звуком фортепіано, транспорт, playhead

**Статус:** схвалено
**Гілка:** feature/005-piano-playback

## Мета
Проект має зазвучати. Ноти з редактора програються семплами акустичного фортепіано, є транспорт (Play/Pause/Stop, позиція, старт з довільного місця) і курсор відтворення (playhead) у piano roll. Педалі впливають на звук, а віртуальна клавіатура програє ноти. Задача спирається на готове:
- модель і стан проекту (002): `Note`, `PedalEvent`, `Project`, `ProjectProvider`, `EditorProvider`;
- геометрію й лінійку piano roll (003): `timeToX`/`xToTime`, `timelineDurationSeconds`, `TimeRuler`, `KEYBOARD_WIDTH_PX`, спільний scroll-контейнер `PianoRoll`;
- функції педалей (004): `noteSoundingEnds` (кінець звучання з урахуванням sustain і sostenuto), `pedalsOfType`/`pressedPedalIn`;
- хуки `onNoteOn`/`onNoteOff` у `PianoKeyboard` (003), які досі ні до чого не підключені.

Логіку, що вже є, не дублюємо.

Пункти розділу 2 CLAUDE.md, які задача **закриває повністю** (після виконання ставимо `[x]`):
- 2.2 «Натискання на клавішу віртуальної клавіатури програє відповідну ноту».
- 2.3 «Педаль впливає на програвання (sustain подовжує звучання нот)». Sustain і sostenuto визначають момент відпускання через `noteSoundingEnds`, soft зменшує гучність (див. «Технічні рішення»).
- 2.4 «Програвання нот із редактора **звуком фортепіано** (семпли акустичного фортепіано)».
- 2.4 «Play / Pause / Stop, курсор відтворення (playhead), старт з довільної позиції».

Пункт, який задача **не закриває** (галочку НЕ ставимо):
- 2.4 «Відтворення MIDI синхронізоване з аудіо та відео (спільна часова шкала)». Аудіо й відео з'являться в 006/007, синхронізація — у 008. Тут лише закладаємо «годинник» таймлайну (`TransportAnchor`, `positionAt`/`contextTimeAt`, `Transport.subscribe`/`getPosition`), до якого 008 під'єднає медіа.

## Поза межами задачі
- Зміна швидкості відтворення, синхронізація з аудіо/відео — 006/007/008. Формули годинника вже містять `rate`, але в 005 він завжди дорівнює 1, і UI для нього немає.
- Гарячі клавіші транспорту (Space = Play/Pause тощо) — 010 («гарячі клавіші»).
- «Chase» нот: ноти, що почалися до позиції старту, не звучать, навіть якщо в цей момент ще мали б звучати. Відтворення починається з нот, у яких `start >= позиція`.
- Прослуховування ноти під час її створення чи перетягування в сітці.
- Глісандо по віртуальній клавіатурі (натискання клавіш, над якими проводять затиснутою мишею). Поведінку `PianoKeyboard` не змінюємо.
- Кілька шарів velocity, шум педалі, резонанс струн, тембровий ефект una corda. Семпли однодинамічні, soft моделюється лише гучністю.
- Цикл (loop) і метроном.
- Експорт `.mid` — 009. Backend не змінюється.

## Технічні рішення

### Нова залежність: `tone@^15.1.22`
- Стек (розділ 3) прямо передбачає Tone.js для звуку: `Sampler` робить repitch найближчого семплу, керує огинаючою (release) і приймає абсолютний час події в секундах `AudioContext`. Саме це потрібно для планування.
- 15.1.22 — поточна стабільна версія на npm (тег `latest`). Типи TypeScript вбудовані, тому `@types/*` не потрібні.
- Розглянуті альтернативи:
  - `@tonejs/piano`: має velocity-шари й шум педалі, але давно не оновлювався, залежить від `tone@14` і тягне семпли з CDN.
  - `smplr`: теж бере семпли з CDN, і його немає в стеку.
  - «Чистий» Web Audio: довелося б самостійно писати repitch, огинаючі й завантаження.
- **Важливо:** імпорт `tone` одразу, на рівні модуля, створює `AudioContext` (`export const Transport = getContext().transport` у `Tone/index.ts`). Якщо це станеться до жесту користувача, Chrome попередить в консолі, що контекст не дозволено запустити. Тому `tone` імпортується **лише** в `src/audio/toneEngine.ts`, а той завантажується динамічним `import()` при першому жесті (Play або натискання клавіші). Заодно Tone.js потрапляє в окремий chunk і не збільшує початковий бандл.

### Семпли: Salamander Grand Piano, локально в репозиторії
| Варіант | Плюси | Мінуси |
|---|---|---|
| CDN (`https://tonejs.github.io/audio/salamander/`) | Репозиторій не збільшується | Без мережі звуку немає; сторонній хост може змінитися або зникнути; CORS; версія не зафіксована |
| **Локально, `frontend/public/samples/salamander/*.mp3`** | Працює офлайн і на dev-сервері без мережі; версія зафіксована в git; Vite копіює файли в `dist/` як є | +2.4 МБ у репозиторії; треба виняток у `.gitignore` |

**Обрано локальні файли.**
- **Набір.** 30 mp3-файлів із репозиторію `Tonejs/audio` (каталог `salamander`), зафіксований коміт `869b6f8d9cddb47d966238c012041480b1ce517a`. Ноти A, C, D#, F# кожної октави (кожні 3 півтони) від A0 до C8: `A0…A7`, `C1…C8`, `Ds1…Ds7`, `Fs1…Fs7`. Загальний розмір mp3 — 2 423 450 байт. Ogg-версії (7.9 МБ) не беремо: mp3 декодують усі сучасні браузери.
- **Ліцензія.** Salamander Grand Piano, автор Alexander Holm, **CC-BY 3.0**. Ліцензія вимагає атрибуції, тому додаємо `frontend/public/samples/salamander/README.md`: автор, ліцензія з посиланням, джерело з хешем коміту, перелік файлів і **позначка про зміни**. CC-BY вимагає її: це не оригінальні WAV (48 кГц/24 біт, 16 шарів velocity), а зменшений набір mp3 (один шар, кожні 3 півтони), який конвертували автори Tone.js і рядок атрибуції в розділ README «Звук».
- **`.gitignore`.** Правило `*.mp3` ігнорує медіафайли користувача. Одразу після рядка `!**/tests/fixtures/**` додаємо виняток `!frontend/public/samples/**`. Перевірка: `git check-ignore -v frontend/public/samples/salamander/A0.mp3` нічого не виводить. Інші mp3 (медіа користувача) і далі ігноруються: `git check-ignore frontend/foo.mp3` виводить шлях.
- **Завантаження файлів.** `curl` у дозволах агента відсутній, тому файли завантажує скрипт `frontend/scripts/fetch-piano-samples.mjs` (Node 20, глобальний `fetch`, без залежностей). Скрипт бере `https://raw.githubusercontent.com/Tonejs/audio/<SHA>/salamander/<file>` для 30 імен і записує їх у `public/samples/salamander/`. Наприкінці він перевіряє, що файлів 30 і сумарний розмір дорівнює 2 423 450 байт; якщо ні, виходить з кодом 1. Якщо розмір не зійдеться, хоча кількість файлів і хеш коміту правильні (наприклад, через іншу віддачу raw.githubusercontent), implementer оновлює константу і зазначає це у звіті. Це дрібне відхилення, а не причина зупинятися. У `package.json` додається скрипт `"fetch-samples": "node scripts/fetch-piano-samples.mjs"`. Файли комітяться, тож іншим розробникам скрипт запускати не потрібно: він лише документує походження семплів і дає змогу їх відтворити.

### Абстракція аудіо-движка (тестування без Web Audio)
У jsdom немає `AudioContext`, тому весь код поза `toneEngine.ts` працює через інтерфейс, а в тестах використовується фейк.

`src/audio/engine.ts`:
```ts
export type EngineChannel = 'playback' | 'live';

export interface PianoEngine {
  /** Current time of the audio clock (AudioContext.currentTime), seconds. */
  now(): number;
  /** Resumes the audio context; call synchronously inside a user gesture handler. */
  resume(): Promise<void>;
  /** velocity: MIDI 1–127; time: audio clock seconds. */
  attack(channel: EngineChannel, pitch: number, velocity: number, time: number): void;
  /** Stops every voice of this pitch on the channel at time. */
  release(channel: EngineChannel, pitch: number, time: number): void;
  releaseAll(channel: EngineChannel, time: number): void;
  /** Calls callback every intervalSeconds (not throttled in background tabs); returns a stop function. */
  startTicker(callback: () => void, intervalSeconds: number): () => void;
  dispose(): void;
}
```
- **Два канали** (`playback` для транспорту і `live` для клавіатури) реалізовані двома `Sampler`, які ділять ті самі декодовані буфери. Stop/Pause викликає `releaseAll('playback')`, і нота, яку користувач саме тримає на клавіатурі, не обривається. І навпаки: відпускання клавіші C4 не глушить C4 у відтворенні.
- `src/audio/samples.ts`:
  - `PIANO_SAMPLE_PITCHES`: `[21, 24, …, 108]`, 30 значень;
  - `sampleFileName(pitch)`: `pitchName(pitch)` із заміною `#` на `s` + `.mp3` (`D#1` → `Ds1.mp3`);
  - `pianoSampleUrls(): Record<string, string>`: `{ A0: 'A0.mp3', C1: 'C1.mp3', 'D#1': 'Ds1.mp3', … }`;
  - `PIANO_SAMPLE_BASE_URL = \`${import.meta.env.BASE_URL}samples/salamander/\``.
- `src/audio/toneEngine.ts` — єдиний файл з імпортом `tone`, і лише іменованим: `import { Sampler, ToneAudioBuffers, getContext, start } from 'tone'` (так його легше мокати). Функція `createToneEngine(): Promise<PianoEngine>`:
  1. `await start()`.
  2. Завантажує буфери: `new ToneAudioBuffers({ urls: pianoSampleUrls(), baseUrl: PIANO_SAMPLE_BASE_URL, onload, onerror })`, обгорнуте в Promise. На `onerror` Promise відхиляється з `Error('Could not load piano samples')`.
  3. Створює два `Sampler` (спершу `playback`, потім `live`) з однаковими опціями `{ urls: <map name → buffers.get(name)>, release: SAMPLER_RELEASE_SECONDS (0.2), volume: SAMPLER_VOLUME_DB (-6) }` і викликає `.toDestination()`. `-6 dB` дає запас від кліпінгу, коли звучить багато нот одночасно.
  4. Методи інтерфейсу:
     - `now()` → `getContext().currentTime`. Це «сирий» час контексту без `lookAhead` Tone: планування робимо самі, а 008 порівнюватиме його з медіа.
     - `attack` → `sampler.triggerAttack(pitchName(pitch), time, velocity / 127)`. Висоту передаємо **рядком**: число Tone трактує як Гц.
     - `release` → `triggerRelease(pitchName(pitch), time)`; `releaseAll` → `sampler.releaseAll(time)`.
     - `startTicker` → `getContext().setInterval(cb, s)`, а функція зупинки викликає `getContext().clearInterval(id)`. Тікер Tone працює через Worker і не гальмується у фонових вкладках, на відміну від `window.setInterval`.
     - `resume` → `start()`.
     - `dispose` звільняє обидва семплери, потім `ToneAudioBuffers`; контекст не закриваємо. У коді потрібен коментар: семплери ділять ті самі `ToneAudioBuffer`, тому кожен буфер звільняється кілька разів, а повторний `dispose` у Tone нешкідливий.
- `src/audio/loadEngine.ts`: `loadPianoEngine = () => import('./toneEngine.ts').then((m) => m.createToneEngine())`.
- `src/audio/testing/FakePianoEngine.ts` — тестовий двійник, який імпортують лише тести:
  - поле `time` (задається вручну) і метод `now()` повертає його;
  - `calls: Array<{ op: 'attack' | 'release' | 'releaseAll'; channel; pitch?; velocity?; time }>`;
  - `resume` резолвиться одразу;
  - `startTicker` зберігає колбек, `tick()` викликає всі активні колбеки, `activeTickers` — кількість активних тікерів.

### Годинник таймлайну (чисті функції) — `src/audio/transportClock.ts`
```ts
export interface TransportAnchor {
  readonly contextTime: number; // audio clock time at which the timeline is at `position`
  readonly position: number;    // timeline seconds
  readonly rate: number;        // timeline seconds per audio second; always 1 in 005
}
export function positionAt(anchor: TransportAnchor, now: number): number;
// = anchor.position + max(0, now - anchor.contextTime) * anchor.rate
export function contextTimeAt(anchor: TransportAnchor, position: number): number;
// = anchor.contextTime + (position - anchor.position) / anchor.rate
```
- **Джерело часу — `AudioContext.currentTime`** (через `engine.now()`), а не `Tone.Transport`. Чому:
  - модель тримає час у секундах, а `Tone.Transport` мислить тіками та BPM;
  - після кожної правки під час відтворення події `Tone.Transport` довелося б повністю перепланувати;
  - зміну швидкості (006/007) у `Tone.Transport` довелося б моделювати через BPM.
  
  Власний «якір» (`TransportAnchor`) вирішує все це однією формулою. Коли з'явиться швидкість, `setRate` лише «переякорює» годинник: `{ contextTime: now, position: поточна, rate: нова }`. 008 візьме `getPosition()` і `subscribe()` для синхронізації `<audio>`/`<video>`.
- `positionAt` не повертає позицію, меншу за `anchor.position`. Відтворення стартує з невеликою затримкою (`START_DELAY_SECONDS`), і до її завершення playhead стоїть на місці, а не «їде назад».

### Події відтворення (чисті функції) — `src/audio/playbackEvents.ts`
```ts
export interface PlaybackEvent {
  readonly time: number;            // timeline seconds
  readonly kind: 'attack' | 'release';
  readonly noteId: string;
  readonly pitch: number;
  readonly velocity: number;        // effective playback velocity (attack only; 0 for release)
}
export const SOFT_PEDAL_VELOCITY_FACTOR = 0.7;
export function playbackVelocity(velocity: number, softPressed: boolean): number;
// softPressed ? max(1, round(velocity * 0.7)) : velocity
export function buildPlaybackEvents(notes, pedals): readonly PlaybackEvent[];
export function firstEventAtOrAfter(events, time): number; // binary search, index or events.length
```
- `buildPlaybackEvents`:
  - для кожної ноти створює `attack` у `note.start` і `release` у `noteSoundingEnds(notes, pedals).get(id)`. Так sustain і sostenuto визначають момент відпускання: це та сама функція, що малює «хвости» в 004;
  - velocity атаки = `playbackVelocity(note.velocity, pressedPedalIn(pedalsOfType(pedals, 'soft'), note.start) !== null)`;
  - сортує за `time`. За рівного часу `release` іде **перед** `attack`, а події одного типу впорядковані за `pitch` за зростанням. Результат детермінований і не залежить від порядку нот на вході.
- **Чому порядок важливий.** `Sampler.triggerRelease(pitch)` зупиняє **всі** активні голоси цієї висоти. Коли нота C4 закінчується рівно тоді, коли починається наступна C4 (повторний удар обрізає звучання, див. `noteSoundingEnds`), відпускання має прийти до нової атаки. Інакше нова нота заглухне одразу.
- **Soft (una corda) — рішення 005.** Якщо soft натиснута в момент атаки ноти (`start` включно, `end` не включно), нота звучить з velocity × 0.7. Реальне una corda тихіше приблизно на 3–6 dB і м'якше за тембром, а 0.7 при лінійній залежності гучності від velocity дає близько −3 dB. На MIDI-дані це не впливає: у 009 soft експортується як CC67, а velocity нот лишаються як є.
- **Sostenuto** працює так, як закладено в `noteSoundingEnds` (004): утримує ноти, клавіша яких натиснута в момент натискання педалі. Свідоме спрощення (його відзначив рев'ю 004) лишається: sostenuto не підхоплює ноти, які в цей момент тримає лише sustain.

### Планувальник (чисті функції) — `src/audio/scheduler.ts`
Класичний lookahead-планувальник («A Tale of Two Clocks»). Тікер кожні `TICK_INTERVAL_SECONDS = 0.025` с планує на аудіо-годиннику всі події, що припадають на вікно до `now + LOOKAHEAD_SECONDS (0.1)`. Стан вікна описують чисті функції:
```ts
export interface ScheduleState {
  readonly cursor: number;                       // index of the next event to consider
  readonly scheduledUntil: number;               // timeline seconds; events with time < this are done
  readonly active: ReadonlyMap<string, number>;  // attacked, not yet released: noteId → pitch
}
export function startSchedule(events, from: number): ScheduleState;
// cursor = firstEventAtOrAfter(events, from), scheduledUntil = from, active = empty
export function advanceSchedule(state, events, until: number): { state: ScheduleState; due: PlaybackEvent[] };
export function resyncSchedule(state, events): { state: ScheduleState; forcedPitches: number[] };
```
**Головне правило відпускання («останній голос висоти»).** `Sampler.triggerRelease(pitch)` глушить **усі** голоси цієї висоти в каналі. Модель дозволяє накладені ноти однієї висоти (reducer і `validation.ts` цього не забороняють). Тому відпускання ноти X завжди прибирає X з `active`, але команда `release` у движок (елемент `due` чи `forcedPitches`) формується **лише тоді, коли в `active` не лишилося жодної іншої ноти з тією самою висотою**. Голоси висоти глушить відпускання останньої з накладених нот. Приклади:
- `C4 [0, 1)` + `C4 [0.5, 1.5)`. Відпускання першої ноти в 1 не надсилається, бо друга ще активна. Єдиний `release` 60 іде в 1.5 і глушить обидва голоси.
- `C4 [0, 0.3)` + `C4 [0.2, 0.5)` + sustain `[0, 3)`. `noteSoundingEnds` дає 0.3 і 3. Відпускання в 0.3 пригнічується, друга нота звучить до 3.

Функції:
- `advanceSchedule` проходить події з `cursor`, у яких `time < until`, у порядку масиву.
  - `attack` додає ноту в `active` (`noteId → event.pitch`) і потрапляє в `due`.
  - `release` ноти, якої немає в `active`, **пропускається**. Так поводяться ноти, що почалися до позиції старту: їх не атакували, тож і відпускати нема чого.
  - `release` ноти з `active` прибирає її звідти. Висота береться **з `active`**, а не з `event.pitch`. У `due` потрапляє подія `{ ...event, pitch: activePitch }`, і лише якщо інших активних нот цієї висоти не лишилося (правило вище).
  - Якщо `until <= scheduledUntil`, функція повертає той самий `state` і порожній `due`.
- `resyncSchedule` викликається, коли проект змінився під час відтворення: `events` уже перебудовано.
  - `cursor = firstEventAtOrAfter(events, scheduledUntil)`.
  - Для кожної ноти з `active` шукаємо її події в новому масиві. Нота прибирається з `active` (примусове відпускання **старої**, збереженої в `active` висоти), якщо:
    - нота зникла (release не знайдено);
    - `release.time < scheduledUntil` (ноту вкоротили в уже спланований відрізок);
    - `attack.time >= scheduledUntil` (ноту перенесли вперед, і її атакуємо ще раз у свій час);
    - **висота змінилася**: `pitch` у нових подіях ≠ висота в `active`. Нота, яку перетягнули по вертикалі, замовкає на старій висоті. На новій вона не звучить, бо її атака вже позаду вікна; знову зазвучить при наступному відтворенні.
  - `forcedPitches` — унікальні висоти прибраних нот, для яких після всіх прибирань у `active` не лишилося іншої ноти тієї ж висоти.
  - Решта активних нот лишається, і їх відпустить звичайний `release`.
  - Ноти, вставлені «позаду» вікна (`attack < scheduledUntil`), не звучать: їхній `release` пропуститься, бо ноти немає в `active`.
- Чому відпускання не плануємо одразу разом з атакою: `Sampler.triggerRelease` зупиняє голоси й **очищає** свій список активних голосів. Після цього `Sampler.releaseAll` на Pause/Stop вже не зупинив би ноту, чиє відпускання заплановано на секунди вперед (наприклад, під sustain). Тому `release` потрапляє в движок лише тоді, коли входить у вікно lookahead. Так `releaseAll` завжди бачить усі голоси, що звучать.

### Транспорт (імперативне ядро без React) — `src/audio/Transport.ts`
```ts
export type TransportStatus = 'stopped' | 'playing' | 'paused';
export interface TransportSnapshot {
  readonly status: TransportStatus;
  readonly position: number; // cue position; while playing, the position at the moment playback started
}
export class Transport {
  constructor(options?: { lookaheadSeconds?: number; tickIntervalSeconds?: number; startDelaySeconds?: number });
  setEngine(engine: PianoEngine | null): void;
  hasEngine(): boolean;
  setProject(project: Project): void;
  play(): void;               // throws Error('Piano engine is not loaded') without an engine
  pause(): void;
  stop(): void;
  seek(position: number): void;
  getPosition(): number;      // live position while playing, snapshot.position otherwise
  getSnapshot(): TransportSnapshot; // stable object between changes (for useSyncExternalStore)
  subscribe(listener: () => void): () => void;
  dispose(): void;            // stop() + setEngine(null)
}
```
Константи: `START_DELAY_SECONDS = 0.05`, `LOOKAHEAD_SECONDS = 0.2`, `TICK_INTERVAL_SECONDS = 0.025`, `PLAYBACK_RATE = 1`.
- Тікер Tone (`Context.setInterval`) фактично спрацьовує з кроком `updateInterval` контексту, тобто близько 50 мс, а не 25. Lookahead 0.2 с дає запас понад 100 мс на важкі ререндери (перетягування нот). Затримка старту 0.05 с лишається: перші ноти плануються одразу в `play()`. Тести передають `lookaheadSeconds: 0.1` через `options`, щоб числа були короткими.
- **`setProject(project)`** перебудовує `events = buildPlaybackEvents(...)` і `endTime = timelineDurationSeconds(notes, bpm, ts, pedals)` (кінець видимого таймлайну). Якщо транспорт грає, викликає `resyncSchedule`, а кожну висоту з `forcedPitches` відпускає через `engine.release('playback', pitch, contextTimeAt(anchor, scheduledUntil))`.
- **`play()`**:
  - якщо `position >= endTime`, стартує з 0;
  - `anchor = { contextTime: now + START_DELAY_SECONDS, position, rate: PLAYBACK_RATE }`, `schedule = startSchedule(events, position)`;
  - одразу виконує `tick()`, запускає `engine.startTicker(tick, tickIntervalSeconds)`, ставить статус `playing` і сповіщає слухачів.
  - Якщо статус уже `playing`, нічого не робить.
- **`tick()`** (приватний):
  1. `now = engine.now()`.
  2. `advanceSchedule(schedule, events, positionAt(anchor, now + lookahead))`.
  3. Кожна подія з `due` йде в движок: `attack('playback', pitch, velocity, contextTimeAt(anchor, time))` або `release(...)`.
  4. Якщо `positionAt(anchor, now) >= endTime`, транспорт ставиться на паузу рівно в `endTime`.
- **`pause()`**: `releaseAll('playback', now)`, зупинка тікера, `position = min(positionAt(anchor, now), endTime)`, статус `paused`.
- **`stop()`**: те саме, але `position = 0`, статус `stopped`. Stop працює й на паузі (скидає позицію на 0).
- **`seek(t)`**: `t = max(0, t)`. Якщо транспорт грає, спершу `releaseAll('playback', now)`, зупинка тікера й **скидання внутрішнього статусу на `paused`** (без сповіщення слухачів, інакше `play()` за описом «нічого не робить»). Потім позиція `t` і знову `play()` з неї. Слухачі отримують одне сповіщення. Інакше просто змінюється позиція (статус `stopped` лишається `stopped`, `paused` — `paused`).
- **Слухачі** сповіщаються лише під час зміни статусу чи cue-позиції (play/pause/stop/seek/автопауза), а не на кожен тік. Позицію під час відтворення компоненти читають через `getPosition()` у `requestAnimationFrame`, тож React не ререндериться 60 разів на секунду.

### Стан у React — `src/state/TransportProvider.tsx` + `src/state/transportContext.ts`
- Патерн той самий, що в `ProjectProvider`/`projectContext.ts`. Provider кладеться всередину `ProjectProvider` і `EditorProvider` (у `App.tsx`: `ProjectProvider > EditorProvider > TransportProvider`).
- Props: `{ children; loadEngine?: () => Promise<PianoEngine> }`, за замовчуванням `loadPianoEngine`.
- Усередині:
  - `Transport` створюється один раз через `useState(() => new Transport())`;
  - `useEffect(() => transport.setProject(project), [project])`;
  - `snapshot = useSyncExternalStore(transport.subscribe, transport.getSnapshot)`;
  - `engineStatus: 'idle' | 'loading' | 'ready' | 'error'` у `useState`.
  - Cleanup ефекту при unmount: `transport.stop()`, `engine?.dispose()`, `transport.setEngine(null)`, `engineStatus` → `idle`. Це сумісно зі StrictMode: після повторного монтування движок підвантажиться на наступному жесті.
- Контексти:
  - `TransportStateContext`: `{ status, position, engineStatus, engineError: string | null }`;
  - `TransportApiContext`: стабільний об'єкт (`useMemo` без змінних залежностей, актуальні значення читаються через ref) `{ togglePlay(), stop(), seek(t), getPosition(), noteOn(pitch), noteOff(pitch), retry() }`.
  - Хуки `useTransportState()` і `useTransportApi()` кидають помилку поза provider'ом, як `useProject`.
- **Autoplay-політика і завантаження семплів.** Движок не створюється до першого жесту. Приватна `ensureEngine(): Promise<PianoEngine>`:
  - якщо движок уже є, **синхронно** викликає `engine.resume()` (у стеку обробника кліку, як вимагають браузери) і повертає його;
  - інакше ставить `engineStatus = 'loading'` і викликає `loadEngine()` (всередині `start()` з Tone.js). Результат: `setEngine`, статус `ready`; або помилка — статус `error`, `engineError = error.message`;
  - повторні виклики під час завантаження повертають той самий Promise.
  - **Unmount під час завантаження** (StrictMode, тести). Провайдер тримає `disposedRef`: cleanup ефекту ставить його в `true`, а mount — у `false`. Якщо після resolve `loadEngine()` провайдер уже розмонтований або Promise належить попередньому монтуванню (перевірка через лічильник поколінь `generationRef`), движок одразу отримує `dispose()` і в транспорт не потрапляє. `setState` після unmount не викликається.
- **`togglePlay()`**: якщо грає, `pause()`. Інакше `ensureEngine().then(() => transport.play())`. Поки триває `loading`, повторні натискання ігноруються.
- **`noteOn(pitch)`** (віртуальна клавіатура): pitch додається в `heldRef: Set<number>`.
  - Движок готовий: `resume()` + `attack('live', pitch, LIVE_VELOCITY (96), engine.now())`.
  - Движка немає: `ensureEngine().then(...)`, і атака відбудеться після завантаження, якщо клавішу **досі тримають** (`heldRef.has(pitch)`). Тож перше натискання не буде «німим», якщо клавішу затримати.
- **`noteOff(pitch)`**: видаляє pitch з `heldRef`; якщо движок є, `release('live', pitch, engine.now())`.
- **`retry()`**: скидає помилку й повторює `ensureEngine()`.

### Компоненти
- **`src/components/TransportControls.tsx`** (у `header.app__transport` після `TempoControls`), `role="group" aria-label="Playback"`:
  - кнопка Play/Pause: `aria-label` і текст «Play» / «Pause» залежно від `status`. Поки `engineStatus === 'loading'`, вона `disabled` і показує «Loading piano…»;
  - кнопка «Stop»: `disabled`, коли `status === 'stopped'` і `position === 0`;
  - позиція `<output aria-label="Playback position">` у форматі `formatClock(t)` + `formatBarBeat(t, bpm, ts)`, наприклад `0:01.250 · 1.3`. Під час відтворення текст оновлюється в `requestAnimationFrame` через `ref.textContent`, без ререндеру;
  - прапорець «Follow» (`followPlayhead` з `EditorState`);
  - якщо `engineStatus === 'error'`: `<span role="alert">Could not load piano samples</span>` і кнопка «Retry».
- **`src/components/PianoRoll/Playhead.tsx`**, props `{ scrollRef: RefObject<HTMLDivElement | null> }`:
  - `div.piano-roll__playhead` (`data-testid="playhead"`, `aria-hidden`), позиція задається через `style.transform = translateX(${timeToX(t)}px)`;
  - коли не грає, `t = snapshot.position` (ререндер лише при зміні snapshot чи zoom);
  - коли грає, `useAnimationFrame` на кожному кадрі читає `api.getPosition()` і пише `transform` напряму в DOM (`ref.current.style`), а за `followPlayhead` ще й `scrollLeft` за `followScrollLeft(...)`.
  - Сам piano roll (сітка, ноти) під час руху playhead **не ререндериться**: `PianoRoll` бере з транспорту лише стабільний `useTransportApi()`.
- **`src/components/useAnimationFrame.ts`**: `useAnimationFrame(active: boolean, callback: () => void)`. Поки `active`, викликає `callback` у кожному кадрі (актуальний колбек зберігається в ref) і скасовує `cancelAnimationFrame`, коли `active = false`, та при unmount.
- **`TimeRuler.tsx`** (зміна): необов'язковий prop `onSeek?: (time: number) => void`. На `onMouseDown` лівою кнопкою: `xToTime(clientX - rect.left, { pixelsPerSecond, rowHeight: 0 })` → `onSeek`. Snap не застосовуємо: позиція ставиться точно під курсор. CSS `.time-ruler { cursor: pointer }`, коли `onSeek` передано. Наявні тести не змінюються.
- **`PianoRoll.tsx`** (зміни):
  - `const api = useTransportApi()`;
  - `<PianoKeyboard rowHeight={ROW_HEIGHT_PX} onNoteOn={api.noteOn} onNoteOff={api.noteOff} />`;
  - `<TimeRuler … onSeek={api.seek} />`;
  - останнім дочірнім елементом `.piano-roll__scroll` іде `<Playhead scrollRef={scrollRef} />`.
- **Розміщення playhead (CSS):**
  - `.piano-roll__scroll { position: relative }`.
  - `.piano-roll__playhead { position: absolute; grid-column: 2; grid-row: 1 / -1; top: 0; bottom: 0; left: 0; width: 2px; margin-left: -1px; background: var(--playhead); pointer-events: none; z-index: 2; will-change: transform }`. Абсолютно позиціонований елемент не бере участі в автоматичному розміщенні grid, тож не зсуває наявні комірки. Він займає всю висоту колонки часу: лінійку, сітку й доріжку педалей.
  - Щоб лінія ховалася під sticky-клавіатурою, а не малювалася поверх неї, z-index змінюються так: `.piano-roll__keyboard` 1 → 3, `.piano-roll__corner` і `.piano-roll__pedal-labels` 3 → 4. Playhead з z-index 2 іде в DOM після лінійки й доріжки (теж z-index 2), тому малюється над ними, але під клавіатурою, кутом і підписами педалей.
  - `App.css :root`: `--playhead: #ff5a5a`.
- **Автопрокрутка** (чиста функція в `pianoRollGeometry.ts`): `FOLLOW_MARGIN_PX = 24`; `followScrollLeft(playheadX, scrollLeft, clientWidth, keyboardWidth = KEYBOARD_WIDTH_PX): number | null`.
  - Видима частина таймлайну: `[scrollLeft, scrollLeft + clientWidth - keyboardWidth)`, бо sticky-клавіатура закриває ліві 72 px.
  - Якщо `playheadX < scrollLeft` або `playheadX > scrollLeft + clientWidth - keyboardWidth - FOLLOW_MARGIN_PX`, повертає `max(0, playheadX - FOLLOW_MARGIN_PX)`. Інакше `null`. Це «посторінкова» прокрутка.
- **Форматування** — `src/utils/transportFormat.ts`:
  - `formatClock(seconds)`: `m:ss.mmm`, мілісекунди відкидаються вниз (floor), тому ніколи не буде `0:60.000`;
  - `formatBarBeat(seconds, bpm, ts)`: `${bar}.${beat}` з `secondsToBarPosition`.

### Стан редактора
`EditorState` отримує `followPlayhead: boolean` (за замовчуванням `true`), дію `editor/setFollowPlayhead` і creator `setFollowPlayhead(value)`. Та сама дія з тим самим значенням повертає той самий об'єкт.

## Кроки реалізації
1. Від актуального `main` створити гілку `feature/005-piano-playback`.
2. `cd frontend && npm install tone@^15.1.22` (у `dependencies`). Коміт `chore: add tone for piano playback`.
3. Семпли:
   - виняток `!frontend/public/samples/**` у `.gitignore`;
   - `frontend/scripts/fetch-piano-samples.mjs` і скрипт `fetch-samples` у `package.json`;
   - запустити `npm run fetch-samples` (30 файлів, 2 423 450 байт);
   - `frontend/public/samples/salamander/README.md` з атрибуцією CC-BY 3.0;
   - перевірити `git check-ignore` (див. DoD).
   
   Коміт `chore: vendor Salamander piano samples (CC-BY 3.0)`.
4. `src/audio/samples.ts`, `src/audio/transportClock.ts` + тести. Коміт `feat: add piano sample map and timeline clock`.
5. `src/audio/playbackEvents.ts` + тести. Коміт `feat: build playback events with pedal effects`.
6. `src/audio/scheduler.ts` + тести. Коміт `feat: add lookahead playback scheduler`.
7. `src/audio/engine.ts`, `src/audio/testing/FakePianoEngine.ts`, `src/audio/Transport.ts` + `Transport.test.ts`. Коміт `feat: add playback transport`.
8. `src/audio/toneEngine.ts`, `src/audio/loadEngine.ts` + `toneEngine.test.ts` (з `vi.mock('tone')`). Коміт `feat: add Tone.js piano engine`.
9. `src/utils/transportFormat.ts`, `followScrollLeft` у `pianoRollGeometry.ts`, `followPlayhead` в `editorState.ts`/`editorReducer.ts` + тести. Коміт `feat: add transport formatting and playhead follow helpers`.
10. `src/state/transportContext.ts`, `src/state/TransportProvider.tsx` + тести. Коміт `feat: add transport provider with lazy engine loading`.
11. `src/components/useAnimationFrame.ts`, `src/components/TransportControls.tsx`; підключити в `App.tsx` (з `TransportProvider`), доповнити `App.test.tsx`. Коміт `feat: add transport controls`.
12. `Playhead.tsx`, `onSeek` у `TimeRuler.tsx`, зміни `PianoRoll.tsx` (клавіатура, лінійка, playhead), CSS (`PianoRoll.css`, `--playhead` в `App.css`, z-index).
    - `renderPianoRoll` у `PianoRoll.test.tsx` загорнути в `TransportProvider` з фейковим движком;
    - `renderWithProviders` у `testUtils.tsx` отримує необов'язковий п'ятий параметр `options?: { engine?: FakePianoEngine }` і завжди загортає `ui` у `TransportProvider` (`loadEngine = () => Promise.resolve(engine ?? new FakePianoEngine())`).
    
    Нові тести. Коміт `feat: show playhead, seek from the ruler and play keyboard keys`.
13. README: розділ «Відтворення» (транспорт, клік по лінійці, Follow, клавіатура, вплив педалей) і «Звук» (семпли, атрибуція, `npm run fetch-samples`). Прибрати з розділу педалей речення «Звук педалей з'явиться разом із відтворенням нот». Коміт `docs: describe playback controls and piano samples`.
14. Усі перевірки з DoD і ручна перевірка в браузері (у гілці).
15. У гілці (**до** злиття, бо прямі коміти в `main` заборонені): у CLAUDE.md `[x]` для чотирьох пунктів із розділу «Мета» (2.2 клавіатура, 2.3 вплив педалей, два пункти 2.4); пункт 2.4 про синхронізацію лишається `[ ]`; статус 005 у розділі 8 — «виконано»; статус плану — `виконано`. Коміт `docs: mark task 005 as done`.
16. Злиття `--no-ff` у `main`, повторні перевірки на `main`, push `main` і гілки.

## Тести
Backend не змінюється, наявні тести мають і далі проходити.

Спільні умови: 120 BPM 4/4 (доля 0.5 с, такт 2 с), `pps = 100`. `FakePianoEngine` з `time = 0`. У `Transport.test.ts` транспорт створюється як `new Transport({ lookaheadSeconds: 0.1 })` (затримка старту за замовчуванням 0.05). Решта тестів використовує значення за замовчуванням (lookahead 0.2): їхні очікування від lookahead не залежать. Позначення нот: `a = C4 (60) [0, 0.5) v100`.

### `src/audio/samples.test.ts`
- `PIANO_SAMPLE_PITCHES`: довжина 30, перший 21, останній 108, крок 3.
- `sampleFileName(21)` → `A0.mp3`; `(27)` → `Ds1.mp3`; `(30)` → `Fs1.mp3`; `(108)` → `C8.mp3`.
- `pianoSampleUrls()`: 30 ключів; `['D#1']` → `Ds1.mp3`; `['C4']` → `C4.mp3`; ключа `C#4` немає.
- `PIANO_SAMPLE_BASE_URL` закінчується на `samples/salamander/`.

### `src/audio/transportClock.test.ts`
- `anchor = { contextTime: 10, position: 2, rate: 1 }`: `positionAt(anchor, 10.5)` → 2.5; `positionAt(anchor, 9.95)` → 2 (до якоря не зменшується); `contextTimeAt(anchor, 3)` → 11.
- `rate 0.5`: `positionAt(…, 11)` → 2.5; `contextTimeAt(…, 3)` → 12.
- Обернення: `positionAt(anchor, contextTimeAt(anchor, 7.25))` → 7.25.

### `src/audio/playbackEvents.test.ts`
- `playbackVelocity(100, true)` → 70; `(1, true)` → 1; `(127, false)` → 127; `(2, true)` → 1.
- Порожні ноти → `[]`.
- `a` без педалей → `[{attack a 0 v100}, {release a 0.5}]`.
- `a` + sustain `[0.25, 2)` → release a у 2.
- Повторний удар: `a`, `b = C4 [1, 1.5) v64`, sustain `[0.25, 3)` → `[attack a 0, release a 1, attack b 1, release b 3]`, тобто за рівного часу release іде перед attack.
- Той самий набір з нотами на вході у зворотному порядку дає той самий результат.
- Дві атаки в один момент: `E4 [0, 1)` і `C4 [0, 1)` → attack C4 перед attack E4, release C4 перед release E4.
- Soft `[0.9, 2)`: `b` → attack velocity 45 (`round(64 × 0.7)`), `a` → 100. Soft `[0, 1)` і нота `[1, 2)` → velocity без змін (кінець не включно).
- Sostenuto: нота `[0, 1)` + sostenuto `[0.5, 3)` → release 3.
- `firstEventAtOrAfter(events, 1)` на наборі з повторним ударом → 1 (індекс release a); `(…, 0)` → 0; `(…, 5)` → 4.

### `src/audio/scheduler.test.ts`
Події `E = [attack a@0 (60), attack b@0.5 (64), release a@1, release b@2]`.
- `startSchedule(E, 0)` → `{cursor 0, scheduledUntil 0, active {}}`; `startSchedule(E, 0.5)` → cursor 1; `startSchedule(E, 0.6)` → cursor 2.
- `advanceSchedule(start0, E, 0.5)` → `due [attack a]` (0.5 не входить), `active {a}`, cursor 1, `scheduledUntil 0.5`.
- Далі до 1.5 → `due [attack b, release a]`, `active {b}`; далі до 1.5 ще раз → той самий `state`, `due []`.
- Старт з 0.6 і просування до 3 → `due []`: release a і release b пропущено, бо ці ноти не атакувались.
- Resync (стан після просування до 1.5, `active {b}`):
  - нові події без `b` → `forcedPitches [64]`, `active {}`, `cursor` = індекс першої події з `time >= 1.5`;
  - release b перенесено на 3 → `forcedPitches []`, b лишається в `active`; просування до 4 → `due [release b@3]`;
  - release b = 1.2 (< 1.5) → `forcedPitches [64]`;
  - b перенесено: attack 2, release 3 → `forcedPitches [64]`; просування до 4 → `due [attack b@2, release b@3]`;
  - вставлено `c = D4 attack 1.0, release 1.8` → `forcedPitches []`; просування до 2 → release c відсутній у `due`;
  - **зміна висоти:** b ті самі attack 0.5, release 2, але висота 65 → `forcedPitches [64]` (стара висота), b прибрано з `active`; просування до 3 → `due []` (release b@2 пропущено).
- **Накладені ноти однієї висоти.** `E2 = [attack a@0 (60), attack b@0.5 (60), release a@1, release b@1.5]`. `advanceSchedule(startSchedule(E2, 0), E2, 3)` → `due [attack a, attack b, release b@1.5]`, тобто рівно один release, у момент 1.5, з `pitch 60`, `active {}`. Покрокове просування до 1.2 → `due` без release, `active {b}`.
- **Під sustain:** події з `buildPlaybackEvents([C4 [0, 0.3), C4 [0.2, 0.5)], [sustain [0, 3)])` → просування до 4 дає один release 60 у момент 3.
- **Forced з двома активними однієї висоти:** стан `E2` після просування до 0.8 (`active {a, b}`); нові події без `a` → `forcedPitches []`, `active {b}`; просування до 3 → `due [release b@1.5]`. Нові події без `a` і без `b` → `forcedPitches [60]` (одна висота, без дублікатів).
- **Висота з `active`:** стан з `active {x: 64}` і вручну складений масив, де `release x` має `pitch 65` → у `due` release з `pitch 64`.
- Вхідний масив і стан не мутуються (`Object.freeze`).

### `src/audio/Transport.test.ts` (з `FakePianoEngine`)
- Без движка: `play()` кидає `Error('Piano engine is not loaded')`; `seek(2)` працює → `getPosition()` 2, `status 'stopped'`.
- `a`, `play()` при `time 0` → `calls = [attack playback 60 v100 @0.05]`, `status 'playing'`, `activeTickers 1`.
- `time = 0.4`, `tick()` → нових викликів немає; `time = 0.5`, `tick()` → `release playback 60 @0.55`.
- `getPosition()`: при `time 0.02` → 0; при `1.05` → 1.0.
- `pause()` при `time 1.05` → `releaseAll playback @1.05`, `activeTickers 0`, `status 'paused'`, `getSnapshot().position` 1.0. `play()` при `time 2` → attack a більше не викликається (нота до позиції), `getPosition()` при `2.55` → 1.5.
- `stop()` → `releaseAll`, `status 'stopped'`, позиція 0. Stop на паузі теж скидає на 0.
- `seek(0)` під час відтворення при `time 1.05` → `releaseAll playback @1.05`, потім `attack 60 @1.1`, статус `playing`.
- Sustain `[0, 2)` + `a` → при `time 1.95` tick ще не дає release (вікно до 2.0, межа не включно); при `time 1.96` → `release 60 @2.05`.
- Soft `[0, 1)` + `a` → attack velocity 70.
- Накладені ноти під sustain: `C4 [0, 0.3)`, `C4 [0.2, 0.5)`, sustain `[0, 3)`; `play()` при 0 → `attack 60 @0.05`; при `time 0.2` tick → `attack 60 @0.25`; при `time 0.5` і `2.9` release немає; при `time 2.96` → єдиний `release playback 60 @3.05`.
- Зміна висоти ноти, що звучить: `C4 [0, 1)`, `play()` при 0, `time 0.3`, `tick()`; `setProject` з тією ж нотою на D4 → `release playback 60 @0.4`, а подальші tick до `time 1.5` не дають жодного release 62.
- Кінець таймлайну: проект без нот (кінець 60 с); `play()`, `time = 60.06`, `tick()` → `status 'paused'`, позиція 60, `releaseAll`, `activeTickers 0`. Наступний `play()` стартує з 0 (`getPosition()` при `time 60.2` → ≈ 0.09).
- Правка під час відтворення: ноти `C4 [0, 1)`; `play()` при 0, `time = 0.3`, `tick()` (заплановано до 0.35); `setProject` без ноти → `release playback 60 @0.4`.
- `subscribe`: слухача викликано по одному разу на `play`, `pause`, `seek` (у паузі), `stop` і автопаузу, але не на `tick` без зміни статусу; після unsubscribe виклики припиняються. Між змінами `getSnapshot()` повертає той самий об'єкт.
- Канал `live` транспорт не чіпає: у `calls` немає записів з `channel 'live'`.
- `dispose()` під час відтворення → `releaseAll`, `activeTickers 0`, `hasEngine()` false.

### `src/audio/toneEngine.test.ts` (`vi.mock('tone', …)` з фейковими `Sampler`, `ToneAudioBuffers`, `getContext`, `start`)
- `createToneEngine()` викликає `start` один раз; `ToneAudioBuffers` отримує `urls` з 30 ключів і `baseUrl` = `PIANO_SAMPLE_BASE_URL`; створено два `Sampler` з `release 0.2`, `volume -6` і `toDestination()`.
- `attack('playback', 61, 127, 1.5)` → перший семплер `triggerAttack('C#4', 1.5, 1)`; `attack('live', 60, 96, 2)` → другий `triggerAttack('C4', 2, 96/127)`.
- `release('live', 60, 2)` → другий `triggerRelease('C4', 2)`; `releaseAll('playback', 3)` → перший `releaseAll(3)`.
- `now()` → `getContext().currentTime`; `startTicker(cb, 0.025)` → `setInterval(cb, 0.025)`; функція зупинки → `clearInterval(id)`.
- Помилка буферів (виклик `onerror`) → Promise відхилено з повідомленням `Could not load piano samples`.
- `dispose()` → `dispose` на обох семплерах і буферах.

### `src/utils/transportFormat.test.ts`
- `formatClock(0)` → `0:00.000`; `(61.25)` → `1:01.250`; `(59.9996)` → `0:59.999`; `(600)` → `10:00.000`.
- `formatBarBeat(0, 120, 4/4)` → `1.1`; `(2.5, …)` → `2.2`; `(1.6, 120, 3/4)` → `2.1`.

### `src/utils/pianoRollGeometry.test.ts` (доповнення)
`followScrollLeft`, `clientWidth 672`, клавіатура 72:
- `(500, 0, 672)` → null; `(576, 0, 672)` → null; `(590, 0, 672)` → 566;
- `(100, 400, 672)` → 76; `(10, 400, 672)` → 0;
- `(1000, 800, 672)` → null.

### `src/state/editorReducer.test.ts`
- Тест дефолтів **розширюється** очікуванням `followPlayhead: true` (нове поле, решта очікувань лишається).
- `setFollowPlayhead(false)` → `false`; повторно `false` → той самий об'єкт.

### `src/state/TransportProvider.test.tsx`
Помічник рендерить `ProjectProvider > EditorProvider > TransportProvider(loadEngine = deferred)` і тестовий компонент із кнопками, що викликають API, та `<pre>` зі станом.
- Початково `engineStatus 'idle'`, `status 'stopped'`, `loadEngine` не викликано: движок не створюється до жесту.
- `togglePlay` → `engineStatus 'loading'`, `loadEngine` викликано 1 раз; другий `togglePlay` під час завантаження → все ще 1 виклик.
- Resolve → `engineStatus 'ready'`, `status 'playing'`, у фейку є `attack` для нот проекту.
- `togglePlay` ще раз → `status 'paused'`; ще раз → `playing`, `loadEngine` так і викликано лише 1 раз, `resume` викликано.
- Reject `Error('Could not load piano samples')` → `engineStatus 'error'`, `engineError` з цим текстом; `retry()` → `loadEngine` викликано вдруге.
- `noteOn(60)` з готовим движком → `attack live 60 v96 @time`; `noteOff(60)` → `release live 60`.
- `noteOn(60)` до завантаження, resolve, клавішу ще тримають → `attack live 60`. `noteOn(62)` → `noteOff(62)` → resolve → `attack live 62` відсутній.
- Зміна проекту (додати ноту через `addNotes`) під час відтворення доходить до транспорту: після `tick` у фейку з'являється attack нової ноти.
- Unmount під час відтворення → `releaseAll playback`, `activeTickers 0`, у фейку викликано `dispose`.
- Unmount під час завантаження: `togglePlay`, unmount, потім resolve → у фейку викликано `dispose`, немає жодного `attack` і попереджень React про `setState` після unmount (`console.error` не викликано, перевірка через `vi.spyOn`).
- `useTransportApi()` поза provider'ом кидає помилку.

### `src/components/TransportControls.test.tsx`
- Кнопки «Play» і «Stop» (Stop `disabled` на старті), `Playback position` = `0:00.000 · 1.1`, прапорець «Follow» увімкнено.
- Play з відкладеним завантаженням → кнопка `disabled` з текстом «Loading piano…»; після resolve → «Pause», Stop активна.
- «Pause» → «Play», позиція в `<output>` відповідає `getPosition()` (фейк `time 1.05` → `0:01.000 · 1.3`).
- Під час відтворення rAF-кадр (стаб `requestAnimationFrame` з ручною чергою) оновлює текст позиції: `time 2.55` → `0:02.500 · 2.2`.
- Помилка завантаження → `role="alert"` «Could not load piano samples» і кнопка «Retry»; клік → нова спроба.
- Зняти «Follow» → у стані редактора `followPlayhead false`.

### `src/components/PianoRoll/Playhead.test.tsx`
Рендер через `renderWithProviders(<><TransportControls /><Playhead scrollRef={ref} /></>, notes, editor, [], { engine })`. `requestAnimationFrame` і `cancelAnimationFrame` застабовано через `vi.stubGlobal` з ручною чергою `flushFrame()`. `ref` вказує на `div` з `clientWidth` 672 (через `Object.defineProperty`) і `scrollLeft` 0.
- Старт: `transform` = `translateX(0px)`.
- Play, `time = 1.05`, `flushFrame()` → `translateX(100px)`; `time = 2.05` → `translateX(200px)`.
- Автопрокрутка: `time = 5.95` (позиція 5.9, x 590) → `scrollLeft` 566; з `followPlayhead: false` (`editor` у рендері) → `scrollLeft` 0.
- Pause при `time 1.05` → `cancelAnimationFrame` викликано, `transform` = `translateX(100px)` (позиція паузи 1.0).
- Окремий рендер з `editor = { pixelsPerSecond: 200 }`: Play, `time 1.05`, Pause → `translateX(200px)`.
- Unmount під час відтворення → `cancelAnimationFrame` викликано.

### `src/components/PianoRoll/TimeRuler.test.tsx` (доповнення; наявні тести не змінюються)
- `onSeek`: `mouseDown` з `clientX 150` → `onSeek(1.5)`; правою кнопкою → не викликано; без `onSeek` клік нічого не ламає.

### `src/components/PianoRoll/PianoRoll.test.tsx` (доповнення; `renderPianoRoll` загорнуто в `TransportProvider` з фейком, наявні тести не змінюються)
- Є `data-testid="playhead"`.
- `mouseDown` на клавіші C4 → після завантаження (`await waitFor`) у фейку є `attack live 60`; `mouseUp(window)` → `release live 60`.
- Клік по лінійці `clientX 250` → playhead `translateX(250px)` (стоп, zoom 100).

### `src/App.test.tsx` (доповнення; наявні перевірки лишаються)
- У банері Transport є група «Playback» з кнопками «Play» і «Stop». Модуль `loadEngine.ts` при рендері не викликається (перевіряється через `vi.mock('./audio/loadEngine.ts')` + `expect(loadPianoEngine).not.toHaveBeenCalled()`).

### Ручна перевірка в браузері
`cd backend && uv run uvicorn app.main:app --reload` і `cd frontend && npm run dev`, http://localhost:5173 (Chrome і Firefox):
1. Після завантаження сторінки в консолі **немає** попередження про AudioContext, а на вкладці Network немає запитів до `samples/`, поки не натиснуто Play або клавішу.
2. Перше натискання Play показує «Loading piano…», потім ноти звучать фортепіано. Network: 30 файлів `samples/salamander/*.mp3` з локального сервера, без звернень до сторонніх доменів. У режимі DevTools «Offline» (після першого завантаження сторінки) звук теж працює, бо сервер локальний.
3. Playhead рухається плавно, проходить через лінійку, сітку й доріжку педалей і ховається під клавіатурою під час горизонтальної прокрутки. Позиція в транспорті збігається з лінійкою (такт.доля).
4. Pause зупиняє звук одразу (зокрема ноти під sustain), Play продовжує з того ж місця. Stop повертає playhead на 0. Клік по лінійці ставить позицію; під час відтворення — перескакує туди й грає далі.
5. З «Follow» вид прокручується посторінково за playhead; без нього — ні. Під час відтворення ререндериться лише playhead (React DevTools Profiler: `NoteGrid` не рендериться на кадрах).
6. Нота, відпущена при натиснутому sustain, звучить до кінця педалі, тобто до кінця «хвоста». Повторний удар тієї самої клавіші під педаллю не глушить нову ноту. Sostenuto утримує лише ноти, що звучали в момент натискання. Ноти під soft звучать помітно тихіше.
7. Клавіші віртуальної клавіатури звучать, поки їх тримають, і затихають, коли їх відпускають. Натискання клавіші під час відтворення не обриває ту саму ноту у відтворенні, а Stop не обриває затиснуту клавішу.
8. Редагування нот під час відтворення: видалена нота, що звучить, замовкає; нота, що звучить і яку перетягнули по вертикалі, замовкає (без завислого звуку до Stop); нова нота попереду playhead звучить у свій час. Дві накладені ноти C4 (друга починається всередині першої) звучать до кінця другої.
9. Кінець таймлайну: відтворення само ставиться на паузу, а наступний Play починає з 0.
10. Фонова вкладка на кілька секунд: відтворення не «спотикається» після повернення. Із ~500 нот немає пропусків і клацань.
11. Помилка семплів (тимчасово перейменувати `public/samples` локально, **не комітити**) → «Could not load piano samples» і «Retry»; після повернення назви Retry працює.

## Критерії готовності (Definition of Done)
- [ ] `cd frontend && npm test -- --run && npm run lint && npm run typecheck && npm run build` — зелено.
- [ ] `cd backend && uv run pytest && uv run ruff check . && uv run ruff format --check . && uv run mypy app` — зелено (код backend не змінювався).
- [ ] Усі тести з розділу «Тести» наявні й проходять. Кожна експортована функція `samples.ts`, `transportClock.ts`, `playbackEvents.ts`, `scheduler.ts`, `transportFormat.ts`, `followScrollLeft`, публічні методи `Transport` і `createToneEngine` мають щонайменше один тест.
- [ ] Наявні тести 002–004 не видалені й не послаблені. `git diff main -- frontend/src/components/PianoRoll/PianoRoll.test.tsx frontend/src/components/PianoRoll/TimeRuler.test.tsx frontend/src/App.test.tsx` містить лише додані тести, `TransportProvider` у помічнику рендеру та `vi.mock` для `loadEngine`.
- [ ] `git diff main -- frontend/package.json` містить лише `tone` у `dependencies` і скрипт `fetch-samples`; `backend/pyproject.toml` не змінено.
- [ ] `ls frontend/public/samples/salamander/*.mp3 | wc -l` → 30; `npm run fetch-samples` проходить перевірку розміру; `git check-ignore -v frontend/public/samples/salamander/A0.mp3` нічого не виводить; `git check-ignore frontend/foo.mp3` виводить шлях.
- [ ] `grep -rl "from 'tone'" frontend/src` → лише `frontend/src/audio/toneEngine.ts` (і `toneEngine.test.ts` для `vi.mock`).
- [ ] Після `npm run build` у `frontend/dist/assets/` є окремий chunk `toneEngine-*.js`, а `dist/samples/salamander/` містить 30 mp3.
- [ ] `frontend/public/samples/salamander/README.md` містить автора (Alexander Holm), ліцензію CC-BY 3.0, джерело з хешем коміту і позначку, що це змінений набір (mp3-конвертація Tone.js); README проекту має розділи «Відтворення» і «Звук».
- [ ] Ручна перевірка (11 пунктів) пройдена.
- [ ] У гілці до злиття (коміт `docs: mark task 005 as done`) у CLAUDE.md відмічено `[x]` чотири пункти з розділу «Мета»; пункт 2.4 про синхронізацію лишається `[ ]`; статус 005 — «виконано»; статус плану — `виконано`.
- [ ] Гілку `feature/005-piano-playback` злито в `main` (`--no-ff`) і запушено; на `main` перевірки зелені; у `main` немає прямих комітів поза merge.

## Ризики / відкриті питання
- **Safari і жест користувача.** Движок підвантажується асинхронно (`import()` + завантаження семплів), тому перший `start()` у Safari може опинитися поза «транзитивною активацією» жесту, і контекст лишиться призупиненим. Chrome і Firefox дозволяють `resume()` після будь-якої попередньої взаємодії зі сторінкою. Пом'якшення: при кожному наступному жесті `engine.resume()` викликається **синхронно** в обробнику, тож другий клік гарантовано вмикає звук. Основні цільові браузери — Chrome і Firefox, Safari перевіряється за можливості.
- **`Context.setInterval` у Tone.js.** Метод спрацьовує на `tick` контексту з кроком `updateInterval` (близько 50 мс, Worker), тому lookahead одразу взято 0.2 с. Якщо тікер Tone поводитиметься гірше, запасний варіант — `window.setInterval` у `startTicker`. Логіка планувальника від цього не змінюється, це дрібне відхилення зі звітом.
- **Семантика `Sampler.triggerRelease` за висотою.** Відпускання зупиняє всі голоси цієї висоти в каналі, а накладені ноти однієї висоти модель дозволяє. Це **не рідкісний** випадок: так буває і з накладеними нотами без педалі, і з повторним ударом під sustain. Розв'язання:
  - правило «останній голос висоти» (див. «Планувальник»);
  - порядок «release перед attack»;
  - «лінивий» release (у движок лише у вікні lookahead).
  
  **Прийняте спрощення:** поки звучить пізніша накладена нота, голос ранішої ноти тієї ж висоти теж не глушиться і звучить разом з нею, доки не відпуститься остання (або сам не затихне семпл). Для фортепіано це майже не чутно. Точне глушення окремих голосів потребувало б обходу `Sampler` (власні `ToneBufferSource` на кожну ноту), це надмірно для 005.
- **Розмір репозиторію.** +2.4 МБ бінарних файлів. Git LFS не використовуємо: файли не змінюватимуться, а LFS ускладнює клонування й CI.
- **Позиція z-index.** Якщо абсолютний playhead у grid-контейнері десь відобразиться некоректно, запасний варіант — три окремі лінії (у лінійці, сітці й доріжці), які оновлює той самий rAF-колбек. Чисті функції й `Transport` від цього не змінюються.
- **Затримка виходу для 008.** `AudioContext.outputLatency` (десятки мс) у 005 не враховується. Для синхронізації з відео це робитиме 008.
- **Прийняті рішення (рев'ю раунду 1 погодило дефолти; власник може переглянути постфактум):**
  - Stop повертає позицію на 0. Повернення на cue-позицію за потреби додасться окремою дрібною задачею.
  - Soft = velocity × 0.7 (≈ −3 dB), без фільтра тембру.
  - Без «chase»: ноти, що почалися до позиції старту, не звучать.
  - Safari: звук гарантовано вмикається з другого жесту. Основні цільові браузери — Chrome і Firefox.
- **Обсяг.** Задача порівнянна з 004: 6 чистих модулів, клас `Transport`, адаптер Tone.js, provider, 3 компоненти. Лишається однією гілкою. Запасний поділ, якщо implementer не вкладається:
  - **005a** — кроки 2–11: семпли, движок, планувальник, `Transport`, provider, `TransportControls`, клавіатура не входить. Звук Play/Pause/Stop уже працює.
  - **005b** — кроки 12–13: playhead, seek по лінійці, автопрокрутка, клавіатура в piano roll, README.
  
  Галочки 2.2 і пункту 2.4 про playhead ставляться лише після 005b.

## Зміни після рев'ю (раунд 1)
1. **Блокуюче 1: накладені ноти однієї висоти обривають одна одну.** У розділі «Планувальник» тепер є правило «останній голос висоти». Відпускання ноти прибирає її з `active`, але `release` у `due` чи `forcedPitches` потрапляє лише тоді, коли в `active` не лишилося інших нот тієї ж висоти. Правило діє і в `advanceSchedule`, і в `resyncSchedule`. Тип результату `resyncSchedule` змінено на `forcedPitches: number[]` (унікальні висоти). Додано тести:
   - `scheduler.test.ts`: `C4 [0,1)` + `C4 [0.5,1.5)` дають один release у 1.5; той самий випадок під sustain (`C4 [0,0.3)` + `C4 [0.2,0.5)` + sustain `[0,3)`) дає один release у 3; forced для однієї з двох активних нот однієї висоти не дає release; видалення обох дає одну висоту без дублікатів;
   - `Transport.test.ts`: сценарій з накладеними нотами під sustain.
   
   Розділ ризиків виправлено: випадок названо нерідкісним і описано прийняте спрощення (голос ранішої ноти звучить до відпускання останньої).
2. **Блокуюче 2: зміна висоти ноти, що звучить.** У `resyncSchedule` додано умову примусового відпускання «висота змінилася». Відпускається **стара** висота зі `active`, з урахуванням правила з п. 1. `advanceSchedule` бере висоту release зі `active`, а не з `event.pitch`. Додано тести:
   - `scheduler.test.ts`: `b` 64 → 65 дає `forcedPitches [64]`, подальший release не потрапляє в `due`; окремо перевірено, що висота береться з `active`;
   - `Transport.test.ts`: C4 → D4 під час відтворення дає `release 60`, а `release 62` немає.
   
   До ручної перевірки (п. 8) додано перетягування ноти, що звучить, і накладені C4.
3. **Рекомендація: тікер Tone ≈ 50 мс.** `LOOKAHEAD_SECONDS` = 0.2 з поясненням. `Transport.test.ts` явно передає `lookaheadSeconds: 0.1`, тож числа тестів не змінилися.
4. **Рекомендація: unmount під час завантаження.** Додано `disposedRef`/`generationRef`: движок, що завантажився після unmount, одразу отримує `dispose()` і не викликає `setState`. Додано тест у `TransportProvider.test.tsx`.
5. **Рекомендація: подвійний dispose спільних буферів.** До `toneEngine.ts` додано вимогу коментаря про те, що повторний `dispose` спільних `ToneAudioBuffer` нешкідливий.
6. **Рекомендація: `seek` під час відтворення.** Явно записано, що внутрішній статус скидається на `paused` без сповіщення перед повторним `play()`, і слухачі отримують одне сповіщення.
7. **Рекомендація: атрибуція CC-BY.** README семплів позначає зміни (зменшений набір mp3 від Tone.js замість оригінальних WAV), це також додано в DoD.
8. **Рекомендація: порядок кроків.** Коміт `docs: mark task 005 as done` тепер робиться в гілці до злиття (крок 15), злиття й push — крок 16. DoD оновлено.
9. **Рекомендація: розмір 2 423 450 байт.** Якщо розмір не збігається, а кількість файлів і хеш правильні, implementer оновлює константу і зазначає це у звіті, без зупинки.
10. **Відкриті питання.** Дефолти зафіксовано як прийняті рішення: Stop → 0; soft ×0.7; без «chase»; Safari — гарантія з другого жесту.
