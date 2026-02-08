# -*- coding: utf-8 -*-
"""Générateur de séances (niveau, tags, variété). Contraintes de niveau, tags (forcer/filtrer), variété, exclusion inactifs."""
from __future__ import annotations

import random

from brlok.models import Block, Catalog, Hold, Session, SessionConstraints


def generate_session(
    catalog: Catalog,
    target_level: int,
    *,
    blocks_count: int = 5,
    holds_per_block: int = 5,
    enchainements: int | None = None,
    level_tolerance: int = 1,
    required_tags: list[str] | None = None,
    excluded_tags: list[str] | None = None,
    variety: bool = False,
    favorite_blocks: list[Block] | None = None,
    seed: int | None = None,
) -> Session:
    """Génère une séance avec contraintes de niveau, tags et variété.

    Args:
        catalog: Catalogue des prises.
        target_level: Niveau cible (1-5). Les prises avec niveau dans
            [target_level - level_tolerance, target_level + level_tolerance] sont éligibles.
        blocks_count: Nombre de blocs à générer.
        holds_per_block: Nombre de prises par bloc (réduit si pas assez de prises).
        enchainements: Alias pour holds_per_block, stocké dans constraints (7.5).
        level_tolerance: Écart accepté autour du niveau cible (défaut 1).
        required_tags: Tags obligatoires (forcer) — la prise doit avoir au moins un de ces tags.
        excluded_tags: Tags exclus (filtrer) — la prise ne doit avoir aucun de ces tags.
        variety: Si True, privilégie les prises peu utilisées pour éviter les répétitions (FR8).
        favorite_blocks: Blocs favoris à injecter en tête de séance (FR17).
            Total blocs = len(favorite_blocks) + blocks_count (favoris en tête).
        seed: Graine aléatoire pour reproductibilité (optionnel).

    Returns:
        Session avec blocs et contraintes utilisées.
    """
    rng = random.Random(seed) if seed is not None else random

    req_tags = required_tags or []
    exc_tags = excluded_tags or []
    n_holds = enchainements if enchainements is not None else holds_per_block

    # Chevauchement required/excluded → session vide (contraintes incohérentes)
    if set(req_tags) & set(exc_tags):
        return Session(
            blocks=list(favorite_blocks or []),
            constraints=SessionConstraints(
                target_level=target_level,
                required_tags=req_tags,
                excluded_tags=exc_tags,
                variety=variety,
                enchainements=n_holds,
            ),
        )

    # FR9 : exclure les prises inactives
    eligible = [h for h in catalog.holds if h.active]

    # Filtrer par niveau (target_level ± tolerance, borné 1-5)
    min_level = max(1, target_level - level_tolerance)
    max_level = min(5, target_level + level_tolerance)
    eligible = [h for h in eligible if min_level <= h.level <= max_level]

    # FR7 : contraintes de tags — forcer (required)
    if req_tags:
        eligible = [h for h in eligible if any(t in h.tags for t in req_tags)]

    # FR7 : contraintes de tags — filtrer (excluded)
    if exc_tags:
        eligible = [h for h in eligible if not any(t in h.tags for t in exc_tags)]

    constraints = SessionConstraints(
        target_level=target_level,
        required_tags=req_tags,
        excluded_tags=exc_tags,
        variety=variety,
        enchainements=n_holds,
    )

    blocks: list[Block] = list(favorite_blocks or [])

    if not eligible:
        return Session(blocks=blocks, constraints=constraints)

    usage_count: dict[str, int] = {h.id: 0 for h in eligible}

    # Pieds éligibles : cellules non vides avec niveau dans [min_level, max_level]
    foot_levels = getattr(catalog, "foot_levels", None) or [[1] * 6 for _ in range(4)]
    eligible_feet: list[tuple[int, int]] = []
    for r in range(min(4, len(catalog.foot_grid or []))):
        row = catalog.foot_grid[r] if catalog.foot_grid else []
        for c in range(min(6, len(row) if row else 0)):
            if row and c < len(row) and row[c]:
                lev = foot_levels[r][c] if r < len(foot_levels) and c < len(foot_levels[r]) else 1
                if min_level <= lev <= max_level:
                    eligible_feet.append((r, c))

    for _ in range(blocks_count):
        n = min(n_holds, len(eligible))
        if n < 1:
            break
        if variety:
            # FR8 : éviter répétitions — privilégier les prises peu utilisées
            remaining = [h for h in eligible]
            chosen_holds: list[Hold] = []
            for _ in range(n):
                if not remaining:
                    break
                weights = [1 / (1 + usage_count[h.id]) for h in remaining]
                pick = rng.choices(remaining, weights=weights, k=1)[0]
                chosen_holds.append(pick)
                remaining.remove(pick)
                usage_count[pick.id] += 1
            chosen = chosen_holds
        else:
            chosen = rng.sample(eligible, min(n, len(eligible)))
        # Pieds : sélection aléatoire parmi les positions éligibles (2 à 4 positions)
        n_feet = min(rng.randint(2, 4), len(eligible_feet)) if eligible_feet else 0
        feet = rng.sample(eligible_feet, n_feet) if n_feet > 0 else []
        blocks.append(Block(holds=chosen, foot_positions=feet))

    return Session(blocks=blocks, constraints=constraints)
