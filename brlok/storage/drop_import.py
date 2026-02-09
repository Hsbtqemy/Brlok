# -*- coding: utf-8 -*-
"""Import automatique depuis le dossier drop (import/ à la racine du projet).

Déposez des fichiers JSON dans ce dossier : au démarrage de l'app, ils seront
fusionnés avec vos données existantes et déplacés dans imported/.
"""
from __future__ import annotations

import json
import logging
import shutil
import uuid
from datetime import datetime
from pathlib import Path

from pydantic import ValidationError

from brlok.config.paths import get_drop_folder_path
from brlok.models import Catalog, CatalogCollection
from brlok.models.session_template import SessionTemplate
from brlok.storage.catalog_collection_store import add_catalog
from brlok.storage.favorites_store import merge_favorites_from_file
from brlok.storage.templates_store import load_templates, save_templates

logger = logging.getLogger(__name__)


def process_drop_folder() -> list[str]:
    """Scanne le dossier drop, importe les fichiers trouvés, les déplace vers imported/.
    Retourne la liste des fichiers traités."""
    drop_path = get_drop_folder_path()
    try:
        drop_path.mkdir(parents=True, exist_ok=True)
    except OSError as e:
        logger.warning("Impossible de créer %s: %s", drop_path, e)
        return []

    processed: list[str] = []
    imported_dir = drop_path / "imported"
    try:
        imported_dir.mkdir(parents=True, exist_ok=True)
    except OSError as e:
        logger.warning("Impossible de créer imported/ dans %s: %s", drop_path, e)
        return []

    for src in sorted(drop_path.iterdir()):
        if not src.is_file() or src.suffix.lower() != ".json":
            continue

        filename = src.name
        try:
            with open(src, encoding="utf-8") as f:
                data = json.load(f)
        except (json.JSONDecodeError, OSError):
            continue

        try:
            if "templates" in data:
                _merge_templates_data(data, src)
            elif "catalogs" in data:
                _merge_catalog_collection_data(data)
            elif "blocks" in data:
                added = merge_favorites_from_file(src, catalog_id=None)
                if added:
                    logger.info("Drop: %d favori(s) importé(s) depuis %s", added, filename)
            elif "holds" in data:
                _merge_single_catalog(data, filename)
            else:
                continue
        except Exception as e:
            logger.warning("Import %s échoué: %s", filename, e)
            continue

        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        dest = imported_dir / f"{ts}_{filename}"
        try:
            shutil.move(str(src), str(dest))
            processed.append(filename)
        except OSError as e:
            logger.warning("Impossible de déplacer %s: %s", filename, e)

    return processed


def _merge_single_catalog(data: dict, filename: str) -> None:
    """Importe un catalogue unique (format: holds, grid)."""
    try:
        catalog = Catalog.model_validate(data)
        name = filename.replace(".json", "").replace("_", " ").strip()
        if not name:
            name = "Importé"
        add_catalog(f"Importé - {name}", catalog)
        logger.info("Drop: catalogue « %s » importé", name)
    except ValidationError:
        return


def _merge_templates_data(data: dict, src: Path | None = None) -> None:
    """Fusionne les templates du fichier avec les templates existants."""
    items = data.get("templates", [])
    if not items:
        return

    existing = load_templates()
    seen_names = {t.name.strip().lower() for t in existing}
    added = 0
    for item in items:
        try:
            t = SessionTemplate.model_validate(item)
            t = t.model_copy(update={"id": str(uuid.uuid4())[:8]})
            if t.name.strip().lower() not in seen_names:
                existing.append(t)
                seen_names.add(t.name.strip().lower())
                added += 1
        except ValidationError:
            pass
    if added:
        save_templates(existing)
        logger.info("Drop: %d template(s) importé(s)", added)


def _merge_catalog_collection_data(data: dict) -> None:
    """Ajoute les catalogues du fichier à la collection."""
    try:
        coll = CatalogCollection.model_validate(data)
    except ValidationError:
        return

    if not coll.catalogs:
        return

    added = 0
    for entry in coll.catalogs:
        try:
            add_catalog(f"Importé - {entry.name}", entry.catalog)
            added += 1
        except Exception:
            pass
    if added:
        logger.info("Drop: %d catalogue(s) importé(s)", added)


