# -*- coding: utf-8 -*-
"""Persistance des favoris (fichier favorites.json, XDG).

Depuis v2 : favoris par catalogue (chaque catalogue a ses propres favoris).
"""
from __future__ import annotations

import json
import logging
from datetime import datetime
from pathlib import Path

from pydantic import ValidationError

from brlok.models import Block

logger = logging.getLogger(__name__)


def make_favorite_title(
    target_level: int | None = None,
    date: datetime | None = None,
    block_index: int | None = None,
) -> str:
    """Génère un titre pour un favori : date, difficulté, etc."""
    from brlok.config.difficulty import get_difficulty_display_name

    parts: list[str] = []
    d = date or datetime.now()
    parts.append(d.strftime("%Y-%m-%d"))
    if target_level is not None:
        parts.append(get_difficulty_display_name(target_level))
    if block_index is not None:
        parts.append(f"#{(block_index + 1)}")
    return " ".join(parts)


def _get_favorites_path() -> Path:
    """Chemin du fichier favoris."""
    from brlok.config.paths import get_favorites_path
    return get_favorites_path()


def _get_active_catalog_id() -> str:
    """ID du catalogue actif (pour migration et appel sans catalog_id)."""
    from brlok.storage.catalog_collection_store import load_collection
    coll = load_collection()
    return coll.active_id or (coll.catalogs[0].id if coll.catalogs else "default")


def _load_raw() -> dict:
    """Charge le fichier brut (pour migration)."""
    path = _get_favorites_path()
    if not path.exists():
        return {}
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (json.JSONDecodeError, OSError, PermissionError) as e:
        logger.warning("Favoris illisibles (%s) : %s", path, e)
        return {}


def _save_raw(data: dict) -> None:
    """Sauvegarde le fichier brut."""
    path = _get_favorites_path()
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
    except (OSError, PermissionError) as e:
        logger.error("Impossible de sauvegarder les favoris dans %s: %s", path, e)


def load_favorites(catalog_id: str | None = None) -> list[Block]:
    """Charge la liste des blocs favoris pour un catalogue.
    Si catalog_id est None, utilise le catalogue actif."""
    cid = catalog_id or _get_active_catalog_id()
    data = _load_raw()

    if "by_catalog" in data:
        raw = data["by_catalog"].get(cid, [])
    elif "blocks" in data:
        raw = data["blocks"]
        if raw and cid:
            _migrate_to_by_catalog(data, cid)
    else:
        return []

    try:
        return [Block.model_validate(b) for b in raw]
    except ValidationError as e:
        logger.warning("Favoris corrompus pour %s: %s", cid, e)
        return []


def _migrate_to_by_catalog(data: dict, assign_to_catalog_id: str) -> None:
    """Migration v1 -> v2 : déplace blocks vers by_catalog."""
    blocks = data.get("blocks", [])
    if not blocks:
        return
    by_catalog = data.get("by_catalog", {})
    by_catalog[assign_to_catalog_id] = blocks
    data["by_catalog"] = by_catalog
    data["version"] = 2
    data["updated_at"] = datetime.now().isoformat()
    if "blocks" in data:
        del data["blocks"]
    _save_raw(data)


def save_favorites(catalog_id: str | None, blocks: list[Block]) -> None:
    """Sauvegarde les blocs favoris pour un catalogue. Si catalog_id est None, utilise l'actif."""
    cid = catalog_id or _get_active_catalog_id()
    data = _load_raw()
    if "by_catalog" not in data:
        data["by_catalog"] = {}
        data["version"] = 2
    data["by_catalog"][cid] = [b.model_dump(mode="json") for b in blocks]
    data["updated_at"] = datetime.now().isoformat()
    _save_raw(data)


def _block_sequence_key(block: Block) -> tuple[str, ...]:
    """Clé de comparaison pour détecter les doublons (même séquence de prises)."""
    return tuple(h.id for h in block.holds)


def remove_favorite(
    block_index: int,
    catalog_id: str | None = None,
    existing: list[Block] | None = None,
) -> list[Block]:
    """Retire un bloc des favoris par index (0-based). Retourne la nouvelle liste."""
    cid = catalog_id or _get_active_catalog_id()
    blocks = (existing or load_favorites(cid)).copy()
    if not (0 <= block_index < len(blocks)):
        return blocks
    blocks.pop(block_index)
    save_favorites(cid, blocks)
    return blocks


def merge_favorites_from_file(path: Path, catalog_id: str | None = None) -> int:
    """Fusionne les blocs du fichier avec les favoris du catalogue.
    Retourne le nombre de blocs ajoutés."""
    if not path.exists():
        return 0
    try:
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
    except (json.JSONDecodeError, OSError, PermissionError):
        return 0
    blocks_data = data.get("blocks", [])
    if not blocks_data:
        return 0
    cid = catalog_id or _get_active_catalog_id()
    existing = load_favorites(cid)
    seen_keys = {_block_sequence_key(b) for b in existing}
    added = 0
    for item in blocks_data:
        try:
            block = Block.model_validate(item)
            key = _block_sequence_key(block)
            if key not in seen_keys:
                existing.append(block)
                seen_keys.add(key)
                added += 1
        except ValidationError:
            pass
    if added:
        save_favorites(cid, existing)
    return added


def export_favorites_to_file(path: Path, catalog_id: str | None = None) -> None:
    """Exporte les favoris du catalogue vers un fichier JSON."""
    cid = catalog_id or _get_active_catalog_id()
    blocks = load_favorites(cid)
    path.parent.mkdir(parents=True, exist_ok=True)
    file_data = {
        "version": 1,
        "updated_at": datetime.now().isoformat(),
        "blocks": [b.model_dump(mode="json") for b in blocks],
    }
    with open(path, "w", encoding="utf-8") as f:
        json.dump(file_data, f, ensure_ascii=False, indent=2)


def add_favorite(
    block: Block,
    catalog_id: str | None = None,
    existing: list[Block] | None = None,
    title: str | None = None,
) -> list[Block]:
    """Ajoute un bloc aux favoris du catalogue. Retourne la nouvelle liste.

    Ignore si un bloc identique (même séquence de prises) est déjà en favoris.
    Si title est fourni, il est utilisé pour le bloc (sinon garde block.title).
    """
    cid = catalog_id or _get_active_catalog_id()
    blocks = (existing or load_favorites(cid)).copy()
    key = _block_sequence_key(block)
    if any(_block_sequence_key(b) == key for b in blocks):
        return blocks
    to_add = block
    if title is not None:
        to_add = block.model_copy(update={"title": title})
    blocks.append(to_add)
    save_favorites(cid, blocks)
    return blocks
