# -*- coding: utf-8 -*-
"""Chemins XDG pour Brlok.

Fichiers de données utilisateur (catalog, favoris) :
- Linux : ~/.local/share/brlok/ (XDG_DATA_HOME)
- macOS : ~/Library/Application Support/brlok/
- Windows : %APPDATA%\\brlok\\

On utilise user_data_dir (et non user_config_dir) car le catalogue et les favoris
sont des données utilisateur, pas de la configuration.
"""
from pathlib import Path

from platformdirs import user_data_dir

_APP_NAME = "brlok"


def get_data_dir() -> Path:
    """Répertoire des données utilisateur (XDG_DATA_HOME / Application Support)."""
    return Path(user_data_dir(_APP_NAME, ensure_exists=False))


def get_catalog_path() -> Path:
    """Chemin du fichier catalog.json."""
    return get_data_dir() / "catalog.json"


def get_favorites_path() -> Path:
    """Chemin du fichier favorites.json."""
    return get_data_dir() / "favorites.json"


def get_history_path() -> Path:
    """Chemin du fichier sessions_history.json (7.4)."""
    return get_data_dir() / "sessions_history.json"


def get_templates_path() -> Path:
    """Chemin du fichier templates.json (8.1)."""
    return get_data_dir() / "templates.json"


def get_best_times_path() -> Path:
    """Chemin du fichier best_times.json (8.2)."""
    return get_data_dir() / "best_times.json"


def get_catalog_collection_path() -> Path:
    """Chemin du fichier catalog_collection.json (7.1)."""
    return get_data_dir() / "catalog_collection.json"


def get_drop_folder_path() -> Path:
    """Dossier où déposer des fichiers pour import automatique au démarrage.
    Repertoire « import/ » à la racine du projet (data/import/ à côté de data/).
    Fichiers reconnus : favorites.json, templates.json, catalog_collection.json
    """
    # Racine du projet : brlok/config/paths.py → parent.parent.parent = racine
    _project_root = Path(__file__).resolve().parent.parent.parent
    return _project_root / "import"
