"""Result, warning and error schemas of the MIDI import (camelCase JSON)."""

from typing import Literal

from pydantic import Field

from app.models.project import CamelModel, Project

ImportWarningCode = Literal[
    "notes_out_of_range",
    "percussion_skipped",
    "unclosed_notes",
    "unclosed_pedals",
    "short_pedals",
    "tempo_changes",
    "tempo_out_of_range",
    "time_signature_unsupported",
    "time_signature_changes",
    "no_notes",
]

ImportErrorCode = Literal[
    "empty_file",
    "file_too_large",
    "invalid_file",
    "unsupported_format",
    "unsupported_division",
    "too_many_notes",
]


class MidiImportWarning(CamelModel):
    """Named so to avoid shadowing the builtin `ImportWarning`."""

    code: ImportWarningCode
    message: str
    count: int = Field(ge=0)


class MidiImportResult(CamelModel):
    project: Project
    warnings: list[MidiImportWarning]


class ImportErrorDetail(CamelModel):
    code: ImportErrorCode
    message: str


class ImportErrorResponse(CamelModel):
    detail: ImportErrorDetail
