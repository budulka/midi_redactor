# Рев'ю плану 006 — Аудіо: завантаження, waveform, швидкість відтворення

## Раунд 1 — 2026-09-28

**ВЕРДИКТ: ПРИЙНЯТО**

Що перевірено:
- **Вимоги.** План закриває всі п'ять пунктів розділу 2.1: формати mp3/wav/ogg/aac/m4a, waveform, play/pause/seek кліком, швидкість 0.25×–2× з `preservesPitch`, повідомлення про некоректний формат на трьох рівнях. Пункти синхронізації (2.4, 2.5) чесно лишено для 008.
- **Наявний код.** `formatClock` (`src/utils/transportFormat.ts`), `useAnimationFrame`, `stubAnimationFrames`, патерн `Transport` зі стрілковими `subscribe`/`getSnapshot` і `TransportProvider` з двома контекстами існують і відповідають опису. Секція `section.app__audio[aria-label="Audio track"]` з placeholder є в `App.tsx`. Кольори `--muted`/`--note`/`--playhead` в `App.css` збігаються з константами плану. `wavesurfer.js` у `package.json` ще немає.
- **wavesurfer.js 8.0.1.** Версія існує і має тег `latest` на npm. Звірено з `dist/wavesurfer.d.ts`: опції `backend: 'WebAudio' | 'MediaElement'` (за замовчуванням MediaElement), `interact`, `dragToSeek`, `normalize`, `height`; події `ready(duration)`, `interaction(newTime)`, `error(Error)`, `play`, `pause`, `finish`; методи `load(url): Promise<void>`, `play(): Promise<void>`, `setTime`, `setPlaybackRate(rate, preservePitch?)`, `getCurrentTime`, `destroy`. `setPlaybackRate` справді ставить `media.preservesPitch`, якщо передано другий аргумент. Помилка завантаження генерує подію `error`. Захист від подвійного `onError` через покоління і `.catch` з фільтром `AbortError` у плані коректні незалежно від того, чи відхиляє `load` Promise.
- **Архітектура.** Інтерфейс `WaveformPlayer` + фейк, контролер без React і provider за патерном 005 узгоджуються з наявною архітектурою і дають 008 потрібний API. Медіа лишається в браузері (Object URL), backend не змінюється, що відповідає розділу 7.
- **Тести і DoD.** Тести конкретні: точні рядки повідомлень, крайові випадки (`NaN`/`±Infinity`, clamp seek, пізні події старого покоління, подвійний `onError`, `AbortError` проти `NotAllowedError`, збереження швидкості між файлами). Критерії перевіряються командами.
- **Процес.** Гілка `feature/006-audio-track`, шаблон розділу 6 дотримано, коміти у форматі Conventional Commits, нова залежність обґрунтована і передбачена стеком.

### Блокуючі зауваження
Немає.

### Рекомендації (необов'язково, але implementer має їх урахувати)
- **[CSS, `.app__audio`] Специфічність селектора.** `.app__media > section` (0,1,1) специфічніший за `.app__audio` (0,1,0). Тому `align-items: stretch` і `justify-content: flex-start` з плану будуть перекриті значеннями `center` наявного правила. У колонковому flex з `align-items: center` блок `.audio-track` стиснеться до ширини вмісту, і waveform не займе всю ширину панелі (ручна перевірка, п. 1, не пройде). Треба писати правило як `.app__media > .app__audio` (або `section.app__audio`) і дати `.audio-track` `width: 100%` / `align-self: stretch`.
- **[Тести `AudioTrack`, drag-and-drop]** `fireEvent.dragOver` без `dataTransfer` в jsdom дає `event.dataTransfer === undefined`, і рядок `dataTransfer.dropEffect = 'copy'` кине `TypeError`. Або передати в тесті `{ dataTransfer: { dropEffect: 'none', files: [] } }`, або в обробнику перевіряти `dataTransfer` на null (тип DOM це допускає: `DataTransfer | null` у нативному `DragEvent`).
- **[Тести `AudioTrackProvider`]** `vi.spyOn(URL, 'revokeObjectURL')` впаде, якщо властивості в середовищі немає (так само, як `createObjectURL`). Надійніше підмінити обидва методи через присвоєння або `vi.stubGlobal('URL', …)`/`Object.defineProperty` і відновлювати їх в `afterEach`, як у тестах `AudioTrack`.
- **[Контролер, заміна файлу]** Збільшувати `generation` **до** виклику `destroy()` старого плеєра. Тоді будь-яка синхронна подія, яку може згенерувати `destroy` (наприклад, `pause`), гарантовано ігнорується, і контролер не звертається до `getCurrentTime()` знищеного плеєра.
- **[Імпорт `wavesurfer.js` у jsdom]** `AudioTrackProvider` за замовчуванням статично імпортує адаптер, отже тести `AudioTrack`/`AudioTrackProvider` завантажують справжній `wavesurfer.js` у jsdom. Якщо модуль при імпорті звертається до API, яких у jsdom немає, варто використати `vi.mock('../audio/waveSurferPlayer.ts')` і в цих тестах, як у `App.test.tsx`.
- **[`onPause` + `onFinish`]** Наприкінці файлу `HTMLMediaElement` генерує `pause`, а потім `ended`. Поведінка плану коректна (обидва обробники ставлять `position = duration`), але це варто покрити одним тестом контролера: `emitPause` → `emitFinish` дає `playing false`, `position 65`.
