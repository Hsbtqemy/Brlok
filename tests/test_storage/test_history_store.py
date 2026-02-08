# -*- coding: utf-8 -*-
"""Tests du stockage historique (7.4)."""
from datetime import datetime
from unittest.mock import patch

import pytest

from brlok.models import Block, CompletedSession, Hold, Position, Session, SessionConstraints
from brlok.storage.history_store import add_to_history, get_by_id, load_history, save_history


def _make_session(n_blocks: int = 2) -> Session:
    """Crée une session de test."""
    holds1 = [
        Hold(id="A1", level=2, tags=[], position=Position(row=0, col=0)),
        Hold(id="B2", level=3, tags=[], position=Position(row=1, col=1)),
    ]
    holds2 = [
        Hold(id="C3", level=2, tags=[], position=Position(row=2, col=2)),
    ]
    blocks = [
        Block(holds=holds1, comment="Bloc 1 bien réussi"),
        Block(holds=holds2),
    ][:n_blocks]
    return Session(
        blocks=blocks,
        constraints=SessionConstraints(target_level=2, enchainements=5),
    )


def test_load_history_empty(tmp_path: pytest.TempPathFactory) -> None:
    """Historique vide si fichier absent."""
    with patch("brlok.storage.history_store._get_history_path", return_value=tmp_path / "absent.json"):
        assert load_history() == []


def test_add_and_load_history(tmp_path: pytest.TempPathFactory) -> None:
    """Ajout et chargement d'une séance."""
    path = tmp_path / "sessions.json"
    with patch("brlok.storage.history_store._get_history_path", return_value=path):
        session = _make_session()
        entry = add_to_history(session, {0: "success", 1: "fail"})
        assert entry.id
        assert entry.session.blocks == session.blocks
        assert entry.block_statuses == {0: "success", 1: "fail"}

        loaded = load_history()
        assert len(loaded) == 1
        assert loaded[0].id == entry.id
        assert loaded[0].block_statuses[0] == "success"
        assert loaded[0].session.blocks[0].comment == "Bloc 1 bien réussi"


def test_get_by_id(tmp_path: pytest.TempPathFactory) -> None:
    """Récupération par id."""
    path = tmp_path / "sessions.json"
    with patch("brlok.storage.history_store._get_history_path", return_value=path):
        session = _make_session()
        entry = add_to_history(session, {})
        found = get_by_id(entry.id)
        assert found is not None
        assert found.id == entry.id
        assert get_by_id("inexistant") is None
