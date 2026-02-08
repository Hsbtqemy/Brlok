# -*- coding: utf-8 -*-
"""Widget Bibliothèque : fusion Favoris + Historique (onglet unique)."""
from __future__ import annotations

from datetime import datetime, timedelta
from pathlib import Path
from typing import Callable

from PySide6.QtCore import Qt
from PySide6.QtGui import QCursor
from PySide6.QtWidgets import (
    QButtonGroup,
    QFileDialog,
    QFrame,
    QHBoxLayout,
    QInputDialog,
    QLabel,
    QLineEdit,
    QListWidget,
    QListWidgetItem,
    QMenu,
    QMessageBox,
    QPushButton,
    QRadioButton,
    QScrollArea,
    QSplitter,
    QVBoxLayout,
    QWidget,
)

from brlok.models import Block, CompletedSession, Session
from brlok.storage.favorites_store import add_favorite, load_favorites, remove_favorite, save_favorites
from brlok.storage.history_store import load_history


class LibraryWidget(QWidget):
    """Vue Bibliothèque : Favoris | Historique | Détails, avec filtres et actions."""

    def __init__(
        self,
        parent: QWidget | None = None,
        *,
        on_load_session: Callable[[Session], None] | None = None,
        on_go_session: Callable[[], None] | None = None,
    ) -> None:
        super().__init__(parent)
        self._on_load_session = on_load_session
        self._on_go_session = on_go_session
        self._history_filter_days: int | None = None  # None = tout, 7, 30
        self._search_text = ""
        self._build_ui()

    def _build_ui(self) -> None:
        layout = QVBoxLayout(self)

        # Barre de filtres
        filter_bar = QHBoxLayout()
        filter_bar.addWidget(QLabel("Historique :"))
        self._filter_group = QButtonGroup()
        for days, label in [(7, "7 jours"), (30, "30 jours"), (None, "Tout")]:
            rb = QRadioButton(label)
            self._filter_group.addButton(rb)
            rb.setProperty("days", days)
            filter_bar.addWidget(rb)
            if days is None:
                rb.setChecked(True)
        filter_bar.addWidget(QLabel("  Recherche :"))
        self._search_edit = QLineEdit()
        self._search_edit.setPlaceholderText("Filtrer…")
        self._search_edit.setClearButtonEnabled(True)
        self._search_edit.textChanged.connect(self._on_search_changed)
        self._search_edit.setMaximumWidth(200)
        filter_bar.addWidget(self._search_edit)
        filter_bar.addStretch()
        layout.addLayout(filter_bar)

        splitter = QSplitter(Qt.Orientation.Horizontal)

        # Panneau gauche : Favoris
        fav_frame = QFrame()
        fav_frame.setFrameShape(QFrame.Shape.StyledPanel)
        fav_layout = QVBoxLayout(fav_frame)
        fav_layout.addWidget(QLabel("☆ Favoris"))
        self._fav_list = QListWidget()
        self._fav_list.setMinimumWidth(220)
        self._fav_list.currentItemChanged.connect(self._on_fav_selection_changed)
        self._fav_list.setContextMenuPolicy(Qt.ContextMenuPolicy.CustomContextMenu)
        self._fav_list.customContextMenuRequested.connect(self._on_fav_context_menu)
        fav_layout.addWidget(self._fav_list)
        splitter.addWidget(fav_frame)

        # Panneau centre : Historique
        hist_frame = QFrame()
        hist_frame.setFrameShape(QFrame.Shape.StyledPanel)
        hist_layout = QVBoxLayout(hist_frame)
        hist_layout.addWidget(QLabel("Historique"))
        self._hist_list = QListWidget()
        self._hist_list.setMinimumWidth(220)
        self._hist_list.currentItemChanged.connect(self._on_hist_selection_changed)
        self._hist_list.setContextMenuPolicy(Qt.ContextMenuPolicy.CustomContextMenu)
        self._hist_list.customContextMenuRequested.connect(self._on_hist_context_menu)
        hist_layout.addWidget(self._hist_list)
        splitter.addWidget(hist_frame)

        # Panneau droit : Détails
        self._detail_scroll = QScrollArea()
        self._detail_scroll.setWidgetResizable(True)
        self._detail_widget = QWidget()
        self._detail_layout = QVBoxLayout(self._detail_widget)
        self._detail_scroll.setWidget(self._detail_widget)
        self._detail_scroll.setMinimumWidth(250)
        splitter.addWidget(self._detail_scroll)

        splitter.setSizes([280, 280, 300])
        layout.addWidget(splitter)

        # Connexion des filtres après création des listes (évite refresh avant _fav_list)
        for rb in self._filter_group.buttons():
            rb.toggled.connect(self._on_filter_changed)

        # Boutons d'action (en bas du panneau détail)
        self._action_bar = QHBoxLayout()
        self._load_btn = QPushButton("▶ Charger en Séance")
        self._load_btn.clicked.connect(self._on_load_clicked)
        self._load_btn.setEnabled(False)
        self._action_bar.addWidget(self._load_btn)
        self._export_btn = QPushButton("Exporter…")
        self._export_btn.clicked.connect(self._on_export_clicked)
        self._export_btn.setEnabled(False)
        self._action_bar.addWidget(self._export_btn)
        self._action_bar.addStretch()
        layout.addLayout(self._action_bar)

        self.refresh()

    def _on_filter_changed(self) -> None:
        rb = self._filter_group.checkedButton()
        if rb:
            self._history_filter_days = rb.property("days")
            self.refresh()

    def _on_search_changed(self, text: str) -> None:
        self._search_text = text.strip().lower()
        self._apply_search_filter()

    def _apply_search_filter(self) -> None:
        def should_hide(item: QListWidgetItem) -> bool:
            if not self._search_text:
                return False
            return self._search_text not in (item.text() or "").lower()
        for i in range(self._fav_list.count()):
            item = self._fav_list.item(i)
            item.setHidden(should_hide(item))
        for i in range(self._hist_list.count()):
            item = self._hist_list.item(i)
            item.setHidden(should_hide(item))

    def refresh(self) -> None:
        """Rafraîchit Favoris et Historique depuis le stockage."""
        self._fav_list.clear()
        blocks = load_favorites()
        if not blocks:
            placeholder = QListWidgetItem("(aucun favori)")
            placeholder.setData(Qt.ItemDataRole.UserRole, None)
            self._fav_list.addItem(placeholder)
        else:
            for block in blocks:
                seq = " → ".join(h.id for h in block.holds)
                label = seq
                if block.comment:
                    label += f" — {block.comment}"
                item = QListWidgetItem(label)
                item.setData(Qt.ItemDataRole.UserRole, ("block", block))
                self._fav_list.addItem(item)

        self._hist_list.clear()
        sessions = load_history()
        cutoff = None
        if self._history_filter_days is not None:
            cutoff = datetime.now() - timedelta(days=self._history_filter_days)
        for cs in sessions:
            if cutoff and cs.date and cs.date.replace(tzinfo=None) < cutoff:
                continue
            date_str = cs.date.strftime("%Y-%m-%d %H:%M") if cs.date else "?"
            n_blocks = len(cs.session.blocks)
            label = f"{date_str} — {n_blocks} bloc(s)"
            item = QListWidgetItem(label)
            item.setData(Qt.ItemDataRole.UserRole, ("session", cs))
            self._hist_list.addItem(item)
        if not any(sessions):
            placeholder = QListWidgetItem("(aucune séance enregistrée)")
            placeholder.setData(Qt.ItemDataRole.UserRole, None)
            self._hist_list.addItem(placeholder)

        self._apply_search_filter()
        self._show_placeholder()
        self._update_action_buttons()

    def _clear_detail(self) -> None:
        while self._detail_layout.count():
            item = self._detail_layout.takeAt(0)
            if item.widget():
                item.widget().deleteLater()

    def _get_selected_session(self) -> Session | None:
        """Retourne la session sélectionnée (favori bloc ou historique)."""
        fav_item = self._fav_list.currentItem()
        if fav_item and fav_item.data(Qt.ItemDataRole.UserRole):
            kind, data = fav_item.data(Qt.ItemDataRole.UserRole)
            if kind == "block":
                return Session(blocks=[data])
        hist_item = self._hist_list.currentItem()
        if hist_item and hist_item.data(Qt.ItemDataRole.UserRole):
            kind, data = hist_item.data(Qt.ItemDataRole.UserRole)
            if kind == "session":
                return data.session
        return None

    def _get_selected_block(self) -> Block | None:
        fav_item = self._fav_list.currentItem()
        if fav_item and fav_item.data(Qt.ItemDataRole.UserRole):
            kind, data = fav_item.data(Qt.ItemDataRole.UserRole)
            if kind == "block":
                return data
        return None

    def _get_selected_completed_session(self) -> CompletedSession | None:
        hist_item = self._hist_list.currentItem()
        if hist_item and hist_item.data(Qt.ItemDataRole.UserRole):
            kind, data = hist_item.data(Qt.ItemDataRole.UserRole)
            if kind == "session":
                return data
        return None

    def _update_action_buttons(self) -> None:
        session = self._get_selected_session()
        self._load_btn.setEnabled(session is not None and bool(session.blocks))
        self._export_btn.setEnabled(session is not None and bool(session.blocks))

    def _on_fav_selection_changed(self, current: QListWidgetItem | None, previous: QListWidgetItem | None) -> None:
        self._hist_list.clearSelection()
        self._show_fav_detail(current)
        self._update_action_buttons()

    def _on_hist_selection_changed(self, current: QListWidgetItem | None, previous: QListWidgetItem | None) -> None:
        self._fav_list.clearSelection()
        self._show_hist_detail(current)
        self._update_action_buttons()

    def _show_placeholder(self) -> None:
        """Affiche le placeholder quand rien n'est sélectionné."""
        self._clear_detail()
        ph = QLabel("Sélectionnez un favori ou une séance.")
        ph.setWordWrap(True)
        ph.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self._detail_layout.addWidget(ph)
        self._detail_layout.addStretch()

    def _show_fav_detail(self, item: QListWidgetItem | None) -> None:
        self._clear_detail()
        if not item or not item.data(Qt.ItemDataRole.UserRole):
            self._show_placeholder()
            return
        kind, data = item.data(Qt.ItemDataRole.UserRole)
        if kind != "block":
            return
        block: Block = data
        header = QLabel("<b>Bloc favori</b>")
        header.setWordWrap(True)
        self._detail_layout.addWidget(header)
        seq = QLabel("→ ".join(h.id for h in block.holds))
        seq.setWordWrap(True)
        self._detail_layout.addWidget(seq)
        if block.comment:
            comm = QLabel(f"<i>{block.comment}</i>")
            comm.setWordWrap(True)
            self._detail_layout.addWidget(comm)
        self._detail_layout.addStretch()

    def _show_hist_detail(self, item: QListWidgetItem | None) -> None:
        self._clear_detail()
        if not item or not item.data(Qt.ItemDataRole.UserRole):
            self._show_placeholder()
            return
        kind, data = item.data(Qt.ItemDataRole.UserRole)
        if kind != "session":
            self._show_placeholder()
            return
        cs: CompletedSession = data
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

    def _on_load_clicked(self) -> None:
        session = self._get_selected_session()
        if not session or not session.blocks:
            return
        if self._on_load_session:
            self._on_load_session(session)
        if self._on_go_session:
            self._on_go_session()

    def _on_export_clicked(self) -> None:
        session = self._get_selected_session()
        if not session or not session.blocks:
            return
        path, selected_filter = QFileDialog.getSaveFileName(
            self, "Exporter la séance", "",
            "Fichier PDF (*.pdf);;Fichier TXT (*.txt);;Fichier Markdown (*.md);;Fichier JSON (*.json)",
        )
        if not path:
            return
        from brlok.exports import export_json, export_markdown, export_pdf, export_txt
        from brlok.storage.catalog_collection_store import get_active_catalog
        catalog = get_active_catalog()
        p = Path(path)
        try:
            if p.suffix.lower() == ".pdf":
                export_pdf(session, p)
            elif p.suffix.lower() in (".txt",):
                export_txt(session, p, catalog=catalog)
            elif p.suffix.lower() in (".md", ".markdown"):
                export_markdown(session, p, catalog=catalog)
            else:
                if "PDF" in (selected_filter or ""):
                    export_pdf(session, p)
                elif "TXT" in (selected_filter or ""):
                    export_txt(session, p, catalog=catalog)
                elif "Markdown" in (selected_filter or ""):
                    export_markdown(session, p, catalog=catalog)
                else:
                    export_json(session, p)
            QMessageBox.information(self, "Export", f"Séance exportée dans {path}")
        except OSError as e:
            QMessageBox.critical(self, "Erreur", f"Impossible d'exporter : {e}")

    def _on_fav_context_menu(self, pos: object) -> None:
        item = self._fav_list.itemAt(pos)
        if not item or not item.data(Qt.ItemDataRole.UserRole):
            return
        kind, data = item.data(Qt.ItemDataRole.UserRole)
        if kind != "block":
            return
        block: Block = data
        idx = self._fav_list.row(item)
        menu = QMenu(self)
        act_load = menu.addAction("▶ Charger en Séance")
        act_export = menu.addAction("Exporter…")
        menu.addSeparator()
        act_comment = menu.addAction("Modifier le commentaire…")
        act_remove = menu.addAction("Retirer des favoris")
        action = menu.exec(QCursor.pos())
        if action == act_load:
            self._on_load_clicked()
        elif action == act_export:
            self._on_export_clicked()
        elif action == act_comment:
            new_comment, ok = QInputDialog.getText(
                self, "Commentaire", "Commentaire pour ce bloc :",
                QLineEdit.EchoMode.Normal, block.comment or "",
            )
            if ok:
                blocks = load_favorites()
                if 0 <= idx < len(blocks):
                    updated = blocks[idx].model_copy(update={"comment": new_comment.strip() or None})
                    blocks[idx] = updated
                    save_favorites(blocks)
                    self.refresh()
        elif action == act_remove:
            reply = QMessageBox.question(
                self, "Retirer des favoris",
                f"Retirer ce bloc des favoris ?\n{' → '.join(h.id for h in block.holds)}",
                QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No,
                QMessageBox.StandardButton.No,
            )
            if reply == QMessageBox.StandardButton.Yes:
                remove_favorite(idx)
                self.refresh()

    def _on_hist_context_menu(self, pos: object) -> None:
        item = self._hist_list.itemAt(pos)
        if not item or not item.data(Qt.ItemDataRole.UserRole):
            return
        kind, data = item.data(Qt.ItemDataRole.UserRole)
        if kind != "session":
            return
        cs: CompletedSession = data
        menu = QMenu(self)
        act_load = menu.addAction("▶ Charger en Séance")
        act_export = menu.addAction("Exporter…")
        menu.addSeparator()
        act_fav = menu.addAction("☆ Ajouter la séance aux favoris (tous les blocs)")
        action = menu.exec(QCursor.pos())
        if action == act_load:
            self._on_load_clicked()
        elif action == act_export:
            self._on_export_clicked()
        elif action == act_fav:
            added = 0
            for block in cs.session.blocks:
                prev = load_favorites()
                add_favorite(block, prev)
                added += 1
            QMessageBox.information(
                self, "Favoris",
                f"{added} bloc(s) ajouté(s) aux favoris.",
            )
            self.refresh()
