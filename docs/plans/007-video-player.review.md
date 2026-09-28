# 007 — Відео: завантаження, пауза, прокрутка, швидкість — рев'ю плану

## Раунд 1 — 2026-09-28

**ВЕРДИКТ: ПРИЙНЯТО**

План звірено з CLAUDE.md (2.5, розділи 3, 4, 6, 7) і з наявним кодом frontend: `src/audio/AudioTrackController.ts`, `waveformPlayer.ts`, `waveSurferPlayer.ts`, `testing/FakeWaveformPlayer.ts`, `src/state/AudioTrackProvider.tsx`, `audioTrackContext.ts`, `src/components/AudioTrack.tsx`, `PlaybackRateSelect.tsx`, `src/utils/audioFormats.ts`, `playbackRate.ts`, `App.tsx`, `App.test.tsx`, а також з реалізацією `HTMLMediaElement` у jsdom 25 і `lib.dom.d.ts` TypeScript 5.6.

Висновки щодо трьох пунктів, які просив оцінити оркестратор.

1. **Рефакторинг коду 006 реалістичний.** Він не має зачепити тести 006.
   - `AudioTrackController` уже параметризований лише в місцях, які план виносить у `messages`/`detectFormat`: `detectAudioFormat`, чотири повідомлення, `PLAY_FAILED_MESSAGE`. Решта (покоління, `releaseTrack`, `isAbortError`, clamp, rate) переноситься дослівно. Підклас з тим самим конструктором `AudioTrackControllerOptions` зберігає публічний API. `AudioTrackController.test.ts` імпортує лише `AudioTrackController` і фейк.
   - Тести імпортують `createFakeWaveformPlayers` і `type FakeWaveformPlayer` з `audio/testing/FakeWaveformPlayer.ts`. Реекспорт `export { FakeMediaPlayer as FakeWaveformPlayer, … }` дає і значення, і тип, тож тести компілюються без змін.
   - Клас `.audio-track__load` у тестах не використовується (перевірено grep), тож його перейменування на `.file-load` тестів не ламає.
   - `isAbortError` справді дублюється (`AudioTrackController.ts:50`, `waveSurferPlayer.ts:10`). `toError` є лише у `waveSurferPlayer.ts`. Формулювання «з обох файлів» трохи неточне, але на реалізацію це не впливає.
   - Рефакторинг іде окремими комітами (кроки 2–4) до відеокоду й перевіряється незмінними тестами. Це правильна страховка.
2. **Нова тека `src/media/` — прийнятне відхилення.** Розділ 4 CLAUDE.md задає орієнтовну структуру, а не закритий список. Відеоадаптер у `src/audio/` суперечив би опису цієї теки («Tone.js / Web Audio»). Відхилення в плані явно назване й обґрунтоване, тому воно не блокує.
3. **Робота з `HTMLVideoElement` коректна.**
   - `preservesPitch`: властивість є в `lib.dom.d.ts` (TS 5.6), тож типізація без `any`. Її ставлять і при створенні елемента, і в `setPlaybackRate`. Скидання `playbackRate` при новому `src` покриває наявний виклик `setPlaybackRate(rate)` в `onReady`.
   - `Infinity` для WebM: обхід через `currentTime = MAX_SAFE_INTEGER` → `durationchange` → `currentTime = 0` є загальновживаним. `onReady` виникає лише один раз, і запасний варіант названо в ризиках.
   - Звільнення ресурсу: `abort()` слухачів → `pause()` → `removeAttribute('src')` → `load()` → `remove()`. Це рекомендований порядок, і подій після знищення не буде.
   - `canPlayType` викликається лише з контейнером, без кодеків, а непідтримуваний кодек ловить подія `error`. Рішення правильне, хибних «ні» не буде.
   - Тестованість у jsdom перевірено: `currentTime` у jsdom записуваний, `playbackRate` реалізований, `duration`/`error` можна перевизначити через `defineProperty` на екземплярі, `playsInline` є в IDL, `preservesPitch` стає звичайною властивістю об'єкта. `load`/`play`/`pause` у jsdom лише «not implemented», тож план правильно їх мокає.

### Блокуючі зауваження
Немає.

### Рекомендації (необов'язково)
- [Тести / DoD, `transportFormat.test.ts`] Критерій «у `git diff main` лише додані рядки» не виконається, якщо дописати `formatMediaPosition` в наявний рядок `import { formatBarBeat, formatClock } from './transportFormat.ts'`: цей рядок стане зміненим. Implementer може додати окремий рядок імпорту або вважати зміну рядка імпорту допустимою й пояснити це у звіті. Послаблювати чи видаляти наявні перевірки не можна.
- [DoD, перевірка незмінності тестів] Pathspec `'frontend/src/**/*.test.tsx'` без магії `:(glob)` не охоплює `frontend/src/App.test.tsx` (між `src/` і назвою файлу потрібен ще один `/`). Надійніше написати так: `git diff main --name-status -- frontend/src | grep -E '\.test\.tsx?$'`.
- [Технічні рішення, `useMediaTrackController`] Щоб `AudioTrackController` (`MediaTrackController<AudioFormat>`) без проблем передавався туди, де очікують `MediaTrackController<MediaFormat>`, методи в `MediaTrackMessages<F>` мають лишатися в method-синтаксисі, як у плані (він біваріантний). Інший варіант — зробити хук generic за типом контролера. Якщо `tsc` поскаржиться на варіантність, це дрібне відхилення, яке треба описати у звіті.
- [htmlVideoPlayer] Під час перевірки тривалості (`probingDuration`) браузер може згенерувати `seeked`/`timeupdate`, а в Chrome іноді й `ended`. Через це `onFinish` прийде до `onReady`. Для контролера це нешкідливо (статус `loading`, позиція 0), але чистіше ігнорувати `play`/`pause`/`ended`, доки `readyEmitted === false`.
- [VideoPlayer, повзунок] Браузер «прив'язує» значення range до `step`. Якщо тривалість не кратна 0.1 с (наприклад, 12.345), повзунок у кінці показуватиме 12.3. На це впливає лише відображення, а позиція в `output` точна. Прийнятно; за бажання implementer може округлити `max` вгору до кроку.
- [VideoPlayer] Uncontrolled range у jsdom і браузерах за замовчуванням має значення `(min+max)/2`. План це вже покриває, бо `useLayoutEffect` без залежностей пише `seek.value` після кожного рендера. Варто лишити тест `value === '0'` після `emitReady(65)`: він ловить саме цей випадок.
- [Документація] Після виконання варто додати `src/media/` у дерево розділу 4 CLAUDE.md (implementer і так редагує CLAUDE.md у кроці 11), щоб структура в документі відповідала реальній.

### Закриті зауваження попереднього раунду
- Це перший раунд.
