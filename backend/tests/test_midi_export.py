import random
import struct
from pathlib import Path
from typing import Literal

import pytest

from app.models.project import Note, PedalEvent, PedalType, Project, TimeSignature
from app.services.midi_export import (
    EventOrder,
    MidiEvent,
    build_midi_file,
    export_midi,
    note_events,
    pedal_events,
    sort_events,
)
from app.services.timing import TICKS_PER_QUARTER, bpm_to_midi_tempo, ticks_to_seconds
from tests.midi_readback import read_midi

FIXTURE = Path(__file__).parent / "fixtures" / "sample_project.json"


def note(note_id: str, pitch: int, start: float, duration: float, velocity: int = 100) -> Note:
    return Note(id=note_id, pitch=pitch, start=start, duration=duration, velocity=velocity)


def pedal(pedal_id: str, pedal_type: PedalType, start: float, end: float) -> PedalEvent:
    return PedalEvent(id=pedal_id, type=pedal_type, start=start, end=end)


def simple(events: list[MidiEvent]) -> list[tuple[int, str, int, int]]:
    return [(event.tick, event.kind, event.number, event.value) for event in events]


def test_note_events_converts_seconds_to_ticks() -> None:
    events = note_events([note("a", 60, 0.5, 1.125, 64)], 120)

    assert simple(events) == [(480, "note_on", 60, 64), (1560, "note_off", 60, 64)]
    assert [event.order for event in events] == [EventOrder.NOTE_ON, EventOrder.NOTE_OFF]


def test_same_beats_at_another_tempo_give_the_same_ticks() -> None:
    fast_notes = simple(note_events([note("a", 60, 0.5, 1.125, 64)], 120))
    slow_notes = simple(note_events([note("a", 60, 1.0, 2.25, 64)], 60))
    assert fast_notes == slow_notes == [(480, "note_on", 60, 64), (1560, "note_off", 60, 64)]

    fast_pedals = simple(pedal_events([pedal("p", "sustain", 0.5, 1.5)], 120))
    slow_pedals = simple(pedal_events([pedal("p", "sustain", 1.0, 3.0)], 60))
    assert fast_pedals == slow_pedals


def test_note_lasts_at_least_one_tick() -> None:
    events = note_events([note("a", 60, 0, 0.001)], 20)

    assert simple(events) == [(0, "note_on", 60, 100), (1, "note_off", 60, 64)]


def test_overlapping_same_pitch_notes_release_the_previous_one() -> None:
    events = note_events([note("a", 60, 0, 1), note("b", 60, 0.5, 0.5)], 120)

    assert simple(events) == [
        (0, "note_on", 60, 100),
        (480, "note_off", 60, 64),
        (480, "note_on", 60, 100),
        (960, "note_off", 60, 64),
    ]


def test_same_start_keeps_the_longer_note() -> None:
    events = note_events([note("a", 60, 0, 0.5, 80), note("b", 60, 0, 1, 100)], 120)

    assert simple(events) == [(0, "note_on", 60, 100), (960, "note_off", 60, 64)]


def test_same_start_and_duration_keeps_the_louder_note() -> None:
    events = note_events([note("a", 60, 0, 1, 90), note("b", 60, 0, 1, 100)], 120)

    assert simple(events) == [(0, "note_on", 60, 100), (960, "note_off", 60, 64)]


def test_identical_notes_keep_x_over_y_by_id() -> None:
    # Only the ids differ, so exactly one note survives regardless of the input order.
    forward = note_events([note("x", 60, 0, 1), note("y", 60, 0, 1)], 120)
    backward = note_events([note("y", 60, 0, 1), note("x", 60, 0, 1)], 120)

    assert forward == backward
    assert simple(forward) == [(0, "note_on", 60, 100), (960, "note_off", 60, 64)]


def test_different_pitches_are_not_trimmed() -> None:
    events = note_events([note("a", 60, 0, 1), note("b", 64, 0.5, 0.5)], 120)

    assert (960, "note_off", 60, 64) in simple(events)
    assert (480, "note_off", 60, 64) not in simple(events)


def test_trimming_after_the_minimum_tick_rule() -> None:
    events = note_events([note("a", 60, 0, 0.001), note("b", 60, 0.004, 0.996)], 20)

    assert simple(events) == [
        (0, "note_on", 60, 100),
        (1, "note_off", 60, 64),
        (1, "note_on", 60, 100),
        (160, "note_off", 60, 64),
    ]


def test_note_that_rounds_onto_the_same_start_is_merged() -> None:
    events = note_events([note("a", 60, 0, 0.001), note("b", 60, 0.002, 0.998)], 20)

    assert simple(events) == [(0, "note_on", 60, 100), (160, "note_off", 60, 64)]


def test_note_events_do_not_mutate_input() -> None:
    notes = [note("a", 60, 0, 1), note("b", 60, 0.5, 0.5), note("c", 60, 0.5, 0.25)]
    before = [item.model_copy(deep=True) for item in notes]

    note_events(notes, 120)

    assert notes == before


def test_pedal_events_sustain() -> None:
    events = pedal_events([pedal("p", "sustain", 0, 1.5)], 120)

    assert simple(events) == [(0, "control_change", 64, 127), (1440, "control_change", 64, 0)]
    assert [event.order for event in events] == [EventOrder.PEDAL_DOWN, EventOrder.PEDAL_UP]


def test_pedal_events_sostenuto_and_soft_controllers() -> None:
    sostenuto = pedal_events([pedal("p", "sostenuto", 0, 1.5)], 120)
    soft = pedal_events([pedal("p", "soft", 0, 1.5)], 120)

    assert simple(sostenuto) == [(0, "control_change", 66, 127), (1440, "control_change", 66, 0)]
    assert sostenuto[0].order == EventOrder.SOSTENUTO_DOWN
    assert simple(soft) == [(0, "control_change", 67, 127), (1440, "control_change", 67, 0)]
    assert soft[0].order == EventOrder.PEDAL_DOWN


def test_touching_pedals_release_before_press() -> None:
    events = sort_events(
        pedal_events([pedal("a", "sustain", 0, 1), pedal("b", "sustain", 1, 2)], 120)
    )

    assert simple(events) == [
        (0, "control_change", 64, 127),
        (960, "control_change", 64, 0),
        (960, "control_change", 64, 127),
        (1920, "control_change", 64, 0),
    ]


def test_short_pedal_merges_into_the_next_one() -> None:
    events = pedal_events([pedal("a", "sustain", 0, 0.001), pedal("b", "sustain", 0.001, 1)], 20)

    assert simple(events) == [(0, "control_change", 64, 127), (160, "control_change", 64, 0)]


def test_pedal_lasts_at_least_one_tick() -> None:
    events = pedal_events([PedalEvent(id="p", type="sustain", start=0, end=0.001)], 20)

    assert simple(events) == [(0, "control_change", 64, 127), (1, "control_change", 64, 0)]


def _same_tick_events() -> list[MidiEvent]:
    notes = [note("a", 60, 0, 0.5), note("b", 60, 0.5, 0.5), note("c", 64, 0.5, 0.5)]
    pedals = [
        pedal("s1", "sustain", 0, 0.5),
        pedal("s2", "sustain", 0.5, 1.5),
        pedal("t1", "sostenuto", 0.5, 1),
    ]
    return [*note_events(notes, 120), *pedal_events(pedals, 120)]


def test_sort_events_order_on_one_tick() -> None:
    events = sort_events(_same_tick_events())

    assert [item[1:] for item in simple(events) if item[0] == 480] == [
        ("control_change", 64, 0),
        ("control_change", 64, 127),
        ("note_off", 60, 64),
        ("note_on", 60, 100),
        ("note_on", 64, 100),
        ("control_change", 66, 127),
    ]


def test_sort_events_is_deterministic() -> None:
    events = _same_tick_events()
    shuffled = list(events)
    random.Random(0).shuffle(shuffled)

    assert sort_events(shuffled) == sort_events(events)


def sample_project() -> Project:
    return Project.model_validate_json(FIXTURE.read_text())


def test_fixture_reads_back() -> None:
    read = read_midi(export_midi(sample_project()))

    assert read.type == 1
    assert read.ticks_per_beat == 480
    assert read.track_names == ["MIDI Redactor", "Piano"]
    assert read.tempos == [(0, 500000)]
    assert read.time_signatures == [(0, 3, 4)]
    assert read.programs == [(0, 0, 0)]
    assert read.notes == [(21, 0, 240, 64), (60, 480, 1560, 100), (108, 1680, 2040, 127)]
    assert read.controls == [
        (0, 64, 127),
        (480, 66, 127),
        (1080, 67, 127),
        (1440, 64, 0),
        (1920, 67, 0),
        (2160, 66, 0),
    ]
    assert read.track_ends == [0, 2160]


def _random_project(bpm: float) -> Project:
    rng = random.Random(1)
    notes: list[Note] = []
    while len(notes) < 20:
        candidate = Note(
            id=f"n{len(notes)}",
            pitch=rng.randint(21, 108),
            start=rng.uniform(0, 30),
            duration=rng.uniform(0.05, 2),
            velocity=rng.randint(1, 127),
        )
        end = candidate.start + candidate.duration
        overlaps = any(
            other.pitch == candidate.pitch
            and candidate.start < other.start + other.duration
            and other.start < end
            for other in notes
        )
        if not overlaps:
            notes.append(candidate)
    pedal_types: list[PedalType] = ["sustain", "sostenuto", "soft"]
    pedals = []
    for index, pedal_type in enumerate(pedal_types):
        start = rng.uniform(0, 20)
        pedals.append(pedal(f"p{index}", pedal_type, start, start + rng.uniform(0.05, 10)))
    return Project(
        bpm=bpm,
        time_signature=TimeSignature(numerator=6, denominator=8),
        notes=notes,
        pedals=pedals,
    )


def test_round_trip_in_seconds() -> None:
    bpm = 97.5
    project = _random_project(bpm)
    half_tick = 60 / bpm / TICKS_PER_QUARTER / 2
    tolerance = half_tick + 1e-9

    read = read_midi(export_midi(project))

    assert read.tempos == [(0, bpm_to_midi_tempo(bpm))]
    assert read.time_signatures == [(0, 6, 8)]
    assert len(read.notes) == len(project.notes)
    expected_notes = sorted(project.notes, key=lambda item: (item.pitch, item.start))
    read_notes = sorted(read.notes)
    for expected, (pitch, on, off, velocity) in zip(expected_notes, read_notes, strict=True):
        assert pitch == expected.pitch
        assert velocity == expected.velocity
        assert abs(ticks_to_seconds(on, bpm) - expected.start) <= tolerance
        assert abs(ticks_to_seconds(off, bpm) - (expected.start + expected.duration)) <= tolerance

    for expected_pedal in project.pedals:
        controller = {"sustain": 64, "sostenuto": 66, "soft": 67}[expected_pedal.type]
        presses = [
            tick for tick, number, value in read.controls if (number, value) == (controller, 127)
        ]
        releases = [
            tick for tick, number, value in read.controls if (number, value) == (controller, 0)
        ]
        assert len(presses) == len(releases) == 1
        assert abs(ticks_to_seconds(presses[0], bpm) - expected_pedal.start) <= tolerance
        assert abs(ticks_to_seconds(releases[0], bpm) - expected_pedal.end) <= tolerance


@pytest.mark.parametrize(("bpm", "tempo"), [(60, 1000000), (90, 666667)])
def test_tempo_is_written(bpm: float, tempo: int) -> None:
    assert read_midi(export_midi(Project(bpm=bpm))).tempos == [(0, tempo)]


@pytest.mark.parametrize(("numerator", "denominator"), [(5, 16), (4, 1)])
def test_extreme_time_signatures_read_back(
    numerator: int, denominator: Literal[1, 2, 4, 8, 16, 32]
) -> None:
    project = Project(time_signature=TimeSignature(numerator=numerator, denominator=denominator))

    assert read_midi(export_midi(project)).time_signatures == [(0, numerator, denominator)]


def test_empty_project() -> None:
    read = read_midi(export_midi(Project()))

    assert read.notes == []
    assert read.controls == []
    assert read.track_names == ["MIDI Redactor", "Piano"]
    assert read.programs == [(0, 0, 0)]
    assert read.track_ends == [0, 0]


def test_extreme_pitches_and_velocities() -> None:
    project = Project(notes=[note("low", 21, 0, 0.5, 1), note("high", 108, 0, 0.5, 127)])

    assert read_midi(export_midi(project)).notes == [(21, 0, 480, 1), (108, 0, 480, 127)]


def test_each_track_ends_with_one_end_of_track() -> None:
    midi_file = build_midi_file(sample_project())

    assert len(midi_file.tracks) == 2
    for track in midi_file.tracks:
        kinds = [message.type for message in track]
        assert kinds.count("end_of_track") == 1
        assert kinds[-1] == "end_of_track"


def test_smf_structure_without_mido() -> None:
    data = export_midi(sample_project())

    assert data[:4] == b"MThd"
    header_length, file_format, track_count, division = struct.unpack(">IHHH", data[4:14])
    assert (header_length, file_format, track_count, division) == (6, 1, 2, 480)
    offset = 8 + header_length
    chunks = []
    while offset < len(data):
        chunk_type = data[offset : offset + 4]
        (length,) = struct.unpack(">I", data[offset + 4 : offset + 8])
        chunks.append((chunk_type, data[offset + 8 : offset + 8 + length]))
        offset += 8 + length
    assert offset == len(data)
    assert [chunk_type for chunk_type, _ in chunks] == [b"MTrk", b"MTrk"]
    assert all(body.endswith(b"\xff\x2f\x00") for _, body in chunks)


def test_export_is_deterministic() -> None:
    assert export_midi(sample_project()) == export_midi(sample_project())
