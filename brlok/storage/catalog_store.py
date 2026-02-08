# -*- coding: utf-8 -*-
"""Persistance du catalogue JSON (XDG)."""
from __future__ import annotations

import json
import logging
from datetime import datetime
from pathlib import Path

from pydantic import ValidationError

from brlok.models import Catalog, CatalogEntry, DEFAULT_GRID, Hold, Position
from brlok.models.catalog import _default_foot_grid, _default_foot_levels

logger = logging.getLogger(__name__)


def _normalize_catalog_to_fixed_grid(catalog: Catalog) -> Catalog:
    """Force la grille à DEFAULT_GRID ; ignore les prises hors grille avec warning."""
    if catalog.grid.rows == DEFAULT_GRID.rows and catalog.grid.cols == DEFAULT_GRID.cols:
        return catalog
    rows, cols = DEFAULT_GRID.rows, DEFAULT_GRID.cols
    kept: list[Hold] = []
    for h in catalog.holds:
        if 0 <= h.position.row < rows and 0 <= h.position.col < cols:
            kept.append(h)
        else:
            logger.warning(
                "Prise %s hors grille fixe (row=%d, col=%d) — ignorée",
                h.id, h.position.row, h.position.col,
            )
    return Catalog(
        holds=kept,
        grid=DEFAULT_GRID,
        foot_grid=catalog.foot_grid,
        foot_levels=getattr(catalog, "foot_levels", None) or _default_foot_levels(),
    )


def _position_to_id(row: int, col: int) -> str:
    """Génère un id type A1, B2 à partir de (row, col). Col 0=A, 1=B... Row 1-based."""
    return chr(ord("A") + col) + str(row + 1)


def _default_catalog_holds(rows: int = 7, cols: int = 6) -> list[Hold]:
    """Prises par défaut : toutes les cases A1..F7 (level=1, active=True)."""
    holds: list[Hold] = []
    for r in range(rows):
        for c in range(cols):
            holds.append(
                Hold(
                    id=_position_to_id(r, c),
                    level=1,
                    tags=[],
                    position=Position(row=r, col=c),
                    active=True,
                )
            )
    return holds


def _get_catalog_path() -> Path:
    """Chemin du fichier catalogue."""
    from brlok.config.paths import get_catalog_path
    return get_catalog_path()


def _default_catalog() -> Catalog:
    """Catalogue par défaut (fichier absent) : grille fixe 7×6 entièrement remplie.

    Utilise DEFAULT_GRID (source de vérité unique).
    Toutes les cases A1..F7 sont remplies (level=1, active=True).
    """
    return Catalog(holds=_default_catalog_holds(DEFAULT_GRID.rows, DEFAULT_GRID.cols), grid=DEFAULT_GRID)


def create_default_catalog() -> Catalog:
    """Catalogue par défaut avec grille complète. Utilisé pour « Nouveau catalogue »."""
    return _default_catalog()


def save_catalog(catalog: Catalog) -> None:
    """Sauvegarde le catalogue actif. Utilise la collection (7.1) si disponible."""
    from brlok.storage.catalog_collection_store import load_collection, save_collection

    catalog = _normalize_catalog_to_fixed_grid(catalog)
    try:
        coll = load_collection()
        if coll.catalogs and coll.active_id:
            for i, entry in enumerate(coll.catalogs):
                if entry.id == coll.active_id:
                    coll.catalogs[i] = CatalogEntry(
                        id=entry.id,
                        name=entry.name,
                        catalog=catalog,
                    )
                    save_collection(coll)
                    return
    except Exception as e:
        logger.warning("Collection non disponible, fallback legacy: %s", e)
    _save_catalog_legacy(catalog)


def _save_catalog_legacy(catalog: Catalog) -> None:
    """Sauvegarde dans catalog.json (legacy)."""
    path = _get_catalog_path()
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        data = catalog.model_dump(mode="json")
        file_data = {
            "version": 1,
            "updated_at": datetime.now().isoformat(),
            "holds": data["holds"],
            "grid": data["grid"],
            "foot_grid": data.get("foot_grid", _default_foot_grid()),
            "foot_levels": data.get("foot_levels", _default_foot_levels()),
        }
        with open(path, "w", encoding="utf-8") as f:
            json.dump(file_data, f, ensure_ascii=False, indent=2)
    except (OSError, PermissionError) as e:
        logger.error("Impossible de sauvegarder le catalogue dans %s: %s", path, e)


def load_catalog() -> Catalog:
    """Charge le catalogue actif. Utilise la collection (7.1) si disponible, sinon legacy catalog.json."""
    from brlok.storage.catalog_collection_store import get_active_catalog, load_collection
    try:
        coll = load_collection()
        if coll.catalogs:
            return get_active_catalog()
    except Exception as e:
        logger.warning("Collection non disponible, fallback legacy: %s", e)
    return _load_catalog_legacy()


def _load_catalog_legacy() -> Catalog:
    """Charge depuis catalog.json (legacy)."""
    path = _get_catalog_path()
    if not path.exists():
        return _default_catalog()

    try:
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
    except (json.JSONDecodeError, OSError, PermissionError) as e:
        logger.warning("Catalogue illisible (%s), utilisation du catalogue par défaut: %s", path, e)
        return _default_catalog()

    if "holds" not in data or "grid" not in data:
        return _default_catalog()

    try:
        catalog_data = {
            "holds": data["holds"],
            "grid": data["grid"],
            "foot_grid": data.get("foot_grid", _default_foot_grid()),
            "foot_levels": data.get("foot_levels", _default_foot_levels()),
        }
        catalog = Catalog.model_validate(catalog_data)
        if not catalog.holds:
            return _default_catalog()
        return _normalize_catalog_to_fixed_grid(catalog)
    except ValidationError as e:
        logger.warning("Catalogue corrompu (%s), utilisation du catalogue par défaut: %s", path, e)
        return _default_catalog()
