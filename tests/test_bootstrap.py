# -*- coding: utf-8 -*-
"""Tests bootstrap - structure et imports (story 1.1)."""
import pytest


def test_brlok_import() -> None:
    """Le package brlok est importable."""
    import brlok
    assert brlok.__version__ == "0.1.0"


def test_cli_app_import() -> None:
    """L'app CLI Typer est importable."""
    from brlok.cli.commands import app
    assert app is not None


def test_main_import() -> None:
    """Le point d'entrée main est importable."""
    from brlok.main import main
    assert callable(main)


def test_generate_command_exists() -> None:
    """La sous-commande generate existe et affiche de l'aide."""
    from typer.testing import CliRunner
    from brlok.cli.commands import app
    runner = CliRunner()
    result = runner.invoke(app, ["generate", "--help"])
    assert result.exit_code == 0
    assert "Génère" in result.output or "séance" in result.output
