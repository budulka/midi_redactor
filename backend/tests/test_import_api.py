import json
from pathlib import Path
from typing import Any

from fastapi.testclient import TestClient

from app.api.import_midi import MAX_MIDI_UPLOAD_BYTES
from app.main import app
from app.models.project import Project
from app.services.midi_export import export_midi
from tests.midi_builder import build_smf

FIXTURE = Path(__file__).parent / "fixtures" / "sample_project.json"
URL = "/api/import/midi"
MIDI_HEADERS = {"Content-Type": "audio/midi"}

client = TestClient(app)


def fixture_json() -> dict[str, Any]:
    data: dict[str, Any] = json.loads(FIXTURE.read_text())
    return data


def test_import_returns_project() -> None:
    data = export_midi(Project.model_validate(fixture_json()))

    response = client.post(URL, content=data, headers=MIDI_HEADERS)

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("application/json")
    body = response.json()
    assert body["project"] == fixture_json()
    assert body["warnings"] == []


def test_invalid_file_is_422() -> None:
    response = client.post(URL, content=b"nope", headers=MIDI_HEADERS)

    assert response.status_code == 422
    detail = response.json()["detail"]
    assert detail["code"] == "invalid_file"
    assert detail["message"]


def test_empty_body_is_422() -> None:
    response = client.post(URL, content=b"", headers=MIDI_HEADERS)

    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "empty_file"


def test_format_2_is_422() -> None:
    response = client.post(URL, content=build_smf([[]], type=2), headers=MIDI_HEADERS)

    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "unsupported_format"


def test_too_large_body_is_413() -> None:
    response = client.post(URL, content=b"x" * (MAX_MIDI_UPLOAD_BYTES + 1), headers=MIDI_HEADERS)

    assert response.status_code == 413
    assert response.json()["detail"]["code"] == "file_too_large"


def test_chunked_body_without_length_is_413() -> None:
    chunks = iter([b"x" * MAX_MIDI_UPLOAD_BYTES, b"x"])

    response = client.post(URL, content=chunks, headers=MIDI_HEADERS)

    assert response.status_code == 413
    assert response.json()["detail"]["code"] == "file_too_large"


def test_body_at_the_limit_is_parsed() -> None:
    response = client.post(URL, content=b"x" * MAX_MIDI_UPLOAD_BYTES, headers=MIDI_HEADERS)

    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "invalid_file"


def test_invalid_content_length_falls_back_to_stream_check() -> None:
    response = client.post(URL, content=b"nope", headers={**MIDI_HEADERS, "Content-Length": "abc"})

    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "invalid_file"


def test_upload_limit() -> None:
    assert MAX_MIDI_UPLOAD_BYTES == 4 * 1024 * 1024


def test_get_is_not_allowed() -> None:
    assert client.get(URL).status_code == 405


def test_openapi_describes_import() -> None:
    operation = client.get("/openapi.json").json()["paths"][URL]["post"]

    assert "audio/midi" in operation["requestBody"]["content"]
    assert {"200", "413", "422"} <= set(operation["responses"])
