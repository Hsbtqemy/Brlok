# -*- coding: utf-8 -*-
"""Tests des exporteurs TXT, Markdown, JSON."""
from pathlib import Path

import pytest

from brlok.models import Block, Hold, Position, Session, SessionConstraints

from brlok.exports import export_json, export_markdown, export_txt


@pytest.fixture
def sample_session() -> Session:
    """Séance de test."""
    return Session(
        blocks=[
            Block(holds=[
                Hold(id="A1", level=2, tags=[], position=Position(row=0, col=0)),
                Hold(id="B2", level=2, tags=[], position=Position(row=1, col=1)),
            ]),
            Block(holds=[
                Hold(id="C3", level=3, tags=["crimp"], position=Position(row=2, col=2)),
            ]),
        ],
        constraints=SessionConstraints(target_level=2, variety=True),
    )


def test_export_txt(tmp_path: Path, sample_session: Session) -> None:
    """Export TXT : contenu lisible, UTF-8."""
    out = tmp_path / "session.txt"
    export_txt(sample_session, out)
    text = out.read_text(encoding="utf-8")
    assert "Séance d'entraînement Brlok" in text
    assert "Niveau cible: 2" in text
    assert "Bloc 1:" in text
    assert "1. A1" in text
    assert "2. B2" in text
    assert "Bloc 2:" in text
    assert "1. C3" in text


def test_export_markdown(tmp_path: Path, sample_session: Session) -> None:
    """Export Markdown : titres, listes."""
    out = tmp_path / "session.md"
    export_markdown(sample_session, out)
    text = out.read_text(encoding="utf-8")
    assert "# Séance d'entraînement Brlok" in text
    assert "## Bloc 1" in text
    assert "1. A1" in text
    assert "2. B2" in text
    assert "## Bloc 2" in text


def test_export_json(tmp_path: Path, sample_session: Session) -> None:
    """Export JSON : session autonome, rechargeable."""
    out = tmp_path / "session.json"
    export_json(sample_session, out)
    loaded = Session.model_validate_json(out.read_text(encoding="utf-8"))
    assert len(loaded.blocks) == 2
    assert loaded.blocks[0].holds[0].id == "A1"
    assert loaded.constraints.target_level == 2
