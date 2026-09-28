# MIDI Redactor

Веб-редактор для створення фортепіанних аранжувань під відео та аудіо з експортом у `.mid`.
Вимоги та правила розробки — у [CLAUDE.md](CLAUDE.md), плани задач — у [docs/plans](docs/plans).

## Вимоги

- Python 3.12+ і [uv](https://docs.astral.sh/uv/)
- Node.js 20+ і npm

## Запуск у режимі розробки

```bash
# backend (http://localhost:8000, документація API — /docs)
cd backend
uv sync
uv run uvicorn app.main:app --reload

# frontend (http://localhost:5173), в окремому терміналі
cd frontend
npm install
npm run dev
```

Frontend проксіює запити `/api/*` на backend.

## Тести та перевірки

```bash
cd backend && uv run pytest && uv run ruff check . && uv run ruff format --check . && uv run mypy app
cd frontend && npm test -- --run && npm run lint && npm run typecheck && npm run build
```

Форматування коду:

```bash
cd backend && uv run ruff format .
cd frontend && npm run format
```

## Структура

- `backend/` — FastAPI-застосунок (`app/main.py`), роутери в `app/api/`, схеми в `app/models/`, логіка в `app/services/`, тести в `tests/`.
  Перевірка зв'язку: `GET /api/health` → `{"status": "ok"}`.
- `frontend/` — React + TypeScript (Vite). Тести Vitest лежать поруч із кодом (`*.test.tsx`).
