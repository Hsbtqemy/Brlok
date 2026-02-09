#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Launcher Brlok : installe les dépendances, vérifie l'environnement et lance l'application.
Utilisable sur Windows et macOS.
"""
from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

# Répertoire du projet (où se trouve ce script)
PROJECT_ROOT = Path(__file__).resolve().parent


def _log(msg: str) -> None:
    print(f"[Brlok] {msg}")


def _check_python_version() -> bool:
    """Vérifie que Python >= 3.8."""
    if sys.version_info < (3, 8):
        _log(f"Python 3.8+ requis. Actuel : {sys.version}")
        return False
    return True


def _install_dependencies() -> bool:
    """Installe ou met à jour les dépendances via pip."""
    pyproject = PROJECT_ROOT / "pyproject.toml"
    if not pyproject.exists():
        _log("pyproject.toml introuvable.")
        return False
    _log("Installation des dépendances…")
    try:
        subprocess.run(
            [sys.executable, "-m", "pip", "install", "-e", str(PROJECT_ROOT)],
            check=True,
            capture_output=True,
            text=True,
        )
        _log("Dépendances installées.")
        return True
    except subprocess.CalledProcessError as e:
        _log(f"Erreur pip : {e.stderr or e}")
        return False


def _verify_imports() -> bool:
    """Vérifie que brlok et ses dépendances sont importables."""
    _log("Vérification des imports…")
    try:
        # Changer le cwd pour que brlok soit trouvé
        orig_cwd = os.getcwd()
        os.chdir(PROJECT_ROOT)
        try:
            import brlok  # noqa: F401
            from PySide6.QtWidgets import QApplication  # noqa: F401
            _log("Tous les modules sont disponibles.")
            return True
        finally:
            os.chdir(orig_cwd)
    except Exception as e:
        _log(f"Import échoué : {e}")
        return False


def _launch_app() -> int:
    """Lance l'application Brlok."""
    return subprocess.call(
        [sys.executable, "-m", "brlok"],
        cwd=PROJECT_ROOT,
    )


def main() -> int:
    """Point d'entrée principal."""
    _log("Lancement de Brlok…")
    if not _check_python_version():
        return 1
    if not _install_dependencies():
        _log("Tentative de lancement sans réinstallation…")
    if not _verify_imports():
        _log("Réinstallez les dépendances : pip install -e .")
        return 1
    _log("Démarrage de l'application…")
    return _launch_app()


if __name__ == "__main__":
    sys.exit(main())
