# -*- coding: utf-8 -*-
"""Widget de consultation de l'historique des séances (7.4)."""
from __future__ import annotations

from PySide6.QtCore import Qt
from PySide6.QtWidgets import (
    QLabel,
    QListWidget,
    QListWidgetItem,
    QScrollArea,
    QSplitter,
    QVBoxLayout,
    QWidget,
)

from brlok.models import CompletedSession
from brlok.storage.history_store import load_history


class HistoryWidget(QWidget):
    """Vue de l'historique des séances terminées."""

    def __init__(self, parent: QWidget | None = None) -> None:
        super().__init__(parent)
        self._build_ui()

    def _build_ui(self) -> None:
        layout = QVBoxLayout(self)

        title = QLabel("Historique des séances")
        title.setStyleSheet("font-size: 16pt; font-weight: bold;")
        layout.addWidget(title)

        splitter = QSplitter(Qt.Orientation.Horizontal)

        self._list = QListWidget()
        self._list.setMinimumWidth(200)
        self._list.currentItemChanged.connect(self._on_selection_changed)
        splitter.addWidget(self._list)

        self._detail = QScrollArea()
        self._detail.setWidgetResizable(True)
        self._detail_widget = QWidget()
        self._detail_layout = QVBoxLayout(self._detail_widget)
        self._detail.setWidget(self._detail_widget)
        splitter.addWidget(self._detail)

        splitter.setSizes([300, 400])
        layout.addWidget(splitter)

        self.refresh()

    def refresh(self) -> None:
        """Rafraîchit la liste depuis le stockage."""
        self._list.clear()
        sessions = load_history()
        for s in sessions:
            date_str = s.date.strftime("%Y-%m-%d %H:%M") if s.date else "?"
            n_blocks = len(s.session.blocks)
            label = f"{date_str} — {n_blocks} bloc(s)"
            item = QListWidgetItem(label)
            item.setData(Qt.ItemDataRole.UserRole, s)
            self._list.addItem(item)
        if not sessions:
            self._list.addItem(QListWidgetItem("(aucune séance enregistrée)"))
        self._clear_detail()

    def _clear_detail(self) -> None:
        """Vide le panneau de détail."""
        while self._detail_layout.count():
            item = self._detail_layout.takeAt(0)
            if item.widget():
                item.widget().deleteLater()

    def _on_selection_changed(
        self,
        current: QListWidgetItem | None,
        previous: QListWidgetItem | None,
    ) -> None:
        """Affiche le détail de la séance sélectionnée."""
        self._clear_detail()
        if not current or not current.data(Qt.ItemDataRole.UserRole):
            return
        cs: CompletedSession = current.data(Qt.ItemDataRole.UserRole)

        date_str = cs.date.strftime("%d/%m/%Y à %H:%M") if cs.date else "?"
        header = QLabel(f"<b>Séance du {date_str}</b>")
        header.setWordWrap(True)
        self._detail_layout.addWidget(header)

        if cs.session.constraints.target_level is not None:
            level_lbl = QLabel(f"Niveau cible : {cs.session.constraints.target_level}")
            self._detail_layout.addWidget(level_lbl)

        for i, block in enumerate(cs.session.blocks):
            status = cs.block_statuses.get(i, "")
            status_icon = "✓" if status == "success" else ("✗" if status == "fail" else "")
            seq = " → ".join(h.id for h in block.holds)
            block_label = QLabel(f"<b>Bloc {i + 1}</b> {status_icon}")
            block_label.setWordWrap(True)
            self._detail_layout.addWidget(block_label)
            seq_label = QLabel(f"  {seq}")
            seq_label.setWordWrap(True)
            self._detail_layout.addWidget(seq_label)
            if block.comment:
                comm_label = QLabel(f"  <i>{block.comment}</i>")
                comm_label.setWordWrap(True)
                self._detail_layout.addWidget(comm_label)

        self._detail_layout.addStretch()
