import json
from pathlib import Path
from typing import Any

from fastapi.testclient import TestClient

from app.main import app
from app.models.project import Project
from app.services.midi_export import export_midi
from tests.midi_readback import read_midi

FIXTURE = Path(__file__).parent / "fixtures" / "sample_project.json"
URL = "/api/export/midi"

client = TestClient(app)


def fixture_json() -> dict[str, Any]:
    data: dict[str, Any] = json.loads(FIXTURE.read_text())
    return data


def test_export_returns_midi_file() -> None:
    body = fixture_json()

    response = client.post(URL, json=body)

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("audio/midi")
    assert response.headers["content-disposition"] == 'attachment; filename="arrangement.mid"'
    assert response.content == export_midi(Project.model_validate(body))
    assert len(read_midi(response.content).notes) == 3


def test_empty_body_uses_defaults() -> None:
    response = client.post(URL, json={})

    assert response.status_code == 200
    assert read_midi(response.content).tempos == [(0, 500000)]


def test_invalid_pitch_is_rejected() -> None:
    body = fixture_json()
    body["notes"][0]["pitch"] = 109

    response = client.post(URL, json=body)

    assert response.status_code == 422
    assert response.json()["detail"]


def test_overlapping_pedals_are_rejected() -> None:
    body = {
        "pedals": [
            {"id": "a", "type": "sustain", "start": 0, "end": 2},
            {"id": "b", "type": "sustain", "start": 1, "end": 3},
        ]
    }

    assert client.post(URL, json=body).status_code == 422


def test_extra_field_is_rejected() -> None:
    body = fixture_json()
    body["foo"] = 1

    assert client.post(URL, json=body).status_code == 422


def test_non_json_body_is_rejected() -> None:
    response = client.post(URL, content="nope", headers={"Content-Type": "application/json"})

    assert response.status_code == 422


def test_get_is_not_allowed() -> None:
    assert client.get(URL).status_code == 405


def test_openapi_describes_binary_response() -> None:
    schema = client.get("/openapi.json").json()

    operation = schema["paths"][URL]["post"]
    assert "audio/midi" in operation["responses"]["200"]["content"]


def test_media_offset_does_not_change_the_export() -> None:
    reference = client.post(URL, json=fixture_json())
    body = fixture_json()
    body["mediaOffset"] = 3.2

    response = client.post(URL, json=body)

    assert response.status_code == 200
    assert response.content == reference.content


def test_media_offset_out_of_range_is_rejected() -> None:
    body = fixture_json()
    body["mediaOffset"] = 5000

    response = client.post(URL, json=body)

    assert response.status_code == 422


def test_media_cuts_do_not_change_the_export() -> None:
    reference = client.post(URL, json=fixture_json())
    body = fixture_json()
    body["mediaCuts"] = [{"id": "c", "start": 1, "end": 3}]

    response = client.post(URL, json=body)

    assert response.status_code == 200
    assert response.content == reference.content


def test_overlapping_media_cuts_are_rejected() -> None:
    body = fixture_json()
    body["mediaCuts"] = [{"id": "a", "start": 1, "end": 3}, {"id": "b", "start": 2, "end": 4}]

    response = client.post(URL, json=body)

    assert response.status_code == 422
