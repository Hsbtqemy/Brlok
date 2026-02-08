# -*- coding: utf-8 -*-
"""Modèle Catalog - catalogue des prises et structure du pan."""
from __future__ import annotations

from pydantic import BaseModel, Field, field_validator, model_validator

from brlok.models.hold import Hold

# Grille fixe : TOUJOURS 6 colonnes × 7 lignes (A1..F7).
# Source de vérité unique — ne jamais déduire rows/cols des données.

# Grille pieds : 4 lignes × 6 colonnes (positions prises de pied)
FOOT_GRID_ROWS = 4
FOOT_GRID_COLS = 6
FOOT_GRID_6x4 = [
    ["[Bac]", "[35°]", "[20°]", "[20°]", "[35°]", "[Bac]"],
    ["25", "", "bi30", "bi30", "", "25"],
    ["45", "bi50", "30°", "30°", "bi50", "45"],
    ["20", "", "18", "18", "", "20"],
]

# Valeurs prédéfinies pour la grille pieds (specs, pas difficulté)
FOOT_GRID_SPECS = [
    "",
    "[Bac]",
    "[35°]",
    "[20°]",
    "[30°]",
    "18",
    "20",
    "25",
    "45",
    "bi30",
    "bi50",
]


def _default_foot_grid() -> list[list[str]]:
    """Copie profonde de la grille pieds par défaut."""
    return [row[:] for row in FOOT_GRID_6x4]


def _default_foot_levels() -> list[list[int]]:
    """Grille niveaux pieds 4×6 (1-6 par défaut)."""
    return [[1] * FOOT_GRID_COLS for _ in range(FOOT_GRID_ROWS)]


def _validate_foot_levels(levels: list[list[int]]) -> list[list[int]]:
    """Valide foot_levels 4×6. Valeurs 1-6. Utilise défaut si invalide."""
    if len(levels) != FOOT_GRID_ROWS:
        return _default_foot_levels()
    result = []
    for r in range(FOOT_GRID_ROWS):
        row = levels[r] if r < len(levels) else []
        result_row = []
        for c in range(FOOT_GRID_COLS):
            v = int(row[c]) if c < len(row) and row[c] is not None else 1
            result_row.append(max(1, min(6, v)))
        result.append(result_row)
    return result


def _validate_foot_grid(grid: list[list[str]]) -> list[list[str]]:
    """Valide et normalise la grille pieds (4×6). Retourne la grille par défaut si invalide."""
    if len(grid) != FOOT_GRID_ROWS:
        return _default_foot_grid()
    if any(len(row) != FOOT_GRID_COLS for row in grid):
        return _default_foot_grid()
    return [[str(cell) if cell is not None else "" for cell in row] for row in grid]


class GridDimensions(BaseModel):
    """Dimensions de la grille du pan."""

    rows: int = Field(..., ge=1, description="Nombre de lignes")
    cols: int = Field(..., ge=1, description="Nombre de colonnes")


def get_default_grid() -> GridDimensions:
    """Retourne la grille par défaut 7×6 (7 lignes, 6 colonnes = A1..F7)."""
    return GridDimensions(rows=7, cols=6)


# Constante pour usage direct (évite recréation)
DEFAULT_GRID = get_default_grid()


class Catalog(BaseModel):
    """Catalogue des prises et structure du pan."""

    holds: list[Hold] = Field(default_factory=list, description="Liste des prises")
    grid: GridDimensions = Field(
        ..., description="Structure du pan (dimensions)"
    )
    foot_grid: list[list[str]] = Field(
        default_factory=_default_foot_grid,
        description="Grille pieds 4×6 (positions prises de pied)",
    )
    foot_levels: list[list[int]] = Field(
        default_factory=_default_foot_levels,
        description="Niveaux difficulté pieds 4×6 (1-6)",
    )

    @field_validator("foot_grid", mode="after")
    @classmethod
    def validate_foot_grid_dims(cls, v: list[list[str]]) -> list[list[str]]:
        """Valide dimensions 4×6. Utilise défaut si invalide."""
        return _validate_foot_grid(v)

    @field_validator("foot_levels", mode="after")
    @classmethod
    def validate_foot_levels_dims(cls, v: list[list[int]]) -> list[list[int]]:
        """Valide dimensions 4×6, valeurs 1-6."""
        return _validate_foot_levels(v)

    @model_validator(mode="after")
    def validate_holds_in_grid_and_unique_ids(self) -> "Catalog":
        """Positions dans les bounds de la grille ; unicité des id."""
        rows, cols = self.grid.rows, self.grid.cols
        seen_ids: set[str] = set()
        for hold in self.holds:
            if hold.id in seen_ids:
                raise ValueError(f"Hold id dupliqué: {hold.id!r}")
            seen_ids.add(hold.id)
            if not (0 <= hold.position.row < rows):
                raise ValueError(
                    f"Hold {hold.id!r}: row {hold.position.row} hors grille "
                    f"(0..{rows - 1})"
                )
            if not (0 <= hold.position.col < cols):
                raise ValueError(
                    f"Hold {hold.id!r}: col {hold.position.col} hors grille "
                    f"(0..{cols - 1})"
                )
        return self