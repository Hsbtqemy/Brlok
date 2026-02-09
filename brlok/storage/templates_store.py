# -*- coding: utf-8 -*-
"""Persistance des templates de séance (8.1)."""
from __future__ import annotations

import json
import logging
import uuid
from pathlib import Path

from pydantic import ValidationError

from brlok.models.session_template import SessionTemplate

logger = logging.getLogger(__name__)


def _get_path() -> Path:
    from brlok.config.paths import get_templates_path
    return get_templates_path()


def load_templates() -> list[SessionTemplate]:
    """Charge la liste des templates. Crée un template 40/20 par défaut si vide."""
    path = _get_path()
    if not path.exists():
        _ensure_default_templates()
        return load_templates()
    try:
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
    except (json.JSONDecodeError, OSError) as e:
        logger.warning("Templates illisibles (%s): %s", path, e)
        return []
    result = []
    for item in data.get("templates", []):
        try:
            result.append(SessionTemplate.model_validate(item))
        except ValidationError:
            pass
    if not result:
        _ensure_default_templates()
        return load_templates()
    return result


def _ensure_default_templates() -> None:
    """Crée des templates de base par difficulté si aucun n'existe."""
    from brlok.config.difficulty import DIFFICULTY_PROFILES, get_distribution_short_label
    from brlok.models.session_template import BlockConfig

    templates_to_add = []
    for difficulty_name, _, _ in DIFFICULTY_PROFILES:
        level_str = difficulty_name.strip().lower()
        blocks_config = [
            BlockConfig(level=level_str, work_s=40, rest_s=20, rounds=3)
            for _ in range(5)
        ]
        dist_label = get_distribution_short_label("uniforme")
        name = f"{difficulty_name} - {dist_label} [40/20x3]"
        templates_to_add.append((name, blocks_config))

    path = _get_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    templates = []
    for name, blocks_config in templates_to_add:
        t = SessionTemplate(
            id=str(uuid.uuid4())[:8],
            name=name,
            blocks_config=blocks_config,
            blocks_count=5,
            holds_per_block=10,
            distribution_pattern="uniforme",
        )
        templates.append(t)
    save_templates(templates)




def merge_templates_from_file(path: Path) -> int:
    """Fusionne les templates du fichier avec les templates existants.
    Retourne le nombre de templates ajoutés. Exclut les doublons de nom."""
    if not path.exists():
        return 0
    try:
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
    except (json.JSONDecodeError, OSError):
        return 0
    items = data.get("templates", [])
    if not items:
        return 0
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
    return added


def export_templates_to_file(path: Path) -> None:
    """Exporte les templates vers un fichier JSON."""
    from datetime import datetime
    templates = load_templates()
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump({
            "version": 1,
            "updated_at": datetime.now().isoformat(),
            "templates": [t.model_dump(mode="json") for t in templates],
        }, f, ensure_ascii=False, indent=2)


def save_templates(templates: list[SessionTemplate]) -> None:
    """Sauvegarde les templates."""
    path = _get_path()
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        from datetime import datetime
        with open(path, "w", encoding="utf-8") as f:
            json.dump({
                "version": 1,
                "updated_at": datetime.now().isoformat(),
                "templates": [t.model_dump(mode="json") for t in templates],
            }, f, ensure_ascii=False, indent=2)
    except (OSError, PermissionError) as e:
        logger.error("Impossible de sauvegarder templates: %s", e)


def add_template(
    name: str,
    blocks_config: list | None = None,
    blocks_count: int = 5,
    holds_per_block: int = 10,
    distribution_pattern: str = "uniforme",
) -> SessionTemplate:
    """Ajoute un template. blocks_config par défaut : 40/20."""
    from brlok.models.session_template import BlockConfig
    default_config = [
        BlockConfig(level="modéré", work_s=40, rest_s=20, rounds=3)
        for _ in range(5)
    ]
    config = blocks_config or default_config
    t = SessionTemplate(
        id=str(uuid.uuid4())[:8],
        name=name,
        blocks_config=config,
        blocks_count=blocks_count,
        holds_per_block=holds_per_block,
        distribution_pattern=distribution_pattern,
    )
    templates = []
    path = _get_path()
    if path.exists():
        try:
            with open(path, encoding="utf-8") as f:
                data = json.load(f)
            for item in data.get("templates", []):
                try:
                    templates.append(SessionTemplate.model_validate(item))
                except ValidationError:
                    pass
        except (json.JSONDecodeError, OSError):
            pass
    templates.append(t)
    save_templates(templates)
    return t


def get_template(template_id: str) -> SessionTemplate | None:
    """Retourne un template par id."""
    for t in load_templates():
        if t.id == template_id:
            return t
    return None


def get_template_by_name(name: str) -> SessionTemplate | None:
    """Retourne un template par nom (ou id si pas de correspondance)."""
    templates = load_templates()
    for t in templates:
        if t.name.strip().lower() == name.strip().lower():
            return t
        if t.id == name:
            return t
    return None


def remove_template(template_id: str) -> bool:
    """Supprime un template par id. Retourne True si supprimé."""
    templates = load_templates()
    if len(templates) <= 1:
        return False  # Garder au moins un template
    kept = [t for t in templates if t.id != template_id]
    if len(kept) == len(templates):
        return False
    save_templates(kept)
    return True


def update_template(
    template_id: str,
    blocks_config: list | None = None,
    blocks_count: int | None = None,
    holds_per_block: int | None = None,
    distribution_pattern: str | None = None,
) -> bool:
    """Met à jour un template. Retourne True si modifié."""
    templates = load_templates()
    for i, t in enumerate(templates):
        if t.id == template_id:
            updates = {}
            if blocks_config is not None:
                updates["blocks_config"] = blocks_config
            if blocks_count is not None:
                updates["blocks_count"] = blocks_count
            if holds_per_block is not None:
                updates["holds_per_block"] = holds_per_block
            if distribution_pattern is not None:
                updates["distribution_pattern"] = distribution_pattern
            if updates:
                templates[i] = t.model_copy(update=updates)
                save_templates(templates)
            return True
    return False


def rename_template(template_id: str, new_name: str) -> bool:
    """Renomme un template. Retourne True si renommé."""
    templates = load_templates()
    new_name = new_name.strip()
    if not new_name:
        return False
    for i, t in enumerate(templates):
        if t.id == template_id:
            templates[i] = t.model_copy(update={"name": new_name})
            save_templates(templates)
            return True
    return False
