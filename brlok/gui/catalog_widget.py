# -*- coding: utf-8 -*-
"""Widget de consultation et modification du catalogue des prises."""
from __future__ import annotations

from pathlib import Path
from typing import Callable

from pydantic import ValidationError
from PySide6.QtCore import Qt, QTimer, Signal
from PySide6.QtGui import QMouseEvent
from PySide6.QtWidgets import (
    QCheckBox,
    QComboBox,
    QDialog,
    QDialogButtonBox,
    QInputDialog,
    QFrame,
    QFormLayout,
    QGridLayout,
    QHeaderView,
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QMenu,
    QPushButton,
    QScrollArea,
    QSplitter,
    QSpinBox,
    QToolButton,
    QTableWidget,
    QTableWidgetItem,
    QVBoxLayout,
    QWidget,
)

from PySide6.QtGui import QColor

from brlok.models import Catalog, GridDimensions, Hold
from brlok.models.catalog import FOOT_GRID_COLS, FOOT_GRID_ROWS, FOOT_GRID_SPECS
from brlok.gui.colors import LEVEL_COLORS_PALE, INACTIVE_COLOR, get_cell_style


class _DoubleClickLabel(QLabel):
    """QLabel qui émet un signal au double-clic."""

    doubleClicked = Signal()

    def mouseDoubleClickEvent(self, event: QMouseEvent) -> None:
        self.doubleClicked.emit()
        event.accept()
        super().mouseDoubleClickEvent(event)
from brlok.storage.import_ods import export_catalog_to_ods, import_catalog_from_ods
from brlok.storage.catalog_store import export_catalog_to_json, load_catalog_from_json
from brlok.storage.catalog_ops import (
    add_hold,
    remove_hold,
    update_hold_active,
    update_hold_level,
    update_hold_tags,
    _parse_tags_input,
)
from brlok.storage.catalog_store import create_default_catalog


class CatalogWidget(QWidget):
    """Vue de consultation du catalogue : liste des prises + grille."""

    def __init__(
        self,
        catalog: Catalog,
        parent: QWidget | None = None,
        *,
        on_save: Callable[[Catalog], None] | None = None,
        on_new_catalog: Callable[[Catalog, str], None] | None = None,
        on_set_default: Callable[[], None] | None = None,
        on_remove_catalog: Callable[[], None] | None = None,
        catalog_combo: QComboBox | None = None,
    ) -> None:
        super().__init__(parent)
        self._catalog = catalog
        self._on_save = on_save
        self._cb_new_catalog = on_new_catalog
        self._on_set_default = on_set_default
        self._on_remove_catalog = on_remove_catalog
        self._catalog_combo = catalog_combo
        self._sorted_holds: list = []
        self._list_panel_expanded = True
        self._list_panel_saved_width = 350
        self._build_ui()

    def set_remove_catalog_enabled(self, enabled: bool) -> None:
        """Active/désactive le bouton Supprimer ce catalogue."""
        if self._remove_catalog_btn:
            self._remove_catalog_btn.setEnabled(enabled)

    def set_catalog(self, catalog: Catalog) -> None:
        """Met à jour le catalogue affiché (7.1)."""
        self._catalog = catalog
        self._grid_label.setText(f"Grille: {self._catalog.grid.rows}×{self._catalog.grid.cols}")
        left_layout = self._left_panel.layout()
        left_layout.removeWidget(self._grid_widget)
        self._grid_widget.deleteLater()
        self._grid_widget = self._make_grid_view()
        left_layout.insertWidget(0, self._grid_widget)
        self._refresh_table()

    def _build_ui(self) -> None:
        main_layout = QVBoxLayout(self)

        # Catalogue actif (si multi-pan)
        if self._catalog_combo is not None:
            row = QHBoxLayout()
            row.addWidget(QLabel("Catalogue actif :"))
            row.addWidget(self._catalog_combo)
            row.addStretch()
            main_layout.addLayout(row)

        # Splitter horizontal : gauche (pan) | droite (outils + liste)
        self._catalog_splitter = QSplitter(Qt.Orientation.Horizontal)

        # Panneau gauche : grille mains + pieds (min largeur pour garder taille des cases)
        self._left_panel = QWidget()
        self._left_panel.setMinimumWidth(322)  # 6×52 + 5×2 spacing (rectangles)
        left_layout = QVBoxLayout(self._left_panel)
        left_layout.setContentsMargins(0, 0, 0, 0)
        self._grid_widget = self._make_grid_view()
        left_layout.addWidget(self._grid_widget)
        self._catalog_splitter.addWidget(self._left_panel)

        # Panneau droit : outils + liste des prises
        self._right_panel = QFrame()
        self._right_panel.setObjectName("Sidebar")
        self._right_panel.setMinimumWidth(280)
        self._right_panel.setMaximumWidth(420)
        right_layout = QVBoxLayout(self._right_panel)
        self._grid_label = QLabel(f"Grille: {self._catalog.grid.rows}×{self._catalog.grid.cols}")
        self._grid_label.setStyleSheet("font-weight: bold;")
        right_layout.addWidget(self._grid_label)
        btn_layout = QVBoxLayout()
        for btn in (
            ("Modifier les prises", self._on_modify_holds),
            ("Ajouter une prise", self._on_add_hold_clicked),
            ("Nouveau catalogue", self._on_new_catalog_clicked),
        ):
            b = QPushButton(btn[0])
            b.clicked.connect(btn[1])
            b.setMinimumHeight(32)
            btn_layout.addWidget(b)
        import_export_btn = QPushButton("Import / Export catalogue")
        import_export_menu = QMenu(import_export_btn)
        act_ods = import_export_menu.addAction("Importer depuis ODS…")
        act_ods.triggered.connect(self._on_import_ods)
        act_json_in = import_export_menu.addAction("Importer depuis JSON…")
        act_json_in.triggered.connect(self._on_import_json)
        act_json_out = import_export_menu.addAction("Exporter en JSON…")
        act_json_out.triggered.connect(self._on_export_json)
        act_ods_out = import_export_menu.addAction("Exporter en ODS…")
        act_ods_out.triggered.connect(self._on_export_ods)
        import_export_btn.setMenu(import_export_menu)
        import_export_btn.setMinimumHeight(32)
        btn_layout.addWidget(import_export_btn)
        if self._on_set_default:
            set_default_btn = QPushButton("Définir comme défaut")
            set_default_btn.setToolTip("Ce catalogue sera chargé au prochain démarrage")
            set_default_btn.clicked.connect(self._on_set_default)
            set_default_btn.setMinimumHeight(32)
            btn_layout.addWidget(set_default_btn)
        self._remove_catalog_btn = None
        if self._on_remove_catalog:
            self._remove_catalog_btn = QPushButton("Supprimer ce catalogue")
            self._remove_catalog_btn.setToolTip("Retirer ce catalogue de la collection (impossible s'il n'en reste qu'un)")
            self._remove_catalog_btn.clicked.connect(self._on_remove_catalog)
            self._remove_catalog_btn.setMinimumHeight(32)
            btn_layout.addWidget(self._remove_catalog_btn)
        right_layout.addLayout(btn_layout)
        reset_foot_btn = QPushButton("Réinitialiser Pieds")
        reset_foot_btn.clicked.connect(self._on_reset_foot_grid)
        reset_foot_btn.setMinimumHeight(32)
        right_layout.addWidget(reset_foot_btn)

        # Liste des prises (rétractable)
        self._list_frame = QFrame()
        self._list_frame.setFrameStyle(QFrame.Shape.StyledPanel)
        list_layout = QVBoxLayout(self._list_frame)
        list_header = QHBoxLayout()
        list_label = QLabel("Prises:")
        list_label.setStyleSheet("font-weight: bold;")
        list_header.addWidget(list_label)
        self._list_toggle_btn = QToolButton()
        self._list_toggle_btn.setToolTip("Replier / Déplier la liste")
        self._list_toggle_btn.setText("▼")
        self._list_toggle_btn.setCheckable(True)
        self._list_toggle_btn.setChecked(True)
        self._list_toggle_btn.clicked.connect(self._on_toggle_list_panel)
        list_header.addStretch()
        list_header.addWidget(self._list_toggle_btn)
        list_layout.addLayout(list_header)
        self._search_edit = QLineEdit()
        self._search_edit.setPlaceholderText("Rechercher (ID, tags)…")
        self._search_edit.setClearButtonEnabled(True)
        self._search_edit.textChanged.connect(self._on_catalog_search_changed)
        list_layout.addWidget(self._search_edit)

        self._table = QTableWidget()
        self._table.setColumnCount(4)
        self._table.setHorizontalHeaderLabels(["ID", "Niveau", "Tags", "Actif"])
        header = self._table.horizontalHeader()
        for c in range(4):
            header.setSectionResizeMode(c, QHeaderView.ResizeMode.ResizeToContents)
        header.setSectionResizeMode(2, QHeaderView.ResizeMode.Stretch)  # Tags prend l'espace restant
        self._table.setEditTriggers(
            QTableWidget.EditTrigger.DoubleClicked
            | QTableWidget.EditTrigger.SelectedClicked
            | QTableWidget.EditTrigger.EditKeyPressed
        )
        self._table.setSelectionBehavior(QTableWidget.SelectionBehavior.SelectRows)
        self._table.setSelectionMode(QTableWidget.SelectionMode.SingleSelection)
        self._table.cellChanged.connect(self._on_cell_changed)
        self._table.itemChanged.connect(self._on_item_changed)
        self._table.itemDoubleClicked.connect(self._on_table_double_click)
        self._table.setContextMenuPolicy(Qt.ContextMenuPolicy.CustomContextMenu)
        self._table.customContextMenuRequested.connect(self._on_table_context_menu)

        self._sorted_holds = sorted(self._catalog.holds, key=lambda h: (h.position.row, h.position.col))
        for row, hold in enumerate(self._sorted_holds):
            self._table.insertRow(row)
            id_item = QTableWidgetItem(hold.id)
            id_item.setFlags(id_item.flags() & ~Qt.ItemFlag.ItemIsEditable)
            self._table.setItem(row, 0, id_item)
            level_item = QTableWidgetItem(str(hold.level))
            level_item.setFlags(level_item.flags() | Qt.ItemFlag.ItemIsEditable)
            self._table.setItem(row, 1, level_item)
            tags_item = QTableWidgetItem(", ".join(hold.tags) if hold.tags else "")
            tags_item.setFlags(tags_item.flags() | Qt.ItemFlag.ItemIsEditable)
            self._table.setItem(row, 2, tags_item)
            actif_item = QTableWidgetItem("")
            actif_item.setFlags(
                (actif_item.flags() | Qt.ItemFlag.ItemIsUserCheckable) & ~Qt.ItemFlag.ItemIsEditable
            )
            actif_item.setCheckState(Qt.CheckState.Checked if hold.active else Qt.CheckState.Unchecked)
            actif_item.setData(Qt.ItemDataRole.UserRole, hold.id)
            self._table.setItem(row, 3, actif_item)
            bg = QColor(INACTIVE_COLOR) if not hold.active else QColor(LEVEL_COLORS_PALE.get(hold.level, "#f5f5f5"))
            for col in range(4):
                cell = self._table.item(row, col)
                if cell:
                    cell.setBackground(bg)

        list_layout.addWidget(self._table)
        right_layout.addWidget(self._list_frame)

        self._catalog_splitter.addWidget(self._right_panel)
        self._catalog_splitter.setSizes([520, 350])
        self._catalog_splitter.setStretchFactor(0, 1)  # pan
        self._catalog_splitter.setStretchFactor(1, 0)  # droite
        self._catalog_splitter.setCollapsible(1, True)
        main_layout.addWidget(self._catalog_splitter)

    def _on_toggle_list_panel(self) -> None:
        """Replie ou déplie le panneau liste des prises."""
        self._list_panel_expanded = not self._list_panel_expanded
        sizes = self._catalog_splitter.sizes()
        total = sum(sizes)
        if self._list_panel_expanded:
            self._list_toggle_btn.setText("▼")
            self._list_toggle_btn.setChecked(True)
            self._catalog_splitter.setSizes([total - self._list_panel_saved_width, self._list_panel_saved_width])
        else:
            self._list_panel_saved_width = sizes[1] if sizes[1] > 0 else 350
            self._list_toggle_btn.setText("▶")
            self._list_toggle_btn.setChecked(False)
            self._catalog_splitter.setSizes([total, 0])

    def _on_modify_holds(self) -> None:
        """Ouvre une fenêtre avec la liste des prises et leur difficulté."""
        self._show_modify_holds_dialog()

    def _refresh_foot_edits(self) -> None:
        """Met à jour les labels pieds depuis catalog.foot_grid, couleur selon foot_levels."""
        if not hasattr(self, "_foot_labels"):
            return
        grid = self._catalog.foot_grid
        foot_levels = getattr(self._catalog, "foot_levels", None) or [[1] * 6 for _ in range(4)]
        for (r, c), lbl in self._foot_labels.items():
            val = ""
            if r < len(grid) and grid[r] and c < len(grid[r]):
                val = str(grid[r][c]) if grid[r][c] else ""
            lev = foot_levels[r][c] if r < len(foot_levels) and c < len(foot_levels[r]) else 1
            lbl.setText(val)
            lbl.setStyleSheet(get_cell_style(val or "·", lev, True, False) if val else get_cell_style("·", 2, True, False))

    def _on_foot_double_click(self, row: int, col: int) -> None:
        """Double-clic : dialogue pour choisir la spec."""
        self._show_foot_spec_dialog(row, col)

    def _apply_foot_value(self, row: int, col: int, value: str, level: int = 1) -> None:
        """Applique spec et niveau à la cellule pied et sauvegarde."""
        grid = [list(r) for r in self._catalog.foot_grid]
        while len(grid) <= row:
            grid.append([""] * FOOT_GRID_COLS)
        if col >= len(grid[row]):
            grid[row].extend([""] * (col - len(grid[row]) + 1))
        grid[row][col] = value.strip()
        levels = [list(r) for r in getattr(self._catalog, "foot_levels", None) or [[1] * FOOT_GRID_COLS for _ in range(FOOT_GRID_ROWS)]]
        while len(levels) <= row:
            levels.append([1] * FOOT_GRID_COLS)
        if col >= len(levels[row]):
            levels[row].extend([1] * (col - len(levels[row]) + 1))
        levels[row][col] = max(1, min(6, level))
        self._catalog = self._catalog.model_copy(update={"foot_grid": grid, "foot_levels": levels})
        lbl = self._foot_labels.get((row, col))
        if lbl:
            lbl.setText(value.strip())
            lbl.setStyleSheet(
                get_cell_style(value.strip(), levels[row][col], True, False)
                if value.strip()
                else get_cell_style("·", 2, True, False)
            )
        if self._on_save:
            self._on_save(self._catalog)

    def _show_foot_spec_dialog(self, row: int, col: int) -> None:
        """Dialogue pour choisir une spec (liste déroulante, utilise notre thème)."""
        extra_vals: set[str] = set()
        for r in range(min(len(self._catalog.foot_grid), FOOT_GRID_ROWS)):
            row_data = self._catalog.foot_grid[r] if r < len(self._catalog.foot_grid) else []
            for c in range(min(len(row_data) if row_data else 0, self._catalog.grid.cols)):
                v = str(row_data[c]) if row_data[c] else ""
                if v and v not in FOOT_GRID_SPECS:
                    extra_vals.add(v)
        items = list(FOOT_GRID_SPECS) + sorted(extra_vals) + ["---", "Nouvelle entrée…"]
        current = ""
        if row < len(self._catalog.foot_grid) and self._catalog.foot_grid[row] and col < len(self._catalog.foot_grid[row]):
            current = str(self._catalog.foot_grid[row][col]) if self._catalog.foot_grid[row][col] else ""

        foot_levels = getattr(self._catalog, "foot_levels", None) or [[1] * self._catalog.grid.cols for _ in range(FOOT_GRID_ROWS)]
        current_level = foot_levels[row][col] if row < len(foot_levels) and col < len(foot_levels[row]) else 1

        dlg = QDialog(self.window() or self)
        dlg.setWindowTitle("Spec pied")
        layout = QVBoxLayout(dlg)
        layout.addWidget(QLabel("Choisir la spec :"))
        combo = QComboBox()
        combo.addItems(items)
        combo.setCurrentIndex(items.index(current) if current in items else 0)
        layout.addWidget(combo)
        level_row = QHBoxLayout()
        level_row.addWidget(QLabel("Niveau (1–6) :"))
        level_spin = QSpinBox()
        level_spin.setRange(1, 6)
        level_spin.setValue(current_level)
        level_row.addWidget(level_spin)
        level_row.addStretch()
        layout.addLayout(level_row)
        btns = QDialogButtonBox(QDialogButtonBox.StandardButton.Ok | QDialogButtonBox.StandardButton.Cancel)
        btns.accepted.connect(dlg.accept)
        btns.rejected.connect(dlg.reject)
        layout.addWidget(btns)

        if dlg.exec() == QDialog.DialogCode.Accepted:
            val = combo.currentText()
            lev = level_spin.value()
            if val == "Nouvelle entrée…":
                new_val, ok2 = QInputDialog.getText(
                    dlg, "Nouvelle entrée pied", "Spécification (ex: 22, bi40, 15°):", text=""
                )
                if ok2 and new_val and new_val.strip():
                    self._apply_foot_value(row, col, new_val.strip(), lev)
            elif val != "---":
                self._apply_foot_value(row, col, str(val), lev)

    def _on_foot_context_menu(self, row: int, col: int) -> None:
        """Menu contextuel sur une cellule pied : Modifier… ou Nouvelle entrée…"""
        menu = QMenu(self)
        act_mod = menu.addAction("Modifier…")
        act_new = menu.addAction("Nouvelle entrée…")
        from PySide6.QtGui import QCursor
        action = menu.exec(QCursor.pos())
        if action == act_mod:
            self._show_foot_spec_dialog(row, col)
        elif action == act_new:
            val, ok = QInputDialog.getText(
                self,
                "Nouvelle entrée pied",
                "Spécification (ex: 22, bi40, 15°):",
                text="",
            )
            if ok and val is not None:
                new_val = str(val).strip()
                if new_val:
                    self._apply_foot_value(row, col, new_val, level=1)

    def _on_reset_foot_grid(self) -> None:
        """Réinitialise la grille pieds à FOOT_GRID_6x4."""
        from brlok.models.catalog import _default_foot_grid, _default_foot_levels
        self._catalog = self._catalog.model_copy(update={"foot_grid": _default_foot_grid(), "foot_levels": _default_foot_levels()})
        self._refresh_foot_edits()
        if self._on_save:
            self._on_save(self._catalog)

    def _position_to_id(self, row: int, col: int) -> str:
        """Génère l'id A1, B2... à partir de (row, col)."""
        return chr(ord("A") + col) + str(row + 1)

    def _show_modify_holds_dialog(self) -> None:
        """Fenêtre : liste des 42 prises (A1..F7) avec colonne difficulté éditable."""
        from PySide6.QtWidgets import QMessageBox
        rows, cols = self._catalog.grid.rows, self._catalog.grid.cols
        hold_by_pos: dict[tuple[int, int], Hold] = {
            (h.position.row, h.position.col): h for h in self._catalog.holds
        }
        dlg = QDialog(self.window() or self)
        dlg.setWindowTitle("Modifier les prises")
        dlg.setMinimumSize(320, 500)
        layout = QVBoxLayout(dlg)
        table = QTableWidget()
        table.setColumnCount(2)
        table.setHorizontalHeaderLabels(["Prise", "Difficulté"])
        table.horizontalHeader().setStretchLastSection(True)
        positions: list[tuple[int, int]] = [
            (r, c) for c in range(cols) for r in range(rows)
        ]
        table.setRowCount(len(positions))
        for row, (r, c) in enumerate(positions):
            pos_id = self._position_to_id(r, c)
            id_item = QTableWidgetItem(pos_id)
            id_item.setFlags(id_item.flags() & ~Qt.ItemFlag.ItemIsEditable)
            table.setItem(row, 0, id_item)
            hold = hold_by_pos.get((r, c))
            level = hold.level if hold else 2
            spin = QSpinBox()
            spin.setRange(1, 5)
            spin.setValue(level)
            spin.setAlignment(Qt.AlignmentFlag.AlignCenter)
            table.setCellWidget(row, 1, spin)
        layout.addWidget(table)
        btns = QDialogButtonBox(QDialogButtonBox.StandardButton.Ok | QDialogButtonBox.StandardButton.Cancel)
        btns.accepted.connect(dlg.accept)
        btns.rejected.connect(dlg.reject)
        layout.addWidget(btns)

        def apply_changes() -> None:
            for row, (r, c) in enumerate(positions):
                spin = table.cellWidget(row, 1)
                if not isinstance(spin, QSpinBox):
                    continue
                new_level = spin.value()
                hold = hold_by_pos.get((r, c))
                if hold:
                    if hold.level != new_level:
                        self._catalog = update_hold_level(self._catalog, hold.id, new_level)
                else:
                    self._catalog = add_hold(self._catalog, r, c, level=new_level)
            self._refresh_table()
            self._refresh_grid()
            if self._on_save:
                self._on_save(self._catalog)

        if dlg.exec() != QDialog.DialogCode.Accepted:
            return
        apply_changes()
        QMessageBox.information(self, "Prises modifiées", "Les difficultés ont été mises à jour.")

    def _on_add_hold_clicked(self) -> None:
        """Ouvre un dialogue pour ajouter une prise à une position libre."""
        occupied = {(h.position.row, h.position.col) for h in self._catalog.holds}
        rows, cols = self._catalog.grid.rows, self._catalog.grid.cols
        free_positions = [(r, c) for r in range(rows) for c in range(cols) if (r, c) not in occupied]
        if not free_positions:
            from PySide6.QtWidgets import QMessageBox
            QMessageBox.warning(
                self,
                "Ajouter une prise",
                "Toutes les positions sont occupées (grille 7×6).\n\n"
                "Pour ajouter une prise :\n"
                "1. Clic droit sur une prise dans la grille → « Supprimer la prise »\n"
                "2. Puis recliquez sur « Ajouter une prise » pour choisir la position libérée.",
            )
            return
        self._show_add_hold_position_dialog(free_positions)

    def _show_add_hold_position_dialog(
        self, free_positions: list[tuple[int, int]]
    ) -> None:
        """Dialogue pour choisir une position libre puis ajouter la prise."""
        from PySide6.QtWidgets import QMessageBox
        dlg = QDialog(self.window() or self)
        dlg.setWindowTitle("Ajouter une prise")
        layout = QFormLayout(dlg)
        combo = QComboBox()
        for r, c in sorted(free_positions):
            label = f"Ligne {r + 1}, Colonne {c + 1} ({chr(65 + c)}{r + 1})"
            combo.addItem(label, (r, c))
        layout.addRow("Position libre :", combo)
        spin = QSpinBox()
        spin.setRange(1, 5)
        spin.setValue(2)
        layout.addRow("Niveau (1-5) :", spin)
        btns = QDialogButtonBox(QDialogButtonBox.StandardButton.Ok | QDialogButtonBox.StandardButton.Cancel)
        btns.accepted.connect(dlg.accept)
        btns.rejected.connect(dlg.reject)
        layout.addRow(btns)
        if dlg.exec() != QDialog.DialogCode.Accepted:
            return
        row, col = combo.currentData()
        level = spin.value()
        try:
            self._catalog = add_hold(self._catalog, row, col, level=level)
            self._refresh_table()
            self._refresh_grid()
            if self._on_save:
                self._on_save(self._catalog)
            QMessageBox.information(self, "Prise ajoutée", f"Prise ajoutée à la position {chr(65 + col)}{row + 1}.")
        except ValueError as e:
            QMessageBox.warning(self, "Erreur", str(e))

    def _on_add_hold_done(self, row: int, col: int, level: int | None) -> None:
        """Callback après le dialogue d'ajout (double-clic sur cellule vide)."""
        from PySide6.QtWidgets import QMessageBox
        if level is None:
            return
        try:
            self._catalog = add_hold(self._catalog, row, col, level=level)
            self._refresh_table()
            self._refresh_grid()
            if self._on_save:
                self._on_save(self._catalog)
            QMessageBox.information(self, "Prise ajoutée", f"Prise ajoutée à la position {chr(65 + col)}{row + 1}.")
        except ValueError as e:
            QMessageBox.warning(self, "Erreur", str(e))

    def _get_import_export_dir(self) -> str:
        """Répertoire par défaut pour les dialogues import/export."""
        from PySide6.QtCore import QStandardPaths
        docs = QStandardPaths.writableLocation(QStandardPaths.StandardLocation.DocumentsLocation)
        return docs if docs else str(Path.home())

    def _on_import_ods(self) -> None:
        """Ouvre une boîte de dialogue pour importer un catalogue depuis ODS."""
        from PySide6.QtWidgets import QFileDialog, QMessageBox

        parent = self.window()
        path, _ = QFileDialog.getOpenFileName(
            parent,
            "Importer depuis ODS",
            self._get_import_export_dir(),
            "Fichiers ODS (*.ods);;Tous les fichiers (*)",
        )
        path = str(path).strip() if path else ""
        if not path:
            return
        try:
            self._catalog = import_catalog_from_ods(Path(path))
            self._replace_catalog_ui()
            if self._on_save:
                self._on_save(self._catalog)
            QMessageBox.information(
                self,
                "Import réussi",
                f"Catalogue importé : {len(self._catalog.holds)} prises, "
                f"grille {self._catalog.grid.rows}×{self._catalog.grid.cols}.",
            )
        except Exception as e:
            QMessageBox.critical(self, "Erreur d'import", str(e))

    def _on_import_json(self) -> None:
        """Importe un catalogue depuis un fichier JSON."""
        from PySide6.QtWidgets import QFileDialog, QMessageBox

        parent = self.window()
        path, _ = QFileDialog.getOpenFileName(
            parent,
            "Importer depuis JSON",
            self._get_import_export_dir(),
            "Fichiers JSON (*.json);;Tous les fichiers (*)",
        )
        path = str(path).strip() if path else ""
        if not path:
            return
        try:
            self._catalog = load_catalog_from_json(Path(path))
            self._replace_catalog_ui()
            if self._on_save:
                self._on_save(self._catalog)
            QMessageBox.information(
                self,
                "Import réussi",
                f"Catalogue importé : {len(self._catalog.holds)} prises, "
                f"grille {self._catalog.grid.rows}×{self._catalog.grid.cols}.",
            )
        except Exception as e:
            QMessageBox.critical(self, "Erreur d'import", str(e))

    def _on_export_json(self) -> None:
        """Exporte le catalogue vers un fichier JSON."""
        from PySide6.QtWidgets import QFileDialog, QMessageBox

        parent = self.window()
        path, _ = QFileDialog.getSaveFileName(
            parent,
            "Exporter le catalogue",
            self._get_import_export_dir(),
            "Fichiers JSON (*.json);;Tous les fichiers (*)",
        )
        path = str(path).strip() if path else ""
        if not path:
            return
        if not path.lower().endswith(".json"):
            path = path + ".json"
        try:
            export_catalog_to_json(self._catalog, Path(path))
            QMessageBox.information(self, "Export", f"Catalogue exporté dans {path}")
        except Exception as e:
            QMessageBox.critical(self, "Erreur d'export", str(e))

    def _on_export_ods(self) -> None:
        """Exporte le catalogue vers un fichier ODS."""
        from PySide6.QtWidgets import QFileDialog, QMessageBox

        parent = self.window()
        path, _ = QFileDialog.getSaveFileName(
            parent,
            "Exporter le catalogue",
            self._get_import_export_dir(),
            "Fichiers ODS (*.ods);;Tous les fichiers (*)",
        )
        path = str(path).strip() if path else ""
        if not path:
            return
        if not path.lower().endswith(".ods"):
            path = path + ".ods"
        try:
            export_catalog_to_ods(self._catalog, Path(path))
            QMessageBox.information(self, "Export", f"Catalogue exporté dans {path}")
        except Exception as e:
            QMessageBox.critical(self, "Erreur d'export", str(e))

    def _replace_catalog_ui(self) -> None:
        """Met à jour l'UI après remplacement du catalogue (import ODS/JSON)."""
        self._grid_label.setText(f"Grille: {self._catalog.grid.rows}×{self._catalog.grid.cols}")
        left_layout = self._left_panel.layout()
        left_layout.removeWidget(self._grid_widget)
        self._grid_widget.deleteLater()
        self._grid_widget = self._make_grid_view()
        left_layout.insertWidget(0, self._grid_widget)
        self._refresh_table()

    def _on_new_catalog_clicked(self) -> None:
        """Crée un nouveau catalogue et l'ajoute à la collection (7.1)."""
        from PySide6.QtWidgets import QInputDialog, QMessageBox

        if self._cb_new_catalog:
            parent = self.window() or self
            if parent:
                parent.raise_()
                parent.activateWindow()
            name, ok = QInputDialog.getText(
                parent,
                "Nouveau catalogue",
                "Nom du catalogue :",
                text="Pan salle",
            )
            if not ok:
                return
            name = name.strip()
            if not name:
                QMessageBox.warning(
                    parent,
                    "Nouveau catalogue",
                    "Le nom ne peut pas être vide.",
                )
                return
            new_cat = create_default_catalog()
            self._cb_new_catalog(new_cat, name)
            return

        reply = QMessageBox.question(
            self,
            "Nouveau catalogue",
            "Créer un nouveau catalogue avec toutes les cases remplies par défaut (7×6) ? "
            "Les prises actuelles seront perdues.",
            QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No,
            QMessageBox.StandardButton.No,
        )
        if reply != QMessageBox.StandardButton.Yes:
            return
        self._catalog = create_default_catalog()
        self._grid_label.setText("Grille: 7×6")
        left_layout = self._left_panel.layout()
        left_layout.removeWidget(self._grid_widget)
        self._grid_widget.deleteLater()
        self._grid_widget = self._make_grid_view()
        left_layout.insertWidget(0, self._grid_widget)
        self._refresh_table()
        if self._on_save:
            self._on_save(self._catalog)
        QMessageBox.information(
            self,
            "Nouveau catalogue",
            "Catalogue réinitialisé (7×6 = 42 prises par défaut). "
            "Activez ou désactivez les prises selon vos besoins pour les séances.",
        )

    def _refresh_table(self) -> None:
        """Reconstruit la table des prises."""
        self._table.blockSignals(True)
        self._table.setRowCount(0)
        self._sorted_holds = sorted(self._catalog.holds, key=lambda h: (h.position.row, h.position.col))
        for row, hold in enumerate(self._sorted_holds):
            self._table.insertRow(row)
            id_item = QTableWidgetItem(hold.id)
            id_item.setFlags(id_item.flags() & ~Qt.ItemFlag.ItemIsEditable)
            self._table.setItem(row, 0, id_item)
            level_item = QTableWidgetItem(str(hold.level))
            level_item.setFlags(level_item.flags() | Qt.ItemFlag.ItemIsEditable)
            self._table.setItem(row, 1, level_item)
            tags_item = QTableWidgetItem(", ".join(hold.tags) if hold.tags else "")
            tags_item.setFlags(tags_item.flags() | Qt.ItemFlag.ItemIsEditable)
            self._table.setItem(row, 2, tags_item)
            actif_item = QTableWidgetItem("")
            actif_item.setFlags(
                (actif_item.flags() | Qt.ItemFlag.ItemIsUserCheckable) & ~Qt.ItemFlag.ItemIsEditable
            )
            actif_item.setCheckState(Qt.CheckState.Checked if hold.active else Qt.CheckState.Unchecked)
            actif_item.setData(Qt.ItemDataRole.UserRole, hold.id)
            self._table.setItem(row, 3, actif_item)
            bg = QColor(INACTIVE_COLOR) if not hold.active else QColor(LEVEL_COLORS_PALE.get(hold.level, "#f5f5f5"))
            for col in range(4):
                cell = self._table.item(row, col)
                if cell:
                    cell.setBackground(bg)
        self._table.blockSignals(False)
        self._apply_catalog_search_filter()

    def _on_catalog_search_changed(self, text: str) -> None:
        self._apply_catalog_search_filter()

    def _apply_catalog_search_filter(self) -> None:
        """Filtre la table des prises par ID ou tags."""
        if not hasattr(self, "_search_edit") or not hasattr(self, "_sorted_holds"):
            return
        search = self._search_edit.text().strip().lower()
        for i in range(self._table.rowCount()):
            if i >= len(self._sorted_holds):
                break
            hold = self._sorted_holds[i]
            match = (
                not search
                or search in hold.id.lower()
                or search in ",".join(hold.tags).lower()
            )
            self._table.setRowHidden(i, not match)

    def _on_item_changed(self, item: QTableWidgetItem) -> None:
        """Checkbox Actif toggle → mise à jour et sauvegarde."""
        if self._table.column(item) != 3:
            return
        hold_id = item.data(Qt.ItemDataRole.UserRole)
        if not hold_id:
            return
        new_active = item.checkState() == Qt.CheckState.Checked
        for i, h in enumerate(self._sorted_holds):
            if h.id == hold_id and h.active != new_active:
                try:
                    self._table.blockSignals(True)
                    self._catalog = update_hold_active(self._catalog, hold_id, new_active)
                    self._sorted_holds = sorted(self._catalog.holds, key=lambda x: (x.position.row, x.position.col))
                    item.setText("")
                    row = self._table.row(item)
                    self._refresh_grid()
                    self._update_table_row_style(row)
                    if self._on_save:
                        self._on_save(self._catalog)
                finally:
                    self._table.blockSignals(False)
                break

    def _on_cell_changed(self, row: int, col: int) -> None:
        """Niveau ou tags modifié → mise à jour hold et sauvegarde."""
        if row >= len(self._sorted_holds):
            return
        hold_id = self._sorted_holds[row].id

        if col == 1:
            self._apply_level_change(row, hold_id)
        elif col == 2:
            self._apply_tags_change(row, hold_id)

    def _apply_level_change(self, row: int, hold_id: str) -> None:
        item = self._table.item(row, 1)
        if not item:
            return
        try:
            new_level = int(item.text())
        except ValueError:
            return
        if not 1 <= new_level <= 5:
            self._table.blockSignals(True)
            item.setText(str(self._sorted_holds[row].level))
            self._table.blockSignals(False)
            return
        if self._sorted_holds[row].level == new_level:
            return
        try:
            self._catalog = update_hold_level(self._catalog, hold_id, new_level)
            self._sorted_holds = sorted(self._catalog.holds, key=lambda h: (h.position.row, h.position.col))
            self._refresh_grid()
            self._update_table_row_style(row)
            if self._on_save:
                self._on_save(self._catalog)
        except ValueError:
            self._table.blockSignals(True)
            item.setText(str(self._sorted_holds[row].level))
            self._table.blockSignals(False)

    def _apply_tags_change(self, row: int, hold_id: str) -> None:
        item = self._table.item(row, 2)
        if not item:
            return
        new_tags = _parse_tags_input(item.text() or "")
        current_tags = self._sorted_holds[row].tags
        if new_tags == current_tags:
            return
        try:
            self._catalog = update_hold_tags(self._catalog, hold_id, new_tags)
            self._sorted_holds = sorted(self._catalog.holds, key=lambda h: (h.position.row, h.position.col))
            self._refresh_grid()
            self._update_table_row_style(row)
            if self._on_save:
                self._on_save(self._catalog)
        except ValueError:
            self._table.blockSignals(True)
            item.setText(", ".join(current_tags) if current_tags else "")
            self._table.blockSignals(False)

    def _make_grid_view(self) -> QWidget:
        """Représentation 2D de la grille avec positions occupées + grille pieds (même forme)."""
        from brlok.gui.pan_widget import GRID_SPACING, SEPARATOR_HEIGHT

        rows, cols = self._catalog.grid.rows, self._catalog.grid.cols
        positions: dict[tuple[int, int], str] = {}
        hold_info: dict[str, tuple[int, bool]] = {}
        for h in self._catalog.holds:
            positions[(h.position.row, h.position.col)] = h.id
            hold_info[h.id] = (h.level, h.active)

        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        scroll.setMinimumHeight(120)

        grid_inner = QWidget()
        self._grid_layout = QGridLayout(grid_inner)
        self._grid_layout.setHorizontalSpacing(GRID_SPACING)
        self._grid_layout.setVerticalSpacing(GRID_SPACING)
        self._grid_labels: dict[tuple[int, int], QLabel] = {}

        cell_w, cell_h = 52, 44  # rectangles

        for r in range(rows):
            for c in range(cols):
                hold_id = positions.get((r, c), "·")
                level, active = hold_info.get(hold_id, (2, True))
                label = _DoubleClickLabel(hold_id)
                label.setFixedSize(cell_w, cell_h)
                label.setToolTip("Double-clic pour modifier" if hold_id != "·" else "Double-clic pour ajouter une prise")
                label.doubleClicked.connect(lambda _r=r, _c=c: self._on_grid_double_click(_r, _c))
                label.setAlignment(Qt.AlignmentFlag.AlignCenter)
                label.setStyleSheet(get_cell_style(hold_id, level, active, False))
                label.setContextMenuPolicy(Qt.ContextMenuPolicy.CustomContextMenu)
                label.customContextMenuRequested.connect(
                    lambda pos, _r=r, _c=c: self._on_grid_context_menu(_r, _c)
                )
                self._grid_layout.addWidget(label, r, c)
                self._grid_labels[(r, c)] = label

        # Ligne séparatrice + grille pieds (même forme que le pan)
        sep = QFrame()
        sep.setFrameShape(QFrame.Shape.HLine)
        sep.setFrameShadow(QFrame.Shadow.Sunken)
        sep.setFixedHeight(SEPARATOR_HEIGHT)
        self._grid_layout.addWidget(sep, rows, 0, 1, cols)

        self._foot_labels: dict[tuple[int, int], QLabel] = {}
        foot_levels = getattr(self._catalog, "foot_levels", None) or [[1] * cols for _ in range(FOOT_GRID_ROWS)]
        for r in range(FOOT_GRID_ROWS):
            for c in range(cols):
                val = ""
                if r < len(self._catalog.foot_grid) and self._catalog.foot_grid[r] and c < len(self._catalog.foot_grid[r]):
                    val = str(self._catalog.foot_grid[r][c]) if self._catalog.foot_grid[r][c] else ""
                lev = foot_levels[r][c] if r < len(foot_levels) and c < len(foot_levels[r]) else 1
                lbl = _DoubleClickLabel(val)
                lbl.setFixedSize(cell_w, cell_h)
                lbl.setAlignment(Qt.AlignmentFlag.AlignCenter)
                foot_style = get_cell_style(val or "·", lev, True, False) if val else get_cell_style("·", 2, True, False)
                lbl.setStyleSheet(foot_style)
                lbl.setToolTip("Double-clic ou clic droit pour modifier")
                lbl.doubleClicked.connect(lambda _r=r, _c=c: self._on_foot_double_click(_r, _c))
                lbl.setContextMenuPolicy(Qt.ContextMenuPolicy.CustomContextMenu)
                lbl.customContextMenuRequested.connect(
                    lambda pos, _r=r, _c=c: self._on_foot_context_menu(_r, _c)
                )
                self._grid_layout.addWidget(lbl, rows + 1 + r, c)
                self._foot_labels[(r, c)] = lbl

        scroll.setWidget(grid_inner)
        return scroll

    def _on_grid_double_click(self, row: int, col: int) -> None:
        """Double-clic sur une cellule : ouvre le dialogue d'édition."""
        hold = next((h for h in self._catalog.holds if h.position.row == row and h.position.col == col), None)
        if hold:
            self._show_edit_hold_dialog(hold)
        else:
            self._do_add_hold_at(row, col)

    def _show_edit_hold_dialog(self, hold: Hold) -> None:
        """Ouvre le dialogue pour modifier niveau, tags et actif d'une prise."""
        dlg = QDialog(self.window() or self)
        dlg.setWindowTitle(f"Caractéristiques — {hold.id}")
        layout = QFormLayout(dlg)
        layout.addRow(QLabel(f"Prise {hold.id}"))
        level_spin = QSpinBox()
        level_spin.setRange(1, 5)
        level_spin.setValue(hold.level)
        layout.addRow("Niveau (1-5):", level_spin)
        tags_edit = QLineEdit()
        tags_edit.setText(", ".join(hold.tags))
        tags_edit.setPlaceholderText("crimp, sloper, …")
        layout.addRow("Tags:", tags_edit)
        active_cb = QCheckBox("Prise active")
        active_cb.setChecked(hold.active)
        layout.addRow(active_cb)
        btns = QDialogButtonBox(QDialogButtonBox.StandardButton.Ok | QDialogButtonBox.StandardButton.Cancel)
        btns.accepted.connect(dlg.accept)
        btns.rejected.connect(dlg.reject)
        layout.addRow(btns)
        if dlg.exec() != QDialog.DialogCode.Accepted:
            return
        from PySide6.QtWidgets import QMessageBox
        try:
            new_tags = _parse_tags_input(tags_edit.text() or "")
            self._catalog = update_hold_level(self._catalog, hold.id, level_spin.value())
            self._catalog = update_hold_tags(self._catalog, hold.id, new_tags)
            self._catalog = update_hold_active(self._catalog, hold.id, active_cb.isChecked())
            self._refresh_table()
            self._refresh_grid()
            if self._on_save:
                self._on_save(self._catalog)
        except ValueError as e:
            QMessageBox.warning(self, "Erreur", str(e))

    def _on_grid_context_menu(self, row: int, col: int) -> None:
        """Menu contextuel sur une cellule de la grille."""
        hold = next((h for h in self._catalog.holds if h.position.row == row and h.position.col == col), None)
        menu = QMenu(self)
        if hold:
            act_mod_level = menu.addAction("Modifier le niveau…")
            act_mod_tags = menu.addAction("Modifier les tags…")
            act_toggle = menu.addAction("Désactiver" if hold.active else "Activer")
            act_del = menu.addAction("Supprimer la prise")
            from PySide6.QtGui import QCursor
            action = menu.exec(QCursor.pos())
            if action == act_mod_level:
                self._do_modify_level(hold.id)
            elif action == act_mod_tags:
                self._do_modify_tags(hold.id)
            elif action == act_toggle:
                self._do_toggle_active(hold.id)
            elif action == act_del:
                self._do_remove_hold(hold.id)
        else:
            act_add = menu.addAction("Ajouter une prise ici")
            from PySide6.QtGui import QCursor
            if menu.exec(QCursor.pos()) == act_add:
                self._do_add_hold_at(row, col)

    def _on_table_double_click(self, item: QTableWidgetItem) -> None:
        """Double-clic : Niveau/Tags -> editItem ; autres colonnes -> dialog."""
        col = self._table.column(item)
        if col == 1 or col == 2:
            self._table.setCurrentItem(item)
            idx = self._table.indexFromItem(item)
            QTimer.singleShot(0, lambda: self._table.edit(idx))
            return
        if col == 3:
            return  # Checkbox géré par itemChanged
        row = self._table.row(item)
        if 0 <= row < len(self._sorted_holds):
            hold = self._sorted_holds[row]
            self._show_edit_hold_dialog(hold)

    def _on_table_context_menu(self, pos: "QPoint") -> None:
        """Menu contextuel sur une ligne de la table."""
        from PySide6.QtCore import QPoint

        item = self._table.itemAt(pos)
        if not item:
            return
        row = self._table.row(item)
        if row < 0 or row >= len(self._sorted_holds):
            return
        hold = self._sorted_holds[row]
        menu = QMenu(self)
        act_mod_level = menu.addAction("Modifier le niveau…")
        act_mod_tags = menu.addAction("Modifier les tags…")
        act_toggle = menu.addAction("Désactiver" if hold.active else "Activer")
        act_del = menu.addAction("Supprimer la prise")
        action = menu.exec(self._table.mapToGlobal(pos))
        if action == act_mod_level:
            self._do_modify_level(hold.id)
        elif action == act_mod_tags:
            self._do_modify_tags(hold.id)
        elif action == act_toggle:
            self._do_toggle_active(hold.id)
        elif action == act_del:
            self._do_remove_hold(hold.id)

    def _show_add_hold_dialog(
        self, row: int, col: int, on_done: Callable[[int, int, int | None], None]
    ) -> None:
        """Affiche une boîte de dialogue pour choisir le niveau. Appelle on_done(row, col, level ou None)."""
        parent = self.window() or self
        dlg = QDialog(parent)
        dlg.setWindowTitle("Ajouter une prise")
        dlg.setWindowModality(Qt.WindowModality.ApplicationModal)
        layout = QVBoxLayout(dlg)
        layout.addWidget(QLabel(f"Position: ligne {row + 1}, colonne {col + 1}"))
        layout.addWidget(QLabel("Niveau (1-5):"))
        spin = QSpinBox()
        spin.setRange(1, 5)
        spin.setValue(2)
        layout.addWidget(spin)
        btns = QDialogButtonBox(QDialogButtonBox.StandardButton.Ok | QDialogButtonBox.StandardButton.Cancel)
        btns.accepted.connect(dlg.accept)
        btns.rejected.connect(dlg.reject)
        layout.addWidget(btns)

        def _on_finished(result: int) -> None:
            if result == QDialog.DialogCode.Accepted:
                on_done(row, col, spin.value())
            else:
                on_done(row, col, None)

        dlg.finished.connect(_on_finished)
        dlg.open()

    def _do_add_hold_at(self, row: int, col: int) -> None:
        """Ajoute une prise à la position donnée."""
        self._show_add_hold_dialog(row, col, self._on_add_hold_done)

    def _do_modify_level(self, hold_id: str) -> None:
        """Ouvre une boîte pour modifier le niveau."""
        from PySide6.QtWidgets import QMessageBox

        hold = next(h for h in self._catalog.holds if h.id == hold_id)
        dlg = QDialog(self.window() or self)
        dlg.setWindowTitle("Modifier le niveau")
        layout = QVBoxLayout(dlg)
        layout.addWidget(QLabel(f"Prise {hold_id} — niveau (1-5):"))
        spin = QSpinBox()
        spin.setRange(1, 5)
        spin.setValue(hold.level)
        layout.addWidget(spin)
        btns = QDialogButtonBox(QDialogButtonBox.StandardButton.Ok | QDialogButtonBox.StandardButton.Cancel)
        btns.accepted.connect(dlg.accept)
        btns.rejected.connect(dlg.reject)
        layout.addWidget(btns)
        if dlg.exec() != QDialog.DialogCode.Accepted:
            return
        level = spin.value()
        try:
            self._catalog = update_hold_level(self._catalog, hold_id, level)
            self._refresh_table()
            self._refresh_grid()
            if self._on_save:
                self._on_save(self._catalog)
        except ValueError as e:
            QMessageBox.warning(self, "Erreur", str(e))

    def _do_modify_tags(self, hold_id: str) -> None:
        """Ouvre une boîte pour modifier les tags."""
        from PySide6.QtWidgets import QLineEdit, QMessageBox

        hold = next(h for h in self._catalog.holds if h.id == hold_id)
        dlg = QDialog(self.window() or self)
        dlg.setWindowTitle("Modifier les tags")
        layout = QVBoxLayout(dlg)
        layout.addWidget(QLabel(f"Prise {hold_id} — tags (séparés par des virgules):"))
        line = QLineEdit()
        line.setText(", ".join(hold.tags))
        layout.addWidget(line)
        btns = QDialogButtonBox(QDialogButtonBox.StandardButton.Ok | QDialogButtonBox.StandardButton.Cancel)
        btns.accepted.connect(dlg.accept)
        btns.rejected.connect(dlg.reject)
        layout.addWidget(btns)
        if dlg.exec() != QDialog.DialogCode.Accepted:
            return
        tags_str = line.text()
        try:
            new_tags = _parse_tags_input(tags_str or "")
            self._catalog = update_hold_tags(self._catalog, hold_id, new_tags)
            self._refresh_table()
            if self._on_save:
                self._on_save(self._catalog)
        except ValueError as e:
            QMessageBox.warning(self, "Erreur", str(e))

    def _do_toggle_active(self, hold_id: str) -> None:
        """Inverse le statut actif de la prise."""
        hold = next(h for h in self._catalog.holds if h.id == hold_id)
        self._catalog = update_hold_active(self._catalog, hold_id, not hold.active)
        self._refresh_table()
        self._refresh_grid()
        if self._on_save:
            self._on_save(self._catalog)

    def _do_remove_hold(self, hold_id: str) -> None:
        """Supprime la prise."""
        from PySide6.QtWidgets import QMessageBox

        reply = QMessageBox.question(
            self, "Supprimer",
            f"Supprimer la prise {hold_id} ?",
            QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No,
            QMessageBox.StandardButton.No,
        )
        if reply != QMessageBox.StandardButton.Yes:
            return
        try:
            self._catalog = remove_hold(self._catalog, hold_id)
            self._refresh_table()
            self._refresh_grid()
            if self._on_save:
                self._on_save(self._catalog)
        except ValueError as e:
            QMessageBox.warning(self, "Erreur", str(e))

    def _refresh_grid(self) -> None:
        """Met à jour l'affichage de la grille : texte, style (background), tooltip."""
        if not hasattr(self, "_grid_labels") or not self._grid_labels:
            return
        positions: dict[tuple[int, int], str] = {}
        hold_info: dict[str, tuple[int, bool]] = {}
        for h in self._catalog.holds:
            positions[(h.position.row, h.position.col)] = h.id
            hold_info[h.id] = (h.level, h.active)
        for (r, c), label in self._grid_labels.items():
            hold_id = positions.get((r, c), "·")
            label.setText(hold_id)
            level, active = hold_info.get(hold_id, (2, True))
            label.setStyleSheet(get_cell_style(hold_id, level, active, False))
            label.setToolTip(
                "Double-clic pour modifier" if hold_id != "·" else "Double-clic pour ajouter une prise"
            )

    def _update_table_row_style(self, row: int) -> None:
        """Met à jour la couleur de fond de la ligne de la table."""
        if row < 0 or row >= len(self._sorted_holds):
            return
        hold = self._sorted_holds[row]
        bg = QColor(INACTIVE_COLOR) if not hold.active else QColor(LEVEL_COLORS_PALE.get(hold.level, "#f5f5f5"))
        for col in range(4):
            cell = self._table.item(row, col)
            if cell:
                cell.setBackground(bg)
