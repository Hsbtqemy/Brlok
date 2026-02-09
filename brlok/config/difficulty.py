# -*- coding: utf-8 -*-
"""Profils de difficulté globale (Très facile → Très difficile)."""
from __future__ import annotations

# (target_level, level_tolerance) → plage [min_level, max_level]
# min = max(1, target - tolerance), max = min(5, target + tolerance)
DIFFICULTY_PROFILES: list[tuple[str, int, int]] = [
    ("Très facile", 1, 1),   # plage 1-2
    ("Facile", 2, 1),         # plage 1-3
    ("Modéré", 3, 1),         # plage 2-4
    ("Difficile", 4, 1),      # plage 3-5
    ("Très difficile", 5, 1), # plage 4-5
]

# Mapping BlockConfig.level (str) → target_level
BLOCK_LEVEL_MAP: dict[str, int] = {
    "très facile": 1,
    "facile": 2,
    "modéré": 3,
    "difficile": 4,
    "très difficile": 5,
}

# Répartition des prises dans un bloc (par niveau cible du bloc)
DISTRIBUTION_PATTERNS: list[tuple[str, str]] = [
    ("uniforme", "Uniforme (toutes mêmes niveaux)"),
    ("progressive", "Progressive (facile → difficile)"),
    ("pyramide", "Pyramide (montée puis descente)"),
    ("regressive", "Régressive (difficile → facile)"),
    ("crux", "Crux central (prise difficile au milieu)"),
    ("alternance", "Alternance (facile/difficile)"),
]


def get_difficulty_params(profile_name: str) -> tuple[int, int]:
    """Retourne (target_level, level_tolerance) pour un profil. Défaut: Modéré."""
    for name, target, tolerance in DIFFICULTY_PROFILES:
        if name == profile_name:
            return (target, tolerance)
    return (3, 1)


def block_level_to_target(level: str | int) -> int:
    """Convertit BlockConfig.level en target_level (1-5)."""
    if isinstance(level, int):
        return max(1, min(5, level))
    key = str(level).strip().lower()
    return BLOCK_LEVEL_MAP.get(key, 3)


def get_difficulty_display_name(level: str | int) -> str:
    """Retourne le libellé affiché pour un niveau (ex. 'modéré' → 'Modéré')."""
    target = block_level_to_target(level)
    for name, t, _ in DIFFICULTY_PROFILES:
        if t == target:
            return name
    return "Modéré"


def get_distribution_short_label(pattern_id: str) -> str:
    """Retourne un libellé court pour la répartition (ex. 'Pyramide')."""
    for pid, label in DISTRIBUTION_PATTERNS:
        if pid == pattern_id:
            return label.split(" (")[0] if " (" in label else label
    return "Uniforme"


def get_distribution_levels(pattern: str, n_holds: int, block_target: int) -> list[int]:
    """Retourne la liste des niveaux pour chaque position du bloc (1-5)."""
    n = max(1, n_holds)
    t = max(1, min(5, block_target))
    if pattern == "uniforme":
        return [t] * n
    if pattern == "progressive":
        return [
            max(1, min(5, round(t - 1 + 2 * i / (n - 1)))) if n > 1 else t
            for i in range(n)
        ]
    if pattern == "pyramide":
        half = n // 2
        up = [max(1, min(5, t - 1 + (i * 2) // max(1, half))) for i in range(half + 1)]
        down = up[:-1][::-1] if half > 0 else []
        return (up + down)[:n]
    if pattern == "regressive":
        return [
            max(1, min(5, round(t + 1 - 2 * i / (n - 1)))) if n > 1 else t
            for i in range(n)
        ]
    if pattern == "crux":
        mid = n // 2
        base = [t] * n
        if mid < n:
            base[mid] = min(5, t + 1)
        return base
    if pattern == "alternance":
        return [max(1, min(5, t - 1 + (i % 2) * 2)) for i in range(n)]
    return [t] * n
