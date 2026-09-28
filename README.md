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

## Керування piano roll

- **Додати ноту:** клік по порожньому місцю сітки (нота довжиною в крок сітки); протягування вправо задає тривалість.
- **Перемістити ноту:** перетягнути її по часу й висоті.
- **Змінити тривалість:** потягнути за правий край ноти.
- **Видалити:** правий клік по ноті або `Delete`/`Backspace` для виділеної ноти (фокус на сітці).
- **Скасувати перетягування:** `Escape` до відпускання кнопки миші.
- **Velocity:** поле «Velocity» в інспекторі над сіткою; яскравість ноти відповідає velocity.
- **Сітка:** «Grid» — крок прив'язки, «Snap» — увімкнути/вимкнути прив'язку, «Quantize» — вирівняти виділену ноту, «Zoom in/out» — горизонтальний масштаб.
- **Темп і розмір такту:** поля `♩ =` і розміру в верхній панелі (значення застосовується по Enter або при виході з поля).

Сітка прив'язана до 0 с. Якщо крок не ділить такт націло (наприклад, `1/4 triplet` у 3/4), лінії кроку зсуваються відносно тактів — так само, як і фактичні позиції прив'язки нот.

## Структура

- `backend/` — FastAPI-застосунок (`app/main.py`), роутери в `app/api/`, схеми в `app/models/`, логіка в `app/services/`, тести в `tests/`.
  Перевірка зв'язку: `GET /api/health` → `{"status": "ok"}`.
- `frontend/` — React + TypeScript (Vite). Тести Vitest лежать поруч із кодом (`*.test.tsx`).
