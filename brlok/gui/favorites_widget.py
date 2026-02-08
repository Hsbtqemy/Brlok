# -*- coding: utf-8 -*-
"""Widget de consultation des blocs favoris (FR16)."""
from __future__ import annotations

from typing import Callable

from PySide6.QtCore import Qt
from PySide6.QtWidgets import (
    QInputDialog,
    QLabel,
    QListWidget,
    QListWidgetItem,
    QMenu,
    QVBoxLayout,
    QWidget,
)

from brlok.models import Block
from brlok.storage.favorites_store import load_favorites, remove_favorite, save_favorites


class FavoritesWidget(QWidget):
    """Vue des blocs favoris : liste avec séquences."""

    def __init__(
        self,
        parent: QWidget | None = None,
        *,
        on_refresh: Callable[[], None] | None = None,
    ) -> None:
        super().__init__(parent)
        self._on_refresh = on_refresh
        self._build_ui()

    def _build_ui(self) -> None:
        layout = QVBoxLayout(self)

        title = QLabel("Mes blocs favoris")
        title.setStyleSheet("font-size: 16pt; font-weight: bold;")
        layout.addWidget(title)

        self._list = QListWidget()
        self._list.setMinimumHeight(200)
        self._list.setContextMenuPolicy(Qt.ContextMenuPolicy.CustomContextMenu)
        self._list.customContextMenuRequested.connect(self._on_list_context_menu)
        layout.addWidget(self._list)

        self.refresh()

    def refresh(self) -> None:
        """Rafraîchit la liste depuis le stockage."""
        self._list.clear()
        blocks = load_favorites()
        for i, block in enumerate(blocks):
            seq = " → ".join(h.id for h in block.holds)
            label = f"{i + 1}. {seq}"
            if block.comment:
                label += f" — {block.comment}"
            item = QListWidgetItem(label)
            item.setData(Qt.ItemDataRole.UserRole, block)
            self._list.addItem(item)
        if not blocks:
            self._list.addItem(QListWidgetItem("(aucun favori)"))

    def _on_list_context_menu(self, pos: object) -> None:
        """Menu contextuel sur un bloc favori."""
        from PySide6.QtGui import QCursor
        from PySide6.QtWidgets import QMessageBox

        item = self._list.itemAt(pos)
        if not item or not item.data(Qt.ItemDataRole.UserRole):
            return
        block = item.data(Qt.ItemDataRole.UserRole)
        idx = self._list.row(item)
        menu = QMenu(self)
        act_comment = menu.addAction("Modifier le commentaire…")
        act_remove = menu.addAction("Retirer des favoris")
        action = menu.exec(QCursor.pos())
        if action == act_comment:
            from PySide6.QtWidgets import QLineEdit
            new_comment, ok = QInputDialog.getText(
                self,
                "Commentaire",
                "Commentaire pour ce bloc :",
                QLineEdit.EchoMode.Normal,
                block.comment or "",
            )
            if ok:
                blocks = load_favorites()
                if 0 <= idx < len(blocks):
                    updated = blocks[idx].model_copy(update={"comment": new_comment.strip() or None})
                    blocks[idx] = updated
                    save_favorites(blocks)
                    self.refresh()
                    if self._on_refresh:
                        self._on_refresh()
        elif action == act_remove:
            reply = QMessageBox.question(
                self,
                "Retirer des favoris",
                f"Retirer ce bloc des favoris ?\n{' → '.join(h.id for h in block.holds)}",
                QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No,
                QMessageBox.StandardButton.No,
            )
            if reply == QMessageBox.StandardButton.Yes:
                remove_favorite(idx)
                self.refresh()
                if self._on_refresh:
                    self._on_refresh()
