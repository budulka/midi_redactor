import pytest

from app.services.timing import (
    TICKS_PER_QUARTER,
    bpm_to_midi_tempo,
    seconds_to_ticks,
    ticks_to_seconds,
)


@pytest.mark.parametrize(
    ("seconds", "bpm", "expected"),
    [(0.5, 120, 480), (1.0, 60, 480), (0, 120, 0), (2.0, 120, 1920), (1.0, 90, 720)],
)
def test_seconds_to_ticks(seconds: float, bpm: float, expected: int) -> None:
    assert seconds_to_ticks(seconds, bpm) == expected


def test_seconds_to_ticks_rounding() -> None:
    assert seconds_to_ticks(0.0005, 120) == 0
    assert seconds_to_ticks(0.0006, 120) == 1


def test_seconds_to_ticks_custom_ppq() -> None:
    assert seconds_to_ticks(0.5, 120, ppq=96) == 96


def test_ticks_to_seconds() -> None:
    assert ticks_to_seconds(480, 120) == 0.5
    assert ticks_to_seconds(96, 120, ppq=96) == 0.5


@pytest.mark.parametrize("bpm", [20, 60, 90, 120, 137.5, 300])
@pytest.mark.parametrize("seconds", [0.0, 0.001, 0.26, 1.0 / 3, 2.5, 61.7])
def test_ticks_round_trip_within_half_tick(seconds: float, bpm: float) -> None:
    restored = ticks_to_seconds(seconds_to_ticks(seconds, bpm), bpm)

    assert abs(restored - seconds) <= 60 / bpm / TICKS_PER_QUARTER / 2 + 1e-12


@pytest.mark.parametrize(("bpm", "expected"), [(120, 500000), (60, 1000000), (90, 666667)])
def test_bpm_to_midi_tempo(bpm: float, expected: int) -> None:
    assert bpm_to_midi_tempo(bpm) == expected


def test_seconds_to_ticks_rejects_negative_seconds() -> None:
    with pytest.raises(ValueError):
        seconds_to_ticks(-1, 120)


@pytest.mark.parametrize("bpm", [0, -10])
def test_rejects_non_positive_bpm(bpm: float) -> None:
    with pytest.raises(ValueError):
        seconds_to_ticks(1, bpm)
    with pytest.raises(ValueError):
        ticks_to_seconds(480, bpm)
    with pytest.raises(ValueError):
        bpm_to_midi_tempo(bpm)


def test_ticks_to_seconds_rejects_negative_ticks() -> None:
    with pytest.raises(ValueError):
        ticks_to_seconds(-1, 120)


def test_rejects_non_positive_ppq() -> None:
    with pytest.raises(ValueError):
        seconds_to_ticks(1, 120, ppq=0)
    with pytest.raises(ValueError):
        ticks_to_seconds(1, 120, ppq=0)
