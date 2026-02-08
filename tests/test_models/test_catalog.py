# -*- coding: utf-8 -*-
"""Tests du modèle Catalog."""
import pytest
from pydantic import ValidationError

from brlok.models import Catalog, GridDimensions, Hold, Position


def test_catalog_creation_valide() -> None:
    """Création valide d'un Catalog."""
    holds = [
        Hold(
            id="A1",
            level=2,
            tags=[],
            position=Position(row=0, col=0),
        ),
    ]
    grid = GridDimensions(rows=4, cols=8)
    catalog = Catalog(holds=holds, grid=grid)
    assert len(catalog.holds) == 1
    assert catalog.holds[0].id == "A1"
    assert catalog.grid.rows == 4
    assert catalog.grid.cols == 8


def test_catalog_holds_vide() -> None:
    """Catalog avec liste holds vide."""
    catalog = Catalog(holds=[], grid=GridDimensions(rows=3, cols=6))
    assert catalog.holds == []


def test_catalog_plusieurs_holds() -> None:
    """Catalog avec plusieurs prises."""
    holds = [
        Hold(id="A1", level=1, tags=[], position=Position(row=0, col=0)),
        Hold(id="C7", level=4, tags=["crimp"], position=Position(row=2, col=6)),
    ]
    catalog = Catalog(holds=holds, grid=GridDimensions(rows=5, cols=10))
    assert len(catalog.holds) == 2
    assert catalog.holds[0].id == "A1"
    assert catalog.holds[1].id == "C7"


def test_grid_dimensions_invalides_rejetees() -> None:
    """GridDimensions avec rows/cols < 1 rejeté."""
    with pytest.raises(ValidationError):
        GridDimensions(rows=0, cols=8)
    with pytest.raises(ValidationError):
        GridDimensions(rows=4, cols=0)


def test_catalog_grid_requis() -> None:
    """Catalog exige grid."""
    with pytest.raises(ValidationError):
        Catalog(holds=[])
