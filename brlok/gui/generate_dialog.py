# -*- coding: utf-8 -*-
"""Formulaire et dialogue de génération de séance (7.5, 8.1)."""
from __future__ import annotations

from PySide6.QtWidgets import (
    QComboBox,
    QDialog,
    QDialogButtonBox,
    QFormLayout,
    QFrame,
    QSpinBox,
    QVBoxLayout,
    QWidget,
)


class GenerateSessionForm(QFrame):
    """Formulaire pour paramétrer la génération d'une séance (intégrable dans la fenêtre)."""

    def __init__(
        self,
        parent: QWidget | None = None,
        *,
        default_level: int = 2,
        default_blocks: int = 5,
        default_enchainements: int = 10,
    ) -> None:
        super().__init__(parent)
        layout = QFormLayout(self)

        self._template_combo = QComboBox()
        self._template_combo.setMinimumWidth(200)
        self._refresh_templates()
        self._template_combo.currentIndexChanged.connect(self._on_template_changed)
        layout.addRow("Template :", self._template_combo)

        self._difficulty_combo = QComboBox()
        self._difficulty_combo.setMinimumWidth(150)
        from brlok.config.difficulty import DIFFICULTY_PROFILES
        for name, _, _ in DIFFICULTY_PROFILES:
            self._difficulty_combo.addItem(name)
        modere_idx = next(
            (i for i, (n, _, _) in enumerate(DIFFICULTY_PROFILES) if n == "Modéré"),
            2,
        )
        self._difficulty_combo.setCurrentIndex(modere_idx)
        self._difficulty_combo.setToolTip("Niveau général : plage des prises éligibles")
        layout.addRow("Difficulté :", self._difficulty_combo)

        self._blocks_spin = QSpinBox()
        self._blocks_spin.setRange(1, 20)
        self._blocks_spin.setValue(default_blocks)
        self._blocks_spin.setToolTip("Nombre de blocs à générer")
        layout.addRow("Nombre de blocs :", self._blocks_spin)

        self._enchainements_spin = QSpinBox()
        self._enchainements_spin.setRange(1, 20)
        self._enchainements_spin.setValue(default_enchainements)
        self._enchainements_spin.setToolTip("Nombre de prises par bloc")
        layout.addRow("Enchainements (prises/bloc) :", self._enchainements_spin)

    @property
    def target_level(self) -> int:
        from brlok.config.difficulty import get_difficulty_params
        name = self._difficulty_combo.currentText()
        return get_difficulty_params(name)[0]

    @property
    def level_tolerance(self) -> int:
        from brlok.config.difficulty import get_difficulty_params
        name = self._difficulty_combo.currentText()
        return get_difficulty_params(name)[1]

    @property
    def blocks_count(self) -> int:
        return self._blocks_spin.value()

    @property
    def enchainements(self) -> int:
        return self._enchainements_spin.value()

    @property
    def selected_template_id(self) -> str | None:
        """ID du template sélectionné ou None."""
        return self._template_combo.currentData()

    def refresh_templates(self) -> None:
        """Recharge la liste des templates (appelé quand modifiée dans Configuration)."""
        self._refresh_templates()

    def _refresh_templates(self) -> None:
        """Charge les templates dans le combo."""
        from brlok.storage.templates_store import load_templates
        self._template_combo.clear()
        self._template_combo.addItem("(aucun)", None)
        for t in load_templates():
            self._template_combo.addItem(t.name, t.id)

    def _on_template_changed(self) -> None:
        """Applique le template sélectionné aux champs, ou réinitialise aux valeurs par défaut."""
        tid = self._template_combo.currentData()
        if not tid:
            self._blocks_spin.setValue(5)
            self._enchainements_spin.setValue(10)
            return
        from brlok.storage.templates_store import get_template
        t = get_template(tid)
        if t:
            self._blocks_spin.setValue(t.blocks_count)
            self._enchainements_spin.setValue(t.holds_per_block)


class GenerateSessionDialog(QDialog):
    """Dialogue pour paramétrer la génération d'une séance (popup)."""

    def __init__(
        self,
        parent: QWidget | None = None,
        *,
        default_level: int = 2,
        default_blocks: int = 5,
        default_enchainements: int = 10,
    ) -> None:
        super().__init__(parent)
        self.setWindowTitle("Générer une séance")
        layout = QVBoxLayout(self)
        self._form = GenerateSessionForm(
            self,
            default_level=default_level,
            default_blocks=default_blocks,
            default_enchainements=default_enchainements,
        )
        layout.addWidget(self._form)
        buttons = QDialogButtonBox(
            QDialogButtonBox.StandardButton.Ok | QDialogButtonBox.StandardButton.Cancel
        )
        buttons.accepted.connect(self.accept)
        buttons.rejected.connect(self.reject)
        layout.addWidget(buttons)

    @property
    def target_level(self) -> int:
        return self._form.target_level

    @property
    def blocks_count(self) -> int:
        return self._form.blocks_count

    @property
    def enchainements(self) -> int:
        return self._form.enchainements

    @property
    def selected_template_id(self) -> str | None:
        return self._form.selected_template_id

    @property
    def level_tolerance(self) -> int:
        return self._form.level_tolerance
