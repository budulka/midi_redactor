from app.models.midi_import import MidiImportWarning
from app.models.project import TimeSignature
from app.services.midi_import import (
    NoteSpan,
    PedalSpan,
    RawEvent,
    pair_notes,
    pair_pedals,
    resolve_tempo,
    resolve_time_signature,
)


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
