# -*- coding: utf-8 -*-
"""Tests du modèle Session."""
from brlok.models import Block, Hold, Position, Session, SessionConstraints


def test_session_creation_valide() -> None:
    """Création valide d'une Session."""
    block = Block(
        holds=[
            Hold(id="A1", level=2, tags=[], position=Position(row=0, col=0)),
            Hold(id="B2", level=3, tags=[], position=Position(row=1, col=1)),
        ]
    )
    session = Session(blocks=[block])
    assert len(session.blocks) == 1
    assert len(session.blocks[0].holds) == 2
    assert session.constraints.target_level is None
    assert session.constraints.required_tags == []
    assert session.constraints.variety is False


def test_session_plusieurs_blocs() -> None:
    """Session avec plusieurs blocs."""
    b1 = Block(holds=[Hold(id="A1", level=2, tags=[], position=Position(row=0, col=0))])
    b2 = Block(holds=[Hold(id="C7", level=4, tags=[], position=Position(row=2, col=6))])
    session = Session(blocks=[b1, b2])
    assert len(session.blocks) == 2
    assert session.blocks[0].holds[0].id == "A1"
    assert session.blocks[1].holds[0].id == "C7"


def test_session_avec_contraintes() -> None:
    """Session avec contraintes de génération."""
    constraints = SessionConstraints(
        target_level=3,
        required_tags=["crimp"],
        excluded_tags=[],
        variety=True,
    )
    block = Block(
        holds=[Hold(id="A1", level=3, tags=["crimp"], position=Position(row=0, col=0))]
    )
    session = Session(blocks=[block], constraints=constraints)
    assert session.constraints.target_level == 3
    assert session.constraints.required_tags == ["crimp"]
    assert session.constraints.variety is True


def test_session_vide() -> None:
    """Session sans blocs (séance vide)."""
    session = Session(blocks=[])
    assert len(session.blocks) == 0
    assert session.constraints.target_level is None


def test_session_constraints_default() -> None:
    """SessionConstraints par défaut."""
    constraints = SessionConstraints()
    assert constraints.target_level is None
    assert constraints.required_tags == []
    assert constraints.excluded_tags == []
    assert constraints.variety is False


def test_session_deserialisation_dict() -> None:
    """Session désérialisable depuis dict (JSON-ready)."""
    data = {
        "blocks": [
            {
                "holds": [
                    {
                        "id": "A1",
                        "level": 2,
                        "tags": [],
                        "position": {"row": 0, "col": 0},
                        "active": True,
                    },
                ]
            },
        ],
        "constraints": {
            "target_level": 3,
            "required_tags": [],
            "excluded_tags": [],
            "variety": False,
        },
    }
    session = Session.model_validate(data)
    assert len(session.blocks) == 1
    assert session.blocks[0].holds[0].id == "A1"
    assert session.constraints.target_level == 3
