from typing import Final

from fastapi import APIRouter, HTTPException, Request
from starlette.concurrency import run_in_threadpool

from app.models.midi_import import ImportErrorResponse, MidiImportResult
from app.services.midi_import import MidiImportError, import_midi

MAX_MIDI_UPLOAD_BYTES: Final = 4 * 1024 * 1024
MIDI_MEDIA_TYPE: Final = "audio/midi"

router = APIRouter(tags=["import"])


def _too_large() -> HTTPException:
    return HTTPException(
        status_code=413,
        detail={"code": "file_too_large", "message": "The file is larger than 4 MB."},
    )


def _declared_length(request: Request) -> int | None:
    header = request.headers.get("content-length")
    if header is None:
        return None
    try:
        return int(header)
    except ValueError:
        return None


@router.post(
    "/import/midi",
    response_model=MidiImportResult,
    responses={413: {"model": ImportErrorResponse}, 422: {"model": ImportErrorResponse}},
    openapi_extra={
        "requestBody": {
            "required": True,
            "content": {MIDI_MEDIA_TYPE: {"schema": {"type": "string", "format": "binary"}}},
        }
    },
)
async def import_project_midi(request: Request) -> MidiImportResult:
    """Parse a Standard MIDI File sent as the raw request body into a project."""
    declared = _declared_length(request)
    if declared is not None and declared > MAX_MIDI_UPLOAD_BYTES:
        raise _too_large()
    body = bytearray()
    async for chunk in request.stream():
        body.extend(chunk)
        if len(body) > MAX_MIDI_UPLOAD_BYTES:
            raise _too_large()
    try:
        return await run_in_threadpool(import_midi, bytes(body))
    except MidiImportError as error:
        raise HTTPException(
            status_code=422, detail={"code": error.code, "message": error.message}
        ) from error
