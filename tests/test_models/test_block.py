# -*- coding: utf-8 -*-
"""Tests du modèle Block."""
import pytest
from pydantic import ValidationError

from brlok.models import Block, Hold, Position


def test_block_creation_valide() -> None:
    """Création valide d'un Block avec séquence ordonnée."""
    holds = [
        Hold(id="A1", level=2, tags=["crimp"], position=Position(row=0, col=0)),
        Hold(id="B2", level=3, tags=[], position=Position(row=1, col=1)),
    ]
    block = Block(holds=holds)
    assert len(block.holds) == 2
    assert block.holds[0].id == "A1"
    assert block.holds[1].id == "B2"


def test_block_sequence_ordonnee() -> None:
    """La séquence est préservée (ordre)."""
    holds = [
        Hold(id="C7", level=4, tags=[], position=Position(row=2, col=6)),
        Hold(id="A1", level=1, tags=[], position=Position(row=0, col=0)),
    ]
    block = Block(holds=holds)
    assert block.holds[0].id == "C7"
    assert block.holds[1].id == "A1"


def test_block_une_seule_prise() -> None:
    """Block avec une seule prise valide."""
    block = Block(
        holds=[Hold(id="A1", level=2, tags=[], position=Position(row=0, col=0))]
    )
    assert len(block.holds) == 1
    assert block.holds[0].id == "A1"


def test_block_vide_rejete() -> None:
    """Block vide rejeté."""
    with pytest.raises(ValueError, match="au moins une prise"):
        Block(holds=[])


def test_block_deserialisation_dict() -> None:
    """Block désérialisable depuis dict (JSON-ready)."""
    data = {
        "holds": [
            {
                "id": "A1",
                "level": 2,
                "tags": [],
                "position": {"row": 0, "col": 0},
                "active": True,
            },
            {
                "id": "B2",
                "level": 3,
                "tags": ["sloper"],
                "position": {"row": 1, "col": 1},
                "active": True,
            },
        ]
    }
    block = Block.model_validate(data)
    assert len(block.holds) == 2
    assert block.holds[0].id == "A1"
    assert block.holds[1].id == "B2"
