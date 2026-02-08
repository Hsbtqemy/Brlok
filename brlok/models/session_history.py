# -*- coding: utf-8 -*-
"""Modèle SessionHistory - séance terminée enregistrée (7.4)."""
from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field

from brlok.models.session import Session


class CompletedSession(BaseModel):
    """Séance terminée enregistrée dans l'historique."""

    id: str = Field(..., description="Identifiant unique (uuid ou timestamp)")
    date: datetime = Field(
        default_factory=datetime.now,
        description="Date et heure de fin de séance",
    )
    session: Session = Field(..., description="Séance (blocs avec commentaires)")
    block_statuses: dict[int, str] = Field(
        default_factory=dict,
        description="Statut par index de bloc (success, fail)",
    )
