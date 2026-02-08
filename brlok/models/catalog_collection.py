# -*- coding: utf-8 -*-
"""Modèle CatalogCollection - catalogue de catalogues (7.1)."""
from __future__ import annotations

from pydantic import BaseModel, Field

from brlok.models.catalog import Catalog


class CatalogEntry(BaseModel):
    """Entrée d'un catalogue dans la collection."""

    id: str = Field(..., description="Identifiant unique")
    name: str = Field(..., min_length=1, description="Nom affiché (ex. Pan maison)")
    catalog: Catalog = Field(..., description="Catalogue des prises")


class CatalogCollection(BaseModel):
    """Collection de catalogues (multi-pan)."""

    catalogs: list[CatalogEntry] = Field(
        default_factory=list,
        description="Liste des catalogues",
    )
    active_id: str = Field(
        default="",
        description="ID du catalogue actif",
    )
