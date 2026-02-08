# -*- coding: utf-8 -*-
"""Tests des opérations sur le catalogue."""
from pathlib import Path
from unittest.mock import patch

import pytest
from pydantic import ValidationError

from brlok.models import Catalog, GridDimensions, Hold, Position
from brlok.storage.catalog_ops import add_hold, remove_hold, update_hold_active, update_hold_level
from brlok.storage.catalog_store import load_catalog, save_catalog


def test_add_hold_success() -> None:
    """add_hold ajoute une prise à une position libre."""
    catalog = Catalog(holds=[], grid=GridDimensions(rows=4, cols=8))
    new_catalog = add_hold(catalog, row=1, col=2, level=3)
    assert len(new_catalog.holds) == 1
    assert new_catalog.holds[0].level == 3
    assert new_catalog.holds[0].position.row == 1
    assert new_catalog.holds[0].position.col == 2
    assert new_catalog.holds[0].id == "C2"


def test_remove_hold_success() -> None:
    """remove_hold supprime une prise."""
    catalog = Catalog(
        holds=[
            Hold(id="A1", level=2, tags=[], position=Position(row=0, col=0)),
            Hold(id="B2", level=2, tags=[], position=Position(row=1, col=1)),
        ],
        grid=GridDimensions(rows=4, cols=8),
    )
    new_catalog = remove_hold(catalog, "A1")
    assert len(new_catalog.holds) == 1
    assert new_catalog.holds[0].id == "B2"


def test_remove_hold_not_found() -> None:
    """remove_hold sur hold inexistant → ValueError."""
    catalog = Catalog(holds=[], grid=GridDimensions(rows=4, cols=8))
    with pytest.raises(ValueError, match="non trouvé"):
        remove_hold(catalog, "X99")


def test_add_hold_position_occupied() -> None:
    """add_hold sur position occupée → ValueError."""
    catalog = Catalog(
        holds=[Hold(id="A1", level=2, tags=[], position=Position(row=0, col=0))],
        grid=GridDimensions(rows=4, cols=8),
    )
    with pytest.raises(ValueError, match="déjà occupée"):
        add_hold(catalog, row=0, col=0, level=2)


def test_update_hold_level_success() -> None:
    """Modification du niveau d'une prise."""
    catalog = Catalog(
        holds=[
            Hold(id="A1", level=2, tags=[], position=Position(row=0, col=0)),
        ],
        grid=GridDimensions(rows=4, cols=8),
    )
    new_catalog = update_hold_level(catalog, "A1", 4)
    assert new_catalog.holds[0].level == 4


def test_update_hold_level_hold_not_found() -> None:
    """Hold inexistant → ValueError."""
    catalog = Catalog(holds=[], grid=GridDimensions(rows=4, cols=8))
    with pytest.raises(ValueError, match="non trouvé"):
        update_hold_level(catalog, "X99", 3)


def test_update_hold_level_validation() -> None:
    """level hors 1-5 → ValidationError (via model_copy)."""
    catalog = Catalog(
        holds=[Hold(id="A1", level=2, tags=[], position=Position(row=0, col=0))],
        grid=GridDimensions(rows=4, cols=8),
    )
    with pytest.raises(ValidationError):
        update_hold_level(catalog, "A1", 99)


def test_update_hold_level_persistance(tmp_path: Path) -> None:
    """Modification → save → load → niveau à jour."""
    with (
        patch("brlok.config.paths.get_data_dir", return_value=tmp_path),
        patch("brlok.storage.catalog_store._get_catalog_path", return_value=tmp_path / "catalog.json"),
    ):
        catalog = Catalog(
            holds=[
                Hold(id="B2", level=1, tags=[], position=Position(row=1, col=1)),
            ],
            grid=GridDimensions(rows=4, cols=8),
        )
        save_catalog(catalog)
        catalog = update_hold_level(catalog, "B2", 5)
        save_catalog(catalog)
        loaded = load_catalog()
        assert loaded.holds[0].level == 5


def test_update_hold_active_success() -> None:
    """Modification du statut actif d'une prise."""
    catalog = Catalog(
        holds=[
            Hold(id="A1", level=2, tags=[], position=Position(row=0, col=0), active=True),
        ],
        grid=GridDimensions(rows=4, cols=8),
    )
    new_catalog = update_hold_active(catalog, "A1", False)
    assert new_catalog.holds[0].active is False
    new_catalog = update_hold_active(new_catalog, "A1", True)
    assert new_catalog.holds[0].active is True


def test_update_hold_active_hold_not_found() -> None:
    """Hold inexistant → ValueError."""
    catalog = Catalog(holds=[], grid=GridDimensions(rows=4, cols=8))
    with pytest.raises(ValueError, match="non trouvé"):
        update_hold_active(catalog, "X99", False)


def test_update_hold_active_persistance(tmp_path: Path) -> None:
    """Modification actif → save → load → actif à jour."""
    with (
        patch("brlok.config.paths.get_data_dir", return_value=tmp_path),
        patch("brlok.storage.catalog_store._get_catalog_path", return_value=tmp_path / "catalog.json"),
    ):
        catalog = Catalog(
            holds=[
                Hold(id="B2", level=1, tags=[], position=Position(row=1, col=1), active=True),
            ],
            grid=GridDimensions(rows=4, cols=8),
        )
        save_catalog(catalog)
        catalog = update_hold_active(catalog, "B2", False)
        save_catalog(catalog)
        loaded = load_catalog()
        assert loaded.holds[0].active is False
