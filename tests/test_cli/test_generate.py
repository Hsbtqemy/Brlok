# -*- coding: utf-8 -*-
"""Tests de la sous-commande generate."""
import json
from pathlib import Path
from unittest.mock import patch

from typer.testing import CliRunner

from brlok.cli.commands import app
from brlok.models import Catalog, GridDimensions, Hold, Position

runner = CliRunner()


def test_generate_with_level() -> None:
    """generate --level génère une séance."""
    catalog = Catalog(
        holds=[
            Hold(id="A1", level=2, tags=[], position=Position(row=0, col=0)),
            Hold(id="B2", level=2, tags=[], position=Position(row=1, col=1)),
        ],
        grid=GridDimensions(rows=4, cols=8),
    )
    with patch("brlok.cli.commands.load_catalog", return_value=catalog):
        result = runner.invoke(app, ["generate", "--level", "2"])
        assert result.exit_code == 0
        assert "Séance générée" in result.output
        assert "blocs" in result.output
        assert "niveau 2" in result.output


def test_generate_level_invalide() -> None:
    """generate avec --level invalide → erreur."""
    result = runner.invoke(app, ["generate", "--level", "99"])
    assert result.exit_code == 1
    assert "Niveau invalide" in result.output


def test_generate_with_blocks_option() -> None:
    """generate --blocks spécifie le nombre de blocs."""
    catalog = Catalog(
        holds=[
            Hold(id="A1", level=2, tags=[], position=Position(row=0, col=0)),
            Hold(id="B2", level=2, tags=[], position=Position(row=1, col=1)),
            Hold(id="C3", level=2, tags=[], position=Position(row=2, col=2)),
        ],
        grid=GridDimensions(rows=4, cols=8),
    )
    with patch("brlok.cli.commands.load_catalog", return_value=catalog):
        result = runner.invoke(app, ["generate", "--level", "2", "--blocks", "3"])
        assert result.exit_code == 0
        assert "3 blocs" in result.output
        assert "Bloc 1:" in result.output
        assert "Bloc 2:" in result.output
        assert "Bloc 3:" in result.output


def test_generate_with_tags() -> None:
    """generate --tags force les prises à avoir ces tags."""
    catalog = Catalog(
        holds=[
            Hold(id="A1", level=2, tags=["crimp"], position=Position(row=0, col=0)),
            Hold(id="B2", level=2, tags=["sloper"], position=Position(row=1, col=1)),
        ],
        grid=GridDimensions(rows=4, cols=8),
    )
    with patch("brlok.cli.commands.load_catalog", return_value=catalog):
        result = runner.invoke(app, ["generate", "--level", "2", "--tags", "crimp"])
        assert result.exit_code == 0
        assert "tags:" in result.output
        assert "crimp" in result.output


def test_generate_tags_overlap_rejected() -> None:
    """generate avec --tags et --exclude-tags chevauchants → erreur."""
    catalog = Catalog(
        holds=[
            Hold(id="A1", level=2, tags=["crimp"], position=Position(row=0, col=0)),
            Hold(id="B2", level=2, tags=["sloper"], position=Position(row=1, col=1)),
        ],
        grid=GridDimensions(rows=4, cols=8),
    )
    with patch("brlok.cli.commands.load_catalog", return_value=catalog):
        result = runner.invoke(
            app, ["generate", "--level", "2", "--tags", "crimp", "--exclude-tags", "crimp"]
        )
    assert result.exit_code == 1
    assert "requis et exclus" in result.output or "incohérent" in result.output


def test_generate_with_exclude_tags() -> None:
    """generate --exclude-tags exclut les prises avec ces tags."""
    catalog = Catalog(
        holds=[
            Hold(id="A1", level=2, tags=["crimp"], position=Position(row=0, col=0)),
            Hold(id="B2", level=2, tags=["sloper"], position=Position(row=1, col=1)),
        ],
        grid=GridDimensions(rows=4, cols=8),
    )
    with patch("brlok.cli.commands.load_catalog", return_value=catalog):
        result = runner.invoke(app, ["generate", "--level", "2", "--exclude-tags", "sloper"])
        assert result.exit_code == 0
        assert "exclu:" in result.output
        assert "sloper" in result.output


def test_generate_with_output(tmp_path: Path) -> None:
    """generate -o exporte la séance (txt, md ou json)."""
    catalog = Catalog(
        holds=[
            Hold(id="A1", level=2, tags=[], position=Position(row=0, col=0)),
            Hold(id="B2", level=2, tags=[], position=Position(row=1, col=1)),
        ],
        grid=GridDimensions(rows=4, cols=8),
    )
    out = tmp_path / "session.json"
    with patch("brlok.cli.commands.load_catalog", return_value=catalog):
        result = runner.invoke(app, ["generate", "--level", "2", "-o", str(out)])
    assert result.exit_code == 0
    assert "Exporté" in result.output
    assert out.exists()
    data = json.loads(out.read_text())
    assert "blocks" in data


def test_generate_with_variety() -> None:
    """generate --variety active la contrainte de variété."""
    catalog = Catalog(
        holds=[
            Hold(id="A1", level=2, tags=[], position=Position(row=0, col=0)),
            Hold(id="B2", level=2, tags=[], position=Position(row=1, col=1)),
            Hold(id="C3", level=2, tags=[], position=Position(row=2, col=2)),
        ],
        grid=GridDimensions(rows=4, cols=8),
    )
    with patch("brlok.cli.commands.load_catalog", return_value=catalog):
        result = runner.invoke(app, ["generate", "--level", "2", "--variety"])
        assert result.exit_code == 0
        assert "variété" in result.output


def test_generate_constraints_too_strict() -> None:
    """generate avec contraintes trop strictes (0 blocs) → erreur."""
    catalog = Catalog(
        holds=[
            Hold(id="A1", level=2, tags=["crimp"], position=Position(row=0, col=0)),
            Hold(id="B2", level=2, tags=["sloper"], position=Position(row=1, col=1)),
        ],
        grid=GridDimensions(rows=4, cols=8),
    )
    with patch("brlok.cli.commands.load_catalog", return_value=catalog):
        result = runner.invoke(
            app, ["generate", "--level", "2", "--tags", "pocket"]
        )
    assert result.exit_code == 1
    assert "Aucun bloc généré" in result.output


def test_generate_without_level_or_template() -> None:
    """generate sans --level ni --template → erreur."""
    result = runner.invoke(app, ["generate"])
    assert result.exit_code == 1
    assert "Indiquez --level ou --template" in result.output


def test_generate_with_template(tmp_path: Path) -> None:
    """generate --template utilise le template (8.1)."""
    from brlok.config.paths import get_templates_path
    templates_path = get_templates_path()
    orig = templates_path.exists()
    if orig:
        orig_data = templates_path.read_text()
    try:
        # Créer un template minimal
        import json
        templates_path.parent.mkdir(parents=True, exist_ok=True)
        tpl = {
            "id": "tpl123",
            "name": "Test 3 blocs",
            "blocks_config": [{"level": "modéré", "work_s": 40, "rest_s": 20, "rounds": 3}] * 3,
            "blocks_count": 3,
            "holds_per_block": 4,
        }
        templates_path.write_text(json.dumps({"version": 1, "templates": [tpl]}, indent=2))
        catalog = Catalog(
            holds=[
                Hold(id=f"H{i}", level=2, tags=[], position=Position(row=i // 8, col=i % 8))
                for i in range(30)
            ],
            grid=GridDimensions(rows=4, cols=8),
        )
        with patch("brlok.cli.commands.load_catalog", return_value=catalog):
            result = runner.invoke(app, ["generate", "--template", "Test 3 blocs"])
        assert result.exit_code == 0
        assert "3 blocs" in result.output
        assert "template" in result.output.lower()
    finally:
        if orig:
            templates_path.write_text(orig_data)
        elif templates_path.exists():
            templates_path.unlink()
