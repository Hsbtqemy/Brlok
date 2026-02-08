# -*- coding: utf-8 -*-
"""Tests des opérations tags sur le catalogue."""
from pathlib import Path
from unittest.mock import patch

from brlok.models import Catalog, GridDimensions, Hold, Position
from brlok.storage.catalog_ops import _parse_tags_input, update_hold_tags
from brlok.storage.catalog_store import load_catalog, save_catalog


def test_parse_tags_input() -> None:
    """Parse tags avec virgules, espaces, doublons."""
    assert _parse_tags_input("crimp, sloper") == ["crimp", "sloper"]
    assert _parse_tags_input("a,b,a") == ["a", "b"]
    assert _parse_tags_input("  x  ,  y  ") == ["x", "y"]
    assert _parse_tags_input("") == []
    assert _parse_tags_input("  ,  , ") == []


def test_update_hold_tags_success() -> None:
    """Modification des tags."""
    catalog = Catalog(
        holds=[Hold(id="A1", level=2, tags=["crimp"], position=Position(row=0, col=0))],
        grid=GridDimensions(rows=4, cols=8),
    )
    new_catalog = update_hold_tags(catalog, "A1", ["crimp", "sloper"])
    assert new_catalog.holds[0].tags == ["crimp", "sloper"]


def test_update_hold_tags_empty() -> None:
    """Tags vides."""
    catalog = Catalog(
        holds=[Hold(id="A1", level=2, tags=["crimp"], position=Position(row=0, col=0))],
        grid=GridDimensions(rows=4, cols=8),
    )
    new_catalog = update_hold_tags(catalog, "A1", [])
    assert new_catalog.holds[0].tags == []


def test_update_hold_tags_persistance(tmp_path: Path) -> None:
    """Modification tags → save → load → tags à jour."""
    with patch("brlok.storage.catalog_store._get_catalog_path", return_value=tmp_path / "catalog.json"):
        catalog = Catalog(
            holds=[Hold(id="B2", level=1, tags=["old"], position=Position(row=1, col=1))],
            grid=GridDimensions(rows=4, cols=8),
        )
        save_catalog(catalog)
        catalog = update_hold_tags(catalog, "B2", ["new1", "new2"])
        save_catalog(catalog)
        loaded = load_catalog()
        assert loaded.holds[0].tags == ["new1", "new2"]
