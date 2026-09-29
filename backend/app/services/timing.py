"""Pure conversions between timeline seconds and MIDI ticks/tempo."""

import bisect
import math
from collections.abc import Sequence
from dataclasses import dataclass
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


DEFAULT_MIDI_TEMPO: Final = 500_000  # 120 BPM, the SMF default before the first set_tempo


@dataclass(frozen=True, slots=True)
class TempoPoint:
    tick: int
    tempo: int  # microseconds per quarter note, >= 0
    seconds: float  # time of `tick` on the timeline


TempoMap = tuple[TempoPoint, ...]


def build_tempo_map(changes: Sequence[tuple[int, int]], ppq: int = TICKS_PER_QUARTER) -> TempoMap:
    """Tempo points from `(tick, tempo)` changes in file order.

    The map always starts at tick 0 with the SMF default tempo; of several changes on one tick
    the last one wins, and a change to the tempo already in effect adds no point.
    """
    _check_ppq(ppq)
    for tick, tempo in changes:
        if tick < 0:
            raise ValueError(f"tempo change tick must be non-negative, got {tick}")
        if tempo < 0:
            raise ValueError(f"tempo must be non-negative, got {tempo}")
    by_tick: dict[int, int] = {}
    for tick, tempo in sorted(changes, key=lambda change: change[0]):
        by_tick[tick] = tempo
    by_tick.setdefault(0, DEFAULT_MIDI_TEMPO)

    points: list[TempoPoint] = []
    for tick in sorted(by_tick):
        tempo = by_tick[tick]
        if not points:
            points.append(TempoPoint(tick, tempo, 0.0))
            continue
        previous = points[-1]
        if tempo == previous.tempo:
            continue
        seconds = previous.seconds + (tick - previous.tick) * previous.tempo / 1e6 / ppq
        points.append(TempoPoint(tick, tempo, seconds))
    return tuple(points)


def tempo_map_seconds(tick: int, tempo_map: TempoMap, ppq: int = TICKS_PER_QUARTER) -> float:
    """Seconds of an absolute tick under a tempo map built by `build_tempo_map`."""
    if tick < 0:
        raise ValueError(f"ticks must be non-negative, got {tick}")
    _check_ppq(ppq)
    index = bisect.bisect_right(tempo_map, tick, key=lambda point: point.tick) - 1
    point = tempo_map[index]
    return point.seconds + (tick - point.tick) * point.tempo / 1e6 / ppq


def midi_tempo_to_bpm(tempo: int) -> float:
    """Quarter notes per minute for a set_tempo value (microseconds per quarter)."""
    if tempo <= 0:
        raise ValueError(f"tempo must be positive, got {tempo}")
    return MICROSECONDS_PER_MINUTE / tempo
