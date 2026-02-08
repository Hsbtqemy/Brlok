# -*- coding: utf-8 -*-
"""Tests de la sous-commande favorites."""
from unittest.mock import patch

from typer.testing import CliRunner

from brlok.cli.commands import app
from brlok.models import Block, Hold, Position

runner = CliRunner()


def test_favorites_list_empty() -> None:
    """favorites list avec aucun favori."""
    with patch("brlok.cli.commands.load_favorites", return_value=[]):
        result = runner.invoke(app, ["favorites", "list"])
        assert result.exit_code == 0
        assert "aucun favori" in result.output


def test_favorites_list_with_blocks() -> None:
    """favorites list affiche les blocs."""
    blocks = [
        Block(holds=[Hold(id="A1", level=2, tags=[], position=Position(row=0, col=0))]),
        Block(holds=[
            Hold(id="B2", level=2, tags=[], position=Position(row=1, col=1)),
            Hold(id="C3", level=3, tags=[], position=Position(row=2, col=2)),
        ]),
    ]
    with patch("brlok.cli.commands.load_favorites", return_value=blocks):
        result = runner.invoke(app, ["favorites", "list"])
        assert result.exit_code == 0
        assert "A1" in result.output
        assert "B2" in result.output
        assert "C3" in result.output
