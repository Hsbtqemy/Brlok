# -*- coding: utf-8 -*-
"""Modèle Catalog - catalogue des prises et structure du pan."""
from __future__ import annotations

from pydantic import BaseModel, Field

from brlok.models.hold import Hold


class GridDimensions(BaseModel):
    """Dimensions de la grille du pan."""

    rows: int = Field(..., ge=1, description="Nombre de lignes")
    cols: int = Field(..., ge=1, description="Nombre de colonnes")


class Catalog(BaseModel):
    """Catalogue des prises et structure du pan."""

    holds: list[Hold] = Field(default_factory=list, description="Liste des prises")
    grid: GridDimensions = Field(
        ..., description="Structure du pan (dimensions)"
    )
