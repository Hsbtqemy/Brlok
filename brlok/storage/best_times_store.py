# -*- coding: utf-8 -*-
"""Persistance des meilleurs temps par bloc (8.2)."""
from __future__ import annotations

import hashlib
import json
import logging
from datetime import datetime
from pathlib import Path

from brlok.models import Block

logger = logging.getLogger(__name__)


def _get_path() -> Path:
    from brlok.config.paths import get_best_times_path
    return get_best_times_path()


def _block_key(block: Block) -> str:
    """Clé unique pour un bloc (séquence de prises)."""
    seq = "|".join(h.id for h in block.holds)
    return hashlib.sha256(seq.encode()).hexdigest()[:16]


def load_best_times() -> dict[str, dict]:
    """Charge les meilleurs temps. {block_key: {seconds, date}}."""
    path = _get_path()
    if not path.exists():
        return {}
    try:
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
        return data.get("best_times", {})
    except (json.JSONDecodeError, OSError) as e:
        logger.warning("Meilleurs temps illisibles (%s): %s", path, e)
        return {}


def save_best_times(best_times: dict[str, dict]) -> None:
    """Sauvegarde les meilleurs temps."""
    path = _get_path()
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            json.dump({
                "version": 1,
                "updated_at": datetime.now().isoformat(),
                "best_times": best_times,
            }, f, ensure_ascii=False, indent=2)
    except (OSError, PermissionError) as e:
        logger.error("Impossible de sauvegarder best_times: %s", e)


def get_best_time(block: Block) -> float | None:
    """Retourne le meilleur temps (secondes) pour un bloc, ou None."""
    key = _block_key(block)
    data = load_best_times()
    entry = data.get(key)
    if entry and "seconds" in entry:
        return float(entry["seconds"])
    return None


def record_time_if_best(block: Block, seconds: float) -> bool:
    """Enregistre le temps si c'est un nouveau record. Retourne True si battu."""
    key = _block_key(block)
    data = load_best_times()
    current = data.get(key, {}).get("seconds")
    if current is not None and seconds >= current:
        return False
    data[key] = {
        "seconds": seconds,
        "date": datetime.now().isoformat(),
        "sequence": " → ".join(h.id for h in block.holds),
    }
    save_best_times(data)
    return True
