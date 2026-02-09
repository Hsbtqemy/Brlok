# -*- coding: utf-8 -*-
"""Modèle SessionTemplate - template de séance (8.1)."""
from __future__ import annotations

from pydantic import BaseModel, Field


class BlockConfig(BaseModel):
    """Configuration d'un bloc dans un template."""

    level: str | int = Field(
        default="modéré",
        description="Niveau : facile, modéré, difficile ou 1-5",
    )
    work_s: int = Field(default=40, ge=5, le=300, description="Durée travail (s)")
    rest_s: int = Field(default=20, ge=5, le=120, description="Durée repos (s)")
    rounds: int = Field(default=3, ge=1, le=20, description="Nombre de rounds")


class SessionTemplate(BaseModel):
    """Template de séance réutilisable (40/20, pyramides, EMOM)."""

    id: str = Field(..., description="Identifiant unique")
    name: str = Field(..., min_length=1, description="Nom affiché")
    blocks_config: list[BlockConfig] = Field(
        default_factory=list,
        description="Configuration par bloc (niveau, timing)",
    )
    blocks_count: int = Field(default=5, ge=1, le=20, description="Nombre de blocs")
    holds_per_block: int = Field(default=10, ge=1, le=20, description="Prises par bloc")
    distribution_pattern: str = Field(
        default="uniforme",
        description="Répartition des prises dans un bloc (uniforme, progressive, pyramide, etc.)",
    )
