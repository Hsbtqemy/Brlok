# -*- coding: utf-8 -*-
"""Modèle Session - séance d'entraînement (blocs + contraintes)."""
from __future__ import annotations

from pydantic import BaseModel, Field

from brlok.models.block import Block


class SessionConstraints(BaseModel):
    """Contraintes utilisées pour générer la séance."""

    target_level: int | None = Field(
        default=None,
        ge=1,
        le=5,
        description="Niveau cible (1-5), None si non utilisé",
    )
    required_tags: list[str] = Field(
        default_factory=list,
        description="Tags obligatoires (forcer)",
    )
    excluded_tags: list[str] = Field(
        default_factory=list,
        description="Tags exclus (filtrer)",
    )
    variety: bool = Field(
        default=False,
        description="Contrainte de variété (éviter répétitions)",
    )
    enchainements: int | None = Field(
        default=None,
        ge=1,
        le=20,
        description="Nombre de prises par bloc (7.5)",
    )


class Session(BaseModel):
    """Séance d'entraînement : liste de blocs + contraintes utilisées."""

    blocks: list[Block] = Field(
        default_factory=list,
        description="Liste des blocs de la séance",
    )
    constraints: SessionConstraints = Field(
        default_factory=SessionConstraints,
        description="Contraintes ayant servi à la génération",
    )
