"""Test-only helper: read a Standard MIDI File back into plain typed values."""

import io
from dataclasses import dataclass, field

import mido


@dataclass(frozen=True)
class ReadBack:
    type: int
    ticks_per_beat: int
    track_names: list[str] = field(default_factory=list)
    tempos: list[tuple[int, int]] = field(default_factory=list)  # (abs tick, us per quarter)
    time_signatures: list[tuple[int, int, int]] = field(default_factory=list)  # (tick, num, den)
    programs: list[tuple[int, int, int]] = field(default_factory=list)  # (tick, channel, program)
    notes: list[tuple[int, int, int, int]] = field(default_factory=list)  # (pitch, on, off, vel)
    controls: list[tuple[int, int, int]] = field(default_factory=list)  # (tick, controller, value)
    track_ends: list[int] = field(default_factory=list)  # abs tick of end_of_track per track


def read_midi(data: bytes) -> ReadBack:
    midi_file = mido.MidiFile(file=io.BytesIO(data))
    result = ReadBack(type=int(midi_file.type), ticks_per_beat=int(midi_file.ticks_per_beat))
    for track in midi_file.tracks:
        tick = 0
        open_notes: dict[int, list[tuple[int, int]]] = {}
        for message in track:
            tick += int(message.time)
            kind = str(message.type)
            if kind == "track_name":
                result.track_names.append(str(message.name))
            elif kind == "set_tempo":
                result.tempos.append((tick, int(message.tempo)))
            elif kind == "time_signature":
                result.time_signatures.append(
                    (tick, int(message.numerator), int(message.denominator))
                )
            elif kind == "program_change":
                result.programs.append((tick, int(message.channel), int(message.program)))
            elif kind == "control_change":
                result.controls.append((tick, int(message.control), int(message.value)))
            elif kind == "note_on" and int(message.velocity) > 0:
                open_notes.setdefault(int(message.note), []).append((tick, int(message.velocity)))
            elif kind in ("note_on", "note_off"):
                on_tick, velocity = open_notes[int(message.note)].pop(0)
                result.notes.append((int(message.note), on_tick, tick, velocity))
            elif kind == "end_of_track":
                result.track_ends.append(tick)
        assert not any(open_notes.values()), "unpaired note_on"
    result.notes.sort(key=lambda item: (item[1], item[0]))
    return result
