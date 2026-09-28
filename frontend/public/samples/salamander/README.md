# Salamander Grand Piano samples

Piano samples used for playback in MIDI Redactor.

- **Work:** Salamander Grand Piano (Yamaha C5), by **Alexander Holm**.
- **License:** [Creative Commons Attribution 3.0 (CC-BY 3.0)](https://creativecommons.org/licenses/by/3.0/).
- **Source of these files:** the Tone.js audio repository,
  [`Tonejs/audio`](https://github.com/Tonejs/audio/tree/869b6f8d9cddb47d966238c012041480b1ce517a/salamander),
  directory `salamander`, commit `869b6f8d9cddb47d966238c012041480b1ce517a`.

## Changes from the original

These are **not** the original Salamander Grand Piano recordings (48 kHz / 24-bit WAV, 16 velocity
layers). They are a reduced set converted to mp3 by the Tone.js authors: one velocity layer and
one sample every three semitones. MIDI Redactor uses the files unchanged from that repository.

## Files

30 mp3 files, 2 012 677 bytes in total, for the notes A, C, D# and F# of every octave from A0 to C8:

- `A0.mp3` … `A7.mp3`
- `C1.mp3` … `C8.mp3`
- `Ds1.mp3` … `Ds7.mp3` (D#)
- `Fs1.mp3` … `Fs7.mp3` (F#)

The browser pitch-shifts the nearest sample for the other keys.

## Reproducing

```bash
cd frontend && npm run fetch-samples
```

The script `frontend/scripts/fetch-piano-samples.mjs` downloads the files from the pinned commit
and checks their count and total size.
