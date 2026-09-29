from typing import Final

from fastapi import APIRouter, Response

from app.models.project import Project
from app.services.midi_export import export_midi

MIDI_FILENAME: Final = "arrangement.mid"
MIDI_MEDIA_TYPE: Final = "audio/midi"

router = APIRouter(tags=["export"])


@router.post(
    "/export/midi",
    response_class=Response,
    responses={200: {"content": {MIDI_MEDIA_TYPE: {}}, "description": "Standard MIDI File"}},
)
def export_project_midi(project: Project) -> Response:
    return Response(
        content=export_midi(project),
        media_type=MIDI_MEDIA_TYPE,
        headers={"Content-Disposition": f'attachment; filename="{MIDI_FILENAME}"'},
    )
