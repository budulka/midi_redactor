"""Pure conversion of a project into MIDI events and a Standard MIDI File.

All `mido` usage is confined to this module: `mido` ships without type hints,
so its objects are `Any` here and only typed values (`bytes`, `MidiEvent`) leave it.
"""

import io
from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from enum import IntEnum
from typing import Any, Final, Literal

import mido

from app.models.project import Note, PedalEvent, PedalType, Project
from app.services.timing import TICKS_PER_QUARTER, bpm_to_midi_tempo, seconds_to_ticks

PEDAL_CONTROLLERS: Final[dict[PedalType, int]] = {"sustain": 64, "sostenuto": 66, "soft": 67}
PEDAL_DOWN: Final = 127
PEDAL_UP: Final = 0
PIANO_CHANNEL: Final = 0
PIANO_PROGRAM: Final = 0
NOTE_OFF_VELOCITY: Final = 64
CONDUCTOR_TRACK_NAME: Final = "MIDI Redactor"
PIANO_TRACK_NAME: Final = "Piano"
MIDI_CLOCKS_PER_CLICK: Final = 24
NOTATED_32ND_NOTES_PER_BEAT: Final = 8

EventKind = Literal["note_on", "note_off", "control_change"]


class EventOrder(IntEnum):
    """Order of events that fall on the same tick."""

    PEDAL_UP = 0  # any pedal released
    PEDAL_DOWN = 1  # sustain or soft pressed
    NOTE_OFF = 2
    NOTE_ON = 3
    SOSTENUTO_DOWN = 4  # after note_on: sostenuto catches keys struck on the same tick


@dataclass(frozen=True, slots=True)
class MidiEvent:
    tick: int
    order: EventOrder
    kind: EventKind
    number: int  # note number or controller number
    value: int  # velocity or controller value


@dataclass(frozen=True, slots=True)
class TickSpan:
    on: int
    off: int


def _note_span(note: Note, bpm: float, ppq: int) -> TickSpan:
    on = seconds_to_ticks(note.start, bpm, ppq)
    off = max(on + 1, seconds_to_ticks(note.start + note.duration, bpm, ppq))
    return TickSpan(on, off)


def note_events(notes: Sequence[Note], bpm: float, ppq: int = TICKS_PER_QUARTER) -> list[MidiEvent]:
    """Note on/off events; a repeated strike of the same key releases the previous one."""
    by_pitch: dict[int, list[tuple[TickSpan, Note]]] = {}
    for note in notes:
        by_pitch.setdefault(note.pitch, []).append((_note_span(note, bpm, ppq), note))

    events: list[MidiEvent] = []
    for group in by_pitch.values():
        group.sort(key=lambda item: (item[0].on, -item[0].off, -item[1].velocity, item[1].id))
        kept: list[tuple[TickSpan, Note]] = []
        for span, note in group:
            if kept:
                prev_span, prev_note = kept[-1]
                if span.on == prev_span.on:
                    continue
                if prev_span.off > span.on:
                    kept[-1] = (TickSpan(prev_span.on, span.on), prev_note)
            kept.append((span, note))
        for span, note in kept:
            events.append(
                MidiEvent(span.on, EventOrder.NOTE_ON, "note_on", note.pitch, note.velocity)
            )
            events.append(
                MidiEvent(span.off, EventOrder.NOTE_OFF, "note_off", note.pitch, NOTE_OFF_VELOCITY)
            )
    return sort_events(events)


def _pedal_span(pedal: PedalEvent, bpm: float, ppq: int) -> TickSpan:
    on = seconds_to_ticks(pedal.start, bpm, ppq)
    off = seconds_to_ticks(pedal.end, bpm, ppq)
    if off <= on:
        off = on + 1
    return TickSpan(on, off)


def pedal_events(
    pedals: Sequence[PedalEvent], bpm: float, ppq: int = TICKS_PER_QUARTER
) -> list[MidiEvent]:
    """Control change events for pedal presses (127) and releases (0)."""
    by_type: dict[PedalType, list[tuple[TickSpan, PedalEvent]]] = {}
    for pedal in pedals:
        by_type.setdefault(pedal.type, []).append((_pedal_span(pedal, bpm, ppq), pedal))

    events: list[MidiEvent] = []
    for pedal_type, group in by_type.items():
        group.sort(key=lambda item: (item[0].on, item[0].off, item[1].id))
        kept: list[TickSpan] = []
        for span, _pedal in group:
            if kept and kept[-1].off > span.on:
                # Pedals of one type never overlap in seconds, so this only happens when a
                # sub-tick pedal was stretched to 1 tick; trimmed, it is empty and dropped.
                kept[-1] = TickSpan(kept[-1].on, span.on)
                if kept[-1].off <= kept[-1].on:
                    kept.pop()
            kept.append(span)
        controller = PEDAL_CONTROLLERS[pedal_type]
        down_order = (
            EventOrder.SOSTENUTO_DOWN if pedal_type == "sostenuto" else EventOrder.PEDAL_DOWN
        )
        for span in kept:
            events.append(MidiEvent(span.on, down_order, "control_change", controller, PEDAL_DOWN))
            events.append(
                MidiEvent(span.off, EventOrder.PEDAL_UP, "control_change", controller, PEDAL_UP)
            )
    return sort_events(events)


def sort_events(events: Iterable[MidiEvent]) -> list[MidiEvent]:
    """Deterministic file order: by tick, then by same-tick order, then by number."""
    return sorted(events, key=lambda event: (event.tick, event.order, event.number))


def _to_message(event: MidiEvent, delta: int) -> Any:
    if event.kind == "control_change":
        return mido.Message(
            "control_change",
            channel=PIANO_CHANNEL,
            control=event.number,
            value=event.value,
            time=delta,
        )
    return mido.Message(
        event.kind,
        channel=PIANO_CHANNEL,
        note=event.number,
        velocity=event.value,
        time=delta,
    )


def build_midi_file(project: Project, ppq: int = TICKS_PER_QUARTER) -> Any:
    """Build a format 1 `mido.MidiFile`: a conductor track and a piano track."""
    midi_file = mido.MidiFile(type=1, ticks_per_beat=ppq)

    conductor = mido.MidiTrack()
    conductor.append(mido.MetaMessage("track_name", name=CONDUCTOR_TRACK_NAME, time=0))
    conductor.append(mido.MetaMessage("set_tempo", tempo=bpm_to_midi_tempo(project.bpm), time=0))
    conductor.append(
        mido.MetaMessage(
            "time_signature",
            numerator=project.time_signature.numerator,
            denominator=project.time_signature.denominator,
            clocks_per_click=MIDI_CLOCKS_PER_CLICK,
            notated_32nd_notes_per_beat=NOTATED_32ND_NOTES_PER_BEAT,
            time=0,
        )
    )
    conductor.append(mido.MetaMessage("end_of_track", time=0))
    midi_file.tracks.append(conductor)

    piano = mido.MidiTrack()
    piano.append(mido.MetaMessage("track_name", name=PIANO_TRACK_NAME, time=0))
    piano.append(
        mido.Message("program_change", channel=PIANO_CHANNEL, program=PIANO_PROGRAM, time=0)
    )
    events = sort_events(
        [
            *note_events(project.notes, project.bpm, ppq),
            *pedal_events(project.pedals, project.bpm, ppq),
        ]
    )
    previous_tick = 0
    for event in events:
        piano.append(_to_message(event, event.tick - previous_tick))
        previous_tick = event.tick
    piano.append(mido.MetaMessage("end_of_track", time=0))
    midi_file.tracks.append(piano)
    return midi_file


def export_midi(project: Project) -> bytes:
    """Serialize the project as Standard MIDI File bytes."""
    buffer = io.BytesIO()
    build_midi_file(project).save(file=buffer)
    return buffer.getvalue()
