# -*- coding: utf-8 -*-
"""Point d'entrée principal : GUI par défaut si pas d'args, CLI sinon."""
import sys

# Convention : python -m brlok [args] → argv = [exe, "-m", "brlok", *user_args]
_ARGS_BEFORE_USER = 3


def _has_cli_args() -> bool:
    """Vrai si l'utilisateur a passé des arguments (ex. sous-commande)."""
    return len(sys.argv) > _ARGS_BEFORE_USER


def main() -> None:
    """Détecte le mode : sans args → GUI ; avec args → CLI."""
    if _has_cli_args():
        _run_cli()
    else:
        _run_gui()


def _run_gui() -> None:
    """Ouvre la fenêtre GUI PySide6."""
    from PySide6.QtWidgets import QApplication

    from brlok.gui.main_window import BrlokMainWindow
    from brlok.gui.theme import get_theme_manager

    app = QApplication(sys.argv)
    theme = get_theme_manager()
    app.setStyleSheet(theme.get_stylesheet())
    window = BrlokMainWindow()
    window.show()
    sys.exit(app.exec())


def _run_cli() -> None:
    """Délègue au CLI Typer."""
    # Typer attend argv[0] = nom du programme
    sys.argv = ["brlok"] + sys.argv[3:]
    from brlok.cli.commands import app
    app()
