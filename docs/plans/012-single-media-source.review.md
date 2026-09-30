# Рев'ю плану 012 — fix: одне джерело медіа + waveform звуку відео на аудіодоріжці

## Раунд 1 — 2026-09-30

**ВЕРДИКТ: ВІДХИЛЕНО**

План сильний. Архітектура (подія `subscribeLoadStart` + чиста `keepSingleMediaSource`, WaveSurfer з опцією `media`), тести й DoD продумані добре. Я звірив їх з кодом: `MediaTrackController.load/clear/releaseTrack`, `FakeMediaPlayer`, `htmlVideoPlayer`, `waveSurferPlayer`, `useMediaTrackController`, `useLivePosition`, `MediaSyncBridge.test.tsx`, `e2e/media.ts`, розділи README. Твердження про WaveSurfer 8.0.1 теж підтверджуються джерелом у `node_modules`:
- у `player.js` `destroy()` для зовнішнього медіа нічого не робить з елементом;
- `setSrc` не змінює джерело, якщо URL той самий;
- `revokeSrc` відкликає лише власні URL;
- конструктор сам викликає `load(options.url || player.getSrc())`;
- `loadAudio` не ставить зовнішнє медіа на паузу;
- `destroy()` викликає `unAll()`, тому після знищення подій не буде.

Моки `vi.mock('…/waveSurferPlayer.ts')` є рівно в чотирьох файлах, які названо в плані. Фейкові плеєри мають `mediaElement = null`, тож у `MediaSyncBridge.test.tsx` `VideoSoundWaveform` не викличе замоканий `createWaveSurferView`.

Є одне блокуюче зауваження: план стверджує поведінку, якої наявний код не дає.

### Блокуючі зауваження
1. **[Технічні рішення → «Одне джерело медіа», пункт про `MediaSync`; Ручна перевірка, п. 1 і 5] Заміна медіа під час відтворення зупиняє транспорт і відкидає playhead назад.**
   План пише: «Нове медіа, завантажене під час відтворення, стає в позицію транспорту й починає грати (наявна поведінка 008)». За кодом це не так. `keepSingleMediaSource` очищає стару доріжку синхронно, а нова доріжка ще в `loading`. Далі відбувається таке:
   - `MediaSync.updateMediaDuration()` рахує максимум лише серед `ready`-доріжок, тож тривалість медіа стає 0;
   - `TransportProvider` (`useSyncExternalStore` + `useEffect`) викликає `transport.setMediaDuration(0)`;
   - `Transport.updateEndTime()` перераховує `endTime = timelineDurationSeconds(notes, …, 0)`. Це щонайменше 60 с (`MIN_TIMELINE_SECONDS`) або два такти після останньої ноти чи педалі;
   - на найближчому `tick` `positionAt(...) >= endTime` виконується `halt('paused', this.endTime)`: транспорт стає на паузу, а позиція стрибає назад на кінець «укороченого» таймлайну.

   Нове відео декодується значно довше одного тіку, тож це відтворюється майже завжди. Типовий сценарій: пісня 3 хв, нот ще мало, playhead на 1:30, користувач завантажує відео. Відтворення зупиняється на ~1:00. Так само ненадовго стискається ширина piano roll. Ручна перевірка п. 1 («Відео стає в позицію транспорту й грає») і п. 5 («грає mp3») за таких умов не пройде, і implementer змушений буде або змінювати `Transport`/`MediaSync` поза планом, або тихо змінити очікування.

   → Що зробити: planner має явно обрати поведінку, зафіксувати її в плані й покрити тестом. Можливі варіанти:
   - **(а)** Прийняти поведінку і задокументувати її: описати в «Технічних рішеннях» і «Ризиках», виправити тексти ручної перевірки п. 1 і 5 (наприклад, «якщо playhead у межах таймлайну без медіа, відтворення триває, інакше транспорт стає на паузу в кінці таймлайну») і згадати це в README.
   - **(б)** Не давати таймлайну стискатися на час заміни. Наприклад, `SingleMediaSource`/`MediaSync` тримає попередню тривалість, поки нова доріжка в `loading`, і скидає її, коли та стає `ready` або отримує помилку. Інший спосіб: заміна під час відтворення спершу ставить транспорт на паузу у поточній позиції.

   Для обраного варіанта потрібні тест (unit або інтеграційний у `SingleMediaSource.test.tsx`/`MediaSync.test.ts`) і узгоджене твердження в розділі «`MediaSync` окремо нічого не потребує». Якщо обрано (б), до списку «Зміни наявних тестів» і DoD треба додати файли, які це зачіпає.

### Рекомендації (необов'язково)
- DoD: «в `AudioTrack.test.tsx` змінено лише `vi.mock` і `setup()`». Файлу також знадобляться нові імпорти (`VideoProvider`, `createFakeMediaPlayers`, `createFakeWaveformViews`). Варто дописати «і рядки імпорту», як для інших файлів, щоб implementer не порушив критерій формально.
- `VideoSoundWaveform`: в ефекті явно обробити `ref.current === null` (strict TS цього вимагатиме). Логічно в цьому разі показувати `failed` або нічого не робити. Краще зазначити це в плані.
- `VideoSoundWaveform.test.tsx`: додати перевірку, що `api.seek` з `emitSeek` пересуває й транспорт (позиція `Playback position`), якщо в дереві є `TransportProvider` + `MediaSyncBridge`. Або прямо сказати, що це покриває e2e-сценарій 5.
- E2E `mediaElements`: якщо WaveSurfer 8 кладе `<audio>` у закритий shadow root, обхід `shadowRoot` його не побачить. На цей випадок варто підстрахуватися ще й підрахунком через `document.querySelectorAll('div')` → `host.shadowRoot`. Якщо елемент не знайдеться, досить явно записати у звіт, що перевірка покладається на `destroy()` WaveSurfer.
- «Ризики»: коротко згадати, що в режимі «звук відео» клік по waveform виконує `video.currentTime = t` двічі (спершу WaveSurfer, потім `controller.seek`). Це нешкідливо, але в Firefox може дати два `seeking`.

### Закриті зауваження попереднього раунду
- Немає (раунд 1).

## Раунд 2 — 2026-09-30

**ВЕРДИКТ: ПРИЙНЯТО**

Я звірив нові частини плану з кодом `MediaTrackController.ts`, `MediaSync.ts`, `Transport.ts` (`setMediaDuration`, `updateEndTime`, `tick` → `halt`), `TransportProvider.tsx` (`useSyncExternalStore(mediaSync.subscribe, getMediaDuration)` → `useEffect` → `transport.setMediaDuration`), `TransportProvider.test.tsx` (`setupMedia`, `loadReady`, `MediaProbe`, вивід «media duration») і `pianoRollGeometry.timelineDurationSeconds` (`MIN_TIMELINE_SECONDS = 60`).

**Новий порядок у `MediaTrackController.load()`** коректний:
- `releaseTrack()` не викликає `notify()`, а snapshot `loading` записується без сповіщення. Тому, коли слухач `subscribeLoadStart` через `keepSingleMediaSource` очищає іншу доріжку, `MediaSync.onTrackChange(інша)` → `updateMediaDuration()` уже бачить у цієї доріжки `getSnapshot().status === 'loading'`, і утримання спрацьовує.
- `onTrackChange` для очищеної доріжки синхронізує лише її саму (`syncTrack(entry)`), а вона `empty`, тож нова доріжка без плеєра в цей момент не зачіпається.
- Після `createPlayer` і `notify()` `onTrackChange(нова)` бачить перехід `ready`/`empty` → `loading` (`changed === true`) і знову рахує з утриманням.
- Кількість сповіщень власним слухачам `subscribe` не змінюється: одне на `load`.
- Наявний порядок `destroy` → `create` зберігається.

**Утримання в `updateMediaDuration()`** закриває проблему:
- поки є `loading`-доріжка, `mediaDuration` не зменшується. `MediaSync` не сповіщає слухачів, тож `TransportProvider` не викликає `setMediaDuration`, `endTime` не змінюється, і `tick` не робить `halt`;
- `loading` → `ready` і `loading` → `empty` (помилка) змінюють `status`, тож перерахунок гарантовано відбувається, і тривалість «відпускається»;
- `detach` також викликає `updateMediaDuration()`.

Числа в тестах `TransportProvider.test.tsx` узгоджені з наявним тестом «extends the transport to the attached media» (90 с медіа → пауза на 94.06, тобто +2 такти по 2 с при 120 BPM):
- 180 с утримується, позиція 90.5 < 184 → транспорт грає;
- без утримання таймлайн 60 с < 90.5 → пауза, тобто тест справді падає без виправлення;
- новий файл 30 с → таймлайн 60 с < 91 → пауза.

Обрана поведінка для коротшого файлу й помилки декодування задокументована в «Ризиках», ручній перевірці (1a) і README.

### Блокуючі зауваження
Немає.

### Рекомендації (необов'язково)
- У `MediaSync.test.ts` для сценарію заміни між доріжками варто перевірити, що `listener` тривалості не викликається **протягом усього** `B.load(...)`, а не лише в кінці. Це фіксує, що правило бачить `loading` уже в момент очищення A, тобто новий порядок кроків у `load()`. Якщо порядок повернуть до старого (спершу `clear` іншої, потім snapshot `loading`), тривалість на мить впаде до 0, і тест це зловить.
- У JSDoc `subscribeLoadStart` варто прямо написати, що під час виклику слухача `getSnapshot()` цієї доріжки вже `loading`, а плеєра ще немає (`getCurrentTime()` повертає 0). Це тепер частина контракту, на яку спирається `MediaSync`.
- Інтеграційний тест у `SingleMediaSource.test.tsx` очікує `setTime:` «≈ 90.5». Краще перевіряти числом з допуском (`toBeCloseTo`), а не точним рядком, бо `planMediaSync` враховує `startDelay` і поточний `engine.time`.

### Закриті зауваження попереднього раунду
- **Блокуюче 1 (транспорт зупиняється під час заміни медіа)** — закрито варіантом (б): утримання тривалості в `MediaSync.updateMediaDuration()` плюс новий порядок у `load()`. Є тести в `MediaSync.test.ts` (6 сценаріїв), `TransportProvider.test.tsx` (2) і `SingleMediaSource.test.tsx` (інтеграційний), а також DoD на межі змін у `MediaSync.ts` і на те, що без виправлення тести падають. Ручну перевірку й README оновлено.
- Рекомендація про імпорти в `AudioTrack.test.tsx` — враховано в DoD.
- Рекомендація про `ref.current === null` — враховано.
- Рекомендація про seek транспорту з waveform звуку відео — додано тест.
- Рекомендація про shadow root — перевірено (`mode: 'open'`), описано запасний варіант.
- Рекомендація про подвійний seek — додано до «Ризиків».
