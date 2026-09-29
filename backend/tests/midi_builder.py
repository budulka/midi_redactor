"""Test-only helpers: build Standard MIDI Files from absolute-tick events or raw chunks."""

import io
import struct
from collections.abc import Sequence
from typing import Any

import mido


def build_smf(
    tracks: Sequence[Sequence[tuple[int, Any]]],
    type: int = 1,
    ppq: int = 480,
    end_ticks: Sequence[int | None] | None = None,
) -> bytes:
    """Save tracks of `(absolute tick, mido message)` events as SMF bytes.

    Each track gets an `end_of_track` at its last event, or at `end_ticks[i]` when given.
    """
    midi_file = mido.MidiFile(type=type, ticks_per_beat=ppq)
    for index, events in enumerate(tracks):
        track = mido.MidiTrack()
        previous = 0
        for tick, message in sorted(events, key=lambda item: item[0]):
            track.append(message.copy(time=tick - previous))
            previous = tick
        end_tick = end_ticks[index] if end_ticks is not None else None
        end = previous if end_tick is None else end_tick
        track.append(mido.MetaMessage("end_of_track", time=end - previous))
        midi_file.tracks.append(track)
    buffer = io.BytesIO()
    midi_file.save(file=buffer)
    return buffer.getvalue()


def raw_smf(
    file_format: int, division: int, track_bodies: Sequence[bytes], tracks: int = -1
) -> bytes:
    """Hand-assembled SMF: a header (with a signed `division`) and `MTrk` chunks."""
    count = len(track_bodies) if tracks < 0 else tracks
    data = b"MThd" + struct.pack(">Lhhh", 6, file_format, count, division)
    for body in track_bodies:
        data += b"MTrk" + struct.pack(">L", len(body)) + body
    return data


END_OF_TRACK = b"\x00\xff\x2f\x00"
