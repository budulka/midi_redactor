# 001 — Каркас проекту

**Статус:** виконано
**Гілка:** feature/001-project-setup

## Мета
Підготувати робочу основу, на якій будуть реалізовуватися всі наступні задачі:
backend і frontend запускаються, тести й лінтери проходять однією командою.
Функціональні вимоги з розділу 2 CLAUDE.md у цій задачі ще не закриваються.

## Поза межами задачі
- Будь-яка логіка редактора, аудіо, відео, експорту.
- CI (GitHub Actions) — можна додати окремою задачею за бажанням.
- Docker.

## Технічні рішення
- **Backend:** `backend/` як uv-проект (Python 3.12+). Залежності: `fastapi`, `uvicorn[standard]`, `pydantic`; dev: `pytest`, `httpx`, `pytest-cov`, `ruff`, `mypy`.
  - Ендпоінт `GET /api/health` → `{"status": "ok"}` — для перевірки зв'язку frontend ↔ backend.
  - CORS для dev-сервера Vite (`http://localhost:5173`).
- **Frontend:** `frontend/` — Vite + React 18 + TypeScript (strict).
  - Dev: `vitest`, `@testing-library/react`, `@testing-library/jest-dom`, `jsdom`, `eslint`, `prettier`.
  - Vite proxy `/api` → `http://localhost:8000`, щоб не залежати від CORS у dev.
  - Базовий layout-заготовка: верхня панель (транспорт), центральна область (місце під piano roll), нижня/бічна (місце під відео та аудіодоріжку). Лише порожні контейнери з підписами.
  - Індикатор стану backend (викликає `/api/health`).
- **Репозиторій:** `.gitignore` (Python + Node + медіафайли), `README.md` з інструкцією запуску.
- Скрипти npm: `dev`, `build`, `test`, `lint`, `typecheck`, `format`.

## Кроки реалізації
1. Локальний репозиторій уже ініціалізовано, `origin` (SSH) додано. На `origin/main` є лише стартовий `README.md` від GitHub.
   Зробити локальний `main` на основі `origin/main`, закомітити в `main` `CLAUDE.md`, `.claude/`, `docs/`, `.gitignore` і зробити push.
2. Створити гілку `feature/001-project-setup`.
3. Backend: `uv init`, структура `app/{main.py,api,models,services}`, роутер health, CORS.
4. Backend тести: `tests/test_health.py`.
5. Frontend: `npm create vite@latest` (react-ts), налаштувати Vitest, ESLint, Prettier, proxy.
6. Компоненти `App` з layout-заготовкою та `BackendStatus`.
7. Frontend тести.
8. README: вимоги (Python, uv, Node), команди запуску й тестування.
9. Запуск усіх перевірок, merge в `main`, push.

## Тести
- **Backend:**
  - `GET /api/health` повертає 200 і `{"status": "ok"}`.
  - CORS-заголовок присутній для origin `http://localhost:5173`.
- **Frontend:**
  - `App` рендерить три області layout (транспорт, редактор, медіа).
  - `BackendStatus` показує "online" при успішній відповіді (fetch замоканий) і "offline" при помилці.
- **Ручна перевірка:** `uv run uvicorn app.main:app --reload` + `npm run dev` → сторінка відкривається, статус backend "online".

## Критерії готовності (Definition of Done)
- [x] `cd backend && uv run pytest && uv run ruff check . && uv run mypy app` — зелено.
- [x] `cd frontend && npm test -- --run && npm run lint && npm run typecheck && npm run build` — зелено.
- [x] README описує запуск.
- [x] Гілку злито в `main` (`--no-ff`) і запушено на GitHub.
- [x] Статус задачі 001 в CLAUDE.md оновлено.

## Ризики / відкриті питання
- Потрібні встановлені `uv`, `node` (≥ 20) і `npm` — перевірю на початку реалізації; якщо чогось бракує, повідомлю.
- Push на GitHub потребує налаштованої автентифікації (SSH-ключ або `gh auth login`).
- ~~Формат "odd"~~ — підтверджено власником: мається на увазі **ogg**.
