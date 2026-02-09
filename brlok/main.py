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
    from PySide6.QtWidgets import QApplication, QMessageBox

    from brlok.gui.icon import get_app_icon
    from brlok.gui.main_window import BrlokMainWindow
    from brlok.gui.theme import get_theme_manager
    from brlok.storage.drop_import import process_drop_folder

    processed = process_drop_folder()

    app = QApplication(sys.argv)
    app.setWindowIcon(get_app_icon())
    theme = get_theme_manager()
    app.setStyleSheet(theme.get_stylesheet())
    window = BrlokMainWindow()
    window.setWindowIcon(get_app_icon())
    window.show()
    if processed:
        QMessageBox.information(
            window,
            "Import automatique",
            f"{len(processed)} fichier(s) importé(s) depuis import/ :\n" + "\n".join(f"  • {f}" for f in processed),
        )
    sys.exit(app.exec())


def _run_cli() -> None:
    """Délègue au CLI Typer."""
    # Typer attend argv[0] = nom du programme
    sys.argv = ["brlok"] + sys.argv[3:]
    from brlok.cli.commands import app
    app()
