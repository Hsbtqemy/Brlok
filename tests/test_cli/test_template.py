# -*- coding: utf-8 -*-
"""Tests de la sous-commande template (8.1)."""
import json
from pathlib import Path

from typer.testing import CliRunner

from brlok.cli.commands import app

runner = CliRunner()


def test_template_list() -> None:
    """template list affiche les templates disponibles."""
    result = runner.invoke(app, ["template", "list"])
    assert result.exit_code == 0
    assert "40/20" in result.output or "template" in result.output.lower()


def test_template_remove(tmp_path: Path, monkeypatch) -> None:
    """template remove supprime un template (garde au moins un)."""
    fake_path = tmp_path / "templates.json"
    monkeypatch.setattr(
        "brlok.storage.templates_store._get_path",
        lambda: fake_path,
    )
    monkeypatch.setattr(
        "brlok.config.paths.get_templates_path",
        lambda: fake_path,
    )
    tpl1 = {
        "id": "tplfoo",
        "name": "Test remove",
        "blocks_config": [{"level": "modéré", "work_s": 40, "rest_s": 20, "rounds": 3}],
        "blocks_count": 2,
        "holds_per_block": 4,
    }
    tpl2 = {
        "id": "tplbar",
        "name": "Autre",
        "blocks_config": [{"level": "modéré", "work_s": 40, "rest_s": 20, "rounds": 3}],
        "blocks_count": 3,
        "holds_per_block": 5,
    }
    fake_path.parent.mkdir(parents=True, exist_ok=True)
    fake_path.write_text(json.dumps({"version": 1, "templates": [tpl1, tpl2]}, indent=2))
    result = runner.invoke(app, ["template", "remove", "Test remove"])
    assert result.exit_code == 0
    assert "supprimé" in result.output


def test_template_remove_last_fails(tmp_path: Path, monkeypatch) -> None:
    """template remove échoue si c'est le dernier template."""
    fake_path = tmp_path / "templates.json"
    monkeypatch.setattr(
        "brlok.storage.templates_store._get_path",
        lambda: fake_path,
    )
    monkeypatch.setattr(
        "brlok.config.paths.get_templates_path",
        lambda: fake_path,
    )
    tpl = {
        "id": "tplfoo",
        "name": "Seul",
        "blocks_config": [{"level": "modéré", "work_s": 40, "rest_s": 20, "rounds": 3}],
        "blocks_count": 2,
        "holds_per_block": 4,
    }
    fake_path.parent.mkdir(parents=True, exist_ok=True)
    fake_path.write_text(json.dumps({"version": 1, "templates": [tpl]}, indent=2))
    result = runner.invoke(app, ["template", "remove", "Seul"])
    assert result.exit_code == 1
    assert "au moins un" in result.output
