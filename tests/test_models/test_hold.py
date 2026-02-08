# -*- coding: utf-8 -*-
"""Tests du modèle Hold."""
import pytest
from pydantic import ValidationError

from brlok.models import Hold, Position


def test_hold_creation_valide() -> None:
    """Création valide d'un Hold."""
    hold = Hold(
        id="A1",
        level=3,
        tags=["crimp"],
        position=Position(row=0, col=0),
        active=True,
    )
    assert hold.id == "A1"
    assert hold.level == 3
    assert hold.tags == ["crimp"]
    assert hold.position.row == 0
    assert hold.position.col == 0
    assert hold.active is True


def test_hold_with_default_active() -> None:
    """active par défaut est True."""
    hold = Hold(
        id="C7",
        level=2,
        tags=[],
        position=Position(row=2, col=6),
    )
    assert hold.active is True


def test_hold_tags_vides_valide() -> None:
    """tags vide est accepté."""
    hold = Hold(
        id="B3",
        level=4,
        tags=[],
        position=Position(row=1, col=2),
    )
    assert hold.tags == []


def test_hold_tags_plusieurs() -> None:
    """Plusieurs tags."""
    hold = Hold(
        id="A1",
        level=1,
        tags=["crimp", "gauche", "sloper"],
        position=Position(row=0, col=0),
    )
    assert hold.tags == ["crimp", "gauche", "sloper"]


def test_hold_level_valide_1_a_5() -> None:
    """level accepte 1 à 5."""
    for level in range(1, 6):
        hold = Hold(
            id="A1",
            level=level,
            tags=[],
            position=Position(row=0, col=0),
        )
        assert hold.level == level


def test_hold_level_hors_1_5_rejete() -> None:
    """level hors 1-5 rejeté."""
    with pytest.raises(ValidationError):
        Hold(
            id="A1",
            level=0,
            tags=[],
            position=Position(row=0, col=0),
        )
    with pytest.raises(ValidationError):
        Hold(
            id="A1",
            level=6,
            tags=[],
            position=Position(row=0, col=0),
        )


def test_hold_position_invalide_negatif_rejete() -> None:
    """Position négative rejetée."""
    with pytest.raises(ValidationError):
        Hold(
            id="A1",
            level=3,
            tags=[],
            position=Position(row=-1, col=0),
        )


def test_hold_id_vide_rejete() -> None:
    """id vide rejeté."""
    with pytest.raises(ValidationError):
        Hold(
            id="",
            level=3,
            tags=[],
            position=Position(row=0, col=0),
        )


def test_hold_active_false() -> None:
    """active=False pour prise inactivable."""
    hold = Hold(
        id="A1",
        level=3,
        tags=[],
        position=Position(row=0, col=0),
        active=False,
    )
    assert hold.active is False


def test_position_creation() -> None:
    """Position avec row et col."""
    pos = Position(row=2, col=7)
    assert pos.row == 2
    assert pos.col == 7


def test_position_deserialisation_dict() -> None:
    """Position désérialisable depuis dict (JSON-ready)."""
    data = {"row": 2, "col": 5}
    pos = Position.model_validate(data)
    assert pos.row == 2
    assert pos.col == 5


def test_hold_deserialisation_dict() -> None:
    """Hold désérialisable depuis dict (JSON-ready)."""
    data = {
        "id": "B3",
        "level": 2,
        "tags": ["sloper"],
        "position": {"row": 1, "col": 2},
        "active": True,
    }
    hold = Hold.model_validate(data)
    assert hold.id == "B3"
    assert hold.level == 2
    assert hold.tags == ["sloper"]
    assert hold.position.row == 1
    assert hold.position.col == 2
    assert hold.active is True
