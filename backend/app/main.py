from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.export import router as export_router
from app.api.health import router as health_router
from app.api.import_midi import router as import_router

DEV_ORIGINS = ["http://localhost:5173", "http://127.0.0.1:5173"]


def create_app() -> FastAPI:
    app = FastAPI(title="MIDI Redactor API", version="0.1.0")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=DEV_ORIGINS,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(health_router, prefix="/api")
    app.include_router(export_router, prefix="/api")
    app.include_router(import_router, prefix="/api")
    return app


app = create_app()
