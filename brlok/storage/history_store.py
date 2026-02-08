# -*- coding: utf-8 -*-
"""Persistance de l'historique des séances (7.4)."""
from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime
from pathlib import Path

from pydantic import ValidationError

from brlok.models import CompletedSession, Session

logger = logging.getLogger(__name__)


def _get_history_path() -> Path:
    """Chemin du fichier historique."""
    from brlok.config.paths import get_history_path
    return get_history_path()


def load_history() -> list[CompletedSession]:
    """Charge l'historique des séances depuis le fichier JSON."""
    path = _get_history_path()
    if not path.exists():
        return []

    try:
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
    except (json.JSONDecodeError, OSError, PermissionError) as e:
        logger.warning("Historique illisible (%s) : %s", path, e)
        return []

    if "sessions" not in data:
        return []

    result: list[CompletedSession] = []
    for item in data["sessions"]:
        try:
            result.append(CompletedSession.model_validate(item))
        except ValidationError as e:
            logger.warning("Entrée historique corrompue : %s", e)
    return result


def save_history(sessions: list[CompletedSession]) -> None:
    """Sauvegarde l'historique en JSON."""
    path = _get_history_path()
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        file_data = {
            "version": 1,
            "updated_at": datetime.now().isoformat(),
            "sessions": [s.model_dump(mode="json") for s in sessions],
        }
        with open(path, "w", encoding="utf-8") as f:
            json.dump(file_data, f, ensure_ascii=False, indent=2)
    except (OSError, PermissionError) as e:
        logger.error("Impossible de sauvegarder l'historique dans %s: %s", path, e)


def add_to_history(session: Session, block_statuses: dict[int, str]) -> CompletedSession:
    """Ajoute une séance terminée à l'historique. Retourne l'entrée créée."""
    sessions = load_history()
    entry = CompletedSession(
        id=str(uuid.uuid4()),
        date=datetime.now(),
        session=session,
        block_statuses=dict(block_statuses),
    )
    sessions.insert(0, entry)
    save_history(sessions)
    return entry


def get_by_id(session_id: str) -> CompletedSession | None:
    """Retourne une séance par son id."""
    for s in load_history():
        if s.id == session_id:
            return s
    return None
