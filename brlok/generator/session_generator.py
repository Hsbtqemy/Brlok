# -*- coding: utf-8 -*-
"""Générateur de séances (niveau, tags, variété). Contraintes de niveau, tags (forcer/filtrer), variété, exclusion inactifs."""
from __future__ import annotations

import random

from brlok.config.difficulty import get_distribution_levels
from brlok.models import Block, Catalog, Hold, Session, SessionConstraints


def generate_session(
    catalog: Catalog,
    target_level: int,
    *,
    blocks_count: int = 5,
    holds_per_block: int = 10,
    enchainements: int | None = None,
    level_tolerance: int = 1,
    required_tags: list[str] | None = None,
    excluded_tags: list[str] | None = None,
    variety: bool = False,
    favorite_blocks: list[Block] | None = None,
    seed: int | None = None,
    distribution_pattern: str = "uniforme",
    per_block_levels: list[tuple[int, int]] | None = None,
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
        required_tags: Tags à inclure — la prise doit avoir au moins un de ces tags (vide = aucun filtre).
        excluded_tags: Tags exclus (filtrer) — la prise ne doit avoir aucun de ces tags.
        variety: Si True, privilégie les prises peu utilisées pour éviter les répétitions (FR8).
        favorite_blocks: Blocs favoris à injecter en tête de séance (FR17).
            Total blocs = len(favorite_blocks) + blocks_count (favoris en tête).
        seed: Graine aléatoire pour reproductibilité (optionnel).
        distribution_pattern: Répartition des prises (uniforme, progressive, pyramide, etc.).
        per_block_levels: (target_level, tolerance) par bloc. Si None, utilise target_level global.

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

    # Filtrer par niveau : union des plages si per_block_levels, sinon globale
    pbl = per_block_levels
    if pbl and len(pbl) > 0:
        min_level = min(max(1, t - tol) for t, tol in pbl)
        max_level = max(min(5, t + tol) for t, tol in pbl)
    else:
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

    # Pieds éligibles : union [min_level, max_level]
    foot_levels = getattr(catalog, "foot_levels", None) or [[1] * 6 for _ in range(4)]
    eligible_feet: list[tuple[int, int]] = []
    for r in range(min(4, len(catalog.foot_grid or []))):
        row = catalog.foot_grid[r] if catalog.foot_grid else []
        for c in range(min(6, len(row) if row else 0)):
            if row and c < len(row) and row[c]:
                lev = foot_levels[r][c] if r < len(foot_levels) and c < len(foot_levels[r]) else 1
                if min_level <= lev <= max_level:
                    eligible_feet.append((r, c))

    pattern = distribution_pattern or "uniforme"
    pbl = per_block_levels

    for block_idx in range(blocks_count):
        block_target, block_tol = (
            pbl[block_idx] if pbl and block_idx < len(pbl) else (target_level, level_tolerance)
        )
        block_min = max(1, block_target - block_tol)
        block_max = min(5, block_target + block_tol)
        block_eligible = [h for h in eligible if block_min <= h.level <= block_max]
        if not block_eligible:
            block_eligible = eligible

        n = min(n_holds, len(block_eligible))
        if n < 1:
            break

        pos_levels = get_distribution_levels(pattern, n, block_target)
        chosen_holds: list[Hold] = []
        for pos in range(n):
            req_level = pos_levels[pos] if pos < len(pos_levels) else block_target
            req_min = max(1, req_level - 1)
            req_max = min(5, req_level + 1)
            at_level = [h for h in block_eligible if h.id not in {x.id for x in chosen_holds} and req_min <= h.level <= req_max]
            candidates = at_level if at_level else [h for h in block_eligible if h.id not in {x.id for x in chosen_holds}]
            if not candidates:
                break
            if variety:
                weights = [1 / (1 + usage_count[h.id]) for h in candidates]
                pick = rng.choices(candidates, weights=weights, k=1)[0]
            else:
                pick = rng.choice(candidates)
            chosen_holds.append(pick)
            usage_count[pick.id] += 1

        n_feet = min(rng.randint(2, 4), len(eligible_feet)) if eligible_feet else 0
        feet = rng.sample(eligible_feet, n_feet) if n_feet > 0 else []
        blocks.append(Block(holds=chosen_holds, foot_positions=feet))

    return Session(blocks=blocks, constraints=constraints)
