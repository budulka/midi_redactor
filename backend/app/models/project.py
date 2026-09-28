"""Project data model shared with the frontend (camelCase JSON)."""

from typing import Final, Literal, Self

from pydantic import BaseModel, ConfigDict, Field, model_validator
from pydantic.alias_generators import to_camel

MIN_PITCH: Final = 21
MAX_PITCH: Final = 108
MIN_VELOCITY: Final = 1
MAX_VELOCITY: Final = 127
MIN_NOTE_DURATION: Final = 0.001
MIN_PEDAL_DURATION: Final = 0.001
MIN_BPM: Final = 20
MAX_BPM: Final = 300
MIN_NUMERATOR: Final = 1
MAX_NUMERATOR: Final = 32
DEFAULT_BPM: Final = 120.0

PedalType = Literal["sustain", "sostenuto", "soft"]
Denominator = Literal[1, 2, 4, 8, 16, 32]


class CamelModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="forbid")


class Note(CamelModel):
    id: str = Field(min_length=1)
    pitch: int = Field(ge=MIN_PITCH, le=MAX_PITCH)
    start: float = Field(ge=0, allow_inf_nan=False)
    duration: float = Field(ge=MIN_NOTE_DURATION, allow_inf_nan=False)
    velocity: int = Field(ge=MIN_VELOCITY, le=MAX_VELOCITY)


class PedalEvent(CamelModel):
    id: str = Field(min_length=1)
    type: PedalType
    start: float = Field(ge=0, allow_inf_nan=False)
    end: float = Field(allow_inf_nan=False)

    @model_validator(mode="after")
    def check_interval(self) -> Self:
        if self.end < self.start + MIN_PEDAL_DURATION:
            raise ValueError(f"pedal end must be at least {MIN_PEDAL_DURATION} s after start")
        return self


class TimeSignature(CamelModel):
    numerator: int = Field(ge=MIN_NUMERATOR, le=MAX_NUMERATOR)
    denominator: Denominator


def _default_time_signature() -> TimeSignature:
    return TimeSignature(numerator=4, denominator=4)


class Project(CamelModel):
    bpm: float = Field(default=DEFAULT_BPM, ge=MIN_BPM, le=MAX_BPM, allow_inf_nan=False)
    time_signature: TimeSignature = Field(default_factory=_default_time_signature)
    notes: list[Note] = Field(default_factory=list)
    pedals: list[PedalEvent] = Field(default_factory=list)

    @model_validator(mode="after")
    def check_consistency(self) -> Self:
        _check_unique_ids("note", [note.id for note in self.notes])
        _check_unique_ids("pedal", [pedal.id for pedal in self.pedals])
        _check_pedal_overlaps(self.pedals)
        return self


def _check_unique_ids(kind: str, ids: list[str]) -> None:
    seen: set[str] = set()
    for item_id in ids:
        if item_id in seen:
            raise ValueError(f"duplicate {kind} id: {item_id!r}")
        seen.add(item_id)


def _check_pedal_overlaps(pedals: list[PedalEvent]) -> None:
    by_type: dict[str, list[PedalEvent]] = {}
    for pedal in pedals:
        by_type.setdefault(pedal.type, []).append(pedal)
    for pedal_type, group in by_type.items():
        ordered = sorted(group, key=lambda pedal: pedal.start)
        for previous, current in zip(ordered, ordered[1:], strict=False):
            if current.start < previous.end:
                raise ValueError(f"{pedal_type} pedals {previous.id!r} and {current.id!r} overlap")
