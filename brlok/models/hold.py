# -*- coding: utf-8 -*-
"""Modèle Hold - prise du pan."""
from __future__ import annotations

from typing import Annotated

from pydantic import BaseModel, Field, field_validator


class Position(BaseModel):
    """Position sur la grille du pan (row, col)."""

    row: int = Field(..., ge=0, description="Index de ligne (0-based)")
    col: int = Field(..., ge=0, description="Index de colonne (0-based)")


class Hold(BaseModel):
    """Prise du pan d'escalade."""

    id: str = Field(..., min_length=1, description="Identifiant (ex. A1, C7)")
    level: Annotated[int, Field(ge=1, le=5)] = Field(
        ..., description="Difficulté 1-5"
    )
    tags: list[str] = Field(default_factory=list, description="Liste ouverte de tags")
    position: Position = Field(..., description="Position sur la grille")
    active: bool = Field(default=True, description="Prise active (utilisable)")

    @field_validator("tags", mode="before")
    @classmethod
    def ensure_tags_list(cls, v: object) -> list[str]:
        """Garantit que tags est une liste de str."""
        if v is None:
            return []
        if isinstance(v, list):
            return [str(x) for x in v]
        return [str(v)]
