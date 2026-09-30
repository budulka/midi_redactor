import json
import math
from pathlib import Path
from typing import Any

import pytest
from pydantic import ValidationError

from app.models.project import MIN_PEDAL_DURATION, Note, PedalEvent, Project, TimeSignature

FIXTURE = Path(__file__).parent / "fixtures" / "sample_project.json"


def note_data(**overrides: Any) -> dict[str, Any]:
    data: dict[str, Any] = {
        "id": "n1",
        "pitch": 60,
        "start": 0.5,
        "duration": 0.25,
        "velocity": 100,
    }
    data.update(overrides)
    return data


def pedal_data(**overrides: Any) -> dict[str, Any]:
    data: dict[str, Any] = {"id": "p1", "type": "sustain", "start": 0.0, "end": 1.0}
    data.update(overrides)
    return data


def test_fixture_round_trip() -> None:
    raw = FIXTURE.read_text()
    project = Project.model_validate_json(raw)

    dumped = project.model_dump(by_alias=True, mode="json")

    assert dumped == json.loads(raw)
    assert "timeSignature" in dumped
    assert project.time_signature.numerator == 3


def test_project_defaults() -> None:
    project = Project()

    assert project.bpm == 120
    assert project.time_signature == TimeSignature(numerator=4, denominator=4)
    assert project.notes == []
    assert project.pedals == []


def test_snake_case_input_is_accepted() -> None:
    project = Project.model_validate({"time_signature": {"numerator": 6, "denominator": 8}})

    assert project.time_signature.denominator == 8


@pytest.mark.parametrize("pitch", [21, 108])
def test_note_pitch_bounds_accepted(pitch: int) -> None:
    assert Note.model_validate(note_data(pitch=pitch)).pitch == pitch


@pytest.mark.parametrize("pitch", [20, 109, 60.5])
def test_note_pitch_invalid(pitch: float) -> None:
    with pytest.raises(ValidationError):
        Note.model_validate(note_data(pitch=pitch))


@pytest.mark.parametrize("velocity", [1, 127])
def test_note_velocity_bounds_accepted(velocity: int) -> None:
    assert Note.model_validate(note_data(velocity=velocity)).velocity == velocity


@pytest.mark.parametrize("velocity", [0, 128])
def test_note_velocity_invalid(velocity: int) -> None:
    with pytest.raises(ValidationError):
        Note.model_validate(note_data(velocity=velocity))


@pytest.mark.parametrize("duration", [0, -0.1, math.inf])
def test_note_duration_invalid(duration: float) -> None:
    with pytest.raises(ValidationError):
        Note.model_validate(note_data(duration=duration))


def test_note_min_duration_accepted() -> None:
    assert Note.model_validate(note_data(duration=0.001)).duration == 0.001


@pytest.mark.parametrize("start", [-0.01, math.inf, math.nan])
def test_note_start_invalid(start: float) -> None:
    with pytest.raises(ValidationError):
        Note.model_validate(note_data(start=start))


def test_note_empty_id_invalid() -> None:
    with pytest.raises(ValidationError):
        Note.model_validate(note_data(id=""))


def test_pedal_unknown_type_invalid() -> None:
    with pytest.raises(ValidationError):
        PedalEvent.model_validate(pedal_data(type="expression"))


@pytest.mark.parametrize("end", [0.5, 0.2])
def test_pedal_end_not_after_start_invalid(end: float) -> None:
    with pytest.raises(ValidationError):
        PedalEvent.model_validate(pedal_data(start=0.5, end=end))


@pytest.mark.parametrize("start", [0.5, 2.0])
def test_pedal_min_duration_accepted(start: float) -> None:
    # 2.0 + 0.001 - 2.0 < 0.001 in floating point, so the rule is end >= start + min.
    pedal = PedalEvent.model_validate(pedal_data(start=start, end=start + MIN_PEDAL_DURATION))

    assert pedal.end > pedal.start


@pytest.mark.parametrize(
    "value",
    [
        {"numerator": 4, "denominator": 3},
        {"numerator": 0, "denominator": 4},
        {"numerator": 33, "denominator": 4},
    ],
)
def test_time_signature_invalid(value: dict[str, int]) -> None:
    with pytest.raises(ValidationError):
        TimeSignature.model_validate(value)


def test_time_signature_six_eight_accepted() -> None:
    ts = TimeSignature.model_validate({"numerator": 6, "denominator": 8})

    assert (ts.numerator, ts.denominator) == (6, 8)


@pytest.mark.parametrize("bpm", [20, 300])
def test_project_bpm_bounds_accepted(bpm: float) -> None:
    assert Project.model_validate({"bpm": bpm}).bpm == bpm


@pytest.mark.parametrize("bpm", [19, 301])
def test_project_bpm_invalid(bpm: float) -> None:
    with pytest.raises(ValidationError):
        Project.model_validate({"bpm": bpm})


def test_project_duplicate_note_id_invalid() -> None:
    with pytest.raises(ValidationError, match="duplicate note id"):
        Project.model_validate({"notes": [note_data(), note_data(pitch=62)]})


def test_project_duplicate_pedal_id_invalid() -> None:
    with pytest.raises(ValidationError, match="duplicate pedal id"):
        Project.model_validate(
            {"pedals": [pedal_data(), pedal_data(type="soft", start=2.0, end=3.0)]}
        )


def test_project_overlapping_same_type_pedals_invalid() -> None:
    pedals = [pedal_data(id="a", start=0.0, end=2.0), pedal_data(id="b", start=1.0, end=3.0)]

    with pytest.raises(ValidationError, match="overlap"):
        Project.model_validate({"pedals": pedals})


def test_project_touching_pedals_accepted() -> None:
    pedals = [pedal_data(id="b", start=1.0, end=2.0), pedal_data(id="a", start=0.0, end=1.0)]

    assert len(Project.model_validate({"pedals": pedals}).pedals) == 2


def test_project_overlapping_different_type_pedals_accepted() -> None:
    pedals = [
        pedal_data(id="a", start=0.0, end=2.0),
        pedal_data(id="b", type="soft", start=1.0, end=3.0),
    ]

    assert len(Project.model_validate({"pedals": pedals}).pedals) == 2


def test_project_unknown_field_invalid() -> None:
    with pytest.raises(ValidationError):
        Project.model_validate({"foo": 1})


def project_data(**overrides: Any) -> dict[str, Any]:
    data: dict[str, Any] = json.loads(FIXTURE.read_text())
    data.pop("mediaOffset")
    data.update(overrides)
    return data


def test_media_offset_defaults_to_zero() -> None:
    project = Project.model_validate(project_data())

    assert project.media_offset == 0.0


def test_media_offset_is_read_and_dumped_as_camel_case() -> None:
    project = Project.model_validate(project_data(mediaOffset=3.2))

    assert project.media_offset == 3.2
    assert project.model_dump(by_alias=True, mode="json")["mediaOffset"] == 3.2


@pytest.mark.parametrize("offset", [-3600, 3600])
def test_media_offset_limits_are_accepted(offset: float) -> None:
    assert Project.model_validate(project_data(mediaOffset=offset)).media_offset == offset


@pytest.mark.parametrize("offset", [3600.5, -3600.5, float("nan"), float("inf")])
def test_invalid_media_offset_is_rejected(offset: float) -> None:
    with pytest.raises(ValidationError):
        Project.model_validate(project_data(mediaOffset=offset))


def test_media_offset_accepts_the_field_name() -> None:
    assert Project.model_validate(project_data(media_offset=1)).media_offset == 1.0
