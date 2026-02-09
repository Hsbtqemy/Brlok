# -*- coding: utf-8 -*-
"""Widget de visualisation du pan avec les prises positionnées (FR11, NFR4)."""
from __future__ import annotations

from typing import Callable

from PySide6.QtCore import Qt
from PySide6.QtWidgets import QFrame, QGridLayout, QLabel, QScrollArea, QVBoxLayout, QWidget

from brlok.models import Catalog

from brlok.gui.colors import get_cell_style


CELL_SIZE_MIN = 20
CELL_SIZE_MAX = 200
GRID_SPACING = 2
GRID_MARGINS = 0  # Spacing géré par QGridLayout, pas de margin dans les cellules
SEPARATOR_HEIGHT = 8
FOOT_GRID_ROWS = 4
FOOT_GRID_COLS = 6


class PanWidget(QWidget):
    """Vue du pan : grille avec prises à leurs positions. Lisible à 2 m (NFR4)."""

    def __init__(
        self,
        catalog: Catalog,
        parent: QWidget | None = None,
        *,
        cell_size: int = 56,
        compact: bool = False,
        fixed_cell_size: int | tuple[int, int] | None = None,
        highlight_hold_ids: set[str] | None = None,
        block_hold_order: dict[str, int] | None = None,
        on_context_menu: Callable[[str | None, int, int], None] | None = None,
        show_foot_grid: bool = False,
    ) -> None:
        super().__init__(parent)
        self._catalog = catalog
        self._show_foot_grid = show_foot_grid
        self._fixed_cell_size = fixed_cell_size
        base = 32 if compact else cell_size
        self._cell_size = max(CELL_SIZE_MIN, min(CELL_SIZE_MAX, base))
        self._highlight = highlight_hold_ids or set()
        self._block_hold_order = block_hold_order or {}
        self._on_context_menu = on_context_menu
        self._build_ui()

    def set_catalog(self, catalog: Catalog) -> None:
        """Met à jour le catalogue (rafraîchit la grille)."""
        self._catalog = catalog
        self._rebuild_grid()

    def _refresh_foot_labels(self) -> None:
        """Remplit les labels pieds depuis catalog.foot_grid, couleur selon foot_levels."""
        from brlok.gui.colors import get_cell_style, EMPTY_COLOR, BORDER_DEFAULT, TEXT_ON_LIGHT
        grid = self._catalog.foot_grid
        foot_levels = getattr(self._catalog, "foot_levels", None) or [[1] * 6 for _ in range(4)]
        for (r, c), lbl in self._foot_labels.items():
            val = ""
            if r < len(grid) and grid[r] and c < len(grid[r]):
                val = str(grid[r][c]) if grid[r][c] else ""
            lev = foot_levels[r][c] if r < len(foot_levels) and c < len(foot_levels[r]) else 1
            lbl.setText(val)
            if val:
                lbl.setStyleSheet(get_cell_style(val, lev, True, False))
            else:
                lbl.setStyleSheet(
                    f"border: 2px solid {BORDER_DEFAULT}; background: {EMPTY_COLOR}; color: {TEXT_ON_LIGHT};"
                )

    def set_highlight(self, hold_ids: set[str], block_hold_order: dict[str, int] | None = None) -> None:
        """Met à jour les prises à surligner et l'ordre dans le bloc."""
        self._highlight = hold_ids
        self._block_hold_order = block_hold_order or {}
        self._refresh_cells()

    def _build_ui(self) -> None:
        self._scroll = None
        self._grid_inner = None
        self._rebuild_grid()

    def _rebuild_grid(self) -> None:
        """Construit ou reconstruit la grille."""
        if self._grid_inner is not None:
            layout = self.layout()
            if layout:
                while layout.count():
                    item = layout.takeAt(0)
                    if item.widget():
                        item.widget().deleteLater()
            self._grid_inner.deleteLater()

        rows, cols = self._catalog.grid.rows, self._catalog.grid.cols
        positions: dict[tuple[int, int], str] = {}
        hold_info: dict[str, tuple[int, bool]] = {}
        for h in self._catalog.holds:
            positions[(h.position.row, h.position.col)] = h.id
            hold_info[h.id] = (h.level, h.active)

        self._hold_info = hold_info
        self._rows = rows
        self._cols = cols
        self._scroll = QScrollArea()
        self._scroll.setWidgetResizable(True)
        self._scroll.setFrameShape(QFrame.Shape.NoFrame)

        self._grid_inner = QWidget()
        self._grid_layout = QGridLayout(self._grid_inner)
        self._grid_layout.setHorizontalSpacing(GRID_SPACING)
        self._grid_layout.setVerticalSpacing(GRID_SPACING)
        self._grid_layout.setContentsMargins(GRID_MARGINS, GRID_MARGINS, GRID_MARGINS, GRID_MARGINS)
        self._labels: dict[tuple[int, int], QLabel] = {}

        init_w = init_h = self._cell_size
        if isinstance(self._fixed_cell_size, tuple):
            init_w, init_h = self._fixed_cell_size
        elif self._fixed_cell_size is not None:
            init_w = init_h = self._fixed_cell_size
        for r in range(rows):
            for c in range(cols):
                hold_id = positions.get((r, c), "·")
                level, active = hold_info.get(hold_id, (2, True))
                highlighted = hold_id in self._highlight
                order = self._block_hold_order.get(hold_id)
                text = f"{order}. {hold_id}" if order else hold_id
                label = QLabel(text)
                label.setFixedSize(init_w, init_h)
                label.setAlignment(Qt.AlignmentFlag.AlignCenter)
                font = label.font()
                font.setPointSize(max(12, self._cell_size // 3))
                font.setBold(highlighted)
                label.setFont(font)
                label.setStyleSheet(get_cell_style(hold_id, level, active, highlighted))
                if self._on_context_menu:
                    label.setContextMenuPolicy(Qt.ContextMenuPolicy.CustomContextMenu)
                    label.customContextMenuRequested.connect(
                        lambda pos, _r=r, _c=c: self._on_cell_context(pos, _r, _c)
                    )
                self._grid_layout.addWidget(label, r, c)
                self._labels[(r, c)] = label

        # Ligne séparatrice + grille pieds (même forme que le pan)
        if self._show_foot_grid:
            sep = QFrame()
            sep.setFrameShape(QFrame.Shape.HLine)
            sep.setFrameShadow(QFrame.Shadow.Sunken)
            sep.setFixedHeight(SEPARATOR_HEIGHT)
            self._grid_layout.addWidget(sep, rows, 0, 1, cols)
            self._foot_labels: dict[tuple[int, int], QLabel] = {}
            for r in range(FOOT_GRID_ROWS):
                for c in range(cols):
                    lbl = QLabel("")
                    lbl.setAlignment(Qt.AlignmentFlag.AlignCenter)
                    self._grid_layout.addWidget(lbl, rows + 1 + r, c)
                    self._foot_labels[(r, c)] = lbl
            self._foot_rows = FOOT_GRID_ROWS
            self._refresh_foot_labels()
        else:
            self._foot_labels = {}
            self._foot_rows = 0

        self._scroll.setWidget(self._grid_inner)

        # Taille initiale et réactive au redimensionnement
        from PySide6.QtCore import QTimer
        QTimer.singleShot(0, self._update_cell_sizes)

        layout = self.layout()
        if layout is None:
            layout = QVBoxLayout(self)
        layout.addWidget(self._scroll)

        self._scroll.installEventFilter(self)

    def eventFilter(self, obj: object, event: object) -> bool:
        """Recalcule la taille des cellules au redimensionnement (ratio 1:1, bornes)."""
        from PySide6.QtCore import QEvent
        if obj == self._scroll and event.type() == QEvent.Type.Resize:
            self._update_cell_sizes()
        return super().eventFilter(obj, event)

    def _update_cell_sizes(self) -> None:
        """Met à jour la taille des cellules (rectangles, fit-to-window)."""
        if not hasattr(self, "_labels") or not self._labels:
            return
        if self._fixed_cell_size is not None:
            if isinstance(self._fixed_cell_size, tuple):
                cell_w, cell_h = self._fixed_cell_size
                cell_w = max(CELL_SIZE_MIN, min(CELL_SIZE_MAX, cell_w))
                cell_h = max(CELL_SIZE_MIN, min(CELL_SIZE_MAX, cell_h))
            else:
                cell = max(CELL_SIZE_MIN, min(CELL_SIZE_MAX, self._fixed_cell_size))
                cell_w = cell_h = cell
        else:
            rows, cols = self._rows, self._cols
            total_rows = rows + (1 + self._foot_rows) if self._foot_labels else rows  # 1 = separator
            sep_px = SEPARATOR_HEIGHT if self._foot_labels else 0
            w = self._scroll.viewport().width()
            h = self._scroll.viewport().height() - sep_px
            spacing = GRID_SPACING
            margins = GRID_MARGINS * 2
            available_w = w - (cols - 1) * spacing - margins
            available_h = h - (total_rows - 1) * spacing - margins
            cell_w = available_w // cols if cols > 0 else CELL_SIZE_MIN
            cell_h = available_h // total_rows if total_rows > 0 else CELL_SIZE_MIN
            cell_w = max(CELL_SIZE_MIN, min(CELL_SIZE_MAX, cell_w))
            cell_h = max(CELL_SIZE_MIN, min(CELL_SIZE_MAX, cell_h))
        for label in self._labels.values():
            label.setFixedSize(cell_w, cell_h)
            font = label.font()
            font.setPointSize(max(12, min(cell_w, cell_h) // 3))
            label.setFont(font)
        for label in self._foot_labels.values():
            label.setFixedSize(cell_w, cell_h)
            font = label.font()
            font.setPointSize(max(12, min(cell_w, cell_h) // 3))
            label.setFont(font)

    def _on_cell_context(self, pos: object, row: int, col: int) -> None:
        """Menu contextuel sur une cellule."""
        if not self._on_context_menu:
            return
        positions: dict[tuple[int, int], str] = {
            (h.position.row, h.position.col): h.id for h in self._catalog.holds
        }
        hold_id = positions.get((row, col)) if (row, col) in positions else None
        self._on_context_menu(hold_id, row, col)

    def _refresh_cells(self) -> None:
        """Rafraîchit le style des cellules (highlight, couleurs)."""
        positions: dict[tuple[int, int], str] = {
            (h.position.row, h.position.col): h.id for h in self._catalog.holds
        }
        hold_info: dict[str, tuple[int, bool]] = {
            h.id: (h.level, h.active) for h in self._catalog.holds
        }
        self._hold_info = hold_info
        for (r, c), label in self._labels.items():
            hold_id = positions.get((r, c), "·")
            level, active = hold_info.get(hold_id, (2, True))
            highlighted = hold_id in self._highlight
            order = self._block_hold_order.get(hold_id)
            label.setText(f"{order}. {hold_id}" if order else hold_id)
            font = label.font()
            font.setBold(highlighted)
            label.setFont(font)
            style = get_cell_style(hold_id, level, active, highlighted)
            if order == 1 and highlighted:
                style = style.replace("border: 2px", "border: 4px")
            label.setStyleSheet(style)
