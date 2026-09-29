import random

from app.models.project import Note, PedalEvent, PedalType
from app.services.midi_export import (
    EventOrder,
    MidiEvent,
    note_events,
    pedal_events,
    sort_events,
)


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
