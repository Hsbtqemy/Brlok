# -*- coding: utf-8 -*-
"""Onglet Configuration : construire sa séance (template, difficulté, enchaînement des blocs)."""
from __future__ import annotations

from typing import Callable

from PySide6.QtCore import Qt
from pathlib import Path

from PySide6.QtWidgets import (
    QCheckBox,
    QComboBox,
    QFileDialog,
    QFormLayout,
    QFrame,
    QGroupBox,
    QHBoxLayout,
    QInputDialog,
    QLabel,
    QLineEdit,
    QMenu,
    QMessageBox,
    QPushButton,
    QSpinBox,
    QVBoxLayout,
    QWidget,
)

from brlok.storage.templates_store import export_templates_to_file, merge_templates_from_file


class ConfigWidget(QWidget):
    """Panneau de configuration avancée : template/séquence et difficulté."""

    def __init__(
        self,
        parent: QWidget | None = None,
        *,
        catalog=None,
        on_generate: Callable[..., object | None] | None = None,
        on_templates_changed: Callable[[], None] | None = None,
    ) -> None:
        super().__init__(parent)
        self._catalog = catalog
        self._on_generate = on_generate
        self._on_templates_changed = on_templates_changed
        self._build_ui()

    def set_catalog(self, catalog) -> None:
        """Met à jour le catalogue (appelé lors du changement de catalogue actif)."""
        self._catalog = catalog

    def _build_ui(self) -> None:
        layout = QVBoxLayout(self)

        # Section 1 : Template / Séquence
        seq_group = QGroupBox("Template / Séquence")
        seq_layout = QFormLayout(seq_group)
        self._template_combo = QComboBox()
        self._template_combo.setMinimumWidth(180)
        self._refresh_templates()
        self._template_combo.currentIndexChanged.connect(self._on_template_changed)
        self._template_combo.currentIndexChanged.connect(self._update_save_buttons_state)
        template_row = QHBoxLayout()
        template_row.addWidget(self._template_combo)
        self._save_to_template_btn = QPushButton("Mettre à jour")
        self._save_to_template_btn.setToolTip("Mettre à jour le template sélectionné avec la configuration actuelle")
        self._save_to_template_btn.clicked.connect(self._on_save_to_template)
        template_row.addWidget(self._save_to_template_btn)
        self._save_template_btn = QPushButton("Enregistrer comme…")
        self._save_template_btn.setToolTip("Sauvegarder la configuration actuelle comme nouveau template")
        self._save_template_btn.clicked.connect(self._on_save_as_template)
        template_row.addWidget(self._save_template_btn)
        import_export_btn = QPushButton("Import / Export templates")
        import_export_menu = QMenu(self)
        import_export_menu.addAction("Importer depuis JSON…").triggered.connect(self._on_import_templates)
        import_export_menu.addAction("Exporter en JSON…").triggered.connect(self._on_export_templates)
        import_export_btn.setMenu(import_export_menu)
        template_row.addWidget(import_export_btn)
        seq_layout.addRow("Template :", template_row)
        self._blocks_spin = QSpinBox()
        self._blocks_spin.setRange(1, 20)
        self._blocks_spin.setValue(5)
        seq_layout.addRow("Nombre de blocs :", self._blocks_spin)
        self._holds_spin = QSpinBox()
        self._holds_spin.setRange(1, 20)
        self._holds_spin.setValue(10)
        seq_layout.addRow("Prises par bloc :", self._holds_spin)
        self._work_spin = QSpinBox()
        self._work_spin.setRange(5, 300)
        self._work_spin.setValue(40)
        self._work_spin.setSuffix(" s")
        seq_layout.addRow("Travail :", self._work_spin)
        self._rest_spin = QSpinBox()
        self._rest_spin.setRange(5, 120)
        self._rest_spin.setValue(20)
        self._rest_spin.setSuffix(" s")
        seq_layout.addRow("Repos :", self._rest_spin)
        self._rounds_spin = QSpinBox()
        self._rounds_spin.setRange(1, 20)
        self._rounds_spin.setValue(3)
        seq_layout.addRow("Rounds :", self._rounds_spin)
        self._distribution_combo = QComboBox()
        self._distribution_combo.setMinimumWidth(220)
        from brlok.config.difficulty import DISTRIBUTION_PATTERNS
        for pattern_id, label in DISTRIBUTION_PATTERNS:
            self._distribution_combo.addItem(label, pattern_id)
        seq_layout.addRow("Répartition prises :", self._distribution_combo)
        layout.addWidget(seq_group)

        # Section 2 : Difficulté
        diff_group = QGroupBox("Difficulté")
        diff_layout = QFormLayout(diff_group)
        self._difficulty_combo = QComboBox()
        self._difficulty_combo.setMinimumWidth(150)
        from brlok.config.difficulty import DIFFICULTY_PROFILES
        for name, _, _ in DIFFICULTY_PROFILES:
            self._difficulty_combo.addItem(name)
        self._difficulty_combo.setCurrentText("Modéré")
        diff_layout.addRow("Niveau global :", self._difficulty_combo)
        self._tolerance_spin = QSpinBox()
        self._tolerance_spin.setRange(0, 2)
        self._tolerance_spin.setValue(1)
        self._tolerance_spin.setToolTip("0 = strict, 1 = ±1, 2 = ±2 autour du niveau")
        diff_layout.addRow("Tolérance :", self._tolerance_spin)
        self._variety_check = QCheckBox("Variété (éviter répétitions)")
        self._variety_check.setChecked(False)
        diff_layout.addRow("", self._variety_check)
        self._required_tags_edit = QLineEdit()
        self._required_tags_edit.setPlaceholderText("crimp, sloper (vide = aucun)")
        self._required_tags_edit.setToolTip("Tags à inclure : ne garder que les prises ayant au moins un de ces tags")
        diff_layout.addRow("Tags à inclure :", self._required_tags_edit)
        self._excluded_tags_edit = QLineEdit()
        self._excluded_tags_edit.setPlaceholderText("pocket (vide = aucun)")
        self._excluded_tags_edit.setToolTip("Tags exclus : les prises avec ces tags sont filtrées")
        diff_layout.addRow("Tags exclus :", self._excluded_tags_edit)
        layout.addWidget(diff_group)

        # Section 3 : Chrono
        chrono_group = QGroupBox("Chrono")
        chrono_layout = QFormLayout(chrono_group)
        self._chrono_mode_combo = QComboBox()
        self._chrono_mode_combo.addItem("Compte à rebours", "countdown")
        self._chrono_mode_combo.addItem("Minuteur (compte à l'endroit)", "countup")
        self._chrono_mode_combo.addItem("Sans timer", "none")
        self._chrono_mode_combo.currentIndexChanged.connect(self._on_chrono_mode_changed)
        self._restore_chrono_mode()
        chrono_layout.addRow("Mode :", self._chrono_mode_combo)
        layout.addWidget(chrono_group)

        self._generate_btn = QPushButton("Générer et lancer")
        self._generate_btn.setStyleSheet("padding: 10px; font-size: 12pt;")
        self._generate_btn.clicked.connect(self._on_generate_clicked)
        layout.addWidget(self._generate_btn)

        layout.addStretch()
        self._update_save_buttons_state()

    def _on_generate_clicked(self) -> None:
        if not self._on_generate:
            return
        from brlok.config.difficulty import get_difficulty_params
        name = self._difficulty_combo.currentText()
        target_level, _ = get_difficulty_params(name)
        def _parse_tags(s: str) -> list[str]:
            return [t.strip() for t in s.split(",") if t.strip()]

        self._on_generate(
            target_level=target_level,
            level_tolerance=self._tolerance_spin.value(),
            blocks_count=self._blocks_spin.value(),
            holds_per_block=self._holds_spin.value(),
            template_id=self._template_combo.currentData(),
            variety=self._variety_check.isChecked(),
            distribution_pattern=self._distribution_combo.currentData() or "uniforme",
            work_s=self._work_spin.value(),
            rest_s=self._rest_spin.value(),
            rounds=self._rounds_spin.value(),
            required_tags=_parse_tags(self._required_tags_edit.text()),
            excluded_tags=_parse_tags(self._excluded_tags_edit.text()),
            chrono_mode=self._chrono_mode_combo.currentData() or "countdown",
        )

    def _refresh_templates(self) -> None:
        from brlok.storage.templates_store import load_templates
        self._template_combo.clear()
        self._template_combo.addItem("(aucun)", None)
        for t in load_templates():
            self._template_combo.addItem(t.name, t.id)

    def _restore_chrono_mode(self) -> None:
        """Restaure le dernier mode chrono depuis les préférences."""
        from PySide6.QtCore import QSettings
        saved = QSettings("brlok", "brlok").value("chrono_mode", "countdown")
        idx = self._chrono_mode_combo.findData(saved)
        if idx >= 0:
            self._chrono_mode_combo.blockSignals(True)
            self._chrono_mode_combo.setCurrentIndex(idx)
            self._chrono_mode_combo.blockSignals(False)

    def _on_chrono_mode_changed(self) -> None:
        """Persiste le mode chrono dans les préférences."""
        from PySide6.QtCore import QSettings
        val = self._chrono_mode_combo.currentData()
        if val:
            QSettings("brlok", "brlok").setValue("chrono_mode", val)

    def _get_import_export_dir(self) -> str:
        from PySide6.QtCore import QStandardPaths
        docs = QStandardPaths.writableLocation(QStandardPaths.StandardLocation.DocumentsLocation)
        return docs if docs else str(Path.home())

    def _on_import_templates(self) -> None:
        path, _ = QFileDialog.getOpenFileName(
            self.window(),
            "Importer des templates",
            self._get_import_export_dir(),
            "Fichiers JSON (*.json);;Tous les fichiers (*)",
        )
        if not path:
            return
        try:
            added = merge_templates_from_file(Path(path))
            self._refresh_templates()
            if self._on_templates_changed:
                self._on_templates_changed()
            QMessageBox.information(
                self,
                "Import templates",
                f"{added} template(s) importé(s) et fusionnés." if added else "Aucun nouveau template (doublons de nom exclus).",
            )
        except Exception as e:
            QMessageBox.critical(self, "Erreur d'import", str(e))

    def _on_export_templates(self) -> None:
        path, _ = QFileDialog.getSaveFileName(
            self.window(),
            "Exporter les templates",
            self._get_import_export_dir(),
            "Fichiers JSON (*.json);;Tous les fichiers (*)",
        )
        if not path:
            return
        if not path.lower().endswith(".json"):
            path = path + ".json"
        try:
            export_templates_to_file(Path(path))
            QMessageBox.information(self, "Export", f"Templates exportés dans {path}")
        except Exception as e:
            QMessageBox.critical(self, "Erreur d'export", str(e))

    def _update_save_buttons_state(self) -> None:
        """Active/désactive le bouton Mettre à jour selon qu'un template est sélectionné."""
        has_template = self._template_combo.currentData() is not None
        self._save_to_template_btn.setEnabled(has_template)

    def _on_template_changed(self) -> None:
        tid = self._template_combo.currentData()
        self._update_save_buttons_state()
        if not tid:
            return
        from brlok.config.difficulty import get_difficulty_display_name
        from brlok.storage.templates_store import get_template
        t = get_template(tid)
        if t:
            self._blocks_spin.setValue(t.blocks_count)
            self._holds_spin.setValue(t.holds_per_block)
            if t.blocks_config:
                cfg = t.blocks_config[0]
                self._work_spin.setValue(cfg.work_s)
                self._rest_spin.setValue(cfg.rest_s)
                self._rounds_spin.setValue(cfg.rounds)
                difficulty_display = get_difficulty_display_name(cfg.level)
                idx = self._difficulty_combo.findText(difficulty_display)
                if idx >= 0:
                    self._difficulty_combo.setCurrentIndex(idx)
            dist_id = getattr(t, "distribution_pattern", "uniforme")
            dist_idx = self._distribution_combo.findData(dist_id)
            if dist_idx >= 0:
                self._distribution_combo.setCurrentIndex(dist_idx)

    def _on_save_as_template(self) -> None:
        """Enregistre la configuration actuelle comme nouveau template."""
        from brlok.config.difficulty import get_difficulty_display_name, get_distribution_short_label
        from brlok.models.session_template import BlockConfig
        from brlok.storage.templates_store import add_template

        difficulty_name = self._difficulty_combo.currentText()
        distribution_id = self._distribution_combo.currentData() or "uniforme"
        distribution_short = get_distribution_short_label(distribution_id)
        work_s = self._work_spin.value()
        rest_s = self._rest_spin.value()
        rounds = self._rounds_spin.value()
        timing_spec = f"[{work_s}/{rest_s}x{rounds}]"
        suggested_name = f"{difficulty_name} - {distribution_short} {timing_spec}"

        name, ok = QInputDialog.getText(
            self,
            "Nouveau template",
            "Nom du template :",
            QLineEdit.EchoMode.Normal,
            suggested_name,
        )
        if not ok or not name.strip():
            return
        name = name.strip()
        blocks_count = self._blocks_spin.value()
        holds_per_block = self._holds_spin.value()
        level_str = difficulty_name.strip().lower()
        blocks_config = [
            BlockConfig(level=level_str, work_s=work_s, rest_s=rest_s, rounds=rounds)
            for _ in range(blocks_count)
        ]
        t = add_template(
            name,
            blocks_config=blocks_config,
            blocks_count=blocks_count,
            holds_per_block=holds_per_block,
            distribution_pattern=distribution_id,
        )
        self._refresh_templates()
        idx = self._template_combo.findData(t.id)
        if idx >= 0:
            self._template_combo.blockSignals(True)
            self._template_combo.setCurrentIndex(idx)
            self._template_combo.blockSignals(False)
        if self._on_templates_changed:
            self._on_templates_changed()

    def _on_save_to_template(self) -> None:
        """Enregistre la configuration actuelle dans le template sélectionné."""
        tid = self._template_combo.currentData()
        if not tid:
            return
        from brlok.models.session_template import BlockConfig
        from brlok.storage.templates_store import get_template, update_template

        t = get_template(tid)
        if not t:
            return
        blocks_count = self._blocks_spin.value()
        holds_per_block = self._holds_spin.value()
        work_s = self._work_spin.value()
        rest_s = self._rest_spin.value()
        rounds = self._rounds_spin.value()
        level_str = self._difficulty_combo.currentText().strip().lower()
        distribution_id = self._distribution_combo.currentData() or "uniforme"
        blocks_config = [
            BlockConfig(level=level_str, work_s=work_s, rest_s=rest_s, rounds=rounds)
            for _ in range(blocks_count)
        ]
        if update_template(
            tid,
            blocks_config=blocks_config,
            blocks_count=blocks_count,
            holds_per_block=holds_per_block,
            distribution_pattern=distribution_id,
        ):
            self._refresh_templates()
            idx = self._template_combo.findData(tid)
            if idx >= 0:
                self._template_combo.blockSignals(True)
                self._template_combo.setCurrentIndex(idx)
                self._template_combo.blockSignals(False)
            if self._on_templates_changed:
                self._on_templates_changed()
