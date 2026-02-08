# -*- coding: utf-8 -*-
"""Persistance des favoris (fichier favorites.json, XDG)."""
from __future__ import annotations

import json
import logging
from datetime import datetime
from pathlib import Path

from pydantic import ValidationError

from brlok.models import Block

logger = logging.getLogger(__name__)


def _get_favorites_path() -> Path:
    """Chemin du fichier favoris."""
    from brlok.config.paths import get_favorites_path
    return get_favorites_path()


def load_favorites() -> list[Block]:
    """Charge la liste des blocs favoris depuis le fichier JSON."""
    path = _get_favorites_path()
    if not path.exists():
        return []

    try:
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
    except (json.JSONDecodeError, OSError, PermissionError) as e:
        logger.warning("Favoris illisibles (%s) : %s", path, e)
        return []

    if "blocks" not in data:
        return []

    try:
        blocks = [Block.model_validate(b) for b in data["blocks"]]
        return blocks
    except ValidationError as e:
        logger.warning("Favoris corrompus (%s) : %s", path, e)
        return []


def save_favorites(blocks: list[Block]) -> None:
    """Sauvegarde la liste des blocs favoris en JSON."""
    path = _get_favorites_path()
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        file_data = {
            "version": 1,
            "updated_at": datetime.now().isoformat(),
            "blocks": [b.model_dump(mode="json") for b in blocks],
        }
        with open(path, "w", encoding="utf-8") as f:
            json.dump(file_data, f, ensure_ascii=False, indent=2)
    except (OSError, PermissionError) as e:
        logger.error("Impossible de sauvegarder les favoris dans %s: %s", path, e)


def _block_sequence_key(block: Block) -> tuple[str, ...]:
    """Clé de comparaison pour détecter les doublons (même séquence de prises)."""
    return tuple(h.id for h in block.holds)


def remove_favorite(block_index: int, existing: list[Block] | None = None) -> list[Block]:
    """Retire un bloc des favoris par index (0-based). Retourne la nouvelle liste."""
    blocks = (existing or load_favorites()).copy()
    if not (0 <= block_index < len(blocks)):
        return blocks
    blocks.pop(block_index)
    save_favorites(blocks)
    return blocks


def add_favorite(block: Block, existing: list[Block] | None = None) -> list[Block]:
    """Ajoute un bloc aux favoris. Retourne la nouvelle liste.

    Ignore si un bloc identique (même séquence de prises) est déjà en favoris.
    """
    blocks = (existing or load_favorites()).copy()
    key = _block_sequence_key(block)
    if any(_block_sequence_key(b) == key for b in blocks):
        return blocks
    blocks.append(block)
    save_favorites(blocks)
    return blocks
