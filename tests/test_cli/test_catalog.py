# -*- coding: utf-8 -*-
"""Tests de la sous-commande catalog."""
from pathlib import Path
from unittest.mock import patch

from typer.testing import CliRunner

from brlok.cli.commands import app
from brlok.models import Catalog, GridDimensions, Hold, Position

runner = CliRunner()


def test_catalog_list_empty(tmp_path: Path) -> None:
    """catalog list avec catalogue vide."""
    with patch("brlok.cli.commands.load_catalog") as mock_load:
        mock_load.return_value = Catalog(holds=[], grid=GridDimensions(rows=4, cols=8))
        result = runner.invoke(app, ["catalog", "list"])
        assert result.exit_code == 0
        assert "4×8" in result.output
        assert "aucune prise" in result.output


def test_catalog_list_with_holds(tmp_path: Path) -> None:
    """catalog list avec prises."""
    catalog = Catalog(
        holds=[
            Hold(id="A1", level=2, tags=["crimp"], position=Position(row=0, col=0)),
            Hold(id="B3", level=4, tags=[], position=Position(row=1, col=2), active=False),
        ],
        grid=GridDimensions(rows=5, cols=10),
    )
    with patch("brlok.cli.commands.load_catalog", return_value=catalog):
        result = runner.invoke(app, ["catalog", "list"])
        assert result.exit_code == 0
        assert "5×10" in result.output
        assert "A1" in result.output
        assert "B3" in result.output
        assert "crimp" in result.output
        assert "actif: non" in result.output


def test_catalog_edit_level(tmp_path: Path) -> None:
    """catalog edit modifie le niveau et sauvegarde."""
    catalog = Catalog(
        holds=[Hold(id="A1", level=2, tags=[], position=Position(row=0, col=0))],
        grid=GridDimensions(rows=4, cols=8),
    )
    with patch("brlok.cli.commands.load_catalog", return_value=catalog):
        with patch("brlok.cli.commands.save_catalog") as mock_save:
            result = runner.invoke(app, ["catalog", "edit", "A1", "--level", "4"])
            assert result.exit_code == 0
            assert "niveau 4" in result.output
            mock_save.assert_called_once()
            saved_catalog = mock_save.call_args[0][0]
            assert saved_catalog.holds[0].level == 4


def test_catalog_edit_tags() -> None:
    """catalog edit --tags modifie les tags."""
    catalog = Catalog(
        holds=[Hold(id="A1", level=2, tags=["old"], position=Position(row=0, col=0))],
        grid=GridDimensions(rows=4, cols=8),
    )
    with patch("brlok.cli.commands.load_catalog", return_value=catalog):
        with patch("brlok.cli.commands.save_catalog") as mock_save:
            result = runner.invoke(app, ["catalog", "edit", "A1", "--tags", "crimp,sloper"])
            assert result.exit_code == 0
            assert "tags" in result.output
            mock_save.assert_called_once()
            saved_catalog = mock_save.call_args[0][0]
            assert saved_catalog.holds[0].tags == ["crimp", "sloper"]


def test_catalog_edit_level_invalid() -> None:
    """catalog edit avec --level invalide (99) → erreur."""
    catalog = Catalog(
        holds=[Hold(id="A1", level=2, tags=[], position=Position(row=0, col=0))],
        grid=GridDimensions(rows=4, cols=8),
    )
    with patch("brlok.cli.commands.load_catalog", return_value=catalog):
        result = runner.invoke(app, ["catalog", "edit", "A1", "--level", "99"])
        assert result.exit_code == 1
        assert "Niveau invalide" in result.output
        assert "1" in result.output and "5" in result.output


def test_catalog_edit_hold_not_found() -> None:
    """catalog edit avec hold inexistant → erreur."""
    catalog = Catalog(holds=[], grid=GridDimensions(rows=4, cols=8))
    with patch("brlok.cli.commands.load_catalog", return_value=catalog):
        result = runner.invoke(app, ["catalog", "edit", "X99", "--level", "3"])
        assert result.exit_code == 1
        assert "non trouvé" in result.output


def test_catalog_edit_hold_not_found_with_tags() -> None:
    """catalog edit avec hold inexistant et --tags → erreur."""
    catalog = Catalog(holds=[], grid=GridDimensions(rows=4, cols=8))
    with patch("brlok.cli.commands.load_catalog", return_value=catalog):
        result = runner.invoke(app, ["catalog", "edit", "X99", "--tags", "crimp"])
        assert result.exit_code == 1
        assert "non trouvé" in result.output


def test_catalog_edit_active() -> None:
    """catalog edit --active active la prise."""
    catalog = Catalog(
        holds=[Hold(id="A1", level=2, tags=[], position=Position(row=0, col=0), active=False)],
        grid=GridDimensions(rows=4, cols=8),
    )
    with patch("brlok.cli.commands.load_catalog", return_value=catalog):
        with patch("brlok.cli.commands.save_catalog") as mock_save:
            result = runner.invoke(app, ["catalog", "edit", "A1", "--active"])
            assert result.exit_code == 0
            mock_save.assert_called_once()
            saved_catalog = mock_save.call_args[0][0]
            assert saved_catalog.holds[0].active is True


def test_catalog_edit_no_active() -> None:
    """catalog edit --no-active désactive la prise."""
    catalog = Catalog(
        holds=[Hold(id="A1", level=2, tags=[], position=Position(row=0, col=0), active=True)],
        grid=GridDimensions(rows=4, cols=8),
    )
    with patch("brlok.cli.commands.load_catalog", return_value=catalog):
        with patch("brlok.cli.commands.save_catalog") as mock_save:
            result = runner.invoke(app, ["catalog", "edit", "A1", "--no-active"])
            assert result.exit_code == 0
            mock_save.assert_called_once()
            saved_catalog = mock_save.call_args[0][0]
            assert saved_catalog.holds[0].active is False


def test_catalog_edit_hold_not_found_with_active() -> None:
    """catalog edit avec hold inexistant et --active → erreur."""
    catalog = Catalog(holds=[], grid=GridDimensions(rows=4, cols=8))
    with patch("brlok.cli.commands.load_catalog", return_value=catalog):
        result = runner.invoke(app, ["catalog", "edit", "X99", "--active"])
        assert result.exit_code == 1
        assert "non trouvé" in result.output


def test_catalog_list_grille_positions() -> None:
    """Grille et positions affichées correctement."""
    catalog = Catalog(
        holds=[
            Hold(id="C7", level=3, tags=[], position=Position(row=2, col=6)),
            Hold(id="A1", level=1, tags=[], position=Position(row=0, col=0)),
        ],
        grid=GridDimensions(rows=4, cols=8),
    )
    with patch("brlok.cli.commands.load_catalog", return_value=catalog):
        result = runner.invoke(app, ["catalog", "list"])
        assert result.exit_code == 0
        assert "4×8" in result.output
        assert "(0,0)" in result.output
        assert "(2,6)" in result.output
        # Tri par position : A1 (0,0) avant C7 (2,6)
        assert result.output.index("A1") < result.output.index("C7")
