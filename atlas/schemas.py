"""Validated API payloads and calendar conversion."""

import re
from datetime import date
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, StrictInt, field_validator, model_validator

TOTAL_YEARS = 4_540_000_000
EVENT_ID = re.compile(r"[A-Za-z0-9_-]{1,90}\Z")


class EventInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str = Field(min_length=1, max_length=100)
    summary: str = Field(default="", max_length=240)
    body: str = ""
    era: str = Field(default="", max_length=60)
    dateMode: Literal["bp", "bce", "ce"] = "bp"
    dateValue: StrictInt
    relatedIds: list[str] = Field(default_factory=list, max_length=100)

    @field_validator("title")
    @classmethod
    def title_not_blank(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("O título não pode estar vazio")
        return value

    @field_validator("body")
    @classmethod
    def body_size(cls, value: str) -> str:
        if len(value.encode("utf-8")) > 10_000_000:
            raise ValueError("O documento excede 10 MB")
        return value

    @field_validator("relatedIds")
    @classmethod
    def unique_links(cls, values: list[str]) -> list[str]:
        if any(not EVENT_ID.fullmatch(value) for value in values):
            raise ValueError("Identificador de referência inválido")
        return list(dict.fromkeys(values))

    @model_validator(mode="after")
    def valid_date(self) -> "EventInput":
        value = self.dateValue
        year = date.today().year
        if value < (0 if self.dateMode == "bp" else 1):
            raise ValueError("A data deve ser positiva")
        if self.dateMode == "ce" and value > year:
            raise ValueError("O ano não pode estar no futuro")
        if not 0 <= self.bp <= TOTAL_YEARS:
            raise ValueError("Data fora da escala do Atlas")
        return self

    @property
    def bp(self) -> int:
        year = date.today().year
        if self.dateMode == "bp":
            return self.dateValue
        if self.dateMode == "bce":
            return year + self.dateValue - 1
        return year - self.dateValue


class ImportPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    format: Literal["atlas-do-tempo-v1"]
    events: list[dict] = Field(max_length=500)
