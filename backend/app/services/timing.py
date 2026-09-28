"""Pure conversions between timeline seconds and MIDI ticks/tempo."""

import math
from typing import Final

TICKS_PER_QUARTER: Final = 480
MICROSECONDS_PER_MINUTE: Final = 60_000_000


def _check_bpm(bpm: float) -> None:
    if not bpm > 0:
        raise ValueError(f"bpm must be positive, got {bpm}")


def _check_ppq(ppq: int) -> None:
    if ppq <= 0:
        raise ValueError(f"ppq must be positive, got {ppq}")


def seconds_to_ticks(seconds: float, bpm: float, ppq: int = TICKS_PER_QUARTER) -> int:
    """Convert seconds to MIDI ticks, rounding half up (bpm is quarter notes per minute)."""
    if seconds < 0:
        raise ValueError(f"seconds must be non-negative, got {seconds}")
    _check_bpm(bpm)
    _check_ppq(ppq)
    return math.floor(seconds * bpm / 60 * ppq + 0.5)


def ticks_to_seconds(ticks: int, bpm: float, ppq: int = TICKS_PER_QUARTER) -> float:
    """Convert MIDI ticks back to seconds."""
    if ticks < 0:
        raise ValueError(f"ticks must be non-negative, got {ticks}")
    _check_bpm(bpm)
    _check_ppq(ppq)
    return ticks / ppq * 60 / bpm


def bpm_to_midi_tempo(bpm: float) -> int:
    """Microseconds per quarter note, as stored in a MIDI set_tempo event."""
    _check_bpm(bpm)
    return math.floor(MICROSECONDS_PER_MINUTE / bpm + 0.5)
