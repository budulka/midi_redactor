# 008 — Синхронізація аудіо / відео / MIDI на спільному таймлайні

**Статус:** виконано
**Гілка:** feature/008-media-sync

## Мета
Зараз MIDI-транспорт (005), аудіодоріжка (006) і відео (007) мають окремі кнопки Play/Pause, окремі швидкості й окремі годинники. Грають вони незалежно. Після цієї задачі в застосунку **один транспорт**. Play / Pause / Stop / клік по лінійці у верхній панелі запускають, зупиняють і перемотують ноти, аудіо й відео разом. Перемотування в панелях медіа (клік по waveform, повзунок і ±5 с відео) перемотує весь таймлайн. Одна швидкість (0.25×–2×) діє на все одразу. Медіа не «розходиться» з нотами під час довгого відтворення. Довжина таймлайну piano roll охоплює завантажені медіа.

Пункти розділу 2 CLAUDE.md, які задача **закриває повністю** (після виконання ставимо `[x]`):
- 2.4 «Відтворення MIDI синхронізоване з аудіо та відео (спільна часова шкала)».
- 2.5 «Синхронізація з таймлайном редактора (аранжування "під відео")».

Уже відмічені пункти 2.1 («Відтворення, пауза, перемотування (клік по waveform)», «Зміна швидкості… без зміни висоти тону») і 2.5 («Пауза / відтворення», «Прокрутка (перемотування) по часу», «Зміна швидкості відтворення») **лишаються виконаними**, хоча кнопки медіа прибираються:
- відтворення, пауза й швидкість аудіо та відео тепер доступні через спільний транспорт (Play/Pause і «Playback speed» у верхній панелі);
- перемотування — через клік по waveform, повзунок і ±5 с відео, як і раніше.

Це саме записується в README (крок 9).

Після цього в розділах 2.1–2.5 не лишається невиконаних пунктів. Лишаються 2.2 «Виділення кількох нот, undo/redo» (010) і розділ 2.6 (009).

Задача спирається на готове й не дублює його:
- `Transport` (005): годинник `TransportAnchor` + `positionAt`/`contextTimeAt` уже містять `rate`, а `getPosition`/`subscribe`/`getSnapshot`/`seek` закладено саме для 008;
- `MediaTrackController` (007): спільний контролер для аудіо й відео з `play`/`pause`/`seek`/`setRate`/`getCurrentTime`/`subscribe`; `useMediaTrackController` повертає й сам `controller`;
- `FakeMediaPlayer`/`createFakeMediaPlayers`, `FakePianoEngine`, `stubAnimationFrames`: тестові двійники;
- `PlaybackRateSelect`, `clampPlaybackRate`, `PLAYBACK_RATES` (006);
- `timelineDurationSeconds` (003), `useLivePosition` (007).

Єдине джерело правди про час — **секунди на спільному таймлайні** (розділ 7). Позиція медіа дорівнює позиції таймлайну (зсуву немає, див. «Поза межами»).

## Поза межами задачі
- **Зсув (offset) медіа відносно нуля таймлайну.** Медіа завжди починається в 0 с таймлайну. Причини:
  - ноти можна ставити в будь-яке місце, тож аранжування «під відео» не потребує зсуву: вступ медіа просто лишається без нот;
  - зсув — це дані проекту. Щоб він не губився, його треба додати в модель `Project` (розділ 7 CLAUDE.md, узгоджується з backend), а його сенс для експорту `.mid` (009) ще треба визначити.
  
  Чисті функції синхронізації отримують цільовий час медіа (`target`) параметром, тож зсув пізніше додається однією формулою `target = position − offset`, без зміни алгоритму. Див. «Ризики / відкриті питання».
- **Waveform під piano roll у спільному масштабі часу** (відкладено з 006). Waveform лишається в правій панелі на всю її ширину. Перенесення під сітку потребує:
  - нової розкладки центральної частини;
  - синхронізації `minPxPerSec` WaveSurfer із zoom (`pixelsPerSecond`);
  - синхронізації горизонтальної прокрутки з `.piano-roll__scroll` і власного рендеру (WaveSurfer сам прокручує свій контейнер).
  
  На синхронізацію часу це не впливає, а обсягом тягне на окрему задачу. Пропозиція власнику — у «Ризиках».
- **Самостійне відтворення медіа без нот** («попереднє прослуховування» лише аудіо чи лише відео). Окремі кнопки Play/Pause і окремі швидкості в панелях медіа прибираються (див. «Технічні рішення → Керування»).
- Mute / гучність аудіодоріжки й гучність відео. Робимо лише **mute звуку відео** (див. нижче).
- Компенсація `AudioContext.outputLatency` і затримки виводу медіаелементів. Звук Web Audio і звук `<audio>`/`<video>` виходять на той самий пристрій зі схожою затримкою. Див. «Ризики».
- «Chase» нот, що почалися до позиції старту (як і в 005, не звучать), цикл (loop), метроном.
- Реакція на системні медіаклавіші (Media Session API) і на «Картинку в картинці».
- Гарячі клавіші транспорту — 010.
- Backend не змінюється.

## Технічні рішення

### Хто master-годинник: транспорт на `AudioContext`
| Варіант | Плюси | Мінуси |
|---|---|---|
| **Master — `Transport` (годинник `AudioContext`), медіа наздоганяє** | Ноти плануються семплово точно, як і зараз. Годинник рівний, не залежить від буферизації медіа. Працює без медіа і з будь-якою кількістю медіадоріжок. Формула з `rate` уже є | Медіаелемент стартує з власною затримкою, і його треба підтягувати (корекція дрейфу) |
| Master — медіаелемент (`<audio>`/`<video>`), ноти планувати від `currentTime` | Медіа ніколи не «перескакує» | `currentTime` оновлюється нерівномірно (у Firefox точність знижена), тож ноти «тремтіли б». Незрозуміло, хто головний, коли є і аудіо, і відео, а без медіа потрібен інший годинник. Під час буферизації медіа зупинилися б і ноти |
| Усе через Web Audio (аудіо декодувати в `AudioBuffer`, time-stretch у `GrainPlayer`) | Один годинник для нот і аудіо | Відео все одно лишається елементом. Якість time-stretch гірша за браузерний `preservesPitch`, а пам'яті на декодований файл треба в рази більше |

**Обрано перший варіант.** `Transport` — єдиний годинник таймлайну. Кожна медіадоріжка **слідує** за ним:
1. Коли транспорт не грає, медіа стоїть на паузі точно в позиції транспорту: видно потрібний кадр, курсор waveform на місці.
2. Коли транспорт грає, медіа грає. Якщо медіа відстає або випереджає:
   - малий дрейф — нічого не робимо (мертва зона з гістерезисом: корекція вмикається понад 30 мс і вимикається нижче 10 мс);
   - більший дрейф — злегка змінюємо швидкість медіа (±5 %, «nudge»);
   - понад 250 мс — перемотуємо медіа (hard seek) з компенсацією затримки seek і обмеженням кількості seek-ів поспіль, щоб seek не зациклювався.

Числа й обґрунтування — нижче.

### Спільна швидкість
- Швидкість — властивість транспорту: `TransportSnapshot.rate` (за замовчуванням 1, діапазон і clamp — `clampPlaybackRate` з `src/utils/playbackRate.ts`).
- MIDI: `anchor.rate = snapshot.rate`. Формули `positionAt`/`contextTimeAt` уже враховують `rate`, тож ноти просто стають ближче чи далі в часі. Висота нот не змінюється, бо семпли атакуються на своїй висоті. Lookahead у секундах `AudioContext` лишається 0.2 с, а в секундах таймлайну вікно стає `0.2 × rate`. Для 2× це 0.4 с, і планувальнику (`advanceSchedule`) цього досить.
- **`Transport.setRate(rate)` під час відтворення** працює як `seek` на поточну позицію: `halt('paused', currentPosition())` (`releaseAll`, зупинка тікера), нове значення `rate`, `play()`. Слухачі отримують одне сповіщення, а ноти, що звучали, обриваються. Розглянута альтернатива — «переякорити» годинник без зупинки. Але події на ~0.2 с уперед уже передані в движок з часом за старою швидкістю, а скасувати окрему заплановану атаку `Sampler` не вміє. Тоді ці ноти прозвучали б не в той момент, і playhead розійшовся б зі звуком. Швидкість змінюють рідко, тож коротке обривання прийнятне. Воно таке саме, як під час seek.
- Медіа: при кожній зміні `rate` у транспорті `MediaSync` викликає `track.setRate(rate)` для кожної доріжки. Наявний `MediaTrackController` зберігає швидкість між файлами й застосовує її на `onReady`. `preservesPitch` уже ввімкнено в обох адаптерах (006, 007).
- UI: один `PlaybackRateSelect` з `label="Playback speed"` у `TransportControls`. `Audio speed` і `Video speed` прибираються з панелей медіа.
- Константа `PLAYBACK_RATE = 1` у `Transport.ts` видаляється. Початкове значення береться з `DEFAULT_PLAYBACK_RATE`.

### Корекція дрейфу (чисті функції) — `src/media/mediaSync.ts`
```ts
export const SYNC_INTERVAL_MS = 100;          // how often drift is checked while playing
export const NUDGE_START_SECONDS = 0.03;      // nudging starts above this drift
export const NUDGE_STOP_SECONDS = 0.01;       // nudging stops at or below this drift
export const HARD_SEEK_DRIFT_SECONDS = 0.25;  // seek instead of nudging above this
export const NUDGE_GAIN = 0.5;                // rate change per second of drift
export const MAX_NUDGE = 0.05;                // at most ±5 % of the base rate
export const SEEK_COOLDOWN_SECONDS = 1;       // drift is not acted on right after a seek
export const MAX_SEEK_LEAD_SECONDS = 1;       // upper bound of the seek latency compensation
export const MAX_CORRECTION_SEEKS = 3;        // correction seeks in a row without convergence
export const END_GUARD_SECONDS = 0.1;         // the media plays its last moments on its own
export const SEEK_EPSILON_SECONDS = 0.005;    // a paused media closer than this is not re-seeked

/** Per-track correction state, kept by MediaSync between checks. */
export interface TrackSyncState {
  readonly nudge: number;            // current factor of the base rate; 1 = no nudge
  readonly playRequested: boolean;   // play() was called and the play event has not arrived yet
  readonly lastSeekAt: number;       // now() of the last seek while playing; -Infinity if none
  readonly checkAfterSeek: boolean;  // the drift after the last correction seek is not measured yet
  readonly seekLead: number;         // media seconds a correction seek jumps ahead of the target
  readonly seekStreak: number;       // correction seeks in a row that did not bring the drift under the hard threshold
}
export const INITIAL_TRACK_SYNC_STATE: TrackSyncState;
// { nudge: 1, playRequested: false, lastSeekAt: -Infinity, checkAfterSeek: false, seekLead: 0, seekStreak: 0 }

export interface MediaSyncInput {
  readonly transportPlaying: boolean;
  readonly target: number;      // where the media should be: the timeline position, seconds
  readonly mediaTime: number;   // media currentTime, seconds
  readonly duration: number;    // media duration (> 0, the media is ready)
  readonly mediaPlaying: boolean;
  readonly now: number;         // seconds, monotonic
}
export interface MediaSyncAction {
  readonly seekTo: number | null;
  readonly play: boolean;
  readonly pause: boolean;
  readonly nudge: number;
}
export function nudgeFactor(drift: number, currentNudge: number): number;
export function planMediaSync(
  input: MediaSyncInput,
  state: TrackSyncState,
): { readonly action: MediaSyncAction; readonly state: TrackSyncState };
/** A new transport command (play, pause, seek, rate): act at once, forget the seek history. */
export function afterTransportCommand(state: TrackSyncState): TrackSyncState;
// { ...state, playRequested: false, lastSeekAt: -Infinity, checkAfterSeek: false, seekStreak: 0 } (nudge and seekLead kept)
```
- `drift = mediaTime − target`. Додатний дрейф означає, що медіа попереду; тоді його треба сповільнити.
- **`nudgeFactor(drift, currentNudge)` — мертва зона з гістерезисом.** `AudioContext.currentTime` у Firefox і в Chrome на Linux оновлюється блоками по 10–20 мс, а `currentTime` медіа теж тремтить. З однією межею коефіцієнт перемикався б 1 ↔ 0.99 на кожній перевірці.
  - межа `threshold = currentNudge === 1 ? NUDGE_START_SECONDS : NUDGE_STOP_SECONDS`: корекція вмикається понад 30 мс і вимикається, лише коли дрейф ≤ 10 мс;
  - `|drift| ≤ threshold` → `1`;
  - інакше `round2(1 − clamp(drift × NUDGE_GAIN, −MAX_NUDGE, MAX_NUDGE))`, де `round2(x) = Math.round(x × 100) / 100`.
  
  Округлення до 0.01 потрібне, щоб не змінювати `playbackRate` на кожній перевірці через дрібні коливання. Воно ж природно повертає 1, коли `|drift| < 0.01`.
- **`planMediaSync(input, state)`** повертає дію і новий стан. Позначення:
  - `clampedTarget = min(max(target, 0), duration)`;
  - `cooldown = now − state.lastSeekAt < SEEK_COOLDOWN_SECONDS`;
  - `ended = !mediaPlaying && mediaTime ≥ duration − SEEK_EPSILON_SECONDS`.
  
  Якщо не сказано інше, новий стан — це `state` з `nudge = action.nudge`. Правила перевіряються по черзі:
  1. **Транспорт не грає** → `{ seekTo: |mediaTime − clampedTarget| > SEEK_EPSILON_SECONDS ? clampedTarget : null, play: false, pause: mediaPlaying, nudge: 1 }`. Медіа на паузі показує кадр і курсор у позиції транспорту.
  2. **`target ≥ duration`** (таймлайн пішов далі за кінець медіа) → `{ seekTo: null, play: false, pause: mediaPlaying, nudge: 1 }`. Медіа лишається на останньому кадрі, ноти грають далі.
  3. **Хвіст медіа** → жодних дій, `nudge: 1`. Сюди належать два випадки:
     - `target ≥ duration − END_GUARD_SECONDS` (останні 0.1 с);
     - `ended && target ≥ duration − HARD_SEEK_DRIFT_SECONDS`: медіа, що випереджало (наприклад, на 0.25×, де сповільнити його nudge-ом не можна), уже закінчилося, а транспорт ось-ось дійде до кінця.
     
     `play()` на закінченому елементі почав би його спочатку, а seek назад повторив би кінець. Тому в хвості медіа не запускаємо й не перемотуємо.
  4. **Медіа не грає:**
     - `state.playRequested` → жодних дій, `nudge: 1` (чекаємо події `play`, щоб не викликати `play()` кожні 100 мс);
     - інакше `{ seekTo: |drift| > NUDGE_START_SECONDS ? target : null, play: true, pause: false, nudge: 1 }`, у стані `playRequested: true`, а якщо є `seekTo`, ще й `lastSeekAt: now`. Seek іде перед `play()`, і це також знімає стан `ended`.
  5. **Медіа грає:**
     1. **Вимір після корекційного seek.** Якщо `state.checkAfterSeek && !cooldown`: `seekLead = clamp(state.seekLead − drift, 0, MAX_SEEK_LEAD_SECONDS)`, `checkAfterSeek = false`, `seekStreak = |drift| ≤ HARD_SEEK_DRIFT_SECONDS ? 0 : state.seekStreak`. Далі правила 5.2–5.4 працюють уже з оновленим станом.
     2. `cooldown` → `nudge: 1`, інших дій немає: одразу після seek медіа ще декодує від ключового кадру, і міряти дрейф рано.
     3. `|drift| > HARD_SEEK_DRIFT_SECONDS && seekStreak < MAX_CORRECTION_SEEKS` → **корекційний seek** `{ seekTo: clamp(target + seekLead, 0, duration − END_GUARD_SECONDS), nudge: 1 }`, у стані `lastSeekAt: now`, `checkAfterSeek: true`, `seekStreak + 1`.
     4. Інакше `nudge: nudgeFactor(drift, state.nudge)`. Сюди ж потрапляє великий дрейф, коли ліміт seek-ів вичерпано: тоді його повільно виправляє nudge.
- **Чому seek не зациклюється** (зауваження рев'ю). Поки елемент виконує seek, `currentTime` повертає ціль, а медіа стоїть L секунд (декодування від ключового кадру; для H.264 з рідкими ключовими кадрами це 150–500 мс). Транспорт тим часом іде вперед. Тож після seek на `target` медіа сталу відстає на `L × rate`. Два механізми не дають повторювати seek щосекунди:
  - **компенсація випередження (`seekLead`).** Після кожного корекційного seek і паузи 1 с вимірюється залишковий дрейф, і `seekLead` зсувається на нього. Наступний seek іде на `target + seekLead`, тож за сталої затримки медіа «приземляється» якраз у позицію транспорту. `seekLead` — властивість файлу й браузера. Він зберігається між командами транспорту й скидається лише з новим файлом (`INITIAL_TRACK_SYNC_STATE`, коли доріжка виходить із `ready`). Приклад за 1× і L = 0.3 с:
    - перший seek на `target`;
    - після паузи дрейф −0.3 → `seekLead = 0.3`, другий seek на `target + 0.3`;
    - після паузи дрейф ≈ 0 → `seekStreak = 0`, далі лише nudge.
    
    Разом два seek-и. За 2× і L = 75 мс (0.15 с медіачасу) дрейф після першого seek (−0.15) уже в межах порогу, тож він один, а решту виправляє nudge.
  - **ліміт `MAX_CORRECTION_SEEKS = 3`.** Якщо затримка seek непередбачувана і дрейф після seek-ів лишається понад 250 мс, після трьох seek-ів поспіль медіа більше не перемотується: його підтягує лише nudge (±5 %). Лічильник скидається, коли дрейф після seek зійшовся, і на кожну команду транспорту (`afterTransportCommand`).
  
  Відлік паузи від подій `seeked`/`playing` розглянуто, але не беремо. Для цього потрібні нові події в `MediaPlayer`, а компенсація і ліміт розв'язують проблему й без них.
- **Числа.**
  - 30/10 мс — межі гістерезису. Розбіжність близько 20–30 мс звуку нот і медіа на слух ще не сприймається як «флем», а нижня межа 10 мс — з запасом над кроком `AudioContext.currentTime`.
  - ±5 % швидкості з `preservesPitch` майже не чутно. За такого обмеження дрейф 250 мс виправляється приблизно за 5 с (при 1×), тож більший дрейф вигідніше виправити seek-ом.
  - Коефіцієнт 0.5 дає плавну (експоненційну) збіжність без перерегулювання: 100 мс → 0.95×.
  - `MAX_SEEK_LEAD_SECONDS = 1`: затримка seek понад секунду означає не декодування, а збій, і стрибати на секунду вперед не варто.
- **Буферизація / `waiting`.** Окрему подію `waiting` не додаємо. Медіа — локальні `blob:`-URL, тож читання даних триває мілісекунди. Довше триває декодування після seek, і його покривають пауза, `seekLead` і ліміт seek-ів. Транспорт на медіа **не чекає**: ноти — головне в редакторі, а зупиняти їх через медіа було б гірше.

`nudgedPlaybackRate(rate, nudge)` — у `src/utils/playbackRate.ts` поруч з рештою математики швидкості: `Math.max(MIN_PLAYBACK_RATE, Math.round(rate × nudge × 10000) / 10000)`. Нижню межу 0.25 не можна перетинати, бо Gecko глушить звук при `playbackRate < 0.25` (006). Тому на 0.25× медіа, що випереджає, лише перемотується, а сповільнити його nudge-ом не можна.

### Контролер медіа — зміни `src/media/MediaTrackController.ts`
Нові методи й поля (наявна поведінка не змінюється):
```ts
/** Moves the media for synchronization: like seek(), but seek listeners are not called. */
syncTo(seconds: number): void;
/** Calls the listener when the user moves the position: seek() and the player's own onSeek (waveform click). */
subscribeSeek(listener: (seconds: number) => void): () => void;
/** Multiplies the base rate for drift correction; not part of the snapshot, reset by setRate() and load(). */
setRateNudge(factor: number): void;
setMuted(muted: boolean): void;
```
- `syncTo(t)`: лише в `ready`, `t` обмежується до `[0, duration]`, далі `player.setTime(t)` і `update({ position: t })`. Слухачів seek не викликає.
- `seek(t)` (наявний): порядок `player.setTime(t)` → слухачі `subscribeSeek(t)` → `update({ position: t })`. Подія плеєра `onSeek(time)` (клік по waveform, seek уже застосовано): слухачі `subscribeSeek(time)` → `update({ position: time })`. Так `MediaSync` відрізняє перемотування **користувачем** (його треба передати транспорту) від власних корекцій (`syncTo`).
  - **Слухачі — до `update`, і це обов'язково** (зауваження рев'ю). `update` синхронно сповіщає `MediaSync`. Якби годинник у цей момент ще стояв на старій позиції, синхронізація перемотала б медіа назад, а курсор waveform і позиція панелі стрибнули б 30 → 0 → 30. За такого порядку `clock.seek(t)` виконується першим. Медіа вже стоїть на `t`, тож `syncAll` нічого не перемотує, а наступний `update` бачить узгоджений стан.
  - Додатковий захист у `MediaSync`: зміна лише `position` у snapshot доріжки не запускає `syncTrack` (див. «Слухач доріжки»).
- `onPlay` (наявний) додатково скидає `error`, **якщо** це повідомлення `messages.playFailed`: після вдалого старту «Could not start … playback.» зникає. Інші помилки (наприклад, про непідтримуваний файл) лишаються.
- `setRateNudge(f)`: не в `ready` або `f` дорівнює поточному `nudge` → нічого не робить (у `loading`/`empty` `nudge` лишається 1, тож `onReady` застосовує чисту `rate` і стан не розходиться). Інакше `nudge = f` і `player.setPlaybackRate(nudgedPlaybackRate(rate, f))`. Snapshot не змінюється, слухачі не сповіщаються. `setRate` і `load` скидають `nudge` у 1. `setRate` і далі передає плеєру базову `rate`, а `onReady` — `rate`, як і зараз.
- `muted` — нове поле `MediaTrackSnapshot` (`EMPTY_MEDIA_TRACK_SNAPSHOT.muted = false`). Як і `rate`, воно зберігається між файлами і після `clear()`/помилки.
  - `setMuted(m)`: однакове значення → нічого не робить; у `ready` → `player.setMuted(m)`; далі `update({ muted: m })`.
  - `onReady` викликає `player.setMuted(true)`, лише коли `muted === true`: новий елемент і так не приглушений, а в журналі викликів фейка не з'являються зайві записи.

`MediaPlayer` (`src/media/mediaPlayer.ts`) отримує `setMuted(muted: boolean): void`:
- `htmlVideoPlayer.ts`: `video.muted = muted`;
- `waveSurferPlayer.ts`: `ws.setMuted(muted)` (метод `Player` у wavesurfer.js 7/8, ставить `media.muted`);
- `FakeMediaPlayer`: поле `muted`, запис `'setMuted:true'` у `calls`; новий помічник `emitPlay()` (викликає `events.onPlay()` без запису в `calls`) для тестів компонентів, де відтворення запускає не кнопка панелі.

### Синхронізатор (імперативне ядро без React) — `src/media/MediaSync.ts`
```ts
export interface SyncClockSnapshot {
  readonly status: 'stopped' | 'playing' | 'paused';
  readonly position: number;
  readonly rate: number;
}
/** Implemented by Transport. */
export interface SyncClock {
  getSnapshot(): SyncClockSnapshot;
  subscribe(listener: () => void): () => void;
  getPosition(): number;
  seek(position: number): void;
}
/** Implemented by MediaTrackController. */
export interface SyncedMediaTrack {
  getSnapshot(): MediaTrackSnapshot;
  subscribe(listener: () => void): () => void;
  subscribeSeek(listener: (seconds: number) => void): () => void;
  getCurrentTime(): number;
  play(): void;
  pause(): void;
  syncTo(seconds: number): void;
  setRate(rate: number): void;
  setRateNudge(factor: number): void;
}
export interface MediaSyncOptions {
  /** Default: window.setInterval / clearInterval. */
  readonly startTimer?: (callback: () => void, intervalMs: number) => () => void;
  /** Seconds; default performance.now() / 1000. */
  readonly now?: () => number;
}
export class MediaSync {
  constructor(clock: SyncClock, options?: MediaSyncOptions); // does not subscribe to the clock yet
  attach(track: SyncedMediaTrack): () => void; // returns detach
  detachAll(): void;                           // detaches every track; the instance stays usable
  getMediaDuration: () => number;              // max duration of ready tracks, 0 without media
  subscribe: (listener: () => void) => () => void; // media duration changes
}
```
Стан кожної доріжки: `{ track, sync: TrackSyncState, lastSnapshot: MediaTrackSnapshot, unsubscribers }`. Усі рішення про корекцію ухвалює чиста `planMediaSync`, а клас лише зберігає `sync` і виконує дії.

- **Ліниве підключення до годинника.** Конструктор нічого не підписує. Перший `attach` підписується на `clock.subscribe`. Від'єднання останньої доріжки (`detach` або `detachAll`) відписується від годинника і зупиняє таймер. Так екземпляр, відкинутий подвійним викликом ініціалізатора `useState` у StrictMode (рекомендація рев'ю), не лишається підписаним на транспорт і не запускає порожній таймер.
- **`attach(track)`**: `track.setRate(clock.getSnapshot().rate)`, `sync = INITIAL_TRACK_SYNC_STATE`, підписки на `track.subscribe` і `track.subscribeSeek`, перерахунок тривалості, `syncTrack`.
- **`detach`** (функція з `attach`): відписується, викликає `track.pause()` (контролер ігнорує виклик, якщо медіа не грає) і `track.setRateNudge(1)`, перераховує тривалість. Від'єднане медіа не лишається грати без контролю. Повторний виклик нічого не робить. `detachAll()` виконує `detach` для кожної доріжки.
- **Слухач годинника**:
  - якщо `rate` змінився → `track.setRate(rate)` і `sync.nudge = 1` для кожної доріжки;
  - якщо змінився об'єкт snapshot (статус, позиція або швидкість) → `sync = afterTransportCommand(sync)` для кожної доріжки. Нова команда транспорту (Play, Pause, seek) завжди виконується одразу, навіть під час паузи після seek, а невдалий `play()` повториться на наступному Play;
  - `syncAll()`; таймер працює, лише поки `status === 'playing'` (`startTimer(syncAll, SYNC_INTERVAL_MS)` / функція зупинки).
- **Слухач доріжки** (`track.subscribe`), `s = track.getSnapshot()`:
  - `s.status` не `ready` → `sync = INITIAL_TRACK_SYNC_STATE` (новий файл — нова оцінка затримки seek);
  - `s.playing === true` → `sync.playRequested = false`;
  - якщо змінилися `status`, `duration` або `playing` порівняно з `lastSnapshot` → перерахунок тривалості й `syncTrack`. Так медіа, завантажене **під час** відтворення, одразу стає в позицію й починає грати;
  - **зміна лише `position`** (`seek`, `syncTo`, `onSeek`) `syncTrack` не запускає. Перемотування користувачем обробляє слухач seek, а власні корекції не потребують повторної перевірки;
  - `lastSnapshot = s`.
- **Слухач seek доріжки** → `clock.seek(seconds)`. Перемотування в будь-якій панелі перемотує таймлайн, а через слухача годинника — і решту медіа.
- **`syncTrack(entry)`**:
  1. Доріжка не в `ready` → нічого.
  2. `{ action, state } = planMediaSync({ transportPlaying: status === 'playing', target: clock.getPosition(), mediaTime: track.getCurrentTime(), duration, mediaPlaying: snapshot.playing, now: now() }, entry.sync)`. Далі `nudgeChanged = action.nudge !== entry.sync.nudge` (порівняння зі старим станом), і `entry.sync = state`.
  3. Застосування в такому порядку:
     - `nudgeChanged` → `track.setRateNudge(action.nudge)`;
     - `pause` → `track.pause()` (до seek, щоб медіа не зсунулося після вирівнювання);
     - `seekTo !== null` → `track.syncTo(seekTo)`;
     - `play` → `track.play()` (після seek; `playRequested` уже стоїть у стані).
- **Повторний вхід.** `track.play()`/`syncTo()` синхронно сповіщають слухачів доріжки (так поводиться `FakeMediaPlayer`, і так може поводитися реальний плеєр). Тому поки триває `syncAll`/`syncTrack`, вкладений виклик лише ставить прапорець `resyncRequested`. Після завершення зовнішнього проходу виконується **ще один** прохід, лише якщо прапорець стоїть (не більше одного додаткового проходу за раз, без рекурсії).
- **Тривалість**: коли `getMediaDuration()` змінюється, сповіщаються слухачі `subscribe`.
- **Фонова вкладка.** `setInterval` у фоні гальмується до ~1 разу на секунду. Медіа й транспорт при цьому грають самі, а перевірки дрейфу просто рідшають. Тікер Tone (Worker) тут не потрібен.

### Транспорт — зміни `src/audio/Transport.ts`
- `TransportSnapshot` отримує `readonly rate: number`. Початковий snapshot: `{ status: 'stopped', position: 0, rate: DEFAULT_PLAYBACK_RATE }`. `pause`/`stop`/`seek`/автопауза зберігають `rate`.
- `setRate(rate: number): void`:
  - `next = clampPlaybackRate(rate)`; однакове значення → нічого;
  - транспорт грає → `halt('paused', currentPosition())`, snapshot з новим `rate`, `play()` (одне сповіщення, як у `seek`);
  - інакше новий snapshot і сповіщення.
- `play()`: `anchor.rate = this.snapshot.rate`.
- `setMediaDuration(seconds: number): void`: `mediaDuration = Math.max(0, seconds)`, перерахунок `endTime`. `setProject` зберігає проект у полі, і обидва методи викликають приватний `updateEndTime()`: `endTime = timelineDurationSeconds(notes, bpm, ts, pedals, mediaDuration)`. Якщо транспорт грає і нова `endTime` менша за позицію (медіа прибрали), найближчий `tick` поставить його на паузу в `endTime`, як і зараз.
- `Transport` структурно реалізує `SyncClock`: `getSnapshot`, `subscribe`, `getPosition`, `seek` уже є.

### Довжина таймлайну з урахуванням медіа
- `timelineDurationSeconds(notes, bpm, ts, pedals = [], mediaDuration = 0)`: `lastEnd = max(кінець останньої ноти, кінець останньої педалі, mediaDuration)`. Решта формули без змін: щонайменше 60 с, +2 такти, ціле число тактів. Наявні виклики й тести не змінюються, бо новий параметр необов'язковий.
- Тривалість медіа доходить до компонентів через новий контекст `src/state/timelineContext.ts`:
  - `MediaDurationContext = createContext<number>(0)`;
  - `useMediaDuration(): number` — просто `useContext`, **без** помилки поза provider'ом. `NoteGrid.test.tsx` і `PedalLane.test.tsx` рендерять ці компоненти без `TransportProvider`, і значення за замовчуванням 0 (медіа немає) тут правильне.
- `PianoRoll` (лінійка), `NoteGrid`, `PedalLane` передають `useMediaDuration()` п'ятим аргументом у `timelineDurationSeconds`. Окремий контекст, а не поле `TransportState`: так `NoteGrid` не ререндериться на кожен Play/Pause, а лише коли змінюється тривалість медіа.

### Стан у React
- **`src/state/transportContext.ts`**:
  - `TransportState` отримує `rate: number`;
  - `TransportApi` отримує `setRate(rate: number): void` і `attachMedia(track: SyncedMediaTrack): () => void`.
- **`src/state/TransportProvider.tsx`**:
  - `const [mediaSync] = useState(() => new MediaSync(transport))`;
  - `mediaDuration = useSyncExternalStore(mediaSync.subscribe, mediaSync.getMediaDuration)`;
  - `useEffect(() => transport.setMediaDuration(mediaDuration), [transport, mediaDuration])`;
  - cleanup при unmount додатково викликає `mediaSync.detachAll()` — **після** наявного `transport.stop()`, щоб медіа встигло стати на паузу. `MediaSync` лишається придатним, тож це сумісно зі StrictMode: ефекти bridge приєднають доріжки знову;
  - `api.setRate = (r) => transport.setRate(r)`, `api.attachMedia = (track) => mediaSync.attach(track)`;
  - дерево обгортається в `<MediaDurationContext.Provider value={mediaDuration}>`.
- **`src/state/useMediaTrackController.ts`**: `MediaTrackApi` отримує `readonly controller: MediaTrackController` (той самий стабільний об'єкт) і `setMuted(muted: boolean): void`.
- **`src/state/MediaSyncBridge.tsx`** (новий, рендерить `null`): бере `attachMedia` з `useTransportApi()`, `controller` з `useAudioTrackApi()` і `useVideoApi()`. У `useEffect` приєднує обидва контролери й від'єднує їх у cleanup. В `App.tsx` він стоїть усередині `VideoProvider` перед `div.app`. Окремий компонент потрібен, бо `TransportProvider` розміщено **вище** за провайдери медіа. Так тести `AudioTrack`/`VideoPlayer`/provider'ів медіа лишаються без транспорту.

### Керування (UI)
- **`TransportControls`**: після кнопки «Stop» — `<PlaybackRateSelect label="Playback speed" value={rate} onChange={api.setRate} />`. Швидкість можна вибрати й до завантаження піаніно.
- **Окремі кнопки Play/Pause медіа прибираються** з `AudioTrack` («Play audio»/«Pause audio») і `VideoPlayer` («Play video»/«Pause video»), як і вибір швидкості «Audio speed»/«Video speed». Причини:
  - з одним транспортом кнопка медіа мала б або запускати все (дублювала б Play у верхній панелі), або грати медіа окремо, а це суперечить правилу «медіа слідує за транспортом» (`MediaSync` одразу поставив би його на паузу);
  - одна кнопка — одна точка керування, тож немає незрозумілих станів.
  
  Методи `togglePlay` у `MediaTrackApi`/контролері лишаються (їх покривають тести контролера), але UI їх не використовує.
- **Лишаються:** позиція медіа (`Audio position`, `Video position`), яка під час відтворення рухається через `useLivePosition` за `snapshot.playing`; клік по waveform; повзунок «Seek video» і ±5 с. Усі вони викликають `controller.seek`/`onSeek` і через `subscribeSeek` перемотують **транспорт**. Групи `role="group"` «Audio playback» і «Video playback» лишаються з позицією (і з кнопками перемотування та mute у відео).
- **Mute відео** (відкладено з 007): у групі «Video playback» `<label className="video-player__mute"><input type="checkbox" aria-label="Mute video" checked={muted} onChange={(e) => api.setMuted(e.currentTarget.checked)} /> Mute</label>`. Робимо зараз, бо з синхронізацією типовий сценарій — відео й аудіо того самого запису. Без mute вони звучать удвох і дають «луну» на межі допуску дрейфу. Вимкнути звук аудіодоріжки можна кнопкою «Remove»; окремий mute аудіо — поза межами.
- Перший Play завантажує піаніно (005) навіть тоді, коли нот немає і потрібне лише медіа. Це свідомо: один транспорт, а семпли кешуються після першого завантаження.

## Кроки реалізації
1. Від актуального `main` створити гілку `feature/008-media-sync`.
2. `timelineDurationSeconds` з параметром `mediaDuration` + тести в `pianoRollGeometry.test.ts`. Коміт `feat: extend the timeline to cover loaded media`.
3. `nudgedPlaybackRate` у `playbackRate.ts` + тести; `Transport`: `rate` у snapshot, `setRate`, `setMediaDuration`, `updateEndTime`, видалення `PLAYBACK_RATE` + тести. У трьох наявних `toEqual({ status, position })` у `Transport.test.ts` додати `rate: 1` (див. «Тести»). Коміт `feat: play the transport at a variable rate`.
4. `src/media/mediaSync.ts` + `mediaSync.test.ts`. Коміт `feat: add media drift correction rules`.
5. `MediaPlayer.setMuted`; реалізація в `htmlVideoPlayer.ts`, `waveSurferPlayer.ts`, `FakeMediaPlayer` (`muted`, `setMuted`, `emitPlay`); `MediaTrackController`: `syncTo`, `subscribeSeek`, `setRateNudge`, `setMuted`/`muted` + тести. У двох наявних `toEqual` у `AudioTrackController.test.ts` додати `muted: false`; у фейк `ws` у `waveSurferPlayer.test.ts` додати `setMuted: vi.fn()`. Коміт `feat: let media tracks follow an external clock`.
6. `src/media/MediaSync.ts`, `src/media/testing/FakeSyncClock.ts` + `MediaSync.test.ts`. Коміт `feat: keep media tracks in sync with the transport`.
7. `timelineContext.ts`; `transportContext.ts` і `TransportProvider.tsx` (`rate`, `setRate`, `attachMedia`, `MediaSync`, `MediaDurationContext`); `useMediaTrackController.ts` (`controller`, `setMuted`); `MediaSyncBridge.tsx` + тести. У наявному `toEqual` у `TransportProvider.test.tsx` додати `rate: 1`. Коміт `feat: connect audio and video to the transport`.
8. UI: швидкість у `TransportControls`; `AudioTrack`/`VideoPlayer` без Play/Pause і швидкості, `Mute video`; `PianoRoll`/`NoteGrid`/`PedalLane` з `useMediaDuration()`; `MediaSyncBridge` в `App.tsx`; CSS (`.video-player__mute`: `display: inline-flex; gap: 4px; align-items: center`). Оновити тести компонентів (див. «Тести»). Коміт `feat: play MIDI, audio and video from one transport`.
9. README:
   - новий розділ «Синхронізація»: один транспорт, спільна швидкість, перемотування з будь-якої панелі, медіа починається в 0 с таймлайну, таймлайн подовжується до кінця медіа, mute відео;
   - у розділах «Аудіодоріжка» і «Відео» прибрати згадки про власні Play/Pause і швидкість та речення «поки не синхронізовано… (008)». Натомість прямо написати, що відтворення, пауза й швидкість аудіо та відео керуються спільним транспортом у верхній панелі, а перемотування доступне і в панелях (вимоги 2.1 і 2.5 лишаються виконаними);
   - зазначити, що перший Play завантажує семпли піаніно, і поки вони не завантажились (або після помилки завантаження) медіа теж не запускається.
   
   Коміт `docs: describe synchronized playback`.
10. Усі перевірки з DoD і ручна перевірка в браузері (у гілці).
11. У гілці (**до** злиття): у CLAUDE.md `[x]` для 2.4 «Відтворення MIDI синхронізоване…» і 2.5 «Синхронізація з таймлайном редактора…»; статус 008 у розділі 8 — «виконано»; у дереві розділу 4 додати `src/media/` (рекомендація рев'ю 007, якщо її ще не виконано); статус плану — `виконано`. Коміт `docs: mark task 008 as done`.
12. `git checkout main && git merge --no-ff feature/008-media-sync`, повторні перевірки на `main`, push `main` і гілки.

## Тести
Backend не змінюється, наявні тести мають і далі проходити.

### Зміни наявних тестів (вичерпний список і причина)
Поведінку змінено вимогою 2.4/2.5, тож ці тести **оновлюються** (не послаблюються):
- `src/audio/Transport.test.ts`: три `toEqual({ status, position })` отримують `rate: 1`, бо snapshot має нове поле. Інші рядки не змінюються.
- `src/state/TransportProvider.test.tsx`: `toEqual` у тесті «does not load the engine before a gesture» отримує `rate: 1`.
- `src/audio/AudioTrackController.test.ts`: два `toEqual` для порожнього snapshot («starts empty», «removes the track and keeps the rate») отримують `muted: false`.
- `src/audio/waveSurferPlayer.test.ts`: фейковий `ws` отримує `setMuted: vi.fn()`; наявні перевірки не змінюються.
- `src/components/AudioTrack.test.tsx`:
  - «shows the empty track» і «shows the ready track»: перевірки кнопки «Play audio» і комбобокса «Audio speed» замінюються на `queryByRole(...) === null`. Решта перевірок (accept, підказка, Remove, позиція) лишається;
  - «plays, follows the position and pauses» переписується як «follows the position while the audio plays»: `act(() => ready.emitPlay())`, `currentTime = 2.5`, `flushFrame()` → `0:02.500 / 1:05.000`; `act(() => ready.emitPause())` → `cancelAnimationFrame` викликано. Відтворення запускає транспорт, тож тут перевіряється лише «жива» позиція;
  - «changes the speed» видаляється: швидкість тепер одна, і її перевіряють `TransportControls.test.tsx` і `MediaSync.test.ts`.
- `src/components/VideoPlayer.test.tsx`: так само, як для аудіо. У «shows the empty panel» і «shows the ready video» з переліку кнопок прибирається «Play video», а «Video speed» перевіряється на відсутність. «plays, follows the position and pauses» → «follows the position while the video plays» (`emitPlay`/`emitPause`, позиція й повзунок `'2.5'`). «changes the speed» видаляється, натомість з'являється тест mute (нижче).
- `src/App.test.tsx`: «shows the audio track…» і «shows the video player…» замість «Play audio»/«Audio speed»/«Play video»/«Video speed» перевіряють позиції (`Audio position`, `Video position`), «Mute video» і «Seek video». «keeps the MIDI, audio and video controls apart» замінюється на «has one playback transport for MIDI, audio and video» (нижче).

Інші наявні тести не змінюються.

### `src/utils/pianoRollGeometry.test.ts` (доповнення)
- `timelineDurationSeconds([], 120, 4/4, [], 90)` → 94; `(…, [], 30)` → 60; `(…, [], 90.3)` → 96 (94.3 округлюється вгору до цілого такту); наявна тестова нота `note('a', 60, 70, 0.5)` (кінець 70.5) з `mediaDuration 50` → 76; нота `[68, 70)` (кінець рівно 70) з `mediaDuration 50` → 74; `mediaDuration 80` з тією ж нотою → 84 (медіа довше за ноти).

### `src/utils/playbackRate.test.ts` (доповнення)
- `nudgedPlaybackRate(1, 0.95)` → 0.95; `(0.5, 0.97)` → 0.485; `(2, 1.05)` → 2.1; `(0.25, 0.95)` → 0.25; `(0.7, 0.97)` → 0.679 (без шуму плаваючої коми).

### `src/audio/Transport.test.ts` (доповнення; `new Transport({ lookaheadSeconds: 0.1 })`, `FakePianoEngine`, `a = C4 [0, 0.5) v100`)
- Початковий `getSnapshot().rate` → 1.
- `setRate(0.5)` на зупиненому → `{ status: 'stopped', position: 0, rate: 0.5 }`, одне сповіщення; повторний `setRate(0.5)` → без сповіщення. `setRate(3)` → 2; `setRate(NaN)` → 1.
- Rate 0.5 + `a`: `play()` при `time 0` → `attack 60 @0.05`. При `time 0.5` tick не дає release (вікно до позиції 0.275). При `time 1.0` → `release 60 @1.05`. `getPosition()` при `time 1.05` → 0.5.
- `setRate(2)` під час відтворення при `time 1.05` (rate 0.5, позиція 0.5) → `releaseAll playback @1.05`, статус `playing`, рівно одне сповіщення, `getPosition()` при `time 1.35` → 1.0 (`0.5 + (1.35 − 1.10) × 2`).
- `pause()`, `seek(3)`, `stop()` зберігають `rate` у snapshot.
- `setMediaDuration(90)` на порожньому проекті: `play()`, `time = 94.06`, `tick()` → `status 'paused'`, позиція 94. Без медіа (як і раніше) автопауза на 60. `setMediaDuration(-5)` → поводиться як 0.
- `setMediaDuration` під час відтворення: `setMediaDuration(90)`, `play()`, `time 70.05`, `setMediaDuration(0)`, `tick()` → автопауза в 60.

### `src/media/mediaSync.test.ts`
База: вхід `I = { transportPlaying: true, target: 10, mediaTime: 10, duration: 30, mediaPlaying: true, now: 100 }`, стан `S = INITIAL_TRACK_SYNC_STATE`. Запис `(зміни входу; зміни стану)`.
- `nudgeFactor(drift, current)`:
  - з `current 1`: `0` → 1; `0.02` → 1; `0.03` → 1 (межа входу 30 мс включно); `0.04` → 0.98; `0.1` → 0.95; `-0.1` → 1.05; `-0.06` → 1.03; `1` → 0.95; `-1` → 1.05;
  - гістерезис: `(0.02, 0.98)` → 0.99 (корекція триває нижче 30 мс); `(0.005, 0.99)` → 1; `(-0.02, 1.02)` → 1.01.
- Транспорт не грає (`transportPlaying: false`):
  - `mediaPlaying true, mediaTime 10.3` → `{ seekTo: 10, play: false, pause: true, nudge: 1 }`;
  - `mediaPlaying false, mediaTime 10.003` → `seekTo null`, `pause false`;
  - `target 40` → `seekTo 30`; `target -1` → `seekTo 0`;
  - зі станом `nudge 0.95` → `nudge 1` і в дії, і в стані.
- Грає, `target 30` → `pause: true, play: false, seekTo: null`; `target 35, mediaPlaying false` → усе `false/null`.
- Хвіст:
  - `target 29.95, mediaPlaying false, mediaTime 29.9` → жодних дій;
  - закінчене медіа на 0.25× (`mediaPlaying false, mediaTime 30, target 29.85`) → жодних дій, кінець не повторюється;
  - `mediaTime 30, mediaPlaying false, target 29.7` (29.7 < 30 − 0.25) → `{ seekTo: 29.7, play: true }`.
- Медіа не грає:
  - `mediaTime 0` → `{ seekTo: 10, play: true }`, стан `playRequested true, lastSeekAt 100`;
  - `mediaTime 10.01` → `{ seekTo: null, play: true }`, `lastSeekAt` лишається `−Infinity`;
  - стан `playRequested true` → `{ seekTo: null, play: false }`;
  - медіа в кінці (`mediaTime 30`, `target 5`) → `{ seekTo: 5, play: true }`.
- Медіа грає, без seek-історії:
  - `mediaTime 10.01` → `nudge 1`; `10.1` → `0.95`; `9.9` → `1.05`;
  - стан `nudge 0.98`, `mediaTime 10.02` → `nudge 0.99`; стан `nudge 1`, `mediaTime 10.025` → `nudge 1`.
- Корекційний seek:
  - `mediaTime 10.3` → `{ seekTo: 10, nudge: 1 }`, стан `lastSeekAt 100, checkAfterSeek true, seekStreak 1`;
  - стан `seekLead 0.2`, `mediaTime 10.3` → `seekTo 10.2`;
  - стан `seekLead 0.5`, `target 29.5, mediaTime 28.5` → `seekTo 29.9` (обмеження `duration − END_GUARD_SECONDS`).
- Пауза після seek: стан `lastSeekAt 99.5, checkAfterSeek true, seekStreak 1`, `mediaTime 10.3` → `{ seekTo: null, nudge: 1 }`, стан не змінився (`checkAfterSeek` лишається `true`).
- Вимір після seek (стан `lastSeekAt 98.9, checkAfterSeek true`):
  - **стале відставання, 1×:** `seekStreak 1, seekLead 0`, `mediaTime 9.7` (дрейф −0.3) → `seekLead 0.3`; дрейф ще понад поріг, тож `seekTo 10.3`, `seekStreak 2`, `checkAfterSeek true`, `lastSeekAt 100`;
  - **збіжність:** `seekStreak 2, seekLead 0.3`, `mediaTime 10.0` → жодного seek, `nudge 1`, стан `seekLead 0.3, seekStreak 0, checkAfterSeek false`;
  - **стале відставання, 2×** (0.15 с медіачасу): `seekStreak 1, seekLead 0`, `mediaTime 9.85` → жодного seek, `seekLead 0.15`, `seekStreak 0`, `nudge 1.05`;
  - **завеликий `seekLead`:** `seekLead 0.3`, `mediaTime 10.1` → `seekLead 0.2`, `nudge 0.95`;
  - межі: `seekLead 0.9`, `mediaTime 9.5` → `seekLead 1`; `seekLead 0.1`, `mediaTime 10.4` → `seekLead 0` і новий seek на `10` (дрейф 0.4 > 0.25).
- Ліміт seek-ів: стан `seekStreak 3` (без `checkAfterSeek`), `mediaTime 10.5` → `{ seekTo: null, nudge: 0.95 }`; `mediaTime 9.0` → `nudge 1.05`.
- `afterTransportCommand({ nudge: 0.95, playRequested: true, lastSeekAt: 99, checkAfterSeek: true, seekLead: 0.3, seekStreak: 3 })` → `{ nudge: 0.95, playRequested: false, lastSeekAt: −Infinity, checkAfterSeek: false, seekLead: 0.3, seekStreak: 0 }`.
- Вхід і стан не мутуються (`Object.freeze`). Дробові результати (`seekLead`, `seekTo`) порівнюються через `toBeCloseTo`.

### `src/media/MediaTrackController.test.ts` (доповнення; контролер з форматом `X`, як у наявних тестах)
- `syncTo(12)` у `ready` (duration 30) → `setTime:12`, `position 12`; слухач `subscribeSeek` **не** викликано; `syncTo(40)` → `setTime:30`; `syncTo` у `loading` → без викликів.
- `subscribeSeek`: `seek(12)` → слухач з 12; `seek(-3)` → з 0; `emitSeek(8)` → з 8; після відписки не викликається; `seek` у `empty` → не викликається.
- Порядок: слухач `subscribeSeek`, викликаний з `seek(12)`, бачить `getSnapshot().position` ще **старим** (0), а журнал плеєра вже містить `setTime:12`. Слухач `subscribe`, зареєстрований до цього, отримує сповіщення **після** слухача seek (порядок фіксується масивом подій у тесті). Те саме для `emitSeek(8)`.
- Помилка старту зникає: `playError = NotAllowedError`, `play()` → `error 'no play'`; `playError = null`, `play()` → `error null`. Помилку непідтримуваного файлу (`load(file('a.txt', …))` при `ready`) наступний вдалий `play()` не скидає.
- `setRateNudge(0.95)` у `ready` (rate 1) → `setPlaybackRate:0.95`, слухачі snapshot не сповіщені. Повторний `setRateNudge(0.95)` → без виклику. `setRate(0.5)` → `setPlaybackRate:0.5` (nudge скинуто). `setRateNudge(0.9)` → `setPlaybackRate:0.45`. На rate 0.25 `setRateNudge(0.95)` → `setPlaybackRate:0.25`. У `loading` `setRateNudge(0.95)` → без виклику плеєра; `emitReady` → `setPlaybackRate:<rate>`; наступний `setRateNudge(0.95)` уже в `ready` → `setPlaybackRate:0.95` (nudge у `loading` не запам'ятовувався).
- Новий файл після nudge: `setRateNudge(0.9)` у `ready`, `load` іншого файлу, `emitReady` → новий плеєр отримав `setPlaybackRate:<rate>`, а `setRateNudge(0.9)` знову викликає плеєр.
- `setMuted(true)` у `ready` → `setMuted:true`, `muted true` у snapshot, одне сповіщення; повторне → без сповіщення. Наступний файл: `emitReady` → `setMuted:true` серед викликів нового плеєра. Без mute `emitReady` не записує `setMuted`. `clear()` зберігає `muted`.

### `src/media/htmlVideoPlayer.test.ts` і `src/audio/waveSurferPlayer.test.ts` (доповнення)
- `setMuted(true)` → `video.muted === true`; `setMuted(false)` → `false`.
- `setMuted(true)` → `ws.setMuted(true)`.

### `src/media/MediaSync.test.ts`
Двійники:
- `FakeSyncClock` (`src/media/testing/FakeSyncClock.ts`): поля `snapshot`, `position`, масив `seeks`; `set(changes)` оновлює snapshot (новий об'єкт), а якщо в `changes` є `position`, ставить і поле `position`, потім сповіщає слухачів; `getPosition()` повертає `position`; `seek(t)` записує `t` у `seeks`, ставить `snapshot.position = position = t` і сповіщає;
- контролери — `new MediaTrackController({ createPlayer: fake.create, canPlayType: () => true, detectFormat, messages, createObjectUrl, revokeObjectUrl })` з форматом `X` (як у `MediaTrackController.test.ts`);
- таймер — `startTimer` зберігає колбек і лічильник активних таймерів, `fireTimer()` викликає колбек;
- `now` — змінна `clockNow`, яку задає тест;
- `FakeSyncClock.listenerCount` — кількість підписників (для перевірки лінивої підписки).

Сценарії:
- Лінива підписка: `new MediaSync(clock)` → `listenerCount 0`; `attach` → 1; `detachAll()` → 0. Два `attach` і один `detach` → 1; другий `detach` → 0.
- `attach` готової доріжки (duration 30), годинник `stopped`, позиція 0 → плеєр не отримав `play`; `getMediaDuration()` → 30, слухач `subscribe` викликано.
- `clock.set({ status: 'playing' })` → плеєр `play`, `setTime` немає (дрейф 0), активних таймерів 1.
- Дрейф: `clock.position = 5`, `player.currentTime = 5.1`, `fireTimer()` → `setPlaybackRate:0.95`. Ще раз з тими самими числами → нового `setPlaybackRate` немає. `currentTime = 5.0`, `fireTimer()` → `setPlaybackRate:1`.
- Hard seek: `clockNow = 10`, `currentTime = 5.5`, `position 5`, `fireTimer()` → `setTime:5`. `clockNow = 10.5`, `currentTime = 5.6`, `position 5.1` → жодного `setTime`. `clockNow = 11.2` → `setTime:5.1` (дрейф після seek +0.5, тож `seekLead` лишається 0).
- **Без циклу seek-ів.** Помічник `run(steps)` робить `steps` кроків по 0.1 с: `clockNow += 0.1`, `clock.position += 0.1 × rate`, `player.currentTime += 0.1 × (player.rate ?? rate)`, потім `fireTimer()`. Якщо після `fireTimer()` у журналі з'явився новий `setTime:X`, тест імітує затримку seek: `player.currentTime = X − lag` (медіа «простояло» на seek). Підготовка: годинник і медіа грають на 10 (старт без seek), журнал плеєра очищено, потім `player.currentTime = 11` (дрейф +1 с). Лічильники `setTime` нижче рахуються від цього моменту.
  - 1×, `lag 0.3`: `run(60)` → рівно 2 `setTime`, другий на позицію годинника + ≈0.3. Після `run(60)` `|player.currentTime − clock.position| ≤ 0.03`;
  - 2× (`clock.set({ rate: 2 })` до старту), `lag 0.15`: `run(60)` → рівно 1 `setTime`, далі дрейф збігається через nudge (`setPlaybackRate:2.1` у журналі). У кінці `|дрейф| ≤ 0.03`;
  - непередбачувана затримка: `lag` по черзі 0.6, 0.1, 0.6, 0.1… (дрейф після seek щоразу виходить за поріг) → за `run(100)` не більше `MAX_CORRECTION_SEEKS` (3) `setTime`, а nudge лишається ≠ 1, поки дрейф не зійдеться;
  - після сценарію 1× (`seekLead ≈ 0.3`) перемотування транспорту під час відтворення (`clock.set({ position: 30 })`, `lag 0.3`) → рівно один `setTime` ≈30.3 (`seekLead` збережено між командами), а подальший `run(30)` нових `setTime` не дає;
  - після сценарію з непередбачуваною затримкою (ліміт вичерпано) `clock.set({ position: 50 })` → знову є корекційний `setTime`: `afterTransportCommand` скинув лічильник.
- **Перемотування користувачем не відкочується назад:**
  - годинник `paused` на 0, готова доріжка на 0: `controller.seek(12)` → `clock.seeks = [12]`, у журналі плеєра рівно один `setTime` (`setTime:12`) і після нього немає `setTime:0`;
  - годинник `playing` на 100, медіа грає на 100 (duration 200): `player.emitSeek(150)` → `clock.seeks = [150]`, у журналі немає `setTime:100` і немає `setTime` узагалі (медіа вже на 150);
  - `syncTo`, що виконує сама синхронізація, `clock.seek` не викликає і повторного `syncTrack` не запускає (зміна лише позиції).
- Seek транспорту під час паузи після корекційного seek: одразу після hard seek `clock.set({ position: 20 })` (статус `playing`) → `setTime:20` (`seekLead` тут 0, бо дрейф після попереднього seek був додатний).
- Пауза: `clock.set({ status: 'paused', position: 7 })`, `clock.position = 7` → `pause`, `setTime:7`; активних таймерів 0.
- Stop: `clock.set({ status: 'stopped', position: 0 })` → `setTime:0`.
- Швидкість: `clock.set({ rate: 0.5 })` → `setPlaybackRate:0.5`, `getSnapshot().rate` доріжки 0.5.
- Кінець медіа: годинник грає, `position 40`, медіа грає → `pause`, `play` після цього не викликається на `fireTimer()`.
- Медіа завантажено під час відтворення: годинник `playing`, `position 3`; `attach` доріжки в `loading`; `emitReady(30)` → `setTime:3`, потім `play`.
- Перемотування користувачем: `controller.seek(12)` → `clock.seeks` = `[12]`; `player.emitSeek(8)` → `[12, 8]`; корекція `syncTo` у попередніх сценаріях не додає записів у `seeks`.
- Невдалий `play`: `player.playError = new DOMException('blocked', 'NotAllowedError')`, годинник `playing` → `play` викликано один раз; три `fireTimer()` → нових `play` немає. `clock.set({ status: 'paused' })`, потім `playing` → `play` викликано вдруге.
- Повторний вхід: фейковий `play()` синхронно викликає `onPlay`, а в журналі рівно один `play` на старт.
- Дві доріжки (30 і 45) → `getMediaDuration()` 45; `clear()` другої → 30; `detach` першої → 0; слухач тривалості викликано на кожну зміну.
- `detach` під час відтворення з nudge 0.95 → плеєр отримав `pause` і `setPlaybackRate:<rate>` (nudge 1); після `detach` зміни годинника не викликають плеєр. `detach` на паузі → `pause` у журналі не з'являється.
- `detachAll()` під час відтворення → активних таймерів 0, доріжки від'єднано; після нового `attach` синхронізація знову працює.

### `src/state/TransportProvider.test.tsx` (доповнення)
- `setRate(0.5)` → у стані `rate 0.5`.
- `attachMedia(controller)` з `FakeMediaPlayer`: `emitReady(90)` → `useMediaDuration()` у пробі дорівнює 90. Transport отримав тривалість: з фейковим движком `togglePlay`, `time = 94.06`, `tick()` → статус `paused`.
- Відтворення через API: `togglePlay` (движок завантажено) → плеєр медіа отримав `play`; `togglePlay` → `pause`.
- Unmount під час відтворення з приєднаною готовою доріжкою → плеєр отримав `pause` і `setTime:0`: cleanup спершу викликає `transport.stop()`, `MediaSync` синхронізує зупинку, а вже потім `detachAll()`.
- `useMediaDuration()` поза provider'ом → 0 (без помилки).

### `src/state/MediaSyncBridge.test.tsx`
Рендер `ProjectProvider > EditorProvider > TransportProvider(loadEngine → FakePianoEngine) > AudioTrackProvider(fake) > VideoProvider(fake) > MediaSyncBridge + TransportControls + VideoPlayer + AudioTrack`; Object URL підмінено; `stubAnimationFrames()`.
- Завантажити відео `clip.mp4` і аудіо `song.mp3`, `emitReady(65)` і `emitReady(200)`. Клік «Play» (`await` завантаження движка) → обидва плеєри отримали `play`. Клік «Pause» → обидва `pause`.
- «Playback speed» → `0.5` → обидва плеєри `setPlaybackRate:0.5`.
- Повзунок «Seek video» → `30` (на паузі; журнали обох плеєрів очищено перед дією) → `Playback position` починається з `0:30.000`. Журнал відеоплеєра містить **рівно один** `setTime` (`setTime:30`), без відкату на стару позицію; аудіоплеєр — рівно один `setTime:30`.
- Клік по waveform (`audioPlayer.emitSeek(150)`) → відеоплеєр `setTime:65` (кінець відео), позиція транспорту `2:30.000`.
- Unmount bridge (перерендер без нього) → зміни транспорту більше не доходять до плеєрів.

### `src/components/TransportControls.test.tsx` (доповнення)
- Комбобокс «Playback speed» зі значенням `1`, 8 опцій.
- Вибір `0.5`, Play (фейк `time 0`), `time 1.05`, «Pause» → позиція `0:00.500 · 1.2`.

### `src/components/AudioTrack.test.tsx`, `src/components/VideoPlayer.test.tsx` (зміни описано вище; доповнення)
- Немає кнопок «Play audio»/«Pause audio»/«Play video»/«Pause video» і комбобоксів «Audio speed»/«Video speed».
- `VideoPlayer`: чекбокс «Mute video» не позначений; клік → у плеєрі `setMuted:true`, чекбокс позначений; ще клік → `setMuted:false`.

### `src/components/PianoRoll/NoteGrid.test.tsx`, `PedalLane.test.tsx`, `PianoRoll.test.tsx` (доповнення)
- `NoteGrid` у `<MediaDurationContext.Provider value={90}>` (120 BPM, zoom 100) → `style.width` сітки `9400px`; без provider'а → `6000px`.
- `PedalLane` так само → `9400px`.
- `PianoRoll` у provider'і з 90 → ширина лінійки `9400px`.

### `src/App.test.tsx` (доповнення/заміни)
- «has one playback transport for MIDI, audio and video»: у групі «Playback» є «Play», «Stop» і комбобокс «Playback speed». У документі немає кнопок «Play audio»/«Play video» і комбобоксів «Audio speed»/«Video speed». У регіоні «Video» є чекбокс «Mute video» і повзунок «Seek video». `createWaveSurferPlayer`, `createHtmlVideoPlayer` і `loadPianoEngine` не викликано.

### Ручна перевірка в браузері
`cd frontend && npm run dev`, http://localhost:5173, Chrome і Firefox. Потрібні локальні файли (не комітяться):
- метроном-клік 120 BPM у mp3 (≥ 3 хв);
- mp4 з цим самим кліком (або будь-яке відео з чіткими ударами);
- відео ~1 хв і аудіо ~4 хв;
- відео H.264 з рідкими ключовими кадрами (довгий GOP): запис екрана або з телефона, бажано 1080p/4K, ≥ 2 хв.
1. Завантажити аудіо-клік. У piano roll поставити ноти на кожну долю (сітка 1/4) у перших 8 тактах і в тактах 60–64. Play: ноти звучать разом із кліками без чутного «флему» ні на початку, ні через 2 хв. Записати у звіт затримки виводу. Для цього в консолі DevTools після будь-якого кліку по сторінці виконати `const c = new AudioContext(); [c.baseLatency, c.outputLatency]`, у Chrome і Firefox. Якщо `outputLatency` понад 30 мс і п. 1 чутно «флемить» (ноти пізніше за клік), це аргумент за константою компенсації (див. «Ризики»).
2. Те саме на 0.5× і 2×: темп нот і кліків змінюється разом, висота тону медіа й нот не змінюється, розбіжності не чутно. На 0.25× кінець аудіо не звучить двічі.
2a. **Довгий GOP на 2×.** Завантажити відео з довгим GOP, швидкість 2×, Play, кілька перемотувань повзунком і лінійкою під час відтворення. Після кожного перемотування відео «сіпається» (seek) не більше 2–3 разів, а далі йде рівно. Регулярних стрибків щосекунди немає. Для контролю можна тимчасово поставити точку зупину або logpoint на `syncTo` у DevTools (не комітити).
3. Завантажити відео з тим самим кліком і поставити mute відео: кадр рухається синхронно, «луни» немає. Зняти mute — звук відео повертається.
4. Pause: усе стоїть, кадр і курсор waveform на позиції playhead. Play продовжує з того самого місця. Stop: усе на 0 (кадр першої секунди, курсор waveform на початку).
5. Клік по лінійці piano roll, клік по waveform, повзунок відео, ±5 с — і на паузі, і під час відтворення. Playhead, позиції транспорту, аудіо й відео однакові, відтворення триває з нової позиції. Курсор waveform і позиція панелі не «блимають» назад на стару позицію.
6. Відео коротше за аудіо: після кінця відео кадр лишається останнім, аудіо й ноти грають далі. Перемотування назад у межі відео — відео знову грає.
7. Таймлайн: з 4-хвилинним аудіо лінійка piano roll доходить щонайменше до 4:00 (+2 такти); після «Remove» знову 60 с (якщо нот далі немає).
8. Завантажити відео під час відтворення: воно стає в поточну позицію й грає. «Remove» під час відтворення: решта грає далі без помилок.
9. Фонова вкладка на 30 с під час відтворення: після повернення розбіжність не чутна або зникає за кілька секунд.
10. Дрейф: відтворення 3 хв без втручань — розбіжності не чутно (у DevTools Performance немає seek-ів медіа частіше за раз на кілька секунд).
11. У панелях медіа немає власних кнопок Play/Pause і швидкості; «Speed» у верхній панелі змінює все.
12. Помилка завантаження піаніно (тимчасово перейменувати `public/samples` локально, **не комітити**): Play показує «Could not load piano samples», медіа не запускається. Після Retry і Play грає все разом.
13. Консоль без помилок і попереджень React (зокрема в dev-режимі зі StrictMode).

## Критерії готовності (Definition of Done)
- [ ] `cd frontend && npm test -- --run && npm run lint && npm run typecheck && npm run build && npx prettier --check .` — зелено.
- [ ] `cd backend && uv run pytest && uv run ruff check . && uv run ruff format --check . && uv run mypy app` — зелено; `git diff main --stat -- backend/` порожній.
- [ ] Усі тести з розділу «Тести» наявні й проходять. `nudgeFactor`, `planMediaSync`, `afterTransportCommand`, `nudgedPlaybackRate`, нові методи `Transport` (`setRate`, `setMediaDuration`), `MediaTrackController` (`syncTo`, `subscribeSeek`, `setRateNudge`, `setMuted`), `MediaSync` (`attach`, `detachAll`, `getMediaDuration`, `subscribe`), `useMediaDuration`, `MediaSyncBridge` мають щонайменше один тест.
- [ ] Змінені наявні тести — лише зі списку «Зміни наявних тестів». Перевірка: `git diff main --name-status -- frontend/src | grep -E '\.test\.tsx?$'` показує `M` лише для `Transport.test.ts`, `TransportProvider.test.tsx`, `AudioTrackController.test.ts`, `waveSurferPlayer.test.ts`, `AudioTrack.test.tsx`, `VideoPlayer.test.tsx`, `App.test.tsx`, `TransportControls.test.tsx`, `MediaTrackController.test.ts`, `htmlVideoPlayer.test.ts`, `pianoRollGeometry.test.ts`, `playbackRate.test.ts`, `NoteGrid.test.tsx`, `PedalLane.test.tsx`, `PianoRoll.test.tsx`, а решта — `A`. У файлах з доповненнями (`TransportControls`, `MediaTrackController`, `htmlVideoPlayer`, `pianoRollGeometry`, `playbackRate`, `NoteGrid`, `PedalLane`, `PianoRoll`) видалених рядків немає, крім рядків імпорту (рекомендація рев'ю 007).
- [ ] `git diff main -- frontend/package.json frontend/package-lock.json` порожній (нових залежностей немає).
- [ ] `grep -n "PLAYBACK_RATE = 1" frontend/src/audio/Transport.ts` нічого не знаходить; `grep -n "rate: this.snapshot.rate" frontend/src/audio/Transport.ts` знаходить рядок.
- [ ] `grep -rnE "'(Play|Pause) (audio|video)'|'(Audio|Video) speed'" frontend/src --include='*.tsx' | grep -v '\.test\.'` нічого не знаходить.
- [ ] `grep -rn "togglePlay" frontend/src/components/AudioTrack.tsx frontend/src/components/VideoPlayer.tsx` нічого не знаходить.
- [ ] README має розділ «Синхронізація»; у розділах «Аудіодоріжка» і «Відео» немає згадок про власні кнопки Play/Pause і швидкість.
- [ ] Ручна перевірка (пп. 1–13 і 2a) пройдена в Chrome і Firefox, значення `baseLatency`/`outputLatency` записано у звіт; `git status --porcelain` не показує медіафайлів.
- [ ] У гілці до злиття (коміт `docs: mark task 008 as done`) у CLAUDE.md відмічено `[x]` 2.4 «Відтворення MIDI синхронізоване…» і 2.5 «Синхронізація з таймлайном редактора…»; статус 008 — «виконано»; статус плану — `виконано`.
- [ ] Гілку `feature/008-media-sync` злито в `main` (`--no-ff`) і запушено; на `main` перевірки зелені.

## Ризики / відкриті питання
- **Затримка старту медіа.** `play()` медіаелемента запускає звук із затримкою (десятки мс), а транспорт стартує через `START_DELAY_SECONDS = 0.05`. Ці затримки приблизно компенсують одна одну, а решту розбіжності за 1–2 с прибирає nudge. Якщо на ручній перевірці (п. 1) початок стабільно «флемить», implementer може запускати медіа на `START_DELAY_SECONDS × rate` раніше позиції (`syncTo(target − START_DELAY_SECONDS × rate)` перед `play` у правилі 4). Це дрібне відхилення зі звітом і тестом.
- **`outputLatency`.** Нота Web Audio, запланована на `contextTime`, звучить на `outputLatency` пізніше, а `currentTime` медіа в Chrome близький до того, що вже чути. На Linux ця різниця буває 20–60 мс, тобто порівнянна з мертвою зоною. У 008 компенсацію не робимо, бо браузери повідомляють `outputLatency` ненадійно. Натомість ручна перевірка (п. 1) фіксує реальні значення `baseLatency`/`outputLatency` у Chrome і Firefox. Якщо зсув чутно і числа його підтверджують, наступний крок — константа компенсації в `target` (`target = position + latencyCompensation`), яку чисті функції вже підтримують параметром. Це дрібне відхилення зі звітом і тестом або окрема задача.
- **Медіа не запускається без завантаженого піаніно** (новий побічний ефект). `togglePlay` чекає на `ensureEngine()`: поки семпли вантажаться, медіа не грає, а якщо вони не завантажились — не грає взагалі (до Retry). Раніше аудіо й відео можна було слухати незалежно від піаніно. Для застосунку, де без піаніно немає сенсу аранжувати, це прийнятно; це описано в README і перевіряється п. 12 ручної перевірки. Якщо власник захоче грати медіа без піаніно, окрема задача може дозволити `Transport.play()` без движка (годинник від `performance.now()`, без нот).
- **Непередбачувана затримка seek.** Якщо затримка сильно змінюється від seek до seek, `seekLead` не встигає її оцінити, і після трьох seek-ів дрейф понад 250 мс виправляє лише nudge (±5 %, тобто близько 10 с на 0.5 с дрейфу при 1×). Це свідомий компроміс: краще повільно підтягти медіа, ніж смикати відео щосекунди. Нова команда транспорту (Pause/Play, перемотування) скидає лічильник.
- **Частота змін `playbackRate`.** Nudge змінює швидкість не частіше, ніж раз на 100 мс, і лише коли округлений до 0.01 коефіцієнт змінився. Якщо в якомусь браузері зміна `playbackRate` з `preservesPitch` дає клацання, запасний варіант — лише hard seek з порогом 0.08 с (`nudgeFactor` → завжди 1). Це дрібне відхилення зі звітом.
- **Autoplay-політика.** Під час першого Play медіа запускається після асинхронного завантаження піаніно, тобто вже поза обробником кліку. Chrome дозволяє це після будь-якої взаємодії зі сторінкою (sticky activation), Firefox — теж для сторінок, з якими користувач взаємодіяв. Якщо `play()` відхилено, панель медіа показує наявне повідомлення `Could not start … playback.`, а наступний Play пробує знову (`playRequested` скидається на кожну команду транспорту).
- **Медіаклавіші ОС.** Системна пауза відео (Media Session) не зупиняє транспорт, і `MediaSync` за ~100 мс знову запустить медіа. Інтеграція з Media Session — поза межами.
- **Прибирання окремих кнопок медіа — прийняте рішення (дефолт).** Якщо власник хоче «слухати лише аудіо», це робиться через головний Play (нот може й не бути). Повернути самостійне прослуховування можна окремою задачею через режим «solo».
- **Відкрите питання до власника (не блокує): зсув медіа (offset).** Зараз медіа завжди починається в 0 с таймлайну. Якщо потрібен зсув (наприклад, щоб пропустити довгий вступ відео без нот), пропонуємо окрему задачу: поле `mediaOffset` у моделі проекту, UI в панелях медіа, `target = position − offset` у `planMediaSync`.
- **Відкрите питання до власника (не блокує): waveform під piano roll.** Пропонуємо окрему задачу після 010 (або між 009 і 010, якщо власник погодить зміну порядку): доріжка waveform під доріжкою педалей у масштабі `pixelsPerSecond` зі спільною прокруткою. Синхронізація з 008 від цього не зміниться.
- **Обсяг.** Чисті функції (`mediaSync.ts`), клас `MediaSync`, розширення `Transport` і `MediaTrackController`, bridge, невеликі зміни UI. Нових залежностей немає. Задача вкладається в одну гілку. Запасний поділ, якщо implementer не вкладається:
  - **008a** — кроки 2–7 і частина кроку 8 без mute: синхронізація, спільна швидкість, довжина таймлайну. Галочки 2.4 і 2.5 ставляться вже тут;
  - **008b** — mute відео (`setMuted` у плеєрах, контролері й UI) і README.

## Зміни після рев'ю (раунд 2)
Зауваження рев'ю раунду 1 (`008-media-sync.review.md`, 2026-09-29):

1. **Блокуюче 1: hard seek може зациклитися.** Логіку корекції перенесено в чистий автомат: `planMediaSync(input, state) → { action, state }` зі станом `TrackSyncState`. Додано два механізми проти циклу:
   - **компенсація випередження `seekLead`.** Після кожного корекційного seek і паузи вимірюється залишковий дрейф, і `seekLead` зсувається на нього (межі 0…`MAX_SEEK_LEAD_SECONDS = 1`). Наступний seek іде на `target + seekLead`. `seekLead` зберігається між командами транспорту й скидається з новим файлом;
   - **ліміт `MAX_CORRECTION_SEEKS = 3`** seek-ів поспіль без збіжності. Далі дрейф виправляє лише nudge; лічильник скидає збіжність або нова команда транспорту (`afterTransportCommand`).
   
   Відлік паузи від `seeked`/`playing` розглянуто й не взято (пояснення в розділі). Неточне «пауза не дає зациклитися» замінено поясненням з прикладами для 1× (L = 0.3 с → 2 seek-и) і 2× (0.15 с медіачасу → 1 seek). Додано:
   - тести в `mediaSync.test.ts`: стале відставання на 1× і 2×, збіжність, зменшення й межі `seekLead`, ліміт, `afterTransportCommand`;
   - тести в `MediaSync.test.ts`: симуляція `run(steps)` із затримкою seek: 1×/`lag 0.3` → рівно 2 `setTime`, 2×/`lag 0.15` → рівно 1, непередбачувана затримка → ≤ 3, збереження `seekLead` і скидання ліміту командою транспорту;
   - ручна перевірка 2a (довгий GOP на 2×).
   - Також додано ризик «Непередбачувана затримка seek».
2. **Блокуюче 2: перемотування користувачем спершу відкочувалося назад.**
   - У `MediaTrackController.seek()` і в `onSeek` слухачі `subscribeSeek` тепер викликаються **до** `update` (після `player.setTime`), тож годинник перемотується раніше, ніж `MediaSync` побачить нову позицію.
   - Додатковий захист: `MediaSync` не запускає `syncTrack` на зміну лише `position` у snapshot доріжки.
   - Тести: порядок слухачів у `MediaTrackController.test.ts`; у `MediaSync.test.ts` — `controller.seek(12)` на паузі (немає `setTime:0`) і `emitSeek(150)` під час відтворення на 100 (немає `setTime:100`); у `MediaSyncBridge.test.tsx` — рівно один `setTime` у журналі відеоплеєра для повзунка. До ручної перевірки (п. 5) додано «немає блимання назад».
3. **Рекомендація: гістерезис мертвої зони.** Замість однієї межі 20 мс — `NUDGE_START_SECONDS = 0.03` і `NUDGE_STOP_SECONDS = 0.01`; `nudgeFactor(drift, currentNudge)`, тести на гістерезис.
4. **Рекомендація: подвійне звучання кінця на 0.25×.** Правило 3 (хвіст) доповнено: медіа, що вже закінчилося, не перезапускається, якщо `target ≥ duration − HARD_SEEK_DRIFT_SECONDS`. Корекційний seek обмежено `duration − END_GUARD_SECONDS`. Додано тести і пункт у ручній перевірці (п. 2).
5. **Рекомендація: `outputLatency`.** У ручній перевірці (п. 1) треба записати `baseLatency`/`outputLatency` у Chrome і Firefox; ризик переписано з критерієм, коли додавати компенсацію.
6. **Рекомендація: формулювання тесту `timelineDurationSeconds`.** Явно вказано ноти: `note('a', 60, 70, 0.5)` (кінець 70.5) → 76, нота з кінцем рівно 70 → 74; додано випадок, коли медіа довше за ноти.
7. **Рекомендація: `detach` ставить медіа на паузу.** `detach` тепер викликає `track.pause()` перед `setRateNudge(1)`; тест у `MediaSync.test.ts`.
8. **Рекомендація: StrictMode і зайвий підписник.** `MediaSync` підписується на годинник ліниво, під час першого `attach`, і відписується, коли від'єднано останню доріжку. Тест на `FakeSyncClock.listenerCount`; пункт 13 ручної перевірки — dev-режим зі StrictMode.
9. **Рекомендація: 2.1/2.5 і спільний транспорт.** У «Меті» і в кроці 9 (README) прямо записано, що відтворення, пауза, швидкість і перемотування аудіо та відео лишаються доступними через спільний транспорт. Додано ризик «Медіа не запускається без завантаженого піаніно», README-примітку і пункт 12 ручної перевірки.
10. **Рекомендація: повідомлення про невдалий `play()` не зникало.** `onPlay` тепер скидає `error`, якщо це `messages.playFailed`; тест у `MediaTrackController.test.ts` (інші помилки лишаються).
