# -*- coding: utf-8 -*-
"""Import du catalogue depuis un fichier ODS (Story 1.8)."""
from __future__ import annotations

import logging
import re
from pathlib import Path

from odf.opendocument import load
from odf.table import Table, TableCell, TableRow
from odf.text import P

from brlok.models import Catalog, DEFAULT_GRID, Hold, Position

logger = logging.getLogger(__name__)


# Pattern pour les IDs de prises : lettre(s) + chiffre(s), ex. A1, B7, C12
_ID_PATTERN = re.compile(r"^([A-Z]+)(\d+)$", re.IGNORECASE)


def _parse_hold_id(hold_id: str) -> tuple[int, int] | None:
    """Parse un id style A1, B7 en (row, col). Retourne None si invalide."""
    m = _ID_PATTERN.match(hold_id.strip())
    if not m:
        return None
    letters, digits = m.group(1).upper(), m.group(2)
    if len(letters) != 1 or letters < "A" or letters > "Z":
        return None
    col = ord(letters[0]) - ord("A")
    row = int(digits) - 1
    if row < 0:
        return None
    return (row, col)


def _map_level(level_ods: int) -> int:
    """Mappe le niveau ODS (1-7) vers Brlok (1-5)."""
    if level_ods <= 5:
        return level_ods
    return min(5, max(1, level_ods - 2))  # 6->4, 7->5


def _get_cell_text(cell: TableCell) -> str:
    """Extrait le texte d'une cellule ODS."""
    ps = cell.getElementsByType(P)
    if not ps or not ps[0].firstChild:
        return ""
    data = getattr(ps[0].firstChild, "data", None)
    return str(data).strip() if data else ""


def _find_sheet_with_liste_prises(doc) -> tuple[Table, int, int] | None:
    """Cherche une feuille avec colonnes 'Liste prises' et 'Niveau'.
    Retourne (table, col_id, col_level) ou None."""
    for table in doc.getElementsByType(Table):
        rows = table.getElementsByType(TableRow)
        if not rows:
            continue
        header_cells = rows[0].getElementsByType(TableCell)
        col_id = col_level = None
        for j, cell in enumerate(header_cells):
            text = _get_cell_text(cell).lower()
            if "liste" in text and "prises" in text:
                col_id = j
            elif "niveau" in text:
                col_level = j
        if col_id is not None and col_level is not None:
            return (table, col_id, col_level)
    return None


def import_catalog_from_ods(path: Path) -> Catalog:
    """Importe un catalogue depuis un fichier ODS.

    Attend une feuille avec colonnes « Liste prises » et « Niveau ».
    - id : ex. A1, B7
    - level : 1-7 (ODS) ; 99 → active=False
    - position : déduite de l'id (A1 = row 0, col 0)

    Raises:
        ValueError: fichier invalide, colonnes manquantes, ou données invalides.
    """
    if not path.exists():
        raise ValueError(f"Fichier introuvable : {path}")

    try:
        doc = load(str(path))
    except Exception as e:
        raise ValueError(f"Fichier ODS invalide ou illisible : {e}") from e

    found = _find_sheet_with_liste_prises(doc)
    if not found:
        raise ValueError(
            "Aucune feuille avec colonnes 'Liste prises' et 'Niveau' trouvée. "
            "Vérifiez la structure du fichier ODS."
        )

    table, col_id, col_level = found
    rows = table.getElementsByType(TableRow)
    holds: list[Hold] = []

    for i, row in enumerate(rows):
        if i == 0:
            continue  # skip header
        cells = row.getElementsByType(TableCell)
        if col_id >= len(cells) or col_level >= len(cells):
            continue
        hold_id = _get_cell_text(cells[col_id])
        level_str = _get_cell_text(cells[col_level])
        if not hold_id:
            continue

        pos = _parse_hold_id(hold_id)
        if pos is None:
            continue  # ignorer les lignes avec id invalide (ex. Bac], 35°])

        row_idx, col_idx = pos

        # Convention A1..F7 : A=col0, B=col1... F=col5 ; 1=row0... 7=row6
        try:
            level_ods = int(level_str) if level_str else 2
        except ValueError:
            level_ods = 2

        active = level_ods != 99
        level = _map_level(level_ods) if active else 2

        # Grille fixe : ignorer les prises hors A1..F7 (6 cols × 7 rows)
        if row_idx >= DEFAULT_GRID.rows or col_idx >= DEFAULT_GRID.cols:
            logger.warning(
                "Prise %s hors grille (row=%d, col=%d) — ignorée. Grille fixe: %d×%d",
                hold_id, row_idx, col_idx, DEFAULT_GRID.rows, DEFAULT_GRID.cols,
            )
            continue

        holds.append(
            Hold(
                id=hold_id.upper() if len(hold_id) <= 3 else hold_id,
                level=level,
                tags=[],
                position=Position(row=row_idx, col=col_idx),
                active=active,
            )
        )

    if not holds:
        raise ValueError(
            "Aucune prise valide trouvée dans la grille A1..F7. "
            "Vérifiez que la colonne 'Liste prises' contient des IDs de type A1, B2, etc."
        )

    return Catalog(holds=holds, grid=DEFAULT_GRID)


def export_catalog_to_ods(catalog: Catalog, path: Path) -> None:
    """Exporte un catalogue vers un fichier ODS (Liste prises, Niveau).

    Compatible avec l'import : feuille avec colonnes « Liste prises » et « Niveau ».
    """
    from odf.opendocument import OpenDocumentSpreadsheet
    from odf.table import Table, TableCell, TableRow
    from odf.text import P

    doc = OpenDocumentSpreadsheet()
    table = Table(name="Liste prises")
    row0 = TableRow()
    for text in ("Liste prises", "Niveau"):
        tc = TableCell()
        tc.addElement(P(text=text))
        row0.addElement(tc)
    table.addElement(row0)
    for hold in sorted(catalog.holds, key=lambda h: (h.position.row, h.position.col)):
        row = TableRow()
        level_str = str(hold.level) if hold.active else "99"
        for text in (hold.id, level_str):
            tc = TableCell()
            tc.addElement(P(text=text))
            row.addElement(tc)
        table.addElement(row)
    doc.spreadsheet.addElement(table)
    path.parent.mkdir(parents=True, exist_ok=True)
    doc.save(str(path))
