# -*- coding: utf-8 -*-
"""Tests du stockage des favoris."""
import json
from pathlib import Path
from unittest.mock import patch

from brlok.models import Block, Hold, Position

from brlok.storage.favorites_store import add_favorite, load_favorites, remove_favorite, save_favorites


def test_save_json_contains_version(tmp_path: Path) -> None:
    """JSON sauvegardé contient version et blocks (FR22)."""
    with patch("brlok.storage.favorites_store._get_favorites_path", return_value=tmp_path / "favorites.json"):
        blocks = [
            Block(holds=[Hold(id="A1", level=2, tags=[], position=Position(row=0, col=0))]),
        ]
        save_favorites(blocks)
        with open(tmp_path / "favorites.json", encoding="utf-8") as f:
            data = json.load(f)
        assert "version" in data
        assert "blocks" in data


def test_save_and_load_favorites(tmp_path: Path) -> None:
    """Save puis load — round-trip liste de blocs."""
    with patch("brlok.storage.favorites_store._get_favorites_path", return_value=tmp_path / "favorites.json"):
        blocks = [
            Block(holds=[Hold(id="A1", level=2, tags=[], position=Position(row=0, col=0))]),
            Block(holds=[
                Hold(id="B2", level=2, tags=[], position=Position(row=1, col=1)),
                Hold(id="C3", level=3, tags=[], position=Position(row=2, col=2)),
            ]),
        ]
        save_favorites(blocks)
        loaded = load_favorites()
        assert len(loaded) == 2
        assert len(loaded[0].holds) == 1
        assert loaded[0].holds[0].id == "A1"
        assert len(loaded[1].holds) == 2
        assert loaded[1].holds[0].id == "B2"


def test_load_empty_returns_list(tmp_path: Path) -> None:
    """Fichier absent → liste vide."""
    with patch("brlok.storage.favorites_store._get_favorites_path", return_value=tmp_path / "absent.json"):
        assert load_favorites() == []


def test_add_favorite(tmp_path: Path) -> None:
    """add_favorite ajoute et sauvegarde."""
    with patch("brlok.storage.favorites_store._get_favorites_path", return_value=tmp_path / "favorites.json"):
        block = Block(holds=[Hold(id="A1", level=2, tags=[], position=Position(row=0, col=0))])
        result = add_favorite(block)
        assert len(result) == 1
        assert load_favorites()[0].holds[0].id == "A1"


def test_remove_favorite(tmp_path: Path) -> None:
    """remove_favorite retire un bloc par index."""
    with patch("brlok.storage.favorites_store._get_favorites_path", return_value=tmp_path / "favorites.json"):
        b1 = Block(holds=[Hold(id="A1", level=2, tags=[], position=Position(row=0, col=0))])
        b2 = Block(holds=[Hold(id="B2", level=2, tags=[], position=Position(row=1, col=1))])
        add_favorite(b1)
        add_favorite(b2)
        remove_favorite(0)
        loaded = load_favorites()
        assert len(loaded) == 1
        assert loaded[0].holds[0].id == "B2"


def test_add_favorite_duplicate_ignored(tmp_path: Path) -> None:
    """add_favorite n'ajoute pas un bloc identique (même séquence) déjà en favoris."""
    with patch("brlok.storage.favorites_store._get_favorites_path", return_value=tmp_path / "favorites.json"):
        hold = Hold(id="A1", level=2, tags=[], position=Position(row=0, col=0))
        block = Block(holds=[hold])
        add_favorite(block)
        # Même séquence (A1), positions différentes — ignoré
        block2 = Block(holds=[Hold(id="A1", level=3, tags=["x"], position=Position(row=1, col=1))])
        result = add_favorite(block2)
        assert len(result) == 1
        assert load_favorites()[0].holds[0].id == "A1"
