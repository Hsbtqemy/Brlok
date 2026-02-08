# -*- coding: utf-8 -*-
"""Tests du catalog_store."""
import json
from pathlib import Path
from unittest.mock import patch

from brlok.models import Catalog, GridDimensions, Hold, Position
from brlok.storage.catalog_store import load_catalog, save_catalog


def _patch_collection_paths(tmp_path: Path):
    """Patch les chemins catalogue et collection pour utiliser tmp_path."""
    return (
        patch("brlok.storage.catalog_store._get_catalog_path", return_value=tmp_path / "catalog.json"),
        patch("brlok.storage.catalog_collection_store._get_collection_path", return_value=tmp_path / "catalog_collection.json"),
        patch("brlok.storage.catalog_collection_store._get_catalog_path", return_value=tmp_path / "catalog.json"),
    )


def test_save_and_load_round_trip(tmp_path: Path) -> None:
    """Save puis load — round-trip Catalog."""
    p1, p2, p3 = _patch_collection_paths(tmp_path)
    with p1, p2, p3:
        catalog = Catalog(
            holds=[
                Hold(
                    id="A1",
                    level=2,
                    tags=["crimp"],
                    position=Position(row=0, col=0),
                ),
            ],
            grid=GridDimensions(rows=4, cols=8),
        )
        save_catalog(catalog)
        loaded = load_catalog()
        # Grille complétée automatiquement (ensure_full_grid) : 42 prises
        assert len(loaded.holds) == 42
        a1 = next(h for h in loaded.holds if h.id == "A1")
        assert a1.level == 2
        assert a1.tags == ["crimp"]
        # Grille normalisée à 7×6 (DEFAULT_GRID fixe)
        assert loaded.grid.rows == 7
        assert loaded.grid.cols == 6


def test_save_json_contains_version_and_snake_case(tmp_path: Path) -> None:
    """JSON sauvegardé contient version et snake_case."""
    p1, p2, p3 = _patch_collection_paths(tmp_path)
    with p1, p2, p3:
        catalog = Catalog(holds=[Hold(id="A1", level=2, tags=[], position=Position(row=0, col=0))], grid=GridDimensions(rows=3, cols=6))
        save_catalog(catalog)
        coll_path = tmp_path / "catalog_collection.json"
        assert coll_path.exists()
        with open(coll_path, encoding="utf-8") as f:
            data = json.load(f)
        assert "catalogs" in data
        assert len(data["catalogs"]) >= 1
        cat = data["catalogs"][0]["catalog"]
        assert "holds" in cat
        assert "grid" in cat
        # Grille toujours 7×6 (DEFAULT_GRID)
        assert cat["grid"]["rows"] == 7
        assert cat["grid"]["cols"] == 6


def test_load_file_absent_returns_default(tmp_path: Path) -> None:
    """Fichier absent → catalogue par défaut (avec prises de démo, grille 7×6)."""
    p1, p2, p3 = _patch_collection_paths(tmp_path)
    with p1, p2, p3:
        catalog = load_catalog()
        assert len(catalog.holds) >= 1
        assert catalog.grid.rows == 7
        assert catalog.grid.cols == 6


def test_load_invalid_json_returns_default(tmp_path: Path) -> None:
    """JSON invalide → catalogue par défaut (prises de démo, grille 7×6)."""
    path = tmp_path / "catalog.json"
    path.write_text("invalid json {{{", encoding="utf-8")
    coll_path = tmp_path / "catalog_collection.json"
    coll_path.write_text("invalid json", encoding="utf-8")
    p1, p2, p3 = _patch_collection_paths(tmp_path)
    with p1, p2, p3:
        catalog = load_catalog()
        assert len(catalog.holds) >= 1
        assert catalog.grid.rows == 7
        assert catalog.grid.cols == 6


def test_load_invalid_catalog_data_returns_default(tmp_path: Path) -> None:
    """Données JSON invalides (schema Pydantic) → catalogue par défaut (grille 7×6)."""
    path = tmp_path / "catalog.json"
    path.write_text(
        json.dumps({
            "version": 1,
            "updated_at": "2026-02-08T12:00:00",
            "holds": [{"id": "A1", "level": 99, "tags": [], "position": {"row": 0, "col": 0}}],
            "grid": {"rows": 4, "cols": 8},
        }),
        encoding="utf-8",
    )
    coll_path = tmp_path / "catalog_collection.json"
    coll_path.write_text("{}", encoding="utf-8")  # collection invalide
    p1, p2, p3 = _patch_collection_paths(tmp_path)
    with p1, p2, p3:
        catalog = load_catalog()
        assert len(catalog.holds) >= 1
        assert catalog.grid.rows == 7
        assert catalog.grid.cols == 6
