# -*- coding: utf-8 -*-
"""Widget de visualisation et navigation de séance (FR12, FR13, FR14)."""
from __future__ import annotations

from pathlib import Path
from typing import Callable

from PySide6.QtCore import Qt, QTimer

from brlok.gui.colors import LEVEL_COLORS_SATURATED
from brlok.gui.generate_dialog import GenerateSessionForm
from PySide6.QtWidgets import (
    QFileDialog,
    QFrame,
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QMenu,
    QPushButton,
    QScrollArea,
    QSizePolicy,
    QSplitter,
    QSpinBox,
    QToolBar,
    QVBoxLayout,
    QWidget,
)

from brlok.models import Catalog, Hold, Session

from brlok.gui.pan_widget import PanWidget
from brlok.gui.timer_widget import IntervalTimerWidget
from brlok.storage.best_times_store import get_best_time, record_time_if_best

class SessionWidget(QWidget):
    """Vue séance : pan dominant (~75%) + sidebar (séquence, timer) + toolbar compacte."""

    def __init__(
        self,
        catalog: Catalog,
        session: Session | None = None,
        parent: QWidget | None = None,
        *,
        on_generate: Callable[[int, int, int, int, str | None], object | None] | None = None,
        on_favorites_changed: Callable[[], None] | None = None,
        on_end_session: Callable[[Session, dict[int, str]], None] | None = None,
        on_get_catalog_id: Callable[[], str | None] | None = None,
    ) -> None:
        super().__init__(parent)
        self._catalog = catalog
        self._session = session
        self._block_index = 0
        self._block_history: list[int] = []
        self._block_statuses: dict[int, str] = {}
        self._pause_timer: QTimer | None = None
        self._in_pause = False
        self._on_generate = on_generate
        self._on_favorites_changed = on_favorites_changed
        self._cb_end_session = on_end_session
        self._on_get_catalog_id = on_get_catalog_id
        self._build_ui()

    def set_session(self, session: Session | None) -> None:
        """Définit ou efface la séance."""
        self._session = session
        self._block_index = 0
        self._block_history = []
        self._block_statuses = {}
        self._refresh()

    def set_catalog(self, catalog: Catalog) -> None:
        """Met à jour le catalogue (après édition dans l'onglet Catalogue)."""
        self._catalog = catalog
        self._pan.set_catalog(catalog)

    def refresh_templates(self) -> None:
        """Recharge la liste des templates dans le formulaire de génération."""
        self._generate_form.refresh_templates()

    def _build_ui(self) -> None:
        layout = QVBoxLayout(self)

        self._session_container = QWidget()
        session_layout = QVBoxLayout(self._session_container)

        splitter = QSplitter(Qt.Orientation.Horizontal)
        # Gauche : pan (mains + pieds)
        pan_container = QWidget()
        pan_container.setMinimumWidth(322)  # 6×52 + 5×2 spacing (rectangles)
        pan_layout = QVBoxLayout(pan_container)
        pan_layout.setContentsMargins(0, 0, 0, 0)
        pan_layout.setSpacing(0)
        self._pan = PanWidget(
            self._catalog,
            cell_size=56,
            fixed_cell_size=(52, 44),
            on_context_menu=self._on_pan_context_menu,
            show_foot_grid=True,
        )
        pan_layout.addWidget(self._pan, 1)
        splitter.addWidget(pan_container)

        # Panneau droit : génération (sans séance) ou sidebar (avec séance)
        self._right_panel = QFrame()
        self._right_panel.setObjectName("Sidebar")
        self._right_panel.setMinimumWidth(280)
        self._right_panel.setMaximumWidth(420)
        right_layout = QVBoxLayout(self._right_panel)
        right_layout.setContentsMargins(0, 0, 0, 0)

        # Outil de génération (visible quand aucune séance)
        self._generate_panel = QWidget()
        gen_layout = QVBoxLayout(self._generate_panel)
        self._empty_label = QLabel("Aucune séance en cours.")
        self._empty_label.setAlignment(Qt.AlignmentFlag.AlignTop | Qt.AlignmentFlag.AlignLeft)
        self._empty_label.setObjectName("SectionTitle")
        self._empty_label.setWordWrap(True)
        gen_layout.addWidget(self._empty_label)
        self._generate_form = GenerateSessionForm(
            default_level=2,
            default_blocks=5,
            default_enchainements=10,
        )
        self._generate_form.setVisible(bool(self._on_generate))
        gen_layout.addWidget(self._generate_form)
        self._generate_btn = QPushButton("Générer")
        self._generate_btn.clicked.connect(self._on_generate_clicked)
        self._generate_btn.setVisible(bool(self._on_generate))
        self._generate_btn.setStyleSheet("padding: 8px; font-size: 12pt;")
        gen_layout.addWidget(self._generate_btn)
        gen_layout.addStretch()
        right_layout.addWidget(self._generate_panel)

        # Sidebar séance (visible quand séance en cours) — scrollable pour écrans portables
        self._sidebar = QFrame()
        self._sidebar.setObjectName("Sidebar")
        self._sidebar.setMinimumWidth(280)
        self._sidebar.setMaximumWidth(420)
        sidebar_content = QWidget()
        sidebar_layout = QVBoxLayout(sidebar_content)
        sidebar_layout.setContentsMargins(0, 0, 0, 0)
        self._sequence_panel_label = QLabel("Séquence du bloc")
        self._sequence_panel_label.setObjectName("SectionTitle")
        sidebar_layout.addWidget(self._sequence_panel_label)
        self._sequence_items_label = QLabel("")
        self._sequence_items_label.setStyleSheet("font-size: 16pt; padding: 2px 0;")
        self._sequence_items_label.setWordWrap(True)
        self._sequence_items_label.setAlignment(Qt.AlignmentFlag.AlignTop | Qt.AlignmentFlag.AlignLeft)
        sidebar_layout.addWidget(self._sequence_items_label)
        sidebar_layout.addSpacing(8)
        self._toggle_timer_btn = QPushButton("⏱ Afficher timer 40/20")
        self._toggle_timer_btn.setToolTip("Lancer un timer travail/repos (40s/20s)")
        self._toggle_timer_btn.clicked.connect(self._toggle_timer_panel)
        self._toggle_timer_btn.setStyleSheet("padding: 6px;")
        sidebar_layout.addWidget(self._toggle_timer_btn)
        self._timer_panel = QFrame()
        self._timer_panel.setObjectName("TimerPanel")
        timer_layout = QVBoxLayout(self._timer_panel)
        self._timer_widget = IntervalTimerWidget(work_s=40, rest_s=20, rounds=3, compact=True)
        self._timer_widget.finished.connect(self._on_timer_finished)
        timer_layout.addWidget(self._timer_widget)
        self._timer_panel.setVisible(False)
        sidebar_layout.addWidget(self._timer_panel)
        sidebar_layout.addSpacing(8)
        comment_label = QLabel("Commentaire :")
        comment_label.setObjectName("Muted")
        sidebar_layout.addWidget(comment_label)
        self._comment_edit = QLineEdit()
        self._comment_edit.setPlaceholderText("Note ou retour sur ce bloc…")
        self._comment_edit.setStyleSheet("padding: 6px;")
        self._comment_edit.editingFinished.connect(self._on_comment_changed)
        sidebar_layout.addWidget(self._comment_edit)
        self._pause_row = QWidget()
        pause_layout = QHBoxLayout(self._pause_row)
        pause_layout.addWidget(QLabel("Pause (s):"))
        self._pause_between_spin = QSpinBox()
        self._pause_between_spin.setRange(0, 300)
        self._pause_between_spin.setValue(0)
        self._pause_between_spin.setToolTip("0 = pas de pause")
        pause_layout.addWidget(self._pause_between_spin)
        pause_layout.addStretch()
        sidebar_layout.addWidget(self._pause_row)
        sidebar_layout.addStretch()
        scroll = QScrollArea()
        scroll.setWidget(sidebar_content)
        scroll.setWidgetResizable(True)
        scroll.setFrameShape(QFrame.Shape.NoFrame)
        scroll.setHorizontalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)
        scroll_layout = QVBoxLayout(self._sidebar)
        scroll_layout.setContentsMargins(0, 0, 0, 0)
        scroll_layout.addWidget(scroll)
        right_layout.addWidget(self._sidebar)
        splitter.addWidget(self._right_panel)
        splitter.setSizes([520, 350])
        splitter.setCollapsible(1, True)
        session_layout.addWidget(splitter)

        # Toolbar compacte (4-6 actions visibles)
        self._toolbar = QToolBar()
        self._toolbar.setStyleSheet("padding: 4px;")
        self._timer_tool_btn = QPushButton("⏱ Timer")
        self._timer_tool_btn.clicked.connect(self._toggle_timer_panel)
        self._toolbar.addWidget(self._timer_tool_btn)
        self._prev_btn = QPushButton("← Préc.")
        self._prev_btn.clicked.connect(self._on_previous)
        self._toolbar.addWidget(self._prev_btn)
        self._next_btn = QPushButton("Suiv. →")
        self._next_btn.clicked.connect(self._on_next)
        self._toolbar.addWidget(self._next_btn)
        self._success_btn = QPushButton("✓ Réussi")
        self._success_btn.clicked.connect(lambda: self._on_block_status("success"))
        self._toolbar.addWidget(self._success_btn)
        self._fail_btn = QPushButton("✗ Échec")
        self._fail_btn.clicked.connect(lambda: self._on_block_status("fail"))
        self._toolbar.addWidget(self._fail_btn)
        more_btn = QPushButton("⋯ Plus")
        more_btn.setToolTip("Exporter, Refaire, Fin de séance, Favoris")
        more_btn.clicked.connect(self._on_more_menu)
        self._toolbar.addWidget(more_btn)
        self._block_label = QLabel("")
        self._block_label.setStyleSheet("font-weight: bold; margin-left: 12px;")
        self._toolbar.addWidget(self._block_label)
        spacer = QWidget()
        spacer.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Preferred)
        self._toolbar.addWidget(spacer)
        session_layout.addWidget(self._toolbar)

        self._pause_overlay = QFrame(self)
        self._pause_overlay.setStyleSheet(
            "background: rgba(0,0,0,0.85); border-radius: 8px; padding: 24px;"
        )
        self._pause_overlay.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Expanding)
        pause_overlay_layout = QVBoxLayout(self._pause_overlay)
        self._pause_label = QLabel("Pause")
        self._pause_label.setStyleSheet("font-size: 48pt; color: #fff;")
        self._pause_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        pause_overlay_layout.addWidget(self._pause_label)
        self._pause_skip_btn = QPushButton("Passer")
        self._pause_skip_btn.clicked.connect(self._on_pause_skip)
        pause_overlay_layout.addWidget(self._pause_skip_btn)
        self._pause_overlay.setVisible(False)

        layout.addWidget(self._session_container)
        self._refresh()

    def set_timer_params(
        self,
        work_s: int,
        rest_s: int,
        rounds: int,
        chrono_mode: str = "countdown",
    ) -> None:
        """Applique les paramètres du timer (ex. depuis un template 8.1)."""
        self._timer_widget.set_params(work_s, rest_s, rounds, chrono_mode=chrono_mode)
        if chrono_mode == "none":
            self._toggle_timer_btn.setVisible(False)
            self._timer_panel.setVisible(False)
        else:
            self._toggle_timer_btn.setVisible(True)
            self._toggle_timer_btn.setText("⏱ Afficher timer 40/20" if chrono_mode == "countdown" else "⏱ Afficher minuteur")

    def _on_more_menu(self) -> None:
        """Menu ⋯ Plus : Exporter, Refaire, Fin de séance, Favoris."""
        menu = QMenu(self)
        act_export = menu.addAction("Exporter la séance…")
        act_refaire = menu.addAction("↻ Refaire")
        act_end = menu.addAction("Fin de séance")
        act_fav = menu.addAction("☆ Ajouter aux favoris")
        from PySide6.QtGui import QCursor
        action = menu.exec(QCursor.pos())
        if action == act_export:
            self._on_export_clicked()
        elif action == act_refaire:
            self._on_refaire()
        elif action == act_end:
            self._on_end_session()
        elif action == act_fav:
            self._on_add_favorite()

    def _on_generate_clicked(self) -> None:
        if self._on_generate:
            form = self._generate_form
            result = self._on_generate(
                form.target_level,
                form.level_tolerance,
                form.blocks_count,
                form.enchainements,
                form.selected_template_id,
            )
            if not result:
                return
            session = result[0] if isinstance(result, tuple) else result
            template = result[1] if isinstance(result, tuple) and len(result) > 1 else None
            self.set_session(session)
            if template and template.blocks_config:
                cfg = template.blocks_config[0]
                self.set_timer_params(cfg.work_s, cfg.rest_s, cfg.rounds)

    def _on_export_clicked(self) -> None:
        if not self._session or not self._session.blocks:
            return
        from PySide6.QtWidgets import QMessageBox
        path, selected_filter = QFileDialog.getSaveFileName(
            self, "Exporter la séance", "",
            "Fichier PDF (*.pdf);;Fichier TXT (*.txt);;Fichier Markdown (*.md);;Fichier JSON (*.json)",
        )
        if not path:
            return
        from brlok.exports import export_json, export_markdown, export_pdf, export_txt
        p = Path(path)
        try:
            if p.suffix.lower() == ".pdf":
                export_pdf(self._session, p)
            elif p.suffix.lower() in (".txt",):
                export_txt(self._session, p, catalog=self._catalog)
            elif p.suffix.lower() in (".md", ".markdown"):
                export_markdown(self._session, p, catalog=self._catalog)
            else:
                if "PDF" in (selected_filter or ""):
                    export_pdf(self._session, p)
                elif "TXT" in (selected_filter or ""):
                    export_txt(self._session, p, catalog=self._catalog)
                elif "Markdown" in (selected_filter or ""):
                    export_markdown(self._session, p, catalog=self._catalog)
                else:
                    export_json(self._session, p)
            QMessageBox.information(self, "Export", f"Séance exportée dans {path}")
        except OSError as e:
            QMessageBox.critical(self, "Erreur", f"Impossible d'exporter : {e}")

    def _add_hold_to_block(self, hold: Hold) -> None:
        if not self._session or not self._session.blocks:
            return
        block = self._session.blocks[self._block_index]
        if hold.id in {h.id for h in block.holds}:
            return
        new_holds = list(block.holds) + [hold]
        self._session.blocks[self._block_index] = block.model_copy(update={"holds": new_holds})
        self._refresh()

    def _remove_hold_from_block(self, hold_id: str) -> None:
        if not self._session or not self._session.blocks:
            return
        block = self._session.blocks[self._block_index]
        new_holds = [h for h in block.holds if h.id != hold_id]
        if not new_holds:
            return
        self._session.blocks[self._block_index] = block.model_copy(update={"holds": new_holds})
        self._refresh()

    def _on_comment_changed(self) -> None:
        if not self._session or not self._session.blocks:
            return
        text = self._comment_edit.text().strip() or None
        block = self._session.blocks[self._block_index]
        self._session.blocks[self._block_index] = block.model_copy(update={"comment": text})

    def _on_add_favorite(self) -> None:
        if not self._session or not self._session.blocks:
            return
        from PySide6.QtWidgets import QMessageBox
        from brlok.storage.favorites_store import add_favorite, make_favorite_title
        block = self._session.blocks[self._block_index]
        target_level = self._session.constraints.target_level if self._session.constraints else None
        title = make_favorite_title(
            target_level=target_level,
            block_index=self._block_index,
        )
        catalog_id = self._on_get_catalog_id() if self._on_get_catalog_id else None
        add_favorite(block, catalog_id=catalog_id, title=title)
        QMessageBox.information(
            self, "Favori ajouté",
            f"Bloc ajouté aux favoris : {title}\n{' → '.join(h.id for h in block.holds)}",
        )
        if self._on_favorites_changed:
            self._on_favorites_changed()

    def _on_refaire(self) -> None:
        self._refresh()

    def _toggle_timer_panel(self) -> None:
        visible = self._timer_panel.isVisible()
        self._timer_panel.setVisible(not visible)
        self._toggle_timer_btn.setText("⏱ Masquer timer" if not visible else "⏱ Afficher timer 40/20")
        self._timer_tool_btn.setText("⏱ Masquer" if not visible else "⏱ Timer")

    def _on_timer_finished(self, total_seconds: float) -> None:
        if not self._session or not self._session.blocks:
            return
        block = self._session.blocks[self._block_index]
        if record_time_if_best(block, total_seconds):
            from PySide6.QtWidgets import QMessageBox
            QMessageBox.information(
                self, "Nouveau record",
                f"Meilleur temps : {total_seconds:.0f} s\n{' → '.join(h.id for h in block.holds)}",
            )
        self._refresh()

    def _on_block_status(self, status: str) -> None:
        if not self._session or not self._session.blocks:
            return
        self._block_statuses[self._block_index] = status
        self._refresh()

    def _on_previous(self) -> None:
        if not self._block_history:
            return
        self._block_index = self._block_history.pop()
        self._refresh()

    def _on_next(self) -> None:
        if not self._session or self._block_index >= len(self._session.blocks) - 1:
            return
        pause_s = self._pause_between_spin.value()
        if pause_s > 0 and not self._in_pause:
            self._start_pause_between_blocks(pause_s)
            return
        self._do_block_transition()

    def resizeEvent(self, event) -> None:
        super().resizeEvent(event)
        if self._pause_overlay.isVisible():
            self._pause_overlay.setGeometry(0, 0, self.width(), self.height())
            self._pause_overlay.raise_()

    def _start_pause_between_blocks(self, pause_s: int) -> None:
        self._in_pause = True
        self._pause_remaining_s = pause_s
        self._next_btn.setEnabled(False)
        self._pause_overlay.setGeometry(0, 0, self.width(), self.height())
        self._pause_overlay.setVisible(True)
        self._pause_overlay.raise_()
        self._update_pause_display()
        if self._pause_timer is None:
            self._pause_timer = QTimer(self)
            self._pause_timer.timeout.connect(self._on_pause_tick)
        self._pause_timer.start(1000)

    def _on_pause_tick(self) -> None:
        self._pause_remaining_s -= 1
        if self._pause_remaining_s >= 0:
            self._update_pause_display()
        if self._pause_remaining_s <= 0:
            self._pause_timer.stop()
            self._on_pause_skip()

    def _on_pause_skip(self) -> None:
        if self._pause_timer:
            self._pause_timer.stop()
        self._in_pause = False
        self._pause_overlay.setVisible(False)
        self._do_block_transition()

    def _update_pause_display(self) -> None:
        m = self._pause_remaining_s // 60
        s = self._pause_remaining_s % 60
        self._pause_label.setText(f"Pause\n{m:02d}:{s:02d}")

    def _do_block_transition(self) -> None:
        self._block_history.append(self._block_index)
        self._block_index += 1
        self._refresh()

    def _on_end_session(self) -> None:
        if self._session and self._session.blocks and self._cb_end_session:
            self._cb_end_session(self._session, dict(self._block_statuses))
        self.set_session(None)

    def _on_pan_context_menu(self, hold_id: str | None, row: int, col: int) -> None:
        from PySide6.QtGui import QCursor
        from PySide6.QtWidgets import QMenu as QMenuWidget
        if not hold_id:
            return
        menu = QMenuWidget(self)
        if self._session and self._session.blocks:
            block = self._session.blocks[self._block_index]
            current_hold_ids = {h.id for h in block.holds}
            if hold_id in current_hold_ids:
                act_remove = menu.addAction("Retirer cette prise du bloc")
                act_fav = menu.addAction("☆ Ajouter le bloc aux favoris")
                act_export = menu.addAction("Exporter la séance…")
                act_end = menu.addAction("Fin de séance")
                action = menu.exec(QCursor.pos())
                if action == act_remove:
                    self._remove_hold_from_block(hold_id)
                elif action == act_fav:
                    self._on_add_favorite()
                elif action == act_export:
                    self._on_export_clicked()
                elif action == act_end:
                    self._on_end_session()
            else:
                hold = next((h for h in self._catalog.holds if h.id == hold_id), None)
                if hold and hold.active:
                    act_add = menu.addAction("Ajouter cette prise au bloc")
                    if menu.exec(QCursor.pos()) == act_add:
                        self._add_hold_to_block(hold)
                else:
                    act_gen = menu.addAction("Générer une séance")
                    if menu.exec(QCursor.pos()) == act_gen and self._on_generate:
                        self._on_generate_clicked()
        else:
            act_gen = menu.addAction("Générer une séance")
            if menu.exec(QCursor.pos()) == act_gen and self._on_generate:
                self._on_generate_clicked()

    def _refresh(self) -> None:
        if not self._session or not self._session.blocks:
            self._generate_panel.setVisible(True)
            self._sidebar.setVisible(False)
            self._toolbar.setVisible(False)
            self._pan.set_highlight(set())
            has_gen = bool(self._on_generate)
            self._generate_btn.setVisible(has_gen)
            self._generate_form.setVisible(has_gen)
            return

        self._generate_panel.setVisible(False)
        self._sidebar.setVisible(True)
        self._toolbar.setVisible(True)

        block = self._session.blocks[self._block_index]
        total = len(self._session.blocks)
        best = get_best_time(block)
        best_str = f" — Meilleur : {best:.0f} s" if best is not None else ""
        self._block_label.setText(f"Bloc {self._block_index + 1} / {total}{best_str}")
        block_order = {h.id: i + 1 for i, h in enumerate(block.holds)}
        self._pan.set_highlight({h.id for h in block.holds}, block_hold_order=block_order)
        self._comment_edit.setEnabled(True)
        self._comment_edit.setText(block.comment or "")
        self._prev_btn.setEnabled(bool(self._block_history))
        self._next_btn.setEnabled(self._block_index < len(self._session.blocks) - 1)
        self._success_btn.setEnabled(True)
        self._fail_btn.setEnabled(True)

        status = self._block_statuses.get(self._block_index)
        if status == "success":
            self._block_label.setStyleSheet("font-weight: bold; margin-left: 12px; color: #2e7d32;")
        elif status == "fail":
            self._block_label.setStyleSheet("font-weight: bold; margin-left: 12px; color: #c62828;")
        else:
            self._block_label.setStyleSheet("font-weight: bold; margin-left: 12px;")

        self._sequence_panel_label.setText(f"Bloc {self._block_index + 1} / {total}")
        if best is not None:
            self._sequence_panel_label.setText(
                self._sequence_panel_label.text() + f" — Meilleur : {best:.0f} s"
            )
        parts = []
        for i, h in enumerate(block.holds):
            color = LEVEL_COLORS_SATURATED.get(h.level, "#4ade80")
            tag = "b" if i == 0 else "span"
            parts.append(f'<{tag} style="color: {color};">{i+1}. {h.id}</{tag}>')
        text = " → ".join(parts)
        if getattr(block, "foot_positions", None) and self._catalog.foot_grid:
            foot_specs = []
            for r, c in block.foot_positions:
                if r < len(self._catalog.foot_grid) and c < len(self._catalog.foot_grid[r]):
                    spec = self._catalog.foot_grid[r][c] or ""
                    if spec:
                        foot_specs.append(spec)
            if foot_specs:
                text += f"\n\nPieds : {', '.join(foot_specs)}"
        self._sequence_items_label.setText(text)
        self._sequence_items_label.setTextFormat(Qt.TextFormat.RichText)
