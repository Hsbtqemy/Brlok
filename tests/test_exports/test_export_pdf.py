# -*- coding: utf-8 -*-
"""Tests de l'export PDF (Story 5.4)."""
from pathlib import Path

import pytest

from brlok.models import Block, Hold, Position, Session, SessionConstraints

from brlok.exports import export_pdf


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


def test_export_pdf(tmp_path: Path, sample_session: Session) -> None:
    """Export PDF : fichier créé, en-tête PDF valide."""
    out = tmp_path / "session.pdf"
    export_pdf(sample_session, out)
    assert out.exists()
    content = out.read_bytes()
    assert content.startswith(b"%PDF")
    assert len(content) > 500
