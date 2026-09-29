import random
import struct
from pathlib import Path
from typing import Any

import mido
import pytest

from app.models.midi_import import MidiImportResult, MidiImportWarning
from app.models.project import Denominator, Note, PedalEvent, PedalType, Project, TimeSignature
from app.services import midi_import
from app.services.midi_export import export_midi
from app.services.midi_import import (
    MidiImportError,
    NoteSpan,
    PedalSpan,
    RawEvent,
    import_midi,
    pair_notes,
    pair_pedals,
    resolve_tempo,
    resolve_time_signature,
)
from app.services.timing import TICKS_PER_QUARTER
from tests.midi_builder import END_OF_TRACK, build_smf, raw_smf


def on(tick: int, pitch: int, vel: int = 100, ch: int = 0) -> RawEvent:
    return RawEvent(tick, "note_on", ch, pitch, vel)


def off(tick: int, pitch: int, ch: int = 0) -> RawEvent:
    return RawEvent(tick, "note_off", ch, pitch, 64)


def cc(tick: int, ctrl: int, value: int, ch: int = 0) -> RawEvent:
    return RawEvent(tick, "control_change", ch, ctrl, value)


def tempo(tick: int, value: int) -> RawEvent:
    return RawEvent(tick, "set_tempo", number=value)


def ts(tick: int, numerator: int, denominator: int) -> RawEvent:
    return RawEvent(tick, "time_signature", number=numerator, value=denominator)


def spans(events: list[RawEvent], end_tick: int = 0) -> list[tuple[int, int, int, int]]:
    return [
        (span.pitch, span.on, span.off, span.velocity)
        for span in pair_notes(events, end_tick).spans
    ]


def pedal_spans(events: list[RawEvent], end_tick: int = 0) -> list[tuple[str, int, int]]:
    return [(span.type, span.on, span.off) for span in pair_pedals(events, end_tick).spans]


# --- notes ---


def test_plain_note() -> None:
    pairing = pair_notes([on(0, 60), off(480, 60)], 480)

    assert pairing.spans == [NoteSpan(60, 0, 480, 100)]
    assert (pairing.out_of_range, pairing.percussion, pairing.unclosed) == (0, 0, 0)


def test_note_on_with_zero_velocity_is_note_off() -> None:
    assert spans([on(0, 60, 90), on(960, 60, vel=0)]) == [(60, 0, 960, 90)]


def test_repeated_strike_releases_previous_note() -> None:
    events = [on(0, 60, 80), on(480, 60, 90), off(960, 60), off(1440, 60)]

    assert spans(events) == [(60, 0, 480, 80), (60, 480, 960, 90)]


def test_repeated_strike_before_note_off_on_same_tick() -> None:
    events = [on(0, 60, 80), on(480, 60, 90), off(480, 60), off(960, 60)]

    assert spans(events) == [(60, 0, 480, 80), (60, 480, 960, 90)]


def test_repeated_strike_before_zero_velocity_note_on_on_same_tick() -> None:
    events = [on(0, 60, 80), on(480, 60, 90), on(480, 60, vel=0), off(960, 60)]

    assert spans(events) == [(60, 0, 480, 80), (60, 480, 960, 90)]


def test_only_one_note_off_is_absorbed() -> None:
    events = [on(0, 60), on(480, 60), off(480, 60), off(480, 60)]

    assert spans(events) == [(60, 0, 480, 100), (60, 480, 480, 100)]


def test_stale_pending_release_does_not_absorb() -> None:
    events = [on(0, 60), on(480, 60), off(960, 60), off(1440, 60)]

    assert spans(events) == [(60, 0, 480, 100), (60, 480, 960, 100)]


def test_other_key_is_not_absorbed() -> None:
    events = [on(0, 60), on(480, 60), off(480, 64), off(960, 60)]

    assert spans(events) == [(60, 0, 480, 100), (60, 480, 960, 100)]


def test_other_channel_is_not_absorbed() -> None:
    events = [on(0, 60), on(480, 60), off(480, 60, ch=1), off(960, 60)]

    assert spans(events) == [(60, 0, 480, 100), (60, 480, 960, 100)]


def test_duplicate_strike_on_same_tick_keeps_the_new_one() -> None:
    events = [on(0, 60, 80), on(0, 60, 100), off(480, 60)]

    assert spans(events) == [(60, 0, 480, 100)]


def test_same_pitch_on_different_channels_overlaps() -> None:
    events = [on(0, 60, ch=0), on(240, 60, ch=1), off(480, 60, ch=0), off(960, 60, ch=1)]

    assert sorted(spans(events)) == [(60, 0, 480, 100), (60, 240, 960, 100)]


def test_note_off_without_note_on_is_ignored() -> None:
    assert spans([off(100, 60)]) == []


def test_unclosed_note_ends_at_end_tick() -> None:
    pairing = pair_notes([on(0, 60)], 1920)

    assert pairing.spans == [NoteSpan(60, 0, 1920, 100)]
    assert pairing.unclosed == 1


def test_zero_length_note() -> None:
    assert spans([on(0, 60), off(0, 60)]) == [(60, 0, 0, 100)]


def test_notes_out_of_range_are_skipped() -> None:
    events = []
    for pitch in (20, 21, 108, 109):
        events += [on(0, pitch), off(480, pitch)]

    pairing = pair_notes(events, 480)

    assert sorted(span.pitch for span in pairing.spans) == [21, 108]
    assert pairing.out_of_range == 2


def test_percussion_channel_is_skipped() -> None:
    events = [on(0, 36, ch=9), off(480, 36, ch=9), on(0, 60), off(480, 60)]

    pairing = pair_notes(events, 480)

    assert [span.pitch for span in pairing.spans] == [60]
    assert pairing.percussion == 1


# --- pedals ---


def test_pedals_on_percussion_channel_are_ignored() -> None:
    assert pedal_spans([cc(0, 64, 127, ch=9), cc(480, 64, 0, ch=9)]) == []


def test_pedal_types() -> None:
    assert pair_pedals([cc(0, 64, 127), cc(960, 64, 0)], 960).spans == [
        PedalSpan("sustain", 0, 960)
    ]
    assert pedal_spans([cc(0, 66, 127), cc(960, 66, 0)]) == [("sostenuto", 0, 960)]
    assert pedal_spans([cc(0, 67, 127), cc(960, 67, 0)]) == [("soft", 0, 960)]


def test_pedal_threshold() -> None:
    assert pedal_spans([cc(0, 64, 64), cc(480, 64, 63)]) == [("sustain", 0, 480)]
    assert pedal_spans([cc(0, 64, 63)]) == []


def test_half_pedal_values_and_repeats() -> None:
    events = [cc(0, 64, 70), cc(100, 64, 100), cc(200, 64, 127), cc(480, 64, 40), cc(500, 64, 10)]

    assert pedal_spans(events) == [("sustain", 0, 480)]


def test_repedaling_on_same_tick() -> None:
    events = [cc(0, 64, 127), cc(960, 64, 0), cc(960, 64, 127), cc(1920, 64, 0)]

    assert pedal_spans(events) == [("sustain", 0, 960), ("sustain", 960, 1920)]


def test_pedal_state_is_shared_by_channels() -> None:
    events = [cc(0, 64, 127, ch=0), cc(100, 64, 127, ch=1), cc(480, 64, 0, ch=1)]

    assert pedal_spans(events) == [("sustain", 0, 480)]


def test_unclosed_pedal_ends_at_end_tick() -> None:
    pairing = pair_pedals([cc(480, 64, 127)], 1920)

    assert pairing.spans == [PedalSpan("sustain", 480, 1920)]
    assert pairing.unclosed == 1


def test_other_controllers_are_ignored() -> None:
    assert pedal_spans([cc(0, 7, 100), cc(0, 1, 127)]) == []


def test_notes_are_not_pedals() -> None:
    assert pedal_spans([on(0, 64), off(480, 64)]) == []


# --- tempo ---


def warning_codes(warnings: list[MidiImportWarning]) -> list[str]:
    return [warning.code for warning in warnings]


def test_tempo_defaults_to_120() -> None:
    bpm, tempo_map, warnings = resolve_tempo([], 480)

    assert bpm == 120.0
    assert len(tempo_map) == 1
    assert warnings == []


def test_tempo_rounds_bpm() -> None:
    assert resolve_tempo([tempo(0, 666667)], 480)[0] == 90.0
    assert resolve_tempo([tempo(0, 615385)], 480)[0] == 97.5


def test_last_tempo_on_tick_zero_wins() -> None:
    bpm, _, warnings = resolve_tempo([tempo(0, 400000), tempo(0, 600000)], 480)

    assert bpm == 100.0
    assert warnings == []


def test_tempo_changes_warning() -> None:
    bpm, tempo_map, warnings = resolve_tempo([tempo(0, 500000), tempo(960, 1_000_000)], 480)

    assert bpm == 120.0
    assert len(tempo_map) == 2
    assert warning_codes(warnings) == ["tempo_changes"]
    assert warnings[0].count == 1
    assert "120.0 BPM" in warnings[0].message


def test_first_tempo_later_than_tick_zero() -> None:
    bpm, _, warnings = resolve_tempo([tempo(480, 1_000_000)], 480)

    assert bpm == 120.0
    assert warning_codes(warnings) == ["tempo_changes"]
    assert warnings[0].count == 1


def test_repeated_same_tempo_is_not_a_change() -> None:
    _, _, warnings = resolve_tempo([tempo(0, 500000), tempo(960, 500000)], 480)

    assert warnings == []


def test_slow_tempo_is_clamped() -> None:
    bpm, _, warnings = resolve_tempo([tempo(0, 4_000_000)], 480)

    assert bpm == 20.0
    assert warning_codes(warnings) == ["tempo_out_of_range"]
    assert "15.00 BPM" in warnings[0].message


def test_fast_tempo_is_clamped() -> None:
    bpm, _, warnings = resolve_tempo([tempo(0, 100_000)], 480)

    assert bpm == 300.0
    assert warning_codes(warnings) == ["tempo_out_of_range"]
    assert warnings[0].count == 1


def test_zero_tempo() -> None:
    bpm, _, warnings = resolve_tempo([tempo(0, 0)], 480)

    assert bpm == 300.0
    assert warning_codes(warnings) == ["tempo_out_of_range"]
    assert "invalid (0)" in warnings[0].message
    assert "300.0 BPM" in warnings[0].message


# --- time signature ---


def test_time_signature_defaults_to_four_four() -> None:
    signature, warnings = resolve_time_signature([])

    assert signature == TimeSignature(numerator=4, denominator=4)
    assert warnings == []


def test_time_signature_at_tick_zero() -> None:
    signature, warnings = resolve_time_signature([ts(0, 3, 4)])

    assert signature == TimeSignature(numerator=3, denominator=4)
    assert warnings == []


def test_last_time_signature_on_tick_zero_wins() -> None:
    signature, warnings = resolve_time_signature([ts(0, 4, 4), ts(0, 6, 8)])

    assert signature == TimeSignature(numerator=6, denominator=8)
    assert warnings == []


def test_time_signature_changes_warning() -> None:
    signature, warnings = resolve_time_signature([ts(0, 6, 8), ts(1920, 4, 4)])

    assert signature == TimeSignature(numerator=6, denominator=8)
    assert warning_codes(warnings) == ["time_signature_changes"]
    assert warnings[0].count == 1
    assert "6/8" in warnings[0].message


def test_repeated_time_signature_is_not_a_change() -> None:
    _, warnings = resolve_time_signature([ts(0, 6, 8), ts(1920, 6, 8)])

    assert warnings == []


def test_unsupported_time_signatures() -> None:
    for numerator, denominator in ((7, 64), (0, 4), (33, 4)):
        signature, warnings = resolve_time_signature([ts(0, numerator, denominator)])

        assert signature == TimeSignature(numerator=4, denominator=4)
        assert warning_codes(warnings) == ["time_signature_unsupported"]
        assert f"{numerator}/{denominator}" in warnings[0].message


# --- files ---

FIXTURE = Path(__file__).parent / "fixtures" / "sample_project.json"


def note_on(pitch: int, velocity: int = 100, channel: int = 0) -> Any:
    return mido.Message("note_on", note=pitch, velocity=velocity, channel=channel)


def note_off(pitch: int, channel: int = 0) -> Any:
    return mido.Message("note_off", note=pitch, velocity=64, channel=channel)


def control(number: int, value: int, channel: int = 0) -> Any:
    return mido.Message("control_change", control=number, value=value, channel=channel)


def set_tempo(value: int) -> Any:
    return mido.MetaMessage("set_tempo", tempo=value)


def time_signature(numerator: int, denominator: int) -> Any:
    return mido.MetaMessage("time_signature", numerator=numerator, denominator=denominator)


def note_tuples(result: MidiImportResult) -> list[tuple[str, int, float, float, int]]:
    return [(n.id, n.pitch, n.start, n.duration, n.velocity) for n in result.project.notes]


def codes(result: MidiImportResult) -> list[str]:
    return [warning.code for warning in result.warnings]


def test_format_0_file() -> None:
    data = build_smf(
        [
            [
                (0, set_tempo(500000)),
                (0, time_signature(3, 4)),
                (0, control(64, 127)),
                (0, note_on(60)),
                (480, note_off(60)),
                (960, control(64, 0)),
            ]
        ],
        type=0,
    )

    result = import_midi(data)

    assert result.project.bpm == 120.0
    assert result.project.time_signature == TimeSignature(numerator=3, denominator=4)
    assert note_tuples(result) == [("n1", 60, 0.0, 0.5, 100)]
    assert result.project.pedals == [PedalEvent(id="p1", type="sustain", start=0.0, end=1.0)]
    assert result.warnings == []


def test_format_1_file_with_several_tracks() -> None:
    data = build_smf(
        [
            [(0, set_tempo(500000))],
            [(0, note_on(72)), (480, note_off(72)), (480, note_on(76)), (960, note_off(76))],
            [
                (0, note_on(48, 90, channel=1)),
                (960, note_off(48, channel=1)),
                (0, control(64, 127, channel=1)),
                (960, control(64, 0, channel=1)),
            ],
        ]
    )

    result = import_midi(data)

    assert note_tuples(result) == [
        ("n1", 48, 0.0, 1.0, 90),
        ("n2", 72, 0.0, 0.5, 100),
        ("n3", 76, 0.5, 0.5, 100),
    ]
    assert [(p.id, p.type, p.start, p.end) for p in result.project.pedals] == [
        ("p1", "sustain", 0.0, 1.0)
    ]
    assert result.warnings == []


def test_tempo_in_a_later_track_is_used() -> None:
    data = build_smf([[], [(0, set_tempo(1_000_000)), (0, note_on(60)), (480, note_off(60))]])

    result = import_midi(data)

    assert result.project.bpm == 60.0
    assert note_tuples(result) == [("n1", 60, 0.0, 1.0, 100)]


def test_repeated_strike_with_note_off_in_a_later_track() -> None:
    data = build_smf(
        [
            [],
            [(0, note_on(60, 80)), (480, note_on(60, 90)), (960, note_off(60))],
            [(480, note_off(60))],
        ],
        ppq=960,
    )

    result = import_midi(data)

    assert note_tuples(result) == [("n1", 60, 0.0, 0.25, 80), ("n2", 60, 0.25, 0.25, 90)]
    assert result.warnings == []


def test_repeated_strike_before_note_off_in_one_track() -> None:
    data = build_smf(
        [[(0, note_on(60, 80)), (480, note_on(60, 90)), (480, note_off(60)), (960, note_off(60))]],
        type=0,
        ppq=960,
    )

    result = import_midi(data)

    assert note_tuples(result) == [("n1", 60, 0.0, 0.25, 80), ("n2", 60, 0.25, 0.25, 90)]
    assert result.warnings == []


def test_zero_tempo_does_not_break_import() -> None:
    data = build_smf(
        [
            [
                (0, set_tempo(0)),
                (960, set_tempo(500000)),
                (0, note_on(60)),
                (480, note_off(60)),
                (960, note_on(64)),
                (1440, note_off(64)),
                (0, control(64, 127)),
                (480, control(64, 0)),
            ]
        ],
        type=0,
    )

    result = import_midi(data)

    assert result.project.bpm == 300.0
    assert codes(result) == ["short_pedals", "tempo_changes", "tempo_out_of_range"]
    assert "invalid (0)" in result.warnings[2].message
    assert note_tuples(result) == [("n1", 60, 0.0, 0.001, 100), ("n2", 64, 0.0, 0.5, 100)]
    assert result.project.pedals == []


def test_several_tempos_keep_original_timing() -> None:
    data = build_smf(
        [
            [(0, set_tempo(500000)), (960, set_tempo(1_000_000))],
            [(1920, note_on(60)), (2400, note_off(60))],
        ]
    )

    result = import_midi(data)

    assert result.project.bpm == 120.0
    assert note_tuples(result) == [("n1", 60, 3.0, 1.0, 100)]
    assert codes(result) == ["tempo_changes"]
    assert "120.0 BPM" in result.warnings[0].message


def test_unclosed_note_and_pedal_end_at_end_of_track() -> None:
    data = build_smf([[(0, note_on(60)), (0, control(64, 127))]], type=0, end_ticks=[1920])

    result = import_midi(data)

    assert note_tuples(result) == [("n1", 60, 0.0, 2.0, 100)]
    assert result.project.pedals[0].end == 2.0
    assert codes(result) == ["unclosed_notes", "unclosed_pedals"]
    assert [warning.count for warning in result.warnings] == [1, 1]


def test_unclosed_note_at_end_tick_gets_minimum_duration() -> None:
    data = build_smf([[(960, note_on(60))]], type=0, end_ticks=[960])

    assert note_tuples(import_midi(data)) == [("n1", 60, 1.0, 0.001, 100)]


def test_zero_length_note_gets_minimum_duration() -> None:
    data = build_smf([[(480, note_on(60)), (480, note_off(60))]], type=0)

    assert note_tuples(import_midi(data)) == [("n1", 60, 0.5, 0.001, 100)]


def test_short_pedals_are_skipped() -> None:
    for end in (1, 0):
        data = build_smf(
            [[(0, note_on(60)), (0, control(64, 127)), (end, control(64, 0)), (960, note_off(60))]],
            type=0,
            ppq=960,
        )

        result = import_midi(data)

        assert result.project.pedals == []
        assert codes(result) == ["short_pedals"]
        assert result.warnings[0].count == 1


def test_out_of_range_and_percussion_warnings() -> None:
    data = build_smf(
        [
            [
                (0, note_on(20)),
                (480, note_off(20)),
                (0, note_on(109)),
                (480, note_off(109)),
                (0, note_on(36, channel=9)),
                (480, note_off(36, channel=9)),
                (0, note_on(60)),
                (480, note_off(60)),
            ]
        ],
        type=0,
    )

    result = import_midi(data)

    assert [note.pitch for note in result.project.notes] == [60]
    assert codes(result) == ["notes_out_of_range", "percussion_skipped"]
    assert result.warnings[0].count == 2
    assert "2" in result.warnings[0].message
    assert result.warnings[1].count == 1


def test_file_without_notes() -> None:
    result = import_midi(build_smf([[(0, set_tempo(500000))]], type=0))

    assert result.project.notes == []
    assert result.project.pedals == []
    assert codes(result) == ["no_notes"]
    assert result.warnings[0].count == 0


def test_warning_order_follows_the_code_declaration() -> None:
    data = build_smf(
        [
            [(0, set_tempo(500000)), (960, set_tempo(600000))],
            [(0, note_on(60)), (0, note_on(10)), (480, note_off(10))],
        ],
        end_ticks=[None, 1920],
    )

    assert codes(import_midi(data)) == ["notes_out_of_range", "unclosed_notes", "tempo_changes"]


def test_import_is_deterministic() -> None:
    data = export_midi(sample_project())

    assert import_midi(data) == import_midi(data)


def test_result_is_a_valid_project() -> None:
    result = import_midi(export_midi(sample_project()))

    assert MidiImportResult.model_validate(result.model_dump(by_alias=True)) == result


def test_note_limit(monkeypatch: pytest.MonkeyPatch) -> None:
    assert midi_import.MAX_IMPORTED_NOTES == 20_000
    monkeypatch.setattr(midi_import, "MAX_IMPORTED_NOTES", 3)

    def file_with(count: int) -> bytes:
        events: list[tuple[int, Any]] = []
        for index in range(count):
            events += [(0, note_on(60 + index)), (480, note_off(60 + index))]
        return build_smf([events], type=0)

    assert len(import_midi(file_with(3)).project.notes) == 3
    with pytest.raises(MidiImportError) as caught:
        import_midi(file_with(4))
    assert caught.value.code == "too_many_notes"
    assert "4" in caught.value.message


# --- errors ---


def valid_file() -> bytes:
    return export_midi(sample_project())


def track(body: bytes) -> bytes:
    return body + END_OF_TRACK


@pytest.mark.parametrize(
    ("data", "code"),
    [
        (b"", "empty_file"),
        (b"nope", "invalid_file"),
        (b"RIFF\x00\x00\x00\x00RMIDdata", "invalid_file"),
        (raw_smf(1, 480, [], tracks=1), "invalid_file"),
        (raw_smf(0, 480, [track(b"\x00\x90\x3c\xc8")]), "invalid_file"),
        (raw_smf(0, 480, [track(b"\x00\xf4")]), "invalid_file"),
        (raw_smf(0, 480, [track(b"\x00\xff\x51\x01\x07")]), "invalid_file"),
        (raw_smf(0, 480, [track(b"\x00\xff\x59\x02\x0f\x05")]), "invalid_file"),
        (raw_smf(5, 480, [END_OF_TRACK]), "invalid_file"),
        (raw_smf(1, -6360, [END_OF_TRACK]), "unsupported_division"),
        (raw_smf(1, 0, [END_OF_TRACK]), "invalid_file"),
    ],
)
def test_invalid_files(data: bytes, code: str) -> None:
    with pytest.raises(MidiImportError) as caught:
        import_midi(data)

    assert caught.value.code == code
    assert caught.value.message


def test_truncated_file_is_invalid() -> None:
    with pytest.raises(MidiImportError) as caught:
        import_midi(valid_file()[:-5])

    assert caught.value.code == "invalid_file"
    assert caught.value.message


def test_format_2_is_unsupported() -> None:
    with pytest.raises(MidiImportError) as caught:
        import_midi(build_smf([[(0, note_on(60)), (480, note_off(60))]], type=2))

    assert caught.value.code == "unsupported_format"
    assert "format 2" in caught.value.message


def test_smpte_division_constant() -> None:
    assert struct.unpack(">h", struct.pack(">H", 0xE728))[0] == -6360


# --- round trip ---


def sample_project() -> Project:
    return Project.model_validate_json(FIXTURE.read_text())


def test_fixture_round_trip_is_exact() -> None:
    project = sample_project()

    result = import_midi(export_midi(project))

    assert result.project == project
    assert result.warnings == []


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
        pedals.append(
            PedalEvent(
                id=f"p{index}", type=pedal_type, start=start, end=start + rng.uniform(0.05, 10)
            )
        )
    return Project(
        bpm=bpm,
        time_signature=TimeSignature(numerator=6, denominator=8),
        notes=notes,
        pedals=pedals,
    )


def test_random_project_round_trip() -> None:
    bpm = 97.5
    project = _random_project(bpm)
    tolerance = 60 / bpm / TICKS_PER_QUARTER / 2 + 5e-5

    result = import_midi(export_midi(project))

    imported = result.project
    assert imported.bpm == 97.5
    assert imported.time_signature == TimeSignature(numerator=6, denominator=8)
    assert result.warnings == []
    assert len(imported.notes) == len(project.notes)
    assert len(imported.pedals) == len(project.pedals)
    expected_notes = sorted(project.notes, key=lambda item: (item.start, item.pitch))
    for expected, actual in zip(expected_notes, imported.notes, strict=True):
        assert actual.pitch == expected.pitch
        assert actual.velocity == expected.velocity
        assert abs(actual.start - expected.start) <= tolerance
        assert (
            abs(actual.start + actual.duration - (expected.start + expected.duration)) <= tolerance
        )
    for expected_pedal in project.pedals:
        actual_pedal = next(p for p in imported.pedals if p.type == expected_pedal.type)
        assert abs(actual_pedal.start - expected_pedal.start) <= tolerance
        assert abs(actual_pedal.end - expected_pedal.end) <= tolerance


@pytest.mark.parametrize("bpm", [20, 60, 90, 120, 133.33, 300])
def test_bpm_round_trip(bpm: float) -> None:
    assert import_midi(export_midi(Project(bpm=bpm))).project.bpm == bpm


@pytest.mark.parametrize(("numerator", "denominator"), [(5, 16), (4, 1)])
def test_time_signature_round_trip(numerator: int, denominator: Denominator) -> None:
    project = Project(time_signature=TimeSignature(numerator=numerator, denominator=denominator))

    assert import_midi(export_midi(project)).project.time_signature == project.time_signature


def test_empty_project_round_trip() -> None:
    project = Project(bpm=90, time_signature=TimeSignature(numerator=3, denominator=4))

    result = import_midi(export_midi(project))

    assert result.project == project
    assert codes(result) == ["no_notes"]
