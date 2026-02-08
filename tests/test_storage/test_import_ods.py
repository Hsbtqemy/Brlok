# -*- coding: utf-8 -*-
"""Tests de l'import ODS (Story 1.8)."""
from pathlib import Path

import pytest

from brlok.models import Catalog, GridDimensions, Hold, Position
from brlok.storage.import_ods import import_catalog_from_ods


def test_import_ods_from_generateurs(tmp_path: Path) -> None:
    """Import depuis un ODS avec feuille Liste prises + Niveau."""
    # Créer un ODS minimal avec odfpy (col 0 = Liste prises, col 1 = Niveau)
    from odf.opendocument import OpenDocumentSpreadsheet
    from odf.table import Table, TableCell, TableRow
    from odf.text import P

    doc = OpenDocumentSpreadsheet()
    table = Table(name="Générateurs")
    # Header: Liste prises, Niveau
    row0 = TableRow()
    for text in ["Liste prises", "Niveau"]:
        tc = TableCell()
        tc.addElement(P(text=text))
        row0.addElement(tc)
    table.addElement(row0)
    # Data
    for hold_id, level in [("A1", "1"), ("A2", "4"), ("B1", "99"), ("B2", "3")]:
        row = TableRow()
        for text in [hold_id, str(level)]:
            tc = TableCell()
            tc.addElement(P(text=text))
            row.addElement(tc)
        table.addElement(row)
    doc.spreadsheet.addElement(table)
    ods_path = tmp_path / "test.ods"
    doc.save(ods_path)

    catalog = import_catalog_from_ods(ods_path)
    # Grille fixe 7×6 (DEFAULT_GRID) — ne plus déduire des données
    assert catalog.grid.rows == 7
    assert catalog.grid.cols == 6
    assert len(catalog.holds) == 4
    by_id = {h.id: h for h in catalog.holds}
    assert by_id["A1"].level == 1
    assert by_id["A1"].active is True
    assert by_id["B1"].level == 2
    assert by_id["B1"].active is False


def test_import_ods_file_not_found() -> None:
    """Fichier absent → ValueError."""
    with pytest.raises(ValueError, match="introuvable"):
        import_catalog_from_ods(Path("/nonexistent.ods"))
