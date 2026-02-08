# -*- coding: utf-8 -*-
"""Opérations sur le catalogue (modification des prises)."""
from __future__ import annotations

from brlok.models import Catalog, Hold, Position


def _position_to_id(row: int, col: int) -> str:
    """Génère un id type A1, B2 à partir de (row, col). Col 0=A, 1=B... Row 1-based."""
    return chr(ord("A") + col) + str(row + 1)


def add_hold(
    catalog: Catalog,
    row: int,
    col: int,
    level: int = 2,
    tags: list[str] | None = None,
    hold_id: str | None = None,
) -> Catalog:
    """Ajoute une prise au catalogue. Position (row,col) doit être libre et dans la grille."""
    if not (0 <= row < catalog.grid.rows and 0 <= col < catalog.grid.cols):
        raise ValueError(f"Position ({row},{col}) hors grille {catalog.grid.rows}×{catalog.grid.cols}")
    occupied = {(h.position.row, h.position.col) for h in catalog.holds}
    if (row, col) in occupied:
        raise ValueError(f"Position ({row},{col}) déjà occupée")
    hid = hold_id or _position_to_id(row, col)
    if any(h.id == hid for h in catalog.holds):
        base = hid
        i = 1
        while any(h.id == f"{base}{i}" for h in catalog.holds):
            i += 1
        hid = f"{base}{i}"
    new_hold = Hold(
        id=hid,
        level=level,
        tags=tags or [],
        position=Position(row=row, col=col),
        active=True,
    )
    return catalog.model_copy(update={"holds": list(catalog.holds) + [new_hold]})


def ensure_full_grid(catalog: Catalog) -> Catalog:
    """Complète le catalogue avec des prises par défaut (level=1) pour les positions vides.
    Ne s'applique qu'à la grille standard 7×6."""
    from brlok.models import DEFAULT_GRID
    if catalog.grid.rows != DEFAULT_GRID.rows or catalog.grid.cols != DEFAULT_GRID.cols:
        return catalog
    occupied = {(h.position.row, h.position.col) for h in catalog.holds}
    rows, cols = catalog.grid.rows, catalog.grid.cols
    extra_holds: list[Hold] = []
    for r in range(rows):
        for c in range(cols):
            if (r, c) not in occupied:
                extra_holds.append(
                    Hold(
                        id=_position_to_id(r, c),
                        level=1,
                        tags=[],
                        position=Position(row=r, col=c),
                        active=True,
                    )
                )
    if not extra_holds:
        return catalog
    return catalog.model_copy(update={"holds": list(catalog.holds) + extra_holds})


def remove_hold(catalog: Catalog, hold_id: str) -> Catalog:
    """Supprime une prise du catalogue."""
    new_holds = [h for h in catalog.holds if h.id != hold_id]
    if len(new_holds) == len(catalog.holds):
        raise ValueError(f"Hold {hold_id!r} non trouvé")
    return catalog.model_copy(update={"holds": new_holds})


def update_hold_level(catalog: Catalog, hold_id: str, new_level: int) -> Catalog:
    """Met à jour le niveau d'une prise. Retourne un nouveau Catalog."""
    for i, hold in enumerate(catalog.holds):
        if hold.id == hold_id:
            new_hold = Hold(
                id=hold.id,
                level=new_level,
                tags=hold.tags,
                position=hold.position,
                active=hold.active,
            )
            new_holds = list(catalog.holds)
            new_holds[i] = new_hold
            return catalog.model_copy(update={"holds": new_holds})
    raise ValueError(f"Hold {hold_id!r} non trouvé")


def update_hold_active(catalog: Catalog, hold_id: str, active: bool) -> Catalog:
    """Met à jour le statut actif d'une prise. Retourne un nouveau Catalog."""
    for i, hold in enumerate(catalog.holds):
        if hold.id == hold_id:
            new_hold = Hold(
                id=hold.id,
                level=hold.level,
                tags=hold.tags,
                position=hold.position,
                active=active,
            )
            new_holds = list(catalog.holds)
            new_holds[i] = new_hold
            return catalog.model_copy(update={"holds": new_holds})
    raise ValueError(f"Hold {hold_id!r} non trouvé")


def _parse_tags_input(tags_str: str) -> list[str]:
    """Parse 'tag1,tag2,tag3' en liste, sans doublons, sans vides."""
    tags = [t.strip() for t in tags_str.split(",") if t.strip()]
    return list(dict.fromkeys(tags))


def update_hold_tags(catalog: Catalog, hold_id: str, new_tags: list[str]) -> Catalog:
    """Met à jour les tags d'une prise. Retourne un nouveau Catalog."""
    for i, hold in enumerate(catalog.holds):
        if hold.id == hold_id:
            new_hold = Hold(
                id=hold.id,
                level=hold.level,
                tags=new_tags,
                position=hold.position,
                active=hold.active,
            )
            new_holds = list(catalog.holds)
            new_holds[i] = new_hold
            return catalog.model_copy(update={"holds": new_holds})
    raise ValueError(f"Hold {hold_id!r} non trouvé")
