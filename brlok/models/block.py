# -*- coding: utf-8 -*-
"""Modèle Block - séquence ordonnée de prises (FR10)."""
from __future__ import annotations

from pydantic import BaseModel, Field, model_validator

from brlok.models.hold import Hold


class Block(BaseModel):
    """Bloc d'escalade : séquence ordonnée de prises."""

    holds: list[Hold] = Field(
        ...,
        description="Séquence ordonnée des prises du bloc",
    )
    foot_positions: list[tuple[int, int]] = Field(
        default_factory=list,
        description="Positions pieds recommandées (row, col) dans foot_grid 4×6",
    )
    comment: str | None = Field(
        default=None,
        description="Commentaire optionnel (7.2)",
    )

    @model_validator(mode="after")
    def validate_non_empty(self) -> "Block":
        """Un bloc doit contenir au moins une prise."""
        if not self.holds:
            raise ValueError("Block doit contenir au moins une prise")
        return self
