# -*- coding: utf-8 -*-
"""Tests de la sous-commande export."""
from pathlib import Path

from typer.testing import CliRunner

from brlok.cli.commands import app
from brlok.models import Block, Hold, Position, Session, SessionConstraints

runner = CliRunner()


def test_export_txt(tmp_path: Path) -> None:
    """export txt convertit une session JSON en TXT."""
    session = Session(
        blocks=[
            Block(holds=[
                Hold(id="A1", level=2, tags=[], position=Position(row=0, col=0)),
            ]),
        ],
    )
    json_path = tmp_path / "session.json"
    txt_path = tmp_path / "session.txt"
    json_path.write_text(session.model_dump_json(), encoding="utf-8")
    result = runner.invoke(app, ["export", "txt", str(json_path), "-o", str(txt_path)])
    assert result.exit_code == 0
    assert "Exporté" in result.output
    assert txt_path.exists()
    assert "Séance d'entraînement Brlok" in txt_path.read_text(encoding="utf-8")


def test_export_md(tmp_path: Path) -> None:
    """export md convertit une session JSON en Markdown."""
    session = Session(
        blocks=[
            Block(holds=[
                Hold(id="A1", level=2, tags=[], position=Position(row=0, col=0)),
            ]),
        ],
    )
    json_path = tmp_path / "session.json"
    md_path = tmp_path / "session.md"
    json_path.write_text(session.model_dump_json(), encoding="utf-8")
    result = runner.invoke(app, ["export", "md", str(json_path), "-o", str(md_path)])
    assert result.exit_code == 0
    assert md_path.exists()
    assert "# Séance" in md_path.read_text(encoding="utf-8")


def test_export_json(tmp_path: Path) -> None:
    """export json copie/convertit une session JSON."""
    session = Session(
        blocks=[
            Block(holds=[
                Hold(id="A1", level=2, tags=[], position=Position(row=0, col=0)),
            ]),
        ],
    )
    json_in = tmp_path / "in.json"
    json_out = tmp_path / "out.json"
    json_in.write_text(session.model_dump_json(), encoding="utf-8")
    result = runner.invoke(app, ["export", "json", str(json_in), "-o", str(json_out)])
    assert result.exit_code == 0
    assert json_out.exists()
    loaded = Session.model_validate_json(json_out.read_text(encoding="utf-8"))
    assert loaded.blocks[0].holds[0].id == "A1"


def test_export_file_not_found() -> None:
    """export avec fichier absent → erreur."""
    result = runner.invoke(app, ["export", "txt", "absent.json", "-o", "out.txt"])
    assert result.exit_code == 1
    assert "introuvable" in result.output
