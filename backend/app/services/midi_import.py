"""Pure conversion of a Standard MIDI File into a project.

All `mido` usage is confined to `read_smf`: `mido` ships without type hints, so its objects
are `Any` there and only typed `RawEvent` values leave it. The rest of the module works on
`RawEvent` sequences and is tested without `mido`.
"""

import io
import math
import struct
from collections.abc import Sequence
from dataclasses import dataclass
from typing import Any, Final, Literal, get_args

import mido
from mido.midifiles.meta import KeySignatureError

from app.models.midi_import import (
    ImportErrorCode,
    ImportWarningCode,
    MidiImportResult,
    MidiImportWarning,
)
from app.models.project import (
    MAX_BPM,
    MAX_NUMERATOR,
    MAX_PITCH,
    MIN_BPM,
    MIN_NOTE_DURATION,
    MIN_NUMERATOR,
    MIN_PEDAL_DURATION,
    MIN_PITCH,
    Note,
    PedalEvent,
    PedalType,
    Project,
    TimeSignature,
)
from app.services.midi_export import PEDAL_CONTROLLERS
from app.services.timing import (
    TempoMap,
    build_tempo_map,
    midi_tempo_to_bpm,
    tempo_map_seconds,
)

MAX_IMPORTED_NOTES: Final = 20_000
PEDAL_DOWN_THRESHOLD: Final = 64  # CC value >= 64 means pressed (MIDI spec for switch pedals)
PERCUSSION_CHANNEL: Final = 9  # GM channel 10, zero-based
SECONDS_DECIMALS: Final = 6  # rounding of imported seconds (1 µs)
BPM_DECIMALS: Final = 2
CONTROLLER_PEDALS: Final[dict[int, PedalType]] = {v: k for k, v in PEDAL_CONTROLLERS.items()}
SUPPORTED_DENOMINATORS: Final = (1, 2, 4, 8, 16, 32)
PEDAL_TYPE_ORDER: Final[dict[PedalType, int]] = {"sustain": 0, "sostenuto": 1, "soft": 2}
WARNING_ORDER: Final[dict[str, int]] = {
    code: index for index, code in enumerate(get_args(ImportWarningCode))
}

# Exceptions `mido` raises for malformed files (checked against mido 1.3).
MIDO_READ_ERRORS: Final = (
    OSError,
    EOFError,
    ValueError,
    KeyError,
    IndexError,
    TypeError,
    struct.error,
    KeySignatureError,
)

RawKind = Literal["note_on", "note_off", "control_change", "set_tempo", "time_signature"]


@dataclass(frozen=True, slots=True)
class RawEvent:
    tick: int  # absolute tick
    kind: RawKind
    channel: int = 0  # 0–15 for channel messages
    number: int = 0  # note / controller / tempo (µs per quarter) / time signature numerator
    value: int = 0  # velocity / controller value / time signature denominator


@dataclass(frozen=True, slots=True)
class SmfContents:
    format: int
    ppq: int
    events: list[RawEvent]  # all tracks merged, sorted by (tick, track index, index in track)
    end_tick: int  # the largest absolute tick of any message (end_of_track included)


@dataclass(frozen=True, slots=True)
class NoteSpan:
    pitch: int
    on: int
    off: int
    velocity: int


@dataclass(frozen=True, slots=True)
class PedalSpan:
    type: PedalType
    on: int
    off: int


@dataclass(frozen=True, slots=True)
class NotePairing:
    spans: list[NoteSpan]
    out_of_range: int
    percussion: int
    unclosed: int


@dataclass(frozen=True, slots=True)
class PedalPairing:
    spans: list[PedalSpan]
    unclosed: int


class MidiImportError(Exception):
    """A file that cannot be imported; `message` is shown to the user as is."""

    def __init__(self, code: ImportErrorCode, message: str) -> None:
        super().__init__(message)
        self.code: ImportErrorCode = code
        self.message = message


def _warning(code: ImportWarningCode, message: str, count: int) -> MidiImportWarning:
    return MidiImportWarning(code=code, message=message, count=count)


def _invalid_file() -> MidiImportError:
    return MidiImportError("invalid_file", "The file is not a valid MIDI file.")


def _to_raw_event(tick: int, message: Any) -> RawEvent | None:
    kind = str(message.type)
    if kind == "note_on":
        return RawEvent(
            tick, "note_on", int(message.channel), int(message.note), int(message.velocity)
        )
    if kind == "note_off":
        return RawEvent(
            tick, "note_off", int(message.channel), int(message.note), int(message.velocity)
        )
    if kind == "control_change":
        return RawEvent(
            tick, "control_change", int(message.channel), int(message.control), int(message.value)
        )
    if kind == "set_tempo":
        return RawEvent(tick, "set_tempo", number=int(message.tempo))
    if kind == "time_signature":
        return RawEvent(
            tick, "time_signature", number=int(message.numerator), value=int(message.denominator)
        )
    return None


def read_smf(data: bytes) -> SmfContents:
    """Parse SMF bytes (format 0 or 1, ticks per quarter) into merged typed events."""
    if data == b"":
        raise MidiImportError("empty_file", "The file is empty.")
    try:
        midi_file = mido.MidiFile(file=io.BytesIO(data), clip=False)
    except MIDO_READ_ERRORS as error:
        raise _invalid_file() from error

    file_format = int(midi_file.type)
    if file_format == 2:
        raise MidiImportError(
            "unsupported_format", "MIDI format 2 is not supported; save the file as format 0 or 1."
        )
    if file_format not in (0, 1):
        raise _invalid_file()
    ppq = int(midi_file.ticks_per_beat)
    if ppq < 0:
        raise MidiImportError(
            "unsupported_division", "MIDI files with SMPTE time division are not supported."
        )
    if ppq == 0:
        raise _invalid_file()

    keyed: list[tuple[int, int, int, RawEvent]] = []
    end_tick = 0
    for track_index, track in enumerate(midi_file.tracks):
        tick = 0
        for message_index, message in enumerate(track):
            tick += int(message.time)
            end_tick = max(end_tick, tick)
            event = _to_raw_event(tick, message)
            if event is not None:
                keyed.append((tick, track_index, message_index, event))
    keyed.sort(key=lambda item: item[:3])
    return SmfContents(
        format=file_format, ppq=ppq, events=[item[3] for item in keyed], end_tick=end_tick
    )


def _is_note_off(event: RawEvent) -> bool:
    return event.kind == "note_off" or (event.kind == "note_on" and event.value == 0)


def pair_notes(events: Sequence[RawEvent], end_tick: int) -> NotePairing:
    """Pair note on/off events into spans.

    A repeated strike of a sounding key releases the previous note; a note-off of that key on
    the same tick right after the repeated strike belongs to the released note and is absorbed.
    """
    open_notes: dict[tuple[int, int], tuple[int, int]] = {}
    pending_release: dict[tuple[int, int], int] = {}
    spans: list[NoteSpan] = []
    out_of_range = 0
    percussion = 0

    for event in events:
        key = (event.channel, event.number)
        if event.kind == "note_on" and event.value > 0:
            if event.channel == PERCUSSION_CHANNEL:
                percussion += 1
                continue
            if not MIN_PITCH <= event.number <= MAX_PITCH:
                out_of_range += 1
                continue
            previous = open_notes.get(key)
            if previous is not None:
                on_tick, velocity = previous
                if on_tick != event.tick:
                    spans.append(NoteSpan(event.number, on_tick, event.tick, velocity))
                    pending_release[key] = event.tick
            open_notes[key] = (event.tick, event.value)
        elif _is_note_off(event):
            released_at = pending_release.pop(key, None)
            if released_at == event.tick:
                continue
            opened = open_notes.pop(key, None)
            if opened is not None:
                spans.append(NoteSpan(event.number, opened[0], event.tick, opened[1]))

    for (_channel, pitch), (on_tick, velocity) in open_notes.items():
        spans.append(NoteSpan(pitch, on_tick, end_tick, velocity))
    return NotePairing(spans, out_of_range, percussion, len(open_notes))


def pair_pedals(events: Sequence[RawEvent], end_tick: int) -> PedalPairing:
    """Pedal presses from CC64/66/67; one state per pedal type shared by all channels."""
    down_since: dict[PedalType, int] = {}
    spans: list[PedalSpan] = []
    for event in events:
        if event.kind != "control_change" or event.channel == PERCUSSION_CHANNEL:
            continue
        pedal_type = CONTROLLER_PEDALS.get(event.number)
        if pedal_type is None:
            continue
        pressed = event.value >= PEDAL_DOWN_THRESHOLD
        if pressed and pedal_type not in down_since:
            down_since[pedal_type] = event.tick
        elif not pressed and pedal_type in down_since:
            spans.append(PedalSpan(pedal_type, down_since.pop(pedal_type), event.tick))
    for pedal_type, on_tick in down_since.items():
        spans.append(PedalSpan(pedal_type, on_tick, end_tick))
    return PedalPairing(spans, len(down_since))


def resolve_tempo(
    events: Sequence[RawEvent], ppq: int
) -> tuple[float, TempoMap, list[MidiImportWarning]]:
    """Project BPM (the tempo at tick 0, clamped), the full tempo map and tempo warnings."""
    tempo_map = build_tempo_map(
        [(event.tick, event.number) for event in events if event.kind == "set_tempo"], ppq
    )
    start_tempo = tempo_map[0].tempo
    raw = math.inf if start_tempo == 0 else midi_tempo_to_bpm(start_tempo)
    bpm = round(float(min(max(raw, MIN_BPM), MAX_BPM)), BPM_DECIMALS)

    warnings: list[MidiImportWarning] = []
    changes = len(tempo_map) - 1
    if changes > 0:
        warnings.append(
            _warning(
                "tempo_changes",
                f"The file has {changes} tempo change(s). Notes keep their original timing; "
                f"the editor grid uses the starting tempo of {bpm} BPM.",
                changes,
            )
        )
    if start_tempo == 0:
        warnings.append(
            _warning(
                "tempo_out_of_range",
                f"The starting tempo in the file is invalid (0); the editor grid uses {bpm} BPM. "
                "Notes keep their original timing.",
                1,
            )
        )
    elif not MIN_BPM <= raw <= MAX_BPM:
        warnings.append(
            _warning(
                "tempo_out_of_range",
                f"The starting tempo of {raw:.2f} BPM is outside {MIN_BPM}–{MAX_BPM} BPM; "
                f"the editor grid uses {bpm} BPM. Notes keep their original timing.",
                1,
            )
        )
    return bpm, tempo_map, warnings


def _is_supported_time_signature(numerator: int, denominator: int) -> bool:
    return MIN_NUMERATOR <= numerator <= MAX_NUMERATOR and denominator in SUPPORTED_DENOMINATORS


def resolve_time_signature(
    events: Sequence[RawEvent],
) -> tuple[TimeSignature, list[MidiImportWarning]]:
    """The time signature at tick 0 (4/4 by default) and time signature warnings."""
    signatures = [
        (event.tick, event.number, event.value)
        for event in events
        if event.kind == "time_signature"
    ]
    current = (4, 4)
    for tick, numerator, denominator in signatures:
        if tick == 0:
            current = (numerator, denominator)

    warnings: list[MidiImportWarning] = []
    numerator, denominator = current
    if not _is_supported_time_signature(numerator, denominator):
        warnings.append(
            _warning(
                "time_signature_unsupported",
                f"Time signature {numerator}/{denominator} is not supported; 4/4 is used.",
                1,
            )
        )
        numerator, denominator = 4, 4
    time_signature = TimeSignature.model_validate(
        {"numerator": numerator, "denominator": denominator}
    )

    changes = 0
    previous = current
    for tick, later_numerator, later_denominator in signatures:
        if tick == 0:
            continue
        if (later_numerator, later_denominator) != previous:
            changes += 1
        previous = (later_numerator, later_denominator)
    if changes > 0:
        warnings.append(
            _warning(
                "time_signature_changes",
                f"The file changes the time signature {changes} time(s); "
                f"only the starting {numerator}/{denominator} is used.",
                changes,
            )
        )
    return time_signature, warnings


def _note_warnings(pairing: NotePairing, pedals_unclosed: int) -> list[MidiImportWarning]:
    warnings: list[MidiImportWarning] = []
    if pairing.out_of_range > 0:
        warnings.append(
            _warning(
                "notes_out_of_range",
                f"Skipped {pairing.out_of_range} note(s) outside the piano range A0–C8.",
                pairing.out_of_range,
            )
        )
    if pairing.percussion > 0:
        warnings.append(
            _warning(
                "percussion_skipped",
                f"Skipped {pairing.percussion} note(s) on the percussion channel 10.",
                pairing.percussion,
            )
        )
    if pairing.unclosed > 0:
        warnings.append(
            _warning(
                "unclosed_notes",
                f"{pairing.unclosed} note(s) had no note-off and end at the end of the file.",
                pairing.unclosed,
            )
        )
    if pedals_unclosed > 0:
        warnings.append(
            _warning(
                "unclosed_pedals",
                f"{pedals_unclosed} pedal press(es) had no release and end at the end of the file.",
                pedals_unclosed,
            )
        )
    return warnings


def build_import_result(contents: SmfContents) -> MidiImportResult:
    """Build a validated project and warnings from parsed SMF contents."""
    bpm, tempo_map, tempo_warnings = resolve_tempo(contents.events, contents.ppq)
    time_signature, signature_warnings = resolve_time_signature(contents.events)
    note_pairing = pair_notes(contents.events, contents.end_tick)
    pedal_pairing = pair_pedals(contents.events, contents.end_tick)

    note_count = len(note_pairing.spans)
    if note_count > MAX_IMPORTED_NOTES:
        raise MidiImportError(
            "too_many_notes",
            f"The file has {note_count} notes; at most {MAX_IMPORTED_NOTES} can be imported.",
        )

    def seconds(tick: int) -> float:
        return tempo_map_seconds(tick, tempo_map, contents.ppq)

    note_values: list[tuple[float, int, float, int]] = []
    for span in note_pairing.spans:
        start = round(seconds(span.on), SECONDS_DECIMALS)
        duration = max(
            MIN_NOTE_DURATION, round(seconds(span.off) - seconds(span.on), SECONDS_DECIMALS)
        )
        note_values.append((start, span.pitch, duration, span.velocity))
    note_values.sort()
    notes = [
        Note(id=f"n{index}", pitch=pitch, start=start, duration=duration, velocity=velocity)
        for index, (start, pitch, duration, velocity) in enumerate(note_values, start=1)
    ]

    pedal_values: list[tuple[float, int, PedalType, float]] = []
    short_pedals = 0
    for pedal_span in pedal_pairing.spans:
        start = round(seconds(pedal_span.on), SECONDS_DECIMALS)
        end = round(seconds(pedal_span.off), SECONDS_DECIMALS)
        if end < start + MIN_PEDAL_DURATION:
            short_pedals += 1
            continue
        pedal_values.append((start, PEDAL_TYPE_ORDER[pedal_span.type], pedal_span.type, end))
    pedal_values.sort()
    pedals = [
        PedalEvent(id=f"p{index}", type=pedal_type, start=start, end=end)
        for index, (start, _order, pedal_type, end) in enumerate(pedal_values, start=1)
    ]

    project = Project(bpm=bpm, time_signature=time_signature, notes=notes, pedals=pedals)

    warnings = [
        *_note_warnings(note_pairing, pedal_pairing.unclosed),
        *tempo_warnings,
        *signature_warnings,
    ]
    if short_pedals > 0:
        warnings.append(
            _warning(
                "short_pedals",
                f"Skipped {short_pedals} pedal press(es) shorter than 1 ms.",
                short_pedals,
            )
        )
    if not notes:
        warnings.append(_warning("no_notes", "The file contains no notes.", 0))
    warnings.sort(key=lambda warning: WARNING_ORDER[warning.code])
    return MidiImportResult(project=project, warnings=warnings)


def import_midi(data: bytes) -> MidiImportResult:
    """Parse SMF bytes into a project; raises `MidiImportError` for unsupported files."""
    return build_import_result(read_smf(data))
