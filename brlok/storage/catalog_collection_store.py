# -*- coding: utf-8 -*-
"""Persistance de la collection de catalogues (7.1)."""
from __future__ import annotations

import json
import logging
import uuid
from pathlib import Path

from pydantic import ValidationError

from brlok.models import Catalog, CatalogCollection, CatalogEntry
from brlok.models.catalog import _default_foot_levels
from brlok.storage.catalog_ops import ensure_full_grid

logger = logging.getLogger(__name__)


def _get_catalog_path() -> Path:
    """Chemin du catalogue unique (legacy)."""
    from brlok.config.paths import get_catalog_path
    return get_catalog_path()


def _get_collection_path() -> Path:
    """Chemin de la collection de catalogues."""
    from brlok.config.paths import get_catalog_collection_path
    return get_catalog_collection_path()


def _migrate_from_legacy() -> CatalogCollection:
    """Migration depuis catalog.json vers catalog_collection.json."""
    from brlok.storage.catalog_store import _load_catalog_legacy
    catalog = _load_catalog_legacy()
    entry = CatalogEntry(
        id="default",
        name="Pan principal",
        catalog=catalog,
    )
    return CatalogCollection(catalogs=[entry], active_id="default")


def load_collection() -> CatalogCollection:
    """Charge la collection de catalogues. Migration si nécessaire."""
    col_path = _get_collection_path()
    cat_path = _get_catalog_path()

    if col_path.exists():
        try:
            with open(col_path, encoding="utf-8") as f:
                data = json.load(f)
            coll = CatalogCollection.model_validate(data)
            # Normaliser chaque catalogue à la grille fixe (évite import circulaire)
            def _norm(c: Catalog) -> Catalog:
                from brlok.models import DEFAULT_GRID
                if c.grid.rows == DEFAULT_GRID.rows and c.grid.cols == DEFAULT_GRID.cols:
                    return c
                rows, cols = DEFAULT_GRID.rows, DEFAULT_GRID.cols
                kept = [h for h in c.holds if 0 <= h.position.row < rows and 0 <= h.position.col < cols]
                for h in c.holds:
                    if h not in kept:
                        logger.warning("Prise %s hors grille fixe — ignorée", h.id)
                return Catalog(
                    holds=kept,
                    grid=DEFAULT_GRID,
                    foot_grid=c.foot_grid,
                    foot_levels=getattr(c, "foot_levels", None) or _default_foot_levels(),
                )
            coll.catalogs = [
                CatalogEntry(id=e.id, name=e.name, catalog=_norm(e.catalog))
                for e in coll.catalogs
            ]
            return coll
        except (json.JSONDecodeError, ValidationError, OSError) as e:
            logger.warning("Collection corrompue (%s), migration: %s", col_path, e)

    if cat_path.exists():
        coll = _migrate_from_legacy()
        save_collection(coll)
        return coll

    # Nouvelle installation : utiliser data/catalog_collection.json du repo si présent
    _bundled_data = Path(__file__).resolve().parent.parent.parent / "data" / "catalog_collection.json"
    if _bundled_data.exists():
        try:
            with open(_bundled_data, encoding="utf-8") as f:
                data = json.load(f)
            coll = CatalogCollection.model_validate(data)
            # Normaliser à la grille fixe
            def _norm(c: Catalog) -> Catalog:
                from brlok.models import DEFAULT_GRID
                if c.grid.rows == DEFAULT_GRID.rows and c.grid.cols == DEFAULT_GRID.cols:
                    return c
                rows, cols = DEFAULT_GRID.rows, DEFAULT_GRID.cols
                kept = [h for h in c.holds if 0 <= h.position.row < rows and 0 <= h.position.col < cols]
                return Catalog(
                    holds=kept,
                    grid=DEFAULT_GRID,
                    foot_grid=c.foot_grid,
                    foot_levels=getattr(c, "foot_levels", None) or _default_foot_levels(),
                )
            coll.catalogs = [
                CatalogEntry(id=e.id, name=e.name, catalog=_norm(e.catalog))
                for e in coll.catalogs
            ]
            save_collection(coll)
            return coll
        except (json.JSONDecodeError, ValidationError, OSError) as e:
            logger.warning("Catalogue fourni (data/) illisible: %s", e)

    # Fallback : catalogue générique (grille A1..F7, niveau 1)
    from brlok.storage.catalog_store import create_default_catalog
    default = create_default_catalog()
    entry = CatalogEntry(id="default", name="Pan principal", catalog=default)
    coll = CatalogCollection(catalogs=[entry], active_id="default")
    save_collection(coll)
    return coll


def save_collection(collection: CatalogCollection) -> None:
    """Sauvegarde la collection."""
    path = _get_collection_path()
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(
                collection.model_dump(mode="json"),
                f,
                ensure_ascii=False,
                indent=2,
            )
    except (OSError, PermissionError) as e:
        logger.error("Impossible de sauvegarder la collection dans %s: %s", path, e)


def get_active_catalog() -> Catalog:
    """Retourne le catalogue actif. Si vide, remplit avec prises par défaut et persiste."""
    coll = load_collection()
    catalog = None
    active_idx = -1
    for i, entry in enumerate(coll.catalogs):
        if entry.id == coll.active_id:
            catalog = entry.catalog
            active_idx = i
            break
    if catalog is None and coll.catalogs:
        catalog = coll.catalogs[0].catalog
        active_idx = 0
    if catalog is None or not catalog.holds:
        from brlok.storage.catalog_store import create_default_catalog
        default = create_default_catalog()
        if coll.catalogs and active_idx >= 0:
            coll.catalogs[active_idx] = CatalogEntry(
                id=coll.catalogs[active_idx].id,
                name=coll.catalogs[active_idx].name,
                catalog=default,
            )
            save_collection(coll)
        return default
    catalog = ensure_full_grid(catalog)
    for i, entry in enumerate(coll.catalogs):
        if entry.id == coll.active_id:
            if len(catalog.holds) > len(entry.catalog.holds):
                coll.catalogs[i] = CatalogEntry(
                    id=entry.id,
                    name=entry.name,
                    catalog=catalog,
                )
                save_collection(coll)
            break
    return catalog


def set_active_catalog(catalog_id: str) -> bool:
    """Définit le catalogue actif. Retourne True si ok."""
    coll = load_collection()
    if any(e.id == catalog_id for e in coll.catalogs):
        coll.active_id = catalog_id
        save_collection(coll)
        return True
    return False


def save_active_catalog(catalog: Catalog) -> None:
    """Sauvegarde le catalogue actif dans la collection."""
    coll = load_collection()
    for i, entry in enumerate(coll.catalogs):
        if entry.id == coll.active_id:
            coll.catalogs[i] = entry.model_copy(update={"catalog": catalog})
            save_collection(coll)
            return
    # Actif introuvable : ajouter ou créer
    if not coll.catalogs:
        entry = CatalogEntry(
            id=str(uuid.uuid4())[:8],
            name="Pan principal",
            catalog=catalog,
        )
        coll.catalogs = [entry]
        coll.active_id = entry.id
    else:
        coll.catalogs[0] = coll.catalogs[0].model_copy(update={"catalog": catalog})
    save_collection(coll)


def add_catalog(name: str, catalog: Catalog) -> CatalogEntry:
    """Ajoute un catalogue à la collection."""
    coll = load_collection()
    cid = str(uuid.uuid4())[:8]
    entry = CatalogEntry(id=cid, name=name, catalog=catalog)
    coll.catalogs.append(entry)
    if not coll.active_id:
        coll.active_id = cid
    save_collection(coll)
    return entry


def remove_catalog(catalog_id: str) -> bool:
    """Retire un catalogue. Retourne True si ok. Ne peut pas retirer le dernier."""
    coll = load_collection()
    if len(coll.catalogs) <= 1:
        return False
    coll.catalogs = [e for e in coll.catalogs if e.id != catalog_id]
    if coll.active_id == catalog_id:
        coll.active_id = coll.catalogs[0].id
    save_collection(coll)
    return True


def rename_catalog(catalog_id: str, new_name: str) -> bool:
    """Renomme un catalogue."""
    coll = load_collection()
    for i, entry in enumerate(coll.catalogs):
        if entry.id == catalog_id:
            coll.catalogs[i] = entry.model_copy(update={"name": new_name})
            save_collection(coll)
            return True
    return False
